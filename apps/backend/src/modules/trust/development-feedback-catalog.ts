import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import { registeredMigration } from "../../db/reviewed-migration.js";

export const developmentFeedbackSource = Object.freeze({
  name: "w8_development_feedback_lifecycle",
  path: "apps/backend/migrations/0207_w8_development_feedback_lifecycle.sql",
  owner: "W8",
  checksum: "7cff4f879018b90f7597a2f1b674837eda3f5eed01fa33b20809c24bc905cab5",
});
export const developmentFeedbackVersion =
  "0207_w8_development_feedback_lifecycle";
const purpose = "creator_development_feedback_lifecycle";
const functions = [
  {
    signature: "creator_trust.development_feedback_registered(text,text)",
    hash: "fc453aebcf0ca1aa31e6b083f128148509f32eed53e0904d3d65755ed5c9e4a3",
    volatility: "s",
    callers: [purpose, "creator_runtime", "creator_trust_worker"],
  },
  {
    signature: "creator_trust.purge_development_feedback(integer)",
    hash: "da89da82833a6cbdfe504420fcb0add612c48bebbe8f5ee686712f99bfc8c5f6",
    volatility: "v",
    callers: [purpose, "creator_trust_worker"],
  },
  {
    signature: "creator_trust.withdraw_development_feedback()",
    hash: "5201558528ed8f2a5ef82fc6a06593d9833a5fa49ed9927609d6ceb0991b8ace",
    volatility: "v",
    callers: [purpose],
  },
];
const constraints = [
  {
    relation: "conversation_feedback",
    name: "development_feedback_expiry",
    hash: "2b2f8af6b85d593bf11c911a3ed985be056a54f1d2333885cd41c43df16ff67e",
  },
  {
    relation: "identity_event",
    name: "development_intro_event_policy",
    hash: "650267281fe782e3b1886dd050453dc46347d531648985f88154c0eb11d07d27",
  },
];
const policies = [
  {
    name: "development_feedback_lifecycle_delete",
    relation: "conversation_feedback",
    hash: "78b79fc126b676d98fd47c9088e8f6aa42acf2cd1b5cb5a56010faf1e7ff43be",
  },
  {
    name: "development_feedback_lifecycle_read",
    relation: "conversation_feedback",
    hash: "15aae92b307a39e4246ab8e6454ba41f937b4e648db872a6cbac8e37971dd12e",
  },
  {
    name: "development_intro_lifecycle_delete",
    relation: "identity_event",
    hash: "ec4b684d448c17757c3a08c4a4c7ea36c7779e46a74ce9042e5640a49015b6ca",
  },
  {
    name: "development_intro_lifecycle_read",
    relation: "identity_event",
    hash: "eacbb1e7f91c0a5538f90d5f2e0f7d5b5cb3753d0e261f0e38b3d0f46bda99bd",
  },
  {
    name: "development_intro_lifecycle_update",
    relation: "identity_event",
    hash: "87d9d400c875b7786a5ff72afb994577054cecef3a345275289a155a41a13586",
  },
];
const indexes = [
  {
    name: "development_intro_event_expiry",
    hash: "2e58d018bd9351ad8385c3476b2fa9b9d48b6b7a7412b8aa58f0ec15148226e1",
    unique: false,
  },
  {
    name: "development_intro_once_per_account",
    hash: "4d86ff95480793a5c99ddfd882837c4eeded324c1d2b9205b61bee3b991491e9",
    unique: true,
  },
  {
    name: "development_intro_one_acknowledgement",
    hash: "6fad03f0b9785a9cc248349a7a808af8387e434c3ff285bb610dcf5f3f192002",
    unique: true,
  },
];
const columns = [
  ...[
    "message_id",
    "message_version",
    "account_id",
    "consent_policy_version",
    "consented_at",
    "expires_at",
  ].map((column) => ({
    relation: "conversation_feedback",
    column,
    privilege: "SELECT",
  })),
  ...[
    "id",
    "account_id",
    "kind",
    "aggregate_id",
    "version",
    "created_at",
    "policy_version",
    "expires_at",
  ].map((column) => ({
    relation: "identity_event",
    column,
    privilege: "SELECT",
  })),
  ...["kind", "aggregate_id", "version"].map((column) => ({
    relation: "identity_event",
    column,
    privilege: "UPDATE",
  })),
  ...["version", "checksum"].map((column) => ({
    relation: "schema_migration",
    column,
    privilege: "SELECT",
  })),
];

export function feedbackUnavailable() {
  return new DomainError(
    "development_feedback_unconfigured",
    "Feedback is not available yet.",
    503,
  );
}

/** The executable active registry, not a reservation or hand-installed function,
 * activates this finite development policy. No positive result is cached. */
export async function assertDevelopmentFeedbackCatalog(client: PoolClient) {
  const registered = await registeredMigration(developmentFeedbackSource);
  if (registered?.version !== developmentFeedbackVersion)
    throw feedbackUnavailable();
  await assertDevelopmentFeedbackPurposeCatalog(client);
}

