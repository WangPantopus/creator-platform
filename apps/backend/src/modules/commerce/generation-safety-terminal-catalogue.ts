import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { requestAuthority } from "../identity/request-authority.js";

/** Logical-name metadata pattern from the actual independently reviewed W1/W4
 * publication catalogue. Includes both legacy and typed financial callers,
 * complete output/journal custody, original fences and effective privileges. */
export const GENERATION_SAFETY_TERMINAL_CATALOGUE_QUERY = `WITH roles AS (
 SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconfig
 FROM pg_roles WHERE rolname IN('creator_w4_generation_safety_terminal','creator_w4_generation_terminal','creator_generation_terminal_authority','creator_w2_generation_terminal_journal','creator_w3_generation_output','creator_generation_cursor_authority','creator_w2_generation_journal','creator_w2_generation_input','creator_generation_authority','creator_generation_worker','creator_trust_denial')
), relations AS (
 SELECT c.oid,c.relname,c.relowner,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator'
 AND c.relname IN('generation_worker_scope','generation_terminal_scope','generation_sentence_provenance','generation','thread','message','event','creator_profile','fan_profile','identity_session','processor_consent','commerce_allowance_reservation','access_grant','commerce_pass','commerce_membership','commerce_membership_usage','ai_workspace','ai_generation_admission','ai_generation_attempt','ai_generation_receipt','ai_usage','ai_cost_hold')
) SELECT jsonb_build_object(
 'roles',(SELECT jsonb_agg(to_jsonb(r)-'oid' ORDER BY r.rolname COLLATE "C") FROM roles r),
 'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),
  'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
  ORDER BY pg_get_userbyid(m.roleid),pg_get_userbyid(m.member)) FROM pg_auth_members m
  WHERE m.roleid IN(SELECT oid FROM roles) OR m.member IN(SELECT oid FROM roles)),
 'settings',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(s.setrole),'database',
  CASE WHEN s.setdatabase=0 THEN 'all' WHEN s.setdatabase=(SELECT oid FROM pg_database WHERE datname=current_database()) THEN 'current' ELSE 'other' END,
  'configuration',s.setconfig) ORDER BY pg_get_userbyid(s.setrole),s.setdatabase) FROM pg_db_role_setting s WHERE s.setrole IN(SELECT oid FROM roles)),
 'dependencies',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(d.refobjid),'kind',d.deptype,
  'type',a.type,'names',a.object_names,'arguments',a.object_args) ORDER BY pg_get_userbyid(d.refobjid),d.deptype,a.type,a.object_names,a.object_args)
  FROM pg_shdepend d CROSS JOIN LATERAL pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
  WHERE d.refclassid='pg_authid'::regclass AND d.refobjid IN(SELECT oid FROM roles)
   AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))),
 'executables',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'securityDefiner',p.prosecdef,'volatility',p.provolatile,'configuration',p.proconfig,'definition',pg_get_functiondef(p.oid),
  'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
   'grantor',pg_get_userbyid(g.grantor),'privilege',g.privilege_type,'grantable',g.is_grantable)
   ORDER BY CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END COLLATE "C",g.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g)) ORDER BY p.oid::regprocedure::text COLLATE "C")
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE CASE WHEN n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p') THEN
   p.proowner IN(SELECT oid FROM roles) OR EXISTS(SELECT FROM pg_trigger t WHERE t.tgfoid=p.oid AND t.tgrelid IN(SELECT oid FROM relations)) OR p.oid=ANY(ARRAY[to_regprocedure('creator.commerce_original_cost_rule()'),
     to_regprocedure('creator.commerce_allowance_cost_fence()'),to_regprocedure('creator.ai_generation_receipt_immutable()')])
    OR EXISTS(SELECT FROM roles r WHERE has_function_privilege(r.oid,p.oid,'EXECUTE')) ELSE false END),
 'relations',(SELECT jsonb_agg(jsonb_build_object('name',o.relname,'owner',pg_get_userbyid(o.relowner),'kind',o.relkind,
  'rls',o.relrowsecurity,'forced',o.relforcerowsecurity,'partition',o.relispartition,
  'columns',(SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),
   'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
    'grantor',pg_get_userbyid(g.grantor),'privilege',g.privilege_type,'grantable',g.is_grantable)
    ORDER BY CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END COLLATE "C",g.privilege_type) FROM aclexplode(a.attacl) g))
   ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=o.oid AND a.attnum>0 AND NOT a.attisdropped),
  'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
   'grantor',pg_get_userbyid(g.grantor),'privilege',g.privilege_type,'grantable',g.is_grantable)
   ORDER BY CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END COLLATE "C",g.privilege_type)
   FROM aclexplode(coalesce(o.relacl,acldefault('r',o.relowner))) g),
  'policies',(SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r
    ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END COLLATE "C"),
   'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname COLLATE "C") FROM pg_policy p WHERE p.polrelid=o.oid),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
   'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=o.oid),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('name',i.relname,'valid',x.indisvalid,'ready',x.indisready,'live',x.indislive,
   'definition',pg_get_indexdef(i.oid)) ORDER BY i.relname) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=o.oid),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
   FROM pg_trigger t WHERE t.tgrelid=o.oid AND NOT t.tgisinternal)) ORDER BY o.relname COLLATE "C") FROM relations o),
 'effectivePrivileges',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'schema',n.nspname,'relation',c.relname,'kind',c.relkind,
  'table',ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
   WHERE CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_table_privilege(r.oid,c.oid,privilege) ELSE false END ORDER BY privilege),
  'sequence',ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','UPDATE','USAGE']) privilege
   WHERE CASE WHEN c.relkind='S' THEN has_sequence_privilege(r.oid,c.oid,privilege) ELSE false END ORDER BY privilege),
  'columns',(SELECT jsonb_agg(jsonb_build_object('column',a.attname,'privilege',privilege) ORDER BY a.attname,privilege)
   FROM pg_attribute a CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) privilege
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_column_privilege(r.oid,c.oid,a.attnum,privilege) ELSE false END))
  ORDER BY r.rolname COLLATE "C",n.nspname COLLATE "C",c.relname COLLATE "C")
  FROM roles r CROSS JOIN pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'),
 'schemas',(SELECT jsonb_agg(jsonb_build_object('role',r.rolname,'schema',n.nspname,
  'usage',has_schema_privilege(r.oid,n.oid,'USAGE'),'create',has_schema_privilege(r.oid,n.oid,'CREATE'))
  ORDER BY r.rolname COLLATE "C",n.nspname COLLATE "C") FROM roles r CROSS JOIN pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema')
) AS catalogue`;

