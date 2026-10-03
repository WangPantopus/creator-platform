import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";

export const GENERATION_PROFILE_BOUND_SOURCE = Object.freeze({
  name: "w2_generation_profile_bound",
  owner: "W2",
  path: "apps/backend/src/modules/agent/migrations/pending_w2_generation_profile_bound.sql",
  checksum: "5b2571d4cc115fa8250351d2904126dcd8a09ff229807f6780ad819de4d21de0",
});
// Exact pg_get_expr from independently restored original SQL. This shape is
// not an accepted whole-graph catalogue or a scope/registration authority.
const predicate =
  "cd6dbf78acc6ae77b751e3de121818d65ad9a92b8a2025e9064bdc09fc55861d";

/** Bookend each original consumer read on its actual source. The original
 * consumer still checks its independently reviewed full effective catalogue.
 * Hand-installed policies or a ledger row cannot activate this held addition. */
export async function assertGenerationProfileBound(
  client: Pick<Pool | PoolClient, "query">,
): Promise<void> {
  try {
    await assertRegisteredMigration(client, GENERATION_PROFILE_BOUND_SOURCE);
    const query = {
      text: `WITH expected(name,role) AS (VALUES
        ('w2_generation_metadata_profile_bound','creator_w2_generation_metadata'),
        ('w2_generation_retrieval_profile_bound','creator_w2_generation_retrieval'))
       SELECT session_user='creator_generation_worker' AND current_user=session_user
        AND (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['creator_profile','generation_worker_scope'])
          AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
          AND pg_get_userbyid(c.relowner)='creator_owner')
        AND (SELECT count(*)=2 FROM pg_policy p JOIN expected e ON e.name=p.polname
         WHERE p.polrelid=to_regclass('creator.creator_profile')
          AND p.polcmd='r' AND NOT p.polpermissive AND p.polwithcheck IS NULL
          AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname=e.role)]
          AND encode(sha256(convert_to(pg_get_expr(p.polqual,p.polrelid),'UTF8')),'hex')=$1)
        AS ready`,
      values: [predicate],
      query_timeout: 5000,
    };
    if ((await client.query<{ ready: boolean }>(query)).rows[0]?.ready !== true)
      throw new Error("Changed original restrictive profile custody");
  } catch (cause) {
    throw new DomainError(
      "generation_profile_bound_unavailable",
      "Reviewed original generation profile custody is unavailable.",
      503,
      { cause },
    );
  }
}
