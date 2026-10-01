import type { Pool, PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import {
  reserveCostAllowance,
  settleCostAllowance,
  recordCostAllowanceOutput,
} from "../access/commerce.js";
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
  /** Exact W8 allocation/checksum, supplied after immutable canonical custody. */
  migration: { version: string; checksum: string };
}

/** No schema aliasing: generation.grant_id remains the grant UUID. The distinct
 * reservation UUID is durable in commerce_allowance_reservation, linked by the
 * unique generation key within the same acceptance transaction. */
export class CommerceGenerationAllowance implements GenerationAllowance {
  private constructor(private readonly policy: GenerationCostPolicy) {}
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
    return new CommerceGenerationAllowance(
      Object.freeze({
        ...policy,
        migration: Object.freeze({ ...policy.migration }),
      }),
    );
  }
  async reserve(scope: ThreadScope, client: PoolClient, generationId: string) {
    const reservation = await reserveCostAllowance(
      client,
      scope,
      `generation:${generationId}`,
      this.policy.reserveUnits(scope),
      this.policy.version,
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
    return row.grant_id;
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
