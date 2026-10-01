import type { PoolClient } from "pg";
import type { ThreadScope } from "../access/scope.js";
import {
  reserveCostAllowance,
  settleCostAllowance,
} from "../access/commerce.js";
import { invariant } from "../../core/errors.js";

export interface ConversationAllowance {
  reserve(
    scope: ThreadScope,
    client: PoolClient,
    key: string,
  ): Promise<{ grantId: string; reservationId: string }>;
  settle(
    scope: ThreadScope,
    client: PoolClient,
    reservationId: string,
    consumed: boolean,
  ): Promise<void>;
}
/** Consume W4's canonical transaction API; never write its ledger directly. */
export function commerceConversationAllowance(
  units: number,
): ConversationAllowance {
  invariant(
    Number.isSafeInteger(units) && units > 0,
    "cost_policy_required",
    "Configure the approved cost units before AI messaging.",
  );
  return {
    async reserve(scope, client, key) {
      const reservation = await reserveCostAllowance(client, scope, key, units);
      const row = (
        await client.query<{ grant_id: string }>(
          "SELECT grant_id FROM creator.commerce_allowance_reservation WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          [reservation.id, scope.creatorId, scope.fanId],
        )
      ).rows[0];
      invariant(
        row,
        "reservation_unavailable",
        "The allowance reservation is unavailable.",
      );
      return { grantId: row.grant_id, reservationId: reservation.id };
    },
    settle: (scope, client, id, consumed) =>
      settleCostAllowance(client, scope, id, consumed),
  };
}
