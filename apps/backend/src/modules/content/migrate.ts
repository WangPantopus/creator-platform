/** Isolated W5 migration launcher. Shared rollout still uses W8's registry. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

const url = process.env.DATABASE_MIGRATION_URL;
if (
  !url ||
  process.env.NODE_ENV !== "development" ||
  new URL(url).hostname !== "127.0.0.1" ||
  new URL(url).port !== "55435" ||
  !["/creator_w5", "/creator_w5_upgrade"].includes(new URL(url).pathname)
)
  throw new Error(
    "Use only W5's leased disposable development migration database.",
  );
const pool = new pg.Pool({ connectionString: url, max: 1 }),
  client = await pool.connect();
try {
  await client.query(
    "SELECT pg_advisory_lock(hashtextextended('creator-migrations',0))",
  );
  for (const [version, file] of [
    ["0032_w5_content", "schema.sql"],
    ["0033_w5_content_reconciliation", "schema-reconciliation.sql"],
    ["0034_w5_studio_drafts", "../studio/schema.sql"],
    ["0035_w5_content_consent", "schema-consent-history.sql"],
    ["0036_w5_content_thread_privacy", "schema-thread-privacy.sql"],
    ["0037_w5_content_fan_effects", "schema-fan-effects.sql"],
  ] as const) {
    const sql = await readFile(new URL(`./${file}`, import.meta.url), "utf8"),
      checksum = createHash("sha256").update(sql).digest("hex");
    const prior = (
      await client.query(
        "SELECT checksum FROM creator.schema_migration WHERE version=$1",
        [version],
      )
    ).rows[0];
    if (prior) {
      if (prior.checksum !== checksum)
        throw new Error("Applied W5 migration changed. Add a new migration.");
    } else {
      await client.query("BEGIN");
      try {
        await client.query(
          sql
            .replace(/^(\s*(?:--[^\n]*\n)*)BEGIN\s*;/i, "$1")
            .replace(/COMMIT\s*;\s*$/i, ""),
        );
        await client.query("RESET ROLE");
        await client.query(
          "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2)",
          [version, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    process.stdout.write(
      `${version}: checksum verified; isolated W5 allocation only.\n`,
    );
  }
} finally {
  await client.query(
    "SELECT pg_advisory_unlock(hashtextextended('creator-migrations',0))",
  );
  client.release();
  await pool.end();
}
