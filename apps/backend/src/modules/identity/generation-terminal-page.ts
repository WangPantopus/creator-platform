import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import type { GenerationTerminalPurposeConsumer } from "./generation-scope.js";

export const generationTerminalPageSource = Object.freeze({
  owner: "W1",
  name: "w1_generation_terminal_page",
  path: "apps/backend/src/modules/identity/schema-generation-terminal-page.sql",
  checksum: "8632008a15ba322f6caa3b7a393635851c9d7ea18dcd6ad7f175361d4281149c",
});

/** Fixed original metadata only; a page cursor carries no terminal authority. */
export const generationTerminalPageConsumer: GenerationTerminalPurposeConsumer =
  Object.freeze({
    purpose: "generation_terminal",
    migration: Object.freeze({
      version: "0227_w1_generation_terminal_page",
      checksum: generationTerminalPageSource.checksum,
    }),
    owner: "creator_generation_terminal_discovery",
    signature: "creator.pending_generation_terminal_cursor_page(integer,uuid)",
    definitionChecksum:
      "f6924de4ce05abea703aa6995dab1dbe2a49279c4e7e290e2722c1bb57f227c6",
  });

export const generationTerminalPageDefinitions = Object.freeze({
  "creator.pending_generation_terminal_page(integer,uuid)":
    "7eb0cd74822fb81b94a85d768ec672febef80372abad0cc640ff5144e2b478af",
  "creator.pending_generation_terminal_cursor_page(integer,uuid)":
    generationTerminalPageConsumer.definitionChecksum,
});
export const generationTerminalPageIndexChecksum =
  "69de72702d9553ea0fdddf7568e94bab3b585e496b04ed611966c961d210f72d";

export const generationTerminalPageCatalogueQuery = `WITH expected(signature,owner,recipient) AS (VALUES
 ('creator.pending_generation_terminal_page(integer,uuid)','creator_generation_terminal_authority','creator_generation_terminal_discovery'),
 ('creator.pending_generation_terminal_cursor_page(integer,uuid)','creator_generation_terminal_discovery','creator_generation_worker')
) SELECT e.signature,pg_get_functiondef(p.oid) AS definition,
 pg_get_indexdef(to_regclass('creator.generation_terminal_pending_page')) AS "indexDefinition",
 (pg_get_userbyid(p.proowner)=e.owner AND p.prosecdef AND p.provolatile='v' AND p.prokind='f'
  AND p.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql'
  AND (SELECT count(*)=2 AND bool_and(
   CASE WHEN a.grantee=0 THEN false ELSE pg_get_userbyid(a.grantee)=ANY(ARRAY[e.owner,e.recipient]) END
   AND a.grantor=p.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)
  AND has_function_privilege('creator_generation_worker',p.oid,'EXECUTE')=(e.recipient='creator_generation_worker')
  AND EXISTS(SELECT FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
   WHERE x.indexrelid=to_regclass('creator.generation_terminal_pending_page')
    AND x.indrelid=to_regclass('creator.generation') AND x.indisvalid AND x.indisready AND x.indislive
    AND NOT x.indisunique AND NOT x.indisprimary AND pg_get_userbyid(i.relowner)='creator_owner')) AS ready
 FROM expected e LEFT JOIN pg_proc p ON p.oid=to_regprocedure(e.signature)
 LEFT JOIN pg_language l ON l.oid=p.prolang ORDER BY e.signature`;

export async function assertGenerationTerminalPageCatalogue(
  query: Pick<Pool, "query">,
): Promise<void> {
  await assertRegisteredMigration(query, generationTerminalPageSource);
  const { rows } = await query.query<{
    signature: keyof typeof generationTerminalPageDefinitions;
    definition: string | null;
    indexDefinition: string | null;
    ready: boolean | null;
  }>(generationTerminalPageCatalogueQuery);
  if (
    rows.length !== 2 ||
    new Set(rows.map((row) => row.signature)).size !== 2 ||
    rows.some(
      (row) =>
        row.ready !== true ||
        !row.definition ||
        !row.indexDefinition ||
        createHash("sha256").update(row.indexDefinition).digest("hex") !==
          generationTerminalPageIndexChecksum ||
        createHash("sha256").update(row.definition).digest("hex") !==
          generationTerminalPageDefinitions[row.signature],
    )
  )
    throw new DomainError(
      "generation_terminal_page_unconfigured",
      "Original bounded terminal discovery pages are unavailable.",
      503,
    );
}
