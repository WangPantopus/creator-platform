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
  .refine((r) => r.scope !== "thread" || r.thread_id !== null)
  .refine(
    (r) =>
      r.scope !== "account" || (r.creator_id === null && r.thread_id === null),
  )
  .refine((r) => r.scope !== "creator" || r.thread_id === null);
const OwnershipRow = Row.safeExtend({
  owned_creator_ids: z.array(z.uuid()).max(100).nullable(),
  ownership_ref: z.string().trim().min(8).max(200).nullable(),
})
  .refine((r) => (r.owned_creator_ids === null) === (r.ownership_ref === null))
  .refine((r) => r.scope === "account" || r.owned_creator_ids === null);
const journalFields = {
  createdAt: z.iso.datetime(),
  sourceDatabase: z.string().min(1).max(128),
};
const Journal = z.discriminatedUnion("schemaVersion", [
  z.strictObject({
    schemaVersion: z.literal(1),
    ...journalFields,
    tombstones: z.array(Row).max(100000),
  }),
  z.strictObject({
    schemaVersion: z.literal(2),
    ...journalFields,
    tombstones: z.array(OwnershipRow).max(100000),
  }),
]);
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
      `SELECT t.id,t.account_id,t.scope,t.creator_id,t.thread_id,t.job_id,t.created_at,j.owned_creator_ids,j.ownership_ref
       FROM creator_trust.tombstone t JOIN creator_trust.privacy_job j ON j.id=t.job_id
       WHERE j.kind='delete' AND j.account_id=t.account_id AND j.scope=t.scope
         AND j.creator_id IS NOT DISTINCT FROM t.creator_id AND j.thread_id IS NOT DISTINCT FROM t.thread_id
       ORDER BY t.created_at,t.id LIMIT 100001`,
    );
    const total = await client.query<{ count: string }>(
      "SELECT count(*) FROM creator_trust.tombstone",
    );
    if (
      Number(total.rows[0]?.count) !== result.rows.length &&
      result.rows.length <= 100000
    )
      throw new Error(
        "Tombstone job provenance is inconsistent; no journal was exported.",
      );
    if (result.rows.length > 100000)
      throw new Error(
        "Journal needs a partitioned export; no records were truncated.",
      );
    const value = Journal.parse({
      schemaVersion: 2,
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
          "SELECT account_id,kind,scope,creator_id,thread_id,owned_creator_ids,ownership_ref FROM creator_trust.privacy_job WHERE id=$1 FOR UPDATE",
          [row.job_id],
        )
      ).rows[0];
      if (
        prior &&
        (prior.kind !== "delete" ||
          prior.account_id !== row.account_id ||
          prior.scope !== row.scope ||
          prior.creator_id !== row.creator_id ||
          prior.thread_id !== row.thread_id)
      )
        throw new Error("Restored job scope conflicts with the journal.");
      const ownership =
        "owned_creator_ids" in row ? row.owned_creator_ids : null;
      const ownershipRef = "ownership_ref" in row ? row.ownership_ref : null;
      if (
        ownership !== null &&
        prior?.owned_creator_ids !== null &&
        prior?.owned_creator_ids !== undefined &&
        (JSON.stringify(
          [...new Set(prior.owned_creator_ids as string[])].sort(),
        ) !== JSON.stringify([...new Set(ownership)].sort()) ||
          prior.ownership_ref !== ownershipRef)
      )
        throw new Error("Restored ownership proof conflicts with the journal.");
      const priorTombstone = (
        await client.query(
          "SELECT id,job_id,account_id,scope,creator_id,thread_id FROM creator_trust.tombstone WHERE id=$1 OR job_id=$2 FOR UPDATE",
          [row.id, row.job_id],
        )
      ).rows;
      if (
        priorTombstone.some(
          (t) =>
            t.id !== row.id ||
            t.job_id !== row.job_id ||
            t.account_id !== row.account_id ||
            t.scope !== row.scope ||
            t.creator_id !== row.creator_id ||
            t.thread_id !== row.thread_id,
        )
      )
        throw new Error("Restored tombstone conflicts with the journal.");
      await client.query(
        "INSERT INTO creator_trust.privacy_job(id,account_id,kind,scope,creator_id,thread_id,state,verified_at,verification_ref,created_at,owned_creator_ids,ownership_ref) VALUES($1,$2,'delete',$3,$4,$5,'queued',$6,'restoration_journal',$6,$7,$8) ON CONFLICT(id) DO UPDATE SET state='queued',completed_at=NULL,updated_at=now(),owned_creator_ids=coalesce(creator_trust.privacy_job.owned_creator_ids,excluded.owned_creator_ids),ownership_ref=coalesce(creator_trust.privacy_job.ownership_ref,excluded.ownership_ref)",
        [
          row.job_id,
          row.account_id,
          row.scope,
          row.creator_id,
          row.thread_id,
          row.created_at,
          ownership,
          ownershipRef,
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
