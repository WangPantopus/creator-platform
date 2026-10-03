import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { allScopeOwnershipMigration } from "./privacy-ownership-catalog.js";

const purpose = "creator_privacy_family";
const roles = [
  purpose,
  "creator_privacy_fence",
  "creator_privacy_ownership_metadata",
  "creator_runtime",
];
export const originalPrivacyFamilyMigration = Object.freeze({
  version: "0214_w8_original_privacy_family",
  checksum: "bb93fda4d7ff4647b532e1bc57f59642bc63bd207056ace7b436ddafa74adbe3",
});
export const originalPrivacyBindingSignature =
  "creator_trust.privacy_task_original_binding(uuid,text,uuid)";
export const originalPrivacyBindingDefinition =
  "96258c090117abc5b0a45beb8f12b8aa48d81645501c66617329463523f9fc63";
// Only actual closed qualification may fill this value; no startup readback.
const catalogueChecksum =
  "426857aad55d6b81254c5641d8c15e32ec5c7f12f4e299c814c6876fecc8f03f";

function unavailable(): never {
  throw new DomainError(
    "privacy_original_family_unavailable",
    "Original data-request family authority is unavailable.",
    503,
  );
}

/** Closed metadata review only. No original preparation, task, body or positive
 * permission is issued. Preserve the caller's transaction and search path. */
