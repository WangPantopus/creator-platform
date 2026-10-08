import { randomUUID } from "node:crypto";
import { DatabaseError, type Pool } from "pg";
import { z } from "zod";
import type { PrivacyHook, EffectHook, PrivacyDomain } from "./contracts.js";
import { TrustStore } from "./store.js";
import { privacyTaskAuthority } from "./privacy-authority.js";
import {
  consumePrivacyExport,
  type PrivacyArtifactStore,
} from "./privacy-export.js";
import { DomainError } from "../../core/errors.js";
import { trustTransaction } from "./transaction.js";
import { accountingPrivacyFailure } from "./accounting-privacy-failure.js";

type Task = {
  job_id: string;
  domain: PrivacyDomain;
  kind: "export" | "delete";
  account_id: string;
  scope: string;
  creator_id: string | null;
  thread_id: string | null;
  attempts: number;
  lease_token: string;
};
type Effect = {
  id: string;
  case_id: string;
  type: string;
  actor_account_id: string;
  attempts: number;
  lease_token: string;
  input: {
    creatorId: string | null;
    requestId: string | null;
    reason: string;
    amountMinor?: number;
  };
};

function retryableAuthorityFailure(error: unknown): boolean {
  // These guards retain the original PostgreSQL cause. A lock or aborted
  // transaction must re-run all authority checks under a fresh claim; it is
  // not evidence of missing source/permissions. Never unwrap cleanup aggregates
  // or unrelated failures, which can include unresolved transaction settlement.
  for (let depth = 0; depth < 8; depth++) {
    if (error instanceof DatabaseError)
      return ["55P03", "40001", "40P01"].includes(error.code ?? "");
    if (
      !(error instanceof DomainError) ||
      ![
        "privacy_commit_fence_unavailable",
        "privacy_original_family_unavailable",
      ].includes(error.code)
    )
      return false;
    error = error.cause;
  }
  return false;
}

