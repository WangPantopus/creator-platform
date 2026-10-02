import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import type { CreatorScope } from "./repository.js";
import {
  providerUsagePurpose,
  type ProviderExecution,
} from "./provider-usage.js";
import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import type { PrivacyHook } from "../trust/contracts.js";

export type JournalPrivacyFamily = {
  creatorId: string;
  threadId: string;
  fanId: string;
};
export type JournalPrivacyJob = Parameters<PrivacyHook["run"]>[0];
/** Exact structural consumer of W3's ConversationPrivacyAuthority. */
export interface JournalPrivacyAuthority {
  assertFamily(
    client: PoolClient,
    job: JournalPrivacyJob,
    family: JournalPrivacyFamily,
  ): Promise<void>;
}

export const GENERATION_JOURNAL_MIGRATION = "0048_w2_usage_lineage";
export async function generationJournalInstalled(client: PoolClient) {
  const row = (
    await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator' AND c.relname IN ('ai_generation_admission','ai_generation_attempt','ai_generation_receipt')",
    )
  ).rows[0];
  invariant(
    row && ["0", "3"].includes(row.count),
    "usage_journal_schema_incomplete",
    "The generation journal schema is incomplete.",
  );
  return row.count === "3";
}
export type GenerationJournalReceipt = {
  generationId: string;
  custody: "missing" | "open" | "sealed";
  state: "known" | "unknown" | "no_request";
  costMicros: number | null;
  usageIds: string[];
  attemptIds: string[];
  reference: string;
};
type Admission = {
  state: "open" | "sealed";
  thread_id: string;
  fan_id: string;
  actor_account_id: string;
  retention_policy_version: string;
};

/** Host-only preparation. A reserved SQL file is not installed custody, and
 * a policy reference is not an approval supplied by an HTTP caller. The host
 * must register matching C10 retention/export/purge hooks before activation. */
