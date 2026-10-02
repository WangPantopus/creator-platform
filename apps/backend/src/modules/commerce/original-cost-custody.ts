import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";

export const ORIGINAL_COST_MIGRATION = "0189_w4_generation_terminal_settlement";
export const ORIGINAL_COST_SCHEMA_SHA256 =
  "a6e386de7506035d6bc0d10da644cb8ee2620824217b9c2c61a9a34cb7fa4fc9";
const Body = "d000a6fd25efb52555ad16b4455b7b45e4e091949f142a5ed8a2915d72d5a77b";
/** Actual metadata only. This does not grant or issue an acceptance scope. */
export async function assertOriginalCostCustody(client: PoolClient) {
  const ready = (
    await client.query<{ ready: boolean }>(
      `SELECT
  EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
  AND EXISTS(SELECT FROM pg_attribute WHERE attrelid='creator.commerce_allowance_reservation'::regclass
   AND attname='cost_rule' AND atttypid='jsonb'::regtype AND NOT attisdropped)
  AND EXISTS(SELECT FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid
   WHERE t.tgname='commerce_original_cost_rule' AND t.tgrelid='creator.commerce_allowance_reservation'::regclass
    AND NOT t.tgisinternal AND t.tgenabled='O' AND t.tgtype=31
    AND pg_get_userbyid(f.proowner)='creator_owner' AND NOT f.prosecdef AND f.provolatile='v'
    AND f.proconfig=ARRAY['search_path=pg_catalog']::text[]
    AND encode(sha256(convert_to(f.prosrc,'UTF8')),'hex')=$3) AS ready`,
      [ORIGINAL_COST_MIGRATION, ORIGINAL_COST_SCHEMA_SHA256, Body],
    )
  ).rows[0]?.ready;
  invariant(
    ready === true,
    "original_cost_rule_unconfigured",
    "The exact original cost rule custody is not activated.",
  );
}
