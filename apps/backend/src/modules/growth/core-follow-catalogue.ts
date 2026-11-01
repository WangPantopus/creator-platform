import type { PoolClient, QueryConfig, QueryResultRow } from "pg";
import { copy } from "@qelvora/copy";
import review from "../../../../../infra/migrations/reviews/20261027-core-follow.json" with { type: "json" };
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { registeredComparisonProfile } from "../../db/comparison-profile.js";
import {
  assertRegisteredMigration,
  registeredMigration,
} from "../../db/reviewed-migration.js";

export const coreFollowSource = Object.freeze({
  name: "w7_core_follow_metadata",
  owner: "W7",
  path: "apps/backend/src/modules/growth/migrations/pending_w7_core_follow_metadata.sql",
  checksum: "29c0261cdfce50be434d8b8b49c21e23df6057613d521c8e40a13c3928d63796",
});
export interface CoreFollowMigration {
  version: string;
  checksum: string;
  functionDefinitionSha256: string;
}
const purpose = "creator_growth_follow_metadata";
const hash = /^[a-f0-9]{64}$/u;

function unavailable(cause?: unknown): never {
  const failure = new DomainError(
    "growth_core_follow_unconfigured",
    copy.growthErrorGrowthAuthorityRequired,
    503,
  );
  if (cause !== undefined)
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
    });
  throw failure;
}

async function metadata<Row extends QueryResultRow = QueryResultRow>(
  client: PoolClient,
  text: string,
  values: unknown[] = [],
) {
  const query: QueryConfig & { query_timeout: number } = {
    text,
    values,
    query_timeout: 5000,
  };
  return client.query<Row>(query);
}

/** Closed metadata only. No fan/session, family scope or Follow Boolean is
 * issued. Canonical names survive restores and the caller's path is restored
 * only after fully settled reads; uncertain failures belong to its custodian. */
