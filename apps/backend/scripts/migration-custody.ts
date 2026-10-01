import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";

export const repositoryRoot = new URL("../../../", import.meta.url);
export const sha256 = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export type MigrationRow = {
  version: string;
  checksum: string | null;
  appliedAt: string;
};
type Source = { version: string; path: string; checksum: string };
export type AdoptionProfile = {
  schemaVersion: 1;
  id: "w5-20260930";
  postgresMajor: number;
  beforeSchemaSha256: string;
  afterSchemaSha256: string;
  original: (Source & { canonicalVersion: string })[];
  missing: Source[];
};

export async function loadAdoptionProfile() {
  const profile = JSON.parse(
    await readFile(
      new URL("infra/migrations/adoptions/w5-20260930.json", repositoryRoot),
      "utf8",
    ),
  ) as AdoptionProfile;
  if (
    profile.schemaVersion !== 1 ||
    profile.id !== "w5-20260930" ||
    profile.postgresMajor !== 17 ||
    profile.original.length !== 35 ||
    profile.missing.length !== 6
  )
    throw new Error("The reviewed W5 adoption profile is unavailable.");
  const sources = [...profile.original, ...profile.missing];
  const sql = new Map<string, string>();
  for (const source of sources) {
    if (
      !/^\d{4}_[a-z0-9_]+$/u.test(source.version) ||
      !/^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/u.test(
        source.path,
      ) ||
      source.path.includes("..") ||
      !/^[a-f0-9]{64}$/u.test(source.checksum)
    )
      throw new Error("Invalid migration adoption source.");
    const body = await readFile(new URL(source.path, repositoryRoot), "utf8");
    if (sha256(body) !== source.checksum)
      throw new Error(`Migration source changed: ${source.version}.`);
    sql.set(source.version, body);
  }
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", repositoryRoot), "utf8"),
  ) as {
    migrations: { version: string; path: string }[];
    reserved: { version?: string; sourceSha256?: string }[];
  };
  const canonicalSources = new Map(
    sources.map((source) => [
      "canonicalVersion" in source ? source.canonicalVersion : source.version,
      source,
    ]),
  );
  for (const source of registry.migrations) {
    const reviewed = canonicalSources.get(source.version);
    if (
      reviewed &&
      sha256(await readFile(new URL(source.path, repositoryRoot))) !==
        reviewed.checksum
    )
      throw new Error(`Canonical migration bytes changed: ${source.version}.`);
  }
  for (const version of canonicalSources.keys())
    if (
      version !== "0045_w5_reply_review" &&
      !registry.migrations.some((source) => source.version === version)
    )
      throw new Error(`Canonical adoption source is absent: ${version}.`);
  if (
    !registry.migrations.some(
      (source) => source.version === "0045_w5_reply_review",
    ) &&
    !registry.reserved.some(
      (source) =>
        source.version === "0045_w5_reply_review" &&
        source.sourceSha256 === canonicalSources.get(source.version)?.checksum,
    )
  )
    throw new Error(
      "Historical reply-review custody is absent from the registry.",
    );
  return { profile, sql };
}

export async function readLedger(client: PoolClient): Promise<MigrationRow[]> {
  return (
    await client.query<MigrationRow>(
      `SELECT version,checksum,to_char(applied_at AT TIME ZONE 'UTC',
       'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "appliedAt"
       FROM creator.schema_migration ORDER BY version COLLATE "C"`,
    )
  ).rows;
}

export function matchesLedger(
  rows: readonly Pick<MigrationRow, "version" | "checksum">[],
  expected: readonly { version: string; checksum: string }[],
) {
  return (
    rows.length === expected.length &&
    new Set(rows.map((row) => row.version)).size === rows.length &&
    expected.every((source) =>
      rows.some(
        (row) =>
          row.version === source.version && row.checksum === source.checksum,
      ),
    )
  );
}

export function adoptedLedger(profile: AdoptionProfile) {
  return [
    ...profile.original,
    ...profile.original
      .filter((source) => source.version !== source.canonicalVersion)
      .map((source) => ({ ...source, version: source.canonicalVersion })),
    ...profile.missing,
  ];
}

/** Recognize only a complete preserved cohort, never a loose version alias.
 * It authorizes no DDL, checksum repair, missing migration or reserved rollout. */
export async function recognizedAdoptionVersions(
  rows: readonly Pick<MigrationRow, "version" | "checksum">[],
) {
  if (!rows.some((row) => row.version === "0032_w5_content"))
    return new Set<string>();
  const { profile } = await loadAdoptionProfile();
  const expected = adoptedLedger(profile);
  const versions = new Set(expected.map((row) => row.version));
  const cohort = rows.filter((row) => versions.has(row.version));
  if (!matchesLedger(cohort, expected))
    throw new Error(
      "Historical W5 ledger requires the explicit reviewed adoption command; no SQL was replayed.",
    );
  return new Set([
    ...profile.original
      .filter((row) => row.version !== row.canonicalVersion)
      .map((row) => row.version),
    "0045_w5_reply_review",
  ]);
}

/** Catalog metadata only. No account data, credentials or sequence values.
 * PG17 reference captures use this same query and fixed search path. */
