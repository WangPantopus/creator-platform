import type { Pool, PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import type { AgentRepository, CreatorScope } from "./repository.js";
import type { PreparedGenerationJournal } from "./generation-journal.js";
import { agentPrivacyTransaction } from "./privacy-transaction.js";

// Held above the lineage prerequisite; original reserved SQL stays immutable.
export const USAGE_RETENTION_MIGRATION = "0079_w2_usage_retention_expiry";

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
  ) {}

  static async prepare(
    pool: Pool,
    input: {
      migration: { version: string; checksum: string };
      policyVersion: string;
      authority: UsageExpiryAuthority;
      assertPrivacyRegistered: () => Promise<void>;
    },
  ) {
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
    const migration = (
      await pool.query<{ checksum: string }>(
        "SELECT checksum FROM creator.schema_migration WHERE version=$1",
        [input.migration.version],
      )
    ).rows[0];
    const schema = (
      await pool.query<{ ready: boolean }>(
        `SELECT
          (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='creator' AND table_name='ai_usage' AND column_name IN ('accounting_retained_until','accounting_retention_version','accounting_retention_reason','accounting_disposition_reference'))
          AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='creator.ai_usage'::regclass AND conname='ai_usage_retention_binding' AND convalidated)
          AND EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='creator.ai_usage'::regclass AND c.relname='ai_usage_retention_due' AND i.indisvalid)
          AND (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='creator.ai_usage'::regclass)
          AS ready`,
      )
    ).rows[0];
    invariant(
      migration?.checksum === input.migration.checksum && schema?.ready,
      "accounting_retention_schema_unconfigured",
      "The complete registered accounting retention migration is required.",
    );
    await input.assertPrivacyRegistered();
    const database = (
      await pool.query<{ name: string }>("SELECT current_database() AS name")
    ).rows[0]!.name;
    return Object.freeze(
      new PreparedUsageRetention(
        pool,
        input.migration.checksum,
        database,
        input.policyVersion,
        Object.freeze({
          assertExpiry: input.authority.assertExpiry.bind(input.authority),
        }),
      ),
    );
  }

  async assertClient(client: PoolClient) {
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
    await repository.assertRuntimeRole();
    signal.throwIfAborted();
    return agentPrivacyTransaction(this.pool, signal, async (client) => {
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
      return {
        policyVersion: this.policyVersion,
        expiredIds: expired.rows.map((row) => row.id),
        moreDueKnown: remaining.known,
        unresolvedDueUnknown: remaining.unknown,
      };
    });
  }
}
