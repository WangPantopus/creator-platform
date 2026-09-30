import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import {
  reserveCostAllowance,
  settleCostAllowance,
} from "../access/commerce.js";
import type { GenerationAllowance, ThreadScope } from "../access/scope.js";

/** No schema aliasing: generation.grant_id remains the grant UUID. The distinct
 * reservation UUID is durable in commerce_allowance_reservation, linked by the
 * unique generation key within the same acceptance transaction. */
export class CommerceGenerationAllowance implements GenerationAllowance {
  constructor(private readonly unitsFor: (scope: ThreadScope) => number) {}
  async reserve(scope: ThreadScope, client: PoolClient, generationId: string) {
    const reservation = await reserveCostAllowance(
      client,
      scope,
      `generation:${generationId}`,
      this.unitsFor(scope),
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
      await client.query<{ id: string; grant_id: string }>(
        "SELECT id,grant_id FROM creator.commerce_allowance_reservation WHERE creator_id=$1 AND fan_id=$2 AND key=$3",
        [scope.creatorId, scope.fanId, `generation:${generationId}`],
      )
    ).rows[0];
    invariant(
      row && row.grant_id === grantId,
      "reservation_unavailable",
      "This generation has no matching cost reservation.",
    );
    await settleCostAllowance(client, scope, row.id, consumed);
  }
}
