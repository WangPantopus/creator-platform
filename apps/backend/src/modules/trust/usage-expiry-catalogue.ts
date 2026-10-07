import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";

export const usageExpirySource = Object.freeze({
  owner: "W8",
  name: "w8_usage_expiry_tasks",
  path: "apps/backend/migrations/0230_w8_usage_expiry_tasks.sql",
  checksum: "2e30ef05d54352d37f37deb9a33ddc22cd9fad64d71ad98d6f69f99ff394a72e",
});

/** The complete composed purpose is still unaccepted. A closed metadata
 * capture cannot enable a persisted expiry lease or an original deletion. */
export const usageExpiryExpectedCatalogue: string | undefined = undefined;

export const usageExpiryCatalogueQuery = `SELECT jsonb_build_object(
 'role',(SELECT to_jsonb(r)-'oid' FROM pg_roles r WHERE rolname='creator_usage_expiry'),
 'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),'grantor',pg_get_userbyid(m.grantor),
  'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) ORDER BY m.roleid::regrole::text,m.member::regrole::text)
  FROM pg_auth_members m WHERE to_regrole('creator_usage_expiry') IN(m.roleid,m.member)),'[]'),
 'settings',coalesce((SELECT jsonb_agg(jsonb_build_object('database',coalesce(d.datname,'all'),'config',s.setconfig) ORDER BY d.datname NULLS FIRST)
  FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
  WHERE s.setrole=to_regrole('creator_usage_expiry')),'[]'),
 'functions',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'definition',pg_get_functiondef(p.oid),'acl',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]')) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND
   (p.proowner=to_regrole('creator_usage_expiry') OR
    (n.nspname IN('creator','creator_trust','growth') AND has_function_privilege('creator_usage_expiry',p.oid,'EXECUTE')))),'[]'),
 'relations',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'name',c.oid::regclass::text,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),
  'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'partition',c.relispartition,
  'acl',coalesce((SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),
   'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type)
   FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),'[]'),
  'columns',coalesce((SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
   'default',pg_get_expr(d.adbin,d.adrelid),'acl',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'grantor',pg_get_userbyid(g.grantor),'grantee',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(g.grantee) END,
    'privilege',g.privilege_type,'grantable',g.is_grantable) ORDER BY g.grantee::regrole::text,g.privilege_type)
    FROM aclexplode(a.attacl) g),'[]')) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'[]'),
  'constraints',coalesce((SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
   'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname)
   FROM pg_constraint k WHERE k.conrelid=c.oid),'[]'),
  'indexes',coalesce((SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),
   'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive) ORDER BY i.indexrelid::regclass::text)
   FROM pg_index i WHERE i.indrelid=c.oid),'[]'),
  'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),
   'enabled',t.tgenabled,'function',pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname)
   FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),'[]'),
  'policies',coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
   'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r ORDER BY r::regrole::text),
   'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
   FROM pg_policy p WHERE p.polrelid=c.oid),'[]')) ORDER BY c.oid::regclass::text)
  FROM pg_class c WHERE c.oid IN(to_regclass('creator_trust.usage_expiry_job'),to_regclass('creator_trust.usage_expiry_scope'),
   to_regclass('creator.ai_usage'),to_regclass('creator.creator_profile'),to_regclass('creator.schema_migration'))),'[]')
) AS catalogue`;

/** Operator metadata read only. Application callers must use the registered
 * guard below; capturing this value supplies no accepted fingerprint. */
export async function usageExpiryCatalogue(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const permissions = await generationConsumerCatalogue(
    client,
    "creator_usage_expiry",
    { signal },
  );
  const { rows } = await client.query<{ catalogue: unknown }>(
    usageExpiryCatalogueQuery,
  );
  signal?.throwIfAborted();
  invariant(
    rows.length === 1,
    "usage_expiry_catalogue_unavailable",
    "Complete original expiry metadata is required.",
  );
  return { permissions, catalogue: rows[0]!.catalogue };
}

export async function assertUsageExpiryCatalogue(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const source = await registeredMigration(usageExpirySource);
  invariant(
    source && usageExpiryExpectedCatalogue,
    "usage_expiry_unconfigured",
    "Registered expiry source and accepted complete custody are required.",
  );
  const catalogue = await usageExpiryCatalogue(client, signal);
  invariant(
    contentHash(catalogue) === usageExpiryExpectedCatalogue,
    "usage_expiry_catalogue_changed",
    "Original expiry authority custody changed.",
  );
  const { rows } = await client.query<{ registered: boolean }>(
    "SELECT creator_trust.usage_expiry_registered($1,$2) AS registered",
    [source.version, source.checksum],
  );
  signal?.throwIfAborted();
  invariant(
    rows[0]?.registered === true,
    "usage_expiry_unconfigured",
    "This actual database must register the original expiry source.",
  );
}
