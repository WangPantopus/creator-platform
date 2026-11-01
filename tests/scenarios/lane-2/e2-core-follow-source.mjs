// Closed PostgreSQL qualification of unchanged core Follow metadata SQL.
// Run with node --import tsx on an owned loopback122 or123 database.
// SQL, ledger probes, optional incoming Growth login and drift all roll back.
// --capture-only measures candidates; it never reports qualification passed.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { flag } from "../lane-3/lib.mjs";
import {
  canonical,
  readLedger,
  schemaCustody,
  sha256,
} from "../../../apps/backend/scripts/migration-custody.ts";
import {
  waveDataDigest,
  waveDataTables,
  waveRoleCustody,
  waveSecurityCustody,
  waveSequenceCustody,
} from "../../../apps/backend/scripts/migration-wave-custody.ts";
import { assertGenerationWaveRoleSafety } from "../../../apps/backend/scripts/migration-generation-roles.ts";
import { assertPrivacyWaveRoleSafety } from "../../../apps/backend/scripts/migration-privacy-roles.ts";
import {
  assertCoreFollowCatalog,
  assertCoreFollowPurposeCatalog,
  coreFollowPurposeCatalogue,
} from "../../../apps/backend/src/modules/growth/core-follow-catalogue.ts";
import { contentHash } from "../../../apps/backend/src/core/canonical.ts";
import { generationConsumerCatalogue } from "../../../apps/backend/src/core/purpose-catalogue.ts";
import {
  outputTables,
  pinGroups,
} from "../../../apps/backend/src/operations/catalogues/pins.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const { Client } = createRequire(join(root, "apps/backend/package.json"))("pg");
const url = new URL(flag("--db", ""));
assert(["postgres:", "postgresql:"].includes(url.protocol));
assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
assert(!url.search && !url.hash, "Use a plain owned loopback database URL.");
const out = resolve(flag("--out", ""));
assert(
  out !== root && !out.startsWith(root + sep),
  "Keep metadata outside Git.",
);
mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
assert.equal(
  statSync(dirname(out)).mode & 0o077,
  0,
  "Use a private directory.",
);
const captureOnly = process.argv.includes("--capture-only");
const withGrowth = process.argv.includes("--with-growth");
const wave = "20261027-core-follow";
const packet = JSON.parse(
  readFileSync(join(root, `infra/migrations/waves/${wave}.json`), "utf8"),
);
const review = JSON.parse(
  readFileSync(join(root, `infra/migrations/reviews/${wave}.json`), "utf8"),
);
assert.equal(packet.baseline.length, 122);
assert.equal(packet.wave.length, 1);
const source = packet.wave[0];
assert.equal(source.version, "0255_w7_core_follow_metadata");
assert.equal(
  source.path,
  "apps/backend/src/modules/growth/migrations/pending_w7_core_follow_metadata.sql",
);
assert.equal(
  source.checksum,
  "29c0261cdfce50be434d8b8b49c21e23df6057613d521c8e40a13c3928d63796",
);
const sql = readFileSync(join(root, source.path), "utf8");
assert.equal(sha256(sql), source.checksum);
const body = sql
  .replace(/^(\s*(?:--[^\n]*\n)*)BEGIN\s*;/iu, "$1")
  .replace(/COMMIT\s*;\s*$/iu, "");
assert(!/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu.test(body));
const client = new Client({
  connectionString: url.href,
  query_timeout: 5000,
  connectionTimeoutMillis: 5000,
});
await client.connect();
const originalSearchPath = (await client.query("SHOW search_path")).rows[0]
  .search_path;

async function custody() {
  return {
    ledger: sha256(canonical(await readLedger(client))),
    schema: sha256(canonical(await schemaCustody(client))),
    data: await waveDataDigest(client, await waveDataTables(client)),
    roles: sha256(canonical(await waveRoleCustody(client))),
    security: await waveSecurityCustody(client),
    sequence: (await waveSequenceCustody(client)).sha256,
  };
}

async function reach() {
  const roles = (
    await client.query(
      `SELECT rolname,rolsuper,rolsuper OR pg_has_role(oid,'creator_runtime','USAGE')
       OR coalesce(pg_has_role(oid,to_regrole('creator_growth_follow_metadata'),'USAGE'),false) AS follow_executor,
       rolsuper OR pg_has_role(oid,'growth_owner','USAGE') AS metadata_owner,
       pg_has_role(oid,'pg_read_all_data','USAGE') OR pg_has_role(oid,'pg_write_all_data','USAGE') AS metadata_builtin_usage
     FROM pg_roles ORDER BY rolname COLLATE "C"`,
    )
  ).rows;
  const relations = {};
  for (const { rolname } of roles)
    relations[rolname] = await generationConsumerCatalogue(client, rolname);
  const functions = (
    await client.query(
      `SELECT r.rolname AS role,n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS name,
       has_function_privilege(r.oid,p.oid,'EXECUTE') AS execute
     FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND p.prokind IN('f','p')
     ORDER BY r.rolname COLLATE "C",n.nspname COLLATE "C",p.proname COLLATE "C",oidvectortypes(p.proargtypes) COLLATE "C"`,
    )
  ).rows;
  return { roles, relations, functions };
}

