import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";
import { recognizedAdoptionVersions } from "./migration-custody.js";

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
  const files = registry.migrations
    .filter(
      (file) =>
        !localLegacy || file.path.startsWith("apps/backend/migrations/"),
    )
    .sort((a, b) => a.version.localeCompare(b.version));
  const ids = files.map((file) => file.version.slice(0, 4));
  if (new Set(ids).size !== ids.length)
    throw new Error("Migration IDs conflict. Resolve the W8 registry first.");
  const exists = (
    await client.query(
      "SELECT to_regclass('creator.schema_migration') AS relation",
    )
  ).rows[0]?.relation;
  if (exists)
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
  const historical = localLegacy
    ? new Set<string>()
    : await recognizedAdoptionVersions(applied);
  for (const row of applied)
    if (
      !files.some((file) => file.version === row.version) &&
      !historical.has(row.version)
    )
      throw new Error(
        `Applied migration ${row.version} is absent from this revision.`,
      );
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
} finally {
  await client.query(
    "SELECT pg_advisory_unlock(hashtextextended('creator-migrations',0))",
  );
  client.release();
  await pool.end();
}
