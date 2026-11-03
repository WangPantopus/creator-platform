import coreFollowReview from "../../../infra/migrations/reviews/20261027-core-follow.json" with { type: "json" };
import pilotColumnsReview from "../../../infra/migrations/reviews/20261101-pilot-columns.json" with { type: "json" };
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { recognizedAdoptionVersions, sha256 } from "./migration-custody.js";
import { assertPrivacyWaveRoleSafety } from "./migration-privacy-roles.js";
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
import comparisonReview from "../../../infra/migrations/reviews/20261008-comparison.json" with { type: "json" };
import { registeredComparisonProfile } from "../src/db/comparison-profile.js";
import noticesReview from "../../../infra/migrations/reviews/20261015-notices.json" with { type: "json" };
import signInAndMoneyReview from "../../../infra/migrations/reviews/20261015-sign-in-and-money.json" with { type: "json" };
import replyReview from "../../../infra/migrations/reviews/20261023-reply-review.json" with { type: "json" };
import studioReplyAuthorityReview from "../../../infra/migrations/reviews/20261023-studio-reply-authority.json" with { type: "json" };
import workspaceLockReview from "../../../infra/migrations/reviews/20261022-workspace-lock.json" with { type: "json" };
import generationReview from "../../../infra/migrations/reviews/20261007-generation-privacy.json" with { type: "json" };

type ChainSource = { version: string; path: string; checksum: string };
const chainSources = (value: unknown): value is ChainSource[] =>
  Array.isArray(value) &&
  value.every(
    (source) =>
      /^\d{4}_[a-z0-9_]+$/u.test(source?.version) &&
      /^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/u.test(
        source.path,
      ) &&
      !source.path.includes("..") &&
      /^[a-f0-9]{64}$/u.test(source.checksum),
  );
/** Where the canonical bootstrap ends is fixed here, not read from the chain:
 * the first wave after it (firstFresh in scripts/generate-migrations.mjs) and
 * its size, the canonical61. */
const firstFresh = "20261007-generation";
const canonicalSize = 61;
const chainRefusal =
  "infra/migrations/chain.json does not match its packets or the reviewed chain; run pnpm generate. No migration was applied.";
/** The canonical bootstrap and the waves the local installer applies after
 * it, from infra/migrations/chain.json and the packets whose checksums it
 * holds (scripts/generate-migrations.mjs writes both). */
