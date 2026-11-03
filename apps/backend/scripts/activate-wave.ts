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
import {
  chainRefusal,
  noMatchingReview,
  operatorChain,
} from "./migration-chain.js";
import { generationPrivacySourcesRegistered } from "../src/db/generation-privacy-sources.js";
import { registeredContentPrivacyProfile } from "../src/db/content-privacy-profile.js";
import { registeredGenerationOutputProfile } from "../src/db/generation-output-profile.js";
import { registeredComparisonProfile } from "../src/db/comparison-profile.js";
import { registeredGenerationRecoveryProfile } from "../src/db/generation-recovery-profile.js";
import { registeredPublicAIProfile } from "../src/db/public-ai-profile.js";
import {
  headWaves,
  type PrivacyStage,
  reviewedWaves,
} from "../src/db/reviewed-waves.js";

type Source = { version: string; path: string; checksum: string };
type Packet = {
  schemaVersion: number;
  id: string;
  baseline: Source[];
  wave: Source[];
  baselineOrderingException?: {
    review: string;
    precedingWave: string;
    pending: string;
  };
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
  // The waves come from infra/migrations/chain.json, in its order: the
  // canonical bootstrap's two October waves, then every reviewed wave. A
  // chain wave the table of reviewed waves has no row for is refused first.
  let chain: Awaited<ReturnType<typeof operatorChain>>;
  try {
    chain = await operatorChain();
  } catch {
    throw new Preflight(chainRefusal);
  }
  const rows = new Map(reviewedWaves.map((row) => [row.id, row] as const));
  for (const { id } of chain.waves.slice(chain.fresh))
    check(rows.has(id), noMatchingReview(id));
  const ids = chain.waves.map((wave) => wave.id);
  // The list reads as it always has: a comma after each wave up to the first
  // fresh one, spaces after that, and "or" before the last.
  const listed = ids
    .map((id, index) =>
      index === ids.length - 1
        ? `or ${id}`
        : index <= chain.fresh
          ? `${id},`
          : id,
    )
    .join(" ");
  const selected = ids.indexOf(process.env.W8_MIGRATION_WAVE ?? "");
  check(selected >= 0, `Select a reviewed W8_MIGRATION_WAVE (${listed}).`);
  const connection = process.env.DATABASE_MIGRATION_URL;
  check(
    connection,
    "Provide a separate DATABASE_MIGRATION_URL; never a runtime credential.",
  );
  // Every wave after the chain's first carries the privacy fences; from the
  // first fresh wave on, the generation graph.
  const continuation = selected >= 1;
  const generation = selected >= chain.fresh;
  // Earlier reviewed waves remain usable after the complete generation graph
  // is registered. Validate the entire chain, then execute only the selected
  // wave against its exact predecessor; a future source is never auto-applied.
  const packets = chain.waves.map((wave) => wave.packet as Packet);
  // The two October waves have no review. Like the canonical61, they are
  // fixed here: 17 sources on the first 40, then the four privacy fences.
  // Every later wave lists exactly the sources its review names.
  const fences = [
    "0074_w8_content_runtime_denial",
    "0082_w8_interactive_denial_try_fence",
    "0087_w8_privacy_task_commit_fence",
    "0103_w8_domain_privacy_task_fence",
  ];
  const sizes = [
    17,
    fences.length,
    ...ids.slice(chain.fresh).map((id) => rows.get(id)!.sources.length),
  ];
  // Each wave's baseline, then the head's sources: 40/57/61/.../126.
  const baselines = sizes.reduce(
    (sums, size) => [...sums, sums.at(-1)! + size],
    [40],
  );
  let exact =
    chain.fresh === 2 &&
    packets.every(
      (entry, index) =>
        entry.schemaVersion === 1 &&
        entry.id === ids[index] &&
        entry.baseline.length === baselines[index] &&
        entry.wave.length === sizes[index],
    );
  for (let index = 1; exact && index < packets.length; index += 1) {
    const entry = packets[index]!;
    const prior = packets[index - 1]!;
    const row = index < chain.fresh ? undefined : rows.get(ids[index]!)!;
    exact =
      canonical(entry.baseline) ===
        canonical([...prior.baseline, ...prior.wave]) &&
      (row
        ? canonical(entry.wave) ===
          canonical(
            row.sources.map(({ version, path, checksum }) => ({
              version,
              path,
              checksum,
            })),
          )
        : canonical(entry.wave.map((s) => s.version)) === canonical(fences)) &&
      canonical(entry.outOfOrderException) ===
        canonical(prior.outOfOrderException) &&
      (row?.operator.orderingException === undefined ||
        canonical(entry.baselineOrderingException) ===
          canonical(row.operator.orderingException)) &&
      (row?.baselineWave === undefined ||
        sha256(
          await readFile(new URL(row.baselineWave.path, repositoryRoot)),
        ) === row.baselineWave.sha256);
  }
  check(
    exact,
    `The exact reviewed ${baselines.join("/")}-source migration chain is required.`,
  );
  check(
    await generationPrivacySourcesRegistered(),
    "The current operator requires all 39 exact executable generation source registrations.",
  );
  check(
    await registeredContentPrivacyProfile(),
    "The exact executable Content source registration is required.",
  );
  check(
    await registeredGenerationOutputProfile(),
    "The exact executable output repair source registration is required.",
  );
  check(
    await registeredPublicAIProfile(),
    "Both exact public AI source registrations are required.",
  );
  check(
    await registeredGenerationRecoveryProfile(),
    "The exact terminal recovery registration is required.",
  );
  const named = headWaves.map((wave) => wave.operator.name);
  check(
    await registeredComparisonProfile(),
    `The complete ${named.slice(0, -1).join(", ")} and ${named.at(-1)} source registrations are required.`,
  );
  const packet = packets[selected]!;
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", repositoryRoot), "utf8"),
  ) as { migrations: { version: string; path: string }[] };
  const sources = [...packet.baseline, ...packet.wave];
  const head = packets.at(-1)!;
  const registeredSources = [...head.baseline, ...head.wave];
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
    rolesSha256: string;
    sequenceSha256: string;
    restored: {
      database: string;
      rolesSha256: string;
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
    // Each reviewed wave in the chain's order, and how many of its sources
    // the ledger holds.
    const reviewed = packets.slice(chain.fresh).map((entry, index) => ({
      wave: entry.wave,
      ...rows.get(ids[chain.fresh + index]!)!.operator,
    }));
    const held = reviewed.map(({ wave, upToSelected }, index) =>
      upToSelected && chain.fresh + index > selected
        ? 0
        : wave.filter((source) =>
            before.some((row) => row.version === source.version),
          ).length,
    );
    const complete = (index: number) =>
      index >= 0 && held[index] === reviewed[index]!.wave.length;
    for (const [index, entry] of reviewed.entries()) {
      if (entry.partial)
        check(
          held[index] === 0 || held[index] === entry.wave.length,
          entry.partial,
        );
      if (entry.activation)
        check(
          chain.fresh + index > selected || complete(index - 1),
          entry.activation,
        );
      if (entry.precedes)
        check(!held[index] || complete(index - 1), entry.precedes);
    }
    // The role checks still take the name of the newest wave they should
    // find, and the privacy stages: a stage holds while the wave before it
    // counts and its own wave doesn't.
    const extension = (counts: (index: number) => boolean) => {
      for (let index = reviewed.length - 1; index >= 0; index -= 1)
        if (reviewed[index]!.extension && counts(index))
          return reviewed[index]!.extension;
      return undefined;
    };
    const stages = (counts: (index: number) => boolean) => {
      const flags: Partial<Record<PrivacyStage, boolean>> = {};
      let reached = true;
      for (const [index, { privacy }] of reviewed.entries())
        if (privacy) {
          flags[privacy] = reached && !counts(index);
          reached = counts(index);
        }
      return flags;
    };
    const installed = (index: number) => held[index]! > 0;
    if (held[0])
      await assertGenerationWaveRoleSafety(client, extension(installed));
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
        ...stages(installed),
      });
    const tables = await waveDataTables(client);
    const beforeData = await waveDataDigest(client, tables);
    const beforeRoles = await waveRoleCustody(client);
    const beforeSecurity = await waveSecurityCustody(client);
    const beforeSequences = await waveSequenceCustody(client);
    check(
      manifest.restored?.database !== db.database &&
        typeof manifest.restored?.database === "string" &&
        sha256(canonical(beforeRoles)) === manifest.rolesSha256 &&
        manifest.restored.rolesSha256 === manifest.rolesSha256 &&
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
    const chosen = reviewed[selected - chain.fresh];
    for (const source of pending) {
      const higher = before.filter((r) => r.version > source.version);
      const exception = packet.outOfOrderException;
      check(
        !higher.length ||
          (chosen?.orderingException !== undefined &&
            source.version === chosen.orderingException.pending &&
            higher.every((row) =>
              packet.baseline.some(
                (original) =>
                  original.version === row.version &&
                  original.checksum === row.checksum,
              ),
            )) ||
          (exception.adoption === "w5-20260930" &&
            source.version === exception.pending &&
            historical.has(exception.alreadyApplied) &&
            before.every(
              (r) =>
                r.version <= exception.alreadyApplied ||
                historical.has(r.version),
            )),
        "Out-of-order state is outside the exact reviewed baseline exceptions.",
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
    // After the wave, the role checks find exactly what the chain holds up to
    // the selected wave.
    const upTo = (index: number) => chain.fresh + index <= selected;
    const roleSafety = generation
      ? await assertGenerationWaveRoleSafety(client, extension(upTo))
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
          ...stages(upTo),
        })
      : undefined;
    check(
      afterData.sha256 === beforeData.sha256 &&
        afterData.rows === beforeData.rows,
      "Original business rows changed; rolling back the wave.",
    );
    if (chosen?.sameRoleCount)
      check(afterRoles.length === beforeRoles.length, chosen.sameRoleCount);
    if (chosen?.addedRoles) {
      const added = afterRoles.filter(
        (row) => !beforeRoles.some((old) => old.role === row.role),
      );
      const expected = chosen.addedRoles.sources
        .filter(({ version }) =>
          pending.some((source) => source.version === version),
        )
        .map(({ role }) => role);
      // The inbox login's attributes, memberships and settings were checked
      // above by the generation role safety (assertCommerceInboxLogin).
      check(
        canonical(added.map((row) => row.role).sort()) ===
          canonical(expected.sort()),
        chosen.addedRoles.refusal,
      );
    }
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
