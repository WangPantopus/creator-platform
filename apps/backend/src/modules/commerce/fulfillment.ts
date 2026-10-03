import type { SessionEvidence } from "../../../../../packages/api/src/session.js";
import type { ThreadScope } from "../access/scope.js";
import { threadScopeActor } from "../access/scope.js";
import type { CommerceService } from "./service.js";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { lockCommitmentPacket } from "./packet-locks.js";
import { withRequestContextRestore } from "../identity/request-context.js";

type CallResolution = {
  packetId: string;
  refund: number;
  outcome: string;
  refundEffectId?: string;
};

/** W6 calls this from its durable settle_evidence effect. It is not a client endpoint. */
export class CommerceFulfillment {
  constructor(private readonly service: CommerceService) {}
  async settleEvidence(
    scope: ThreadScope,
    evidence: SessionEvidence,
    key: string,
  ): Promise<void> {
    const actor = threadScopeActor(scope);
    const resolution = await this.service.account(actor, async (client) => {
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
        [scope.creatorId, scope.fanId],
      );
      // Serialize the real conversation before command replay or commitment
      // locks, using only the caller's already issued canonical scope.
      const thread = await client.query(
        "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
        [scope.threadId, scope.creatorId, scope.fanId],
      );
      invariant(
        thread.rowCount === 1,
        "thread_unavailable",
        "This conversation is unavailable.",
      );
      // Lock only the genuine scope's creator profile under its RLS-compatible
      // owner context, then restore the caller before any domain work. This
      // creates no owner Actor and cannot authorize a different creator.
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        scope.creatorAccountId,
      ]);
      const owner = await withRequestContextRestore(
        () =>
          client.query(
            "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
            [scope.creatorId, scope.creatorAccountId],
          ),
        () =>
          client.query("SELECT set_config('app.account_id',$1,true)", [
            actor.accountId,
          ]),
      );
      invariant(
        owner.rowCount === 1,
        "session_creator_changed",
        "The original session creator needs reconciliation.",
      );
      return this.service.command<CallResolution>(
        client,
        actor,
        "commerce.session_outcome",
        key,
        evidence,
        async () => {
          const stored = (
            await client.query(
              "SELECT o.evidence,s.document FROM creator.call_outcome o JOIN creator.call_session s ON s.id=o.session_id AND s.creator_id=o.creator_id AND s.fan_id=o.fan_id WHERE o.session_id=$1 AND o.creator_id=$2 AND o.fan_id=$3",
              [evidence.sessionId, scope.creatorId, scope.fanId],
            )
          ).rows[0];
          invariant(
            stored &&
              contentHash(stored.evidence) === contentHash(evidence) &&
              evidence.roomClosed &&
              evidence.evidenceComplete &&
              evidence.providerHistoryReference,
            "session_evidence_required",
            "The provider-reconciled session evidence is unavailable.",
          );
          await lockCommitmentPacket(client, evidence.commitmentId);
          const record = (
            await client.query(
              "SELECT c.*,p.thread_id,p.snapshot,p.intent_ref,cp.account_id AS creator_account,cp.verification,cp.recovery_required,fp.account_id AS fan_account FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id AND p.creator_id=c.creator_id AND p.fan_id=c.fan_id JOIN creator.creator_profile cp ON cp.id=c.creator_id JOIN creator.fan_profile fp ON fp.id=c.fan_id WHERE c.id=$1 AND c.creator_id=$2 AND c.fan_id=$3 FOR UPDATE OF c",
              [evidence.commitmentId, scope.creatorId, scope.fanId],
            )
          ).rows[0];
          invariant(
            record &&
              record.thread_id === scope.threadId &&
              ["due", "in_progress"].includes(record.state) &&
              ["audio_call", "video_call"].includes(record.mode) &&
              evidence.creatorAccountId === scope.creatorAccountId &&
              evidence.fanAccountId === record.fan_account &&
              stored.document.commitmentId === record.id &&
              stored.document.threadId === scope.threadId &&
              stored.document.creatorAccountId === evidence.creatorAccountId &&
              stored.document.fanAccountId === evidence.fanAccountId &&
              stored.document.mediaMode ===
                (record.mode === "audio_call" ? "audio" : "video") &&
              evidence.durationSeconds === record.snapshot.durationSeconds,
            "session_binding_mismatch",
            "This session does not prove the promised service.",
          );
          invariant(
            Number.isSafeInteger(evidence.durationSeconds) &&
              evidence.durationSeconds > 0 &&
              Number.isSafeInteger(evidence.connectedMilliseconds) &&
              evidence.connectedMilliseconds >= 0,
            "session_clock_invalid",
            "Session clocks need reconciliation.",
          );
          const scheduled = BigInt(evidence.durationSeconds) * 1000n,
            connected = BigInt(evidence.connectedMilliseconds);
          invariant(
            connected <= scheduled,
            "session_clock_invalid",
            "Session clocks need reconciliation.",
          );
          const creatorCurrent =
            record.creator_account === evidence.creatorAccountId &&
            record.verification === "verified" &&
            !record.recovery_required;
          let refund = 0;
          if (
            !creatorCurrent ||
            ["creator_no_show", "technical_failure"].includes(evidence.outcome)
          )
            refund = record.snapshot.amount;
          else if (evidence.outcome === "partial")
            refund = Number(
              (BigInt(record.snapshot.amount) * (scheduled - connected)) /
                scheduled,
            );
          const complete = creatorCurrent && evidence.outcome === "completed";
          invariant(
            !complete ||
              connected * 100n >= scheduled * 80n ||
              (evidence.endedBy === "fan" && evidence.fanEndedByChoice),
            "session_incomplete",
            "An incomplete call cannot satisfy this commitment.",
          );
          await client.query(
            "UPDATE creator.commerce_commitment SET state=$2,delivered_at=CASE WHEN $3 THEN now() ELSE NULL END,evidence=$4,outcome=$5,payout_release_at=CASE WHEN $3 THEN now()+interval '7 days' ELSE NULL END,version=version+1 WHERE id=$1",
            [
              record.id,
              complete
                ? "delivered"
                : refund
                  ? "resolution_required"
                  : "resolved",
              complete,
              JSON.stringify({
                session: evidence,
                authorKind: complete ? "human_call" : "system",
                namedService: record.snapshot.title,
              }),
              creatorCurrent ? evidence.outcome : "creator_authority_revoked",
            ],
          );
          const outcome = creatorCurrent
            ? evidence.outcome
            : "creator_authority_revoked";
          const refundEffectId = refund
            ? await this.service.queueRefundInTransaction(
                client,
                actor,
                record.packet_id,
                refund,
                `session:${evidence.sessionId}`,
                outcome,
              )
            : undefined;
          await client.query(
            "INSERT INTO creator.commerce_event(creator_id,fan_id,aggregate_id,aggregate_version,type,payload) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
            [
              scope.creatorId,
              scope.fanId,
              record.id,
              record.version + 1 + (refund ? 1 : 0),
              complete ? "commitment_delivered" : "commitment_resolution",
              JSON.stringify({
                packetId: record.packet_id,
                outcome: evidence.outcome,
              }),
            ],
          );
          return {
            packetId: record.packet_id,
            refund,
            outcome,
            ...(refundEffectId ? { refundEffectId } : {}),
          };
        },
      );
    });
    if (resolution.refund) {
      // Historical completed resolutions retain their original saved terms;
      // resume that cause instead of fabricating a new obligation or outcome.
      const effectId =
        resolution.refundEffectId ??
        (await this.service.account(actor, (client) =>
          this.service.queueRefundInTransaction(
            client,
            actor,
            resolution.packetId,
            resolution.refund,
            `session:${evidence.sessionId}`,
            resolution.outcome,
          ),
        ));
      await this.service.runEffect(actor, effectId);
    }
  }
}
