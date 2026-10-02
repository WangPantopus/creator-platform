import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { canonical, repositoryRoot, sha256 } from "./migration-custody.js";

export class WaveRoleSafetyError extends Error {}
type Capability = {
  role: string;
  kind: string;
  object: string;
  column: string;
  privilege: string;
  grantable: boolean;
};
const names = [
  "creator_trust_denial",
  "creator_media_worker",
  "creator_media_discovery",
];
const metadata: Record<string, string[]> = {
  "creator.thread": ["id", "creator_id", "fan_id"],
  "creator.fan_profile": ["id", "account_id"],
  "creator.creator_profile": ["id", "account_id"],
  "creator_trust.block": ["account_id", "creator_id", "revoked_at"],
  "creator_trust.restriction": ["account_id", "creator_id", "revoked_at"],
  "creator_trust.tombstone": [
    "account_id",
    "scope",
    "creator_id",
    "thread_id",
    "job_id",
  ],
  "creator_trust.privacy_job": ["id", "owned_creator_ids"],
};
const discovery: Record<string, string[]> = {
  "creator.media_asset": [
    "id",
    "creator_id",
    "fan_id",
    "owner_account_id",
    "state",
    "expires_at",
    "job_available_at",
    "job_lease_until",
    "manifest_pending",
    "delete_pending",
  ],
  "creator.creator_media_asset": [
    "id",
    "creator_id",
    "owner_account_id",
    "state",
    "expires_at",
    "job_available_at",
    "job_lease_until",
    "manifest_pending",
    "delete_pending",
  ],
};
const workerColumns = [
  "state",
  "version",
  "bytes",
  "mime_type",
  "duration_ms",
  "output_sha256",
  "waveform",
  "provenance",
  "failure_code",
  "job_available_at",
  "job_lease_until",
  "manifest_pending",
  "delete_pending",
];

/** Exact initial-wave purpose roles. No password or business data is read.
 * Run inside the caller's transaction with the fixed PG17 catalog path. */
