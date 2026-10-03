import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";

const functions = [
  {
    signature: "creator_trust.domain_privacy_migration_registered(text,text)",
    sha256: "8795a31e4bcec9e6b592b460842cf20f4897409fddf65e5ec8e3e806d05f3af3",
  },
  {
    signature:
      "creator_trust.fence_domain_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid)",
    sha256: "292a246c3cdb988a6fa4ed60b0a1cd4bf785d15ce485f934ff38dc779ec265e2",
  },
  {
    signature: "creator_trust.finish_domain_privacy_task_scope()",
    sha256: "ddfab6cb18e029edc18ed0d16bc8a00c3ce4e98972c3e55472c845ec8b3ad368",
  },
];
const columns = [
  ...["version", "checksum"].map((column) => ({
    schema: "creator",
    relation: "schema_migration",
    column,
    privilege: "SELECT",
  })),
  ...[
    "id",
    "account_id",
    "kind",
    "scope",
    "creator_id",
    "thread_id",
    "state",
    "verified_at",
    "verification_ref",
    "owned_creator_ids",
    "ownership_ref",
  ].map((column) => ({
    schema: "creator_trust",
    relation: "privacy_job",
    column,
    privilege: "SELECT",
  })),
  {
    schema: "creator_trust",
    relation: "privacy_job",
    column: "id",
    privilege: "UPDATE",
  },
  ...["job_id", "domain", "state", "lease_token", "lease_until"].map(
    (column) => ({
      schema: "creator_trust",
      relation: "privacy_task",
      column,
      privilege: "SELECT",
    }),
  ),
  {
    schema: "creator_trust",
    relation: "privacy_task",
    column: "job_id",
    privilege: "UPDATE",
  },
];

/** Exact activated private-worker source and metadata-only purpose custody. A
 * manually installed proposal, extra grant/owner/membership or early trigger
 * is unavailable. Do not cache this across the real held transaction. */
