// Closed PostgreSQL qualification of the unchanged reply-review proposal.
// Run with node --import tsx; requires an owned loopback120 or121 database.
// Proposed SQL, metadata-only ledger and adversarial drift always roll back.
// This does not create a fan, Note, Ops lease, decision or privacy receipt.
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
  assertReplyReviewCatalog,
  assertReplyReviewPurposeCatalog,
  replyReviewPurposeCatalogue,
} from "../../../apps/backend/src/modules/trust/reply-review-catalog.ts";
import { contentHash } from "../../../apps/backend/src/core/canonical.ts";

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
  "Use a private output directory.",
);
const packet = JSON.parse(
  readFileSync(
    join(root, "infra/migrations/waves/20261023-reply-review.json"),
    "utf8",
  ),
);
assert.equal(packet.baseline.length, 120);
assert.equal(packet.wave.length, 1);
const source = packet.wave[0];
assert.equal(source.version, "0253_w8_reply_review");
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

const policyQuery = `SELECT r.rolname AS role,n.nspname||'.'||t.relname AS relation,
 r.rolsuper,r.rolbypassrls,r.oid=t.relowner AS owns,t.relrowsecurity,t.relforcerowsecurity,
 has_any_column_privilege(r.oid,t.oid,'SELECT') AS can_select,has_any_column_privilege(r.oid,t.oid,'UPDATE') AS can_update,
 ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.oid,t.oid,a.attnum,'SELECT') ORDER BY a.attnum) AS selects,
 ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege(r.oid,t.oid,a.attnum,'UPDATE') ORDER BY a.attnum) AS updates,
 coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
 FROM pg_policy p WHERE p.polrelid=t.oid AND (0::oid=ANY(p.polroles) OR EXISTS(SELECT FROM unnest(p.polroles) member WHERE member<>0 AND pg_has_role(r.oid,member,'USAGE')))),'[]'::jsonb) AS policies
 FROM pg_roles r CROSS JOIN pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
 WHERE r.rolname ~ '^(creator|growth)' AND n.nspname='creator' AND t.relname IN('content_reply','content_publication') ORDER BY r.rolname,t.relname`;
const driftCases = [
  ["login", "ALTER ROLE creator_trust_reply_projection LOGIN"],
  ["inherit", "ALTER ROLE creator_trust_reply_projection INHERIT"],
  ["membership", "GRANT creator_runtime TO creator_trust_reply_projection"],
  [
    "setting",
    "ALTER ROLE creator_trust_reply_projection SET search_path='creator'",
  ],
  [
    "table grant",
    "GRANT SELECT ON creator.content_reply TO creator_trust_reply_projection",
  ],
  [
    "function grant",
    "GRANT EXECUTE ON FUNCTION creator_trust.runtime_content_denial(uuid) TO creator_trust_reply_projection",
  ],
  [
    "PUBLIC evidence",
    "GRANT EXECUTE ON FUNCTION creator_trust.reply_review_evidence(uuid,boolean) TO PUBLIC",
  ],
  [
    "forced RLS",
    "ALTER TABLE creator_trust.reply_review NO FORCE ROW LEVEL SECURITY",
  ],
  [
    "lock policy",
    "ALTER POLICY trust_reply_lock ON creator.content_reply WITH CHECK(true)",
  ],
  [
    "function search path",
    "ALTER FUNCTION creator_trust.reply_review_evidence(uuid,boolean) SET search_path=creator",
  ],
];
const result = { source, observedAt: new Date().toISOString(), checks: [] };
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
    ledger.length === 120 ? packet.baseline : [...packet.baseline, source];
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
  result.policyBefore = (await client.query(policyQuery)).rows;
  if (ledger.length === 120) {
    await assertGenerationWaveRoleSafety(client, "workspace-lock");
    await assertPrivacyWaveRoleSafety(client, {
      privacy: true,
      domain: true,
      workspaceLockBeforeReplyReview: true,
    });
    result.checks.push("exact120 predecessor role/privacy passed");
    await client.query(body);
    await client.query("RESET ROLE");
    await client.query(
      "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2)",
      [source.version, source.checksum],
    );
  }
  await assertGenerationWaveRoleSafety(client, "reply-review");
  await assertPrivacyWaveRoleSafety(client, { privacy: true, domain: true });
  result.checks.push("121 role/privacy passed");
  result.catalogue = contentHash(await replyReviewPurposeCatalogue(client));
  result.policyAfter = (await client.query(policyQuery)).rows;
  for (const before of result.policyBefore) {
    const after = result.policyAfter.find(
      (row) => row.role === before.role && row.relation === before.relation,
    );
    assert.deepEqual(after.selects, before.selects);
    assert.deepEqual(after.updates, before.updates);
  }
  result.checks.push("all existing column privileges preserved");
  for (const role of ["creator_runtime", "creator_trust_runtime"]) {
    await client.query("SET SESSION AUTHORIZATION " + role);
    await assertReplyReviewCatalog(client);
    await client.query("RESET SESSION AUTHORIZATION");
    result.checks.push(role + " catalogue passed (metadata only)");
  }
  for (const [name, mutation] of driftCases) {
    await client.query("SAVEPOINT drift");
    await client.query(mutation);
    await assert.rejects(assertReplyReviewPurposeCatalog(client), {
      code: "reply_review_unavailable",
    });
    await client.query("ROLLBACK TO SAVEPOINT drift");
    await client.query("RELEASE SAVEPOINT drift");
    result.checks.push(name + " refused");
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
  writeFileSync(out, JSON.stringify(result, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      checks: result.checks,
      catalogue: result.catalogue,
      existingRoleRelations: result.policyBefore.length,
    }),
  );
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end();
}
