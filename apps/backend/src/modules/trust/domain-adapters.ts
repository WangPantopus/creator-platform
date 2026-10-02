import type { Pool } from "pg";
import type { AccessService } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import type { IdentityProfiles } from "../identity/profiles.js";
import type { CommerceService } from "../commerce/service.js";
import type { AgentLifecycle } from "../agent/lifecycle.js";
import type { TrustDependencies } from "./service.js";
import type { EffectHook, Evidence } from "./contracts.js";
import { DomainError } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";

/** Consume owner APIs; snapshot only the exact object voluntarily reported. */
export function scopedTrustEvidence(options: {
  pool: Pool;
  access: AccessService;
  database: Database;
  identity: IdentityProfiles;
  commerce?: CommerceService;
  assertAllowed: (
    accountId: string,
    creatorId: string,
    threadId?: string,
  ) => Promise<void>;
}): NonNullable<TrustDependencies["evidence"]> {
  return async (actor, input) => {
    if (!input.creatorId && !input.requestId) return { items: [] };
    if (input.kind === "verification" && input.creatorId) {
      await options.assertAllowed(actor.accountId, input.creatorId);
      const proof = await options.identity.proof(actor, input.creatorId);
      return {
        creatorId: input.creatorId,
        subjectAccountId: actor.accountId,
        items: [
          {
            id: String(proof.id),
            proof_id: String(proof.id),
            category: "external_authorization_proof",
            text: `${proof.platform} account: ${proof.accountUrl}\nProof post: ${proof.postUrl ?? "Not submitted"}\nExpected proof code: ${proof.code}\nState: ${proof.state}`,
          },
        ],
      };
    }
    if (input.requestId) {
      if (!options.commerce)
        throw new DomainError(
          "commerce_unavailable",
          "Request evidence is not connected.",
          503,
        );
      const result = await options.commerce.packet(actor, input.requestId);
      const packet = result.packet;
      if (input.creatorId && packet.creator_id !== input.creatorId)
        throw new DomainError(
          "request_unavailable",
          "This request is unavailable.",
          404,
        );
      await options.assertAllowed(
        actor.accountId,
        packet.creator_id,
        packet.thread_id,
      );
      const identity = (
        await options.pool.query(
          "SELECT account_id,display_name FROM creator.creator_profile WHERE id=$1",
          [packet.creator_id],
        )
      ).rows[0];
      const snapshot = packet.snapshot as {
        mode?: string;
        title?: string;
        amount?: number;
        currency?: string;
      };
      const items: Evidence[] = [
        {
          id: packet.id,
          thread_id: packet.thread_id,
          category: "reported_request_snapshot",
          text: JSON.stringify({
            requestState: packet.state,
            paymentState: packet.payment_state,
            modeSold: snapshot.mode,
            sharedPacket: packet.disclosure,
          }),
          ...(snapshot.mode ? { mode: snapshot.mode } : {}),
          ...(snapshot.title ? { mode_title: snapshot.title } : {}),
          ...(typeof snapshot.amount === "number"
            ? { amount_minor: snapshot.amount }
            : {}),
          ...(snapshot.currency ? { currency: snapshot.currency } : {}),
          created_at: new Date(packet.created_at).toISOString(),
        },
      ];
      // The owning commerce API supplies the canonical commitment projection;
      // do not turn capture or acceptance into delivery/authorship proof.
      if (result.commitment)
        items.push({
          id: String(result.commitment.id),
          category: "commitment_state",
          text: JSON.stringify({
            state: result.commitment.state,
            deliveryState: result.commitment.delivery_state ?? null,
          }),
        });
      const delivery = result.commitment?.evidence;
      if (
        result.commitment?.state === "delivered" &&
        typeof delivery?.messageId === "string" &&
        typeof delivery?.signedActId === "string"
      ) {
        const scope = await options.access.openThread(
          actor,
          packet.creator_id,
          packet.fan_id,
          false,
        );
        const message = await options.database.withThread(
          scope,
          async (client) =>
            (
              await client.query(
                `SELECT m.id,m.thread_id,m.author_kind,m.text,m.created_at,m.signed_act_id,a.verified_at AS signed_at
            FROM creator.message m JOIN creator.signed_act a ON a.id=m.signed_act_id
            WHERE m.id=$1 AND m.signed_act_id=$2 AND m.thread_id=$3 AND m.creator_id=$4 AND m.fan_id=$5 AND m.delivery_state='delivered'`,
                [
                  delivery.messageId,
                  delivery.signedActId,
                  scope.threadId,
                  scope.creatorId,
                  scope.fanId,
                ],
              )
            ).rows[0],
        );
        if (message)
          items.push({
            ...message,
            category: "reported_request_delivery",
            creator_name: scope.creatorName,
            created_at: new Date(message.created_at).toISOString(),
            signed_at: new Date(message.signed_at).toISOString(),
          });
      }
      return {
        creatorId: packet.creator_id,
        creatorName: identity?.display_name,
        subjectAccountId: identity?.account_id,
        items,
      };
    }
    const fan = (await options.identity.view(actor)).fan;
    if (!fan || !input.creatorId)
      throw new DomainError(
        "fan_scope_required",
        "Report only your own conversation.",
      );
    const scope = await options.access.openThread(
      actor,
      input.creatorId,
      String(fan.id),
      false,
    );
    if (scope.authority !== "fan")
      throw new DomainError(
        "fan_scope_required",
        "Report only your own conversation.",
      );
    await options.assertAllowed(
      actor.accountId,
      scope.creatorId,
      scope.threadId,
    );
    const items = input.messageId
      ? await options.database.withThread(scope, async (client) => {
          const message = (
            await client.query(
              "SELECT id,author_kind,text,created_at,thread_id,signed_act_id FROM creator.message WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND thread_id=$4",
              [input.messageId, scope.creatorId, scope.fanId, scope.threadId],
            )
          ).rows[0];
          if (
            !message ||
            (input.kind === "ai_report" && message.author_kind !== "ai")
          )
            throw new DomainError(
              "message_unavailable",
              "This message is unavailable.",
              404,
            );
          return [
            {
              ...message,
              created_at: new Date(message.created_at).toISOString(),
              category: "reported_message",
              creator_name: scope.creatorName,
            },
          ] as Evidence[];
        })
      : [];
    return {
      creatorId: scope.creatorId,
      creatorName: scope.creatorName,
      subjectAccountId: scope.creatorAccountId,
      items,
    };
  };
}

