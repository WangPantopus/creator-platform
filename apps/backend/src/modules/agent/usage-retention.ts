import type { Pool, PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import type { AgentRepository, CreatorScope } from "./repository.js";
import type { PreparedGenerationJournal } from "./generation-journal.js";
import { agentPrivacyTransaction } from "./privacy-transaction.js";
import { unresolvedAccountingInTransaction } from "./accounting-uncertainty.js";
import { agentPreparationRead } from "./preparation-read.js";
import { assertAccountingRetentionIntegrity } from "./retention-integrity.js";
import { assertAccountDetachedUsageCatalogue } from "../trust/account-detached-usage-catalogue.js";
import { accountingRetentionPolicy } from "../trust/accounting-retention-policy.js";

// Held above the lineage prerequisite; original reserved SQL stays immutable.
export const USAGE_RETENTION_MIGRATION = "0165_w2_usage_retention_expiry";

/** W8 supplies current persisted job/lease and policy authority. Owning a
 * creator scope or knowing a policy name alone does not authorize expiry. */
export interface UsageExpiryAuthority {
  assertExpiry(
    client: PoolClient,
    scope: CreatorScope,
    policyVersion: string,
  ): Promise<void>;
}

/** Prepared on the actual canonical database after export, family detachment
 * and expiry registration. Reserved SQL and a policy string cannot activate it. */
export class PreparedUsageRetention {
  private constructor(
    private readonly pool: Pool,
    private readonly checksum: string,
    private readonly database: string,
    readonly policyVersion: string,
    private readonly authority: UsageExpiryAuthority,
    private readonly authorityOwner: UsageExpiryAuthority,
    private readonly assertPrivacyRegistered: () => Promise<void>,
  ) {}

  static async prepare(
    pool: Pool,
    input: {
      migration: { version: string; checksum: string };
      policyVersion: string;
      authority: UsageExpiryAuthority;
      assertPrivacyRegistered: () => Promise<void>;
      signal?: AbortSignal;
    },
  ): Promise<PreparedUsageRetention> {
    invariant(
      input.migration.version === USAGE_RETENTION_MIGRATION &&
        /^[a-f0-9]{64}$/u.test(input.migration.checksum) &&
        input.policyVersion.length > 0 &&
        input.policyVersion.length <= 200 &&
        typeof input.authority?.assertExpiry === "function" &&
        typeof input.assertPrivacyRegistered === "function",
      "accounting_retention_unconfigured",
      "Exact installed retention custody, current expiry authority and registered privacy consumers are required.",
    );
    const { migration, schema, database } = await agentPreparationRead(
      pool,
      async (client) => {
        await assertAccountingRetentionIntegrity(client, input.signal);
        const migration = (
          await client.query<{ checksum: string }>(
            "SELECT checksum FROM creator.schema_migration WHERE version=$1",
            [input.migration.version],
          )
        ).rows[0];
        const schema = (
          await client.query<{ ready: boolean }>(
            `SELECT
          (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='creator' AND table_name='ai_usage' AND column_name IN ('accounting_retained_until','accounting_retention_version','accounting_retention_reason','accounting_disposition_reference'))
          AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='creator.ai_usage'::regclass AND conname='ai_usage_retention_binding' AND convalidated)
          AND EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='creator.ai_usage'::regclass AND c.relname='ai_usage_retention_due' AND i.indisvalid)
          AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='creator.ai_usage'::regclass)
          AS ready`,
          )
        ).rows[0];
        const database = (
          await client.query<{ name: string }>(
            "SELECT current_database() AS name",
          )
        ).rows[0]!.name;
        return { migration, schema, database };
      },
      input.signal,
    );
    invariant(
      migration?.checksum === input.migration.checksum && schema?.ready,
      "accounting_retention_schema_unconfigured",
      "The complete registered accounting retention migration is required.",
    );
    input.signal?.throwIfAborted();
    await input.assertPrivacyRegistered();
    input.signal?.throwIfAborted();
    const retention = new PreparedUsageRetention(
      pool,
      input.migration.checksum,
      database,
      input.policyVersion,
      Object.freeze({
        assertExpiry: input.authority.assertExpiry.bind(input.authority),
      }),
      input.authority,
      input.assertPrivacyRegistered,
    );
    Object.freeze(retention);
    return retention;
  }

  async assertClient(client: PoolClient) {
    await this.assertPrivacyRegistered();
    await assertAccountingRetentionIntegrity(client);
    const ready = await client.query(
      "SELECT version FROM creator.schema_migration WHERE version=$1 AND checksum=$2 AND current_database()=$3",
      [USAGE_RETENTION_MIGRATION, this.checksum, this.database],
    );
    invariant(
      ready.rowCount,
      "accounting_retention_custody_changed",
      "Retained usage requires the same installed database custody.",
    );
  }

  assertJournal(journal: PreparedGenerationJournal) {
    journal.assertPool(this.pool);
    invariant(
      journal.retentionPolicyVersion === this.policyVersion,
      "accounting_retention_policy_mismatch",
      "Journal and expiry must use the same registered retention policy.",
    );
  }

  assertExpiryOwner(pool: Pool, authority: UsageExpiryAuthority) {
    invariant(
      this.pool === pool && this.authorityOwner === authority,
      "accounting_expiry_composition_mismatch",
      "Expiry must retain this producer's original pool and authority.",
    );
  }

  /** The original W8 account-delete scope is checked inside the actual DELETE
   * trigger too. Its private accounting copy and aggregate receipt commit with
   * the creator purge; replay neither copies an identity nor resets a date. */
  async detachAccount(
    client: PoolClient,
    scope: CreatorScope,
    assertTask: (client: PoolClient) => Promise<void>,
    signal: AbortSignal,
  ) {
    invariant(
      !scope.development &&
        this.policyVersion === accountingRetentionPolicy.version,
      "account_detached_usage_unconfigured",
      "Use the approved original account deletion and accounting policy.",
    );
    signal.throwIfAborted();
    await this.assertClient(client);
    await assertAccountDetachedUsageCatalogue(client, signal);
    for (;;) {
      await assertTask(client);
      signal.throwIfAborted();
      const deleted = await client.query(
        `WITH page AS (
          SELECT id FROM creator.ai_usage WHERE creator_id=$1
           AND accounting_retained_until IS NOT NULL AND cost_micros IS NOT NULL
          ORDER BY id LIMIT 100 FOR UPDATE
        ) DELETE FROM creator.ai_usage u USING page WHERE u.creator_id=$1 AND u.id=page.id RETURNING u.id`,
        [scope.creatorId],
      );
      await assertTask(client);
      signal.throwIfAborted();
      if (!deleted.rowCount) break;
    }
    const remaining = await client.query(
      "SELECT 1 FROM creator.ai_usage WHERE creator_id=$1 LIMIT 1",
      [scope.creatorId],
    );
    invariant(
      !remaining.rowCount,
      "accounting_cleanup_pending",
      "No creator-linked accounting may remain after account detachment.",
    );
    const { rows } = await client.query<{
      records: string;
      original_until: string;
    }>("SELECT * FROM creator_trust.account_detached_usage_summary($1)", [
      scope.creatorId,
    ]);
    invariant(
      rows.length <= 1 &&
        rows.every(
          (row) =>
            /^[1-9][0-9]*$/.test(row.records) &&
            Number.isFinite(Date.parse(row.original_until)),
        ),
      "accounting_detachment_receipt_unavailable",
      "The original aggregate accounting disposition must remain available.",
    );
    await assertAccountDetachedUsageCatalogue(client, signal);
    await assertTask(client);
    signal.throwIfAborted();
    return rows.map((row) => ({
      policyVersion: this.policyVersion,
      records: row.records,
      unknown: false,
      until: new Date(row.original_until).toISOString(),
      reason:
        "Known provider costs retain their original amounts and references for twelve UTC calendar months from original settlement, without account identity or private text.",
    }));
  }

  /** A bounded producer for W8's actual expiry worker. Current owner or a
   * tombstone is required after actual immutable ownership/lease authority.
   * It never creates a workspace, including after creator erasure.
   * Unknown costs remain closed until actual reconciliation; an expiry date
   * must never silently erase the marker that keeps a creator cap closed. */
  async expire(
    repository: AgentRepository,
    scope: CreatorScope,
    batchSize = 200,
    signal: AbortSignal,
  ) {
    invariant(
      repository.pool === this.pool &&
        signal instanceof AbortSignal &&
        Number.isSafeInteger(batchSize) &&
        batchSize > 0 &&
        batchSize <= 2000,
      "accounting_expiry_unconfigured",
      "Use the prepared repository pool and a bounded expiry batch.",
    );
    signal.throwIfAborted();
    return agentPrivacyTransaction(this.pool, signal, async (client) => {
      await repository.assertRuntimeRoleInTransaction(client);
      signal.throwIfAborted();
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
        [scope.creatorId, scope.accountId],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`agent.purge:${scope.creatorId}`],
      );
      await this.assertClient(client);
      await this.authority.assertExpiry(client, scope, this.policyVersion);
      const owner = await client.query(
        "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
        [scope.creatorId, scope.accountId],
      );
      const tombstone = await client.query(
        "SELECT 1 FROM creator.ai_tombstone WHERE creator_id=$1",
        [scope.creatorId],
      );
      invariant(
        owner.rowCount || tombstone.rowCount,
        "accounting_expiry_owner_changed",
        "Current ownership or the verified deletion tombstone must match the expiry job.",
      );
      await client.query(
        "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
        [scope.creatorId],
      );
      const expired = await client.query<{ id: string }>(
        `WITH due AS (
          SELECT id FROM creator.ai_usage WHERE creator_id=$1
            AND accounting_retention_version=$2 AND accounting_retained_until<=now()
            AND cost_micros IS NOT NULL AND created_at<date_trunc('day',now())
          ORDER BY accounting_retained_until,id LIMIT $3 FOR UPDATE
        ) DELETE FROM creator.ai_usage u USING due WHERE u.creator_id=$1 AND u.id=due.id RETURNING u.id`,
        [scope.creatorId, this.policyVersion, batchSize],
      );
      const remaining = (
        await client.query<{ known: boolean; unknown: boolean }>(
          `SELECT
            EXISTS (SELECT 1 FROM creator.ai_usage WHERE creator_id=$1 AND accounting_retention_version=$2 AND accounting_retained_until<=now() AND cost_micros IS NOT NULL AND created_at<date_trunc('day',now())) AS known,
            EXISTS (SELECT 1 FROM creator.ai_usage WHERE creator_id=$1 AND accounting_retention_version=$2 AND accounting_retained_until<=now() AND cost_micros IS NULL) AS unknown`,
          [scope.creatorId, this.policyVersion],
        )
      ).rows[0]!;
      await this.authority.assertExpiry(client, scope, this.policyVersion);
      const unresolvedAccounting = await unresolvedAccountingInTransaction(
        client,
        scope.creatorId,
        undefined,
        signal,
      );
      await this.authority.assertExpiry(client, scope, this.policyVersion);
      return {
        policyVersion: this.policyVersion,
        expiredIds: expired.rows.map((row) => row.id),
        moreDueKnown: remaining.known,
        unresolvedDueUnknown: remaining.unknown,
        unresolvedAccounting,
      };
    });
  }
}
