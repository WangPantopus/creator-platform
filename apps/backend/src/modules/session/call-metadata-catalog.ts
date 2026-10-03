import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";

const sourcePath = "apps/backend/migrations/0150_w6_account_call_metadata.sql";
const sourceHash =
  "8f4cebbdee2649a97b2e8e7e31173cbe4563dd6f951dd677f51cd61b50befc1a";
const definitionHash =
  "7307cc97902322401cccbc94c02c682fb579756150378fdbbc216ae75848715b";
const versionPattern = /^\d{4}_w6_account_call_metadata$/u;
type Source = Readonly<{ path: string; owner: string; checksum: string }>;
export type CallMetadataMigration = Readonly<{
  version: string;
  checksum: string;
}>;
declare const __QELVORA_REGISTERED_MIGRATION_SOURCES__:
  | Readonly<Record<string, Source>>
  | undefined;

/** Actual W8 executable allocation, including metadata-only version moves.
 * The reviewed path/SQL bytes stay fixed; reservations and readback hashes
 * cannot activate this purpose. Original allocation0150 is now held0197. */
export async function registeredCallMetadata(): Promise<
  CallMetadataMigration | undefined
> {
  let sources: Record<string, Source>;
  if (typeof __QELVORA_REGISTERED_MIGRATION_SOURCES__ !== "undefined") {
    sources = __QELVORA_REGISTERED_MIGRATION_SOURCES__;
  } else {
    let root = dirname(fileURLToPath(import.meta.url));
    let registry:
      | {
          migrations: {
            version: string;
            path: string;
            owner: string;
            sourceSha256?: string;
          }[];
        }
      | undefined;
    for (let depth = 0; depth < 8; depth++) {
      try {
        registry = JSON.parse(
          await readFile(join(root, "infra/migrations.json"), "utf8"),
        );
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const parent = dirname(root);
      if (parent === root) break;
      root = parent;
    }
    if (!registry) return undefined;
    const entries = registry.migrations.filter(
      (entry) =>
        entry.path === sourcePath || versionPattern.test(entry.version),
    );
    if (!entries.length) return undefined;
    if (entries.length !== 1) throw unavailable();
    const entry = entries[0]!;
    const checksum = createHash("sha256")
      .update(await readFile(join(root, entry.path)))
      .digest("hex");
    if (entry.sourceSha256 !== checksum) throw unavailable();
    sources = {
      [entry.version]: { path: entry.path, owner: entry.owner, checksum },
    };
  }
  const entries = Object.entries(sources).filter(
    ([version, entry]) =>
      entry.path === sourcePath || versionPattern.test(version),
  );
  if (!entries.length) return undefined;
  const [version, source] = entries[0]!;
  if (
    entries.length !== 1 ||
    !versionPattern.test(version) ||
    source.path !== sourcePath ||
    source.owner !== "W6" ||
    source.checksum !== sourceHash
  )
    throw unavailable();
  return Object.freeze({ version, checksum: sourceHash });
}
function unavailable() {
  return new DomainError(
    "call_metadata_unconfigured",
    "Call recovery is awaiting its reviewed current-account authority.",
    503,
  );
}
const columns = Object.entries({
  identity_session: ["id", "account_id", "expires_at", "revoked_at"],
  creator_profile: ["id", "account_id", "verification", "recovery_required"],
  fan_profile: ["id", "account_id"],
  thread: ["id", "creator_id", "fan_id", "deleted_at"],
  call_session: [
    "id",
    "creator_id",
    "fan_id",
    "thread_id",
    "commitment_id",
    "state",
    "version",
    "revoked_at",
    "hard_end_at",
  ],
}).flatMap(([relation, names]) =>
  names.map((column) => ({ relation, column })),
);

/** Recheck exact SQL/definition/isolated role and its direct purpose grants on
 * the held client. No catalogue result is cached across a call. The definer
 * receives five read-only column sets and one explicit executable grant;
 * unrelated effective app-schema definers are refused, including PUBLIC.
 * PostgreSQL built-ins and general invoker/RLS helpers remain inherited. */
export async function assertCallMetadataCatalog(
  client: PoolClient,
  migration: CallMetadataMigration,
): Promise<void> {
  const ready = (
    await client.query<{ ready: boolean }>(
      `WITH role AS (
    SELECT oid FROM pg_roles WHERE rolname='creator_call_metadata' AND NOT rolcanlogin AND NOT rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL
  ), runtime AS (
    SELECT oid FROM pg_roles WHERE rolname='creator_runtime' AND rolcanlogin AND NOT rolinherit
      AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls AND rolconfig IS NULL
  ), expected AS (
    SELECT relation,"column" FROM jsonb_to_recordset($4::jsonb) AS e(relation text,"column" text)
  ), actual AS (
    SELECT n.nspname,c.relname AS relation,a.attname AS "column",acl.privilege_type,acl.is_grantable,acl.grantor,c.relowner
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(a.attacl) acl WHERE a.attnum>0 AND NOT a.attisdropped AND acl.grantee=(SELECT oid FROM role)
  ), purpose AS (
    SELECT p.* FROM pg_proc p WHERE p.oid=to_regprocedure('creator.account_call_metadata(uuid)')
  ) SELECT current_user=session_user AND session_user='creator_runtime' AND current_setting('transaction_isolation')='read committed'
    AND (SELECT count(*)=1 FROM role) AND (SELECT count(*)=1 FROM runtime)
    AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
    AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member IN((SELECT oid FROM role),(SELECT oid FROM runtime)) OR roleid IN((SELECT oid FROM role),(SELECT oid FROM runtime)))
    AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole IN((SELECT oid FROM role),(SELECT oid FROM runtime)))
    AND (SELECT count(*)=1 FROM purpose WHERE proowner=(SELECT oid FROM role) AND prosecdef AND provolatile='v'
      AND proconfig=ARRAY['search_path=pg_catalog']::text[] AND encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')=$3)
    AND (SELECT count(*)=2 FROM purpose p CROSS JOIN LATERAL aclexplode(p.proacl) acl
      WHERE acl.privilege_type='EXECUTE' AND NOT acl.is_grantable AND acl.grantor=(SELECT oid FROM role)
      AND acl.grantee IN((SELECT oid FROM role),(SELECT oid FROM runtime)))
    AND (SELECT count(*)=2 FROM purpose p CROSS JOIN LATERAL aclexplode(p.proacl) acl)
    AND NOT EXISTS(SELECT FROM pg_proc WHERE proowner=(SELECT oid FROM role) AND oid<>(SELECT oid FROM purpose))
    AND NOT EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      WHERE acl.grantee=(SELECT oid FROM role) AND p.oid<>(SELECT oid FROM purpose))
    AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname IN('creator','creator_trust','growth') AND p.prosecdef
        AND p.oid<>(SELECT oid FROM purpose) AND has_function_privilege((SELECT oid FROM role),p.oid,'EXECUTE'))
    AND NOT EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) acl
      WHERE c.relkind IN('r','p','v','m','S','f') AND (acl.grantee=(SELECT oid FROM role) OR (acl.grantee=0 AND c.relnamespace IN(SELECT oid FROM pg_namespace WHERE nspname IN('creator','creator_trust','growth')))))
    AND (SELECT count(*) FROM actual)=(SELECT count(*) FROM expected)
    AND NOT EXISTS(SELECT FROM actual a WHERE a.nspname<>'creator' OR a.privilege_type<>'SELECT' OR a.is_grantable OR a.grantor<>a.relowner
      OR NOT EXISTS(SELECT FROM expected e WHERE e.relation=a.relation AND e."column"=a."column"))
    AND NOT EXISTS(SELECT FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) acl
      WHERE acl.grantee=0 AND n.nspname IN('creator','creator_trust','growth'))
    AND (SELECT count(*)=5 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='creator' AND c.relname IN(SELECT relation FROM expected)
      AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
    AND (SELECT count(*)=5 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='creator' AND c.relname IN(SELECT relation FROM expected) AND p.polname='account_call_metadata'
      AND p.polroles=ARRAY[(SELECT oid FROM role)] AND p.polcmd='r' AND p.polpermissive AND pg_get_expr(p.polqual,p.polrelid)='true' AND p.polwithcheck IS NULL)
    AND (SELECT count(*)=5 FROM pg_policy WHERE (SELECT oid FROM role)=ANY(polroles))
    AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_type WHERE typowner=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_foreign_server WHERE srvowner=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper WHERE fdwowner=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_language WHERE lanowner=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_tablespace WHERE spcowner=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_largeobject_metadata WHERE lomowner=(SELECT oid FROM role))
    AND has_schema_privilege((SELECT oid FROM role),'creator','USAGE')
    AND NOT EXISTS(SELECT FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
      WHERE acl.grantee=(SELECT oid FROM role) AND (n.nspname<>'creator' OR acl.privilege_type<>'USAGE' OR acl.is_grantable OR acl.grantor<>n.nspowner))
    AND NOT EXISTS(SELECT FROM pg_default_acl d LEFT JOIN LATERAL aclexplode(d.defaclacl) acl ON true WHERE d.defaclrole=(SELECT oid FROM role) OR acl.grantee=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) acl WHERE acl.grantee=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_type t CROSS JOIN LATERAL aclexplode(t.typacl) acl WHERE acl.grantee=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_language l CROSS JOIN LATERAL aclexplode(l.lanacl) acl WHERE acl.grantee=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_foreign_server s CROSS JOIN LATERAL aclexplode(s.srvacl) acl WHERE acl.grantee=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper w CROSS JOIN LATERAL aclexplode(w.fdwacl) acl WHERE acl.grantee=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_tablespace t CROSS JOIN LATERAL aclexplode(t.spcacl) acl WHERE acl.grantee=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) acl WHERE acl.grantee=(SELECT oid FROM role))
    AND NOT EXISTS(SELECT FROM pg_largeobject_metadata m CROSS JOIN LATERAL aclexplode(m.lomacl) acl WHERE acl.grantee=(SELECT oid FROM role)) AS ready`,
      [
        migration.version,
        migration.checksum,
        definitionHash,
        JSON.stringify(columns),
      ],
    )
  ).rows[0]?.ready;
  if (ready !== true) throw unavailable();
}