/** Worker-only intent authorizer. The durable decision, actor/version and proof
 * snapshot must agree before a peer API receives any privileged instruction. */
async function intent(
  pool: Pool,
  input: Parameters<EffectHook["run"]>[0],
  type: string,
) {
  const row = (
    await pool.query(
      `SELECT c.id,c.creator_id,c.subject_account_id,c.queue,c.outcome,c.version,c.decision_account_id,
    e.decision_version,e.actor_account_id,e.input,(SELECT snapshot->>'proof_id' FROM creator_trust.case_evidence WHERE case_id=c.id AND category='external_authorization_proof' ORDER BY created_at DESC LIMIT 1) AS proof_id
    FROM creator_trust.effect e JOIN creator_trust.safety_case c ON c.id=e.case_id
    WHERE e.id=$1 AND e.type=$2 AND e.state='running' AND e.lease_token=$3 AND e.lease_until>now()
    AND e.case_id=$4 AND e.actor_account_id=$5 AND c.state='action_pending'`,
      [
        input.effectId,
        type,
        input.leaseToken,
        input.caseId,
        input.actorAccountId,
      ],
    )
  ).rows[0];
  if (
    !row ||
    row.version !== row.decision_version ||
    row.decision_account_id !== row.actor_account_id ||
    contentHash(row.input) !==
      contentHash({
        creatorId: input.creatorId,
        requestId: input.requestId,
        reason: input.reason,
        ...(input.amountMinor === undefined
          ? {}
          : { amountMinor: input.amountMinor }),
      })
  )
    throw new DomainError(
      "effect_authority_changed",
      "The recorded case action is no longer current.",
      409,
    );
  return row;
}
export function verificationEffects(
  pool: Pool,
  profiles: IdentityProfiles,
): EffectHook[] {
  return (
    ["identity.verify_creator", "identity.reject_verification"] as const
  ).map((type) => ({
    type,
    async run(input) {
      const current = await intent(pool, input, type);
      if (
        current.queue !== "verification" ||
        !current.subject_account_id ||
        !current.proof_id
      )
        throw new DomainError(
          "proof_evidence_required",
          "This case needs the exact pending external proof.",
          409,
        );
      const decision = {
        proofId: current.proof_id,
        accountId: current.subject_account_id,
        reviewerAccountId: input.actorAccountId,
        caseId: input.caseId,
        decision:
          type === "identity.verify_creator"
            ? ("approved" as const)
            : ("rejected" as const),
        reason: input.reason,
      };
      const result = await profiles.reviewProof(decision, async (value) => {
        const latest = await intent(pool, input, type);
        return (
          latest.id === value.caseId &&
          latest.subject_account_id === value.accountId &&
          latest.proof_id === value.proofId &&
          latest.actor_account_id === value.reviewerAccountId
        );
      });
      return {
        receipt: {
          domain: "identity",
          effectId: input.effectId,
          proofId: current.proof_id,
          decision: decision.decision,
          done: result.done,
        },
      };
    },
  }));
}
export function agentPauseEffects(options: {
  pool: Pool;
  agent: AgentLifecycle;
  ownerScope: (
    creatorId: string,
  ) => Promise<{ creatorId: string; accountId: string; development: boolean }>;
  settleDeparture: (
    input: Parameters<EffectHook["run"]>[0],
  ) => Promise<{ complete: boolean; receipt: Record<string, unknown> }>;
}): EffectHook[] {
  return ["agent.pause", "agent.revoke_license"].map((type) => ({
    type,
    async run(input) {
      const current = await intent(options.pool, input, type);
      if (!current.creator_id || current.id !== input.caseId)
        throw new DomainError(
          "creator_evidence_required",
          "This case needs creator authority.",
          409,
        );
      const scope = await options.ownerScope(current.creator_id);
      if (
        scope.creatorId !== current.creator_id ||
        !current.subject_account_id ||
        scope.accountId !== current.subject_account_id
      )
        throw new DomainError(
          "creator_authority_changed",
          "This case no longer identifies the current creator owner.",
          409,
        );
      const agent = await options.agent.pauseNotice(scope, {
        jobId: input.effectId,
        reason:
          type === "agent.revoke_license" ? "license_revoked" : "suspension",
        verifiedNoticeReference: input.caseId,
      });
      const settlement = await options.settleDeparture(input);
      if (!settlement.complete)
        throw new DomainError(
          "commerce_lifecycle_pending",
          "Generation is denied; commitment settlement remains pending.",
          503,
        );
      return {
        receipt: {
          domain: "agent",
          effectId: input.effectId,
          agent,
          settlement: settlement.receipt,
        },
      };
    },
  }));
}
