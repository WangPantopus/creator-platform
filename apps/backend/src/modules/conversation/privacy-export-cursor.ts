import { Client, type Pool, type PoolClient, type QueryResult } from "pg";
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { PreparedGenerationJournal } from "../agent/generation-journal.js";
import { PreparedUsageRetention } from "../agent/usage-retention.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PrivacyHook } from "../trust/contracts.js";
import { ConversationLineage } from "./lineage.js";
import { ConversationRecordings } from "./recordings.js";
import {
  fenceConversationPrivacyTask,
  type ConversationPrivacyAuthority,
  type ConversationPrivacyFamily,
} from "./privacy.js";

type Job = Parameters<PrivacyHook["run"]>[0];
const Owner = "creator_w3_privacy_export";
export const CONVERSATION_PRIVACY_CURSOR_MIGRATION =
  "0206_w3_privacy_cursor_export";
export const CONVERSATION_PRIVACY_CURSOR_SOURCE_SHA256 =
  "54c43918c34410404c81e2edc0356e8dac8f880211441ac48949bc0cc174121e";
const Signatures = [
  "creator.fence_conversation_privacy_export(uuid,uuid,text,uuid,uuid,uuid)",
  "creator.conversation_privacy_export_rows(uuid,uuid)",
  "creator.finish_conversation_privacy_export_scope()",
] as const;
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Family = z.strictObject({
  threadId: z.uuid(),
  creatorId: z.uuid(),
  fanId: z.uuid(),
});
const familiesKey = (families: readonly ConversationPrivacyFamily[]) =>
  canonical([...families].sort((a, b) => a.threadId.localeCompare(b.threadId)));
const jobKey = (job: Job) =>
  canonical({
    jobId: job.jobId,
    accountId: job.accountId,
    kind: job.kind,
    scope: job.scope,
    creatorId: job.creatorId,
    threadId: job.threadId,
    leaseToken: job.leaseToken,
    idempotencyKey: job.idempotencyKey,
  });
export const ConversationPrivacyCursorRow = z.strictObject({
  thread_id: z.uuid(),
  creator_id: z.uuid(),
  fan_id: z.uuid(),
  collection: z.number().int().min(0).max(18),
  row_key: z.string(),
  // Preserve PostgreSQL JSON numbers exactly, including64-bit accounting.
  document: z.string().min(2),
});
export type ConversationPrivacyCursorRow = z.infer<
  typeof ConversationPrivacyCursorRow
>;

/** A source-owned reader of the coordinator's original verified task. This
 * issues neither an interactive scope nor a job. Independently reviewed
 * installation receipts are mandatory; database-derived hashes are no approval. */
export class PreparedConversationPrivacyCursor {
  private readonly cursors = new WeakMap<
    PoolClient,
    {
      job: Job;
      jobKey: string;
      families: string;
      exhausted: boolean;
      closed: boolean;
    }
  >();

  private constructor(
    private readonly pool: Pool,
    private readonly authority: ConversationPrivacyAuthority,
    private readonly journal: PreparedGenerationJournal,
    private readonly usageRetention: PreparedUsageRetention,
    private readonly lineage: ConversationLineage,
    private readonly recordings: ConversationRecordings,
    private readonly reviewed: Readonly<{
      definitions: Readonly<Record<(typeof Signatures)[number], string>>;
      catalogueChecksum: string;
    }>,
  ) {}

  assertPool(pool: Pool): void {
    invariant(
      pool === this.pool,
      "conversation_export_pool_mismatch",
      "Use the actual prepared conversation export pool.",
    );
  }

  assertRuntime(input: {
    pool: Pool;
    authority: ConversationPrivacyAuthority;
    lineage?: ConversationLineage;
    recordings?: ConversationRecordings;
  }): void {
    this.assertPool(input.pool);
    invariant(
      input.authority === this.authority &&
        input.lineage === this.lineage &&
        input.recordings === this.recordings,
      "conversation_export_pool_mismatch",
      "Use the actual prepared export authority and source owners.",
    );
  }

