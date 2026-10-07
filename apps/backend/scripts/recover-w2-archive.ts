import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import profile from "../../../infra/migrations/recoveries/w2-20261001.json" with { type: "json" };
import {
  canonical,
  matchesLedger,
  readLedger,
  repositoryRoot,
  schemaCustody,
  sha256,
  transactionBody,
} from "./migration-custody.js";
import {
  waveDataDigest,
  waveDataTables,
  waveRoleCustody,
  waveSecurityCustody,
  waveSequenceCustody,
} from "./migration-wave-custody.js";

class Preflight extends Error {}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Preflight(message);
}
type Source = { version: string; path: string; checksum: string };
type Digests = {
  ledgerSha256: string;
  schemaSha256: string;
  rolesSha256: string;
  securitySha256: string;
  sequenceSha256: string;
  dataSha256: string;
};

async function snapshot(client: pg.PoolClient) {
  const tables = await waveDataTables(client);
  const ledger = await readLedger(client);
  const schema = await schemaCustody(client);
  const roles = await waveRoleCustody(client);
  const security = await waveSecurityCustody(client);
  const sequences = await waveSequenceCustody(client);
  const data = await waveDataDigest(client, tables);
  const digests: Digests = {
    ledgerSha256: sha256(canonical(ledger)),
    schemaSha256: sha256(canonical(schema)),
    rolesSha256: sha256(canonical(roles)),
    securitySha256: security.sha256,
    sequenceSha256: sequences.sha256,
    dataSha256: data.sha256,
  };
  return { tables, ledger, schema, roles, sequences, data, digests };
}

/** Open an exact private regular file outside the checkout, without following
 * a substituted leaf or parent. Contents and credentials never reach stdout. */
async function privateFile(path: string) {
  check(isAbsolute(path), "Use absolute private paths outside Git.");
  const target = resolve(path);
  const parent = dirname(target);
  const repo = await realpath(fileURLToPath(repositoryRoot));
  check(
    (await realpath(parent)) === parent &&
      parent !== repo &&
      !parent.startsWith(repo + sep),
    "Private paths must use a real directory outside Git.",
  );
  const directory = await lstat(parent);
  check(
    directory.isDirectory() && (directory.mode & 0o077) === 0,
    "Private input and receipt directories must not be shared.",
  );
  return target;
}

async function readPrivate(path: string) {
  const target = await privateFile(path);
  const before = await lstat(target);
  check(
    before.isFile() &&
      (before.mode & 0o777) === 0o600 &&
      before.size > 0 &&
      before.size <= 256 * 1024 * 1024,
    "Use a bounded private 0600 regular input file.",
  );
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat();
    check(
      opened.isFile() &&
        (opened.mode & 0o777) === 0o600 &&
        opened.ino === before.ino &&
        opened.dev === before.dev &&
        opened.size === before.size &&
        opened.mtimeMs === before.mtimeMs,
      "The private input changed while opening it.",
    );
    const value = await file.readFile();
    const after = await file.stat();
    check(
      (after.mode & 0o777) === 0o600 &&
        after.size === opened.size &&
        after.mtimeMs === opened.mtimeMs,
      "The private input changed while reading it.",
    );
    return value;
  } finally {
    await file.close();
  }
}

