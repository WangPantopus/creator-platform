import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import generationReview from "../../../infra/migrations/reviews/20261007-generation-privacy.json" with { type: "json" };
import generationDenial from "../../../infra/migrations/reviews/20261007-generation-denial-roles.json" with { type: "json" };
import publicAIReview from "../../../infra/migrations/reviews/20261007-public-ai.json" with { type: "json" };
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
  installed: {
    trust: boolean;
    media: boolean;
    content?: boolean;
    interactive?: boolean;
    /** Closed full39-source denial/PUBLIC-trigger operator review only; not
     * runtime activation or safety qualification of all generation purposes. */
    generationDenial?: boolean;
    publicAI?: boolean;
  },
) {
  const fail = (role: string): never => {
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
  if (
    (installed.content && !installed.trust) ||
    (installed.interactive && !installed.content) ||
    (installed.generationDenial && !installed.interactive)
  )
    fail("continuation dependency order");
  const additions = JSON.parse(
    await readFile(
      new URL(
        "infra/migrations/waves/20261002-privacy-roles.json",
        repositoryRoot,
      ),
      "utf8",
    ),
  ) as typeof pins;
  if (
    additions.schemaVersion !== 1 ||
    additions.postgresMajor !== 17 ||
    additions.sourceWave !== "20261002-privacy" ||
    additions.functions.length !== 3
  )
    fail("continuation function packet");
  for (const source of [
    {
      installed: installed.content,
      path: "apps/backend/migrations/0074_w8_content_runtime_denial.sql",
      checksum:
        "61866894c579039cfc2bf11522edeaf46fa03bd51761cca3791ab3471fb9b2f3",
    },
    {
      installed: installed.interactive,
      path: "apps/backend/migrations/0082_w8_interactive_denial_try_fence.sql",
      checksum:
        "3742b1e6b7f367ca626176615c5362ecf002fe5fcc5a96ea941d35a4708e8686",
    },
  ]) {
    if (
      source.installed &&
      sha256(await readFile(new URL(source.path, repositoryRoot))) !==
        source.checksum
    )
      fail("immutable continuation source");
  }
  if (installed.generationDenial) await assertGenerationDenialExtension(client);
  const expected = [
    ...pins.functions,
    ...additions.functions.filter((f) =>
      f.name === "creator_trust.runtime_content_denial(uuid)"
        ? installed.content
        : installed.interactive,
    ),
    ...(installed.generationDenial ? generationDenial.functions : []),
    ...(installed.publicAI ? [publicAIReview.denialFunction] : []),
  ].filter((f) =>
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
      UNION ALL SELECT 'database',d.datname,'',a.* FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a WHERE d.datname=current_database()
      UNION ALL SELECT 'parameter',p.parname,'',a.* FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
      UNION ALL SELECT 'large_object',m.oid::text,'',a.* FROM pg_largeobject_metadata m CROSS JOIN LATERAL aclexplode(m.lomacl) a
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
      if (
        c.kind === "database" &&
        ["CONNECT", "TEMPORARY"].includes(c.privilege)
      )
        allowed = true;
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
            (metadata[c.object]?.includes(c.column) ||
              (installed.generationDenial &&
                (generationDenial.metadataColumns as Record<string, string[]>)[
                  c.object
                ]?.includes(c.column)) ||
              (installed.content &&
                ((c.object === "creator.identity_session" &&
                  ["id", "account_id", "expires_at", "revoked_at"].includes(
                    c.column,
                  )) ||
                  (c.object === "creator.team_membership" &&
                    [
                      "creator_id",
                      "account_id",
                      "roles",
                      "revoked_at",
                    ].includes(c.column)))))) ||
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
  if (installed.content) {
    const policies = (
      await client.query<{
        relation: string;
        expression: string;
        safe: boolean;
      }>(
        `SELECT c.relname AS relation,pg_get_expr(p.polqual,p.polrelid) AS expression,
        p.polcmd='r' AND p.polpermissive AND p.polwithcheck IS NULL
        AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='creator_trust_denial')] AS safe
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='creator' AND c.relname IN('identity_session','team_membership')
        AND (SELECT oid FROM pg_roles WHERE rolname='creator_trust_denial')=ANY(p.polroles)`,
      )
    ).rows;
    if (
      policies.length !== 2 ||
      policies.some((p) => !p.safe || p.expression !== "true")
    )
      fail("content denial metadata policies");
  }
  const publicCapabilities = (
    await client.query<{
      kind: string;
      object: string;
      privilege: string;
      grantable: boolean;
    }>(
      `WITH acl AS (
      SELECT 'schema' AS kind,n.nspname::text AS object,a.* FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname IN('public','creator','creator_trust','growth')
      UNION ALL SELECT 'relation',n.nspname||'.'||c.relname,a.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE n.nspname IN('creator','creator_trust','growth')
      UNION ALL SELECT 'column',n.nspname||'.'||c.relname,a.* FROM pg_attribute t JOIN pg_class c ON c.oid=t.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(t.attacl) a WHERE n.nspname IN('creator','creator_trust','growth')
      UNION ALL SELECT 'default',coalesce(n.nspname,'*'),a.* FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      UNION ALL SELECT 'type',n.nspname||'.'||t.typname,a.* FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace CROSS JOIN LATERAL aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) a WHERE n.nspname IN('creator','creator_trust','growth')
      UNION ALL SELECT 'database',d.datname,a.* FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a WHERE d.datname=current_database()
      UNION ALL SELECT 'parameter',p.parname,a.* FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a
      UNION ALL SELECT 'large_object',m.oid::text,a.* FROM pg_largeobject_metadata m CROSS JOIN LATERAL aclexplode(m.lomacl) a
    ) SELECT kind,object,privilege_type AS privilege,is_grantable AS grantable FROM acl WHERE grantee=0`,
    )
  ).rows;
  for (const c of publicCapabilities) {
    const allowed =
      !c.grantable &&
      ((c.kind === "schema" &&
        c.object === "public" &&
        c.privilege === "USAGE") ||
        (c.kind === "type" && c.privilege === "USAGE") ||
        (c.kind === "database" &&
          ["CONNECT", "TEMPORARY"].includes(c.privilege)));
    if (!allowed) fail("PUBLIC capabilities");
  }
  const publicPins = JSON.parse(
    await readFile(
      new URL("infra/migrations/waves/20261002-public.json", repositoryRoot),
      "utf8",
    ),
  ) as {
    schemaVersion: number;
    sourceWave: string;
    publicFunctions: Record<
      string,
      {
        name: string;
        owner: string;
        sha256: string;
        privilege: string;
        grantable: boolean;
      }[]
    >;
  };
  const hasLedger = (
    await client.query<{ relation: string | null }>(
      "SELECT to_regclass('creator.schema_migration')::text AS relation",
    )
  ).rows[0]?.relation;
  const hasRows = hasLedger
    ? (
        await client.query<{ present: boolean }>(
          "SELECT EXISTS(SELECT FROM creator.schema_migration) AS present",
        )
      ).rows[0]?.present
    : false;
  const expectedPublic = [
    ...((installed.trust && installed.media
      ? publicPins.publicFunctions.canonical57
      : hasRows
        ? publicPins.publicFunctions.baseline40
        : []) ?? fail("PUBLIC function packet")),
    ...(installed.generationDenial
      ? generationDenial.publicTriggerFunctions
      : []),
  ];
  if (publicPins.schemaVersion !== 1 || publicPins.sourceWave !== "20261002")
    fail("PUBLIC function packet");
  const publicFunctions = (
    await client.query<{
      name: string;
      owner: string;
      definition: string;
      privilege: string;
      grantable: boolean;
    }>(
      `SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS name,pg_get_userbyid(p.proowner) AS owner,
     pg_get_functiondef(p.oid) AS definition,a.privilege_type AS privilege,a.is_grantable AS grantable
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE n.nspname IN('creator','creator_trust','growth') AND p.prokind IN('f','p') AND a.grantee=0`,
    )
  ).rows.map(({ definition, ...f }) => ({ ...f, sha256: sha256(definition) }));
  if (
    publicFunctions.length !== expectedPublic.length ||
    publicFunctions.some(
      (f) => !expectedPublic.some((e) => canonical(e) === canonical(f)),
    )
  )
    fail("PUBLIC function source/ACL packet");
  if (
    (
      await client.query(
        "SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE r.rolname=ANY($1::text[]) UNION ALL SELECT 1 FROM pg_largeobject_metadata m JOIN pg_roles r ON r.oid=m.lomowner WHERE r.rolname=ANY($1::text[]) LIMIT 1",
        [names],
      )
    ).rowCount
  )
    fail("database/large-object ownership");
  return {
    checkedRoles: roles.length,
    pinnedFunctions: functions.length,
    directCapabilities: capabilities.length,
    publicCapabilities: publicCapabilities.length,
    pinnedPublicFunctions: publicFunctions.length,
  };
}

/** The earlier wave guard stays exact by default. This additive operator
 * profile requires the reviewed full graph and actual executed SQL ledger;
 * it never changes the executable registry or issues a runtime capability. */
async function assertGenerationDenialExtension(client: PoolClient) {
  const fail = (): never => {
    throw new WaveRoleSafetyError(
      "Unsafe migration purpose-role custody: generation denial extension.",
    );
  };
  if (
    generationDenial.schemaVersion !== 1 ||
    generationDenial.postgresMajor !== 17 ||
    generationDenial.sourceReview !== "20261007-generation-privacy" ||
    generationDenial.functions.length !== 2 ||
    generationDenial.publicTriggerFunctions.length !== 3 ||
    generationDenial.policies.length !== 5 ||
    generationReview.sources.length !== 39
  )
    fail();
  // These original invoker triggers have no ordinary-call capability. Pin
  // their exact source/ACLs above rather than accepting arbitrary PUBLIC code.
  if (
    (
      await client.query<{ ready: boolean }>(
        `SELECT count(*)=3 AND bool_and(p.prokind='f' AND NOT p.prosecdef
         AND p.prorettype='trigger'::regtype) AS ready FROM pg_proc p
         WHERE p.oid=ANY(ARRAY(SELECT to_regprocedure(signature) FROM unnest($1::text[]) signature))`,
        [generationDenial.publicTriggerFunctions.map((fn) => fn.name)],
      )
    ).rows[0]?.ready !== true
  )
    fail();
  for (const source of generationReview.sources) {
    if (
      sha256(await readFile(new URL(source.path, repositoryRoot))) !==
        source.checksum ||
      (
        await client.query<{ ready: boolean }>(
          "SELECT EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2) AS ready",
          [source.version, source.checksum],
        )
      ).rows[0]?.ready !== true
    )
      fail();
  }
  const roles = (
    await client.query<{ safe: boolean }>(
      `SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
       AND NOT rolinherit AND NOT rolbypassrls AND NOT rolreplication
       AND rolcanlogin=(rolname='creator_generation_worker') AND rolconfig IS NULL
       AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
       AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid) AS safe
       FROM pg_roles r WHERE rolname IN('creator_generation_worker',
        'creator_generation_authority','creator_generation_terminal_authority')`,
    )
  ).rows;
  if (roles.length !== 3 || roles.some((role) => role.safe !== true)) fail();
  const relations = Object.keys(generationDenial.metadataColumns);
  if (
    (
      await client.query<{ ready: boolean }>(
        `SELECT count(*)=$2 AND bool_and(c.relkind='r' AND NOT c.relispartition
         AND c.relrowsecurity AND c.relforcerowsecurity
         AND pg_get_userbyid(c.relowner)='creator_owner') AS ready
         FROM pg_class c WHERE c.oid=ANY(ARRAY(SELECT to_regclass(r) FROM unnest($1::text[]) r))`,
        [relations, relations.length],
      )
    ).rows[0]?.ready !== true
  )
    fail();
  for (const [relation, columns] of Object.entries(
    generationDenial.metadataColumns,
  )) {
    const ready = (
      await client.query<{ ready: boolean }>(
        `SELECT bool_and(has_column_privilege('creator_trust_denial',$1,column_name,'SELECT')) AS ready
         FROM unnest($2::text[]) column_name`,
        [relation, columns],
      )
    ).rows[0]?.ready;
    if (ready !== true) fail();
  }
  const policies = (
    await client.query<{ relation: string; name: string; safe: boolean }>(
      `SELECT c.oid::regclass::text AS relation,p.polname AS name,
       p.polcmd='r' AND p.polpermissive AND p.polwithcheck IS NULL
       AND pg_get_expr(p.polqual,p.polrelid)='true'
       AND p.polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='creator_trust_denial')] AS safe
       FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
       WHERE c.oid=ANY(ARRAY(SELECT to_regclass(r) FROM unnest($1::text[]) r))
        AND (SELECT oid FROM pg_roles WHERE rolname='creator_trust_denial')=ANY(p.polroles)`,
      [generationDenial.policies.map((policy) => policy.relation)],
    )
  ).rows;
  if (
    policies.length !== generationDenial.policies.length ||
    policies.some(
      (policy) =>
        policy.safe !== true ||
        !generationDenial.policies.some(
          (expected) =>
            expected.relation === policy.relation &&
            expected.name === policy.name,
        ),
    )
  )
    fail();
}