// A lease token fences a slow predecessor. Hooks must deduplicate their stable effect/job key.
export class TrustWorker {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private stopped = false;
  constructor(
    readonly pool: Pool,
    readonly privacyHooks: PrivacyHook[],
    readonly effectHooks: EffectHook[],
    readonly observe: (signal: string, value: number) => void = () => {},
    readonly artifacts?: PrivacyArtifactStore,
    readonly reportPrivacyFailure?: (
      domain: PrivacyDomain,
      kind: "export" | "delete",
      cause: unknown,
    ) => void,
  ) {}
  async start() {
    await new TrustStore(this.pool).assertRole(true);
    this.stopped = false;
    this.closing = undefined;
    this.schedule();
  }
  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      const running = this.tick();
      this.running = running;
      void running
        .catch(() => {
          this.observe("worker_errors", 1);
        })
        .finally(() => {
          if (this.running === running) this.running = undefined;
          this.schedule();
        })
        .catch(() => {});
    }, 1000);
    this.timer.unref();
  }
  stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    return (this.closing ??= (async () => {
      const errors: unknown[] = [];
      try {
        await this.running;
      } catch (error) {
        errors.push(error);
      }
      try {
        await this.artifacts?.close?.();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          "Original Trust worker cleanup failed.",
        );
    })());
  }
  async tick() {
    // Start every claimed lease immediately. Slow purges must not expire a later
    // task's lease in a serial batch or delay the safety-action lane.
    const [tasks, effects] = await Promise.allSettled([
      this.claimTasks(),
      this.claimEffects(),
    ]);
    const errors: unknown[] = [];
    if (tasks.status === "rejected") errors.push(tasks.reason);
    if (effects.status === "rejected") errors.push(effects.reason);
    // A failed lane or acknowledgment must not release sibling operations or
    // allow shutdown to close their pools while their original work continues.
    const settled = await Promise.allSettled([
      ...(tasks.status === "fulfilled"
        ? tasks.value.map((task) => this.runTask(task))
        : []),
      ...(effects.status === "fulfilled"
        ? effects.value.map((effect) => this.runEffect(effect))
        : []),
    ]);
    for (const result of settled)
      if (result.status === "rejected") errors.push(result.reason);
    if (errors.length)
      throw new AggregateError(errors, "Original Trust worker pass failed.");
    await this.pool.query(`UPDATE creator_trust.privacy_job j SET state=CASE
      WHEN NOT EXISTS(SELECT 1 FROM creator_trust.privacy_task t WHERE t.job_id=j.id AND t.state<>'complete') THEN 'complete'
      WHEN EXISTS(SELECT 1 FROM creator_trust.privacy_task t WHERE t.job_id=j.id AND t.state='dead_letter')
        AND NOT EXISTS(SELECT 1 FROM creator_trust.privacy_task t WHERE t.job_id=j.id AND t.state IN('pending','running','retry')) THEN 'dead_letter'
      WHEN EXISTS(SELECT 1 FROM creator_trust.privacy_task t WHERE t.job_id=j.id AND t.state='blocked') THEN 'blocked'
      WHEN EXISTS(SELECT 1 FROM creator_trust.privacy_task t WHERE t.job_id=j.id AND t.state='retry') THEN 'retry'
      ELSE 'running' END,
      completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM creator_trust.privacy_task t WHERE t.job_id=j.id AND t.state<>'complete') THEN coalesce(completed_at,now()) ELSE NULL END,
      updated_at=now() WHERE j.state<>'complete'`);
    await this.sweep();
    const pending = await this.pool.query<{
      count: string;
      age: string | null;
    }>(
      "SELECT count(*),extract(epoch FROM now()-min(available_at)) AS age FROM creator_trust.privacy_task WHERE state IN ('pending','running','retry')",
    );
    this.observe("privacy_queue_count", Number(pending.rows[0]?.count ?? 0));
    this.observe(
      "privacy_queue_age_seconds",
      Math.max(0, Number(pending.rows[0]?.age ?? 0)),
    );
    const health = (
      await this.pool.query(`SELECT
      (SELECT count(*) FROM creator_trust.privacy_task WHERE state='blocked') AS privacy_blocked,
      (SELECT count(*) FROM creator_trust.privacy_task WHERE state='dead_letter') AS privacy_dead_letter,
      (SELECT count(*) FROM creator_trust.privacy_task WHERE state<>'complete' AND error_code='accounting_reconciliation_escalated') AS accounting_escalated,
      (SELECT count(*) FROM creator_trust.privacy_task WHERE state<>'complete' AND error_code='accounting_retention_breach') AS accounting_breached,
      (SELECT count(*) FROM creator_trust.effect WHERE state='blocked') AS effect_blocked,
      (SELECT count(*) FROM creator_trust.effect WHERE state='dead_letter') AS effect_dead_letter,
      (SELECT extract(epoch FROM now()-min(created_at)) FROM creator_trust.effect WHERE state IN ('pending','running','retry')) AS effect_age,
      (SELECT extract(epoch FROM now()-min(created_at)) FROM creator_trust.safety_case WHERE state='urgent') AS urgent_age`)
    ).rows[0];
    this.observe("privacy_blocked_count", Number(health.privacy_blocked));
    this.observe(
      "accounting_reconciliation_escalated_count",
      Number(health.accounting_escalated),
    );
    this.observe(
      "accounting_retention_breach_count",
      Number(health.accounting_breached),
    );
    this.observe(
      "dead_letter_count",
      Number(health.privacy_dead_letter) + Number(health.effect_dead_letter),
    );
    this.observe("effect_blocked_count", Number(health.effect_blocked));
    this.observe(
      "effect_queue_age_seconds",
      Math.max(0, Number(health.effect_age ?? 0)),
    );
    this.observe(
      "safety_urgent_case_age_seconds",
      Math.max(0, Number(health.urgent_age ?? 0)),
    );
    this.observe("worker_pool_waiting", this.pool.waitingCount);
    this.observe("worker_pool_total", this.pool.totalCount);
  }
  private async claimTasks(): Promise<Task[]> {
    const token = randomUUID();
    const rows = await this.pool.query<Task>(
      `WITH picked AS (
      SELECT t.job_id,t.domain FROM creator_trust.privacy_task t JOIN creator_trust.privacy_job j ON j.id=t.job_id
      WHERE ((t.state IN ('pending','retry') AND t.available_at<=now()) OR (t.state='running' AND t.lease_until<now()))
      ORDER BY t.available_at,t.job_id,t.domain LIMIT 2 FOR UPDATE OF t SKIP LOCKED
    ), claimed AS (UPDATE creator_trust.privacy_task t SET state='running',lease_until=now()+interval '60 seconds',lease_token=$1,attempts=attempts+1
      FROM picked p WHERE t.job_id=p.job_id AND t.domain=p.domain RETURNING t.*)
      SELECT c.*,j.kind,j.account_id,j.scope,j.creator_id,j.thread_id FROM claimed c JOIN creator_trust.privacy_job j ON j.id=c.job_id`,
      [token],
    );
    return rows.rows;
  }
  private async runTask(task: Task) {
    const hook = this.privacyHooks.find((h) => h.domain === task.domain);
    if (!hook) {
      await trustTransaction(this.pool, (client) =>
        client.query(
          "UPDATE creator_trust.privacy_task SET state='blocked',error_code='domain_hook_unavailable',lease_until=NULL WHERE job_id=$1 AND domain=$2 AND lease_token=$3 AND state='running'",
          [task.job_id, task.domain, task.lease_token],
        ),
      );
      return;
    }
    try {
      // Owner work, stream exhaustion, durable seal and verification share one
      // deadline. An aborted predecessor cannot finish through the new lease.
      const result = await deadline(async (signal) => {
        const job = {
          jobId: task.job_id,
          kind: task.kind,
          accountId: task.account_id,
          scope: task.scope,
          creatorId: task.creator_id,
          threadId: task.thread_id,
          idempotencyKey: `${task.job_id}:${task.domain}`,
          leaseToken: task.lease_token,
          signal,
        };
        // Missing historical ownership cannot be reconstructed by a hook after
        // identity deletion. This coordinator check only refuses work; each
        // owner still needs its own authority on the actual held client.
        await privacyTaskAuthority(this.pool)(job);
        const result = await hook.run(job);
        signal.throwIfAborted();
        receipt(result.receipt);
        if (result.stream && result.data !== undefined)
          throw new Error("export_stream_invalid");
        const data = result.stream
          ? await consumePrivacyExport({
              job,
              domain: task.domain,
              stream: result.stream,
              store: this.artifacts,
              signal,
              verifyLease: () => privacyTaskAuthority(this.pool)(job),
            })
          : result.data;
        signal.throwIfAborted();
        return {
          receipt: result.stream
            ? { ...result.receipt, artifact: data }
            : result.receipt,
          data,
          retained: result.retained,
        };
      }, 45_000);
      receipt(result.receipt);
      if (task.kind === "export" && result.data === undefined)
        throw new Error("export_artifact_missing");
      const size = Buffer.byteLength(JSON.stringify(result));
      if (size > 4 * 1024 * 1024) throw new Error("artifact_too_large");
      // Acknowledgment has its own real host budget within the original lease.
      // A lost COMMIT response must not downgrade a durable completed task.
      await trustTransaction(this.pool, async (client) => {
        const fenced = await client.query(
          "SELECT 1 FROM creator_trust.privacy_task WHERE job_id=$1 AND domain=$2 AND lease_token=$3 AND state='running' AND lease_until>clock_timestamp() FOR UPDATE",
          [task.job_id, task.domain, task.lease_token],
        );
        if (fenced.rowCount) {
          for (const retained of result.retained ?? [])
            await client.query(
              "INSERT INTO creator_trust.retained_record(job_id,domain,category,until_at,reason) VALUES($1,$2,$3,$4,$5) ON CONFLICT(job_id,domain,category) DO UPDATE SET until_at=$4,reason=$5",
              [
                task.job_id,
                task.domain,
                retained.category,
                retained.until,
                retained.reason,
              ],
            );
          await client.query(
            "UPDATE creator_trust.privacy_task SET state='complete',receipt=$4,data=$5,error_code=NULL,lease_until=NULL,completed_at=now() WHERE job_id=$1 AND domain=$2 AND lease_token=$3",
            [
              task.job_id,
              task.domain,
              task.lease_token,
              JSON.stringify(result.receipt),
              task.kind === "export"
                ? JSON.stringify(result.data ?? null)
                : null,
            ],
          );
        }
      });
    } catch (error) {
      this.reportPrivacyFailure?.(task.domain, task.kind, error);
      const unavailable = [
        "privacy_artifact_unconfigured",
        "privacy_commit_fence_unavailable",
        "privacy_ownership_missing",
        "privacy_original_family_unavailable",
        "growth_held_authority_unavailable",
        "restoration_pending",
        "conversation_privacy_unavailable",
        "comparison_privacy_unavailable",
        "comparison_export_unconfigured",
        "comparison_privacy_composition_changed",
        "comparison_privacy_custody_changed",
        "comparison_artifact_privacy_unavailable",
        "agent_privacy_unavailable",
        "agent_lifecycle_composition_mismatch",
        "privacy_export_pool_mismatch",
        "conversation_lineage_unavailable",
        "conversation_recordings_unavailable",
        "conversation_accounting_unavailable",
        "conversation_provenance_purge_unavailable",
        "conversation_provenance_purge_pool_unconfigured",
        "conversation_provenance_purge_owner_changed",
        "conversation_retention_unavailable",
        "accounting_retention_unconfigured",
        "commerce_privacy_authority_unavailable",
        "commerce_retention_unconfigured",
        "privacy_authority_required",
        "generation_settlement_clock_unavailable",
        "identity_retention_unconfigured",
        "identity_scope_adapter_required",
        "content_retention_unconfigured",
        "content_privacy_purpose_unconfigured",
        "media_retention_unconfigured",
      ];
      const message =
        error instanceof DomainError
          ? error.code
          : error instanceof Error
            ? error.message
            : "";
      const code =
        error instanceof Error &&
        (accountingPrivacyFailure(message) ||
          [
            ...unavailable,
            "comparison_artifact_purge_pending",
            "hook_timeout",
            "privacy_family_cancel_unavailable",
            "privacy_family_rollback_unavailable",
            "conversation_delete_cancel_unavailable",
            "conversation_delete_rollback_unavailable",
            "conversation_delete_release_unavailable",
            "conversation_provenance_purge_cleanup_unavailable",
            "conversation_provenance_purge_receipt_unavailable",
            "conversation_export_cancel_unavailable",
            "conversation_export_rollback_unavailable",
            "conversation_export_release_unavailable",
            "artifact_too_large",
            "receipt_invalid",
            "export_artifact_missing",
            "export_stream_invalid",
            "export_stream_incomplete",
            "export_artifact_invalid",
            "privacy_artifact_unconfigured",
            "privacy_commit_fence_unavailable",
            "trust_connection_budget_unavailable",
            "trust_transaction_unavailable",
            "trust_client_settlement_unavailable",
          ].includes(message))
          ? message
          : "domain_hook_error";
      const accounting = accountingPrivacyFailure(code);
      const artifactPending = code === "comparison_artifact_purge_pending";
      const blocked =
        unavailable.includes(code) && !retryableAuthorityFailure(error);
      const saved = await trustTransaction(this.pool, (client) =>
        client.query(
          "UPDATE creator_trust.privacy_task SET state=$4,error_code=$5,lease_until=NULL,available_at=now()+make_interval(secs=>$6) WHERE job_id=$1 AND domain=$2 AND lease_token=$3 AND state='running'",
          [
            task.job_id,
            task.domain,
            task.lease_token,
            accounting?.state ??
              (blocked
                ? "blocked"
                : task.attempts >= 8 && !artifactPending
                  ? "dead_letter"
                  : "retry"),
            code,
            accounting?.retrySeconds ??
              (artifactPending ? 30 : Math.min(3600, 2 ** task.attempts * 5)),
          ],
        ),
      );
      if (saved.rowCount && !blocked && accounting?.state !== "blocked")
        this.observe("privacy_retry", 1);
    }
  }
  private async claimEffects(): Promise<Effect[]> {
    return (
      await this.pool.query<Effect>(
        `WITH picked AS (SELECT id FROM creator_trust.effect
      WHERE (state IN ('pending','retry') AND available_at<=now()) OR (state='running' AND lease_until<now())
      ORDER BY available_at,created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      UPDATE creator_trust.effect e SET state='running',lease_until=now()+interval '60 seconds',lease_token=$1,attempts=attempts+1 FROM picked p WHERE e.id=p.id RETURNING e.*`,
        [randomUUID()],
      )
    ).rows;
  }
  private async runEffect(effect: Effect) {
    const hook = this.effectHooks.find((h) => h.type === effect.type);
    if (!hook) {
      await trustTransaction(this.pool, (client) =>
        client.query(
          "UPDATE creator_trust.effect SET state='blocked',error_code='effect_hook_unavailable',lease_until=NULL WHERE id=$1 AND lease_token=$2 AND state='running'",
          [effect.id, effect.lease_token],
        ),
      );
      return;
    }
    try {
      const result = await deadline(
        () =>
          hook.run({
            effectId: effect.id,
            caseId: effect.case_id,
            actorAccountId: effect.actor_account_id,
            ...effect.input,
            idempotencyKey: effect.id,
            leaseToken: effect.lease_token,
          }),
        45_000,
      );
      receipt(result.receipt);
      await trustTransaction(this.pool, async (client) => {
        const done = await client.query(
          "UPDATE creator_trust.effect SET state='complete',receipt=$3,lease_until=NULL,error_code=NULL WHERE id=$1 AND lease_token=$2 AND state='running' AND lease_until>clock_timestamp() RETURNING case_id",
          [effect.id, effect.lease_token, JSON.stringify(result.receipt)],
        );
        if (done.rowCount) {
          const cases = await client.query<{
            version: number;
            resolution_reason: string;
            reporter_account_id: string;
            subject_account_id: string | null;
          }>(
            "UPDATE creator_trust.safety_case c SET state='resolved',closed_at=now(),updated_at=now(),version=version+1 WHERE c.id=$1 AND c.state='action_pending' AND NOT EXISTS(SELECT 1 FROM creator_trust.effect e WHERE e.case_id=c.id AND e.state<>'complete') RETURNING version,resolution_reason,reporter_account_id,subject_account_id",
            [effect.case_id],
          );
          const current = cases.rows[0];
          if (current)
            for (const recipient of new Set(
              [current.reporter_account_id, current.subject_account_id].filter(
                Boolean,
              ),
            ))
              await client.query(
                "INSERT INTO creator_trust.notice(recipient_account_id,case_id,type,reason,version) VALUES($1,$2,'resolved',$3,$4) ON CONFLICT DO NOTHING",
                [
                  recipient,
                  effect.case_id,
                  current.resolution_reason,
                  current.version,
                ],
              );
        }
      });
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          "hook_timeout",
          "receipt_invalid",
          "trust_connection_budget_unavailable",
          "trust_transaction_unavailable",
          "trust_client_settlement_unavailable",
        ].includes(error instanceof DomainError ? error.code : error.message)
          ? error instanceof DomainError
            ? error.code
            : error.message
          : "effect_hook_error";
      await trustTransaction(this.pool, (client) =>
        client.query(
          "UPDATE creator_trust.effect SET state=$3,error_code=$5,lease_until=NULL,available_at=now()+make_interval(secs=>$4) WHERE id=$1 AND lease_token=$2 AND state='running'",
          [
            effect.id,
            effect.lease_token,
            effect.attempts >= 8 ? "dead_letter" : "retry",
            Math.min(3600, 2 ** effect.attempts * 5),
            code,
          ],
        ),
      );
    }
  }
  async sweep() {
    await this.artifacts?.sweep?.();
    await this.pool.query(
      "DELETE FROM creator_trust.case_evidence WHERE id IN (SELECT id FROM creator_trust.case_evidence WHERE expires_at<=now() ORDER BY expires_at LIMIT 100)",
    );
    await this.pool.query(
      "DELETE FROM creator_trust.feedback WHERE id IN (SELECT id FROM creator_trust.feedback WHERE expires_at<=now() ORDER BY expires_at LIMIT 100)",
    );
    // Export payloads expire; job receipts remain. Tombstones are never swept.
    await this.pool.query(
      "UPDATE creator_trust.privacy_task t SET data=NULL FROM creator_trust.privacy_job j WHERE j.id=t.job_id AND j.kind='export' AND j.completed_at<now()-interval '7 days' AND t.data IS NOT NULL",
    );
  }
}
/** A missing, empty or explicitly incomplete owner acknowledgment cannot complete a task. */
function receipt(value: unknown) {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (
    !parsed.success ||
    Object.keys(parsed.data).length === 0 ||
    parsed.data.complete === false ||
    parsed.data.done === false ||
    Buffer.byteLength(JSON.stringify(parsed.data)) > 64 * 1024
  )
    throw new Error("receipt_invalid");
}
async function deadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  let completed = false;
  try {
    timer = setTimeout(() => controller.abort(new Error("hook_timeout")), ms);
    timer.unref();
    // The timeout aborts the original signal; it cannot stand in for its
    // completion. Retain that promise through source and artifact settlement.
    const result = await work(controller.signal);
    controller.signal.throwIfAborted();
    completed = true;
    return result;
  } catch (error) {
    if (controller.signal.aborted && error !== controller.signal.reason)
      throw new AggregateError(
        [controller.signal.reason, error],
        "hook_timeout",
      );
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    if (!completed) controller.abort();
  }
}
