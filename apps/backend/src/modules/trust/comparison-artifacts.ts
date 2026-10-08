import type { Pool, PoolClient, QueryConfig } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import { agentPrivacyQueryTimeout } from "../agent/privacy-transaction.js";
import { requestAuthority } from "../identity/request-authority.js";
import { comparisonPrivacyCatalogue } from "../conversation/comparison-privacy.js";
import {
  PrivacyArtifact,
  PrivacyArtifactAttempt,
  type ArtifactBinding,
  type ExportJob,
  type PrivacyArtifactStore,
} from "./privacy-export.js";
import { trustTransaction } from "./transaction.js";
import comparisonReview from "../../../../../infra/migrations/reviews/20261008-comparison.json" with { type: "json" };

export const comparisonArtifactSource = Object.freeze({
  owner: "W8",
  name: "comparison_export_artifacts",
  path: "apps/backend/src/modules/trust/0241_comparison_export_artifacts.sql",
  checksum: "63559d896eb5e5821dc15096e8f72d3b75faebcd5f23294f62ae5f8b0e63e415",
});
export const comparisonAttemptSource = Object.freeze({
  owner: "W8",
  name: "comparison_export_attempts",
  path: "apps/backend/src/modules/trust/0242_comparison_export_attempts.sql",
  checksum: "6333db3d2263ea59b48af4b6329a6fb853951ac22e3071f925f776010f819b5f",
});
export const comparisonArtifactPrivacySource = Object.freeze({
  owner: "W8",
  name: "comparison_export_privacy",
  path: "apps/backend/src/modules/trust/0243_comparison_export_privacy.sql",
  checksum: "b9974d48123516ebcdd318b3149107e10fe2795551c10ec2f1079270f1dd0a7b",
});
// Independently operated numbered graph and complete restore. This is metadata
// only; exact executable registration and original host composition are required.
export const comparisonArtifactPrivacyCatalogueChecksum =
  comparisonReview.comparison.artifactsCatalogueChecksum;
const Owner = "creator_comparison_artifact";
const Snapshot = z.string().min(8).max(200);
const Domain = z.enum(["agent", "conversation"]);
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
type Role =
  | "creator_runtime"
  | "creator_trust_runtime"
  | "creator_trust_worker";

async function query(
  client: PoolClient,
  text: string,
  values: unknown[],
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const config: QueryConfig & { query_timeout: number } = {
    text,
    values,
    query_timeout: agentPrivacyQueryTimeout(client, 5000),
  };
  const result = await client.query(config);
  signal?.throwIfAborted();
  return result;
}

/** Operator metadata only. This is not registry approval, fan consent or source
 * authority. Review the complete graph, including both original export owners,
 * before allocating this still-pending migration. */
export async function comparisonArtifactCatalogue(
  client: PoolClient,
  signal?: AbortSignal,
) {
  // PostgreSQL's displayed type/function names depend on search_path. Keep the
  // review stable without changing the original source transaction's settings.
  // A failed query is left to that original owner's uncertain-query cleanup.
  await query(client, "SAVEPOINT comparison_artifact_catalogue", [], signal);
  await query(client, "SET LOCAL search_path=pg_catalog", [], signal);
  const catalogue = await readComparisonArtifactCatalogue(client, signal);
  await query(
    client,
    "ROLLBACK TO SAVEPOINT comparison_artifact_catalogue",
    [],
    signal,
  );
  await query(
    client,
    "RELEASE SAVEPOINT comparison_artifact_catalogue",
    [],
    signal,
  );
  return catalogue;
}