export async function assertDomainPrivacyTaskCatalog(
  client: PoolClient,
  domain: "trust" | "growth",
) {
  const ready = (
    await client.query<{ ready: boolean }>(
      `WITH role AS (
        SELECT oid FROM pg_roles WHERE rolname='creator_domain_privacy_fence'
        AND NOT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
        AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL
      ), scope AS (
        SELECT c.oid,c.reltype,c.relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator_trust' AND c.relname='domain_privacy_commit_scope' AND c.relkind='r'
        AND c.relrowsecurity AND c.relforcerowsecurity AND c.relowner=(SELECT oid FROM role)
      ), expected_functions AS (
        SELECT to_regprocedure(signature) AS oid,sha256 FROM jsonb_to_recordset($3::jsonb) AS f(signature text,sha256 text)
      ), expected_columns AS (
        SELECT schema,relation,"column",privilege FROM jsonb_to_recordset($4::jsonb) AS c(schema text,relation text,"column" text,privilege text)
      ), actual_columns AS (
        SELECT n.nspname,c.relname AS relation,a.attname AS "column",acl.privilege_type AS privilege,
        acl.is_grantable,acl.grantor=c.relowner AS owner_granted
        FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attnum>0 AND NOT a.attisdropped
        AND acl.grantee=(SELECT oid FROM role)
      ) SELECT
        current_user=session_user AND session_user=$5
        AND nullif(current_setting('app.account_id',true),'') IS NULL
        AND nullif(current_setting('app.identity_session_id',true),'') IS NULL
        AND nullif(current_setting('app.creator_id',true),'') IS NULL
        AND nullif(current_setting('app.fan_id',true),'') IS NULL
        AND nullif(current_setting('generation.input_nonce',true),'') IS NULL
        AND nullif(current_setting('generation.terminal_nonce',true),'') IS NULL
        AND EXISTS(SELECT FROM pg_roles WHERE rolname=current_user AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
          AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolinherit AND rolconfig IS NULL)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user))
        AND creator_trust.domain_privacy_migration_registered($1,$2)
        AND (SELECT count(*)=1 FROM role) AND (SELECT count(*)=1 FROM scope)
        AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM role) OR roleid=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole IN((SELECT oid FROM role),(SELECT oid FROM pg_roles WHERE rolname=current_user)))
        AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_largeobject_metadata WHERE lomowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_foreign_server WHERE srvowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper WHERE fdwowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_language WHERE lanowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_tablespace WHERE spcowner=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=(SELECT oid FROM role) AND relkind IN('r','p','v','m','S','f') AND oid<>(SELECT oid FROM scope))
        AND NOT EXISTS(SELECT FROM pg_type t WHERE t.typowner=(SELECT oid FROM role)
          AND t.oid<>(SELECT reltype FROM scope) AND t.typelem<>(SELECT reltype FROM scope))
        AND (SELECT count(*)=3 FROM pg_proc p JOIN expected_functions e ON p.oid=e.oid
          WHERE p.proowner=(SELECT oid FROM role) AND p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
          AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=e.sha256)
        AND NOT EXISTS(SELECT FROM pg_proc WHERE proowner=(SELECT oid FROM role) AND oid NOT IN(SELECT oid FROM expected_functions))
        AND NOT EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
          WHERE (acl.grantee=(SELECT oid FROM role) AND p.oid NOT IN(SELECT oid FROM expected_functions))
          OR (p.oid IN(SELECT oid FROM expected_functions) AND
            (acl.privilege_type<>'EXECUTE' OR acl.is_grantable OR acl.grantor<>(SELECT oid FROM role)
              OR (acl.grantee<>(SELECT oid FROM role) AND NOT(p.oid IN(to_regprocedure('creator_trust.fence_domain_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid)'),to_regprocedure('creator_trust.domain_privacy_migration_registered(text,text)'))
                AND acl.grantee IN(SELECT oid FROM pg_roles WHERE rolname IN('creator_trust_worker','growth_worker')))))))
        AND has_function_privilege(current_user,to_regprocedure('creator_trust.fence_domain_privacy_task(uuid,uuid,text,text,uuid,uuid,text,uuid)'),'EXECUTE')
        AND NOT EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) acl
          WHERE c.relkind IN('r','p','v','m','S','f') AND acl.grantee=(SELECT oid FROM role) AND c.oid<>(SELECT oid FROM scope))
        AND NOT EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
          WHERE c.oid=(SELECT oid FROM scope) AND (acl.grantee<>c.relowner OR acl.grantor<>c.relowner OR acl.is_grantable))
        AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl
          WHERE n.nspname IN('creator','creator_trust','growth') AND acl.grantee=0)
        AND NOT EXISTS(SELECT FROM actual_columns a WHERE a.is_grantable OR NOT a.owner_granted
          OR NOT EXISTS(SELECT FROM expected_columns e WHERE e.schema=a.nspname AND e.relation=a.relation AND e."column"=a."column" AND e.privilege=a.privilege))
        AND (SELECT count(*) FROM actual_columns)=(SELECT count(*) FROM expected_columns)
        AND NOT EXISTS(SELECT FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
          WHERE acl.grantee=(SELECT oid FROM role) AND (n.nspname NOT IN('creator','creator_trust') OR acl.privilege_type<>'USAGE' OR acl.is_grantable OR acl.grantor<>n.nspowner))
        AND has_schema_privilege((SELECT oid FROM role),'creator_trust','USAGE')
        AND has_schema_privilege((SELECT oid FROM role),'creator','USAGE')
        AND NOT EXISTS(SELECT FROM pg_default_acl d LEFT JOIN LATERAL aclexplode(d.defaclacl) acl ON true WHERE d.defaclrole=(SELECT oid FROM role) OR acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_type t CROSS JOIN LATERAL aclexplode(t.typacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_language l CROSS JOIN LATERAL aclexplode(l.lanacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_foreign_server s CROSS JOIN LATERAL aclexplode(s.srvacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper w CROSS JOIN LATERAL aclexplode(w.fdwacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_tablespace t CROSS JOIN LATERAL aclexplode(t.spcacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND NOT EXISTS(SELECT FROM pg_largeobject_metadata m CROSS JOIN LATERAL aclexplode(m.lomacl) acl WHERE acl.grantee=(SELECT oid FROM role))
        AND (SELECT count(*)=7 FROM pg_attribute WHERE attrelid=(SELECT oid FROM scope) AND attnum>0 AND NOT attisdropped
          AND attname=ANY(ARRAY['pid','xid','caller','job_id','domain','lease_token','binding']))
        AND (SELECT count(*)=7 FROM pg_attribute WHERE attrelid=(SELECT oid FROM scope) AND attnum>0 AND NOT attisdropped)
        AND (SELECT count(*)=1 FROM pg_constraint WHERE conrelid=(SELECT oid FROM scope) AND contype='p'
          AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=(SELECT oid FROM scope) AND attname='pid'),
            (SELECT attnum FROM pg_attribute WHERE attrelid=(SELECT oid FROM scope) AND attname='xid')]::smallint[])
        AND (SELECT count(*)=1 FROM pg_trigger WHERE tgrelid=(SELECT oid FROM scope) AND NOT tgisinternal
          AND tgname='domain_privacy_task_commit_current' AND tgenabled='O' AND tgdeferrable AND tginitdeferred
          AND tgfoid=to_regprocedure('creator_trust.finish_domain_privacy_task_scope()'))
        AND (SELECT count(*)=1 FROM pg_trigger WHERE tgrelid=(SELECT oid FROM scope) AND NOT tgisinternal)
        AND (SELECT count(*)=1 FROM pg_policy WHERE polrelid=(SELECT oid FROM scope)
          AND polname='domain_fence_private' AND polroles=ARRAY[(SELECT oid FROM role)] AND polcmd='*' AND polpermissive
          AND pg_get_expr(polqual,polrelid)='true' AND pg_get_expr(polwithcheck,polrelid)='true')
        AND (SELECT count(*)=1 FROM pg_policy WHERE polrelid=(SELECT oid FROM scope))
        AND (SELECT count(*)=4 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='creator_trust' AND c.relname IN('privacy_job','privacy_task') AND p.polroles=ARRAY[(SELECT oid FROM role)]
          AND p.polpermissive AND pg_get_expr(p.polqual,p.polrelid)='true'
          AND ((p.polname='domain_privacy_fence_metadata' AND p.polcmd='r' AND p.polwithcheck IS NULL)
            OR (p.polname='domain_privacy_fence_lock' AND p.polcmd='w' AND pg_get_expr(p.polwithcheck,p.polrelid)='false')))
        AND (SELECT count(*)=4 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='creator_trust' AND c.relname IN('privacy_job','privacy_task')
          AND ((SELECT oid FROM role)=ANY(p.polroles) OR 0=ANY(p.polroles))) AS ready`,
      [
        "0103_w8_domain_privacy_task_fence",
        "040771e88c1cea0720519a2c162cd02319229d9c67171966fc98bc6a3476c15d",
        JSON.stringify(functions),
        JSON.stringify(columns),
        domain === "trust" ? "creator_trust_worker" : "growth_worker",
      ],
    )
  ).rows[0]?.ready;
  if (ready !== true)
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "Registered lifecycle authority is unavailable.",
      503,
    );
}
