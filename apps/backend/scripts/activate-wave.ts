import { readFile, stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import pg from "pg";
import {
  canonical,
  readLedger,
  recognizedAdoptionVersions,
  repositoryRoot,
  schemaCustody,
  sha256,
} from "./migration-custody.js";

import {
  waveDataTables,
  waveDataDigest,
  waveRoleCustody,
} from "./migration-wave-custody.js";
import {
  assertWaveRoleSafety,
  WaveRoleSafetyError,
} from "./migration-wave-roles.js";

type Source = { version: string; path: string; checksum: string };
type Packet = {
  schemaVersion: number;
  id: string;
  baseline: Source[];
  wave: Source[];
  outOfOrderException: {
    adoption: string;
    alreadyApplied: string;
    pending: string;
  };
};
class Preflight extends Error {}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Preflight(message);
}

async function activate() {
  check(
    process.env.W8_MIGRATION_WAVE === "20261002",
    "Select the reviewed W8_MIGRATION_WAVE=20261002.",
  );
  const connection = process.env.DATABASE_MIGRATION_URL;
  check(
    connection,
    "Provide a separate DATABASE_MIGRATION_URL; never a runtime credential.",
  );
  const packet = JSON.parse(
    await readFile(
      new URL("infra/migrations/waves/20261002.json", repositoryRoot),
      "utf8",
    ),
  ) as Packet;
  check(
    packet.schemaVersion === 1 &&
      packet.id === "20261002" &&
      packet.baseline.length === 40 &&
      packet.wave.length > 0,
    "Reviewed migration packet is unavailable.",
  );
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", repositoryRoot), "utf8"),
  ) as { migrations: { version: string; path: string }[] };
  const sources = [...packet.baseline, ...packet.wave];
  check(
    new Set(sources.map((s) => s.version.slice(0, 4))).size === sources.length,
    "Migration packet IDs conflict.",
  );
  check(
    registry.migrations.length === sources.length &&
      registry.migrations.every((e) =>
        sources.some((s) => s.version === e.version && s.path === e.path),
      ),
    "Active registry differs from the reviewed packet.",
  );
  const bodies = new Map<string, string>();
  for (const source of sources) {
    check(
      /^\d{4}_[a-z0-9_]+$/.test(source.version) &&
        /^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/.test(
          source.path,
        ) &&
        !source.path.includes(".."),
      "Invalid migration packet path/version.",
    );
    const sql = await readFile(new URL(source.path, repositoryRoot), "utf8");
    check(
      sha256(sql) === source.checksum,
      `Pinned source changed: ${source.version}.`,
    );
    const body = sql
      .replace(/^(\s*(?:--[^\n]*\n)*)BEGIN\s*;/i, "$1")
      .replace(/COMMIT\s*;\s*$/i, "");
    check(
      !/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body),
      "Internal transaction boundary is not allowed in the wave.",
    );
    bodies.set(source.version, body);
  }
  const backupPath = process.env.W8_MIGRATION_BACKUP_PATH;
  const manifestPath = process.env.W8_MIGRATION_BACKUP_MANIFEST;
  check(
    backupPath && manifestPath,
    "Provide the private backup and manifest paths.",
  );
  const repo = resolve(new URL(repositoryRoot).pathname);
  for (const path of [backupPath, manifestPath]) {
    const target = resolve(path);
    check(
      target !== repo && !target.startsWith(repo + sep),
      "Migration backups/manifests must be outside Git.",
    );
    const meta = await stat(target);
    check(
      meta.isFile() && (meta.mode & 0o077) === 0,
      "Migration backup/manifest must be private files.",
    );
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
    schemaVersion: number;
    database: string;
    backupSha256: string;
    ledgerSha256: string;
    schemaSha256: string;
    createdAt: string;
    dataSha256: string;
    restored: {
      ledgerSha256: string;
      schemaSha256: string;
      dataSha256: string;
    };
  };
  check(
    manifest.schemaVersion === 1 &&
      /^[a-f0-9]{64}$/.test(manifest.backupSha256) &&
      sha256(await readFile(backupPath)) === manifest.backupSha256,
    "Private backup hash does not match the manifest.",
  );
  const age = Date.now() - Date.parse(manifest.createdAt);
  check(
    Number.isFinite(age) && age >= 0 && age <= 3600000,
    "Create a current private backup/manifest before rollout.",
  );
  const pool = new pg.Pool({ connectionString: connection, max: 1 });
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended('creator-migrations',0))",
    );
    locked = true;
    await client.query("BEGIN");
    const db = (
      await client.query<{
        database: string;
        closed: boolean;
        major: number;
        connections: number;
      }>(
        "SELECT current_database() AS database,shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed' AS closed,current_setting('server_version_num')::int/10000 AS major,datconnlimit AS connections FROM pg_database WHERE datname=current_database()",
      )
    ).rows[0];
    check(
      db?.closed === true &&
        db.connections === 0 &&
        db.major === 17 &&
        db.database === manifest.database,
      "Use the named, traffic-closed PostgreSQL17 database with CONNECTION LIMIT 0.",
    );
    const connected = await client.query(
      "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' LIMIT 1",
    );
    check(
      !connected.rowCount,
      "Stop all other clients on the closed target before rollout.",
    );
    const before = await readLedger(client);
    await assertWaveRoleSafety(client, {
      trust: before.some(
        (r) => r.version === "0053_w8_runtime_denial_projection",
      ),
      media: before.some((r) => r.version === "0062_w6_creator_media_worker"),
    });
    const tables = await waveDataTables(client);
    const beforeData = await waveDataDigest(client, tables);
    const beforeRoles = await waveRoleCustody(client);
    check(
      beforeData.sha256 === manifest.dataSha256 &&
        manifest.restored?.dataSha256 === manifest.dataSha256 &&
        manifest.restored?.ledgerSha256 === manifest.ledgerSha256 &&
        manifest.restored?.schemaSha256 === manifest.schemaSha256,
      "A verified separate restore and matching live data digest are required.",
    );
    const historical = await recognizedAdoptionVersions(before);
    check(
      packet.baseline.every((s) =>
        before.some(
          (r) => r.version === s.version && r.checksum === s.checksum,
        ),
      ),
      "Apply or explicitly adopt the complete canonical40 baseline first.",
    );
    for (const row of before) {
      const source = sources.find((s) => s.version === row.version);
      check(
        source ? row.checksum === source.checksum : historical.has(row.version),
        "Unknown or changed applied history; no repair/backfill was attempted.",
      );
    }
    check(
      sha256(canonical(before)) === manifest.ledgerSha256 &&
        sha256(canonical(await schemaCustody(client))) ===
          manifest.schemaSha256,
      "Live ledger/catalog differs from the private backup manifest.",
    );
    const pending = packet.wave
      .filter((s) => !before.some((r) => r.version === s.version))
      .sort((a, b) => a.version.localeCompare(b.version));
    for (const source of pending) {
      const higher = before.filter((r) => r.version > source.version);
      const exception = packet.outOfOrderException;
      check(
        !higher.length ||
          (exception.adoption === "w5-20260930" &&
            source.version === exception.pending &&
            historical.has(exception.alreadyApplied) &&
            before.every(
              (r) =>
                r.version <= exception.alreadyApplied ||
                historical.has(r.version),
            )),
        "Out-of-order state is outside the exact adopted-W5 exception.",
      );
      await client.query(bodies.get(source.version)!);
      await client.query("RESET ROLE");
      await client.query(
        "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2)",
        [source.version, source.checksum],
      );
    }
    const after = await readLedger(client);
    const afterData = await waveDataDigest(client, tables);
    const afterRoles = await waveRoleCustody(client);
    const roleSafety = await assertWaveRoleSafety(client, {
      trust: true,
      media: true,
    });
    check(
      afterData.sha256 === beforeData.sha256 &&
        afterData.rows === beforeData.rows,
      "Original business rows changed; rolling back the wave.",
    );
    check(
      beforeRoles.every((old) =>
        afterRoles.some((row) => canonical(row) === canonical(old)),
      ),
      "Existing role attributes or memberships changed; rolling back.",
    );
    check(
      before.every((old) =>
        after.some(
          (row) =>
            row.version === old.version &&
            row.checksum === old.checksum &&
            row.appliedAt === old.appliedAt,
        ),
      ),
      "Existing migration history changed; rolling back the wave.",
    );
    check(
      sources.every((s) =>
        after.some((r) => r.version === s.version && r.checksum === s.checksum),
      ) && after.length === before.length + pending.length,
      "Wave ledger is incomplete; rolling back.",
    );
    const afterSchemaSha256 = sha256(canonical(await schemaCustody(client)));
    await client.query("COMMIT");
    process.stdout.write(
      JSON.stringify({
        wave: packet.id,
        applied: pending.map((s) => s.version),
        priorLedgerRows: before.length,
        ledgerRows: after.length,
        priorHistoryPreserved: true,
        originalDataPreserved: true,
        originalRows: beforeData.rows,
        originalTables: beforeData.tables,
        oldRolesPreserved: true,
        roleSafety,
        afterSchemaSha256,
        trafficClosed: true,
        releaseReady: false,
      }) + "\n",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    if (locked)
      await client.query(
        "SELECT pg_advisory_unlock(hashtextextended('creator-migrations',0))",
      );
    client.release();
    await pool.end();
  }
}
activate().catch((error) => {
  // PostgreSQL detail can contain private row values. Expose only safe operator
  // diagnostics, never the raw error, SQL, URL, backup or source records.
  process.stderr.write(
    error instanceof Preflight || error instanceof WaveRoleSafetyError
      ? error.message + "\n"
      : `Migration wave failed (${typeof error?.code === "string" ? error.code : "operator_error"}); transaction not accepted.\n`,
  );
  process.exitCode = 1;
});