export async function originalPrivacyFamilyPurposeCatalogue(
  client: PoolClient,
) {
  await client.query("SAVEPOINT w8_original_family_catalog");
  try {
    await client.query("SET LOCAL search_path=pg_catalog");
    const permissions = await generationConsumerCatalogue(client, purpose);
    const issuerPermissions = await generationConsumerCatalogue(
      client,
      "creator_privacy_fence",
    );
    const projectionPermissions = await generationConsumerCatalogue(
      client,
      "creator_privacy_ownership_metadata",
    );
    const callerPermissions = await generationConsumerCatalogue(
      client,
      "creator_runtime",
    );
    const role = (
      await client.query(
        `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
         rolreplication,rolbypassrls,rolconfig,
         EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS memberships,
         EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid) AS settings
         FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"`,
        [roles],
      )
    ).rows;
    const dependencies = (
      await client.query(
        `SELECT d.deptype,a.type,a.object_names,a.object_args
         FROM pg_shdepend d CROSS JOIN LATERAL
          pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
         WHERE d.refclassid='pg_authid'::regclass AND d.refobjid IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))
          AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
         ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
        [roles],
      )
    ).rows;
    const executables = (
      await client.query(
        `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
         pg_get_userbyid(p.proowner) AS owner,p.prosecdef,p.provolatile,p.proconfig,
         encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition,
         ARRAY(SELECT a::text FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a
          ORDER BY a::text COLLATE "C") AS grants
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
          AND (p.proowner IN(SELECT oid FROM pg_roles WHERE rolname=ANY($1::text[]))
           OR EXISTS(SELECT FROM unnest($1::text[]) r WHERE has_function_privilege(r,p.oid,'EXECUTE')))
         ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
        [roles],
      )
    ).rows;
    const relations = (
      await client.query(
        `SELECT c.relname,pg_get_userbyid(c.relowner) AS owner,c.relkind,c.relispartition,
         c.relrowsecurity,c.relforcerowsecurity,
         (SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
           'grantor',pg_get_userbyid(acl.grantor),'privilege',acl.privilege_type,'grantable',acl.is_grantable)
           ORDER BY CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END COLLATE "C",acl.privilege_type)
          FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl) AS grants,
         (SELECT jsonb_agg(jsonb_build_object('name',policy.polname,'command',policy.polcmd,'permissive',policy.polpermissive,
           'roles',ARRAY(SELECT CASE WHEN role=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role) END FROM unnest(policy.polroles) role
             ORDER BY CASE WHEN role=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role) END COLLATE "C"),
           'using',pg_get_expr(policy.polqual,policy.polrelid),'check',pg_get_expr(policy.polwithcheck,policy.polrelid)) ORDER BY policy.polname COLLATE "C")
          FROM pg_policy policy WHERE policy.polrelid=c.oid) AS policies,
         (SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,
           'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,
           'identity',a.attidentity,'generated',a.attgenerated,
           'default',pg_get_expr(d.adbin,d.adrelid),'inherited',a.attinhcount,
           'collation',a.attcollation::regcollation::text,
           'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END,
             'grantor',pg_get_userbyid(acl.grantor),'privilege',acl.privilege_type,'grantable',acl.is_grantable)
             ORDER BY CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END COLLATE "C",acl.privilege_type)
            FROM aclexplode(a.attacl) acl)) ORDER BY a.attnum)
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
         (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'validated',k.convalidated,
           'definition',pg_get_constraintdef(k.oid),'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname)
          FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
         (SELECT jsonb_agg(jsonb_build_object('name',i.relname,'valid',x.indisvalid,
           'ready',x.indisready,'live',x.indislive,'definition',pg_get_indexdef(i.oid)) ORDER BY i.relname)
          FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE x.indrelid=c.oid) AS indexes,
         (SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
           'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
          FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal) AS triggers
         FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE (n.nspname='creator_trust' AND c.relname IN('privacy_commit_scope','privacy_job','privacy_task'))
          OR (n.nspname='creator' AND c.relname IN('thread','fan_profile','schema_migration'))
         ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
      )
    ).rows;
    return {
      permissions,
      issuerPermissions,
      projectionPermissions,
      callerPermissions,
      role,
      dependencies,
      executables,
      relations,
    };
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT w8_original_family_catalog");
    await client.query("RELEASE SAVEPOINT w8_original_family_catalog");
  }
}

export async function assertOriginalPrivacyFamilyPurposeCatalog(
  client: PoolClient,
) {
  try {
    if (
      !catalogueChecksum ||
      contentHash(await originalPrivacyFamilyPurposeCatalogue(client)) !==
        catalogueChecksum
    )
      unavailable();
  } catch {
    unavailable();
  }
}

/** Executable source and ledger gate on this actual held core client. A held
 * proposal or matching manually installed ledger cannot grant family authority. */
export async function originalPrivacyFamilyRegisteredExtension(
  client: PoolClient,
) {
  const source = {
    name: "w8_original_privacy_family",
    path: "apps/backend/migrations/0214_w8_original_privacy_family.sql",
    owner: "W8",
    checksum: originalPrivacyFamilyMigration.checksum,
  };
  const active = await registeredMigration(source);
  if (!active) return undefined;
  try {
    const ownership = await registeredMigration({
      name: "w8_all_scope_privacy_ownership",
      path: "apps/backend/migrations/0209_w8_all_scope_privacy_ownership.sql",
      owner: "W8",
      checksum: allScopeOwnershipMigration.checksum,
    });
    if (
      !ownership ||
      ownership.version !== allScopeOwnershipMigration.version ||
      active.version !== originalPrivacyFamilyMigration.version
    )
      unavailable();
    for (const migration of [active, ownership]) {
      if (
        (
          await client.query<{ ready: boolean }>(
            "SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2) AS ready",
            [migration.version, migration.checksum],
          )
        ).rows[0]?.ready !== true
      )
        unavailable();
    }
    if (
      (
        await client.query<{
          ready: boolean;
        }>(`SELECT current_user=session_user AND session_user='creator_runtime'
      AND current_setting('transaction_isolation') IN('read committed','repeatable read')
      AND EXISTS(SELECT FROM pg_roles r WHERE rolname=current_user AND rolcanlogin AND NOT rolinherit
       AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
       AND rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
       AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) AS ready`)
      ).rows[0]?.ready !== true
    )
      unavailable();
    await assertOriginalPrivacyFamilyPurposeCatalog(client);
    return {
      signature: originalPrivacyBindingSignature,
      sha256: originalPrivacyBindingDefinition,
    };
  } catch {
    unavailable();
  }
}

export async function assertOriginalPrivacyFamilyCatalog(client: PoolClient) {
  if (!(await originalPrivacyFamilyRegisteredExtension(client))) unavailable();
}
