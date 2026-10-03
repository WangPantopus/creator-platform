import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import { registeredMigration } from "../../db/reviewed-migration.js";

export const allScopeOwnershipMigration = Object.freeze({
  version: "0209_w8_all_scope_privacy_ownership",
  checksum: "6fa4006cb8c2f6901c7006595d08196573daef33f06aa6cec866a546ffcd2f01",
});
const signature = "creator_trust.all_scope_ownership_registered(text,text)";

/** Metadata readiness only. This grants no owner/family, task or body authority.
 * A hand-installed proposal, extra role dependency or changed constraint refuses.
 */
export async function assertAllScopeOwnershipCatalog(client: PoolClient) {
  const active = await registeredMigration({
    name: "w8_all_scope_privacy_ownership",
    path: "apps/backend/migrations/0209_w8_all_scope_privacy_ownership.sql",
    owner: "W8",
    checksum: allScopeOwnershipMigration.checksum,
  });
  if (!active || active.version !== allScopeOwnershipMigration.version)
    throw new DomainError(
      "privacy_ownership_schema_unavailable",
      "Original ownership for this data scope is not available yet.",
      503,
    );
  await assertAllScopeOwnershipPurposeCatalog(client);
}

/** Closed operator source review only; no data or family permission is issued.
 * Applications must use assertAllScopeOwnershipCatalog's executable registry gate.
 */
export async function assertAllScopeOwnershipPurposeCatalog(
  client: PoolClient,
) {
  const fail = (): never => {
    throw new DomainError(
      "privacy_ownership_schema_unavailable",
      "Original ownership for this data scope is not available yet.",
      503,
    );
  };
  const present = (
    await client.query<{ present: boolean }>(
      "SELECT to_regprocedure($1) IS NOT NULL AS present",
      [signature],
    )
  ).rows[0]?.present;
  if (!present) fail();
  const ready = (
    await client.query<{ ready: boolean }>(
      `WITH purpose AS (
       SELECT oid FROM pg_roles WHERE rolname='creator_privacy_ownership_metadata'
        AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
        AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL
      ), fn AS (SELECT to_regprocedure($1) AS oid), ledger AS (
       SELECT c.oid,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='creator' AND c.relname='schema_migration' AND c.relkind='r'
        AND NOT c.relispartition AND c.relowner=to_regrole('creator_owner')
      ), columns AS (
       SELECT a.attnum FROM pg_attribute a WHERE a.attrelid=(SELECT oid FROM ledger)
        AND a.attname IN('version','checksum') AND a.attnum>0 AND NOT a.attisdropped
      ) SELECT current_user=session_user AND session_user='creator_trust_runtime'
       AND EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND rolcanlogin
        AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb
        AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
       AND (SELECT count(*)=1 FROM purpose) AND (SELECT count(*)=1 FROM ledger)
       AND (SELECT count(*)=2 FROM columns)
       AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member IN(
         (SELECT oid FROM purpose),to_regrole('creator_trust_runtime')) OR roleid=(SELECT oid FROM purpose))
       AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole IN(
         (SELECT oid FROM purpose),to_regrole('creator_trust_runtime')))
       AND NOT EXISTS(SELECT FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass
        AND d.refobjid=(SELECT oid FROM purpose)
        AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
        AND NOT (
         (d.classid='pg_proc'::regclass AND d.objid=(SELECT oid FROM fn) AND d.objsubid=0 AND d.deptype='o') OR
         (d.classid='pg_namespace'::regclass AND d.objid IN(
          (SELECT oid FROM pg_namespace WHERE nspname='creator'),
          (SELECT oid FROM pg_namespace WHERE nspname='creator_trust')) AND d.objsubid=0 AND d.deptype='a') OR
         (d.classid='pg_class'::regclass AND d.objid=(SELECT oid FROM ledger)
          AND d.objsubid IN(SELECT attnum FROM columns) AND d.deptype='a')
        ))
       AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=(SELECT oid FROM purpose))
       AND EXISTS(SELECT FROM pg_proc p WHERE p.oid=(SELECT oid FROM fn)
        AND p.proowner=(SELECT oid FROM purpose) AND p.prosecdef AND p.provolatile='s'
        AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
        AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=$2)
       AND (SELECT count(*)=2 AND bool_and(acl.privilege_type='EXECUTE' AND NOT acl.is_grantable
        AND acl.grantor=p.proowner AND acl.grantee IN(p.proowner,to_regrole('creator_trust_runtime')))
        FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
        WHERE p.oid=(SELECT oid FROM fn))
       AND has_function_privilege(current_user,(SELECT oid FROM fn),'EXECUTE')
       AND (SELECT count(*)=2 AND bool_and(acl.privilege_type='SELECT' AND NOT acl.is_grantable
        AND acl.grantor=(SELECT relowner FROM ledger) AND a.attnum IN(SELECT attnum FROM columns))
        FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl
        WHERE a.attrelid=(SELECT oid FROM ledger) AND acl.grantee=(SELECT oid FROM purpose))
       AND (SELECT count(*)=2 AND bool_and(acl.privilege_type='USAGE' AND NOT acl.is_grantable
        AND acl.grantor=n.nspowner AND n.nspname IN('creator','creator_trust'))
        FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) acl
        WHERE acl.grantee=(SELECT oid FROM purpose))
       AND EXISTS(SELECT FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
        WHERE k.conrelid=to_regclass('creator_trust.privacy_job') AND k.conname='privacy_ownership_snapshot'
        AND k.contype='c' AND k.convalidated AND c.relrowsecurity AND c.relforcerowsecurity
        AND c.relowner=to_regrole('creator_trust_owner')
        AND encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex')=$3) AS ready`,
      [
        signature,
        "b126904968b063100776f241bed48f7ac56897877f13cbf0ca0038e917e9e155",
        "56793e3fa93249dcdfe02525c8612e22a084b1086e332fff5612eb671b9be899",
      ],
    )
  ).rows[0]?.ready;
  if (ready !== true) fail();
  const registered = (
    await client.query<{ ready: boolean }>(
      "SELECT creator_trust.all_scope_ownership_registered($1,$2) AS ready",
      [allScopeOwnershipMigration.version, allScopeOwnershipMigration.checksum],
    )
  ).rows[0]?.ready;
  if (registered !== true) fail();
}
