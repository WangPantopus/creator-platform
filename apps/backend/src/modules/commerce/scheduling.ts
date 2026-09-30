import type {
  SchedulingAuthority,
  CallAuthorization,
} from "../session/service.js";
import type { PoolClient } from "pg";
import type { ThreadScope } from "../access/scope.js";
import { assertThreadScope } from "../access/scope.js";
import { invariant } from "../../core/errors.js";
import { consumeSignedAct } from "../identity/signed-acts.js";
import { SignedActCommandSchema } from "@qelvora/api";
import type { z } from "zod";
import type { OfferTimesSchema } from "../../../../../packages/api/src/session.js";

export function callOfferCommand(
  threadId: string,
  command: Pick<
    z.infer<typeof OfferTimesSchema>,
    | "commitmentId"
    | "expectedAuthorizationVersion"
    | "startsAt"
    | "creatorTimeZone"
    | "fanTimeZone"
    | "expiresAt"
  >,
) {
  return SignedActCommandSchema.parse({
    actType: "accept",
    subjectId: threadId,
    content: {
      kind: "commerce_call_offer",
      commitmentId: command.commitmentId,
      authorizationVersion: command.expectedAuthorizationVersion,
      startsAt: command.startsAt,
      creatorTimeZone: command.creatorTimeZone,
      fanTimeZone: command.fanTimeZone,
      expiresAt: command.expiresAt,
    },
  });
}
/** W6 owns times and room mechanics. This adapter reads W4's captured personal obligation. */
export class CommerceScheduling implements SchedulingAuthority {
  constructor(private readonly graceSeconds: number) {
    invariant(
      Number.isSafeInteger(graceSeconds) && graceSeconds > 0,
      "call_policy_unconfigured",
      "The appointment grace policy must be configured.",
    );
  }
  async current(
    scope: ThreadScope,
    id: string,
    client: PoolClient,
  ): Promise<CallAuthorization | null> {
    assertThreadScope(scope);
    const row = (
      await client.query(
        "SELECT c.id,c.mode,c.state,c.due_at,p.version,p.payment_state,p.snapshot,p.disclosure,cp.display_name,cp.account_id AS creator_account,fp.account_id AS fan_account FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id JOIN creator.creator_profile cp ON cp.id=c.creator_id JOIN creator.fan_profile fp ON fp.id=c.fan_id WHERE c.id=$1 AND c.creator_id=$2 AND c.fan_id=$3 AND cp.verification='verified' AND NOT cp.recovery_required",
        [id, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    if (
      !row ||
      !["due", "in_progress"].includes(row.state) ||
      row.payment_state !== "captured" ||
      !["audio_call", "video_call"].includes(row.mode) ||
      !row.snapshot.durationSeconds ||
      row.due_at <= new Date()
    )
      return null;
    return {
      commitmentId: row.id,
      creatorAccountId: row.creator_account,
      fanAccountId: row.fan_account,
      creatorName: row.display_name,
      mediaMode: row.mode === "audio_call" ? "audio" : "video",
      durationSeconds: row.snapshot.durationSeconds,
      graceSeconds: this.graceSeconds,
      authorizationVersion: row.version,
      packet: {
        summary: row.disclosure.summary ?? "",
        attachmentIds: (row.disclosure.attachments ?? []).map(
          (a: { id: string }) => a.id,
        ),
      },
    };
  }
  async acceptOffer(
    scope: ThreadScope,
    command: z.infer<typeof OfferTimesSchema>,
    client: PoolClient,
  ) {
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator may sign offered appointment times.",
    );
    const current = await this.current(scope, command.commitmentId, client);
    invariant(
      current &&
        current.authorizationVersion === command.expectedAuthorizationVersion,
      "offer_stale",
      "Refresh the captured commitment before offering times.",
    );
    const due = (
      await client.query<{ due_at: Date }>(
        "SELECT due_at FROM creator.commerce_commitment WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
        [command.commitmentId, scope.creatorId, scope.fanId],
      )
    ).rows[0]!;
    invariant(
      command.startsAt.every(
        (at) =>
          Date.parse(at) + (current.durationSeconds + 180) * 1000 <=
          due.due_at.getTime(),
      ),
      "call_after_deadline",
      "Offer appointments that finish within the promised delivery window.",
    );
    await consumeSignedAct(
      client,
      scope,
      command.signedActId,
      callOfferCommand(scope.threadId, command),
    );
    return current;
  }
  async assignSlot(
    scope: ThreadScope,
    id: string,
    at: string,
    client: PoolClient,
  ) {
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan may select an appointment.",
    );
    const current = await this.current(scope, id, client);
    invariant(
      current,
      "call_authorization_revoked",
      "The call commitment is no longer available.",
    );
    const selected = await client.query(
      "UPDATE creator.commerce_commitment SET state='in_progress',evidence=jsonb_build_object('scheduledAt',$4::text),version=version+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state='due' AND due_at>=$4::timestamptz+($5*interval '1 second') RETURNING id",
      [id, scope.creatorId, scope.fanId, at, current.durationSeconds + 180],
    );
    invariant(
      selected.rowCount === 1,
      "appointment_unavailable",
      "The appointment changed or has already been selected.",
    );
  }
  async cancel(scope: ThreadScope, id: string, client: PoolClient) {
    assertThreadScope(scope);
    const row = (
      await client.query(
        "UPDATE creator.commerce_commitment SET state='resolution_required',outcome='appointment_cancelled',version=version+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('due','in_progress') RETURNING packet_id,version",
        [id, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    invariant(
      row,
      "commitment_unavailable",
      "The appointment has already ended.",
    );
    // Cancellation economics are unresolved. Never call a cancelled appointment delivered.
    await client.query(
      "INSERT INTO creator.commerce_event(creator_id,fan_id,aggregate_id,aggregate_version,type,payload) VALUES($1,$2,$3,$4,'commitment_resolution',$5) ON CONFLICT DO NOTHING",
      [
        scope.creatorId,
        scope.fanId,
        id,
        row.version,
        JSON.stringify({
          packetId: row.packet_id,
          reason: "appointment_cancelled",
        }),
      ],
    );
  }
}
