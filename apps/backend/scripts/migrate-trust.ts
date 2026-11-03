import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { recognizedAdoptionVersions, sha256 } from "./migration-custody.js";
import {
  chainRefusal,
  freshChain,
  matchesReview,
  noMatchingReview,
  reviewedWaves,
} from "./migration-chain.js";
import {
  assertPrivacyWaveRoleSafety,
  privacyStage,
} from "./migration-privacy-roles.js";
import { assertWaveRoleSafety } from "./migration-wave-roles.js";
import { assertGenerationWaveRoleSafety } from "./migration-generation-roles.js";
import { generationPrivacySourcesRegistered } from "../src/db/generation-privacy-sources.js";
import {
  contentPrivacySource,
  registeredContentPrivacyProfile,
} from "../src/db/content-privacy-profile.js";
import {
  generationOutputRepairSource,
  registeredGenerationOutputProfile,
} from "../src/db/generation-output-profile.js";
import partialRecoveryReview from "../../../infra/migrations/reviews/20261007-partial-generation-recovery.json" with { type: "json" };
import recoveryReview from "../../../infra/migrations/reviews/20261007-generation-recovery.json" with { type: "json" };
import { registeredGenerationRecoveryProfile } from "../src/db/generation-recovery-profile.js";
import publicAIReview from "../../../infra/migrations/reviews/20261007-public-ai.json" with { type: "json" };
import { registeredPublicAIProfile } from "../src/db/public-ai-profile.js";
import { registeredComparisonProfile } from "../src/db/comparison-profile.js";
import { type HeadWave, headWaves } from "../src/db/reviewed-waves.js";
import generationReview from "../../../infra/migrations/reviews/20261007-generation-privacy.json" with { type: "json" };

