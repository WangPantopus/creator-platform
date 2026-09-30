import { readFile } from "node:fs/promises";
import pg from "pg";
import { createHash } from "node:crypto";

if (!process.env.DATABASE_MIGRATION_URL)
  throw new Error(
    "DATABASE_MIGRATION_URL is required; the runtime URL cannot apply migrations.",
  );
// W1 owns the foundation/identity bootstrap. Domain migrations retain W8's
// separately coordinated ordering; this runner never guesses their versions.
const migrations = ["0001_foundation", "0002_w1_identity"];
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_MIGRATION_URL,
  max: 1,
});
const client = await pool.connect();
try {
  await client.query(
    "SELECT pg_advisory_lock(hashtextextended('creator-migrations',0))",
  );
  for (const version of migrations) {
    const sql = await readFile(
      new URL(`../migrations/${version}.sql`, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const relation = await client.query(
      "SELECT to_regclass('creator.schema_migration') AS relation",
    );
    if (relation.rows[0]?.relation)
      await client.query(
        "ALTER TABLE creator.schema_migration ADD COLUMN IF NOT EXISTS checksum text",
      );
    const existing = relation.rows[0]?.relation
      ? await client.query(
          "SELECT version,checksum FROM creator.schema_migration WHERE version=$1",
          [version],
        )
      : null;
    if (existing?.rowCount) {
      const prior = existing.rows[0];
      if (prior.checksum && prior.checksum !== checksum)
        throw new Error(
          `Applied migration ${version} changed; add a new migration.`,
        );
      process.stdout.write(
        `${version} already applied${prior.checksum ? " (checksum verified)" : "; W8 schema reconciliation required before full-registry adoption"}.\n`,
      );
      continue;
    }
    const body = sql
      .replace(/^(\s*(?:--[^\n]*\n)*)BEGIN\s*;/i, "$1")
      .replace(/COMMIT\s*;\s*$/i, "");
    await client.query("BEGIN");
    try {
      await client.query(body);
      await client.query("RESET ROLE");
      await client.query(
        "ALTER TABLE creator.schema_migration ADD COLUMN IF NOT EXISTS checksum text",
      );
      await client.query(
        "UPDATE creator.schema_migration SET checksum=$2 WHERE version=$1",
        [version, checksum],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    process.stdout.write(`${version} applied.\n`);
  }
} finally {
  await client
    .query(
      "SELECT pg_advisory_unlock(hashtextextended('creator-migrations',0))",
    )
    .catch(() => {});
  client.release();
  await pool.end();
}