async function recover() {
  const options = new Map<string, string>();
  for (const argument of process.argv.slice(2)) {
    const match = /^--(apply|archive|backup|manifest|receipt)=(.+)$/u.exec(
      argument,
    );
    check(
      match && !options.has(match[1]!),
      "Invalid or duplicate recovery option.",
    );
    options.set(match[1]!, match[2]!);
  }
  const apply = options.get("apply");
  check(
    options.size === 0 ||
      (options.size === 5 && apply && /^[a-f0-9]{64}$/u.test(apply)),
    "Default is a read-only plan; apply needs its digest, archive, backup, manifest and new receipt.",
  );
  const connection = process.env.DATABASE_MIGRATION_URL;
  check(
    connection &&
      process.env.RESTORED_DATABASE_NAME &&
      process.env.RESTORED_TRAFFIC_DISABLED === "true",
    "Provide the separate migration credential and explicitly named closed recovery database.",
  );
  check(
    profile.schemaVersion === 1 &&
      profile.id === "w2-20261001" &&
      profile.postgresMajor === 17 &&
      profile.originalSources === 28 &&
      profile.canonicalSources === 40,
    "The exact reviewed W2 recovery profile is required.",
  );
  const packetBytes = await readFile(
    new URL(profile.sourcePacket, repositoryRoot),
  );
  const grantBytes = await readFile(
    new URL(profile.grantsPath, repositoryRoot),
  );
  check(
    sha256(packetBytes) === profile.sourcePacketSha256 &&
      sha256(grantBytes) === profile.grantsSha256,
    "Reviewed source packet or original canonical grants changed.",
  );
  const sources = (JSON.parse(packetBytes.toString()) as { baseline: Source[] })
    .baseline;
  check(
    sources.length === 40 &&
      new Set(sources.map((s) => s.version.slice(0, 4))).size === 40,
    "The complete original canonical 40-source packet is required.",
  );
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", repositoryRoot), "utf8"),
  ) as {
    migrations: { version: string; path: string; producerVersion?: string }[];
  };
  const bodies = new Map<string, string>();
  for (const source of sources) {
    check(
      /^\d{4}_[a-z0-9_]+$/u.test(source.version) &&
        /^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/u.test(
          source.path,
        ) &&
        !source.path.includes("..") &&
        registry.migrations.some(
          (entry) =>
            entry.version === source.version && entry.path === source.path,
        ),
      "An original canonical source is absent from executable registration.",
    );
    const sql = await readFile(new URL(source.path, repositoryRoot), "utf8");
    check(
      sha256(sql) === source.checksum,
      "An immutable original source changed.",
    );
    const body = transactionBody(sql);
    check(
      !/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/imu.test(body),
      "A source contains an internal transaction boundary.",
    );
    bodies.set(source.version, body);
  }
  const pool = new pg.Pool({
    connectionString: connection,
    max: 1,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect().catch(async (error: unknown) => {
    await pool.end();
    throw error;
  });
  let receipt: Awaited<ReturnType<typeof open>> | undefined;
  let phase: "preflight" | "applying" | "committing" | "committed" =
    "preflight";
  const writeReceipt = async (value: object) => {
    await receipt!.writeFile(JSON.stringify(value) + "\n");
    await receipt!.sync();
  };
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
      await client.query(`SELECT d.datname AS name,d.oid,
      (SELECT system_identifier::text FROM pg_control_system()) AS system,
      current_setting('server_version_num')::integer/10000 AS major,
      d.datconnlimit AS connections,shobj_description(d.oid,'pg_database') AS marker,
      r.rolsuper AND session_user=current_user AS administrator
      FROM pg_database d JOIN pg_roles r ON r.rolname=current_user WHERE d.datname=current_database()`)
    ).rows[0];
    const closed = async () => {
      const row = (
        await client.query(`SELECT datconnlimit=0 AND shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed' AS closed,
        NOT EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend') AS alone
        FROM pg_database WHERE datname=current_database()`)
      ).rows[0];
      check(
        row?.closed && row.alone,
        "Owner-close the target and stop all other clients before recovery.",
      );
    };
    check(
      database?.administrator &&
        database.major === 17 &&
        database.name === process.env.RESTORED_DATABASE_NAME,
      "Use the named PostgreSQL 17 migration-administrator recovery target.",
    );
    await closed();
    if (apply)
      await client.query(
        "LOCK TABLE creator.schema_migration IN SHARE ROW EXCLUSIVE MODE",
      );
    const before = await snapshot(client);
    const complete = matchesLedger(before.ledger, sources);
    check(
      complete || matchesLedger(before.ledger, sources.slice(0, 28)),
      "Only the exact original 28-source cohort or complete canonical 40-source cohort can be inspected.",
    );
    check(
      before.schema.sha256 ===
        (complete ? profile.afterSchemaSha256 : profile.beforeSchemaSha256) &&
        before.digests.rolesSha256 === profile.rolesSha256 &&
        before.digests.securitySha256 ===
          (complete
            ? profile.afterSecuritySha256
            : profile.beforeSecuritySha256),
      "Actual schema, roles or effective security differ from the independent source review.",
    );
    if (!complete)
      check(
        before.digests.ledgerSha256 === profile.originalLedgerSha256 &&
          before.data.sha256 === profile.originalDataSha256 &&
          before.data.rows === profile.originalBusinessRows &&
          before.tables.length === profile.originalBusinessTables,
        "This is not the exact retained original W2 archive; no history or row repair is permitted.",
      );
    const plan = {
      profile: profile.id,
      profileSha256: sha256(canonical(profile)),
      database,
      state: complete ? "canonical40" : "original28_missing_archive_acls",
      before: before.digests,
      restoreGrants: !complete,
      applySources: complete ? [] : sources.slice(28),
      trafficReady: false,
    };
    const planSha256 = sha256(canonical(plan));
    if (!apply) {
      await client.query("ROLLBACK");
      process.stdout.write(
        JSON.stringify({ ...plan, planSha256 }, null, 2) + "\n",
      );
      return;
    }
    check(
      !complete,
      "The canonical 40-source cohort is already installed; there is no recovery SQL to replay.",
    );
    check(
      apply === planSha256,
      "The database-bound plan changed; inspect the current target.",
    );
    const archive = await readPrivate(options.get("archive")!);
    check(
      archive.length === profile.archiveBytes &&
        sha256(archive) === profile.archiveSha256,
      "The original preserved archive bytes do not match.",
    );
    const backup = await readPrivate(options.get("backup")!);
    const manifest = JSON.parse(
      (await readPrivate(options.get("manifest")!)).toString(),
    ) as Digests & {
      schemaVersion: number;
      database: string;
      backupSha256: string;
      createdAt: string;
      restored: Digests & { database: string };
    };
    const age = Date.now() - Date.parse(manifest.createdAt);
    check(
      manifest.schemaVersion === 1 &&
        manifest.database === database.name &&
        manifest.restored?.database &&
        manifest.restored.database !== database.name &&
        Number.isFinite(age) &&
        age >= 0 &&
        age <= 3600000 &&
        backup.subarray(0, 5).toString() === "PGDMP" &&
        sha256(backup) === manifest.backupSha256,
      "A current custom-format backup and separately named restore are required.",
    );
    for (const key of Object.keys(before.digests) as (keyof Digests)[])
      check(
        manifest[key] === before.digests[key] &&
          manifest.restored[key] === before.digests[key],
        "Every live and independently restored custody digest must match the private backup.",
      );
    receipt = await open(
      await privateFile(options.get("receipt")!),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
    await writeReceipt({
      state: "started",
      plan,
      planSha256,
      backupSha256: manifest.backupSha256,
      startedAt: new Date().toISOString(),
    });
    phase = "applying";
    await client.query(grantBytes.toString());
    check(
      (await schemaCustody(client)).sha256 === profile.afterGrantsSchemaSha256,
      "Restored grants do not match the independent canonical 28-source reference.",
    );
    for (const source of sources.slice(28)) {
      await client.query(bodies.get(source.version)!);
      await client.query("RESET ROLE");
      const producer = registry.migrations.find(
        (entry) => entry.version === source.version,
      )!.producerVersion;
      if (producer && producer !== source.version) {
        check(
          !before.ledger.some((row) => row.version === producer),
          "A producer alias conflicts with original retained history.",
        );
        await client.query(
          "DELETE FROM creator.schema_migration WHERE version=$1",
          [producer],
        );
      }
      // Only new actually executed sources receive canonical ledger entries.
      await client.query(
        "INSERT INTO creator.schema_migration(version,checksum) VALUES($1,$2) ON CONFLICT(version) DO UPDATE SET checksum=excluded.checksum",
        [source.version, source.checksum],
      );
    }
    const after = await snapshot(client);
    check(
      matchesLedger(after.ledger, sources) &&
        before.ledger.every((row) =>
          after.ledger.some((next) => canonical(next) === canonical(row)),
        ),
      "Original migration history changed or the canonical 40-source cohort is incomplete.",
    );
    check(
      after.schema.sha256 === profile.afterSchemaSha256 &&
        after.digests.securitySha256 === profile.afterSecuritySha256,
      "Recovered schema or effective permissions differ from the independent canonical 40-source reference.",
    );
    check(
      after.digests.rolesSha256 === before.digests.rolesSha256 &&
        after.digests.sequenceSha256 === before.digests.sequenceSha256 &&
        canonical(await waveDataDigest(client, before.tables)) ===
          canonical(before.data),
      "Original roles, sequences or retained business rows changed.",
    );
    await closed();
    await writeReceipt({
      state: "committing",
      after: after.digests,
      originalLedgerRows: 28,
      originalBusinessRows: before.data.rows,
    });
    phase = "committing";
    await client.query("COMMIT");
    phase = "committed";
    await writeReceipt({
      state: "committed",
      completedAt: new Date().toISOString(),
      trafficReady: false,
    });
    process.stdout.write(
      JSON.stringify({
        state: "committed",
        originalLedgerRows: 28,
        appliedSources: 12,
        originalBusinessRows: before.data.rows,
        trafficReady: false,
      }) + "\n",
    );
  } catch (error) {
    if (phase !== "committed")
      await client.query("ROLLBACK").catch(() => undefined);
    if (receipt)
      await writeReceipt({
        state:
          phase === "committing"
            ? "commit_uncertain"
            : phase === "committed"
              ? "committed_receipt_error"
              : "rolled_back",
        code: (error as { code?: string }).code ?? "recovery_refused",
      }).catch(() => undefined);
    if (error instanceof Preflight) throw error;
    throw new Preflight(
      phase === "committing" || phase === "committed"
        ? "Inspect the retained target and private commit receipt before any retry; commit outcome may require reconciliation."
        : "Recovery failed and uncommitted changes were rolled back; inspect the private operation evidence.",
    );
  } finally {
    await receipt?.close();
    client.release();
    await pool.end();
  }
}

await recover().catch((error: unknown) => {
  process.stderr.write(
    error instanceof Preflight
      ? `${error.message}\n`
      : "Recovery preflight failed; no application traffic was authorized.\n",
  );
  process.exitCode = 1;
});