/** Metadata only on the original held client; no purpose or startup pin. */
export async function generationSafetyTerminalPurposeCatalogue(
  client: PoolClient,
) {
  await client.query("SAVEPOINT w4_safety_terminal_catalogue");
  try {
    await client.query("SET LOCAL search_path=pg_catalog");
    return (
      await client.query<{ catalogue: unknown }>(
        GENERATION_SAFETY_TERMINAL_CATALOGUE_QUERY,
      )
    ).rows[0]?.catalogue;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT w4_safety_terminal_catalogue");
    await client.query("RELEASE SAVEPOINT w4_safety_terminal_catalogue");
  }
}

export const GENERATION_SAFETY_TERMINAL_CATALOGUE_SHA256 =
  "6450e353b079ae614e64b1a08cfa9c77edb753e45810b42b5d24579f20f18830";
export const GENERATION_SAFETY_TERMINAL_SOURCES = Object.freeze(
  [
    {
      name: "w4_generation_safety_terminal_settlement",
      path: "apps/backend/src/modules/commerce/schema-generation-safety-terminal-settlement.sql",
      owner: "W4",
      checksum:
        "97593fdef08464d54afe9ba14c340f873c4231bf48d11f3fc574a584cab6416f",
    },
    {
      name: "w1_generation_worker_scope",
      path: "apps/backend/src/modules/identity/schema-generation-scope.sql",
      owner: "W1",
      checksum:
        "7de41bf10228219d69480e302bac7d69626d8d848d8276bb1fe54e49112a5627",
    },
    {
      name: "w2_usage_lineage",
      path: "apps/backend/src/modules/agent/migrations/0048_w2_usage_lineage.sql",
      owner: "W2",
      checksum:
        "16dddc80bebe32979f822104d8f411e0f545b4e212da6dc147c72f959e660f17",
    },
    {
      name: "w4_generation_cost_settlement",
      path: "apps/backend/src/modules/commerce/schema-generation-cost-settlement.sql",
      owner: "W4",
      checksum:
        "00f4c2cc2962a0e9f14b0ba0ad57f23823fcc811042e8d6b8b9c6dc5394daffc",
    },
    {
      name: "w2_generation_input_consumers",
      path: "apps/backend/src/modules/agent/migrations/0096_w2_generation_input_consumers.sql",
      owner: "W2",
      checksum:
        "25f89ddba69beed4dd780cd23a64eabb9b7481e2dcb5f192b167299a732b2c34",
    },
    {
      name: "w2_generation_attempt_admission",
      path: "apps/backend/src/modules/agent/migrations/0097_w2_generation_attempt_admission.sql",
      owner: "W2",
      checksum:
        "eab8c8e07b8a1e6ba4384f5300560bd46853bf98509faade5a1b555e130c75ee",
    },
    {
      name: "w1_generation_terminal_scope",
      path: "apps/backend/src/modules/identity/schema-generation-terminal.sql",
      owner: "W1",
      checksum:
        "fadbf62a3ddf06142c3a6ad30313503f9bebe7b6d64f67f8ba01ff13ce2398c7",
    },
    {
      name: "w8_generation_terminal_denial",
      path: "apps/backend/migrations/0100_w8_generation_terminal_denial.sql",
      owner: "W8",
      checksum:
        "393920665d8860ee53ee6ef740ba0ad4a6921aceddcbf33f6419727e846532af",
    },
    {
      name: "w2_generation_terminal_journal",
      path: "apps/backend/src/modules/agent/migrations/0105_w2_generation_terminal_journal.sql",
      owner: "W2",
      checksum:
        "7ab8974d065b1b9e5befa2ded26c6978876957fab0eee80b9632825bbac98477",
    },
    {
      name: "w4_generation_terminal_settlement",
      path: "apps/backend/src/modules/commerce/schema-generation-terminal-settlement.sql",
      owner: "W4",
      checksum:
        "a6e386de7506035d6bc0d10da644cb8ee2620824217b9c2c61a9a34cb7fa4fc9",
    },
    {
      name: "w3_generation_worker_output",
      path: "apps/backend/src/modules/conversation/migrations/pending_w3_worker_output.sql",
      owner: "W3",
      checksum:
        "76ee832c45e5dc422a8128afdc162a354fc54b7df4f611fb6186cdf3bd094df8",
    },
    {
      name: "w1_generation_output_cursor",
      path: "apps/backend/src/modules/identity/schema-generation-output-cursor.sql",
      owner: "W1",
      checksum:
        "a4f01c5f1eb1e19d79437b17cce872def1366965ba27c8c46b0d5f9bb73da436",
    },
  ].map((source) => Object.freeze(source)),
);

