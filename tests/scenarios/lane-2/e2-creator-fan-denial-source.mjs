// Closed PostgreSQL qualification of unchanged creator/fan denial SQL.
// Run with node --import tsx on an owned loopback121 or122 database.
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
  assertCreatorFanDenialCatalog,
  assertCreatorFanDenialPurposeCatalog,
  creatorFanDenialPurposeCatalogue,
} from "../../../apps/backend/src/modules/trust/creator-fan-denial-catalog.ts";
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
const wave = "20261023-studio-reply-authority";
const packet = JSON.parse(
  readFileSync(join(root, `infra/migrations/waves/${wave}.json`), "utf8"),
);
const review = JSON.parse(
  readFileSync(join(root, `infra/migrations/reviews/${wave}.json`), "utf8"),
);
assert.equal(packet.baseline.length, 121);
assert.equal(packet.wave.length, 1);
const source = packet.wave[0];
assert.equal(source.version, "0254_w8_creator_fan_denial");
assert.equal(
  source.path,
  "apps/backend/migrations/0089_w8_creator_fan_denial.sql",
);
assert.equal(
  source.checksum,
  "0a738e0a29c77e65274931d4054b5db26a340b8c10a498e8c016457ab1a22860",
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
       OR pg_has_role(oid,'creator_trust_denial','USAGE') AS denial_executor
     FROM pg_roles ORDER BY rolname COLLATE "C"`,
    )
  ).rows;
  const relations = {};
  for (const { rolname } of roles)
    relations[rolname] = contentHash(
      await generationConsumerCatalogue(client, rolname),
    );
  const functions = (
    await client.query(
      `SELECT r.rolname AS role,n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS name,
       has_function_privilege(r.oid,p.oid,'EXECUTE') AS execute
     FROM pg_roles r CROSS JOIN pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname IN('creator','creator_trust','growth') AND p.prokind IN('f','p')
     ORDER BY r.rolname COLLATE "C",n.nspname COLLATE "C",p.proname COLLATE "C",oidvectortypes(p.proargtypes) COLLATE "C"`,
    )
  ).rows;
  return { roles, relations, functions };
}

const signature = "creator_trust.creator_fan_denial(uuid, uuid)";
const driftCases = [
  ["purpose LOGIN", "ALTER ROLE creator_trust_denial LOGIN"],
  ["purpose INHERIT", "ALTER ROLE creator_trust_denial INHERIT"],
  ["purpose membership", "GRANT creator_runtime TO creator_trust_denial"],
  [
    "purpose setting",
    "ALTER ROLE creator_trust_denial SET search_path='creator'",
  ],
  [
    "table body grant",
    "GRANT SELECT ON creator.content_reply TO creator_trust_denial",
  ],
  ["PUBLIC EXECUTE", `GRANT EXECUTE ON FUNCTION ${signature} TO PUBLIC`],
  [
    "extra role EXECUTE",
    `GRANT EXECUTE ON FUNCTION ${signature} TO creator_trust_runtime`,
  ],
  [
    "missing core EXECUTE",
    `REVOKE EXECUTE ON FUNCTION ${signature} FROM creator_runtime`,
  ],
  [
    "function owner",
    `ALTER FUNCTION ${signature} OWNER TO creator_trust_owner`,
  ],
  [
    "function search path",
    `ALTER FUNCTION ${signature} SET search_path=creator`,
  ],
  [
    "function body",
    `CREATE OR REPLACE FUNCTION ${signature.replace("uuid, uuid", "c uuid, f uuid")} RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS 'BEGIN RETURN ''allowed''; END'`,
  ],
];
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
    ledger.length === 121 ? packet.baseline : [...packet.baseline, source];
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
  if (ledger.length === 121) {
    if (!captureOnly) {
      await assertGenerationWaveRoleSafety(client, "reply-review");
      await assertPrivacyWaveRoleSafety(client, {
        privacy: true,
        domain: true,
        replyReviewBeforeStudioReplyAuthority: true,
      });
      result.checks.push("exact121 predecessor role/privacy passed");
    }
    await client.query(body);
    await client.query("RESET ROLE");
    await client.query(
      "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2)",
      [source.version, source.checksum],
    );
  }
  result.reachAfter = await reach();
  assert.deepEqual(
    result.reachAfter.roles,
    result.reachBefore.roles,
    "No role addition or attribute changes.",
  );
  assert.deepEqual(
    result.reachAfter.relations,
    result.reachBefore.relations,
    "No role gains relation, column, policy or schema reach.",
  );
  const oldFunctions = result.reachAfter.functions.filter(
    (row) => row.name !== signature,
  );
  const previousFunctions = result.reachBefore.functions.filter(
    (row) => row.name !== signature,
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
    .filter(({ denial_executor }) => denial_executor)
    .map(({ rolname }) => rolname);
  assert.deepEqual(
    result.functionReach
      .filter((row) => row.execute)
      .map((row) => row.role)
      .sort(),
    expectedExecutors.sort(),
  );
  result.checks.push(
    "all roles retain existing effective reach; only reviewed denial EXECUTE added",
  );
  result.denialFunction = (
    await client.query(
      `SELECT n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' AS name,
       pg_get_userbyid(p.proowner) AS owner,
       encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS sha256,
       ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text COLLATE "C") AS grants
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE p.oid='creator_trust.creator_fan_denial(uuid,uuid)'::regprocedure`,
    )
  ).rows[0];
  result.catalogue = await creatorFanDenialPurposeCatalogue(client);
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
    await assertGenerationWaveRoleSafety(client, "studio-reply-authority");
    await assertPrivacyWaveRoleSafety(client, { privacy: true, domain: true });
    await assertCreatorFanDenialPurposeCatalog(client);
    result.checks.push("122 fixed role/privacy and denial catalogue passed");
    await client.query("SET SESSION AUTHORIZATION creator_runtime");
    await assertCreatorFanDenialCatalog(client);
    await client.query("RESET SESSION AUTHORIZATION");
    result.checks.push(
      "core catalogue passed (administrator-selected metadata only)",
    );
    for (const [name, mutation] of driftCases) {
      await client.query("SAVEPOINT drift");
      await client.query(mutation);
      await assert.rejects(assertCreatorFanDenialPurposeCatalog(client), {
        code: "scope_denial_unconfigured",
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
      await assert.rejects(assertCreatorFanDenialCatalog(client), {
        code: "scope_denial_unconfigured",
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