async function readComparisonArtifactCatalogue(
  client: PoolClient,
  signal?: AbortSignal,
) {
  const visibility = await generationConsumerCatalogue(client, Owner, {
    queryTimeout: agentPrivacyQueryTimeout(client, 5000),
    ...(signal ? { signal } : {}),
  });
  const functions = (
    await query(
      client,
      `SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition,
       pg_get_userbyid(p.proowner) AS owner,
       ARRAY(SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END
        ||':'||a.privilege_type||':'||a.is_grantable::text
        FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a ORDER BY 1) AS acl
       FROM pg_proc p WHERE p.proowner=to_regrole($1) ORDER BY p.oid::regprocedure::text COLLATE "C"`,
      [Owner],
      signal,
    )
  ).rows;
  const storage = (
    await query(
      client,
      `SELECT c.oid::regclass::text AS relation,c.relkind,c.relispartition,c.relpersistence,
       (SELECT jsonb_agg(jsonb_build_object('position',a.attnum,'name',a.attname,
        'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'dropped',a.attisdropped,
        'identity',a.attidentity,'generated',a.attgenerated,'local',a.attislocal,'inherited',a.attinhcount,
        'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0) AS columns,
       (SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
        'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname)
        FROM pg_constraint k WHERE k.conrelid=c.oid) AS constraints,
       (SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),
        'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive) ORDER BY pg_get_indexdef(i.indexrelid))
        FROM pg_index i WHERE i.indrelid=c.oid) AS indexes
       FROM pg_class c WHERE c.oid=to_regclass('creator_trust.comparison_export_artifact')`,
      [],
      signal,
    )
  ).rows;
  const triggers = (
    await query(
      client,
      `SELECT t.tgrelid::regclass::text AS relation,t.tgname,t.tgenabled,
       pg_get_triggerdef(t.oid,false) AS definition FROM pg_trigger t
       JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE NOT t.tgisinternal AND (n.nspname,c.relname) IN (
        ('creator_trust','privacy_task'),('creator','conversation_comparison_consent'),
        ('creator','conversation_comparison_sample'),
        ('creator_trust','comparison_export_artifact'),
        ('creator_trust','domain_privacy_commit_scope'))
       ORDER BY t.tgrelid::regclass::text COLLATE "C",t.tgname COLLATE "C"`,
      [],
      signal,
    )
  ).rows;
  const dependencies = (
    await query(
      client,
      `SELECT d.deptype,a.type,a.object_names,a.object_args FROM pg_shdepend d
       CROSS JOIN LATERAL pg_identify_object_as_address(d.classid,d.objid,d.objsubid) a
       WHERE d.refclassid='pg_authid'::regclass AND d.refobjid=to_regrole($1)
        AND d.dbid IN(0,(SELECT oid FROM pg_database WHERE datname=current_database()))
       ORDER BY d.deptype,a.type,a.object_names,a.object_args`,
      [Owner],
      signal,
    )
  ).rows;
  return { visibility, functions, storage, triggers, dependencies };
}

/** Saved-artifact lifecycle only. Original source EOF/COMMIT, task authority,
 * fresh account verification and current privacy denial remain mandatory.
 * This class is deliberately not composed while the source is unregistered;
 * unfinished attempts/orphan custody and the full restore graph need review. */
export class PreparedComparisonArtifacts {
  private constructor(
    private readonly workerPool: Pool,
    private readonly artifacts: PrivacyArtifactStore,
    private readonly catalogueChecksum: string,
    private readonly assertRestoredInTransaction: (
      client: PoolClient,
    ) => Promise<void>,
  ) {}

  assertComposition(workerPool: Pool, artifacts: PrivacyArtifactStore) {
    invariant(
      workerPool === this.workerPool && artifacts === this.artifacts,
      "comparison_artifact_composition_changed",
      "Use the original comparison worker and protected artifact store.",
    );
  }

  static async prepare(input: {
    workerPool: Pool;
    artifacts: PrivacyArtifactStore;
    catalogueChecksum: string;
    assertRestoredInTransaction: (client: PoolClient) => Promise<void>;
    signal: AbortSignal;
  }) {
    invariant(
      typeof input.artifacts.remove === "function" &&
        typeof input.artifacts.attempts === "function" &&
        typeof input.artifacts.removeAttempt === "function" &&
        typeof input.artifacts.scanAttempts === "function" &&
        typeof input.artifacts.forgetAttempt === "function",
      "comparison_artifact_removal_unavailable",
      "The original protected store must support physical artifact removal.",
    );
    const owner = new PreparedComparisonArtifacts(
      input.workerPool,
      input.artifacts,
      Hash.parse(input.catalogueChecksum),
      input.assertRestoredInTransaction,
    );
    await trustTransaction(
      input.workerPool,
      (client) =>
        owner.assertClient(client, "creator_trust_worker", input.signal),
      { signal: input.signal },
    );
    return owner;
  }