export async function assertGenerationSafetyTerminalCatalogue(
  client: PoolClient,
) {
  const unavailable = () =>
    new DomainError(
      "generation_safety_terminal_unavailable",
      "Actual typed original allowance custody is unavailable.",
      503,
    );
  try {
    if (requestAuthority.getStore()) throw unavailable();
    for (const source of GENERATION_SAFETY_TERMINAL_SOURCES)
      await assertRegisteredMigration(client, source);
    const ready = (
      await client.query<{
        ready: boolean;
      }>(`SELECT session_user='creator_generation_worker' AND current_user=session_user
      AND current_setting('transaction_isolation')='read committed'
      AND nullif(current_setting('app.account_id',true),'') IS NULL
      AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
      AND nullif(current_setting('app.creator_id',true),'') IS NULL
      AND nullif(current_setting('app.fan_id',true),'') IS NULL
      AND EXISTS(SELECT FROM pg_database d WHERE d.datname=current_database() AND d.datconnlimit<>0
       AND shobj_description(d.oid,'pg_database') IS DISTINCT FROM 'creator-platform:restored-traffic-closed') AS ready`)
    ).rows[0]?.ready;
    if (
      !ready ||
      contentHash(await generationSafetyTerminalPurposeCatalogue(client)) !==
        GENERATION_SAFETY_TERMINAL_CATALOGUE_SHA256
    )
      throw unavailable();
  } catch {
    throw unavailable();
  }
}
