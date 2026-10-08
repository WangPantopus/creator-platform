import type { Pool } from "pg";
import { catalogueQuery } from "../../core/catalogue-query.js";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";

export const generationLifecycleSource = Object.freeze({
  owner: "W1",
  name: "w1_generation_lifecycle",
  path: "apps/backend/src/modules/identity/schema-generation-lifecycle.sql",
  checksum: "9eba74f6ae86c52eddde1acc4f7780a5c98762a86681920e11edfec15cd070a8",
});

/** Closed PostgreSQL definition receipts. The source is held as0226;
 * these do not activate it or qualify the complete prepared generation graph. */
export const generationLifecycleDefinitions = Object.freeze({
  "creator.pending_generation_tasks(integer)":
    "69e18fd0c8f7f0cc1582f07980372587153e953ad20844d7720d7a4005e00330",
  "creator.pending_generation_terminals(integer)":
    "b619edf7052bba513ea9b060289eabdf00424364b37ae75823018a7fcbb8cdef",
  "creator.fence_generation_first_claim()":
    "c1374b465c9a4ceaf58661a9e6f2e93b15a1f3462ae62af71301ab6dcc668171",
});

export const generationLifecycleCatalogueQuery = `WITH expected(signature,owner,definer,recipients) AS (VALUES
 ('creator.pending_generation_tasks(integer)','creator_generation_authority',true,
  ARRAY['creator_generation_authority','creator_generation_worker']),
 ('creator.pending_generation_terminals(integer)','creator_generation_terminal_authority',true,
  ARRAY['creator_generation_terminal_authority','creator_generation_terminal_discovery','creator_generation_worker']),
 ('creator.fence_generation_first_claim()','creator_owner',false,ARRAY['creator_owner'])
) SELECT e.signature,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS "definitionChecksum",
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
export type GenerationLifecycleCatalogueRow = {
  signature: keyof typeof generationLifecycleDefinitions;
  definitionChecksum: string | null;
  ready: boolean | null;
};

export async function assertGenerationLifecycleCatalogue(
  query: Pick<Pool, "query">,
): Promise<void> {
  await assertRegisteredMigration(query, generationLifecycleSource);
  // Hash the same current UTF-8 definition in PostgreSQL. Reuse only its
  // prepared query plan; never cache a result or transfer full bodies on every
  // nested authorization check.
  const { rows } = await catalogueQuery<GenerationLifecycleCatalogueRow>(
    query,
    generationLifecycleCatalogueQuery,
  );
  assertGenerationLifecycleRows(rows);
}

/** Shared validation for the same current rows, including the combined W1
 * catalogue statement. This never accepts a startup-cached receipt. */
export function assertGenerationLifecycleRows(
  rows: GenerationLifecycleCatalogueRow[],
): void {
  if (
    !(
      rows.length === 3 &&
      new Set(rows.map((row) => row.signature)).size === 3 &&
      rows.every(
        (row) =>
          row.ready === true &&
          row.definitionChecksum !== null &&
          row.definitionChecksum ===
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
