import { z } from "zod";
import { SignedActCommandSchema } from "@qelvora/api";
import type { FeatureRegistration } from "../../app.js";
import type { SignedSubjectPolicy } from "../identity/subjects.js";
import { DomainError, invariant } from "../../core/errors.js";
import { createCommerceRouter } from "./router.js";
import type { CommerceService } from "./service.js";
import type { ExtendedCommerce } from "./extended.js";
import { callOfferCommand } from "./scheduling.js";
import { tryLockCommitmentPacketForRead } from "./packet-locks.js";

/** W1 consumes this registration through registerFeatures; identity remains canonical. */
export function commerceFeature(
  service: CommerceService,
  extended?: ExtendedCommerce,
): FeatureRegistration {
  return {
    name: "commerce",
    path: "/v1/commerce",
    router: ({ actorFor }) =>
      createCommerceRouter({
        service,
        actorFor,
        ...(extended ? { extended } : {}),
      }),
  };
}

/** Canonical signing consequences are read again before W1 creates a challenge. */
export const commerceSignedSubjects: SignedSubjectPolicy = {
  name: "commerce",
  async prepare(client, actor, creatorId, requested) {
    if (requested.actType !== "accept") return null;
    const call = z
      .object({
        kind: z.literal("commerce_call_offer"),
        commitmentId: z.uuid(),
        authorizationVersion: z.number().int().positive(),
        startsAt: z
          .array(z.iso.datetime({ offset: true }))
          .min(1)
          .max(3),
        creatorTimeZone: z.string(),
        fanTimeZone: z.string(),
        expiresAt: z.iso.datetime({ offset: true }),
      })
      .safeParse(requested.content);
    if (call.success) {
      await tryLockCommitmentPacketForRead(client, call.data.commitmentId);
      let row;
      try {
        row = (
          await client.query(
            "SELECT c.*,p.thread_id,p.version AS authorization_version,p.payment_state FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id AND p.creator_id=c.creator_id AND p.fan_id=c.fan_id JOIN creator.creator_profile cp ON cp.id=c.creator_id WHERE c.id=$1 AND c.creator_id=$2 AND cp.account_id=$3 AND cp.verification='verified' AND NOT cp.recovery_required FOR SHARE OF c NOWAIT",
            [call.data.commitmentId, creatorId, actor.accountId],
          )
        ).rows[0];
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "55P03"
        )
          throw new DomainError(
            "call_preparation_busy",
            "This call is changing. Refresh before signing times.",
            503,
          );
        throw error;
      }
      invariant(
        row &&
          ["due", "in_progress"].includes(row.state) &&
          ["audio_call", "video_call"].includes(row.mode) &&
          row.payment_state === "captured" &&
          row.authorization_version === call.data.authorizationVersion &&
          row.due_at > new Date(),
        "call_unavailable",
        "Refresh the current captured call before signing times.",
      );
      return callOfferCommand(row.thread_id, {
        commitmentId: call.data.commitmentId,
        expectedAuthorizationVersion: call.data.authorizationVersion,
        startsAt: call.data.startsAt,
        creatorTimeZone: call.data.creatorTimeZone,
        fanTimeZone: call.data.fanTimeZone,
        expiresAt: call.data.expiresAt,
      });
    }
    const input = z
      .object({
        packetId: z.uuid(),
        action: z.enum([
          "approve_draft",
          "reply_myself",
          "voice_note",
          "offer_times",
          "group_offer",
        ]),
      })
      .safeParse(requested.content);
    if (!input.success) return null;
    const packet = (
      await client.query(
        "SELECT p.* FROM creator.commerce_packet p JOIN creator.creator_profile cp ON cp.id=p.creator_id WHERE p.id=$1 AND p.creator_id=$2 AND cp.account_id=$3 AND cp.verification='verified' AND NOT cp.recovery_required FOR SHARE OF p,cp",
        [input.data.packetId, creatorId, actor.accountId],
      )
    ).rows[0];
    invariant(
      packet &&
        ["submitted", "more_info", "offer_pending"].includes(packet.state) &&
        packet.payment_state === "requires_capture" &&
        packet.decision_at > new Date() &&
        packet.hold_expires_at.getTime() - 6 * 3600000 > Date.now(),
      "acceptance_unavailable",
      "Refresh the request before signing its current acceptance.",
    );
    const content: Record<string, unknown> = {
      packetId: packet.id,
      packetVersion: packet.version,
      snapshot: packet.snapshot,
      action: input.data.action,
    };
    if (input.data.action === "group_offer") {
      const proposed = z
        .object({ proposedMode: z.object({ id: z.uuid() }) })
        .parse(requested.content);
      const mode = (
        await client.query(
          "SELECT id,kind,amount,currency,version FROM creator.commerce_mode WHERE id=$1 AND creator_id=$2 AND kind='group_answer' AND state='offered' FOR SHARE",
          [proposed.proposedMode.id, creatorId],
        )
      ).rows[0];
      invariant(
        mode &&
          mode.currency === packet.snapshot.currency &&
          BigInt(mode.amount) < BigInt(packet.snapshot.amount),
        "group_offer_unavailable",
        "Choose the current lower-price group offer.",
      );
      content.proposedMode = mode;
    } else {
      const actions: Record<string, readonly string[]> = {
        written_reply: ["reply_myself", "approve_draft"],
        voice_note: ["voice_note"],
        audio_call: ["offer_times"],
        video_call: ["offer_times"],
        group_answer: ["reply_myself"],
        guaranteed_review: ["reply_myself"],
      };
      invariant(
        actions[packet.snapshot.mode]?.includes(input.data.action),
        "mode_mismatch",
        "That action does not fulfill the promised mode.",
      );
    }
    return SignedActCommandSchema.parse({
      actType: "accept",
      subjectId: packet.thread_id,
      content,
    });
  },
};
