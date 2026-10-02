import { readFile } from "node:fs/promises";
import pg from "pg";
import { PrivacyDomains } from "../src/modules/trust/contracts.js";
import {
  canonical,
  readLedger,
  repositoryRoot,
  sha256,
} from "./migration-custody.js";
import {
  waveSecurityCustody,
  waveSequenceCustody,
} from "./migration-wave-custody.js";
import { assertWaveRoleSafety } from "./migration-wave-roles.js";
import { assertPrivacyWaveRoleSafety } from "./migration-privacy-roles.js";

/** Read-only recovery inventory. Counts/hashes are diagnostic evidence, never
 * provider receipts, policy approval, a completed purge or a reopening grant. */
async function audit() {
  const connection = process.env.DATABASE_RECOVERY_URL;
  if (!connection) throw new Error("Provide a separate DATABASE_RECOVERY_URL.");
  const target = new URL(connection).pathname.slice(1);
  if (
    process.env.RESTORED_DATABASE_NAME !== target ||
    process.env.RESTORED_TRAFFIC_DISABLED !== "true"
  )
    throw new Error("Name the exact closed target and keep traffic disabled.");
  const registry = JSON.parse(
    await readFile(new URL("infra/migrations.json", repositoryRoot), "utf8"),
  ) as { migrations: { version: string; path: string }[] };
  const sources = await Promise.all(
    registry.migrations.map(async ({ version, path }) => {
      if (
        !/^\d{4}_[a-z0-9_]+$/.test(version) ||
        !/^(apps\/backend|infra\/migrations\/history)\/[a-zA-Z0-9_./-]+\.sql$/.test(
          path,
        ) ||
        path.includes("..")
      )
        throw new Error("Invalid active migration source.");
      return {
        version,
        checksum: sha256(await readFile(new URL(path, repositoryRoot))),
      };
    }),
  );
  const pool = new pg.Pool({
    connectionString: connection,
    max: 1,
    connectionTimeoutMillis: 2000,
    statement_timeout: 30000,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const closure = (
      await client.query<{ closed: boolean }>(
        `SELECT datconnlimit=0 AND
         shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed' AS closed
         FROM pg_database WHERE datname=current_database()`,
      )
    ).rows[0];
    if (closure?.closed !== true)
      throw new Error(
        "The actual owner closure marker and limit0 are required.",
      );
    if (
      (
        await client.query(
          "SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' LIMIT 1",
        )
      ).rowCount
    )
      throw new Error("Stop other target clients before reconciliation.");
    const ledger = await readLedger(client);
    if (
      ledger.length !== sources.length ||
      !sources.every((source) =>
        ledger.some(
          (row) =>
            row.version === source.version && row.checksum === source.checksum,
        ),
      )
    )
      throw new Error("The closed target differs from the active registry.");
    const roles = await assertWaveRoleSafety(client, {
      trust: ledger.some(
        (row) => row.version === "0053_w8_runtime_denial_projection",
      ),
      media: ledger.some(
        (row) => row.version === "0062_w6_creator_media_worker",
      ),
      content: ledger.some(
        (row) => row.version === "0074_w8_content_runtime_denial",
      ),
      interactive: ledger.some(
        (row) => row.version === "0082_w8_interactive_denial_try_fence",
      ),
    });
    const privacyRoles = ledger.some(
      (row) => row.version === "0087_w8_privacy_task_commit_fence",
    )
      ? await assertPrivacyWaveRoleSafety(client, {
          privacy: true,
          domain: ledger.some(
            (row) => row.version === "0103_w8_domain_privacy_task_fence",
          ),
        })
      : undefined;
    const security = await waveSecurityCustody(client);
    const sequence = await waveSequenceCustody(client);
    const privacy = (
      await client.query<Record<string, string>>(
        `SELECT
         (SELECT count(*) FROM creator_trust.privacy_job) AS jobs,
         (SELECT count(*) FROM creator_trust.tombstone) AS tombstones,
         (SELECT count(*) FROM creator_trust.privacy_job WHERE verified_at IS NULL OR verification_ref='') AS unverified_jobs,
         (SELECT count(*) FROM creator_trust.privacy_job WHERE scope='account' AND
           (owned_creator_ids IS NULL OR ownership_ref IS NULL)) AS unknown_ownership,
         (SELECT count(*) FROM creator_trust.privacy_job j WHERE j.kind='delete' AND NOT EXISTS(
           SELECT 1 FROM creator_trust.tombstone t WHERE t.job_id=j.id AND t.account_id=j.account_id AND t.scope=j.scope
           AND t.creator_id IS NOT DISTINCT FROM j.creator_id AND t.thread_id IS NOT DISTINCT FROM j.thread_id)) AS deletion_jobs_without_tombstones,
         (SELECT count(*) FROM creator_trust.tombstone t WHERE NOT EXISTS(
           SELECT 1 FROM creator_trust.privacy_job j WHERE j.id=t.job_id AND j.kind='delete' AND j.account_id=t.account_id
           AND j.scope=t.scope AND j.creator_id IS NOT DISTINCT FROM t.creator_id AND j.thread_id IS NOT DISTINCT FROM t.thread_id)) AS mismatched_tombstones,
         (SELECT count(*) FROM creator_trust.privacy_job j WHERE EXISTS(
           SELECT 1 FROM unnest($1::text[]) AS d(domain) WHERE NOT EXISTS(
             SELECT 1 FROM creator_trust.privacy_task t WHERE t.job_id=j.id AND t.domain=d.domain))) AS jobs_missing_domains,
         (SELECT count(*) FROM creator_trust.privacy_task WHERE NOT(domain=ANY($1::text[]))) AS unexpected_domains,
         (SELECT count(*) FROM creator_trust.privacy_task WHERE state='running' AND
           (lease_token IS NULL OR lease_until IS NULL OR lease_until<=clock_timestamp())) AS expired_running_tasks,
         (SELECT count(*) FROM creator_trust.privacy_job j WHERE j.state='complete' AND
           (j.completed_at IS NULL OR (SELECT count(*) FROM creator_trust.privacy_task t WHERE t.job_id=j.id)<>8
           OR EXISTS(SELECT 1 FROM creator_trust.privacy_task t WHERE t.job_id=j.id AND
             (t.state<>'complete' OR t.completed_at IS NULL OR t.receipt IS NULL)))) AS inconsistent_complete_jobs,
         (SELECT count(*) FROM creator_trust.privacy_task WHERE state='complete' AND
           (receipt IS NULL OR jsonb_typeof(receipt)<>'object' OR receipt='{}'::jsonb
             OR receipt->'complete'='false'::jsonb OR receipt->'done'='false'::jsonb
             OR octet_length(receipt::text)>65536 OR completed_at IS NULL)) AS invalid_complete_receipts,
         (SELECT count(*) FROM creator_trust.retained_record WHERE until_at IS NULL) AS indefinite_retention_records,
         (SELECT count(*) FROM creator_trust.retained_record WHERE until_at<=clock_timestamp()) AS expired_retention_records`,
        [PrivacyDomains],
      )
    ).rows[0];
    const domains = (
      await client.query<{ domain: string; state: string; count: string }>(
        "SELECT domain,state,count(*) FROM creator_trust.privacy_task GROUP BY domain,state ORDER BY domain,state",
      )
    ).rows;
    const effects = (
      await client.query<{ state: string; count: string }>(
        "SELECT state,count(*) FROM creator_trust.effect GROUP BY state ORDER BY state",
      )
    ).rows;
    // Relation names are fixed operator inputs; no row bodies/identifiers leave
    // PostgreSQL. Presence/zero counts cannot prove domain or provider recovery.
    const relations: Record<string, number | null> = {};
    for (const relation of [
      "creator.generation",
      "creator.commerce_packet",
      "creator.commerce_ledger",
      "creator.commerce_effect",
      "creator_trust.privacy_commit_scope",
      "creator_trust.domain_privacy_commit_scope",
      "creator.generation_worker_scope",
    ]) {
      const present = (
        await client.query<{ present: boolean }>(
          "SELECT to_regclass($1) IS NOT NULL AS present",
          [relation],
        )
      ).rows[0]?.present;
      relations[relation] = present
        ? Number(
            (
              await client.query<{ count: string }>(
                `SELECT count(*) FROM ${relation}`,
              )
            ).rows[0]?.count,
          )
        : null;
    }
    await client.query("COMMIT");
    return {
      schemaVersion: 1,
      observedAt: new Date().toISOString(),
      kind: "read-only-closed-target-inventory",
      trafficReady: false,
      closureVerified: true,
      ledger: { rows: ledger.length, sha256: sha256(canonical(ledger)) },
      roles,
      ...(privacyRoles ? { privacyRoles } : {}),
      security,
      sequence: { sequences: sequence.sequences, sha256: sequence.sha256 },
      privacy: Object.fromEntries(
        Object.entries(privacy ?? {}).map(([key, value]) => [
          key,
          Number(value),
        ]),
      ),
      domains: domains.map((row) => ({ ...row, count: Number(row.count) })),
      effects: effects.map((row) => ({ ...row, count: Number(row.count) })),
      relations,
      unverifiedGates: [
        "independently trusted journal provenance and replay",
        "actual owner purge/export receipts and stored artifact verification",
        "approved purpose-specific retention and expiry",
        "original financial/provider reconciliation and capability readiness",
        "current genuine family/acceptance/denial authority",
        "launched web, Android and iOS acceptance at the candidate revision",
      ],
    };
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
}

try {
  process.stdout.write(JSON.stringify(await audit()) + "\n");
} catch {
  // Recovery connection errors can contain private identifiers or credentials.
  process.stderr.write(
    "Closed reconciliation audit refused; keep traffic closed and inspect the private operator inputs.\n",
  );
  process.exitCode = 1;
}