export async function schemaCustody(client: PoolClient) {
  await client.query("SET LOCAL search_path=pg_catalog");
  const schemas = ["creator", "creator_trust", "growth"];
  const result: Record<string, unknown> = {};
  result.schemas = (
    await client.query(
      `SELECT nspname AS name,pg_get_userbyid(nspowner) AS owner,
       ARRAY(SELECT a::text FROM unnest(nspacl) a ORDER BY a::text COLLATE "C") AS grants
       FROM pg_namespace WHERE nspname=ANY($1) ORDER BY nspname COLLATE "C"`,
      [schemas],
    )
  ).rows;
  result.relations = (
    await client.query(
      `SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,
       pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
       ARRAY(SELECT a::text FROM unnest(c.relacl) a ORDER BY a::text COLLATE "C") AS grants
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','v','m','S')
       ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C"`,
      [schemas],
    )
  ).rows;
  result.columns = (
    await client.query(
      `SELECT n.nspname AS schema,c.relname AS relation,a.attnum AS position,a.attname AS name,
       format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS required,a.attidentity AS identity,
       a.attgenerated AS generated,pg_get_expr(d.adbin,d.adrelid) AS "default",
       ARRAY(SELECT g::text FROM unnest(a.attacl) g ORDER BY g::text COLLATE "C") AS grants
       FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE n.nspname=ANY($1) AND c.relkind IN ('r','p','v','m','S') AND a.attnum>0 AND NOT a.attisdropped
       ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C",a.attnum`,
      [schemas],
    )
  ).rows;
  result.constraints = (
    await client.query(
      `SELECT n.nspname AS schema,c.relname AS relation,k.conname AS name,k.convalidated AS validated,
       pg_get_constraintdef(k.oid,true) AS definition
       FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=ANY($1) ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C",k.conname COLLATE "C"`,
      [schemas],
    )
  ).rows;
  result.indexes = (
    await client.query(
      `SELECT n.nspname AS schema,c.relname AS relation,i.relname AS name,
       x.indisvalid AS valid,pg_get_indexdef(i.oid) AS definition
       FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class c ON c.oid=x.indrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1)
       ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C",i.relname COLLATE "C"`,
      [schemas],
    )
  ).rows;
  result.policies = (
    await client.query(
      `SELECT n.nspname AS schema,c.relname AS relation,p.polname AS name,p.polcmd AS command,
       p.polpermissive AS permissive,
       ARRAY(SELECT CASE WHEN id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(id) END
             FROM unnest(p.polroles) id ORDER BY 1) AS roles,
       pg_get_expr(p.polqual,p.polrelid) AS "using",pg_get_expr(p.polwithcheck,p.polrelid) AS "check"
       FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname=ANY($1) ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C",p.polname COLLATE "C"`,
      [schemas],
    )
  ).rows;
  result.functions = (
    await client.query(
      `SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_userbyid(p.proowner) AS owner,pg_get_functiondef(p.oid) AS definition,
       ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text COLLATE "C") AS grants
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname=ANY($1) AND p.prokind IN ('f','p')
       ORDER BY n.nspname COLLATE "C",p.proname COLLATE "C",pg_get_function_identity_arguments(p.oid) COLLATE "C"`,
      [schemas],
    )
  ).rows;
  result.triggers = (
    await client.query(
      `SELECT n.nspname AS schema,c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,
       pg_get_triggerdef(t.oid,true) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND NOT t.tgisinternal
       ORDER BY n.nspname COLLATE "C",c.relname COLLATE "C",t.tgname COLLATE "C"`,
      [schemas],
    )
  ).rows;
  result.roles = (
    await client.query(
      `SELECT rolname AS name,rolsuper AS superuser,rolinherit AS inherit,rolcreaterole AS create_role,
       rolcreatedb AS create_db,rolcanlogin AS login,rolbypassrls AS bypass_rls
       FROM pg_roles WHERE rolname=ANY($1) ORDER BY rolname COLLATE "C"`,
      [
        [
          "creator_owner",
          "creator_runtime",
          "creator_trust_owner",
          "creator_trust_runtime",
          "creator_trust_worker",
          "growth_owner",
          "growth_runtime",
          "growth_worker",
        ],
      ],
    )
  ).rows;
  result.memberships = (
    await client.query(
      `SELECT pg_get_userbyid(roleid) AS role,pg_get_userbyid(member) AS member,
       pg_get_userbyid(grantor) AS grantor,admin_option,inherit_option,set_option
       FROM pg_auth_members WHERE pg_get_userbyid(roleid)=ANY($1) OR pg_get_userbyid(member)=ANY($1)
       ORDER BY 1,2,3`,
      [
        [
          "creator_owner",
          "creator_runtime",
          "creator_trust_owner",
          "creator_trust_runtime",
          "creator_trust_worker",
          "growth_owner",
          "growth_runtime",
          "growth_worker",
        ],
      ],
    )
  ).rows;
  return { sha256: sha256(canonical(result)), metadata: result };
}

export function transactionBody(sql: string) {
  return sql
    .replace(/^(\s*(?:--[^\n]*\n)*)BEGIN\s*;/iu, "$1")
    .replace(/COMMIT\s*;\s*$/iu, "");
}