async function freshChain(root: URL) {
  try {
    const chain = JSON.parse(
      await readFile(new URL("infra/migrations/chain.json", root), "utf8"),
    ) as {
      waves: { id: string; sha256: string }[];
      fresh: { canonical: number; waves: string[] };
    };
    if (
      !Array.isArray(chain.waves) ||
      !Array.isArray(chain.fresh.waves) ||
      chain.fresh.waves[0] !== firstFresh ||
      chain.fresh.canonical !== canonicalSize
    )
      throw new Error();
    let canonical: ChainSource[] | undefined;
    const waves: { id: string; sources: ChainSource[] }[] = [];
    for (const id of chain.fresh.waves) {
      if (typeof id !== "string" || !/^\d{8}(-[a-z0-9]+)*$/u.test(id))
        throw new Error();
      const bytes = await readFile(
        new URL(`infra/migrations/waves/${id}.json`, root),
      );
      const packet = JSON.parse(bytes.toString("utf8")) as {
        baseline: unknown;
        wave: unknown;
      };
      if (
        sha256(bytes) !== chain.waves.find((wave) => wave.id === id)?.sha256 ||
        !chainSources(packet.baseline) ||
        !chainSources(packet.wave)
      )
        throw new Error();
      canonical ??= packet.baseline;
      waves.push({ id, sources: packet.wave });
    }
    if (canonical?.length !== canonicalSize) throw new Error();
    return { canonical, waves };
  } catch {
    throw new Error(chainRefusal);
  }
}

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
  const comparisonVersions = new Set(
    comparisonReview.sources.map((source) => source.version),
  );
  const comparison = registry.migrations.some((source) =>
    comparisonVersions.has(source.version),
  );
  if (
    comparison &&
    (!partialRecovery || !(await registeredComparisonProfile()))
  )
    throw new Error(
      "Comparison registry requires all eight reviewed sources and the complete partial-recovery predecessor.",
    );
  const noticesVersions = new Set(
    noticesReview.sources.map((source) => source.version),
  );
  const notices = registry.migrations.some((source) =>
    noticesVersions.has(source.version),
  );
  // The comparison profile also refuses a partial or changed notices registration.
  if (notices && (!comparison || !(await registeredComparisonProfile())))
    throw new Error(
      "Notices registry requires both reviewed sources and the complete comparison predecessor.",
    );
  const signInAndMoneyVersions = new Set(
    signInAndMoneyReview.sources.map((source) => source.version),
  );
  const signInAndMoney = registry.migrations.some((source) =>
    signInAndMoneyVersions.has(source.version),
  );
  // The comparison profile also refuses a partial or changed registration.
  if (signInAndMoney && (!notices || !(await registeredComparisonProfile())))
    throw new Error(
      "Sign-in and money registry requires all three reviewed sources and the complete notices predecessor.",
    );
  const workspaceLockVersions = new Set(
    workspaceLockReview.sources.map((source) => source.version),
  );
  const workspaceLock = registry.migrations.some((source) =>
    workspaceLockVersions.has(source.version),
  );
  if (
    workspaceLock &&
    (!signInAndMoney || !(await registeredComparisonProfile()))
  )
    throw new Error(
      "Workspace-lock registry requires its exact source and complete sign-in and money predecessor.",
    );
  const replyReviewVersions = new Set(
    replyReview.sources.map((source) => source.version),
  );
  const replyReviewRegistered = registry.migrations.some((source) =>
    replyReviewVersions.has(source.version),
  );
  if (
    replyReviewRegistered &&
    (!workspaceLock || !(await registeredComparisonProfile()))
  )
    throw new Error(
      "Reply-review registry requires its exact source and complete workspace-lock predecessor.",
    );
  const studioReplyAuthorityVersions = new Set(
    studioReplyAuthorityReview.sources.map((source) => source.version),
  );
  const studioReplyAuthority = registry.migrations.some((source) =>
    studioReplyAuthorityVersions.has(source.version),
  );
  if (
    studioReplyAuthority &&
    (!replyReviewRegistered || !(await registeredComparisonProfile()))
  )
    throw new Error(
      "Creator/fan denial registry requires its exact source and complete reply-review predecessor.",
    );
  const coreFollowVersions = new Set(
    coreFollowReview.sources.map((source) => source.version),
  );
  const coreFollow = registry.migrations.some((source) =>
    coreFollowVersions.has(source.version),
  );
  if (
    coreFollow &&
    (!studioReplyAuthority || !(await registeredComparisonProfile()))
  )
    throw new Error(
      "Core Follow registry requires its exact source and complete creator/fan denial predecessor.",
    );
  const pilotColumnsVersions = new Set(
    pilotColumnsReview.sources.map((source) => source.version),
  );
  const pilotColumns = registry.migrations.some((source) =>
    pilotColumnsVersions.has(source.version),
  );
  if (pilotColumns && (!coreFollow || !(await registeredComparisonProfile())))
    throw new Error(
      "Pilot-columns registry requires all three reviewed sources and the complete core Follow predecessor.",
    );
  // Every source of a wave after the canonical bootstrap is activation-only:
  // activate-wave installs a complete reviewed wave, and this script never
  // applies one of its files by itself. The chain names those waves; one this
  // revision has no review for is refused before any SQL runs.
  const reviewedWaves = new Map<string, ReadonlySet<string>>([
    ["20261007-generation", generationVersions],
    ["20261007-content", new Set([contentPrivacySource.version])],
    [
      "20261007-generation-output",
      new Set([generationOutputRepairSource.version]),
    ],
    ["20261007-public-ai", publicVersions],
    ["20261007-generation-recovery", new Set([recoveryReview.source.version])],
    [
      "20261007-partial-generation-recovery",
      new Set([partialRecoveryReview.source.version]),
    ],
    ["20261008-comparison", comparisonVersions],
    ["20261015-notices", noticesVersions],
    ["20261015-sign-in-and-money", signInAndMoneyVersions],
    ["20261022-workspace-lock", workspaceLockVersions],
    ["20261023-reply-review", replyReviewVersions],
    ["20261023-studio-reply-authority", studioReplyAuthorityVersions],
    ["20261027-core-follow", coreFollowVersions],
    ["20261101-pilot-columns", pilotColumnsVersions],
  ]);
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
  const registeredVersions = new Set(
    registry.migrations.map((entry) => entry.version),
  );
  for (const [id, versions] of reviewedWaves)
    if (
      [...versions].some((version) => registeredVersions.has(version)) &&
      !fresh.waves.some((wave) => wave.id === id)
    )
      throw new Error(chainRefusal);
  const activationOnly = new Map<string, string>();
  for (const { id, sources } of fresh.waves) {
    const versions = reviewedWaves.get(id);
    if (
      !versions ||
      sources.length !== versions.size ||
      sources.some((source) => !versions.has(source.version))
    )
      throw new Error(
        `Registered wave ${id} has no matching review in this revision; no migration was applied.`,
      );
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
  const installedComparison = applied.filter((source) =>
    comparisonVersions.has(source.version),
  ).length;
  if (
    installedComparison &&
    (!comparison ||
      !installedPartialRecovery ||
      installedComparison !== comparisonVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered comparison wave; no per-file repair was attempted.",
    );
  const installedNotices = applied.filter((source) =>
    noticesVersions.has(source.version),
  ).length;
  if (
    installedNotices &&
    (!notices ||
      installedComparison !== comparisonVersions.size ||
      installedNotices !== noticesVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered notices wave; no per-file repair was attempted.",
    );
  const installedSignInAndMoney = applied.filter((source) =>
    signInAndMoneyVersions.has(source.version),
  ).length;
  if (
    installedSignInAndMoney &&
    (!signInAndMoney ||
      installedNotices !== noticesVersions.size ||
      installedSignInAndMoney !== signInAndMoneyVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered sign-in and money wave; no per-file repair was attempted.",
    );
  const installedWorkspaceLock = applied.filter((source) =>
    workspaceLockVersions.has(source.version),
  ).length;
  if (
    installedWorkspaceLock &&
    (!workspaceLock ||
      installedSignInAndMoney !== signInAndMoneyVersions.size ||
      installedWorkspaceLock !== workspaceLockVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered workspace-lock wave; no per-file repair was attempted.",
    );
  const installedReplyReview = applied.filter((source) =>
    replyReviewVersions.has(source.version),
  ).length;
  if (
    installedReplyReview &&
    (!replyReviewRegistered ||
      installedWorkspaceLock !== workspaceLockVersions.size ||
      installedReplyReview !== replyReviewVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered reply-review wave; no per-file repair was attempted.",
    );
  const installedStudioReplyAuthority = applied.filter((source) =>
    studioReplyAuthorityVersions.has(source.version),
  ).length;
  if (
    installedStudioReplyAuthority &&
    (!studioReplyAuthority ||
      installedReplyReview !== replyReviewVersions.size ||
      installedStudioReplyAuthority !== studioReplyAuthorityVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered creator/fan denial wave; no per-file repair was attempted.",
    );
  const installedCoreFollow = applied.filter((source) =>
    coreFollowVersions.has(source.version),
  ).length;
  if (
    installedCoreFollow &&
    (!coreFollow ||
      installedStudioReplyAuthority !== studioReplyAuthorityVersions.size ||
      installedCoreFollow !== coreFollowVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered core Follow wave; no per-file repair was attempted.",
    );
  const installedPilotColumns = applied.filter((source) =>
    pilotColumnsVersions.has(source.version),
  ).length;
  if (
    installedPilotColumns &&
    (!pilotColumns ||
      installedCoreFollow !== coreFollowVersions.size ||
      installedPilotColumns !== pilotColumnsVersions.size)
  )
    throw new Error(
      "Incomplete or unregistered pilot-columns wave; no per-file repair was attempted.",
    );
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
  const installedPrivacy = (rows: readonly { version: string }[]) => ({
    privacy: rows.some(
      (r) => r.version === "0087_w8_privacy_task_commit_fence",
    ),
    domain: rows.some((r) => r.version === "0103_w8_domain_privacy_task_fence"),
    canonicalBeforeGeneration: generation && !installedGeneration,
    generationBeforeContent: installedGeneration > 0 && !installedContent,
    contentBeforeOutput: installedContent && !installedOutput,
    outputBeforePublic: installedOutput && !installedPublic,
    publicBeforeComparison: Boolean(installedPublic && !installedComparison),
    comparisonBeforeNotices: Boolean(installedComparison && !installedNotices),
    coreFollowBeforePilotColumns: Boolean(
      installedCoreFollow && !installedPilotColumns,
    ),
    studioReplyAuthorityBeforeCoreFollow: Boolean(
      installedStudioReplyAuthority && !installedCoreFollow,
    ),
    replyReviewBeforeStudioReplyAuthority: Boolean(
      installedReplyReview && !installedStudioReplyAuthority,
    ),
    workspaceLockBeforeReplyReview: Boolean(
      installedWorkspaceLock && !installedReplyReview,
    ),
    signInAndMoneyBeforeWorkspaceLock: Boolean(
      installedSignInAndMoney && !installedWorkspaceLock,
    ),
    noticesBeforeSignInAndMoney: Boolean(
      installedNotices && !installedSignInAndMoney,
    ),
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
        await assertGenerationWaveRoleSafety(
          client,
          installedPilotColumns
            ? "pilot-columns"
            : installedCoreFollow
              ? "core-follow"
              : installedStudioReplyAuthority
                ? "studio-reply-authority"
                : installedReplyReview
                  ? "reply-review"
                  : installedWorkspaceLock
                    ? "workspace-lock"
                    : installedSignInAndMoney
                      ? "sign-in-and-money"
                      : installedNotices
                        ? "notices"
                        : installedComparison
                          ? "comparison"
                          : installedPartialRecovery
                            ? "partial-generation-recovery"
                            : installedRecovery
                              ? "generation-recovery"
                              : installedPublic
                                ? "public-ai"
                                : installedOutput
                                  ? "generation-output"
                                  : installedContent
                                    ? "content-privacy"
                                    : undefined,
        );
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
  // the local installer checks; every one is compared before the first runs.
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
        await assertGenerationWaveRoleSafety(
          client,
          installedPilotColumns
            ? "pilot-columns"
            : installedCoreFollow
              ? "core-follow"
              : installedStudioReplyAuthority
                ? "studio-reply-authority"
                : installedReplyReview
                  ? "reply-review"
                  : installedWorkspaceLock
                    ? "workspace-lock"
                    : installedSignInAndMoney
                      ? "sign-in-and-money"
                      : installedNotices
                        ? "notices"
                        : installedComparison
                          ? "comparison"
                          : installedPartialRecovery
                            ? "partial-generation-recovery"
                            : installedRecovery
                              ? "generation-recovery"
                              : installedPublic
                                ? "public-ai"
                                : installedOutput
                                  ? "generation-output"
                                  : installedContent
                                    ? "content-privacy"
                                    : undefined,
        );
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
  if (comparison && !installedComparison)
    process.stdout.write(
      "Comparison sources remain unapplied. After partial-recovery106, use W8_MIGRATION_WAVE=20261008-comparison with verified private backup/restore and closed admission.\n",
    );
  if (notices && !installedNotices)
    process.stdout.write(
      "Notices sources remain unapplied. After comparison114, use W8_MIGRATION_WAVE=20261015-notices with verified private backup/restore and closed admission.\n",
    );
  if (pilotColumns && !installedPilotColumns)
    process.stdout.write(
      "Pilot-columns sources remain unapplied. After core Follow123, use W8_MIGRATION_WAVE=20261101-pilot-columns with verified private backup/restore and closed admission.\n",
    );
  if (coreFollow && !installedCoreFollow)
    process.stdout.write(
      "Core Follow metadata remains unapplied. After creator/fan denial122, use W8_MIGRATION_WAVE=20261027-core-follow with verified private backup/restore and closed admission.\n",
    );
  if (studioReplyAuthority && !installedStudioReplyAuthority)
    process.stdout.write(
      "Creator/fan denial source remains unapplied. After reply-review121, use W8_MIGRATION_WAVE=20261023-studio-reply-authority with verified private backup/restore and closed admission.\n",
    );
  if (replyReviewRegistered && !installedReplyReview)
    process.stdout.write(
      "Reply-review source remains unapplied. After workspace-lock120, use W8_MIGRATION_WAVE=20261023-reply-review with verified private backup/restore and closed admission.\n",
    );
  if (workspaceLock && !installedWorkspaceLock)
    process.stdout.write(
      "Workspace-lock source remains unapplied. After sign-in-and-money119, use W8_MIGRATION_WAVE=20261022-workspace-lock with verified private backup/restore and closed admission.\n",
    );
  if (signInAndMoney && !installedSignInAndMoney)
    process.stdout.write(
      "Sign-in and money sources remain unapplied. After notices116, use W8_MIGRATION_WAVE=20261015-sign-in-and-money with verified private backup/restore and closed admission.\n",
    );
} finally {
  await client.query(
    "SELECT pg_advisory_unlock(hashtextextended('creator-migrations',0))",
  );
  client.release();
  await pool.end();
}
