import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import pg from "pg";
import {
  adoptedLedger,
  canonical,
  loadAdoptionProfile,
  matchesLedger,
  readLedger,
  schemaCustody,
  sha256,
  transactionBody,
} from "./migration-custody.js";

// Operator-only. With no arguments this prints a read-only, database-bound plan.
// Applying requires that exact digest, a private preserved backup, a new receipt
// and a traffic-closed database. No runtime credential or normal startup calls it.
const options = new Map<string, string>();
for (const argument of process.argv.slice(2)) {
  const match = /^--(apply|backup|receipt)=(.+)$/u.exec(argument);
  if (!match || options.has(match[1]!))
    throw new Error("Invalid adoption option.");
  options.set(match[1]!, match[2]!);
}
const apply = options.get("apply");
if (
  (apply && !/^[a-f0-9]{64}$/u.test(apply)) ||
  (!apply && options.size > 0) ||
  (apply && options.size !== 3)
)
  throw new Error(
    "Apply requires the exact plan digest, backup and receipt paths.",
  );
if (!process.env.DATABASE_MIGRATION_URL)
  throw new Error(
    "DATABASE_MIGRATION_URL is required; never use a runtime credential.",
  );
const { profile, sql } = await loadAdoptionProfile();
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_MIGRATION_URL,
  max: 1,
});
const client = await pool.connect();
let receipt: Awaited<ReturnType<typeof open>> | undefined;
let outcome: Record<string, unknown> | undefined;
let committed = false;
try {
  await client.query(
    apply
      ? "BEGIN ISOLATION LEVEL SERIALIZABLE"
      : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  await client.query(
    "SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'",
  );
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtextextended('creator-migrations',0))",
  );
  const database = (
    await client.query<{
      name: string;
      oid: number;
      systemIdentifier: string;
      postgresMajor: number;
      connectionLimit: number;
      administrator: boolean;
      otherClients: number;
    }>(
      `SELECT d.datname AS name,d.oid,
       (SELECT system_identifier::text FROM pg_control_system()) AS "systemIdentifier",
       (current_setting('server_version_num')::integer/10000) AS "postgresMajor",
       d.datconnlimit AS "connectionLimit",r.rolsuper AS administrator,
       (SELECT count(*)::integer FROM pg_stat_activity WHERE datid=d.oid
         AND pid<>pg_backend_pid() AND backend_type='client backend') AS "otherClients"
       FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`,
    )
  ).rows[0]!;
  if (
    !database.administrator ||
    database.postgresMajor !== profile.postgresMajor
  )
    throw new Error(
      "This reviewed profile requires a PostgreSQL17 migration administrator.",
    );
  if (apply && (database.connectionLimit !== 0 || database.otherClients !== 0))
    throw new Error(
      "Apply requires a traffic-closed database with connection limit0 and no other clients.",
    );
  if (apply)
    await client.query(
      "LOCK TABLE creator.schema_migration IN SHARE ROW EXCLUSIVE MODE",
    );
  const before = await readLedger(client);
  const schema = await schemaCustody(client);
  const complete = matchesLedger(before, adoptedLedger(profile));
  if (!complete && !matchesLedger(before, profile.original))
    throw new Error(
      "The full ledger is neither the exact35-row preserved W5 cohort nor its complete48-row adoption.",
    );
  const expectedSchema = complete
    ? profile.afterSchemaSha256
    : profile.beforeSchemaSha256;
  if (
    !/^[a-f0-9]{64}$/u.test(expectedSchema) ||
    schema.sha256 !== expectedSchema
  )
    throw new Error(
      "Actual constraints, policies, grants, columns, functions or roles differ from the reviewed schema; no adoption is allowed.",
    );
  const plan = {
    profile: profile.id,
    profileSha256: sha256(canonical(profile)),
    database,
    state: complete ? "already_adopted" : "preserved_legacy",
    ledgerSha256: sha256(canonical(before)),
    schemaSha256: schema.sha256,
    originalRows: before.length,
    preservedAliases: profile.original.filter(
      (source) => source.version !== source.canonicalVersion,
    ),
    applyOnly: complete ? [] : profile.missing,
    reservedActivation: false,
  };
  const digest = sha256(canonical(plan));
  if (!apply) {
    await client.query("ROLLBACK");
    process.stdout.write(
      `${JSON.stringify({ ...plan, planSha256: digest }, null, 2)}\n`,
    );
  } else {
    if (complete)
      throw new Error(
        "This cohort is already adopted; there is no SQL to replay.",
      );
    if (digest !== apply)
      throw new Error(
        "The database-bound plan changed; inspect a fresh plan before applying.",
      );
    const backupPath = options.get("backup")!;
    const receiptPath = options.get("receipt")!;
    if (!isAbsolute(backupPath) || !isAbsolute(receiptPath))
      throw new Error(
        "Backup and new receipt paths must be absolute private paths.",
      );
    const backupStat = await lstat(backupPath);
    if (
      !backupStat.isFile() ||
      (backupStat.mode & 0o077) !== 0 ||
      backupStat.size < 5
    )
      throw new Error(
        "A preserved nonempty private regular backup file is required.",
      );
    const backupHash = createHash("sha256");
    const backup = await open(
      backupPath,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      const openedStat = await backup.stat();
      if (
        openedStat.ino !== backupStat.ino ||
        openedStat.dev !== backupStat.dev ||
        openedStat.size !== backupStat.size
      )
        throw new Error("The preserved backup changed while opening it.");
      const header = Buffer.alloc(5);
      await backup.read(header, 0, 5, 0);
      if (header.toString() !== "PGDMP")
        throw new Error("A PostgreSQL custom-format backup is required.");
      for await (const chunk of backup.createReadStream({
        start: 0,
        autoClose: false,
      }))
        backupHash.update(chunk);
    } finally {
      await backup.close();
    }
    receipt = await open(receiptPath, "wx", 0o600);
    outcome = {
      plan,
      planSha256: digest,
      startedAt: new Date().toISOString(),
      state: "started",
      backupSha256: backupHash.digest("hex"),
      backupBytes: backupStat.size,
      before,
      limitation:
        "Backup hash is recorded. The operator must separately retain its successful closed-restore evidence; this command does not infer restored data from a file header.",
    };
    await receipt.writeFile(`${JSON.stringify(outcome)}\n`);
    await receipt.sync();
    // Copy the canonical identity of already-applied SQL only. Every original
    // alias row, checksum and timestamp survives; no aliased DDL runs here.
    for (const source of profile.original) {
      if (source.version === source.canonicalVersion) continue;
      await client.query(
        `INSERT INTO creator.schema_migration(version,checksum,applied_at)
         SELECT $2,checksum,applied_at FROM creator.schema_migration WHERE version=$1 AND checksum=$3`,
        [source.version, source.canonicalVersion, source.checksum],
      );
    }
    for (const source of profile.missing) {
      await client.query(transactionBody(sql.get(source.version)!));
      await client.query("RESET ROLE");
      await client.query(
        "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2)",
        [source.version, source.checksum],
      );
    }
    const after = await readLedger(client);
    if (!matchesLedger(after, adoptedLedger(profile)))
      throw new Error("Post-adoption ledger is incomplete.");
    if (
      !before.every((row) =>
        after.some((current) => canonical(current) === canonical(row)),
      )
    )
      throw new Error(
        "Original ledger provenance changed; the transaction will roll back.",
      );
    const finalSchema = await schemaCustody(client);
    if (finalSchema.sha256 !== profile.afterSchemaSha256)
      throw new Error(
        "Post-adoption schema differs from the independently prepared canonical reference.",
      );
    await client.query("COMMIT");
    committed = true;
    outcome = {
      ...outcome,
      state: "committed",
      completedAt: new Date().toISOString(),
      after,
      afterSchemaSha256: finalSchema.sha256,
      originalRowsUnchanged: true,
      aliasedSqlReplayed: false,
      trafficReopened: false,
    };
  }
} catch (error) {
  if (!committed) await client.query("ROLLBACK").catch(() => undefined);
  if (outcome)
    outcome = {
      ...outcome,
      state: committed ? "committed_receipt_pending" : "rolled_back",
      failedAt: new Date().toISOString(),
    };
  if (error && typeof error === "object" && "code" in error)
    throw new Error(
      `Migration adoption failed (${String(error.code)}); ${committed ? "the commit completed; inspect the private receipt" : "uncommitted changes were rolled back"}.`,
    );
  throw error;
} finally {
  try {
    if (receipt) {
      try {
        // Append the terminal observation; never replace the original plan,
        // backup fingerprint or started record, including on rollback.
        await receipt.writeFile(`${JSON.stringify(outcome)}\n`);
        await receipt.sync();
      } finally {
        await receipt.close();
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}
if (committed)
  process.stdout.write(
    `${JSON.stringify({ state: "committed", profile: profile.id, originalRowsPreserved: 35, totalRows: 48, aliasedSqlReplayed: false, trafficReopened: false })}\n`,
  );
