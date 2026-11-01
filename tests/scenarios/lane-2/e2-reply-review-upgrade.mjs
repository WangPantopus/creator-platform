// Actual reviewed120 ->121 operator journey. First make a private pg_dump of
// the closed target and restore that archive to a distinct owned database.
// This checks all six custody dimensions against that independent restore,
// writes the operator manifest, runs activate-wave, and verifies preservation.
// It does not make a backup or silently rebuild/repair a supplied database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
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

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const { Client } = createRequire(join(root, "apps/backend/package.json"))("pg");
function database(flagName) {
  const url = new URL(flag(flagName, ""));
  assert(["postgres:", "postgresql:"].includes(url.protocol));
  assert(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert(!url.search && !url.hash, "Use a plain owned loopback database URL.");
  return url;
}
const target = database("--db"),
  restored = database("--verify-db");
assert.notEqual(
  target.pathname,
  restored.pathname,
  "Use an independent database restore.",
);
const backup = resolve(flag("--backup", ""));
const out = resolve(flag("--out", ""));
for (const path of [backup, out]) {
  assert(
    path !== root && !path.startsWith(root + sep),
    "Keep backup/evidence outside Git.",
  );
  assert.equal(
    statSync(dirname(path)).mode & 0o077,
    0,
    "Use a private output directory.",
  );
}
const backupStat = statSync(backup);
assert(backupStat.isFile());
assert.equal(backupStat.mode & 0o077, 0);
assert(
  Date.now() - backupStat.mtimeMs < 3_600_000,
  "Make a current backup before operating.",
);
const packet = JSON.parse(
  readFileSync(
    join(root, "infra/migrations/waves/20261023-reply-review.json"),
    "utf8",
  ),
);

async function capture(url, original) {
  const c = new Client({
    connectionString: url.href,
    query_timeout: 5000,
    connectionTimeoutMillis: 5000,
  });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const admission = (
      await c.query(
        "SELECT current_database() AS database,datconnlimit=0 AND shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed' AS closed,current_setting('server_version_num')::int/10000=17 AS pg17 FROM pg_database WHERE datname=current_database()",
      )
    ).rows[0];
    assert(
      admission.closed && admission.pg17,
      "Keep the owned PostgreSQL17 target traffic closed.",
    );
    const ledger = await readLedger(c),
      schema = await schemaCustody(c),
      roles = await waveRoleCustody(c);
    const tables = original?.tables ?? (await waveDataTables(c));
    const data = await waveDataDigest(c, tables),
      security = await waveSecurityCustody(c),
      sequences = await waveSequenceCustody(c, original?.sequences.values);
    await c.query("ROLLBACK");
    return {
      database: admission.database,
      ledger,
      roles,
      tables,
      data,
      security,
      sequences,
      digests: {
        ledgerSha256: sha256(canonical(ledger)),
        schemaSha256: sha256(canonical(schema)),
        dataSha256: data.sha256,
        securitySha256: security.sha256,
        rolesSha256: sha256(canonical(roles)),
        sequenceSha256: sequences.sha256,
      },
    };
  } finally {
    await c.query("ROLLBACK").catch(() => undefined);
    await c.end();
  }
}
const before = await capture(target),
  verification = await capture(restored);
assert.equal(before.ledger.length, 120);
assert(
  packet.baseline.every((source) =>
    before.ledger.some(
      (row) =>
        row.version === source.version && row.checksum === source.checksum,
    ),
  ),
);
assert.deepEqual(
  verification.digests,
  before.digests,
  "Independent restore must match all six custody dimensions.",
);
const manifest = {
  schemaVersion: 1,
  database: before.database,
  createdAt: new Date().toISOString(),
  backupSha256: sha256(readFileSync(backup)),
  ...before.digests,
  restored: { database: verification.database, ...verification.digests },
};
const manifestPath = out + ".manifest.json";
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", {
  mode: 0o600,
  flag: "wx",
});
const output = execFileSync(
  process.execPath,
  ["--import", "tsx", "scripts/activate-wave.ts"],
  {
    cwd: join(root, "apps/backend"),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...process.env,
      DATABASE_MIGRATION_URL: target.href,
      W8_MIGRATION_WAVE: "20261023-reply-review",
      W8_MIGRATION_BACKUP_PATH: backup,
      W8_MIGRATION_BACKUP_MANIFEST: manifestPath,
    },
  },
);
const operator = JSON.parse(output);
const after = await capture(target, before);
assert.equal(after.ledger.length, 121);
assert(
  before.ledger.every((row) =>
    after.ledger.some((current) => canonical(row) === canonical(current)),
  ),
  "Preserve original migration history.",
);
assert.deepEqual(
  after.data,
  before.data,
  "Preserve every original business row/column.",
);
assert.equal(after.digests.sequenceSha256, before.digests.sequenceSha256);
assert(
  before.roles.every((row) =>
    after.roles.some((current) => canonical(row) === canonical(current)),
  ),
  "Preserve existing role attributes and membership.",
);
assert.equal(operator.releaseReady, false);
writeFileSync(
  out,
  JSON.stringify({ before, verification, manifest, operator, after }, null, 2) +
    "\n",
  { mode: 0o600, flag: "wx" },
);
console.log(
  JSON.stringify({
    operator,
    independentCustodyMatches: 6,
    oldBusinessRows: before.data.rows,
    oldTables: before.data.tables,
    oldRolesPreserved: before.roles.length,
    originalHistoryPreserved: true,
  }),
);