const signature = "creator_growth_metadata.core_follow(uuid, uuid, uuid)";
const purpose = "creator_growth_follow_metadata";
const driftCases = [
  ["purpose LOGIN", `ALTER ROLE ${purpose} LOGIN`],
  ["purpose INHERIT", `ALTER ROLE ${purpose} INHERIT`],
  ["purpose membership", `GRANT creator_runtime TO ${purpose}`],
  ["purpose setting", `ALTER ROLE ${purpose} SET search_path='creator'`],
  [
    "session credential column",
    `GRANT SELECT(token_hash) ON creator.identity_session TO ${purpose}`,
  ],
  [
    "session metadata removed",
    `REVOKE SELECT(expires_at) ON creator.identity_session FROM ${purpose}`,
  ],
  [
    "session table body",
    `GRANT SELECT ON creator.identity_session TO ${purpose}`,
  ],
  ["Follow table body", `GRANT SELECT ON growth.follow TO ${purpose}`],
  [
    "Follow creation timestamp read",
    `GRANT SELECT(created_at) ON growth.follow TO ${purpose}`,
  ],
  [
    "Follow row lock grant removed",
    `REVOKE UPDATE(created_at) ON growth.follow FROM ${purpose}`,
  ],
  [
    "Follow forced RLS",
    "ALTER TABLE growth.follow NO FORCE ROW LEVEL SECURITY",
  ],
  [
    "Follow write policy",
    "ALTER POLICY core_follow_metadata_lock ON growth.follow WITH CHECK(true)",
  ],
  [
    "Follow account policy",
    "ALTER POLICY core_follow_metadata_select ON growth.follow USING(true)",
  ],
  [
    "namespace CREATE",
    `GRANT CREATE ON SCHEMA creator_growth_metadata TO ${purpose}`,
  ],
  [
    "namespace PUBLIC USAGE",
    "GRANT USAGE ON SCHEMA creator_growth_metadata TO PUBLIC",
  ],
  [
    "namespace owner",
    "ALTER SCHEMA creator_growth_metadata OWNER TO creator_owner",
  ],
  ["PUBLIC EXECUTE", `GRANT EXECUTE ON FUNCTION ${signature} TO PUBLIC`],
  [
    "extra role EXECUTE",
    `GRANT EXECUTE ON FUNCTION ${signature} TO growth_runtime`,
  ],
  [
    "missing core EXECUTE",
    `REVOKE EXECUTE ON FUNCTION ${signature} FROM creator_runtime`,
  ],
  ["function owner", `ALTER FUNCTION ${signature} OWNER TO growth_owner`],
  [
    "function search path",
    `ALTER FUNCTION ${signature} SET search_path=growth`,
  ],
  ["function row security", `ALTER FUNCTION ${signature} SET row_security=off`],
  [
    "function body",
    `CREATE OR REPLACE FUNCTION creator_growth_metadata.core_follow(s uuid,a uuid,c uuid) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog SET row_security=on AS 'BEGIN RETURN true; END'`,
  ],
];
const receipt = {
  version: source.version,
  checksum: source.checksum,
  functionDefinitionSha256: review.coreFollowDefinitionSha256,
};

async function sessionShape() {
  const { metadata } = await schemaCustody(client);
  return Object.fromEntries(
    [
      "relations",
      "columns",
      "constraints",
      "indexes",
      "policies",
      "triggers",
    ].map((key) => [
      key,
      metadata[key]
        .filter(
          (row) =>
            row.schema === "creator" &&
            (row.relation ?? row.name) === "identity_session",
        )
        .map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([key]) => key !== "grants"),
          ),
        ),
    ]),
  );
}

