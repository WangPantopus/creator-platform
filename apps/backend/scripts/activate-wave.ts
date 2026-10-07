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
  waveSecurityCustody,
  waveSequenceCustody,
} from "./migration-wave-custody.js";
import {
  assertWaveRoleSafety,
  WaveRoleSafetyError,
} from "./migration-wave-roles.js";

import { assertPrivacyWaveRoleSafety } from "./migration-privacy-roles.js";
import { assertGenerationWaveRoleSafety } from "./migration-generation-roles.js";
import { generationPrivacySourcesRegistered } from "../src/db/generation-privacy-sources.js";
import generationReview from "../../../infra/migrations/reviews/20261007-generation-privacy.json" with { type: "json" };

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
    ["20261002", "20261002-privacy", "20261007-generation"].includes(
      process.env.W8_MIGRATION_WAVE ?? "",
    ),
    "Select a reviewed W8_MIGRATION_WAVE (20261002, 20261002-privacy or 20261007-generation).",
  );
  const connection = process.env.DATABASE_MIGRATION_URL;
  check(
    connection,
    "Provide a separate DATABASE_MIGRATION_URL; never a runtime credential.",
  );
  const generation = process.env.W8_MIGRATION_WAVE === "20261007-generation";
  const continuation =
    generation || process.env.W8_MIGRATION_WAVE === "20261002-privacy";
  // Earlier reviewed waves remain usable after the complete generation graph
  // is registered. Validate the entire chain, then execute only the selected
  // wave against its exact predecessor; a future source is never auto-applied.
  const ids = ["20261002", "20261002-privacy", "20261007-generation"];
  const packets = await Promise.all(
    ids.map(
      async (id) =>
        JSON.parse(
          await readFile(
            new URL(`infra/migrations/waves/${id}.json`, repositoryRoot),
            "utf8",
          ),
        ) as Packet,
    ),
  );
  const [initial, prior, current] = packets as [Packet, Packet, Packet];
  check(
    packets.every(
      (entry, index) =>
        entry.schemaVersion === 1 &&
        entry.id === ids[index] &&
        entry.baseline.length === [40, 57, 61][index] &&
        entry.wave.length === [17, 4, 39][index],
    ) &&
      canonical(prior.baseline) ===
        canonical([...initial.baseline, ...initial.wave]) &&
      canonical(current.baseline) ===
        canonical([...prior.baseline, ...prior.wave]) &&
      canonical(prior.wave.map((s) => s.version)) ===
        canonical([
          "0074_w8_content_runtime_denial",
          "0082_w8_interactive_denial_try_fence",
          "0087_w8_privacy_task_commit_fence",
          "0103_w8_domain_privacy_task_fence",
        ]) &&
      canonical(current.wave) ===
        canonical(
          generationReview.sources.map(({ version, path, checksum }) => ({
            version,
            path,
            checksum,
          })),
        ) &&
      canonical(prior.outOfOrderException) ===
        canonical(initial.outOfOrderException) &&
      canonical(current.outOfOrderException) ===
        canonical(prior.outOfOrderException),
    "The exact reviewed 40/57/61/100-source migration chain is required.",
  );
  check(
    await generationPrivacySourcesRegistered(),
    "The current operator requires all 39 exact executable generation source registrations.",
  );
  const packet = packets.find(
    (entry) => entry.id === process.env.W8_MIGRATION_WAVE,
  )!;
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", repositoryRoot), "utf8"),
  ) as { migrations: { version: string; path: string }[] };
  const sources = [...packet.baseline, ...packet.wave];
  const registeredSources = [...current.baseline, ...current.wave];
  check(
    new Set(registeredSources.map((s) => s.version.slice(0, 4))).size ===
      registeredSources.length,
    "Migration packet IDs conflict.",
  );
  check(
    registry.migrations.length === registeredSources.length &&
      new Set(registry.migrations.map((entry) => entry.version)).size ===
        registry.migrations.length &&
      registry.migrations.every((e) =>
        registeredSources.some(
          (s) => s.version === e.version && s.path === e.path,
        ),
      ),
    "Active registry differs from the reviewed packet.",
  );
  const bodies = new Map<string, string>();
  for (const source of registeredSources) {
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
    securitySha256: string;
    sequenceSha256: string;
    restored: {
      ledgerSha256: string;
      schemaSha256: string;
      dataSha256: string;
      securitySha256: string;
      sequenceSha256: string;
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
    const generationInstalled = generation
      ? packet.wave.filter((source) =>
          before.some((row) => row.version === source.version),
        ).length
      : 0;
    check(
      !generation ||
        generationInstalled === 0 ||
        generationInstalled === packet.wave.length,
      "Partial generation wave is not an accepted baseline; no repair was attempted.",
    );
    if (generationInstalled) await assertGenerationWaveRoleSafety(client);
    else
      await assertWaveRoleSafety(client, {
        trust: before.some(
          (r) => r.version === "0053_w8_runtime_denial_projection",
        ),
        media: before.some((r) => r.version === "0062_w6_creator_media_worker"),
        content: before.some(
          (r) => r.version === "0074_w8_content_runtime_denial",
        ),
        interactive: before.some(
          (r) => r.version === "0082_w8_interactive_denial_try_fence",
        ),
      });
    if (continuation)
      await assertPrivacyWaveRoleSafety(client, {
        privacy: before.some(
          (r) => r.version === "0087_w8_privacy_task_commit_fence",
        ),
        domain: before.some(
          (r) => r.version === "0103_w8_domain_privacy_task_fence",
        ),
        canonicalBeforeGeneration: generationInstalled === 0,
      });
    const tables = await waveDataTables(client);
    const beforeData = await waveDataDigest(client, tables);
    const beforeRoles = await waveRoleCustody(client);
    const beforeSecurity = await waveSecurityCustody(client);
    const beforeSequences = await waveSequenceCustody(client);
    check(
      beforeData.sha256 === manifest.dataSha256 &&
        manifest.restored?.dataSha256 === manifest.dataSha256 &&
        manifest.restored?.ledgerSha256 === manifest.ledgerSha256 &&
        manifest.restored?.schemaSha256 === manifest.schemaSha256 &&
        beforeSecurity.sha256 === manifest.securitySha256 &&
        manifest.restored?.securitySha256 === manifest.securitySha256 &&
        beforeSequences.sha256 === manifest.sequenceSha256 &&
        manifest.restored?.sequenceSha256 === manifest.sequenceSha256,
      "A verified separate restore and matching live data digest are required.",
    );
    const historical = await recognizedAdoptionVersions(before);
    check(
      packet.baseline.every((s) =>
        before.some(
          (r) => r.version === s.version && r.checksum === s.checksum,
        ),
      ),
      "Apply or explicitly adopt the complete reviewed baseline first.",
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
    const afterSequences = await waveSequenceCustody(
      client,
      beforeSequences.values,
    );
    check(
      afterSequences.sha256 === beforeSequences.sha256,
      "Original sequence values changed; rolling back the wave.",
    );
    const roleSafety = generation
      ? await assertGenerationWaveRoleSafety(client)
      : await assertWaveRoleSafety(client, {
          trust: true,
          media: true,
          content: continuation,
          interactive: continuation,
        });
    const privacyRoleSafety = continuation
      ? await assertPrivacyWaveRoleSafety(client, {
          privacy: true,
          domain: true,
          canonicalBeforeGeneration: !generation,
        })
      : undefined;
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
    const afterSecurity = await waveSecurityCustody(client);
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
        originalSequencesPreserved: true,
        originalSequences: beforeSequences.sequences,
        verifiedBackupSecurity: true,
        securityRecords: afterSecurity.records,
        afterSecuritySha256: afterSecurity.sha256,
        roleSafety,
        privacyRoleSafety,
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