  async assertClient(client: PoolClient, role: Role, signal: AbortSignal) {
    signal.throwIfAborted();
    await this.assertRestoredInTransaction(client);
    for (const source of comparisonReview.sources)
      await assertRegisteredMigration(client, source, signal);
    const row = (
      await query(
        client,
        `SELECT current_user=session_user AND session_user=$1
         AND current_setting('transaction_isolation')='read committed'
         AND EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND NOT rolinherit AND NOT rolsuper
          AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
         AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=to_regrole($1) OR roleid=to_regrole($1))
         AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=to_regrole($1))
         AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$2 AND NOT r.rolcanlogin AND NOT r.rolinherit
          AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
          AND NOT r.rolreplication AND r.rolconfig IS NULL
          AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
          AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
          AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
          AND (SELECT count(*)=18 FROM pg_proc WHERE proowner=r.oid))
         AND NOT EXISTS(SELECT FROM pg_database WHERE datname=current_database()
          AND (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed')) AS ready`,
        [role, Owner],
        signal,
      )
    ).rows[0];
    invariant(
      row?.ready &&
        contentHash(await comparisonArtifactCatalogue(client, signal)) ===
          this.catalogueChecksum,
      "comparison_artifact_custody_changed",
      "Current comparison artifact custody must match independent review.",
    );
  }

  async capture(
    client: PoolClient,
    job: ExportJob,
    domain: "agent" | "conversation",
    snapshotRef: string,
  ): Promise<Date> {
    invariant(
      !requestAuthority.getStore() && job.kind === "export" && job.signal,
      "comparison_artifact_source_required",
      "Use the original held export source and task.",
    );
    z.uuid().parse(job.leaseToken);
    await this.assertClient(client, "creator_runtime", job.signal);
    const row = (
      await query(
        client,
        "SELECT creator_trust.capture_comparison_export($1,$2,$3,$4,$5) AS expiry",
        [
          Snapshot.parse(snapshotRef),
          job.jobId,
          job.accountId,
          Domain.parse(domain),
          job.leaseToken,
        ],
        job.signal,
      )
    ).rows[0];
    return z.date().parse(row?.expiry);
  }

  /** Persist the original sealed identity before ACK. False leaves durable
   * purge work after a withdrawal/expiry; it must never become a success ACK. */
  async retainSealed(job: ExportJob, value: PrivacyArtifact): Promise<boolean> {
    invariant(
      !requestAuthority.getStore() && job.kind === "export" && job.signal,
      "comparison_artifact_source_required",
      "Use the original background export task.",
    );
    const signal = job.signal;
    const artifact = PrivacyArtifact.parse(value);
    Domain.parse(artifact.domain);
    z.uuid().parse(job.leaseToken);
    invariant(
      artifact.jobId === job.jobId && artifact.accountId === job.accountId,
      "comparison_artifact_source_required",
      "The sealed artifact must belong to the original task.",
    );
    await this.artifacts.verify(artifact, artifact, signal);
    return trustTransaction(
      this.workerPool,
      async (client) => {
        await this.assertClient(client, "creator_trust_worker", signal);
        const result = await query(
          client,
          "SELECT creator_trust.seal_comparison_export($1,$2,$3) AS allowed",
          [artifact.snapshotRef, job.leaseToken, JSON.stringify(artifact)],
          signal,
        );
        return z.boolean().parse(result.rows[0]?.allowed);
      },
      { signal },
    );
  }

  /** Invoke on the original Trust actor transaction before manifest return,
   * and at every download chunk. This alone is not account verification. */
  async assertReadable(
    client: PoolClient,
    binding: ArtifactBinding,
    snapshotRef: string,
    signal: AbortSignal,
  ) {
    await this.assertClient(client, "creator_trust_runtime", signal);
    const row = (
      await query(
        client,
        "SELECT creator_trust.current_comparison_export($1,$2,$3,$4) AS allowed",
        [
          binding.jobId,
          binding.accountId,
          Domain.parse(binding.domain),
          Snapshot.parse(snapshotRef),
        ],
        signal,
      )
    ).rows[0];
    invariant(
      row?.allowed === true,
      "export_artifact_unavailable",
      "This export is no longer available. Request a new export.",
    );
  }