const result = {
  source,
  observedAt: new Date().toISOString(),
  captureOnly,
  checks: [],
};
try {
  await client.query("BEGIN");
  const admin = (
    await client.query(
      "SELECT current_user=session_user AND rolsuper AND current_setting('server_version_num')::int/10000=17 AS allowed FROM pg_roles WHERE rolname=session_user",
    )
  ).rows[0];
  assert.equal(
    admin.allowed,
    true,
    "Separate PostgreSQL17 migration administrator required.",
  );
  const ledger = await readLedger(client);
  const expected =
    ledger.length === 122 ? packet.baseline : [...packet.baseline, source];
  assert.equal(ledger.length, expected.length);
  assert(
    expected.every((entry) =>
      ledger.some(
        (row) =>
          row.version === entry.version && row.checksum === entry.checksum,
      ),
    ),
  );
  result.before = await custody();
  result.sessionShapeBefore = await sessionShape();
  if (withGrowth) {
    const incoming = await client.query(
      "SELECT 1 FROM pg_roles WHERE rolname='creator_review_growth_api'",
    );
    assert.equal(
      incoming.rowCount,
      0,
      "Use the no-Growth baseline for an incoming-role capture.",
    );
    await client.query(
      "CREATE ROLE creator_review_growth_api LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS",
    );
    await client.query(
      "GRANT creator_runtime, growth_runtime TO creator_review_growth_api",
    );
  }
  const { groups, unknown } = pinGroups(
    review,
    outputTables(
      readFileSync(
        join(
          root,
          "apps/backend/src/modules/conversation/generation-output.ts",
        ),
        "utf8",
      ),
    ),
  );
  assert.deepEqual(
    unknown,
    [],
    "Every digest needs an explicit reader or immutable classification.",
  );
  const structuralGroups = new Set([
    "runtimeCatalogues.family",
    "runtimeCatalogues.financial",
    "outputCatalogueChecksum",
    "conversationCursorCatalogueChecksum",
    "purposeProfiles",
    "originalFamilyProfiles",
  ]);
  result.profileStructures = { before: {}, after: {} };
  for (const group of groups.filter((entry) =>
    structuralGroups.has(entry.id),
  )) {
    await client.query("SAVEPOINT profile_capture");
    await client.query("SELECT set_config('search_path',$1,true)", [
      group.searchPath ?? originalSearchPath,
    ]);
    result.profileStructures.before[group.id] = await group.read(client);
    await client.query("ROLLBACK TO SAVEPOINT profile_capture");
    await client.query("RELEASE SAVEPOINT profile_capture");
  }
  result.reachBefore = await reach();
  result.rolesBefore = await waveRoleCustody(client);
  if (ledger.length === 122) {
    if (!captureOnly) {
      await assertGenerationWaveRoleSafety(client, "studio-reply-authority");
      await assertPrivacyWaveRoleSafety(client, {
        privacy: true,
        domain: true,
        studioReplyAuthorityBeforeCoreFollow: true,
      });
      result.checks.push("exact122 predecessor role/privacy passed");
    }
    await client.query(body);
    await client.query("RESET ROLE");
    await client.query(
      "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2)",
      [source.version, source.checksum],
    );
  }
  result.reachAfter = await reach();
  result.rolesAfter = await waveRoleCustody(client);
  assert(
    result.rolesBefore.every((old) =>
      result.rolesAfter.some((row) => canonical(row) === canonical(old)),
    ),
    "Existing role attributes/memberships remain exact.",
  );
  const added = result.rolesAfter.filter(
    (row) => !result.rolesBefore.some((old) => old.role === row.role),
  );
  assert.deepEqual(
    added.map((row) => row.role),
    ledger.length === 122 ? [purpose] : [],
    "Only the isolated metadata role may be added.",
  );
  result.sessionShapeAfter = await sessionShape();
  assert.deepEqual(
    result.sessionShapeAfter,
    result.sessionShapeBefore,
    "Identity session definition, RLS, policies, indexes and triggers stay unchanged.",
  );
  for (const role of result.reachBefore.roles) {
    const before = result.reachBefore.relations[role.rolname],
      after = result.reachAfter.relations[role.rolname];
    assert.deepEqual(
      after.relations,
      before.relations,
      "Existing relation/column/policy/sequence reach is unchanged for " +
        role.rolname,
    );
    assert.deepEqual(
      after.schemas.filter((row) => row.schema !== "creator_growth_metadata"),
      before.schemas.filter((row) => row.schema !== "creator_growth_metadata"),
    );
    const schema = after.schemas.find(
      (row) => row.schema === "creator_growth_metadata",
    );
    assert.deepEqual(
      schema,
      {
        schema: "creator_growth_metadata",
        usage:
          role.metadata_owner ||
          role.follow_executor ||
          role.metadata_builtin_usage,
        create: role.metadata_owner,
      },
      "Exact new namespace reach for " + role.rolname,
    );
  }
  const metadataReach = result.reachAfter.relations[purpose];
  assert(
    metadataReach.relations.every(
      (row) =>
        row.table_privileges.length === 0 &&
        row.sequence_privileges.length === 0,
    ),
    "The purpose has no table-wide or sequence grants.",
  );
  assert.deepEqual(
    metadataReach.relations
      .flatMap((row) =>
        row.columns.map(
          (column) =>
            `${row.schema}.${row.relation}.${column.column}:${column.privilege}`,
        ),
      )
      .sort(),
    [
      "creator.identity_session.id:SELECT",
      "creator.identity_session.account_id:SELECT",
      "creator.identity_session.revoked_at:SELECT",
      "creator.identity_session.expires_at:SELECT",
      "growth.follow.account_id:SELECT",
      "growth.follow.creator_id:SELECT",
      "growth.follow.created_at:UPDATE",
    ].sort(),
    "Only four session metadata reads, two Follow metadata reads and the lock-only timestamp grant are allowed.",
  );
  const oldFunctions = result.reachAfter.functions.filter(
    (row) => row.name !== signature && row.role !== purpose,
  );
  const previousFunctions = result.reachBefore.functions.filter(
    (row) => row.name !== signature && row.role !== purpose,
  );
  assert.deepEqual(
    oldFunctions,
    previousFunctions,
    "All preexisting effective function privileges remain unchanged.",
  );
  result.functionReach = result.reachAfter.functions.filter(
    (row) => row.name === signature,
  );
  const expectedExecutors = result.reachAfter.roles
    .filter(({ follow_executor }) => follow_executor)
    .map(({ rolname }) => rolname);
  assert.deepEqual(
    result.functionReach
      .filter((row) => row.execute)
      .map((row) => row.role)
      .sort(),
    expectedExecutors.sort(),
  );
  result.checks.push(
    "all roles retain existing effective reach; only reviewed metadata role/schema/column grants and core Follow EXECUTE added",
  );
  result.followFunction = (
    await client.query(
      `SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS name,
       pg_get_userbyid(p.proowner) AS owner,
       encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256,
       ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text COLLATE "C") AS grants
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='creator_growth_metadata.core_follow(uuid,uuid,uuid)'::regprocedure`,
    )
  ).rows[0];
  result.catalogue = await coreFollowPurposeCatalogue(client);
  result.catalogueSha256 = contentHash(result.catalogue);
  result.profiles = {};
  for (const group of groups) {
    await client.query("SAVEPOINT profile_capture");
    await client.query("SELECT set_config('search_path',$1,true)", [
      group.searchPath ?? originalSearchPath,
    ]);
    const structure = await group.read(client);
    result.profiles[group.id] = contentHash(structure);
    if (structuralGroups.has(group.id))
      result.profileStructures.after[group.id] = structure;
    await client.query("ROLLBACK TO SAVEPOINT profile_capture");
    await client.query("RELEASE SAVEPOINT profile_capture");
  }
  if (!captureOnly) {
    await assertGenerationWaveRoleSafety(client, "core-follow");
    await assertPrivacyWaveRoleSafety(client, { privacy: true, domain: true });
    await assertCoreFollowPurposeCatalog(client);
    result.checks.push(
      "123 fixed role/privacy and core Follow catalogue passed",
    );
    await client.query("SET SESSION AUTHORIZATION creator_runtime");
    await assertCoreFollowCatalog(client, receipt);
    await client.query("RESET SESSION AUTHORIZATION");
    result.checks.push(
      "core catalogue passed (administrator-selected metadata only)",
    );
    for (const [name, mutation] of driftCases) {
      await client.query("SAVEPOINT drift");
      await client.query(mutation);
      await assert.rejects(assertCoreFollowPurposeCatalog(client), {
        code: "growth_core_follow_unconfigured",
      });
      await client.query("ROLLBACK TO SAVEPOINT drift");
      await client.query("RELEASE SAVEPOINT drift");
      result.checks.push(name + " refused");
    }
    for (const [name, mutation] of [
      [
        "missing source ledger",
        "DELETE FROM creator.schema_migration WHERE version=$1",
      ],
      [
        "changed source ledger",
        "UPDATE creator.schema_migration SET checksum=repeat('0',64) WHERE version=$1",
      ],
    ]) {
      await client.query("SAVEPOINT source_drift");
      await client.query(mutation, [source.version]);
      await client.query("SET SESSION AUTHORIZATION creator_runtime");
      await assert.rejects(assertCoreFollowCatalog(client, receipt), {
        code: "reviewed_migration_unavailable",
      });
      await client.query("RESET SESSION AUTHORIZATION");
      await client.query("ROLLBACK TO SAVEPOINT source_drift");
      await client.query("RELEASE SAVEPOINT source_drift");
      result.checks.push(name + " refused");
    }
  }
  await client.query("ROLLBACK");
  await client.query("BEGIN READ ONLY");
  result.after = await custody();
  await client.query("ROLLBACK");
  assert.deepEqual(
    result.after,
    result.before,
    "All six rollback custody comparisons must match.",
  );
  result.checks.push("six rollback custody comparisons match");
  result.qualified = !captureOnly;
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      qualified: result.qualified,
      checks: result.checks,
      catalogue: result.catalogueSha256,
      rolesReviewed: result.reachBefore.roles.length,
      profileGroups: Object.keys(result.profiles).length,
    }),
  );
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
