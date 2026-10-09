import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { assertGenerationWaveRoleSafety } from "../../../scripts/migration-generation-roles.js";
import { assertPrivacyWaveRoleSafety } from "../../../scripts/migration-privacy-roles.js";
import { readLedger, sha256 } from "../../../scripts/migration-custody.js";
import {
  waveDataDigest,
  waveDataTables,
} from "../../../scripts/migration-wave-custody.js";

// Local-stack tooling only. Brings a freshly bootstrapped, empty database from
// the canonical 61 migrations to the complete registered graph in one
// transaction.
//
// Why this exists: scripts/activate-wave.ts is the reviewed operator for a
// database that already holds data, and it demands a private backup, an
// independent restore and a traffic-closed target. At the current registry it
// also cannot walk a fresh database past the content wave, because its
// post-apply check for that stage falls through to the final-state catalogue,
// which expects the later waves (`privacy_original_family_unavailable`).
// An empty database has nothing to protect, so this applies exactly the same
// reviewed SQL in exactly the same wave order, refuses on any business row,
// checks every pinned checksum, and finishes with the repository's own final
// role-safety and privacy-catalogue assertions before it commits.

/** Wave order the operator accepts; each needs the complete previous one. */
export const FRESH_WAVES = [
  "20261007-generation",
  "20261007-content",
  "20261007-generation-output",
  "20261007-public-ai",
  "20261007-generation-recovery",
  "20261007-partial-generation-recovery",
  "20261008-comparison",
] as const;

type Source = { version: string; path: string; checksum: string };
type Packet = { id: string; baseline: Source[]; wave: Source[] };

export type FreshInstallInput = {
  /** Superuser (migration administrator) URL of the fresh database. */
  databaseUrl: string;
  repoRoot: string;
  log: (line: string) => void;
};

export async function installFullHost(input: FreshInstallInput) {
  const packets = FRESH_WAVES.map(
    (id) =>
      JSON.parse(
        readFileSync(
          join(input.repoRoot, `infra/migrations/waves/${id}.json`),
          "utf8",
        ),
      ) as Packet,
  );
  const pool = new pg.Pool({ connectionString: input.databaseUrl, max: 1 });
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended('creator-migrations',0))",
    );
    locked = true;
    await client.query("BEGIN");
    const identity = (
      await client.query<{ safe: boolean; major: number; closed: boolean }>(
        `SELECT current_user=session_user AND r.rolsuper AS safe,
           current_setting('server_version_num')::int/10000 AS major,
           coalesce(shobj_description(d.oid,'pg_database')='creator-platform:restored-traffic-closed',false) AS closed
         FROM pg_roles r, pg_database d
         WHERE r.rolname=session_user AND d.datname=current_database()`,
      )
    ).rows[0];
    if (!identity?.safe || identity.major !== 17)
      throw new Error(
        "Install the full host as the migration administrator on PostgreSQL 17.",
      );
    if (identity.closed)
      throw new Error(
        "This database carries the restored-traffic-closed marker; it is not a fresh stack database.",
      );
    const before = await readLedger(client);
    const applied = new Map(before.map((row) => [row.version, row.checksum]));
    const pending = packets.map((packet) =>
      packet.wave.filter((source) => !applied.has(source.version)),
    );
    if (pending.every((sources) => sources.length === 0)) {
      await client.query("ROLLBACK");
      input.log("full host: all 114 migrations already applied");
      return { applied: 0 };
    }
    // Only a clean canonical bootstrap qualifies. A partly applied wave, or a
    // later wave without its predecessor, is not something to repair here.
    const firstPending = pending.findIndex((sources) => sources.length > 0);
    if (
      pending.some(
        (sources, index) =>
          sources.length > 0 && sources.length !== packets[index]!.wave.length,
      ) ||
      pending.slice(firstPending).some((sources) => sources.length === 0)
    )
      throw new Error(
        "The database holds part of a wave. Recreate the stack database (`stack down`, then `stack up`).",
      );
    const baseline = packets[firstPending]!.baseline;
    if (
      !baseline.every(
        (source) => applied.get(source.version) === source.checksum,
      )
    )
      throw new Error(
        "The canonical baseline is incomplete or changed; run the canonical bootstrap first.",
      );
    const tables = await waveDataTables(client);
    const dataBefore = await waveDataDigest(client, tables);
    if (dataBefore.rows !== 0)
      throw new Error(
        "This database holds business rows. The local installer only runs on an empty database; use the reviewed wave operator for anything else.",
      );
    let count = 0;
    for (const [index, packet] of packets.entries()) {
      const sources = [...pending[index]!].sort((a, b) =>
        a.version.localeCompare(b.version),
      );
      for (const source of sources) {
        if (
          !/^\d{4}_[a-z0-9_]+$/.test(source.version) ||
          !/^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/.test(
            source.path,
          ) ||
          source.path.includes("..")
        )
          throw new Error(`Invalid registry entry ${source.version}.`);
        const sql = readFileSync(join(input.repoRoot, source.path), "utf8");
        if (sha256(sql) !== source.checksum)
          throw new Error(`Pinned source changed: ${source.version}.`);
        const body = sql
          .replace(/^(\s*(?:--[^\n]*\n)*)BEGIN\s*;/i, "$1")
          .replace(/COMMIT\s*;\s*$/i, "");
        if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(body))
          throw new Error(
            `Internal transaction boundary in ${source.version}.`,
          );
        await client.query(body);
        await client.query("RESET ROLE");
        await client.query(
          "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2)",
          [source.version, source.checksum],
        );
        count += 1;
      }
      input.log(`full host: ${packet.id} (${sources.length} sources)`);
    }
    // The same final assertions scripts/migrate-trust.ts runs on any database
    // that holds the wave graph, plus the original business-row check.
    await assertGenerationWaveRoleSafety(client, "comparison");
    await assertPrivacyWaveRoleSafety(client, {
      privacy: true,
      domain: true,
      canonicalBeforeGeneration: false,
      generationBeforeContent: false,
      outputBeforePublic: false,
      publicBeforeComparison: false,
    });
    const dataAfter = await waveDataDigest(client, tables);
    if (dataAfter.sha256 !== dataBefore.sha256 || dataAfter.rows !== 0)
      throw new Error(
        "Business rows appeared during the install; rolled back.",
      );
    await client.query("COMMIT");
    input.log(`full host: ${count} migrations applied`);
    return { applied: count };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    if (locked)
      await client
        .query(
          "SELECT pg_advisory_unlock(hashtextextended('creator-migrations',0))",
        )
        .catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("local/fresh-install.ts")) {
  const [databaseUrl, repoRoot] = process.argv.slice(2);
  if (!databaseUrl || !repoRoot)
    throw new Error("usage: fresh-install.ts <databaseUrl> <repoRoot>");
  const result = await installFullHost({
    databaseUrl,
    repoRoot,
    log: (line) => process.stdout.write(line + "\n"),
  });
  process.stdout.write(JSON.stringify(result) + "\n");
}
