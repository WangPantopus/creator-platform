import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { requestAuthority } from "./request-authority.js";

export const generationOutputCursorSignature =
  "creator.generation_output_cursor_view(uuid,uuid,integer,integer)";
export const generationOutputCursorSource = Object.freeze({
  owner: "W1",
  name: "w1_generation_output_cursor",
  path: "apps/backend/src/modules/identity/schema-generation-output-cursor.sql",
  checksum: "a4f01c5f1eb1e19d79437b17cce872def1366965ba27c8c46b0d5f9bb73da436",
});

// Actual W3 full-XID source and a closed combined review are still required.
// Absence is explicit; no startup readback, fabricated digest or activation.
export const generationOutputCursorCatalogueChecksum: string | undefined =
  undefined;

export const generationOutputCursorCatalogueQuery = `SELECT jsonb_build_object(
 'roles',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY r.rolname) FROM (
  SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconfig
  FROM pg_roles WHERE rolname IN('creator_generation_cursor_authority','creator_w3_generation_output')) r),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),
  'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option)
  ORDER BY pg_get_userbyid(roleid),pg_get_userbyid(member)) FROM pg_auth_members
  WHERE roleid IN(SELECT oid FROM pg_roles WHERE rolname IN('creator_generation_cursor_authority','creator_w3_generation_output'))
   OR member IN(SELECT oid FROM pg_roles WHERE rolname IN('creator_generation_cursor_authority','creator_w3_generation_output'))),
 'settings',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(setrole),
  'database',CASE WHEN setdatabase=0 THEN 'all' WHEN setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) THEN 'current' ELSE 'other' END,
  'configuration',setconfig) ORDER BY pg_get_userbyid(setrole),setdatabase) FROM pg_db_role_setting
  WHERE setrole IN(SELECT oid FROM pg_roles WHERE rolname IN('creator_generation_cursor_authority','creator_w3_generation_output'))),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'definition',pg_get_functiondef(p.oid),'grants',(SELECT jsonb_agg(jsonb_build_object(
   'role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'grantor',pg_get_userbyid(a.grantor),
   'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE CASE WHEN ns.nspname !~ '^pg_' AND ns.nspname<>'information_schema' AND p.prokind IN('f','p') THEN
   pg_get_userbyid(p.proowner) IN('creator_generation_cursor_authority','creator_w3_generation_output')
   OR has_function_privilege('creator_generation_cursor_authority',p.oid,'EXECUTE')
   OR has_function_privilege('creator_w3_generation_output',p.oid,'EXECUTE') ELSE false END),
 'custody',(SELECT jsonb_agg(jsonb_build_object('relation',c.relname,'owner',pg_get_userbyid(c.relowner),
  'kind',c.relkind,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,'partition',c.relispartition,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
   'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname)
   FROM pg_constraint k WHERE k.conrelid=c.oid),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),
   'function',pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname) FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal))
  ORDER BY c.relname) FROM pg_class c WHERE c.oid IN(to_regclass('creator.generation_worker_scope'),
   to_regclass('creator.generation_sentence_provenance'),to_regclass('creator.event')))
) AS catalogue`;

function unavailable(): never {
  throw new DomainError(
    "generation_output_cursor_unconfigured",
    "The reviewed original output cursor is unavailable.",
    503,
  );
}

/** Same actual held purpose client. This metadata guard issues no lease,
 * provider permission, output, input body, nonce or accounting authority. */
export async function assertGenerationOutputCursorCatalogue(
  client: PoolClient,
) {
  if (requestAuthority.getStore() || !generationOutputCursorCatalogueChecksum)
    unavailable();
  try {
    await assertRegisteredMigration(client, generationOutputCursorSource);
    await client.query("SAVEPOINT w1_generation_output_cursor_catalogue");
    try {
      await client.query("SET LOCAL search_path=pg_catalog");
      const cursor = await generationConsumerCatalogue(
        client,
        "creator_generation_cursor_authority",
      );
      const writer = await generationConsumerCatalogue(
        client,
        "creator_w3_generation_output",
      );
      const catalogue = (
        await client.query<{ catalogue: unknown }>(
          generationOutputCursorCatalogueQuery,
        )
      ).rows[0]?.catalogue;
      if (
        contentHash({ cursor, writer, catalogue }) !==
        generationOutputCursorCatalogueChecksum
      )
        unavailable();
    } finally {
      await client.query(
        "ROLLBACK TO SAVEPOINT w1_generation_output_cursor_catalogue",
      );
      await client.query(
        "RELEASE SAVEPOINT w1_generation_output_cursor_catalogue",
      );
    }
  } catch {
    unavailable();
  }
}
