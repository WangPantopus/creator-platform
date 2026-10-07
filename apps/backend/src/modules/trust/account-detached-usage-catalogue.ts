import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { generationPrivacySourcesRegistered } from "../../db/generation-privacy-sources.js";

export const accountDetachedUsageSource = Object.freeze({
  owner: "W2",
  name: "w2_account_detached_usage",
  path: "apps/backend/src/modules/agent/migrations/pending_w2_account_detached_usage.sql",
  checksum: "d19aa583d71250c85bdbce97c5d2c168dbb683009451de594f4434574c16874f",
});

/** Fixed full39-source fresh/preserved metadata, restore and drift review.
 * Constraints use PostgreSQL's canonical pretty deparse, like schemaCustody:
 * dump/restore can flatten equivalent AND groups expanded from BETWEEN.
 * Names, validation and deferrability remain exact. This pin
 * supplies no source registration, original account task or completed erasure. */
export const accountDetachedUsageExpectedCatalogue: string | undefined =
  "689b6af98b8bf3cfcb88c08c834a1adf32d34c488686eaae913830df6d64d74f";

export const accountDetachedUsageCatalogueQuery = `SELECT jsonb_build_object(
 'role',(SELECT to_jsonb(r)-'oid' FROM pg_roles r WHERE rolname='creator_usage_detachment'),
 'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'role',pg_get_userbyid(m.roleid),'member',pg_get_userbyid(m.member),'grantor',pg_get_userbyid(m.grantor),
  'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option) ORDER BY m.roleid::regrole::text,m.member::regrole::text)
  FROM pg_auth_members m WHERE to_regrole('creator_usage_detachment') IN(m.roleid,m.member)),'[]'),
 'settings',coalesce((SELECT jsonb_agg(jsonb_build_object('database',coalesce(d.datname,'all'),'config',s.setconfig) ORDER BY d.datname NULLS FIRST)
  FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
  WHERE s.setrole=to_regrole('creator_usage_detachment')),'[]'),
 'functions',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),
  'definition',pg_get_functiondef(p.oid),'acl',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee::regrole::text,a.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'[]')) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND
   (p.oid=to_regprocedure('creator_trust.usage_account_delete_bound(uuid)') OR p.proowner=to_regrole('creator_usage_detachment') OR
    (n.nspname IN('creator','creator_trust','growth') AND has_function_privilege('creator_usage_detachment',p.oid,'EXECUTE')))),'[]'),
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
  'constraints',coalesce((SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid,true),
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
  FROM pg_class c WHERE c.oid IN(to_regclass('creator_trust.detached_usage'),to_regclass('creator_trust.detached_usage_expiry'),to_regclass('creator_trust.detached_usage_summary'),
   to_regclass('creator.ai_usage'),to_regclass('creator.creator_profile'),to_regclass('creator.schema_migration'))),'[]')
) AS catalogue`;

/** Operator metadata read only. Application callers must use the registered
 * guard below; capturing this value supplies no accepted fingerprint. */
export async function accountDetachedUsageCatalogue(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const permissions = await generationConsumerCatalogue(
    client,
    "creator_usage_detachment",
    { signal },
  );
  const { rows } = await client.query<{ catalogue: unknown }>(
    accountDetachedUsageCatalogueQuery,
  );
  signal?.throwIfAborted();
  invariant(
    rows.length === 1,
    "account_detached_usage_catalogue_unavailable",
    "Complete original detached accounting metadata is required.",
  );
  return { permissions, catalogue: rows[0]!.catalogue };
}

export async function assertAccountDetachedUsageCatalogue(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const source = await registeredMigration(accountDetachedUsageSource);
  invariant(
    source &&
      (await generationPrivacySourcesRegistered(signal)) &&
      accountDetachedUsageExpectedCatalogue,
    "account_detached_usage_unconfigured",
    "Registered detached accounting source and accepted complete custody are required.",
  );
  const catalogue = await accountDetachedUsageCatalogue(client, signal);
  invariant(
    contentHash(catalogue) === accountDetachedUsageExpectedCatalogue,
    "account_detached_usage_catalogue_changed",
    "Original detached accounting authority custody changed.",
  );
  const { rows } = await client.query<{ registered: boolean }>(
    "SELECT creator_trust.account_detached_usage_registered($1,$2) AS registered",
    [source.version, source.checksum],
  );
  signal?.throwIfAborted();
  invariant(
    rows[0]?.registered === true,
    "account_detached_usage_unconfigured",
    "This actual database must register the original detached accounting source.",
  );
}

export const accountDeleteBindingSignature =
  "creator_trust.usage_account_delete_bound(uuid)";
export const accountDeleteBindingDefinition =
  "0dbd055cffca3061ded797075e8c7574a2cf076cc73f665415e677ed08fe06a3";

/** The original W8 fence accepts only this exact registered extension. A new
 * function or grant installed without executable custody still refuses. */
export async function accountDetachedUsageRegisteredExtension(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (!(await registeredMigration(accountDetachedUsageSource)))
    return undefined;
  await assertAccountDetachedUsageCatalogue(client, signal);
  return {
    signature: accountDeleteBindingSignature,
    sha256: accountDeleteBindingDefinition,
  };
}