  static async prepare(input: {
    pool: Pool;
    authority: ConversationPrivacyAuthority;
    journal: PreparedGenerationJournal;
    usageRetention: PreparedUsageRetention;
    lineage: ConversationLineage;
    recordings: ConversationRecordings;
    custody: {
      migration: { version: string; checksum: string };
      definitions: Record<(typeof Signatures)[number], string>;
      catalogueChecksum: string;
    };
  }): Promise<PreparedConversationPrivacyCursor> {
    invariant(
      input.journal instanceof PreparedGenerationJournal &&
        input.usageRetention instanceof PreparedUsageRetention &&
        input.lineage instanceof ConversationLineage &&
        input.recordings instanceof ConversationRecordings &&
        input.custody.migration.version ===
          CONVERSATION_PRIVACY_CURSOR_MIGRATION &&
        input.custody.migration.checksum ===
          CONVERSATION_PRIVACY_CURSOR_SOURCE_SHA256 &&
        Signatures.every(
          (signature) =>
            Hash.safeParse(input.custody.definitions[signature]).success,
        ) &&
        Object.keys(input.custody.definitions).length === Signatures.length &&
        Hash.safeParse(input.custody.catalogueChecksum).success,
      "conversation_export_unconfigured",
      "Actual prepared source owners and independently reviewed export custody are required.",
    );
    input.journal.assertPool(input.pool);
    input.usageRetention.assertJournal(input.journal);
    input.lineage.assertPool(input.pool);
    input.recordings.assertPool(input.pool);
    const prepared = new PreparedConversationPrivacyCursor(
      input.pool,
      input.authority,
      input.journal,
      input.usageRetention,
      input.lineage,
      input.recordings,
      Object.freeze({
        definitions: Object.freeze({ ...input.custody.definitions }),
        catalogueChecksum: input.custody.catalogueChecksum,
      }),
    );
    const client = await input.pool.connect();
    let started = false;
    let discard = true;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
      started = true;
      discard = false;
      await client.query(
        "SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='5s'",
      );
      await prepared.assertCatalogue(client);
      discard = true;
      await client.query("ROLLBACK");
      started = false;
      discard = false;
      return prepared;
    } finally {
      if (started) {
        try {
          await client.query("ROLLBACK");
        } catch {
          discard = true;
        }
      }
      client.release(discard);
    }
  }

  private async assertCatalogue(client: PoolClient): Promise<void> {
    invariant(
      !requestAuthority.getStore(),
      "conversation_export_worker_required",
      "Use the original lifecycle task outside interactive request authority.",
    );
    await client.query("SAVEPOINT w3_cursor_catalogue");
    await client.query("RELEASE SAVEPOINT w3_cursor_catalogue");
    const row = (
      await client.query<{ ready: boolean }>(
        `SELECT session_user='creator_runtime' AND current_user=session_user
         AND current_setting('transaction_isolation')='read committed'
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0181_w2_generation_attempt_admission'
          AND checksum='eab8c8e07b8a1e6ba4384f5300560bd46853bf98509faade5a1b555e130c75ee')
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0188_w2_generation_terminal_journal'
          AND checksum='7ab8974d065b1b9e5befa2ded26c6978876957fab0eee80b9632825bbac98477')
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0210_w2_generation_guardrail_event'
          AND checksum='0c0fc7fee7182f3e77695222e51cce910268f7844437a5e974f68af5927a3382')
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0212_w3_generation_worker_output'
          AND checksum='76ee832c45e5dc422a8128afdc162a354fc54b7df4f611fb6186cdf3bd094df8')
         AND has_column_privilege($3,'creator.ai_generation_attempt','admission_version_hash','SELECT')
         AND has_column_privilege($3,'creator.ai_generation_attempt','admission_model_fingerprint','SELECT')
         AND NOT has_column_privilege($3,'creator.ai_usage','completion_capability_hash','SELECT,INSERT,UPDATE,REFERENCES')
         AND EXISTS(SELECT FROM pg_attribute WHERE attrelid=to_regclass('creator.ai_usage')
          AND attname='completion_capability_hash' AND attnum>0 AND NOT attisdropped
          AND atttypid='pg_catalog.bytea'::regtype AND atttypmod=-1 AND attndims=0
          AND NOT attnotnull AND attgenerated='' AND attidentity='' AND NOT atthasdef)
         AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['ai_generation_admission','ai_generation_attempt',
           'ai_generation_receipt','ai_usage','ai_event']) AND has_table_privilege($3,c.oid,'SELECT'))
         AND EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND NOT rolinherit AND NOT rolsuper
          AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
         AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user))
         AND NOT EXISTS(SELECT FROM pg_database WHERE datname=current_database() AND
          (datconnlimit=0 OR shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed'))
         AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$3 AND NOT r.rolcanlogin AND NOT r.rolinherit
          AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
          AND NOT r.rolreplication AND r.rolconfig IS NULL
          AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
          AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
          AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_class owned WHERE owned.relowner=r.oid
           AND owned.oid<>to_regclass('creator.conversation_privacy_export_scope')
           AND owned.oid<>(SELECT reltoastrelid FROM pg_class WHERE oid=to_regclass('creator.conversation_privacy_export_scope'))
           AND NOT EXISTS(SELECT FROM pg_index i WHERE i.indexrelid=owned.oid
            AND i.indrelid IN(to_regclass('creator.conversation_privacy_export_scope'),
             (SELECT reltoastrelid FROM pg_class WHERE oid=to_regclass('creator.conversation_privacy_export_scope')))))
          AND EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('creator.conversation_privacy_export_scope')
           AND relowner=r.oid AND relrowsecurity AND relforcerowsecurity)
          AND (SELECT count(*)=3 FROM pg_proc WHERE proowner=r.oid)) AS ready`,
        [
          CONVERSATION_PRIVACY_CURSOR_MIGRATION,
          CONVERSATION_PRIVACY_CURSOR_SOURCE_SHA256,
          Owner,
        ],
      )
    ).rows[0];
    invariant(
      row?.ready,
      "conversation_export_custody_changed",
      "Current original export installation and isolated custody are required.",
    );
    const functions = (
      await client.query<{
        signature: (typeof Signatures)[number];
        definition: string;
        ready: boolean;
      }>(
        `SELECT signature,pg_get_functiondef(p.oid) AS definition,p.prosecdef AND p.prokind='f'
         AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)=$2
         AND p.provolatile=CASE WHEN signature=$3 THEN 's'::"char" ELSE 'v'::"char" END
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee<>p.proowner AND (a.grantee=0 OR pg_get_userbyid(a.grantee)<>'creator_runtime'
           OR signature=$4 OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
         AND (signature=$4 OR has_function_privilege('creator_runtime',p.oid,'EXECUTE')) AS ready
         FROM unnest($1::text[]) signature LEFT JOIN pg_proc p ON p.oid=to_regprocedure(signature)`,
        [Signatures, Owner, Signatures[1], Signatures[2]],
      )
    ).rows;
    invariant(
      functions.length === Signatures.length &&
        functions.every(
          (fn) =>
            fn.ready &&
            createHash("sha256").update(fn.definition, "utf8").digest("hex") ===
              this.reviewed.definitions[fn.signature],
        ),
      "conversation_export_custody_changed",
      "The exact reviewed source functions and effective ACL are required.",
    );
    const effective = {
      ...(await generationConsumerCatalogue(client, Owner)),
      // The shared effective-ACL catalogue does not encode types, defaults or
      // FK definitions. Keep the entire ordinary0212 relation shape in the
      // independently reviewed checksum, including unknown columns/constraints.
      sentenceProvenance: {
        columns: (
          await client.query(
            `SELECT a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
             a.attnotnull,a.attndims,a.attidentity,a.attgenerated,
             pg_get_expr(d.adbin,d.adrelid) AS default_expression
             FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
             WHERE a.attrelid=to_regclass('creator.generation_sentence_provenance')
              AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,
          )
        ).rows,
        constraints: (
          await client.query(
            `SELECT conname,contype,convalidated,condeferrable,condeferred,
             pg_get_constraintdef(oid,true) AS definition
             FROM pg_constraint WHERE conrelid=to_regclass('creator.generation_sentence_provenance') ORDER BY conname`,
          )
        ).rows,
        indexes: (
          await client.query(
            `SELECT pg_get_indexdef(indexrelid) AS definition,indisvalid,indisready
             FROM pg_index WHERE indrelid=to_regclass('creator.generation_sentence_provenance')
             ORDER BY pg_get_indexdef(indexrelid)`,
          )
        ).rows,
        triggers: (
          await client.query(
            `SELECT tgname,tgenabled,pg_get_triggerdef(oid,true) AS definition
             FROM pg_trigger WHERE tgrelid=to_regclass('creator.generation_sentence_provenance')
             ORDER BY tgname`,
          )
        ).rows,
      },
      functions: (
        await client.query(
          `SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS arguments,
           pg_get_userbyid(p.proowner) AS owner,has_function_privilege($1,p.oid,'EXECUTE') AS executable,
           p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,p.proname,arguments`,
          [Owner],
        )
      ).rows,
    };
    invariant(
      contentHash(effective) === this.reviewed.catalogueChecksum,
      "conversation_export_custody_changed",
      "Current effective columns, visibility and executable custody must match independent review.",
    );
    await this.journal.assertClient(client);
    await this.usageRetention.assertClient(client);
  }

  async assertCurrent(
    client: PoolClient,
    job: Job,
    families: readonly ConversationPrivacyFamily[],
  ): Promise<void> {
    invariant(
      job.kind === "export" &&
        job.signal &&
        job.idempotencyKey === `${job.jobId}:conversation` &&
        z.uuid().safeParse(job.leaseToken).success,
      "conversation_export_task_required",
      "Use the original verified conversation export task and lease.",
    );
    job.signal.throwIfAborted();
    const cursor = this.cursors.get(client);
    invariant(
      !cursor ||
        (cursor.job === job &&
          cursor.jobKey === jobKey(job) &&
          cursor.families === familiesKey(families)),
      "conversation_export_task_changed",
      "The original cursor task and family set must remain unchanged.",
    );
    await fenceConversationPrivacyTask(this.authority, client, job);
    await this.assertCatalogue(client);
    const row = (
      await client.query<{ families: unknown }>(
        "SELECT creator.fence_conversation_privacy_export($1,$2,$3,$4,$5,$6) AS families",
        [
          job.jobId,
          job.accountId,
          job.scope,
          job.creatorId,
          job.threadId,
          job.leaseToken,
        ],
      )
    ).rows[0];
    const actual = z.array(Family).max(100).parse(row?.families);
    invariant(
      familiesKey(actual) === familiesKey(families),
      "conversation_export_family_changed",
      "Export every original authorized family from the current verified task.",
    );
    await fenceConversationPrivacyTask(this.authority, client, job);
    job.signal.throwIfAborted();
  }

  async open(
    client: PoolClient,
    job: Job,
    families: readonly ConversationPrivacyFamily[],
  ): Promise<void> {
    invariant(
      !this.cursors.has(client),
      "conversation_export_already_started",
      "Use one complete original cursor on this held transaction.",
    );
    await this.assertCurrent(client, job, families);
    await client.query(
      `DECLARE w3_conversation_privacy_export NO SCROLL CURSOR WITHOUT HOLD FOR
       SELECT thread_id,creator_id,fan_id,collection,row_key,document::text AS document
       FROM creator.conversation_privacy_export_rows($1,$2)
       ORDER BY thread_id::text COLLATE "C",collection,row_key COLLATE "C"`,
      [job.jobId, job.leaseToken],
    );
    this.cursors.set(client, {
      job,
      jobKey: jobKey(job),
      families: familiesKey(families),
      exhausted: false,
      closed: false,
    });
    await this.assertCurrent(client, job, families);
  }

  /** Cancel only the PID read from this held client. Await the control query
   * and connection close before any later source query or cleanup SQL, so a
   * delayed cancellation cannot reach ROLLBACK or COMMIT. */
  private async fetchWithCancellation(
    client: PoolClient,
    signal: AbortSignal,
  ): Promise<QueryResult<ConversationPrivacyCursorRow>> {
    signal.throwIfAborted();
    const pid = z
      .int()
      .positive()
      .max(2147483647)
      .parse(
        (await client.query("SELECT pg_backend_pid() AS pid")).rows[0]?.pid,
      );
    let cancelling: Promise<void> | undefined;
    let cancellationFailed = false;
    const abort = () => {
      cancelling = (async () => {
        const control = new Client({
          ...this.pool.options,
          connectionTimeoutMillis: 1500,
          statement_timeout: 1500,
          query_timeout: 1500,
        });
        control.on("error", () => {
          cancellationFailed = true;
        });
        try {
          await control.connect();
          const result = await control.query<{ cancelled: boolean }>(
            "SELECT pg_cancel_backend($1) AS cancelled",
            [pid],
          );
          invariant(
            result.rows[0]?.cancelled === true,
            "conversation_export_cancel_unavailable",
            "The actual held source backend could not be cancelled.",
          );
        } finally {
          await control.end();
        }
      })().catch(() => {
        cancellationFailed = true;
      });
    };
    signal.addEventListener("abort", abort, { once: true });
    let result: QueryResult<ConversationPrivacyCursorRow> | undefined;
    let queryFailed = false;
    let queryFailure: unknown;
    try {
      signal.throwIfAborted();
      result = await client.query<ConversationPrivacyCursorRow>(
        "FETCH FORWARD 16 FROM w3_conversation_privacy_export",
      );
    } catch (error) {
      queryFailed = true;
      queryFailure = error;
    } finally {
      signal.removeEventListener("abort", abort);
      await cancelling;
    }
    if (cancellationFailed)
      throw new DomainError(
        "conversation_export_cancel_unavailable",
        "Source cancellation failed; this export cannot complete.",
        503,
      );
    signal.throwIfAborted();
    if (queryFailed) throw queryFailure;
    invariant(
      result,
      "conversation_export_source_unavailable",
      "The actual held source query must complete.",
    );
    return result;
  }

  async next(
    client: PoolClient,
    job: Job,
    families: readonly ConversationPrivacyFamily[],
    parentSignal: AbortSignal,
  ): Promise<ConversationPrivacyCursorRow[]> {
    const cursor = this.cursors.get(client);
    invariant(
      cursor && !cursor.exhausted && !cursor.closed,
      "conversation_export_source_unavailable",
      "The complete original cursor must be open on this held client.",
    );
    parentSignal.throwIfAborted();
    await this.assertCurrent(client, job, families);
    const signal = AbortSignal.any([job.signal!, parentSignal]);
    const rows = z
      .array(ConversationPrivacyCursorRow)
      .max(16)
      .parse((await this.fetchWithCancellation(client, signal)).rows);
    signal.throwIfAborted();
    await this.assertCurrent(client, job, families);
    signal.throwIfAborted();
    if (rows.length === 0) cursor.exhausted = true;
    return rows;
  }

  async close(
    client: PoolClient,
    job: Job,
    families: readonly ConversationPrivacyFamily[],
  ): Promise<void> {
    const cursor = this.cursors.get(client);
    invariant(
      cursor?.exhausted && !cursor.closed,
      "conversation_export_source_incomplete",
      "An actual empty EOF fetch must precede cursor closure.",
    );
    await this.assertCurrent(client, job, families);
    await client.query("CLOSE w3_conversation_privacy_export");
    cursor.closed = true;
    await this.assertCurrent(client, job, families);
  }

  forget(client: PoolClient): void {
    this.cursors.delete(client);
  }
}
