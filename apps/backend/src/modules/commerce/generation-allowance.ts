import type { Pool, PoolClient } from "pg";
import { accountingRetentionPolicy } from "../trust/accounting-retention-policy.js";
import {
  assertGenerationSettlementClock,
  knownGenerationRetentionQuery,
} from "./generation-settlement-clock.js";
import { invariant } from "../../core/errors.js";
import {
  reserveCostAllowance,
  settleCostAllowance,
  recordCostAllowanceOutput,
  settleCostAllowanceForPrivacy,
} from "../access/commerce.js";
import { contentHash } from "../../core/canonical.js";
import { z } from "zod";
import {
  isAttributedGenerationJournal,
  ReviewedGenerationCostRule,
} from "./attributed-cost-policy.js";
import type { PreparedGenerationJournal } from "../agent/generation-journal.js";
import {
  ORIGINAL_COST_MIGRATION,
  ORIGINAL_COST_SCHEMA_SHA256,
  assertOriginalCostCustody,
} from "./original-cost-custody.js";
import {
  assertGenerationPrivacyFamily,
  type GenerationCostPrivacyReconciliation,
  type GenerationPrivacyAuthority,
  type GenerationPrivacyConfiguration,
  type GenerationPrivacyFamily,
  type GenerationPrivacyJob,
} from "./generation-privacy.js";
import type {
  AccessService,
  GenerationAllowance,
  ThreadScope,
} from "../access/scope.js";

export interface GenerationCostReconciliation {
  reconcile(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
    grantId: string,
    outputDelivered: boolean,
  ): Promise<void>;
}

export const GENERATION_COST_MIGRATION_VERSION =
  "0049_w4_generation_cost_settlement";

export type GenerationCostReceipt = {
  generationId: string;
  policyVersion: string;
} & (
  | { state: "unknown" }
  | { state: "final"; units: number; reference: string }
);
export interface GenerationCostPolicy {
  /** Version must include the reviewed weighting and reservation ceiling rules. */
  version: string;
  /** Captured at real acceptance by held0106, never a late backfill. */
  originalRule?: Readonly<z.infer<typeof ReviewedGenerationCostRule>>;
  originalRuleMigration?: { version: string; checksum: string };
  reserveUnits(scope: ThreadScope): number;
  /** W2-owned immutable generation/attempt journal receipt, converted using the
   * ORIGINAL reservation policy. Only durable reads in this transaction; no
   * provider I/O, caller JSON, synthetic no-request or inferred zero cost. */
  current(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
    originalPolicyVersion: string,
  ): Promise<GenerationCostReceipt>;
  /** Actual prepared W2 family reader under the same leased W8 authority.
   * Missing lifecycle custody never becomes an interactive scope or zero cost. */
  retentionPolicyVersion?: string;
  currentFamily?(
    client: PoolClient,
    job: GenerationPrivacyJob,
    family: GenerationPrivacyFamily,
    generationId: string,
    originalPolicyVersion: string,
    authority: GenerationPrivacyAuthority,
  ): Promise<GenerationCostReceipt>;
  /** Exact W8 allocation/checksum, supplied after immutable canonical custody. */
  migration: { version: string; checksum: string };
}

/** No schema aliasing: generation.grant_id remains the grant UUID. The distinct
 * reservation UUID is durable in commerce_allowance_reservation, linked by the
 * unique generation key within the same acceptance transaction. */