  async purge(signal: AbortSignal): Promise<number> {
    invariant(
      !requestAuthority.getStore(),
      "comparison_artifact_worker_required",
      "Use the original background artifact purge worker.",
    );
    const claims = await trustTransaction(
      this.workerPool,
      async (client) => {
        await this.assertClient(client, "creator_trust_worker", signal);
        const result = await query(
          client,
          "SELECT * FROM creator_trust.claim_comparison_export_purge(1)",
          [],
          signal,
        );
        return z
          .array(
            z.strictObject({
              snapshot_ref: Snapshot,
              token: z.uuid(),
              manifest: PrivacyArtifact,
            }),
          )
          .max(1)
          .parse(result.rows);
      },
      { signal },
    );
    let removed = 0;
    for (const claim of claims) {
      invariant(
        claim.snapshot_ref === claim.manifest.snapshotRef,
        "comparison_artifact_custody_changed",
        "The original purge claim must bind its exact sealed manifest.",
      );
      // A cancellation/error leaves the SQL claim for its genuine lease retry.
      // Never acknowledge before both physical files and directory sync settle.
      await this.artifacts.remove!(claim.manifest, claim.manifest, signal);
      const acknowledged = await trustTransaction(
        this.workerPool,
        async (client) => {
          await this.assertClient(client, "creator_trust_worker", signal);
          const result = await query(
            client,
            "SELECT creator_trust.finish_comparison_export_purge($1,$2,$3) AS removed",
            [claim.snapshot_ref, claim.token, JSON.stringify(claim.manifest)],
            signal,
          );
          return z.boolean().parse(result.rows[0]?.removed);
        },
        { signal },
      );
      if (acknowledged) removed++;
    }
    return removed;
  }

  /** The same original Trust worker owns wall-clock expiry. No caller supplies
   * a cutoff, edits historical clocks or treats denied reads as physical removal. */
  async expireSources(signal: AbortSignal) {
    invariant(
      !requestAuthority.getStore(),
      "comparison_artifact_worker_required",
      "Use the original background comparison expiry worker.",
    );
    return trustTransaction(
      this.workerPool,
      async (client) => {
        await this.assertClient(client, "creator_trust_worker", signal);
        invariant(
          contentHash(await comparisonPrivacyCatalogue(client, signal)) ===
            comparisonReview.comparison.privacy.catalogueChecksum,
          "comparison_privacy_custody_changed",
          "The original comparison expiry owner must match independent review.",
        );
        const result = await query(
          client,
          "SELECT * FROM creator_trust.purge_expired_comparison_sources(100)",
          [],
          signal,
        );
        return z
          .strictObject({
            consents_deleted: z.int().min(0).max(100),
            samples_deleted: z.int().min(0).max(100),
            cache_deleted: z.int().min(0).max(100),
            results_cleared: z.int().min(0).max(100),
          })
          .parse(result.rows[0]);
      },
      { signal },
    );
  }

  /** A restarted host discovers both unfinished attempts and sealed files that
   * crashed before SQL retention/ACK. File age alone never authorizes removal.
   * Keep the original task row locked through the actual storage operation. */
  async recoverAttempts(signal: AbortSignal): Promise<number> {
    invariant(
      !requestAuthority.getStore(),
      "comparison_artifact_worker_required",
      "Use the original background artifact recovery worker.",
    );
    const attempts = z
      .array(PrivacyArtifactAttempt)
      .max(20)
      .parse(await this.artifacts.attempts!(signal));
    let recovered = 0;
    for (const attempt of attempts) {
      if (!Domain.safeParse(attempt.domain).success) continue;
      signal.throwIfAborted();
      const action = await trustTransaction(
        this.workerPool,
        (client) => this.recoverAttemptInTransaction(client, attempt, signal),
        { signal },
      );
      if (action) recovered++;
    }
    return recovered;
  }

