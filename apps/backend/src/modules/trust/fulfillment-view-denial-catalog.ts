import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";

const purpose = "creator_trust_fulfillment_view_denial";
export const fulfillmentViewDenialMigration = Object.freeze({
  version: "0200_w8_fulfillment_view_denial",
  checksum: "7c0fabdb974c9fcf46bd4c7fe70ea0dd11ceec87348d81962e1506fd9983024c",
});
// Filled from the actual closed rollback qualification, never startup metadata.
const catalogueChecksum =
  "f5459220bc340bf0c51ea65661df8ab51001a8e7d2093493a681e84dd575c866";

function unavailable(): never {
  throw new DomainError(
    "fulfillment_view_denial_unavailable",
    "The original answer recipients cannot be checked. Try again later.",
    503,
  );
}

/** Closed metadata review only. No original preparation, task, body or positive
 * permission is issued. Preserve the caller's transaction and search path. */
export async function fulfillmentViewDenialPurposeCatalogue(
  client: PoolClient,
) {
  await client.query("SAVEPOINT w8_fulfillment_view_catalog");
  try {
    await client.query("SET LOCAL search_path=pg_catalog");
    const permissions = await generationConsumerCatalogue(client, purpose);
    const issuerPermissions = await generationConsumerCatalogue(
      client,
      "creator_fulfillment_view_authority",
    );
    const projectionPermissions = await generationConsumerCatalogue(
      client,
      "creator_trust_denial",
    );
    const role = (
      await client.query(
        `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
         rolreplication,rolbypassrls,rolconfig,
         EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid) AS memberships,
         EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid) AS settings
         FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"`,
        [
          [
            purpose,
            "creator_trust_denial",
            "creator_fulfillment_view_authority",
          ],
        ],
      )
    ).rows;
    const dependencies = (
      await client.query(
        `SELECT d.deptype,a.type,a.object_names,a.object_args
         FROM pg_shdepend d CROSS JOIN LATERAL
          pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
         WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=to_regrole($1)
          AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
         ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
        [purpose],
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
          AND (p.proowner=to_regrole($1) OR p.proowner=to_regrole('creator_fulfillment_view_authority')
           OR p.oid=to_regprocedure('creator.commerce_fulfillment_view_metadata_bound()')
           OR has_function_privilege($1,p.oid,'EXECUTE'))
         ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
        [purpose],
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
         WHERE n.nspname='creator' AND c.relname IN('commerce_fulfillment_view_scope',
           'commerce_fulfillment_plan','commerce_fulfillment_member','content_index',
           'creator_profile','fan_profile','thread','content_tombstone','identity_session')
         ORDER BY c.relname COLLATE "C"`,
      )
    ).rows;
    return {
      permissions,
      issuerPermissions,
      projectionPermissions,
      role,
      dependencies,
      executables,
      relations,
    };
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT w8_fulfillment_view_catalog");
    await client.query("RELEASE SAVEPOINT w8_fulfillment_view_catalog");
  }
}

export async function assertFulfillmentViewDenialPurposeCatalog(
  client: PoolClient,
) {
  try {
    if (
      contentHash(await fulfillmentViewDenialPurposeCatalogue(client)) !==
      catalogueChecksum
    )
      unavailable();
  } catch {
    unavailable();
  }
}

/** Actual interactive core client only. Registration is not scope issuance.
 * The prepared consumer also checks the genuine W4 issuer and held restoration. */
export async function assertFulfillmentViewDenialCatalog(client: PoolClient) {
  try {
    for (const source of [
      {
        name: "w8_fulfillment_view_denial",
        path: "apps/backend/migrations/0200_w8_fulfillment_view_denial.sql",
        owner: "W8",
        checksum: fulfillmentViewDenialMigration.checksum,
      },
      {
        name: "w4_fulfillment_plan_custody",
        path: "apps/backend/src/modules/commerce/schema-fulfillment-plans.sql",
        owner: "W4",
        checksum:
          "d728ec3d71f3b9fd11c49b3f2faf91624e7b03868d5ab4b462b0730fddae4aa1",
      },
      {
        name: "w4_fulfillment_plan_read",
        path: "apps/backend/src/modules/commerce/schema-fulfillment-plan-read.sql",
        owner: "W4",
        checksum:
          "534f5c36b3d58eb2099f9a9a12452a60b287e4f1f3040c4ebeba99a3c8e96684",
      },
      {
        name: "w4_fulfillment_original_hash",
        path: "apps/backend/src/modules/commerce/schema-fulfillment-original-hash.sql",
        owner: "W4",
        checksum:
          "167b04e53310b6cba5dfa61cafba58f69242836698611a4d2c7e4136132583f5",
      },
    ]) {
      const active = await registeredMigration(source);
      if (!active) unavailable();
      if (
        (
          await client.query<{ ready: boolean }>(
            "SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2) AS ready",
            [active.version, active.checksum],
          )
        ).rows[0]?.ready !== true
      )
        unavailable();
    }
    const ready = (
      await client.query<{ ready: boolean }>(`SELECT current_user=session_user
      AND session_user='creator_runtime' AND current_setting('transaction_isolation')='read committed'
      AND EXISTS(SELECT FROM pg_roles r WHERE rolname=current_user AND rolcanlogin AND NOT rolinherit
       AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
       AND rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
       AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) AS ready`)
    ).rows[0]?.ready;
    if (ready !== true) unavailable();
    await assertFulfillmentViewDenialPurposeCatalog(client);
  } catch {
    unavailable();
  }
}
