import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredMigration } from "../../db/reviewed-migration.js";

const purpose = "creator_trust_fulfillment_publication_denial";
export const fulfillmentPublicationDenialMigration = Object.freeze({
  version: "0205_w8_fulfillment_publication_denial",
  checksum: "b72de739cfcc93d24f2af2f7813d396a7a1e44eb97e7bfc739aef7cb95a9dbf5",
});
// Filled from the actual closed rollback qualification, never startup metadata.
const catalogueChecksum =
  "8a58811f1184b529fb2709dcbca80780261dbae2aa8f14459bf337165c5529ce";

function unavailable(cause?: unknown): never {
  const failure = new DomainError(
    "fulfillment_publication_denial_unavailable",
    "The original publication recipients cannot be checked. Try again later.",
    503,
  );
  if (cause !== undefined)
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
    });
  throw failure;
}

/** Closed metadata review only. No original preparation, task, body or positive
 * permission is issued. Preserve the caller's transaction and search path. */
export async function fulfillmentPublicationDenialPurposeCatalogue(
  client: PoolClient,
) {
  await client.query("SAVEPOINT w8_fulfillment_publication_catalog");
  let completed = false;
  try {
    await client.query("SET LOCAL search_path=pg_catalog");
    const permissions = await generationConsumerCatalogue(client, purpose);
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
            "creator_fulfillment_publication_metadata",
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
          AND (p.proowner=to_regrole($1) OR has_function_privilege($1,p.oid,'EXECUTE'))
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
         WHERE n.nspname='creator' AND c.relname IN('commerce_fulfillment_publication_scope',
           'commerce_fulfillment_plan','commerce_fulfillment_member','content_index','content_publication',
           'creator_profile','fan_profile','thread','content_tombstone')
         ORDER BY c.relname COLLATE "C"`,
      )
    ).rows;
    completed = true;
    return { permissions, role, dependencies, executables, relations };
  } finally {
    // Only complete reads can restore this savepoint. The actual owner keeps
    // custody of any failed or uncertain query and its original private cause.
    if (completed) {
      await client.query(
        "ROLLBACK TO SAVEPOINT w8_fulfillment_publication_catalog",
      );
      await client.query(
        "RELEASE SAVEPOINT w8_fulfillment_publication_catalog",
      );
    }
  }
}

export async function assertFulfillmentPublicationDenialPurposeCatalog(
  client: PoolClient,
) {
  try {
    if (
      contentHash(
        await fulfillmentPublicationDenialPurposeCatalogue(client),
      ) !== catalogueChecksum
    )
      unavailable();
  } catch (cause) {
    unavailable(cause);
  }
}

/** The actual owner uses this before original204 preparation, and rechecks it
 * on the same held worker transaction. Registration/readiness is not issuance.
 * Restoration is the configured host's current same-client bookend. */
export async function assertFulfillmentPublicationDenialCatalog(
  client: PoolClient,
) {
  try {
    for (const source of [
      {
        name: "w8_fulfillment_publication_denial",
        path: "apps/backend/migrations/0205_w8_fulfillment_publication_denial.sql",
        owner: "W8",
        checksum: fulfillmentPublicationDenialMigration.checksum,
      },
      {
        name: "w4_fulfillment_publication_consumer",
        path: "apps/backend/src/modules/commerce/schema-fulfillment-publication-consumer.sql",
        owner: "W4",
        checksum:
          "b2eecdea88d937fb46018ceee1a4385502d366f3a82a061b3c4d5de5696981f0",
      },
    ]) {
      const active = await registeredMigration(source);
      if (!active) unavailable();
      const registered = (
        await client.query<{ ready: boolean }>(
          "SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2) AS ready",
          [active.version, active.checksum],
        )
      ).rows[0]?.ready;
      if (registered !== true) unavailable();
    }
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT current_user=session_user AND session_user='creator_publication_worker'
         AND current_setting('transaction_isolation')='read committed'
         AND EXISTS(SELECT FROM pg_roles r WHERE rolname=current_user AND rolcanlogin AND NOT rolinherit
          AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
          AND NOT rolreplication AND rolconfig IS NULL
          AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
          AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)) AS ready`,
      )
    ).rows[0]?.ready;
    if (ready !== true) unavailable();
    await assertFulfillmentPublicationDenialPurposeCatalog(client);
  } catch (cause) {
    unavailable(cause);
  }
}