/** Closed source qualification may inspect purpose custody without activating
 * application consent. Application callers must use the registry gate above. */
export async function assertDevelopmentFeedbackPurposeCatalog(
  client: PoolClient,
) {
  await client.query("SAVEPOINT w8_feedback_catalog");
  try {
    const ready = (
      await client.query<{ ready: boolean }>(
        `WITH purpose AS (
      SELECT oid FROM pg_roles WHERE rolname=$1 AND NOT rolcanlogin AND NOT rolinherit
       AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
       AND NOT rolbypassrls AND rolconfig IS NULL
    ), relations AS (SELECT c.oid,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='creator' AND c.relname IN('conversation_feedback','identity_event','schema_migration')
    ), expected_functions AS (
      SELECT *,to_regprocedure(signature) AS oid FROM jsonb_to_recordset($2::jsonb)
       AS f(signature text,hash text,volatility text,callers text[])
    ), expected_columns AS (
      SELECT * FROM jsonb_to_recordset($3::jsonb) AS c(relation text,"column" text,privilege text)
    ), expected_constraints AS (
      SELECT * FROM jsonb_to_recordset($4::jsonb) AS c(relation text,name text,hash text)
    ), expected_policies AS (
      SELECT * FROM jsonb_to_recordset($5::jsonb) AS p(name text,relation text,hash text)
    ), expected_indexes AS (
      SELECT * FROM jsonb_to_recordset($6::jsonb) AS i(name text,hash text,"unique" boolean)
    ), actual_columns AS (
      SELECT n.nspname,c.relname AS relation,a.attname AS "column",acl.privilege_type AS privilege,
       acl.is_grantable,acl.grantor=c.relowner AS owner_granted,c.oid,a.attnum
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_attribute a ON a.attrelid=c.oid CROSS JOIN LATERAL aclexplode(a.attacl) acl
      WHERE acl.grantee=(SELECT oid FROM purpose) AND a.attnum>0 AND NOT a.attisdropped
    ), actual_policies AS (
      SELECT p.* FROM pg_policy p WHERE (SELECT oid FROM purpose)=ANY(p.polroles)
    ) SELECT current_user=session_user AND session_user IN('creator_runtime','creator_trust_worker')
      AND current_setting('transaction_isolation')='read committed'
      AND EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND rolcanlogin AND NOT rolinherit
       AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication
       AND NOT rolbypassrls AND rolconfig IS NULL)
      AND (SELECT count(*)=1 FROM purpose)
      AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member IN((SELECT oid FROM purpose),to_regrole(session_user))
       OR roleid=(SELECT oid FROM purpose))
      AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole IN((SELECT oid FROM purpose),to_regrole(session_user)))
      AND (SELECT count(*)=3 FROM pg_proc WHERE proowner=(SELECT oid FROM purpose))
      AND (SELECT count(*)=3 FROM expected_functions e JOIN pg_proc p ON p.oid=e.oid
       WHERE p.proowner=(SELECT oid FROM purpose) AND p.prosecdef AND p.provolatile::text=e.volatility
        AND p.proconfig=ARRAY['search_path=pg_catalog']::text[]
        AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=e.hash
        AND (SELECT count(*)=cardinality(e.callers) AND bool_and(acl.privilege_type='EXECUTE'
          AND NOT acl.is_grantable AND acl.grantor=p.proowner AND pg_get_userbyid(acl.grantee)=ANY(e.callers))
         FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl))
      AND NOT EXISTS(SELECT FROM pg_shdepend d WHERE d.refclassid='pg_authid'::regclass
       AND d.refobjid=(SELECT oid FROM purpose) AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
       AND NOT (
        (d.classid='pg_proc'::regclass AND d.objid IN(SELECT oid FROM expected_functions) AND d.objsubid=0 AND d.deptype='o') OR
        (d.classid='pg_namespace'::regclass AND d.objid IN(SELECT oid FROM pg_namespace WHERE nspname IN('creator','creator_trust')) AND d.objsubid=0 AND d.deptype='a') OR
        (d.classid='pg_class'::regclass AND d.deptype='a' AND (
         (d.objsubid=0 AND d.objid IN((SELECT oid FROM relations WHERE relname='identity_event'),(SELECT oid FROM relations WHERE relname='conversation_feedback'))) OR
         EXISTS(SELECT FROM actual_columns a WHERE a.oid=d.objid AND a.attnum=d.objsubid))) OR
        (d.classid='pg_policy'::regclass AND d.objid IN(SELECT oid FROM actual_policies) AND d.objsubid=0 AND d.deptype='r')
       ))
      AND (SELECT count(*)=19 FROM actual_columns)
      AND NOT EXISTS(SELECT FROM actual_columns a WHERE a.nspname<>'creator' OR a.is_grantable OR NOT a.owner_granted
       OR NOT EXISTS(SELECT FROM expected_columns e WHERE e.relation=a.relation AND e."column"=a."column" AND e.privilege=a.privilege))
      AND (SELECT count(*)=2 AND bool_and(acl.privilege_type='DELETE' AND NOT acl.is_grantable
       AND acl.grantor=c.relowner AND c.oid IN((SELECT oid FROM relations WHERE relname='identity_event'),(SELECT oid FROM relations WHERE relname='conversation_feedback')))
       FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) acl WHERE acl.grantee=(SELECT oid FROM purpose))
      AND (SELECT count(*)=2 AND bool_and(acl.privilege_type='USAGE' AND NOT acl.is_grantable
       AND acl.grantor=n.nspowner AND n.nspname IN('creator','creator_trust'))
       FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) acl WHERE acl.grantee=(SELECT oid FROM purpose))
      AND NOT EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) acl
       WHERE c.oid IN(SELECT oid FROM relations) AND acl.grantee=0)
      AND NOT EXISTS(SELECT FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) acl
       WHERE n.nspname IN('creator','creator_trust') AND acl.grantee=0 AND acl.privilege_type='CREATE')
      AND (SELECT count(*)=3 FROM pg_class c WHERE c.oid IN((SELECT oid FROM relations WHERE relname='schema_migration'),
       (SELECT oid FROM relations WHERE relname='identity_event'),(SELECT oid FROM relations WHERE relname='conversation_feedback'))
       AND c.relkind='r' AND NOT c.relispartition AND c.relowner=to_regrole('creator_owner')
       AND (c.oid=(SELECT oid FROM relations WHERE relname='schema_migration') OR(c.relrowsecurity AND c.relforcerowsecurity)))
      AND (SELECT count(*)=2 FROM expected_constraints e JOIN pg_constraint k
       ON k.conrelid=(SELECT oid FROM relations WHERE relname=e.relation) AND k.conname=e.name
       WHERE k.contype='c' AND NOT k.convalidated
        AND encode(sha256(convert_to(pg_get_constraintdef(k.oid),'UTF8')),'hex')=e.hash)
      AND (SELECT count(*)=5 FROM actual_policies)
      AND (SELECT count(*)=5 FROM actual_policies p JOIN expected_policies e ON p.polname=e.name
       AND p.polrelid=(SELECT oid FROM relations WHERE relname=e.relation) WHERE p.polroles=ARRAY[(SELECT oid FROM purpose)]::oid[]
       AND encode(sha256(convert_to(concat_ws('|',p.polcmd::text,p.polpermissive::text,
         pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)),'UTF8')),'hex')=e.hash)
      AND EXISTS(SELECT FROM pg_attribute WHERE attrelid=(SELECT oid FROM relations WHERE relname='identity_event') AND attname='policy_version'
       AND atttypid='text'::regtype AND NOT attisdropped AND NOT attnotnull AND NOT atthasdef)
      AND EXISTS(SELECT FROM pg_attribute WHERE attrelid=(SELECT oid FROM relations WHERE relname='identity_event') AND attname='expires_at'
       AND atttypid='timestamptz'::regtype AND NOT attisdropped AND NOT attnotnull AND NOT atthasdef)
      AND (SELECT count(*)=1 FROM pg_trigger WHERE tgrelid=(SELECT oid FROM relations WHERE relname='conversation_feedback') AND NOT tgisinternal)
      AND EXISTS(SELECT FROM pg_trigger WHERE tgrelid=(SELECT oid FROM relations WHERE relname='conversation_feedback')
       AND tgname='development_feedback_withdrawal' AND tgtype=9 AND tgenabled='O' AND NOT tgisinternal
       AND tgfoid=to_regprocedure('creator_trust.withdraw_development_feedback()') AND tgnargs=0 AND tgqual IS NULL)
      AND NOT EXISTS(SELECT FROM pg_trigger WHERE tgrelid=(SELECT oid FROM relations WHERE relname='identity_event') AND NOT tgisinternal)
      AND (SELECT count(*)=3 FROM expected_indexes e JOIN pg_class c ON c.relname=e.name
       JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_index i ON i.indexrelid=c.oid
       WHERE n.nspname='creator' AND c.relowner=to_regrole('creator_owner')
        AND i.indrelid=(SELECT oid FROM relations WHERE relname='identity_event')
        AND i.indisvalid AND i.indisready AND i.indislive AND i.indisunique=e."unique"
        AND encode(sha256(convert_to(pg_get_indexdef(c.oid),'UTF8')),'hex')=e.hash)
      AS ready`,
        [
          purpose,
          JSON.stringify(functions),
          JSON.stringify(columns),
          JSON.stringify(constraints),
          JSON.stringify(policies),
          JSON.stringify(indexes),
        ],
      )
    ).rows[0]?.ready;
    if (ready !== true) throw feedbackUnavailable();
    const registered = (
      await client.query<{ ready: boolean }>(
        "SELECT creator_trust.development_feedback_registered($1,$2) AS ready",
        [developmentFeedbackVersion, developmentFeedbackSource.checksum],
      )
    ).rows[0]?.ready;
    if (registered !== true) throw feedbackUnavailable();
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT w8_feedback_catalog");
    throw error;
  } finally {
    await client.query("RELEASE SAVEPOINT w8_feedback_catalog");
  }
}
