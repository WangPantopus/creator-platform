// Walks the reviewed migration operator (scripts/activate-wave.ts) through every
// registered wave the way it must run on a real database: the canonical 61 by
// migrate-trust, then each wave on a restored, traffic-closed copy, with a private
// custom-format backup, an independent second restore and a manifest of their
// actual digests. Stops at the first refusal. Uses only a disposable container on
// lane 0's spare port and a private temporary directory, and removes both.
//   (cd apps/backend && pnpm exec tsx ../../tests/scenarios/integrator/operator-walk.mts)
// On main at 2026-10-15 the first wave is refused: see docs/operations/CURRENT.md.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FRESH_WAVES } from "../../../apps/backend/src/operations/local/fresh-install.ts";
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

const backend = fileURLToPath(
  new URL("../../../apps/backend/", import.meta.url),
);
const pg = createRequire(join(backend, "package.json"))("pg");
const container = "qelvora-lane0-walk";
const port = 56405;
const url = (db: string) =>
  `postgresql://postgres:foundation-test-only@127.0.0.1:${port}/${db}`;
const docker = (...args: string[]) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
const psql = (sql: string) =>
  docker(
    "exec",
    container,
    "psql",
    "-X",
    "-q",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  );
const say = (line: string) => process.stdout.write(line + "\n");
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function digests(db: string) {
  const pool = new pg.Pool({ connectionString: url(db), max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const data = await waveDataDigest(client, await waveDataTables(client));
    return {
      ledgerSha256: sha256(canonical(await readLedger(client))),
      schemaSha256: sha256(canonical(await schemaCustody(client))),
      rolesSha256: sha256(canonical(await waveRoleCustody(client))),
      securitySha256: (await waveSecurityCustody(client)).sha256,
      sequenceSha256: (await waveSequenceCustody(client)).sha256,
      dataSha256: data.sha256,
    };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await pool.end();
  }
}
const node = (script: string, env: Record<string, string>) =>
  spawnSync(process.execPath, ["--import", "tsx", script], {
    cwd: backend,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

if (
  docker(
    "ps",
    "-a",
    "--filter",
    `name=^${container}$`,
    "--format",
    "{{.Names}}",
  )
)
  throw new Error(`${container} already exists; remove it first.`);
const work = mkdtempSync(join(tmpdir(), "qelvora-operator-walk-"));
chmodSync(work, 0o700);
let refused = false;
try {
  docker(
    "run",
    "-d",
    "--name",
    container,
    "--label",
    "qelvora.stack=lane0-walk",
    "-e",
    "POSTGRES_PASSWORD=foundation-test-only",
    "-e",
    "POSTGRES_DB=creator_foundation",
    "-p",
    `127.0.0.1:${port}:5432`,
    "pgvector/pgvector:pg17",
  );
  for (
    let i = 0;
    i < 60 &&
    spawnSync("docker", [
      "exec",
      container,
      "pg_isready",
      "-U",
      "postgres",
      "-d",
      "creator_foundation",
    ]).status !== 0;
    i++
  )
    await delay(500);
  await delay(2000);
  psql("CREATE DATABASE walk_base");
  const base = node("scripts/migrate-trust.ts", {
    DATABASE_MIGRATION_URL: url("walk_base"),
    W8_LEGACY_ROOT_MIGRATIONS: "false",
  });
  if (base.status !== 0)
    throw new Error(`migrate-trust refused: ${base.stderr.slice(-300)}`);
  say(
    `base: canonical ${docker("exec", container, "psql", "-X", "-At", "-U", "postgres", "-d", "walk_base", "-c", "select count(*) from creator.schema_migration")} by migrate-trust`,
  );
  docker(
    "exec",
    container,
    "pg_dump",
    "-U",
    "postgres",
    "-Fc",
    "-d",
    "walk_base",
    "-f",
    "/tmp/d0.dump",
  );
  for (const [index, wave] of FRESH_WAVES.entries()) {
    const step = index + 1,
      target = `walk_t${step}`,
      restore = `walk_r${step}`,
      dump = `d${index}`;
    psql(`CREATE DATABASE ${target}`);
    psql(`CREATE DATABASE ${restore}`);
    for (const db of [target, restore])
      docker(
        "exec",
        container,
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        db,
        "--exit-on-error",
        `/tmp/${dump}.dump`,
      );
    psql(`ALTER DATABASE ${target} CONNECTION LIMIT 0`);
    psql(
      `COMMENT ON DATABASE ${target} IS 'creator-platform:restored-traffic-closed'`,
    );
    const backup = join(work, `${dump}.dump`);
    docker("cp", `${container}:/tmp/${dump}.dump`, backup);
    chmodSync(backup, 0o600);
    const live = await digests(target),
      copy = await digests(restore);
    const manifest = join(work, `manifest-${step}.json`);
    writeFileSync(
      manifest,
      JSON.stringify({
        schemaVersion: 1,
        database: target,
        createdAt: new Date().toISOString(),
        backupSha256: createHash("sha256")
          .update(readFileSync(backup))
          .digest("hex"),
        ...live,
        restored: { database: restore, ...copy },
      }),
      { mode: 0o600 },
    );
    const run = node("scripts/activate-wave.ts", {
      W8_MIGRATION_WAVE: wave,
      DATABASE_MIGRATION_URL: url(target),
      W8_MIGRATION_BACKUP_PATH: backup,
      W8_MIGRATION_BACKUP_MANIFEST: manifest,
    });
    if (run.status !== 0) {
      say(
        `STEP ${step} ${wave}: REFUSED: ${run.stderr.trim().split("\n").pop()}`,
      );
      refused = true;
      break;
    }
    const out = JSON.parse(run.stdout.trim().split("\n").pop()!);
    say(
      `STEP ${step} ${wave}: applied ${out.applied.length}, ledger ${out.priorLedgerRows} -> ${out.ledgerRows}, ${out.originalRows} rows preserved`,
    );
    psql(`ALTER DATABASE ${target} CONNECTION LIMIT -1`);
    docker(
      "exec",
      container,
      "pg_dump",
      "-U",
      "postgres",
      "-Fc",
      "-d",
      target,
      "-f",
      `/tmp/d${step}.dump`,
    );
  }
  say(
    refused
      ? "\nThe operator refused a wave (see above)."
      : "\nWALK COMPLETE: every wave applied on restored copies.",
  );
} finally {
  spawnSync("docker", ["rm", "-f", container]);
  rmSync(work, { recursive: true, force: true });
}
process.exit(refused ? 1 : 0);