if (!process.env.DATABASE_MIGRATION_URL)
  throw new Error(
    "DATABASE_MIGRATION_URL is required; never use a runtime credential.",
  );
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_MIGRATION_URL,
  max: 1,
});
const client = await pool.connect();
try {
  await client.query(
    "SELECT pg_advisory_lock(hashtextextended('creator-migrations',0))",
  );
  const root = new URL("../../../", import.meta.url);
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", root), "utf8"),
  ) as {
    migrations: {
      version: string;
      path: string;
      owner: string;
      producerVersion?: string;
    }[];
  };
  const localLegacy = process.env.W8_LEGACY_ROOT_MIGRATIONS === "true";
  if (
    localLegacy &&
    !new URL(process.env.DATABASE_MIGRATION_URL).pathname.startsWith(
      "/creator_w8",
    )
  )
    throw new Error(
      "Legacy selection is limited to W8's isolated development databases.",
    );
  const generationVersions = new Set(
    generationReview.sources.map((source) => source.version),
  );
  const generation = registry.migrations.some((source) =>
    generationVersions.has(source.version),
  );
  if (
    generation &&
    (localLegacy || !(await generationPrivacySourcesRegistered()))
  )
    throw new Error(
      "Generation registry requires the complete reviewed source graph and canonical migration mode.",
    );
  const content = registry.migrations.some(
    (source) => source.version === contentPrivacySource.version,
  );
  if (content && (!generation || !(await registeredContentPrivacyProfile())))
    throw new Error(
      "Content registry requires the exact complete generation and Content graph.",
    );
  const output = registry.migrations.some(
    (source) => source.version === generationOutputRepairSource.version,
  );
  if (output && (!content || !(await registeredGenerationOutputProfile())))
    throw new Error(
      "Output registry requires the exact complete Content and output graph.",
    );
  const publicVersions = new Set(
    publicAIReview.sources.map((source) => source.version),
  );
  const publicAI = registry.migrations.some((source) =>
    publicVersions.has(source.version),
  );
  if (publicAI && (!output || !(await registeredPublicAIProfile())))
    throw new Error(
      "Public AI registry requires both exact sources and its complete predecessor.",
    );
  const recovery = registry.migrations.some(
    (source) => source.version === recoveryReview.source.version,
  );
  if (recovery && (!publicAI || !(await registeredGenerationRecoveryProfile())))
    throw new Error(
      "Recovery registry requires its complete reviewed predecessor.",
    );
  const partialRecovery = registry.migrations.some(
    (source) => source.version === partialRecoveryReview.source.version,
  );
  if (
    partialRecovery &&
    (!recovery ||
      (await registeredGenerationRecoveryProfile())?.source.version !==
        partialRecoveryReview.source.version)
  )
    throw new Error(
      "Partial-output recovery registry requires its complete reviewed predecessor.",
    );
  // Each head wave, in the chain's order, is registered when the registry
  // names any of its sources, and only on top of the complete wave before it.
  // The comparison profile also refuses a partial or changed registration.
  const registeredVersions = new Set(
    registry.migrations.map((entry) => entry.version),
  );
  const registeredWave = ({ review }: HeadWave) =>
    review.sources.some((source) => registeredVersions.has(source.version));
  let predecessor = partialRecovery;
  for (const wave of headWaves) {
    const registered = registeredWave(wave);
    if (registered && (!predecessor || !(await registeredComparisonProfile())))
      throw new Error(wave.trust.registry);
    predecessor = registered;
  }
  // Every source of a wave after the canonical bootstrap is activation-only:
  // activate-wave installs a complete reviewed wave, and this script never
  // applies one of its files by itself. The chain names those waves; one this
  // revision has no review for is refused before any SQL runs.
  const fresh = await freshChain(root);
  // Whatever the chain does not name as activation-only is the canonical
  // bootstrap, so a registry edit the chain has not seen is refused too.
  const chained = new Map(
    [...fresh.canonical, ...fresh.waves.flatMap((wave) => wave.sources)].map(
      (source) => [source.version, source.path],
    ),
  );
  if (
    chained.size !== registry.migrations.length ||
    registry.migrations.some(
      (entry) => chained.get(entry.version) !== entry.path,
    )
  )
    throw new Error(
      "The registry and infra/migrations/chain.json differ; run pnpm generate. No migration was applied.",
    );
  // A reviewed wave the registry names is activation-only whatever the chain
  // says, and every wave the chain names has its review here.
  for (const [id, versions] of reviewedWaves)
    if (
      [...versions].some((version) => registeredVersions.has(version)) &&
      !fresh.waves.some((wave) => wave.id === id)
    )
      throw new Error(chainRefusal);
  const activationOnly = new Map<string, string>();
  for (const { id, sources } of fresh.waves) {
    if (!matchesReview(id, sources)) throw new Error(noMatchingReview(id));
    for (const source of sources) activationOnly.set(source.version, id);
  }
  const registeredFiles = registry.migrations
    .filter(
      (file) =>
        !localLegacy || file.path.startsWith("apps/backend/migrations/"),
    )
    .sort((a, b) => a.version.localeCompare(b.version));
  const ids = registeredFiles.map((file) => file.version.slice(0, 4));
  if (new Set(ids).size !== ids.length)
    throw new Error("Migration IDs conflict. Resolve the W8 registry first.");
  const exists = (
    await client.query(
      "SELECT to_regclass('creator.schema_migration') AS relation",
    )
  ).rows[0]?.relation;
  if (exists && localLegacy)
    await client.query(
      "ALTER TABLE creator.schema_migration ADD COLUMN IF NOT EXISTS checksum text",
    );
  const applied = exists
    ? (
        await client.query<{ version: string; checksum: string | null }>(
          "SELECT version,checksum FROM creator.schema_migration ORDER BY version",
        )
      ).rows
    : [];
  const installedGeneration = applied.filter((row) =>
    generationVersions.has(row.version),
  ).length;
  if (
    installedGeneration &&
    (!generation || installedGeneration !== generationVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered generation wave; use the reviewed activation path, never per-file repair.",
    );
  const installedContent = applied.some(
    (row) => row.version === contentPrivacySource.version,
  );
  if (
    installedContent &&
    (!content || installedGeneration !== generationVersions.size)
  )
    throw new Error(
      "Unregistered Content extension or incomplete predecessor; no per-file repair was attempted.",
    );
  const installedOutput = applied.some(
    (row) => row.version === generationOutputRepairSource.version,
  );
  if (installedOutput && (!output || !installedContent))
    throw new Error(
      "Unregistered output repair or incomplete predecessor; no per-file repair was attempted.",
    );
  const installedPublic = applied.filter((row) =>
    publicVersions.has(row.version),
  ).length;
  if (
    installedPublic &&
    (!publicAI || !installedOutput || installedPublic !== publicVersions.size)
  )
    throw new Error(
      "Partial public AI activation or incomplete predecessor; no repair was attempted.",
    );
  const installedRecovery = applied.some(
    (row) => row.version === recoveryReview.source.version,
  );
  if (
    installedRecovery &&
    (!recovery || installedPublic !== publicVersions.size)
  )
    throw new Error(
      "Incomplete terminal recovery activation; no repair was attempted.",
    );
  const installedPartialRecovery = applied.some(
    (row) => row.version === partialRecoveryReview.source.version,
  );
  if (installedPartialRecovery && (!partialRecovery || !installedRecovery))
    throw new Error(
      "Incomplete partial-output recovery activation; no repair was attempted.",
    );
  // The ledger holds a head wave only complete and registered, on top of the
  // complete wave before it.
  const installedSources = ({ review }: HeadWave) =>
    applied.filter((row) =>
      review.sources.some((source) => source.version === row.version),
    ).length;
  let complete = installedPartialRecovery;
  for (const wave of headWaves) {
    const installed = installedSources(wave);
    if (
      installed &&
      (!registeredWave(wave) ||
        !complete ||
        installed !== wave.review.sources.length)
    )
      throw new Error(wave.trust.installed);
    complete = installed === wave.review.sources.length;
  }
  // Fresh databases still bootstrap the exact canonical61. The complete new
  // wave is only installed atomically by activate-wave after private backup,
  // separate restore and closed-admission checks. Registered code alone cannot
  // make that database ready. Already activated databases are verified below.
  const installedWaves = new Set(
    applied.flatMap((row) => activationOnly.get(row.version) ?? []),
  );
  const files = registeredFiles.filter((source) => {
    const wave = activationOnly.get(source.version);
    return wave === undefined || installedWaves.has(wave);
  });
  const historical = localLegacy
    ? new Set<string>()
    : await recognizedAdoptionVersions(applied);
  const continuation = files.some(
    (f) => f.version === "0103_w8_domain_privacy_task_fence",
  );
  const installedRoles = (rows: readonly { version: string }[]) => ({
    trust: rows.some((r) => r.version === "0053_w8_runtime_denial_projection"),
    media: rows.some((r) => r.version === "0062_w6_creator_media_worker"),
    content: rows.some((r) => r.version === "0074_w8_content_runtime_denial"),
    interactive: rows.some(
      (r) => r.version === "0082_w8_interactive_denial_try_fence",
    ),
  });
  // The role checks take the newest installed wave, and the wave whose
  // privacy stage holds; the installed waves are complete and in the chain's
  // order (above). With the generation wave unregistered, no stage holds.
  const counted = fresh.waves.map(({ id }) => ({
    id,
    counted: installedWaves.has(id),
  }));
  const newestWave =
    counted.filter((wave) => wave.counted).at(-1)?.id ?? fresh.waves[0]!.id;
  const before = privacyStage(counted, generation);
  const installedPrivacy = (rows: readonly { version: string }[]) => ({
    privacy: rows.some(
      (r) => r.version === "0087_w8_privacy_task_commit_fence",
    ),
    domain: rows.some((r) => r.version === "0103_w8_domain_privacy_task_fence"),
    before,
  });
  const hasWave = files.some(
    (file) => file.version === "0062_w6_creator_media_worker",
  );
  if (
    hasWave &&
    applied.length &&
    files.some(
      (file) =>
        file.version >= "0044_" &&
        !applied.some((row) => row.version === file.version),
    )
  )
    throw new Error(
      "Existing databases with pending wave migrations require scripts/activate-wave.ts and verified private backup/closed admission; no per-file rollout was attempted.",
    );
  if (hasWave) {
    await client.query("BEGIN");
    try {
      if (installedGeneration)
        await assertGenerationWaveRoleSafety(client, newestWave);
      else await assertWaveRoleSafety(client, installedRoles(applied));
      if (continuation)
        await assertPrivacyWaveRoleSafety(client, installedPrivacy(applied));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  for (const row of applied)
    if (
      !files.some((file) => file.version === row.version) &&
      !historical.has(row.version)
    )
      throw new Error(
        `Applied migration ${row.version} is absent from this revision.`,
      );
  // A file is applied here only with the bytes the canonical packet pins, as
  // the local installer checks; every one is compared before the first runs,
  // and again as it is applied.
  const pinned = new Map(
    fresh.canonical.map((source) => [source.version, source.checksum]),
  );
  for (const file of files)
    if (
      !applied.some((row) => row.version === file.version) &&
      sha256(await readFile(new URL(file.path, root))) !==
        pinned.get(file.version)
    )
      throw new Error(`Pinned source changed: ${file.version}.`);
  for (const file of files) {
    if (
      !/^\d{4}_[a-z0-9_]+$/.test(file.version) ||
      !/^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/.test(
        file.path,
      ) ||
      file.path.includes("..")
    )
      throw new Error("Invalid registry entry.");
    const sql = await readFile(new URL(file.path, root), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const version = file.version;
    const prior = applied.find((row) => row.version === version);
    if (prior) {
      if (prior.checksum && prior.checksum !== hash)
        throw new Error(
          `Applied migration ${version} changed. Add a new migration.`,
        );
      if (!prior.checksum && !localLegacy)
        throw new Error(
          `Applied migration ${version} lacks a trusted checksum. Reconcile its schema before adoption.`,
        );
      if (!prior.checksum)
        await client.query(
          "UPDATE creator.schema_migration SET checksum=$2 WHERE version=$1",
          [version, hash],
        );
      process.stdout.write(`Already applied: ${version}\n`);
      continue;
    }
    if (applied.some((row) => row.version > version))
      throw new Error(
        `Out-of-order migration ${version} needs coordinated rollout.`,
      );
    // The bytes applied are the bytes read here, which may have changed since
    // the comparison above.
    if (hash !== pinned.get(version))
      throw new Error(`Pinned source changed: ${version}.`);
    // Producer SQL has one outer transaction. Keep schema and checksum atomic,
    // even when a producer does not write the registry itself.
    const body = sql
      .replace(/^(\s*(?:--[^\n]*\n)*)BEGIN\s*;/i, "$1")
      .replace(/COMMIT\s*;\s*$/i, "");
    await client.query("BEGIN");
    try {
      await client.query(body);
      await client.query("RESET ROLE");
      if (file.producerVersion && file.producerVersion !== version) {
        if (!/^\d{4}_[a-z0-9_]+$/.test(file.producerVersion))
          throw new Error("Invalid producer version alias.");
        await client.query(
          "DELETE FROM creator.schema_migration WHERE version=$1",
          [file.producerVersion],
        );
      }
      await client.query(
        "ALTER TABLE creator.schema_migration ADD COLUMN IF NOT EXISTS checksum text",
      );
      await client.query(
        "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2) ON CONFLICT(version) DO UPDATE SET checksum=excluded.checksum",
        [version, hash],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    process.stdout.write(`Applied: ${version}\n`);
  }
  if (hasWave) {
    await client.query("BEGIN");
    try {
      if (installedGeneration)
        await assertGenerationWaveRoleSafety(client, newestWave);
      else await assertWaveRoleSafety(client, installedRoles(files));
      if (continuation)
        await assertPrivacyWaveRoleSafety(client, installedPrivacy(files));
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  if (generation && !installedGeneration)
    process.stdout.write(
      "Canonical61 verified; generation wave remains unapplied. Use W8_MIGRATION_WAVE=20261007-generation with scripts/activate-wave.ts and a verified private backup/restore before runtime admission.\n",
    );
  if (output && !installedOutput)
    process.stdout.write(
      "Generation output repair remains unapplied. After Content101, use W8_MIGRATION_WAVE=20261007-generation-output with verified private backup/restore and closed admission.\n",
    );
  if (content && !installedContent)
    process.stdout.write(
      "Content export remains unapplied. After generation100, use W8_MIGRATION_WAVE=20261007-content with verified private backup/restore and closed admission.\n",
    );
  // In the order these lines were written: comparison and notices, then each
  // later head wave newest first.
  const [comparisonWave, noticesWave, ...laterWaves] = headWaves;
  for (const wave of [comparisonWave, noticesWave, ...laterWaves.reverse()])
    if (registeredWave(wave) && !installedSources(wave))
      process.stdout.write(wave.trust.unapplied + "\n");
} finally {
  await client.query(
    "SELECT pg_advisory_unlock(hashtextextended('creator-migrations',0))",
  );
  client.release();
  await pool.end();
}
