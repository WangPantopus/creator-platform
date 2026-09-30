import { readFile, open, rename, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import { z } from "zod";
import { PrivacyDomains } from "../src/modules/trust/contracts.js";

// Operational recovery tool, not a traffic/test runner. Journals contain minimal
// deletion scope identifiers and must live in encrypted, independently backed-up storage.
const Row = z
  .strictObject({
    id: z.uuid(),
    account_id: z.uuid(),
    scope: z.enum(["account", "creator", "thread"]),
    creator_id: z.uuid().nullable(),
    thread_id: z.uuid().nullable(),
    job_id: z.uuid(),
    created_at: z.iso.datetime({ offset: true }),
  })
  .refine((r) => r.scope === "account" || r.creator_id !== null)
  .refine((r) => r.scope !== "thread" || r.thread_id !== null);
const Journal = z.strictObject({
  schemaVersion: z.literal(1),
  createdAt: z.iso.datetime(),
  sourceDatabase: z.string().min(1).max(128),
  tombstones: z.array(Row).max(100000),
});
const [operation, fileArgument] = process.argv.slice(2);
if (!["export", "restore"].includes(operation ?? "") || !fileArgument)
  throw new Error(
    "Usage: tombstone-journal.ts export|restore /secure/absolute/journal.json",
  );
const url = process.env.DATABASE_RECOVERY_URL;
if (!url)
  throw new Error(
    "DATABASE_RECOVERY_URL is required; use a dedicated recovery credential.",
  );
const destination = resolve(fileArgument);
const pool = new pg.Pool({
  connectionString: url,
  max: 1,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,
});
const client = await pool.connect();
try {
  if (operation === "export") {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await client.query(
      "SELECT id,account_id,scope,creator_id,thread_id,job_id,created_at FROM creator_trust.tombstone ORDER BY created_at,id LIMIT 100001",
    );
    if (result.rows.length > 100000)
      throw new Error(
        "Journal needs a partitioned export; no records were truncated.",
      );
    const value = Journal.parse({
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      sourceDatabase: new URL(url).pathname.slice(1),
      tombstones: result.rows.map((r) => ({
        ...r,
        created_at: r.created_at.toISOString(),
      })),
    });
    await client.query("COMMIT");
    const data = JSON.stringify(value);
    const temporary = destination + ".new";
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    process.stdout.write(
      JSON.stringify({
        operation,
        rows: value.tombstones.length,
        sha256: createHash("sha256").update(data).digest("hex"),
        createdAt: value.createdAt,
      }) + "\n",
    );
  } else {
    const target = new URL(url).pathname.slice(1);
    if (
      process.env.RESTORED_DATABASE_NAME !== target ||
      process.env.RESTORED_TRAFFIC_DISABLED !== "true"
    )
      throw new Error(
        "Name the restored database and disable all runtime traffic before replay.",
      );
    if ((await stat(destination)).size > 64 * 1024 * 1024)
      throw new Error("Journal exceeds the bounded import size.");
    const data = await readFile(destination, "utf8");
    const sha256 = createHash("sha256").update(data).digest("hex");
    if (process.env.JOURNAL_EXPECTED_SHA256 !== sha256)
      throw new Error(
        "Journal checksum must match the independently trusted backup manifest.",
      );
    const value = Journal.parse(JSON.parse(data));
    const started = performance.now();
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('trust-restoration-journal',0))",
    );
    for (const row of value.tombstones) {
      const prior = (
        await client.query(
          "SELECT account_id,scope,creator_id,thread_id FROM creator_trust.privacy_job WHERE id=$1 FOR UPDATE",
          [row.job_id],
        )
      ).rows[0];
      if (
        prior &&
        (prior.account_id !== row.account_id ||
          prior.scope !== row.scope ||
          prior.creator_id !== row.creator_id ||
          prior.thread_id !== row.thread_id)
      )
        throw new Error("Restored job scope conflicts with the journal.");
      await client.query(
        "INSERT INTO creator_trust.privacy_job(id,account_id,kind,scope,creator_id,thread_id,state,verified_at,verification_ref,created_at) VALUES($1,$2,'delete',$3,$4,$5,'queued',$6,'restoration_journal',$6) ON CONFLICT(id) DO UPDATE SET state='queued',completed_at=NULL,updated_at=now()",
        [
          row.job_id,
          row.account_id,
          row.scope,
          row.creator_id,
          row.thread_id,
          row.created_at,
        ],
      );
      await client.query(
        "INSERT INTO creator_trust.tombstone(id,account_id,scope,creator_id,thread_id,job_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(job_id) DO NOTHING",
        [
          row.id,
          row.account_id,
          row.scope,
          row.creator_id,
          row.thread_id,
          row.job_id,
          row.created_at,
        ],
      );
      for (const domain of PrivacyDomains)
        await client.query(
          "INSERT INTO creator_trust.privacy_task(job_id,domain) VALUES($1,$2) ON CONFLICT(job_id,domain) DO UPDATE SET state='pending',attempts=0,available_at=now(),lease_until=NULL,lease_token=NULL,receipt=NULL,data=NULL,error_code=NULL,completed_at=NULL",
          [row.job_id, domain],
        );
    }
    await client.query("COMMIT");
    process.stdout.write(
      JSON.stringify({
        operation,
        rows: value.tombstones.length,
        sha256,
        replayMs: Math.round(performance.now() - started),
        trafficReady: false,
        requiredNext:
          "Run every domain's denial/purge and verify acknowledgments before reopening traffic.",
      }) + "\n",
    );
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