  private async recoverAttemptInTransaction(
    client: PoolClient,
    attempt: PrivacyArtifactAttempt,
    signal: AbortSignal,
  ): Promise<boolean> {
    await this.assertClient(client, "creator_trust_worker", signal);
    const result = await query(
      client,
      "SELECT creator_trust.fence_comparison_export_attempt($1) AS decision",
      [JSON.stringify(attempt)],
      signal,
    );
    const decision = z
      .discriminatedUnion("action", [
        z.strictObject({ action: z.literal("wait") }),
        z.strictObject({ action: z.literal("remove") }),
        z.strictObject({
          action: z.literal("keep"),
          artifact: PrivacyArtifact,
        }),
      ])
      .parse(result.rows[0]?.decision);
    if (decision.action === "wait") return false;
    if (decision.action === "keep") {
      invariant(
        decision.artifact.reference === attempt.reference &&
          decision.artifact.snapshotRef === attempt.snapshotRef &&
          decision.artifact.contentType === attempt.contentType,
        "comparison_artifact_custody_changed",
        "Keep only the original acknowledged artifact.",
      );
      await this.artifacts.verify(decision.artifact, attempt, signal);
      await this.artifacts.forgetAttempt!(attempt, signal);
    } else {
      await this.artifacts.removeAttempt!(attempt, signal);
      await this.assertClient(client, "creator_trust_worker", signal);
      const finished = await query(
        client,
        "SELECT creator_trust.finish_comparison_export_attempt($1) AS removed",
        [JSON.stringify(attempt)],
        signal,
      );
      invariant(
        finished.rows[0]?.removed === true,
        "comparison_artifact_custody_changed",
        "The original recovery task changed before acknowledgment.",
      );
    }
    return true;
  }

  /** The caller is Trust's original held 0103 task, never a replacement
   * transaction. Pending work is committed without acknowledging the domain.
   * This bounded step can then resume under its next genuine task lease. */
  async privacyInTransaction(
    client: PoolClient,
    job: ExportJob,
  ): Promise<{
    pending: boolean;
    data?: readonly unknown[];
  }> {
    invariant(
      !requestAuthority.getStore() && job.signal,
      "comparison_artifact_source_required",
      "Use the original held Trust privacy task.",
    );
    const signal = job.signal;
    await this.assertClient(client, "creator_trust_worker", signal);
    const parameters = [job.jobId, z.uuid().parse(job.leaseToken)];
    if (job.kind === "export") {
      const result = await query(
        client,
        "SELECT creator_trust.export_comparison_artifact_privacy($1,$2) AS data",
        parameters,
        signal,
      );
      if (result.rows.length > 2000) throw new Error("bounded_subjob_required");
      return { pending: false, data: result.rows.map((row) => row.data) };
    }
    const started = await query(
      client,
      "SELECT creator_trust.begin_comparison_artifact_privacy_delete($1,$2) AS ready",
      parameters,
      signal,
    );
    if (started.rows[0]?.ready !== true) return { pending: true };
    // Read a complete fresh inventory before changing directory entries. The
    // bounded background scan's empty page cannot establish this EOF.
    const attempts = new Map<string, PrivacyArtifactAttempt>();
    for await (const value of this.artifacts.scanAttempts!(signal)) {
      const attempt = PrivacyArtifactAttempt.parse(value);
      if (!Domain.safeParse(attempt.domain).success) continue;
      attempts.set(attempt.reference, attempt);
      if (attempts.size > 2000) throw new Error("bounded_subjob_required");
    }
    let pending = false;
    for (const attempt of attempts.values()) {
      if (!(await this.recoverAttemptInTransaction(client, attempt, signal)))
        pending = true;
    }
    if (pending) return { pending: true };
    const rows = await query(
      client,
      "SELECT * FROM creator_trust.comparison_artifact_privacy_delete_rows($1,$2)",
      parameters,
      signal,
    );
    for (const row of rows.rows) {
      const reference = Snapshot.parse(row.snapshot_ref);
      const artifact = PrivacyArtifact.nullable().parse(row.manifest);
      if (artifact) {
        invariant(
          artifact.snapshotRef === reference,
          "comparison_artifact_custody_changed",
          "Delete only the exact original captured artifact.",
        );
        await this.artifacts.remove!(artifact, artifact, signal);
      }
      await this.assertClient(client, "creator_trust_worker", signal);
      const removed = await query(
        client,
        "SELECT creator_trust.finish_comparison_artifact_privacy_delete($1,$2,$3,$4) AS removed",
        [...parameters, reference, artifact ? JSON.stringify(artifact) : null],
        signal,
      );
      invariant(
        removed.rows[0]?.removed === true,
        "comparison_artifact_custody_changed",
        "Original artifact provenance changed before deletion.",
      );
    }
    const remaining = await query(
      client,
      "SELECT * FROM creator_trust.comparison_artifact_privacy_delete_rows($1,$2)",
      parameters,
      signal,
    );
    return { pending: remaining.rows.length > 0 };
  }
}
