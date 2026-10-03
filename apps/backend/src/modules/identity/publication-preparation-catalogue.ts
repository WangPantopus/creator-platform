import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { requestAuthority } from "./request-authority.js";

// Closed source review supplies the fixed fingerprints below. A later owner
// grant/source requires a fresh combined qualification, never startup readback.
export const publicationPreparationSource = Object.freeze({
  name: "w1_publication_preparation",
  path: "apps/backend/src/modules/identity/schema-publication-preparation.sql",
  owner: "W1",
  checksum: "4afa4bc72f265bfb1415aa0f701435475f88ed46bbd6cd539bfd333695ba0fa6",
});

export const publicationPreparationCatalogueQuery = `WITH roles AS (
 SELECT oid,rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,rolconfig
 FROM pg_roles WHERE rolname IN('creator_publication_authority','creator_publication_worker')
), relations AS (
 SELECT c.oid,c.relname,c.relowner,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relacl
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator'
 AND c.relname IN('publication_preparation','publication_worker_scope','content_index','content_revision','content_publication',
 'creator_profile','team_membership','passkey_credential','signed_act','signed_act_consumption','signed_publication','signed_verification')
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
   p.proowner IN(SELECT oid FROM roles) OR EXISTS(SELECT FROM roles r WHERE has_function_privilege(r.oid,p.oid,'EXECUTE')) ELSE false END),
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

// This fingerprint captures actual0158/0160/0178/0204/0205/0208 in a closed
// rolled-back clone. Actual213 is still missing: fulfillment finalization
// refuses, and adding its real grants requires combined requalification.
export const publicationPreparationCatalogueChecksum =
  "8d28251bcfd795e603c8dc962c6660f8aad5fe67d148ab0e928af654085b661c";

function unavailable(): never {
  throw new DomainError(
    "publication_preparation_unavailable",
    "The original publication authority is unavailable. Try again later.",
    503,
  );
}

/** Read-only closed source inspection. No task/nonce, ledger, document or
 * positive permission is issued; preserve the caller's search path/transaction. */
export async function publicationPreparationPurposeCatalogue(
  client: PoolClient,
) {
  await client.query("SAVEPOINT w1_publication_catalogue");
  try {
    await client.query("SET LOCAL search_path=pg_catalog");
    return (
      await client.query<{ catalogue: unknown }>(
        publicationPreparationCatalogueQuery,
      )
    ).rows[0]?.catalogue;
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT w1_publication_catalogue");
    await client.query("RELEASE SAVEPOINT w1_publication_catalogue");
  }
}

/** Active executable registry + exact original bytes + same held purpose
 * client. Owner204/205/213 and restoration bookends remain separately mandatory. */
export async function assertPublicationPreparationCatalogue(
  client: PoolClient,
) {
  if (requestAuthority.getStore()) unavailable();
  try {
    for (const source of [
      publicationPreparationSource,
      {
        name: "w1_publication_worker_scope",
        path: "apps/backend/src/modules/identity/schema-publication-scope.sql",
        owner: "W1",
        checksum:
          "100e319216568ee1ed27081be0520dbfdb3b7019659946c2c5de1f6859d32cc1",
      },
      {
        name: "w8_publication_worker_denial",
        path: "apps/backend/migrations/0073_w8_publication_worker_denial.sql",
        owner: "W8",
        checksum:
          "87f8766331b59a174e0cf7e837e3a3a9cdfd9d9a1662aa2b39ed9aa2dc308d80",
      },
    ]) {
      const active = await registeredMigration(source);
      if (!active) unavailable();
      const ready = (
        await client.query<{ ready: boolean }>(
          "SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2) AS ready",
          [active.version, active.checksum],
        )
      ).rows[0]?.ready;
      if (ready !== true) unavailable();
    }
    const ready = (
      await client.query<{ ready: boolean }>(
        "SELECT current_user=session_user AND session_user='creator_publication_worker' AND current_setting('transaction_isolation')='read committed' AS ready",
      )
    ).rows[0]?.ready;
    if (
      ready !== true ||
      contentHash(await publicationPreparationPurposeCatalogue(client)) !==
        publicationPreparationCatalogueChecksum
    )
      unavailable();
  } catch {
    unavailable();
  }
}