export async function coreFollowPurposeCatalogue(client: PoolClient) {
  await metadata(client, "SAVEPOINT growth_core_follow_catalogue");
  await metadata(client, "SET LOCAL search_path=pg_catalog");
  const permissions = await generationConsumerCatalogue(client, purpose, {
    queryTimeout: 5000,
  });
  const roles = (
    await metadata(
      client,
      `
    SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,
      rolreplication,rolbypassrls,rolconfig,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'member',pg_get_userbyid(m.member),'role',pg_get_userbyid(m.roleid),
        'grantor',pg_get_userbyid(m.grantor),'admin',m.admin_option,
        'inherit',m.inherit_option,'set',m.set_option)
        ORDER BY pg_get_userbyid(m.member) COLLATE "C",pg_get_userbyid(m.roleid) COLLATE "C",
          pg_get_userbyid(m.grantor) COLLATE "C")
        FROM pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid),'[]'::jsonb) AS memberships,
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'database',CASE WHEN s.setdatabase=0 THEN '*' ELSE d.datname END,'settings',s.setconfig)
        ORDER BY CASE WHEN s.setdatabase=0 THEN '*' ELSE d.datname END COLLATE "C")
        FROM pg_db_role_setting s LEFT JOIN pg_database d ON d.oid=s.setdatabase
        WHERE s.setrole=r.oid),'[]'::jsonb) AS settings
    FROM pg_roles r WHERE rolname=ANY($1::text[]) ORDER BY rolname COLLATE "C"`,
      [[purpose, "creator_runtime", "growth_owner"]],
    )
  ).rows;
  const dependencies = (
    await metadata(
      client,
      `
    SELECT d.deptype,a.type,a.object_names,a.object_args
    FROM pg_shdepend d CROSS JOIN LATERAL
      pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
    WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=to_regrole($1)
      AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
    ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
      [purpose],
    )
  ).rows;
  const executables = (
    await metadata(
      client,
      `
    SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_userbyid(p.proowner) AS owner,p.prokind,p.prosecdef,p.provolatile,p.proconfig,
      pg_get_functiondef(p.oid) AS definition,
      ARRAY(SELECT a::text FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a
        ORDER BY a::text COLLATE "C") AS grants,
      has_function_privilege($1,p.oid,'EXECUTE') AS purpose_execute,
      has_function_privilege('creator_runtime',p.oid,'EXECUTE') AS core_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
      AND (p.proowner=to_regrole($1) OR n.nspname='creator_growth_metadata'
        OR p.prosecdef AND has_function_privilege($1,p.oid,'EXECUTE'))
    ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",
      pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
      [purpose],
    )
  ).rows;
  const namespace = (
    await metadata(
      client,
      `
    SELECT n.nspname,pg_get_userbyid(n.nspowner) AS owner,
      ARRAY(SELECT a::text FROM unnest(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
        ORDER BY a::text COLLATE "C") AS grants,
      ARRAY(SELECT c.relname||':'||c.relkind::text FROM pg_class c WHERE c.relnamespace=n.oid
        ORDER BY c.relname COLLATE "C",c.relkind) AS relations
    FROM pg_namespace n WHERE n.nspname='creator_growth_metadata'`,
    )
  ).rows;
  // The private session table retains its original RLS behavior. Capture both
  // source relations' actual columns/ACLs and every policy, not a row count or
  // only the new role's direct grants. Values and bearer material are never read.
  const relations = (
    await metadata(
      client,
      `
    SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
      pg_get_userbyid(c.relowner) AS owner,
      ARRAY(SELECT a::text FROM unnest(coalesce(c.relacl,acldefault('r',c.relowner))) a
        ORDER BY a::text COLLATE "C") AS grants,
      (SELECT jsonb_agg(jsonb_build_object('number',a.attnum,'name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,
        'identity',a.attidentity,'generated',a.attgenerated,
        'default',pg_get_expr(d.adbin,d.adrelid),
        'grants',ARRAY(SELECT acl::text FROM unnest(a.attacl) acl ORDER BY acl::text COLLATE "C"))
        ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      (SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,
        'permissive',p.polpermissive,
        'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END
          FROM unnest(p.polroles) r ORDER BY CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END COLLATE "C"),
        'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))
        ORDER BY p.polname COLLATE "C") FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='creator' AND c.relname='identity_session')
      OR (n.nspname='growth' AND c.relname='follow')
    ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
    )
  ).rows;
  await metadata(client, "ROLLBACK TO SAVEPOINT growth_core_follow_catalogue");
  await metadata(client, "RELEASE SAVEPOINT growth_core_follow_catalogue");
  return {
    permissions,
    roles,
    dependencies,
    executables,
    namespace,
    relations,
  };
}

/** Fixed independently measured wave review, for closed source/operator checks. */
export async function assertCoreFollowPurposeCatalog(client: PoolClient) {
  try {
    if (
      ![
        review.coreFollowCatalogueChecksum,
        review.coreFollowIncomingCatalogueChecksum,
      ].includes(contentHash(await coreFollowPurposeCatalogue(client)))
    )
      unavailable();
  } catch (cause) {
    unavailable(cause);
  }
}

async function registeredCoreFollowProfile() {
  const source = await registeredMigration(coreFollowSource);
  if (!source) return undefined;
  const profile = await registeredComparisonProfile();
  if (
    !profile ||
    !("coreFollowDefinitionSha256" in profile) ||
    !("coreFollowCatalogueChecksum" in profile) ||
    !("coreFollowIncomingCatalogueChecksum" in profile) ||
    typeof profile.coreFollowDefinitionSha256 !== "string" ||
    typeof profile.coreFollowCatalogueChecksum !== "string" ||
    typeof profile.coreFollowIncomingCatalogueChecksum !== "string" ||
    !hash.test(profile.coreFollowDefinitionSha256) ||
    !hash.test(profile.coreFollowCatalogueChecksum) ||
    !hash.test(profile.coreFollowIncomingCatalogueChecksum) ||
    source.version !== review.sources[0]?.version ||
    source.checksum !== coreFollowSource.checksum
  )
    unavailable();
  return {
    profile,
    migration: Object.freeze({
      ...source,
      functionDefinitionSha256: profile.coreFollowDefinitionSha256,
    }),
  };
}

/** An executable registration selects fixed reviewed metadata. Matching SQL
 * and ledger alone, or a caller-supplied descriptor, cannot activate this seam. */
export async function registeredCoreFollowMigration(): Promise<
  CoreFollowMigration | undefined
> {
  return (await registeredCoreFollowProfile())?.migration;
}

/** Reuse the proposal's complete structural guard, with actual executable and
 * selected catalogue custody checked on the same held original core client. */
export async function assertCoreFollowCatalog(
  client: PoolClient,
  migration: CoreFollowMigration,
) {
  const registered = await registeredCoreFollowProfile();
  if (
    !registered ||
    registered.migration.version !== migration.version ||
    registered.migration.checksum !== migration.checksum ||
    registered.migration.functionDefinitionSha256 !==
      migration.functionDefinitionSha256
  )
    unavailable();
  await assertRegisteredMigration(client, coreFollowSource);
  const schema = (
    await client.query<{ ready: boolean }>(
      `SELECT
     current_setting('server_version_num')::integer/10000=17
     AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
     AND EXISTS(SELECT FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner
       WHERE p.oid=to_regprocedure('creator_growth_metadata.core_follow(uuid,uuid,uuid)')
       AND p.prokind='f' AND p.prosecdef AND p.provolatile='v' AND p.prorettype='boolean'::regtype
       AND p.proconfig=ARRAY['search_path=pg_catalog','row_security=on']::text[]
       AND CASE WHEN p.prokind='f' THEN encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=$3 ELSE false END
       AND r.rolname='creator_growth_follow_metadata' AND NOT r.rolcanlogin
       AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
       AND NOT r.rolinherit AND NOT r.rolreplication
       AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
       AND NOT EXISTS(SELECT FROM pg_db_role_setting setting WHERE setting.setrole=r.oid
         AND setting.setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database())))
       AND NOT EXISTS(SELECT FROM pg_auth_members m WHERE m.member=r.oid OR m.roleid=r.oid)
       AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_class c WHERE c.relowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_type t WHERE t.typowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_language l WHERE l.lanowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_foreign_server s WHERE s.srvowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper w WHERE w.fdwowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_database d WHERE d.datdba=r.oid OR has_database_privilege(r.oid,d.oid,'CREATE'))
       AND NOT EXISTS(SELECT FROM pg_largeobject_metadata o WHERE o.lomowner=r.oid)
       AND NOT EXISTS(SELECT FROM pg_proc other WHERE other.proowner=r.oid AND other.oid<>p.oid)
       AND has_function_privilege(current_user,p.oid,'EXECUTE')
       AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
         WHERE a.privilege_type='EXECUTE' AND (a.grantee NOT IN(r.oid,'creator_runtime'::regrole::oid)
           OR (a.grantee='creator_runtime'::regrole::oid AND a.is_grantable)))
       AND NOT EXISTS(SELECT FROM pg_namespace n WHERE has_schema_privilege(r.oid,n.oid,'CREATE'))
       AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND n.nspname NOT IN('public','creator','growth','creator_growth_metadata') AND has_schema_privilege(r.oid,n.oid,'USAGE'))
       AND NOT EXISTS(SELECT FROM pg_class rel JOIN pg_namespace n ON n.oid=rel.relnamespace
         WHERE rel.relkind='S' AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND CASE WHEN rel.relkind='S' THEN has_sequence_privilege(r.oid,rel.oid,'USAGE,SELECT,UPDATE') ELSE false END)
       AND NOT EXISTS(SELECT FROM pg_proc other JOIN pg_namespace n ON n.oid=other.pronamespace
         WHERE other.oid<>p.oid AND other.prosecdef AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
         AND has_schema_privilege(r.oid,n.oid,'USAGE') AND has_function_privilege(r.oid,other.oid,'EXECUTE'))
       AND EXISTS(SELECT FROM pg_namespace n WHERE n.oid=p.pronamespace
         AND n.nspowner='growth_owner'::regrole::oid
         AND has_schema_privilege(current_user,n.oid,'USAGE')
         AND NOT has_schema_privilege('creator_runtime',n.oid,'CREATE')
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
           WHERE a.grantee=0 AND a.privilege_type IN('USAGE','CREATE')))
       AND NOT EXISTS(SELECT FROM pg_proc other WHERE other.pronamespace=p.pronamespace AND other.oid<>p.oid)
       AND NOT EXISTS(SELECT FROM pg_class rel WHERE rel.relnamespace=p.pronamespace)
       AND NOT EXISTS(SELECT FROM pg_attribute col JOIN pg_class rel ON rel.oid=col.attrelid
         JOIN pg_namespace n ON n.oid=rel.relnamespace
         WHERE col.attnum>0 AND NOT col.attisdropped AND rel.relkind IN('r','p','v','m','f')
         AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND (
           (has_column_privilege(r.oid,rel.oid,col.attnum,'SELECT') AND NOT (
             (n.nspname='creator' AND rel.relname='identity_session' AND col.attname IN('id','account_id','revoked_at','expires_at'))
             OR (n.nspname='growth' AND rel.relname='follow' AND col.attname IN('account_id','creator_id'))))
           OR has_column_privilege(r.oid,rel.oid,col.attnum,'INSERT,REFERENCES')
           OR (has_column_privilege(r.oid,rel.oid,col.attnum,'UPDATE') AND NOT (
             n.nspname='growth' AND rel.relname='follow' AND col.attname='created_at'))))
       AND NOT EXISTS(SELECT FROM pg_class rel JOIN pg_namespace n ON n.oid=rel.relnamespace
         WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND rel.relkind IN('r','p','v','m','f')
         AND has_table_privilege(r.oid,rel.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
       AND EXISTS(SELECT FROM pg_policy policy JOIN pg_class rel ON rel.oid=policy.polrelid
         JOIN pg_namespace n ON n.oid=rel.relnamespace WHERE n.nspname='growth' AND rel.relname='follow'
         AND policy.polname='core_follow_metadata_lock' AND policy.polcmd='w'
         AND policy.polroles=ARRAY[r.oid] AND pg_get_expr(policy.polwithcheck,policy.polrelid)='false'))
     AND EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='growth' AND c.relname='follow' AND c.relrowsecurity AND c.relforcerowsecurity)
     AS ready`,
      [
        migration.version,
        migration.checksum,
        migration.functionDefinitionSha256,
      ],
    )
  ).rows[0];
  if (!schema?.ready) throw unavailable();
  if (
    ![
      registered.profile.coreFollowCatalogueChecksum,
      registered.profile.coreFollowIncomingCatalogueChecksum,
    ].includes(contentHash(await coreFollowPurposeCatalogue(client)))
  )
    unavailable();
}