export async function assertWaveRoleSafety(
  client: PoolClient,
  installed: { trust: boolean; media: boolean },
) {
  const fail = (role: string) => {
    throw new WaveRoleSafetyError(
      `Unsafe migration purpose-role custody: ${role}.`,
    );
  };
  await client.query("SET LOCAL search_path=pg_catalog");
  const roles = (
    await client.query<{ role: string; safe: boolean; owned: boolean }>(
      `SELECT r.rolname AS role,
     NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolinherit AND NOT r.rolbypassrls AND NOT r.rolreplication
     AND r.rolcanlogin=(r.rolname='creator_media_worker') AND coalesce(array_length(r.rolconfig,1),0)=0
     AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
     AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid AND setdatabase IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))) AS safe,
     EXISTS(SELECT FROM pg_class WHERE relowner=r.oid) OR EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
      OR EXISTS(SELECT FROM pg_type WHERE typowner=r.oid) OR EXISTS(SELECT FROM pg_foreign_server WHERE srvowner=r.oid)
      OR EXISTS(SELECT FROM pg_foreign_data_wrapper WHERE fdwowner=r.oid) AS owned
     FROM pg_roles r WHERE rolname=ANY($1::text[])`,
      [names],
    )
  ).rows;
  for (const role of roles) if (!role.safe || role.owned) fail(role.role);
  if (installed.trust && !roles.some((r) => r.role === "creator_trust_denial"))
    fail("creator_trust_denial");
  if (installed.media && roles.length !== 3) fail("media purpose roles");

  const pins = JSON.parse(
    await readFile(
      new URL("infra/migrations/waves/20261002-roles.json", repositoryRoot),
      "utf8",
    ),
  ) as {
    schemaVersion: number;
    postgresMajor: number;
    sourceWave: string;
    functions: {
      name: string;
      owner: string;
      sha256: string;
      grants: string[];
    }[];
  };
  if (
    pins.schemaVersion !== 1 ||
    pins.postgresMajor !== 17 ||
    pins.sourceWave !== "20261002" ||
    pins.functions.length !== 7
  )
    fail("function packet");
  if (
    (
      await client.query<{ major: number }>(
        "SELECT current_setting('server_version_num')::integer/10000 AS major",
      )
    ).rows[0]?.major !== pins.postgresMajor
  )
    fail("PostgreSQL17 required");
  const expected = pins.functions.filter((f) =>
    f.owner === "creator_trust_denial" ? installed.trust : installed.media,
  );
  const functions = (
    await client.query<{
      name: string;
      owner: string;
      definition: string;
      grants: string[];
    }>(
      `SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS name,r.rolname AS owner,
     pg_get_functiondef(p.oid) AS definition,
     ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text COLLATE "C") AS grants
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
     WHERE r.rolname=ANY($1::text[]) AND p.prokind IN('f','p')`,
      [names],
    )
  ).rows.map(({ definition, ...row }) => ({
    ...row,
    sha256: sha256(definition),
  }));
  if (
    functions.length !== expected.length ||
    functions.some((f) => !expected.some((e) => canonical(e) === canonical(f)))
  )
    fail("definer source/ACL packet");

  const capabilities = (
    await client.query<Capability>(
      `WITH acl AS (
      SELECT 'schema' AS kind,n.nspname::text AS object,''::text AS column_name,a.* FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a
      UNION ALL SELECT 'relation',n.nspname||'.'||c.relname,'',a.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(c.relacl) a
      UNION ALL SELECT 'column',n.nspname||'.'||c.relname,t.attname,a.* FROM pg_attribute t JOIN pg_class c ON c.oid=t.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(t.attacl) a
      UNION ALL SELECT 'function',n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')','',a.* FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(p.proacl) a
      UNION ALL SELECT 'default',coalesce(n.nspname,'*'),'',a.* FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      UNION ALL SELECT 'type',n.nspname||'.'||t.typname,'',a.* FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace CROSS JOIN LATERAL aclexplode(t.typacl) a
      UNION ALL SELECT 'language',l.lanname,'',a.* FROM pg_language l CROSS JOIN LATERAL aclexplode(l.lanacl) a
      UNION ALL SELECT 'foreign_server',s.srvname,'',a.* FROM pg_foreign_server s CROSS JOIN LATERAL aclexplode(s.srvacl) a
      UNION ALL SELECT 'foreign_wrapper',f.fdwname,'',a.* FROM pg_foreign_data_wrapper f CROSS JOIN LATERAL aclexplode(f.fdwacl) a
    ) SELECT r.rolname AS role,acl.kind,acl.object,acl.column_name AS column,acl.privilege_type AS privilege,acl.is_grantable AS grantable
      FROM acl JOIN pg_roles r ON r.oid=acl.grantee WHERE r.rolname=ANY($1::text[])`,
      [names],
    )
  ).rows;
  for (const c of capabilities) {
    let allowed = false;
    if (!c.grantable) {
      if (c.kind === "schema" && c.privilege === "USAGE")
        allowed =
          c.object === "creator" ||
          (c.object === "creator_trust" &&
            c.role !== "creator_media_discovery");
      if (c.kind === "function" && c.privilege === "EXECUTE")
        allowed =
          expected.some((f) => f.name === c.object && f.owner === c.role) ||
          (c.role === "creator_media_worker" &&
            installed.media &&
            [
              "creator_trust.media_worker_denial(text, uuid, uuid, uuid)",
              "creator.discover_media_jobs(text, integer)",
            ].includes(c.object));
      if (c.kind === "column" && c.privilege === "SELECT")
        allowed = Boolean(
          (c.role === "creator_trust_denial" &&
            installed.trust &&
            metadata[c.object]?.includes(c.column)) ||
            (c.role === "creator_media_discovery" &&
              installed.media &&
              discovery[c.object]?.includes(c.column)),
        );
      if (
        c.role === "creator_media_worker" &&
        installed.media &&
        Object.hasOwn(discovery, c.object)
      ) {
        if (c.kind === "relation" && c.privilege === "SELECT") allowed = true;
        if (c.kind === "column" && c.privilege === "UPDATE")
          allowed =
            workerColumns.includes(c.column) ||
            (c.object === "creator.creator_media_asset" &&
              c.column === "job_token");
      }
    }
    if (!allowed) fail(c.role);
  }
  return {
    checkedRoles: roles.length,
    pinnedFunctions: functions.length,
    directCapabilities: capabilities.length,
  };
}