export class PreparedGenerationJournal {
  private constructor(
    private readonly pool: Pool,
    private readonly checksum: string,
    private readonly database: string,
    readonly retentionPolicyVersion: string,
  ) {}
  static async prepare(
    pool: Pool,
    input: {
      migration: { version: string; checksum: string };
      retentionPolicyVersion: string;
      /** Trusted host checks actual owner-hook registration, including account
       * fan relationships and thread exports/deletion, before enabling lineage. */
      assertPrivacyRegistered: () => Promise<void>;
    },
  ) {
    invariant(
      input.migration.version === GENERATION_JOURNAL_MIGRATION &&
        /^[a-f0-9]{64}$/u.test(input.migration.checksum) &&
        input.retentionPolicyVersion.length > 0 &&
        input.retentionPolicyVersion.length <= 200 &&
        typeof input.assertPrivacyRegistered === "function",
      "usage_journal_unconfigured",
      "Exact canonical custody and reviewed thread-accounting retention are required.",
    );
    const migration = (
      await pool.query<{ checksum: string | null }>(
        "SELECT checksum FROM creator.schema_migration WHERE version=$1",
        [input.migration.version],
      )
    ).rows[0];
    const schema = (
      await pool.query<{ ready: boolean }>(
        `SELECT
          (SELECT count(*)=11 FROM information_schema.columns WHERE table_schema='creator' AND table_name='ai_usage' AND column_name IN ('cached_input_tokens','cache_write_input_tokens','creator_hold_id','thread_id','fan_id','generation_id','attempt_id','call_ordinal','purpose','provider_state','completed_at'))
          AND (SELECT count(*)=3 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator' AND c.relname IN ('ai_generation_admission','ai_generation_attempt','ai_generation_receipt') AND c.relrowsecurity AND c.relforcerowsecurity)
          AS ready`,
      )
    ).rows[0];
    invariant(
      migration?.checksum === input.migration.checksum && schema?.ready,
      "usage_journal_schema_unconfigured",
      "The complete registered usage journal migration is required.",
    );
    await input.assertPrivacyRegistered();
    const database = (
      await pool.query<{ name: string }>("SELECT current_database() AS name")
    ).rows[0]!.name;
    const journal = new PreparedGenerationJournal(
      pool,
      input.migration.checksum,
      database,
      input.retentionPolicyVersion,
    );
    Object.freeze(journal);
    return journal;
  }
  assertPool(pool: Pool) {
    invariant(
      pool === this.pool,
      "usage_journal_pool_mismatch",
      "Attach this prepared journal to its actual verified service pool.",
    );
  }
  async assertClient(client: PoolClient) {
    const ready = (
      await client.query(
        "SELECT version FROM creator.schema_migration WHERE version=$1 AND checksum=$2 AND current_database()=$3",
        [GENERATION_JOURNAL_MIGRATION, this.checksum, this.database],
      )
    ).rowCount;
    invariant(
      ready,
      "usage_journal_custody_changed",
      "The callback client must share this journal's installed database custody.",
    );
  }
  /** W3 calls once INSIDE the actual generation acceptance transaction, before
   * queuing any worker. Never adopt a pre-migration retry as an empty history. */
  async initializeGeneration(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
  ) {
    assertThreadScope(scope);
    z.uuid().parse(generationId);
    await this.assertClient(client);
    await this.workspace(client, scope.creatorId);
    await client.query(
      "INSERT INTO creator.ai_generation_admission(creator_id,generation_id,thread_id,fan_id,actor_account_id,retention_policy_version) VALUES($1,$2,$3,$4,$5,$6)",
      [
        scope.creatorId,
        generationId,
        scope.threadId,
        scope.fanId,
        scope.actorAccountId,
        this.retentionPolicyVersion,
      ],
    );
  }
  private async workspace(client: PoolClient, creatorId: string) {
    const row = await client.query(
      "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 AND deleted_at IS NULL FOR SHARE",
      [creatorId],
    );
    invariant(
      row.rowCount,
      "ai_deleted",
      "The current AI workspace is required.",
    );
  }
  private async lock(
    client: PoolClient,
    creatorId: string,
    generationId: string,
  ) {
    return (
      await client.query<Admission>(
        "SELECT state,thread_id,fan_id,actor_account_id,retention_policy_version FROM creator.ai_generation_admission WHERE creator_id=$1 AND generation_id=$2 FOR UPDATE",
        [creatorId, generationId],
      )
    ).rows[0];
  }
  private matches(
    scope: Pick<
      ThreadScope,
      "creatorId" | "threadId" | "fanId" | "actorAccountId"
    >,
    row: Admission | undefined,
    admittingActor = false,
  ) {
    invariant(
      row &&
        row.thread_id === scope.threadId &&
        row.fan_id === scope.fanId &&
        (!admittingActor || row.actor_account_id === scope.actorAccountId) &&
        row.retention_policy_version === this.retentionPolicyVersion,
      "generation_journal_mismatch",
      "The canonical accepted generation and reviewed retention must match this scope.",
    );
    return row;
  }
  /** Actual W3 admission callback, after its current lease/authority checks.
   * A new token closes abandoned attempts; their unknown calls stay in totals. */
  async beginAttempt(
    scope: ThreadScope,
    client: PoolClient,
    execution: ProviderExecution,
    creatorHoldId: string,
  ) {
    assertThreadScope(scope);
    z.uuid().parse(execution.generationId);
    z.uuid().parse(execution.attemptId);
    z.uuid().parse(creatorHoldId);
    providerUsagePurpose("reply", execution);
    const purpose = execution.purpose ?? "reply";
    invariant(
      !execution.purpose || execution.assertPurposeInTransaction,
      "execution_purpose_authority_required",
      "An explicit execution purpose requires its genuine accepted job authority.",
    );
    await this.assertClient(client);
    await execution.assertPurposeInTransaction?.(client, purpose);
    await this.workspace(client, scope.creatorId);
    const row = this.matches(
      scope,
      await this.lock(client, scope.creatorId, execution.generationId),
      true,
    );
    invariant(
      row.state === "open",
      "generation_admission_closed",
      "This generation is sealed.",
    );
    const hold = await client.query(
      "SELECT id FROM creator.ai_cost_hold WHERE id=$1 AND creator_id=$2 AND state='held' AND expires_at>now()",
      [creatorHoldId, scope.creatorId],
    );
    invariant(
      hold.rowCount,
      "creator_cost_hold_required",
      "The matching current creator hold is required.",
    );
    await client.query(
      "UPDATE creator.ai_generation_attempt SET state='abandoned',closed_at=clock_timestamp() WHERE creator_id=$1 AND generation_id=$2 AND state='open'",
      [scope.creatorId, execution.generationId],
    );
    await client.query(
      "INSERT INTO creator.ai_generation_attempt(creator_id,generation_id,attempt_id,thread_id,fan_id,creator_hold_id) VALUES($1,$2,$3,$4,$5,$6)",
      [
        scope.creatorId,
        execution.generationId,
        execution.attemptId,
        scope.threadId,
        scope.fanId,
        creatorHoldId,
      ],
    );
  }
  /** Runs under the caller's canonical W3 admission lock. No remote I/O. */
  async open(
    client: PoolClient,
    scope: CreatorScope,
    input: {
      versionHash: string;
      model: string;
      category: string;
      purpose?: string;
    },
    execution?: ProviderExecution,
  ) {
    await this.assertClient(client);
    const purpose = providerUsagePurpose(input.category, execution);
    invariant(
      input.purpose === undefined || input.purpose === purpose,
      "execution_purpose_changed",
      "Provider admission must retain its captured purpose.",
    );
    if (execution?.purpose) {
      invariant(
        execution.assertPurposeInTransaction,
        "execution_purpose_authority_required",
        "An explicit execution purpose requires its actual held job authority.",
      );
      await execution.assertPurposeInTransaction(client, execution.purpose);
    }
    await this.workspace(client, scope.creatorId);
    let lineage:
      | {
          thread_id: string;
          fan_id: string;
          ordinal: number;
          creator_hold_id: string;
        }
      | undefined;
    if (execution) {
      const admission = await this.lock(
        client,
        scope.creatorId,
        execution.generationId,
      );
      invariant(
        admission?.state === "open",
        "generation_admission_closed",
        "An initialized open generation journal is required.",
      );
      lineage = (
        await client.query<{
          thread_id: string;
          fan_id: string;
          ordinal: number;
          creator_hold_id: string;
        }>(
          "UPDATE creator.ai_generation_attempt SET provider_admissions=provider_admissions+1 WHERE creator_id=$1 AND generation_id=$2 AND attempt_id=$3 AND state='open' RETURNING thread_id,fan_id,provider_admissions AS ordinal,creator_hold_id",
          [scope.creatorId, execution.generationId, execution.attemptId],
        )
      ).rows[0];
      invariant(
        lineage,
        "generation_attempt_unavailable",
        "The actual open generation attempt is required.",
      );
    }
    const row = await client.query<{ id: string }>(
      `INSERT INTO creator.ai_usage(creator_id,version_hash,provider,model,input_tokens,output_tokens,cost_micros,category,duration_ms,thread_id,fan_id,generation_id,attempt_id,call_ordinal,purpose,provider_state,creator_hold_id)
       VALUES($1,$2,'configured',$3,0,0,NULL,$4,0,$5,$6,$7,$8,$9,$11,'admitted',$10) RETURNING id`,
      [
        scope.creatorId,
        input.versionHash,
        input.model,
        input.category,
        lineage?.thread_id ?? null,
        lineage?.fan_id ?? null,
        execution?.generationId ?? null,
        execution?.attemptId ?? null,
        lineage?.ordinal ?? null,
        lineage?.creator_hold_id ?? null,
        purpose,
      ],
    );
    return row.rows[0]!.id;
  }
  /** Completion does not require a still-current thread lease: already admitted
   * provider charges survive revoke/cancel. Sealed uncertainty can reconcile. */
  async finish(
    client: PoolClient,
    scope: CreatorScope,
    id: string,
    usage: Usage,
    durationMs: number,
  ) {
    await this.assertClient(client);
    const existing = (
      await client.query<{ generation_id: string | null }>(
        "SELECT generation_id FROM creator.ai_usage WHERE creator_id=$1 AND id=$2",
        [scope.creatorId, id],
      )
    ).rows[0];
    invariant(
      existing,
      "usage_journal_missing",
      "The admitted usage row is required.",
    );
    const admission = existing.generation_id
      ? await this.lock(client, scope.creatorId, existing.generation_id)
      : undefined;
    const updated = await client.query(
      `UPDATE creator.ai_usage SET provider=$3,model=$4,input_tokens=$5,output_tokens=$6,cost_micros=$7,duration_ms=$8,cached_input_tokens=$9,cache_write_input_tokens=$10,provider_state='completed',completed_at=clock_timestamp()
       WHERE creator_id=$1 AND id=$2 AND provider_state='admitted' RETURNING id`,
      [
        scope.creatorId,
        id,
        usage.provider,
        usage.model,
        usage.inputTokens,
        usage.outputTokens,
        usage.costMicros,
        durationMs,
        usage.cachedInputTokens ?? null,
        usage.cacheWriteInputTokens ?? null,
      ],
    );
    invariant(
      updated.rowCount,
      "usage_already_completed",
      "This admitted call already completed.",
    );
    if (existing.generation_id && admission?.state === "sealed")
      await this.appendReceipt(
        client,
        scope.creatorId,
        existing.generation_id,
        admission,
      );
  }
  /** W3 terminal transaction after main generation AND memory extraction.
   * Queued cancellation can also close a genuinely initialized zero-call fence. */
  async seal(scope: ThreadScope, client: PoolClient, generationId: string) {
    assertThreadScope(scope);
    await this.assertClient(client);
    return this.closeInitialized(scope, client, generationId);
  }
  private async closeInitialized(
    scope: JournalPrivacyFamily & { actorAccountId: string },
    client: PoolClient,
    generationId: string,
  ) {
    // Complete export and provider completion use this same lock order.
    await client.query(
      "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
      [scope.creatorId],
    );
    const existing = await this.lock(client, scope.creatorId, generationId);
    if (!existing) return this.unknown(generationId, "missing");
    const admission = this.matches(scope, existing);
    await client.query(
      "UPDATE creator.ai_generation_attempt SET state='sealed',closed_at=clock_timestamp() WHERE creator_id=$1 AND generation_id=$2 AND state='open'",
      [scope.creatorId, generationId],
    );
    await client.query(
      "UPDATE creator.ai_generation_admission SET state='sealed',sealed_at=coalesce(sealed_at,clock_timestamp()) WHERE creator_id=$1 AND generation_id=$2",
      [scope.creatorId, generationId],
    );
    return this.appendReceipt(client, scope.creatorId, generationId, admission);
  }
  /** Explicit canonical cleanup API: missing legacy custody remains unknown
   * and does not block creator stop, mint a fence, or release an allowance. */
  async sealIfInitialized(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
  ) {
    return this.seal(scope, client, generationId);
  }
  async assertPrivacyFamily(
    client: PoolClient,
    job: JournalPrivacyJob,
    family: JournalPrivacyFamily,
    authority: JournalPrivacyAuthority,
  ) {
    z.uuid().parse(job.jobId);
    z.uuid().parse(job.accountId);
    z.uuid().parse(job.leaseToken);
    z.uuid().parse(family.creatorId);
    z.uuid().parse(family.threadId);
    z.uuid().parse(family.fanId);
    invariant(
      (job.creatorId === null || job.creatorId === family.creatorId) &&
        (job.threadId === null || job.threadId === family.threadId),
      "privacy_scope_mismatch",
      "This family must match the actual verified job.",
    );
    await authority.assertFamily(client, job, family);
    await this.assertClient(client);
    await client.query(
      "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
      [family.creatorId, family.fanId, job.accountId],
    );
  }
  /** Actual W8 job family, never an invented interactive ThreadScope. */
  async sealFamily(
    client: PoolClient,
    job: JournalPrivacyJob,
    family: JournalPrivacyFamily,
    generationId: string,
    authority: JournalPrivacyAuthority,
  ) {
    invariant(
      job.kind === "delete",
      "privacy_kind_mismatch",
      "Only verified deletion can close a privacy generation.",
    );
    await this.assertPrivacyFamily(client, job, family, authority);
    const receipt = await this.closeInitialized(
      { ...family, actorAccountId: job.accountId },
      client,
      generationId,
    );
    await authority.assertFamily(client, job, family);
    return receipt;
  }
  private async appendReceipt(
    client: PoolClient,
    creatorId: string,
    generationId: string,
    admission: Admission,
  ) {
    const attempts = (
      await client.query<{
        attempt_id: string;
        provider_admissions: number;
        state: string;
        creator_hold_id: string;
      }>(
        "SELECT attempt_id,provider_admissions,state,creator_hold_id FROM creator.ai_generation_attempt WHERE creator_id=$1 AND generation_id=$2 ORDER BY attempt_id",
        [creatorId, generationId],
      )
    ).rows;
    const usage = (
      await client.query<{
        id: string;
        attempt_id: string;
        call_ordinal: number;
        provider_state: string;
        cost_micros: string | null;
        input_tokens: number;
        output_tokens: number;
        cached_input_tokens: number | null;
        cache_write_input_tokens: number | null;
        purpose: string;
        version_hash: string;
        provider: string;
        model: string;
      }>(
        "SELECT id,attempt_id,call_ordinal,provider_state,cost_micros::text,input_tokens,output_tokens,cached_input_tokens,cache_write_input_tokens,purpose,version_hash,provider,model FROM creator.ai_usage WHERE creator_id=$1 AND generation_id=$2 ORDER BY attempt_id,call_ordinal",
        [creatorId, generationId],
      )
    ).rows;
    const complete = attempts.every((attempt) => {
      const calls = usage.filter(
        (item) => item.attempt_id === attempt.attempt_id,
      );
      return (
        attempt.state !== "open" &&
        calls.length === attempt.provider_admissions &&
        calls.every(
          (call, index) =>
            call.call_ordinal === index + 1 &&
            call.provider_state === "completed" &&
            call.cost_micros !== null &&
            BigInt(call.cost_micros) >= 0n,
        )
      );
    });
    const total = usage.reduce(
      (sum, call) => sum + BigInt(call.cost_micros ?? 0),
      0n,
    );
    const known =
      complete && total >= 0n && total <= BigInt(Number.MAX_SAFE_INTEGER);
    const state = known ? (usage.length ? "known" : "no_request") : "unknown";
    const costMicros = known ? Number(total) : null;
    const receiptHash = contentHash({
      creatorId,
      generationId,
      threadId: admission.thread_id,
      fanId: admission.fan_id,
      retentionPolicyVersion: admission.retention_policy_version,
      state,
      costMicros,
      attempts,
      usage,
    });
    const appended = await client.query<{ id: string; revision: number }>(
      `INSERT INTO creator.ai_generation_receipt(creator_id,generation_id,thread_id,fan_id,state,cost_micros,usage_ids,attempt_ids,receipt_hash,revision)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce(max(revision),0)+1 FROM creator.ai_generation_receipt WHERE creator_id=$1 AND generation_id=$2
       ON CONFLICT(creator_id,generation_id,receipt_hash) DO NOTHING RETURNING id,revision`,
      [
        creatorId,
        generationId,
        admission.thread_id,
        admission.fan_id,
        state,
        costMicros,
        usage.map((call) => call.id),
        attempts.map((attempt) => attempt.attempt_id),
        receiptHash,
      ],
    );
    if (appended.rowCount) {
      // Durable wakeup only. W4 must read current immutable custody and the
      // original reservation policy, never settle from event/caller amounts.
      await client.query(
        "INSERT INTO creator.ai_event(creator_id,type,revision,payload) SELECT $1,'ai.generation_receipt',revision,$2 FROM creator.ai_workspace WHERE creator_id=$1",
        [
          creatorId,
          {
            schemaVersion: 1,
            generationId,
            threadId: admission.thread_id,
            fanId: admission.fan_id,
            receiptId: appended.rows[0]!.id,
            receiptHash,
            receiptRevision: appended.rows[0]!.revision,
            state,
          },
        ],
      );
    }
    if (known) {
      const holds = attempts.map((attempt) => attempt.creator_hold_id);
      await client.query(
        "UPDATE creator.ai_cost_hold SET state='settled' WHERE creator_id=$1 AND id=ANY($2::uuid[]) AND state IN ('held','released')",
        [creatorId, holds],
      );
      // These rows are uncertainty markers for a hold, not remote requests.
      // The sealed all-attempt receipt proves all actual charges are already
      // present exactly once. Never adopt/rewrite an unbound legacy marker.
      await client.query(
        "UPDATE creator.ai_usage SET cost_micros=0,purpose='cost_hold_reconciled' WHERE creator_id=$1 AND creator_hold_id=ANY($2::uuid[]) AND category='provider_unknown' AND provider_state IS NULL AND input_tokens=0 AND output_tokens=0 AND cost_micros IS NULL",
        [creatorId, holds],
      );
    }
    return {
      generationId,
      custody: "sealed",
      state,
      costMicros,
      usageIds: usage.map((call) => call.id),
      attemptIds: attempts.map((attempt) => attempt.attempt_id),
      reference: receiptHash,
    } satisfies GenerationJournalReceipt;
  }
  /** W4 reads in its existing settlement transaction using ORIGINAL weighting.
   * No record/open fence is unknown, never an inferred no-request receipt. */
  async current(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
  ): Promise<GenerationJournalReceipt> {
    assertThreadScope(scope);
    await this.assertClient(client);
    return this.readCurrent(scope, client, generationId);
  }
  async currentFamily(
    client: PoolClient,
    job: JournalPrivacyJob,
    family: JournalPrivacyFamily,
    generationId: string,
    authority: JournalPrivacyAuthority,
  ) {
    await this.assertPrivacyFamily(client, job, family, authority);
    return this.readCurrent(
      { ...family, actorAccountId: job.accountId },
      client,
      generationId,
    );
  }
  private async readCurrent(
    scope: JournalPrivacyFamily & { actorAccountId: string },
    client: PoolClient,
    generationId: string,
  ): Promise<GenerationJournalReceipt> {
    const admission = await this.lock(client, scope.creatorId, generationId);
    if (!admission) return this.unknown(generationId, "missing");
    this.matches(scope, admission);
    const row =
      admission.state === "sealed"
        ? (
            await client.query<{
              state: GenerationJournalReceipt["state"];
              cost_micros: string | null;
              usage_ids: string[];
              attempt_ids: string[];
              receipt_hash: string;
            }>(
              "SELECT state,cost_micros::text,usage_ids,attempt_ids,receipt_hash FROM creator.ai_generation_receipt WHERE creator_id=$1 AND generation_id=$2 ORDER BY revision DESC LIMIT 1",
              [scope.creatorId, generationId],
            )
          ).rows[0]
        : undefined;
    return row
      ? {
          generationId,
          custody: "sealed",
          state: row.state,
          costMicros: row.cost_micros === null ? null : Number(row.cost_micros),
          usageIds: row.usage_ids,
          attemptIds: row.attempt_ids,
          reference: row.receipt_hash,
        }
      : this.unknown(generationId, admission.state);
  }
  private unknown(
    generationId: string,
    custody: GenerationJournalReceipt["custody"],
  ): GenerationJournalReceipt {
    return {
      generationId,
      custody,
      state: "unknown",
      costMicros: null,
      usageIds: [],
      attemptIds: [],
      reference: "",
    };
  }
}
