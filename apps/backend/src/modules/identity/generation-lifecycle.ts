import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";

export const generationLifecycleSource = Object.freeze({
  owner: "W1",
  name: "w1_generation_lifecycle",
  path: "apps/backend/src/modules/identity/schema-generation-lifecycle.sql",
  checksum: "cd530fbc58dcaf63002f4214873ba877feb0d2866eefb2a94988062e2ca39057",
});

/** Closed PostgreSQL definition receipts. The source is held and unallocated;
 * these do not activate it or qualify the complete prepared generation graph. */
export const generationLifecycleDefinitions = Object.freeze({
  "creator.pending_generation_tasks(integer)":
    "15a1f4f02195c87612e35abda9d3a1f24ee64a9cb89d733dda0279417f8aa5b6",
  "creator.pending_generation_terminals(integer)":
    "a2b93aaec3a7702ff1534993fb57a70bf2643219a8f026baa9c47fb76380bcf3",
  "creator.fence_generation_first_claim()":
    "c1374b465c9a4ceaf58661a9e6f2e93b15a1f3462ae62af71301ab6dcc668171",
});

export const generationLifecycleCatalogueQuery = `WITH expected(signature,owner,definer,recipients) AS (VALUES
 ('creator.pending_generation_tasks(integer)','creator_generation_authority',true,
  ARRAY['creator_generation_authority','creator_generation_worker']),
 ('creator.pending_generation_terminals(integer)','creator_generation_terminal_authority',true,
  ARRAY['creator_generation_terminal_authority','creator_generation_terminal_discovery','creator_generation_worker']),
 ('creator.fence_generation_first_claim()','creator_owner',false,ARRAY['creator_owner'])
) SELECT e.signature,pg_get_functiondef(p.oid) AS definition,
 (pg_get_userbyid(p.proowner)=e.owner AND p.prosecdef=e.definer AND p.prokind='f'
  AND p.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql'
  AND (SELECT count(*)=cardinality(e.recipients) AND bool_and(
   CASE WHEN a.grantee=0 THEN false ELSE pg_get_userbyid(a.grantee)=ANY(e.recipients) END
   AND a.grantor=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)
  AND EXISTS(SELECT FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE t.tgrelid=to_regclass('creator.generation') AND t.tgname='generation_first_claim'
    AND t.tgfoid=to_regprocedure('creator.fence_generation_first_claim()')
    AND t.tgtype=19 AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgconstraint=0
    AND t.tgattr=''::int2vector AND t.tgqual IS NULL AND octet_length(t.tgargs)=0
    AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
    AND pg_get_userbyid(c.relowner)='creator_owner')) AS ready
 FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 LEFT JOIN pg_language l ON l.oid=p.prolang ORDER BY e.signature`;

/** Every discovery/claim/terminal bookend checks the actual selectors and row
 * fence. A startup observation cannot authorize replay after live drift. */
export async function assertGenerationLifecycleCatalogue(
  query: Pick<Pool, "query">,
): Promise<void> {
  await assertRegisteredMigration(query, generationLifecycleSource);
  const { rows } = await query.query<{
    signature: keyof typeof generationLifecycleDefinitions;
    definition: string | null;
    ready: boolean | null;
  }>(generationLifecycleCatalogueQuery);
  if (
    !(
      rows.length === 3 &&
      new Set(rows.map((row) => row.signature)).size === 3 &&
      rows.every(
        (row) =>
          row.ready === true &&
          row.definition !== null &&
          createHash("sha256").update(row.definition).digest("hex") ===
            generationLifecycleDefinitions[row.signature],
      )
    )
  )
    throw new DomainError(
      "generation_lifecycle_unconfigured",
      "The original fresh-claim and terminal-recovery boundary is unavailable.",
      503,
    );
}