export class CommerceGenerationAllowance implements GenerationAllowance {
  private constructor(
    private readonly policy: GenerationCostPolicy,
    private readonly database: string,
    private readonly captureOriginalRule: boolean,
    private readonly hostPool: Pool,
    private readonly originalPolicy: GenerationCostPolicy,
  ) {}
  assertComposition(pool: Pool, access: AccessService) {
    invariant(
      pool === this.hostPool &&
        access.isForPool(pool) &&
        access.isGenerationAllowance(this),
      "generation_terminal_allowance_mismatch",
      "Original settlement requires the exact configured canonical allowance owner.",
    );
  }
  assertJournal(journal: PreparedGenerationJournal) {
    journal.assertPool(this.hostPool);
    invariant(
      isAttributedGenerationJournal(this.originalPolicy, journal),
      "generation_accounting_journal_mismatch",
      "Financial reconciliation must read this allowance's original generation journal.",
    );
  }
  /** Only this successfully prepared instance can issue its port. Each call
   * proves identity against the same canonical AccessService and bypasses the
   * legacy fixed-unit method entirely; missing configuration retains the hold. */
  reconciliation(access: AccessService): GenerationCostReconciliation {
    const assertBound = () =>
      invariant(
        access.isGenerationAllowance(this),
        "generation_cost_reconciliation_unavailable",
        "Late cost reconciliation requires this exact configured cost adapter.",
      );
    assertBound();
    return Object.freeze({
      reconcile: async (
        scope: ThreadScope,
        client: PoolClient,
        generationId: string,
        grantId: string,
        outputDelivered: boolean,
      ) => {
        assertBound();
        await this.settle(
          scope,
          client,
          generationId,
          grantId,
          outputDelivered,
        );
      },
    });
  }
  /** Issued only from this prepared adapter, current W8 family authority and
   * registered reviewed retention. The port contains no purge permission. */
  async privacyReconciliation(
    access: AccessService,
    configuration: GenerationPrivacyConfiguration,
  ): Promise<GenerationCostPrivacyReconciliation> {
    const readFamily = this.policy.currentFamily?.bind(this.policy);
    const retentionPolicyVersion = configuration.retentionPolicyVersion;
    invariant(
      access.isGenerationAllowance(this) &&
        readFamily &&
        retentionPolicyVersion.length > 0 &&
        retentionPolicyVersion.length <= 200 &&
        retentionPolicyVersion === this.policy.retentionPolicyVersion &&
        typeof configuration.authority.assertFamily === "function" &&
        typeof configuration.assertPrivacyRegistered === "function",
      "generation_privacy_unconfigured",
      "Financial lifecycle needs the exact prepared reader, family authority and reviewed registration.",
    );
    const authority = Object.freeze({
      assertFamily: configuration.authority.assertFamily.bind(
        configuration.authority,
      ),
    });
    const registered =
      configuration.assertPrivacyRegistered.bind(configuration);
    await registered();
    const assert = async (
      client: PoolClient,
      job: GenerationPrivacyJob,
      family: GenerationPrivacyFamily,
    ) => {
      invariant(
        access.isGenerationAllowance(this),
        "generation_privacy_unavailable",
        "Financial lifecycle requires this exact canonical cost adapter.",
      );
      await registered();
      await assertGenerationPrivacyFamily(client, job, family, authority);
      const ready = (
        await client.query<{ ready: boolean }>(
          `SELECT current_database()=$3 AND NOT r.rolsuper AND NOT r.rolbypassrls
           AND EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='creator' AND c.relname='commerce_allowance_reservation'
             AND c.relrowsecurity AND c.relforcerowsecurity AND c.relowner<>r.oid) AS ready
           FROM pg_roles r WHERE r.rolname=current_user`,
          [
            this.policy.migration.version,
            this.policy.migration.checksum,
            this.database,
          ],
        )
      ).rows[0];
      invariant(
        ready?.ready,
        "generation_privacy_custody_changed",
        "The lifecycle client must use this installed database custody under non-owner RLS.",
      );
      const thread = await client.query(
        "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
        [family.threadId, family.creatorId, family.fanId],
      );
      invariant(
        thread.rowCount === 1,
        "privacy_family_unavailable",
        "The actual financial family is unavailable.",
      );
    };
    const settleGeneration: GenerationCostPrivacyReconciliation["settleGeneration"] =
      async (client, job, family, generation) => {
        z.uuid().parse(generation.id);
        z.uuid().parse(generation.grantId);
        if (generation.reservationId !== null)
          z.uuid().parse(generation.reservationId);
        await assert(client, job, family);
        const actual = (
          await client.query<{
            grant_id: string;
            reservation_id: string | null;
            visible: boolean;
          }>(
            `SELECT grant_id,to_jsonb(g)->>'reservation_id' AS reservation_id,last_sequence>0 AS visible
           FROM creator.generation g WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR UPDATE`,
            [generation.id, family.threadId, family.creatorId, family.fanId],
          )
        ).rows[0];
        invariant(
          actual &&
            actual.grant_id === generation.grantId &&
            actual.reservation_id === generation.reservationId &&
            actual.visible === generation.visible,
          "privacy_generation_mismatch",
          "Use this family's actual persisted generation, grant and visible output.",
        );
        const row = (
          await client.query<{
            id: string;
            cost_policy_version: string | null;
          }>(
            "SELECT id,cost_policy_version FROM creator.commerce_allowance_reservation WHERE creator_id=$1 AND fan_id=$2 AND key=$3 AND grant_id=$4",
            [
              family.creatorId,
              family.fanId,
              `generation:${generation.id}`,
              actual.grant_id,
            ],
          )
        ).rows[0];
        invariant(
          row?.cost_policy_version &&
            (actual.reservation_id === null ||
              actual.reservation_id === row.id),
          "privacy_reservation_unavailable",
          "Retain deletion until this exact original weighted reservation is available.",
        );
        const receipt = await readFamily(
          client,
          job,
          family,
          generation.id,
          row.cost_policy_version,
          authority,
        );
        invariant(
          receipt.generationId === generation.id &&
            receipt.policyVersion === row.cost_policy_version,
          "generation_cost_mismatch",
          "Lifecycle settlement must retain the original generation policy.",
        );
        invariant(
          receipt.state === "final",
          "generation_cost_processing",
          "Unresolved generation cost retains its hold and accounting custody before deletion.",
        );
        await settleCostAllowanceForPrivacy(
          client,
          job,
          family,
          authority,
          generation.id,
          row.id,
          {
            ...receipt,
            outputDelivered: actual.visible,
          },
        );
        await assert(client, job, family);
      };
    return Object.freeze({
      retentionPolicyVersion,
      settleGeneration,
      knownRetention: async (
        client: PoolClient,
        job: GenerationPrivacyJob,
        family: GenerationPrivacyFamily,
        generationIds: readonly string[],
      ) => {
        invariant(
          retentionPolicyVersion === accountingRetentionPolicy.version &&
            generationIds.length > 0 &&
            generationIds.length <= 100 &&
            new Set(generationIds).size === generationIds.length &&
            generationIds.every((id) => z.uuid().safeParse(id).success),
          "accounting_retention_unconfigured",
          "Use the approved retention decision and a complete bounded generation page.",
        );
        await assert(client, job, family);
        await assertGenerationSettlementClock(client, job.signal);
        const { rows } = await client.query<{
          generationId: string;
          settledAt: string;
          accountingUntil: string;
          financialDispositionReference: string;
        }>(knownGenerationRetentionQuery, [
          family.threadId,
          family.creatorId,
          family.fanId,
          generationIds,
          accountingRetentionPolicy.knownCalendarMonths,
        ]);
        invariant(
          rows.length === generationIds.length &&
            new Set(rows.map((row) => row.generationId)).size === rows.length &&
            rows.every((row) => generationIds.includes(row.generationId)),
          "accounting_settlement_time_unavailable",
          "Every known cost requires its actual original financial settlement time; historical dates cannot be invented.",
        );
        await assert(client, job, family);
        await assertGenerationSettlementClock(client, job.signal);
        return Object.freeze(rows.map((row) => Object.freeze(row)));
      },
      disposition: async (
        client: PoolClient,
        job: GenerationPrivacyJob,
        family: GenerationPrivacyFamily,
      ) => {
        await assert(client, job, family);
        const generations = (
          await client.query<{
            id: string;
            reservationId: string | null;
            grantId: string;
            visible: boolean;
          }>(
            `SELECT id,to_jsonb(g)->>'reservation_id' AS "reservationId",grant_id AS "grantId",last_sequence>0 AS visible
             FROM creator.generation g WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY id LIMIT 2001 FOR UPDATE`,
            [family.threadId, family.creatorId, family.fanId],
          )
        ).rows;
        invariant(
          generations.length <= 2000,
          "bounded_subjob_required",
          "Financial disposition requires a complete bounded generation family.",
        );
        // Include terminal generations too: delivered/interrupted can still
        // contain unknown late usage and must not escape the lifecycle fence.
        for (const generation of generations)
          await settleGeneration(client, job, family, generation);
        const reservations = (
          await client.query(
            `SELECT r.id,r.key,r.grant_id,r.units,r.state,r.cost_policy_version,r.settled_units,r.settlement_ref,r.output_delivered,r.pass_id,r.pass_cycle::text
             FROM creator.generation g JOIN creator.commerce_allowance_reservation r
             ON r.creator_id=g.creator_id AND r.fan_id=g.fan_id AND r.grant_id=g.grant_id AND r.key='generation:'||g.id::text
             WHERE g.thread_id=$1 AND g.creator_id=$2 AND g.fan_id=$3 ORDER BY g.id`,
            [family.threadId, family.creatorId, family.fanId],
          )
        ).rows;
        invariant(
          reservations.length === generations.length,
          "privacy_reservation_unavailable",
          "Every persisted generation requires its original financial disposition.",
        );
        await assert(client, job, family);
        return {
          financialDispositionReference: contentHash({
            schemaVersion: 1,
            jobId: job.jobId,
            family,
            retentionPolicyVersion,
            reservations,
          }),
        };
      },
    });
  }
  static async prepare(pool: Pool, policy: GenerationCostPolicy) {
    invariant(
      policy.version.length > 0 &&
        policy.version.length <= 200 &&
        typeof policy.reserveUnits === "function" &&
        typeof policy.current === "function" &&
        policy.migration.version === GENERATION_COST_MIGRATION_VERSION &&
        /^[a-f0-9]{64}$/u.test(policy.migration.checksum),
      "cost_policy_unconfigured",
      "Configure reviewed cost policy and exact canonical migration custody.",
    );
    const migration = (
      await pool.query<{ checksum: string | null }>(
        "SELECT checksum FROM creator.schema_migration WHERE version=$1",
        [policy.migration.version],
      )
    ).rows[0];
    const columns = (
      await pool.query<{ ready: boolean }>(
        `SELECT count(*)=4 AS ready FROM information_schema.columns WHERE table_schema='creator'
         AND table_name='commerce_allowance_reservation'
         AND (column_name,data_type) IN (('cost_policy_version','text'),('settled_units','integer'),('settlement_ref','text'),('output_delivered','boolean'))`,
      )
    ).rows[0];
    invariant(
      migration?.checksum === policy.migration.checksum && columns?.ready,
      "weighted_allowance_schema_unconfigured",
      "Weighted allowance requires its complete registered canonical migration.",
    );
    // Capture the reviewed policy at preparation. Mutating the host's input
    // later must not silently change the version or callbacks for reservations.
    const database = (
      await pool.query<{ name: string }>("SELECT current_database() AS name")
    ).rows[0]!.name;
    const captureOriginalRule =
      (
        await pool.query<{ ready: boolean }>(
          `SELECT EXISTS(SELECT FROM information_schema.columns WHERE table_schema='creator'
         AND table_name='commerce_allowance_reservation' AND column_name='cost_rule' AND data_type='jsonb') AS ready`,
        )
      ).rows[0]?.ready === true;
    const originalRule = policy.originalRule
      ? Object.freeze(ReviewedGenerationCostRule.parse(policy.originalRule))
      : undefined;
    if (captureOriginalRule) {
      const migration = policy.originalRuleMigration;
      invariant(
        migration?.version === ORIGINAL_COST_MIGRATION &&
          migration.checksum === ORIGINAL_COST_SCHEMA_SHA256 &&
          originalRule?.version === policy.version,
        "original_cost_rule_unconfigured",
        "New admissions require their actual original approved cost rule and registered custody.",
      );
      const client = await pool.connect();
      try {
        await assertOriginalCostCustody(client);
      } finally {
        client.release();
      }
    }
    return new CommerceGenerationAllowance(
      Object.freeze({
        ...policy,
        migration: Object.freeze({ ...policy.migration }),
        ...(originalRule ? { originalRule } : {}),
        ...(policy.originalRuleMigration
          ? {
              originalRuleMigration: Object.freeze({
                ...policy.originalRuleMigration,
              }),
            }
          : {}),
      }),
      database,
      captureOriginalRule,
      pool,
      // The factory's WeakMap binds this exact frozen policy to its journal.
      // The defensive execution copy above cannot stand in for that identity.
      policy,
    );
  }
  async reserve(scope: ThreadScope, client: PoolClient, generationId: string) {
    return (await this.reserveGeneration(scope, client, generationId)).grantId;
  }
  /** W3 captures this exact weighted reservation on its accepted generation
   * within the same transaction. A grant UUID alone cannot bind the worker. */
  async reserveGeneration(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
  ) {
    if (this.captureOriginalRule) await assertOriginalCostCustody(client);
    const reservation = await reserveCostAllowance(
      client,
      scope,
      `generation:${generationId}`,
      this.policy.reserveUnits(scope),
      this.policy.version,
      this.captureOriginalRule ? this.policy.originalRule : undefined,
    );
    invariant(
      reservation.state === "reserved",
      "generation_already_settled",
      "This generation allowance was already settled.",
    );
    const row = (
      await client.query<{ grant_id: string }>(
        "SELECT grant_id FROM creator.commerce_allowance_reservation WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        [reservation.id, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    invariant(
      row,
      "reservation_unavailable",
      "Generation allowance is unavailable.",
    );
    return { grantId: row.grant_id, reservationId: reservation.id };
  }
  async settle(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
    grantId: string,
    consumed: boolean,
  ) {
    const row = (
      await client.query<{
        id: string;
        grant_id: string;
        cost_policy_version: string;
      }>(
        "SELECT id,grant_id,cost_policy_version FROM creator.commerce_allowance_reservation WHERE creator_id=$1 AND fan_id=$2 AND key=$3",
        [scope.creatorId, scope.fanId, `generation:${generationId}`],
      )
    ).rows[0];
    invariant(
      row && row.grant_id === grantId,
      "reservation_unavailable",
      "This generation has no matching cost reservation.",
    );
    const receipt = await this.policy.current(
      scope,
      client,
      generationId,
      row.cost_policy_version,
    );
    invariant(
      receipt.generationId === generationId &&
        receipt.policyVersion === row.cost_policy_version,
      "generation_cost_mismatch",
      "Current usage does not match this generation and its original cost policy.",
    );
    await settleCostAllowance(client, scope, row.id, {
      ...receipt,
      outputDelivered: consumed,
    });
  }
  async recordOutput(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
    grantId: string,
  ) {
    const row = (
      await client.query<{ id: string }>(
        "SELECT id FROM creator.commerce_allowance_reservation WHERE creator_id=$1 AND fan_id=$2 AND key=$3 AND grant_id=$4",
        [scope.creatorId, scope.fanId, `generation:${generationId}`, grantId],
      )
    ).rows[0];
    invariant(
      row,
      "reservation_unavailable",
      "This generation has no matching cost reservation.",
    );
    await recordCostAllowanceOutput(client, scope, row.id, grantId);
  }
}
