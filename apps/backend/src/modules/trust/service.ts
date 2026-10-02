import type { PoolClient } from "pg";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import { TrustStore, command, priorCommand } from "./store.js";
import {
  PrivacyDomains,
  type CaseSummary,
  type CaseDetail,
  type Evidence,
  type ReportCommand,
  type DecisionCommand,
  type PrivacyCommand,
  type QueueName,
  type PrivacyDomain,
} from "./contracts.js";
import {
  PrivacyArtifact,
  type PrivacyArtifactStore,
} from "./privacy-export.js";
import { trustReplyError } from "./reply-review.js";

type CaseRow = CaseSummary & {
  reporter_account_id: string;
  subject_account_id: string | null;
  reason: string;
  creator_id: string | null;
  request_id: string | null;
  outcome: string | null;
  resolution_reason: string | null;
  decision_account_id: string | null;
};
const summaryColumns =
  "id,number,kind,queue,creator_name,state,version,created_at,updated_at";
function caseDto<T extends CaseSummary>(row: T): T {
  const number = Number(row.number);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new DomainError(
      "case_number_unavailable",
      "This case reference is unavailable.",
      503,
    );
  return { ...row, number };
}
const queues: Record<ReportCommand["kind"], QueueName> = {
  ai_report: "safety",
  crisis: "safety",
  abuse: "safety",
  dispute: "disputes",
  verification: "verification",
  pause: "pauses",
  support: "support",
};
const effectTypes: Partial<Record<DecisionCommand["resolution"], string>> = {
  partial_refund: "commerce.partial_refund",
  full_refund: "commerce.full_refund",
  pause_creator: "agent.pause",
  revoke_license: "agent.revoke_license",
  suspend_account: "identity.suspend",
  verify_creator: "identity.verify_creator",
  reject_verification: "identity.reject_verification",
};
export type TrustDependencies = {
  privacyVerificationMethod?: "current_session" | "external_receipt";
  verifyExport?: (
    actor: Actor,
  ) => Promise<{ verifiedAt: Date; reference: string }>;
  evidence?: (
    actor: Actor,
    input: ReportCommand,
  ) => Promise<{
    creatorId?: string;
    creatorName?: string;
    subjectAccountId?: string;
    items: Evidence[];
  }>;
  verifyPrivacy?: (
    actor: Actor,
    input: PrivacyCommand,
  ) => Promise<{ verifiedAt: Date; reference: string }>;
  authorizePrivacyScope?: (
    actor: Actor,
    input: PrivacyCommand,
  ) => Promise<void>;
  /** W1 resolves current owned profiles before identity deletion, never from request IDs. */
  privacyOwnership?: (actor: Actor) => Promise<{
    creatorIds: readonly string[];
    reference: string;
  }>;
};
export class TrustService {
  constructor(
    readonly store: TrustStore,
    readonly dependencies: TrustDependencies = {},
    readonly artifacts?: PrivacyArtifactStore,
  ) {}
  private async capturePrivacyOwnership(actor: Actor) {
    if (!this.dependencies.privacyOwnership) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        this.dependencies.privacyOwnership(actor),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new DomainError(
                  "privacy_ownership_unavailable",
                  "Account ownership could not be verified. Reconnect and retry.",
                  503,
                ),
              ),
            2000,
          );
          timer.unref();
        }),
      ]);
      const parsed = z
        .strictObject({
          creatorIds: z.array(z.uuid()).max(100),
          reference: z.string().trim().min(8).max(200),
        })
        .safeParse(value);
      if (!parsed.success)
        throw new DomainError(
          "privacy_ownership_unavailable",
          "Account ownership could not be verified. Reconnect and retry.",
          503,
        );
      return parsed.data;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async report(actor: Actor, input: ReportCommand) {
    // A grant is deliberately never checked. Evidence resolver checks ownership/current authority.
    if (
      (input.messageId || input.requestId || input.creatorId) &&
      !this.dependencies.evidence
    )
      throw new DomainError(
        "evidence_unavailable",
        "This report needs the conversation or request evidence connection.",
        503,
      );
    const evidence = this.dependencies.evidence
      ? await this.dependencies.evidence(actor, input)
      : { items: [] };
    if (
      evidence.items.length > 12 ||
      Buffer.byteLength(JSON.stringify(evidence.items)) > 512 * 1024
    )
      throw new DomainError(
        "evidence_too_large",
        "Select a smaller reported object or contact support for a scoped review.",
        413,
      );
    return this.store
      .actor(actor, (client) =>
        command(
          client,
          actor,
          "report",
          input.idempotencyKey,
          input,
          async () => {
            const rate = await client.query<{ count: string }>(
              "SELECT count(*) FROM creator_trust.safety_case WHERE reporter_account_id=$1 AND created_at>now()-interval '1 hour'",
              [actor.accountId],
            );
            if (Number(rate.rows[0]?.count) > 19 && input.kind !== "crisis")
              throw new DomainError(
                "report_rate_limited",
                "Your reports are saved. Please wait before sending another.",
                429,
              );
            const created = await client.query<CaseSummary>(
              `INSERT INTO creator_trust.safety_case(reporter_account_id,creator_id,creator_name,subject_account_id,request_id,kind,queue,reason,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${summaryColumns}`,
              [
                actor.accountId,
                evidence.creatorId ?? null,
                evidence.creatorName ?? null,
                evidence.subjectAccountId ?? null,
                input.requestId ?? null,
                input.kind,
                queues[input.kind],
                input.reason,
                input.kind === "crisis" ? "urgent" : "open",
              ],
            );
            const result = created.rows[0]!;
            for (const item of evidence.items)
              await client.query(
                "INSERT INTO creator_trust.case_evidence(case_id,category,snapshot,expires_at) VALUES($1,$2,$3,now()+interval '12 months')",
                [result.id, item.category, JSON.stringify(item)],
              );
            await this.event(client, actor, result.id, "report_filed", null);
            return result;
          },
        ),
      )
      .then(caseDto);
  }
  async queue(
    actor: Actor,
    queue: QueueName,
    cursor?: string,
    number?: number,
  ) {
    return this.store.actor(actor, async (client) => {
      await this.requireQueue(client, queue);
      const page = await client.query<CaseSummary>(
        `SELECT ${summaryColumns} FROM creator_trust.safety_case WHERE queue=$1 AND ($2::bigint IS NULL OR number<$2) AND ($3::bigint IS NULL OR number=$3) ORDER BY number DESC LIMIT 41`,
        [queue, cursor ?? null, number ?? null],
      );
      const counts = await client.query<{ queue: QueueName; count: string }>(
        "SELECT queue,count(*) FROM creator_trust.safety_case WHERE state<>'resolved' AND creator_trust.may_queue(queue) GROUP BY queue",
      );
      return {
        items: page.rows.slice(0, 40).map(caseDto),
        nextCursor:
          page.rows.length > 40 ? String(page.rows[39]!.number) : null,
        counts: Object.fromEntries(
          counts.rows.map((r) => [r.queue, Number(r.count)]),
        ),
      };
    });
  }
  async claim(
    actor: Actor,
    caseId: string,
    purpose: string,
    minutes: number,
    correlationId: string,
  ) {
    return this.store.actor(actor, async (client) => {
      const result = await client.query<CaseRow>(
        "SELECT * FROM creator_trust.safety_case WHERE id=$1",
        [caseId],
      );
      const current = result.rows[0];
      if (!current)
        throw new DomainError(
          "case_unavailable",
          "This case is unavailable.",
          404,
        );
      await this.requireQueue(client, current.queue);
      await client.query(
        "INSERT INTO creator_trust.case_access(case_id,account_id,purpose,granted_at,expires_at) VALUES($1,$2,$3,now(),now()+make_interval(mins=>$4)) ON CONFLICT(case_id,account_id) DO UPDATE SET purpose=$3,granted_at=now(),expires_at=now()+make_interval(mins=>$4)",
        [caseId, actor.accountId, purpose, minutes],
      );
      await this.audit(
        client,
        actor,
        caseId,
        "case_open",
        purpose,
        correlationId,
      );
      return { caseId, expiresInSeconds: minutes * 60 };
    });
  }
  async detail(
    actor: Actor,
    caseId: string,
    correlationId: string,
  ): Promise<CaseDetail> {
    return this.store.actor(actor, async (client) => {
      const current = await this.requireCase(client, caseId);
      const access = await client.query<{
        expires_at: string;
        purpose: string;
      }>(
        "SELECT expires_at,purpose FROM creator_trust.case_access WHERE case_id=$1 AND account_id=$2 AND expires_at>now()",
        [caseId, actor.accountId],
      );
      const lease = access.rows[0]!;
      await this.audit(
        client,
        actor,
        caseId,
        "evidence_read",
        lease.purpose,
        correlationId,
      );
      const evidence = await client.query<{ snapshot: Evidence }>(
        "SELECT snapshot FROM creator_trust.case_evidence WHERE case_id=$1 AND expires_at>now() ORDER BY created_at,id LIMIT 12",
        [caseId],
      );
      const replyEvidence: Evidence[] = [];
      if (current.kind === "reply_review") {
        // A source lookup failure must not abort the case read transaction.
        await client.query("SAVEPOINT reply_evidence");
        try {
          replyEvidence.push(await this.replyEvidence(client, caseId));
          await client.query("RELEASE SAVEPOINT reply_evidence");
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT reply_evidence");
          await client.query("RELEASE SAVEPOINT reply_evidence");
          const value = trustReplyError(error);
          if (![409, 410].includes(value.status)) throw value;
          replyEvidence.push({
            id: caseId,
            category: "reply_review_unavailable",
            text: value.message,
          });
        }
      }
      const timeline = await client.query<CaseDetail["timeline"][number]>(
        "SELECT id,type,reason,created_at FROM creator_trust.case_event WHERE case_id=$1 ORDER BY created_at,id LIMIT 100",
        [caseId],
      );
      const effects = await client.query<CaseDetail["effects"][number]>(
        "SELECT id,type,state,error_code FROM creator_trust.effect WHERE case_id=$1 ORDER BY created_at LIMIT 8",
        [caseId],
      );
      const {
        reporter_account_id,
        subject_account_id,
        decision_account_id,
        ...safe
      } = current;
      void reporter_account_id;
      void subject_account_id;
      return {
        ...safe,
        number: caseDto(safe).number,
        evidence: [...evidence.rows.map((r) => r.snapshot), ...replyEvidence],
        timeline: timeline.rows,
        effects: effects.rows,
        access_expires_at: lease.expires_at,
        can_decide:
          current.state !== "resolved" &&
          current.state !== "action_pending" &&
          !(
            current.state === "appealed" &&
            decision_account_id === actor.accountId
          ),
      };
    });
  }
  async decide(
    actor: Actor,
    caseId: string,
    input: DecisionCommand,
    correlationId: string,
  ) {
    return this.store
      .actor(actor, (client) =>
        command(
          client,
          actor,
          `case_decide:${caseId}`,
          input.idempotencyKey,
          input,
          async () => {
            const current = await this.requireCase(client, caseId, true);
            if (current.version !== input.version)
              throw new DomainError(
                "stale_case",
                "This case changed. Refresh before deciding.",
                409,
              );
            if (
              current.state === "resolved" ||
              current.state === "action_pending"
            )
              throw new DomainError(
                "case_already_decided",
                "This case already has a decision.",
                409,
              );
            if (
              current.state === "appealed" &&
              current.decision_account_id === actor.accountId
            )
              throw new DomainError(
                "independent_reviewer_required",
                "An appeal needs another reviewer.",
              );
            if (
              ["partial_refund", "full_refund"].includes(input.resolution) &&
              (current.queue !== "disputes" || !current.request_id)
            )
              throw new DomainError(
                "refund_unavailable",
                "A refund requires a commerce dispute and its request record.",
                409,
              );
            if (
              ["verify_creator", "reject_verification"].includes(
                input.resolution,
              )
            ) {
              const proof = await client.query(
                "SELECT 1 FROM creator_trust.case_evidence WHERE case_id=$1 AND category='external_authorization_proof' AND snapshot->>'proof_id' IS NOT NULL AND expires_at>now() LIMIT 1",
                [caseId],
              );
              if (current.queue !== "verification" || !proof.rowCount)
                throw new DomainError(
                  "proof_evidence_required",
                  "Verification review needs the exact submitted proof in a verification case.",
                  409,
                );
            }
            const replyDecision = ["allow_reply", "flag_reply"].includes(
              input.resolution,
            );
            if (replyDecision && current.kind !== "reply_review")
              throw new DomainError(
                "reply_case_required",
                "This decision requires an exact Note reply review.",
                409,
              );
            if (current.kind === "reply_review") {
              if (!replyDecision && input.resolution !== "close")
                throw new DomainError(
                  "reply_decision_required",
                  "Allow or flag this exact reply, or close an unavailable review.",
                  409,
                );
              if (replyDecision)
                await this.replyEvidence(
                  client,
                  caseId,
                  input.resolution === "allow_reply",
                );
              else {
                await client.query("SAVEPOINT reply_closure");
                let unavailable = false;
                try {
                  await this.replyEvidence(client, caseId);
                  await client.query("RELEASE SAVEPOINT reply_closure");
                } catch (error) {
                  await client.query("ROLLBACK TO SAVEPOINT reply_closure");
                  await client.query("RELEASE SAVEPOINT reply_closure");
                  const value = trustReplyError(error);
                  if (![409, 410].includes(value.status)) throw value;
                  unavailable = true;
                }
                if (!unavailable)
                  throw new DomainError(
                    "reply_decision_required",
                    "This current reply needs an explicit allow or flag decision.",
                    409,
                  );
              }
            }
            if (
              [
                "pause_creator",
                "revoke_license",
                "suspend_account",
                "verify_creator",
                "reject_verification",
              ].includes(input.resolution)
            ) {
              const member = await client.query<{ supervisor: boolean }>(
                "SELECT supervisor FROM creator_trust.ops_member WHERE account_id=$1 AND expires_at>now() AND revoked_at IS NULL",
                [actor.accountId],
              );
              if (!member.rows[0]?.supervisor)
                throw new DomainError(
                  "supervisor_required",
                  "This action needs an authorized supervisor.",
                );
              if (
                [
                  "pause_creator",
                  "revoke_license",
                  "verify_creator",
                  "reject_verification",
                ].includes(input.resolution) &&
                !current.creator_id
              )
                throw new DomainError(
                  "creator_required",
                  "This action needs a verified creator reference.",
                  409,
                );
            }
            if (
              input.resolution === "suspend_account" &&
              !current.subject_account_id
            )
              throw new DomainError(
                "subject_required",
                "This action needs an authorized account reference.",
                409,
              );
            if (
              ["pause_creator", "revoke_license", "suspend_account"].includes(
                input.resolution,
              )
            )
              await client.query(
                "INSERT INTO creator_trust.restriction(case_id,creator_id,account_id,reason_code) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
                [
                  caseId,
                  input.resolution === "suspend_account"
                    ? null
                    : current.creator_id,
                  input.resolution === "suspend_account"
                    ? current.subject_account_id
                    : null,
                  input.resolution,
                ],
              );
            const effect = effectTypes[input.resolution];
            if (effect)
              await client.query(
                "INSERT INTO creator_trust.effect(case_id,actor_account_id,type,input,decision_version) VALUES($1,$2,$3,$4,$5)",
                [
                  caseId,
                  actor.accountId,
                  effect,
                  JSON.stringify({
                    creatorId: current.creator_id,
                    requestId: current.request_id,
                    reason: input.reason,
                    ...(input.amountMinor !== undefined
                      ? { amountMinor: input.amountMinor }
                      : {}),
                  }),
                  current.version + 1,
                ],
              );
            const result = await client.query<CaseSummary>(
              `UPDATE creator_trust.safety_case SET state=$2,outcome=$3,resolution_reason=$4,decision_account_id=$5,version=version+1,updated_at=now(),closed_at=CASE WHEN $2='resolved' THEN now() ELSE NULL END WHERE id=$1 RETURNING ${summaryColumns}`,
              [
                caseId,
                effect ? "action_pending" : "resolved",
                input.resolution,
                input.reason,
                actor.accountId,
              ],
            );
            if (replyDecision)
              await client.query(
                "INSERT INTO creator_trust.reply_review_decision(case_id,case_version,reviewer_account_id,state) VALUES($1,$2,$3,$4)",
                [
                  caseId,
                  result.rows[0]!.version,
                  actor.accountId,
                  input.resolution === "allow_reply" ? "allowed" : "flagged",
                ],
              );
            await this.event(
              client,
              actor,
              caseId,
              "decision_recorded",
              input.reason,
            );
            await this.audit(
              client,
              actor,
              caseId,
              "decision",
              input.reason,
              correlationId,
            );
            await this.notify(
              client,
              current,
              result.rows[0]!.version,
              effect ? "action_pending" : "resolved",
              input.reason,
            );
            return result.rows[0]!;
          },
        ),
      )
      .then(caseDto);
  }
  private async replyEvidence(
    client: PoolClient,
    caseId: string,
    allow = false,
  ): Promise<Evidence> {
    try {
      return (
        await client.query<{ evidence: Evidence }>(
          "SELECT creator_trust.reply_review_evidence($1,$2) AS evidence",
          [caseId, allow],
        )
      ).rows[0]!.evidence;
    } catch (error) {
      throw trustReplyError(error);
    }
  }
  async ownCases(actor: Actor) {
    return this.store.actor(actor, async (client) => ({
      items: (
        await client.query(
          `SELECT ${summaryColumns},resolution_reason FROM creator_trust.safety_case WHERE reporter_account_id=$1 OR subject_account_id=$1 ORDER BY number DESC LIMIT 40`,
          [actor.accountId],
        )
      ).rows.map(caseDto),
    }));
  }
  async retryEffects(
    actor: Actor,
    caseId: string,
    input: { version: number; reason: string; idempotencyKey: string },
    correlationId: string,
  ) {
    return this.store.actor(actor, (client) =>
      command(
        client,
        actor,
        `effect_retry:${caseId}`,
        input.idempotencyKey,
        input,
        async () => {
          const current = await this.requireCase(client, caseId, true);
          const member = (
            await client.query(
              "SELECT supervisor FROM creator_trust.ops_member WHERE account_id=$1 AND expires_at>now() AND revoked_at IS NULL",
              [actor.accountId],
            )
          ).rows[0];
          if (!member?.supervisor)
            throw new DomainError(
              "supervisor_required",
              "Action recovery needs an authorized supervisor.",
            );
          if (current.version !== input.version)
            throw new DomainError(
              "stale_case",
              "This case changed. Refresh before recovering its action.",
              409,
            );
          if (current.state !== "action_pending")
            throw new DomainError(
              "action_retry_unavailable",
              "Only an incomplete recorded action can be retried.",
              409,
            );
          const recent = await client.query(
            "SELECT 1 FROM creator_trust.access_audit WHERE case_id=$1 AND actor_account_id=$2 AND action='effect_retry' AND created_at>now()-interval '30 seconds' LIMIT 1",
            [caseId, actor.accountId],
          );
          if (recent.rowCount)
            throw new DomainError(
              "action_retry_limited",
              "The previous recovery attempt is saved. Wait before retrying again.",
              429,
            );
          const retried = await client.query(
            "UPDATE creator_trust.effect SET state='pending',available_at=now(),lease_until=NULL,lease_token=NULL,error_code=NULL WHERE case_id=$1 AND decision_version=$2 AND state IN('blocked','retry','dead_letter') RETURNING id",
            [caseId, current.version],
          );
          if (!retried.rowCount)
            throw new DomainError(
              "action_retry_unavailable",
              "This action is already running or awaiting its first attempt.",
              409,
            );
          await this.audit(
            client,
            actor,
            caseId,
            "effect_retry",
            input.reason,
            correlationId,
          );
          await this.event(
            client,
            actor,
            caseId,
            "action_retried",
            input.reason,
          );
          return {
            caseId,
            state: "action_pending",
            version: current.version,
            requeued: retried.rowCount,
          };
        },
      ),
    );
  }
  async appeal(
    actor: Actor,
    caseId: string,
    input: { version: number; reason: string; idempotencyKey: string },
  ) {
    return this.store
      .actor(actor, (client) =>
        command(
          client,
          actor,
          `appeal:${caseId}`,
          input.idempotencyKey,
          input,
          async () => {
            const result = await client.query<CaseRow>(
              "SELECT * FROM creator_trust.safety_case WHERE id=$1 AND (reporter_account_id=$2 OR subject_account_id=$2) FOR UPDATE",
              [caseId, actor.accountId],
            );
            const current = result.rows[0];
            if (!current)
              throw new DomainError(
                "case_unavailable",
                "This case is unavailable.",
                404,
              );
            if (current.version !== input.version)
              throw new DomainError(
                "stale_case",
                "This case changed. Refresh before appealing.",
                409,
              );
            if (current.state !== "resolved")
              throw new DomainError(
                "appeal_unavailable",
                "An appeal is available after the case is resolved.",
                409,
              );
            const updated = await client.query<CaseSummary>(
              `UPDATE creator_trust.safety_case SET state='appealed',version=version+1,closed_at=NULL,updated_at=now() WHERE id=$1 RETURNING ${summaryColumns}`,
              [caseId],
            );
            await this.event(
              client,
              actor,
              caseId,
              "appeal_filed",
              input.reason,
            );
            return updated.rows[0]!;
          },
        ),
      )
      .then(caseDto);
  }
  async block(
    actor: Actor,
    input: { creatorId: string; reason: string; idempotencyKey: string },
  ) {
    // Blocks are canonical W8 deny records. Domain application acknowledgments stay pending.
    const prior = await this.store.actor(actor, (client) =>
      priorCommand<{
        blocked: boolean;
        caseId: string;
        enforcement: string;
        domainIntegration: string;
      }>(client, actor, "block", input.idempotencyKey, input),
    );
    if (prior) return prior;
    const report = await this.report(actor, {
      kind: "abuse",
      creatorId: input.creatorId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    return this.store.actor(actor, (client) =>
      command(client, actor, "block", input.idempotencyKey, input, async () => {
        await client.query(
          "INSERT INTO creator_trust.block(account_id,creator_id,case_id) VALUES($1,$2,$3) ON CONFLICT(account_id,creator_id) DO UPDATE SET revoked_at=NULL,case_id=$3",
          [actor.accountId, input.creatorId, report.id],
        );
        return {
          blocked: true,
          caseId: report.id,
          enforcement: "deny_record_committed",
          domainIntegration: "pending",
        };
      }),
    );
  }
  async assertAllowed(actor: Actor, creatorId?: string, threadId?: string) {
    return this.store.actor(actor, (client) =>
      this.assertAllowedInTransaction(client, actor, creatorId, threadId),
    );
  }
  private async assertAllowedInTransaction(
    client: PoolClient,
    actor: Actor,
    creatorId?: string,
    threadId?: string,
  ) {
    const denied = await client.query(
      "SELECT 1 FROM creator_trust.tombstone WHERE account_id=$1 AND (scope='account' OR (creator_id=$2 AND (scope='creator' OR thread_id=$3))) LIMIT 1",
      [actor.accountId, creatorId ?? null, threadId ?? null],
    );
    const blocked = creatorId
      ? await client.query(
          "SELECT 1 FROM creator_trust.block WHERE account_id=$1 AND creator_id=$2 AND revoked_at IS NULL",
          [actor.accountId, creatorId],
        )
      : null;
    const restricted = await client.query(
      "SELECT 1 FROM creator_trust.restriction WHERE revoked_at IS NULL AND (account_id=$1 OR creator_id=$2) LIMIT 1",
      [actor.accountId, creatorId ?? null],
    );
    if (denied.rowCount || blocked?.rowCount || restricted.rowCount)
      throw new DomainError("scope_revoked", "This scope is closed.");
  }
  async privacy(actor: Actor, input: PrivacyCommand) {
    if (!this.dependencies.verifyPrivacy)
      throw new DomainError(
        "actor_verification_unavailable",
        "Reconnect your account before requesting data changes.",
        503,
      );
    const verification = z
      .strictObject({
        verifiedAt: z.date(),
        reference: z.string().trim().min(8).max(200),
      })
      .safeParse(await this.dependencies.verifyPrivacy(actor, input));
    if (!verification.success)
      throw new DomainError(
        "fresh_verification_required",
        "Verify your account again.",
        401,
      );
    const verified = verification.data;
    if (
      verified.verifiedAt.getTime() < Date.now() - 5 * 60_000 ||
      verified.verifiedAt.getTime() > Date.now() + 30_000
    )
      throw new DomainError(
        "fresh_verification_required",
        "Verify your account again.",
        401,
      );
    const { proof, ...immutable } = input;
    void proof;
    // Successful deletion can remove the original authority objects. A fresh,
    // same-account replay returns only its original minimal job acknowledgment.
    const prior = await this.store.actor(actor, (client) =>
      priorCommand<{
        id: string;
        kind: PrivacyCommand["kind"];
        state: string;
        immediateDeny: boolean;
        domainIntegration: string;
      }>(client, actor, "privacy", input.idempotencyKey, immutable),
    );
    if (prior) return prior;
    if (input.scope !== "account") {
      if (!this.dependencies.authorizePrivacyScope)
        throw new DomainError(
          "scope_verification_unavailable",
          "This data scope is not connected yet.",
          503,
        );
      await this.dependencies.authorizePrivacyScope(actor, input);
    }
    return this.store.actor(actor, (client) =>
      command(
        client,
        actor,
        "privacy",
        input.idempotencyKey,
        immutable,
        async () => {
          if (input.kind === "export" || input.scope === "account")
            await this.assertAllowedInTransaction(
              client,
              actor,
              input.creatorId,
              input.threadId,
            );
          const ownership =
            input.scope === "account"
              ? await this.capturePrivacyOwnership(actor)
              : null;
          const rate = await client.query<{ count: string }>(
            "SELECT count(*) FROM creator_trust.privacy_job WHERE account_id=$1 AND created_at>now()-interval '1 hour'",
            [actor.accountId],
          );
          if (Number(rate.rows[0]?.count) >= 5)
            throw new DomainError(
              "privacy_rate_limited",
              "Your data requests are saved. Wait before starting another.",
              429,
            );
          const job = await client.query<{ id: string }>(
            "INSERT INTO creator_trust.privacy_job(account_id,kind,scope,creator_id,thread_id,verified_at,verification_ref,owned_creator_ids,ownership_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
            [
              actor.accountId,
              input.kind,
              input.scope,
              input.creatorId ?? null,
              input.threadId ?? null,
              verified.verifiedAt,
              verified.reference,
              ownership ? [...new Set(ownership.creatorIds)].sort() : null,
              ownership?.reference ?? null,
            ],
          );
          const id = job.rows[0]!.id;
          if (input.kind === "delete")
            await client.query(
              "INSERT INTO creator_trust.tombstone(account_id,scope,creator_id,thread_id,job_id) VALUES($1,$2,$3,$4,$5)",
              [
                actor.accountId,
                input.scope,
                input.creatorId ?? null,
                input.threadId ?? null,
                id,
              ],
            );
          for (const domain of PrivacyDomains)
            await client.query(
              "INSERT INTO creator_trust.privacy_task(job_id,domain) VALUES($1,$2)",
              [id, domain],
            );
          return {
            id,
            kind: input.kind,
            state: "queued",
            immediateDeny: input.kind === "delete",
            domainIntegration: "pending",
          };
        },
      ),
    );
  }
  async privacyJobs(actor: Actor) {
    return this.store.actor(actor, async (client) => ({
      items: (
        await client.query(
          "SELECT id,kind,scope,state,created_at,updated_at,completed_at FROM creator_trust.privacy_job WHERE account_id=$1 ORDER BY created_at DESC,id DESC LIMIT 40",
          [actor.accountId],
        )
      ).rows,
    }));
  }
  async privacyJob(actor: Actor, id: string) {
    return this.store.actor(actor, async (client) => {
      const job = (
        await client.query(
          "SELECT id,kind,scope,state,created_at,updated_at,completed_at FROM creator_trust.privacy_job WHERE id=$1 AND account_id=$2",
          [id, actor.accountId],
        )
      ).rows[0];
      if (!job)
        throw new DomainError(
          "job_unavailable",
          "This data request is unavailable.",
          404,
        );
      const tasks = (
        await client.query(
          "SELECT domain,state,attempts,error_code,receipt FROM creator_trust.privacy_task WHERE job_id=$1 ORDER BY domain",
          [id],
        )
      ).rows;
      const retained = (
        await client.query(
          "SELECT category,until_at AS until,reason FROM creator_trust.retained_record WHERE job_id=$1 ORDER BY domain,category",
          [id],
        )
      ).rows;
      return { ...job, tasks, retained };
    });
  }
  async retryPrivacy(actor: Actor, id: string) {
    return this.store.actor(actor, async (client) => {
      const job = (
        await client.query(
          "SELECT state FROM creator_trust.privacy_job WHERE id=$1 AND account_id=$2 FOR UPDATE",
          [id, actor.accountId],
        )
      ).rows[0];
      if (!job)
        throw new DomainError(
          "job_unavailable",
          "This data request is unavailable.",
          404,
        );
      if (job.state === "complete")
        throw new DomainError(
          "job_complete",
          "This data request is already complete.",
          409,
        );
      await client.query(
        "UPDATE creator_trust.privacy_task SET state='pending',available_at=now(),lease_until=NULL,lease_token=NULL,error_code=NULL WHERE job_id=$1 AND state IN ('blocked','retry','dead_letter')",
        [id],
      );
      await client.query(
        "UPDATE creator_trust.privacy_job SET state='queued',updated_at=now() WHERE id=$1",
        [id],
      );
      return { id, state: "queued" };
    });
  }
  async exportData(actor: Actor, id: string) {
    return this.store.actor(actor, async (client) => {
      const job = (
        await client.query(
          "SELECT state,kind,completed_at,creator_id,thread_id FROM creator_trust.privacy_job WHERE id=$1 AND account_id=$2",
          [id, actor.accountId],
        )
      ).rows[0];
      if (!job)
        throw new DomainError(
          "job_unavailable",
          "This data request is unavailable.",
          404,
        );
      if (job.kind !== "export" || job.state !== "complete")
        throw new DomainError(
          "export_not_complete",
          "Every domain must finish before your export is ready.",
          409,
        );
      if (
        !job.completed_at ||
        Date.now() - new Date(job.completed_at).getTime() >= 7 * 24 * 3600_000
      )
        throw new DomainError(
          "export_expired",
          "This export expired. Request a new export.",
          410,
        );
      await this.assertAllowedInTransaction(
        client,
        actor,
        job.creator_id ?? undefined,
        job.thread_id ?? undefined,
      );
      await this.verifyFreshExport(actor);
      return {
        schemaVersion: 1,
        jobId: id,
        domains: (
          await client.query(
            "SELECT domain,data,receipt FROM creator_trust.privacy_task WHERE job_id=$1 ORDER BY domain",
            [id],
          )
        ).rows,
      };
    });
  }
  /** This check is repeated during streaming; progress remains readable after
   * deletion, while payload download still needs current permitted authority. */
  async authorizeExport(actor: Actor, id: string) {
    await this.verifyFreshExport(actor);
    await this.store.actor(actor, async (client) => {
      const job = (
        await client.query(
          "SELECT creator_id,thread_id FROM creator_trust.privacy_job WHERE id=$1 AND account_id=$2 AND kind='export' AND state='complete' AND completed_at>now()-interval '7 days'",
          [id, actor.accountId],
        )
      ).rows[0];
      if (!job)
        throw new DomainError(
          "export_artifact_unavailable",
          "This export artifact is unavailable.",
          404,
        );
      await this.assertAllowedInTransaction(
        client,
        actor,
        job.creator_id ?? undefined,
        job.thread_id ?? undefined,
      );
    });
  }
  private async verifyFreshExport(actor: Actor) {
    if (!this.dependencies.verifyExport)
      throw new DomainError(
        "export_verification_unavailable",
        "Reconnect your account before downloading personal data.",
        503,
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const value = await (async () => {
      try {
        return await Promise.race([
          this.dependencies.verifyExport!(actor),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new DomainError(
                    "export_verification_unavailable",
                    "Account verification is unavailable. Reconnect and retry.",
                    503,
                  ),
                ),
              2000,
            );
            timer.unref();
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();
    const proof = z
      .strictObject({
        verifiedAt: z.date(),
        reference: z.string().trim().min(8).max(200),
      })
      .safeParse(value);
    const age = proof.success
      ? Date.now() - proof.data.verifiedAt.getTime()
      : Infinity;
    if (!proof.success || age < -30_000 || age >= 300_000)
      throw new DomainError(
        "fresh_verification_required",
        "Continue with Pantopus again before downloading personal data.",
        401,
      );
  }
  async exportArtifact(
    actor: Actor,
    id: string,
    domain: PrivacyDomain,
    signal: AbortSignal,
  ) {
    const data = await this.exportData(actor, id);
    const part = data.domains.find((entry) => entry.domain === domain);
    const parsed = PrivacyArtifact.safeParse(part?.data);
    if (!parsed.success || !this.artifacts)
      throw new DomainError(
        "export_artifact_unavailable",
        "This protected export artifact is unavailable.",
        503,
      );
    const binding = { jobId: id, accountId: actor.accountId, domain };
    await this.artifacts.verify(parsed.data, binding, signal);
    await this.authorizeExport(actor, id);
    return {
      artifact: parsed.data,
      chunks: this.artifacts.read(parsed.data, binding, signal),
    };
  }
  async inbox(actor: Actor) {
    return this.store.actor(actor, async (client) => ({
      items: (
        await client.query(
          "SELECT id,case_id,type,reason,version,created_at FROM creator_trust.notice WHERE recipient_account_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50",
          [actor.accountId],
        )
      ).rows,
    }));
  }
  async accessHistory(actor: Actor) {
    return this.store.actor(actor, async (client) => ({
      items: (
        await client.query(
          "SELECT a.case_id,a.action,a.purpose,a.created_at FROM creator_trust.access_audit a JOIN creator_trust.safety_case c ON c.id=a.case_id WHERE c.reporter_account_id=$1 OR c.subject_account_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 100",
          [actor.accountId],
        )
      ).rows,
    }));
  }
  async opsAudits(actor: Actor) {
    return this.store.actor(actor, async (client) => {
      const member = (
        await client.query(
          "SELECT queues FROM creator_trust.ops_member WHERE account_id=$1 AND revoked_at IS NULL AND expires_at>now()",
          [actor.accountId],
        )
      ).rows[0];
      if (!member?.queues?.length)
        throw new DomainError(
          "ops_role_required",
          "Access audits need an active operations role.",
        );
      return {
        items: (
          await client.query(
            "SELECT a.id,a.case_id,a.action,a.created_at,a.correlation_id,c.queue FROM creator_trust.access_audit a JOIN creator_trust.safety_case c ON c.id=a.case_id WHERE a.actor_account_id=$1 AND c.queue=ANY($2) ORDER BY a.created_at DESC,a.id DESC LIMIT 100",
            [actor.accountId, member.queues],
          )
        ).rows,
      };
    });
  }
  private async requireQueue(client: PoolClient, queue: QueueName) {
    const member = await client.query<{ allowed: boolean }>(
      "SELECT creator_trust.may_queue($1) AS allowed",
      [queue],
    );
    if (!member.rows[0]?.allowed)
      throw new DomainError(
        "ops_role_required",
        "This queue needs an authorized operations role.",
      );
  }
  private async requireCase(client: PoolClient, id: string, lock = false) {
    const result = await client.query<CaseRow>(
      `SELECT * FROM creator_trust.safety_case WHERE id=$1 ${lock ? "FOR UPDATE" : ""}`,
      [id],
    );
    const current = result.rows[0];
    if (!current)
      throw new DomainError(
        "case_unavailable",
        "This case is unavailable.",
        404,
      );
    await this.requireQueue(client, current.queue);
    if (
      !(
        await client.query<{ allowed: boolean }>(
          "SELECT creator_trust.has_case_access($1) AS allowed",
          [id],
        )
      ).rows[0]?.allowed
    )
      throw new DomainError(
        "case_access_required",
        "Open this case with a reason. Access lasts at most 15 minutes.",
      );
    return current;
  }
  private async event(
    client: PoolClient,
    actor: Actor,
    id: string,
    type: string,
    reason: string | null,
  ) {
    await client.query(
      "INSERT INTO creator_trust.case_event(case_id,actor_account_id,type,reason) VALUES($1,$2,$3,$4)",
      [id, actor.accountId, type, reason],
    );
  }
  private async audit(
    client: PoolClient,
    actor: Actor,
    id: string,
    action: string,
    purpose: string,
    correlation: string,
  ) {
    await client.query(
      "INSERT INTO creator_trust.access_audit(case_id,actor_account_id,action,purpose,correlation_id) VALUES($1,$2,$3,$4,$5)",
      [id, actor.accountId, action, purpose, correlation],
    );
  }
  private async notify(
    client: PoolClient,
    current: CaseRow,
    version: number,
    type: string,
    reason: string,
  ) {
    for (const recipient of new Set(
      [current.reporter_account_id, current.subject_account_id].filter(
        (id): id is string => Boolean(id),
      ),
    ))
      await client.query(
        "INSERT INTO creator_trust.notice(recipient_account_id,case_id,type,reason,version) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
        [recipient, current.id, type, reason, version],
      );
  }
}
