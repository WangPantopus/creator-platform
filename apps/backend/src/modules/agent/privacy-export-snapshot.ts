import { createHash, randomUUID } from "node:crypto";
import { Client, type Pool, type PoolClient, type QueryResult } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PrivacyTaskInput } from "../trust/privacy-authority.js";
import { generationConsumerCatalogue } from "./generation-consumer-catalogue.js";

export const AGENT_PRIVACY_EXPORT_MIGRATION = "0196_w2_privacy_export_snapshot";
const Owner = "creator_w2_privacy_export";
export const AGENT_PRIVACY_EXPORT_SIGNATURES = [
  "creator.begin_agent_privacy_export(uuid,uuid,uuid,uuid,uuid)",
  "creator.agent_privacy_export_matches(uuid)",
  "creator.agent_privacy_export_rows(uuid)",
  "creator.end_agent_privacy_export(uuid)",
  "creator.current_agent_privacy_export(uuid)",
  "creator.finish_agent_privacy_export_scope()",
] as const;
type Signature = (typeof AGENT_PRIVACY_EXPORT_SIGNATURES)[number];
export type AgentPrivacyExportReview = Readonly<{
  migration: Readonly<{ version: string; checksum: string }>;
  definitions: Readonly<Record<Signature, string>>;
  catalogueChecksum: string;
}>;
const PublicExecutables: readonly Signature[] = [
  AGENT_PRIVACY_EXPORT_SIGNATURES[0],
  AGENT_PRIVACY_EXPORT_SIGNATURES[2],
  AGENT_PRIVACY_EXPORT_SIGNATURES[3],
  AGENT_PRIVACY_EXPORT_SIGNATURES[4],
];
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
export const AGENT_PRIVACY_EXPORT_ARRAYS = [
  "sources",
  "versions",
  "sponsors",
  "regressions",
  "usage",
  "ai_evaluation",
  "ai_shadow_sample",
  "ai_shadow_evaluation",
  "ai_ingestion",
  "ai_event",
  "ai_cost_hold",
  "ai_chunk",
  "ai_command",
  "ai_style_embedding",
  "generationReceipts",
  "ai_generation_admission",
  "ai_generation_attempt",
] as const;
const Packet = z.strictObject({
  creatorId: z.uuid(),
  kind: z.enum([
    "header",
    "array_start",
    "array_item",
    "array_end",
    "scalar",
    "creator_end",
  ]),
  name: z.enum(AGENT_PRIVACY_EXPORT_ARRAYS).optional(),
  document: z.unknown().optional(),
});
export type AgentPrivacyExportPacket = Readonly<z.infer<typeof Packet>>;
const SourceBrand: unique symbol = Symbol("AgentPrivacyExportSource");
export type AgentPrivacyExportSource = Readonly<{
  [SourceBrand]: true;
  snapshotRef: string;
  creatorIds: readonly string[];
}>;

/** Recheck actual same-client source custody before production and at EOF;
 * startup readiness alone cannot authorize a later export. */
async function assertReviewedExport(
  database: Pick<Pool, "query">,
  review: AgentPrivacyExportReview,
) {
  try {
    const active = await registeredMigration({
      name: "w2_privacy_export_snapshot",
      path: "apps/backend/src/modules/agent/migrations/0113_w2_privacy_export_snapshot.sql",
      owner: "W2",
      checksum:
        "f0b86d507bcb7ad194c680f93487f582354f711ca91f3deffb01843c263ea65a",
    });
    if (
      !active ||
      active.version !== review.migration.version ||
      active.checksum !== review.migration.checksum
    )
      throw new Error("Inactive export executable source");
    await assertAgentPrivacyExportPurposeCatalogue(database, review);
  } catch (cause) {
    const failure = new DomainError(
      "privacy_export_unconfigured",
      "Reviewed current all-source export custody is unavailable.",
      503,
    );
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
    });
    throw failure;
  }
}

/** Closed operator source review only. No source or task authority is issued;
 * applications additionally require the active executable registry gate above. */
export async function assertAgentPrivacyExportPurposeCatalogue(
  database: Pick<Pool, "query">,
  review: AgentPrivacyExportReview,
) {
  try {
    const ready = (
      await database.query<{ ready: boolean }>(
        `SELECT current_user=session_user AND session_user='creator_runtime'
         AND EXISTS(SELECT FROM pg_roles WHERE rolname=session_user AND NOT rolsuper AND NOT rolinherit
          AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND rolconfig IS NULL)
         AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=session_user))
         AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=(SELECT oid FROM pg_roles WHERE rolname=session_user))
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
         AND EXISTS(SELECT FROM pg_roles r WHERE r.rolname=$3 AND NOT r.rolcanlogin AND NOT r.rolsuper
          AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolbypassrls AND NOT r.rolreplication
          AND r.rolconfig IS NULL AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
          AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
          AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_database WHERE datdba=r.oid)
          AND NOT EXISTS(SELECT FROM pg_largeobject_metadata WHERE lomowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_foreign_server WHERE srvowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper WHERE fdwowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_language WHERE lanowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_tablespace WHERE spcowner=r.oid)
          AND NOT EXISTS(SELECT FROM pg_type t WHERE t.typowner=r.oid
           AND t.oid<>(SELECT reltype FROM pg_class WHERE oid=to_regclass('creator.agent_privacy_export_scope'))
           AND t.typelem<>(SELECT reltype FROM pg_class WHERE oid=to_regclass('creator.agent_privacy_export_scope')))
          AND NOT EXISTS(SELECT FROM pg_default_acl d LEFT JOIN LATERAL aclexplode(d.defaclacl) a ON true
           WHERE d.defaclrole=r.oid OR a.grantee=r.oid)
          AND NOT EXISTS(SELECT FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a WHERE a.grantee=r.oid)
          AND NOT EXISTS(SELECT FROM pg_type t CROSS JOIN LATERAL aclexplode(t.typacl) a WHERE a.grantee=r.oid)
          AND NOT EXISTS(SELECT FROM pg_language l CROSS JOIN LATERAL aclexplode(l.lanacl) a WHERE a.grantee=r.oid)
          AND NOT EXISTS(SELECT FROM pg_foreign_server s CROSS JOIN LATERAL aclexplode(s.srvacl) a WHERE a.grantee=r.oid)
          AND NOT EXISTS(SELECT FROM pg_foreign_data_wrapper w CROSS JOIN LATERAL aclexplode(w.fdwacl) a WHERE a.grantee=r.oid)
          AND NOT EXISTS(SELECT FROM pg_tablespace t CROSS JOIN LATERAL aclexplode(t.spcacl) a WHERE a.grantee=r.oid)
          AND NOT EXISTS(SELECT FROM pg_parameter_acl p CROSS JOIN LATERAL aclexplode(p.paracl) a WHERE a.grantee=r.oid)
          AND NOT EXISTS(SELECT FROM pg_largeobject_metadata m CROSS JOIN LATERAL aclexplode(m.lomacl) a WHERE a.grantee=r.oid)
          AND (SELECT count(*)=1 FROM pg_class WHERE relowner=r.oid AND relkind IN('r','p','v','m','S','f'))
          AND EXISTS(SELECT FROM pg_class WHERE oid=to_regclass('creator.agent_privacy_export_scope') AND relowner=r.oid
           AND relkind='r' AND relrowsecurity AND relforcerowsecurity)
          AND (SELECT count(*)=6 FROM pg_proc WHERE proowner=r.oid))
         AND NOT has_table_privilege(session_user,'creator.agent_privacy_export_scope','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
         AND NOT has_column_privilege($3,'creator.ai_usage','completion_capability_hash','SELECT')
         AND NOT has_table_privilege($3,'creator_trust.privacy_commit_scope','SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_table_privilege($3,'creator.message','SELECT,INSERT,UPDATE,DELETE')
         AND NOT has_table_privilege($3,'creator.access_grant','SELECT,INSERT,UPDATE,DELETE')
         AND EXISTS(SELECT FROM pg_trigger WHERE tgrelid=to_regclass('creator.agent_privacy_export_scope')
          AND tgname='w2_privacy_export_commit' AND tgenabled='O' AND tgdeferrable AND tginitdeferred
          AND tgfoid=to_regprocedure('creator.finish_agent_privacy_export_scope()')
          AND tgtype=5 AND NOT tgisinternal AND tgnargs=0 AND octet_length(tgargs)=0
          AND tgqual IS NULL AND tgattr=''::int2vector AND tgconstrrelid=0 AND tgconstrindid=0
          AND pg_get_triggerdef(oid,false)='CREATE CONSTRAINT TRIGGER w2_privacy_export_commit AFTER INSERT ON creator.agent_privacy_export_scope DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION creator.finish_agent_privacy_export_scope()')
         AND (SELECT count(*)=1 FROM pg_trigger WHERE tgrelid=to_regclass('creator.agent_privacy_export_scope') AND NOT tgisinternal)
         AND (SELECT count(*)=9 FROM pg_attribute WHERE attrelid=to_regclass('creator.agent_privacy_export_scope') AND attnum>0)
         AND NOT EXISTS(SELECT FROM (VALUES
          (1,'pid','integer',NULL::text),(2,'xid','xid8',NULL),(3,'login','name',NULL),
          (4,'nonce','uuid',NULL),(5,'job_id','uuid',NULL),(6,'lease_token','uuid',NULL),
          (7,'binding','jsonb',NULL),(8,'exhausted','boolean','false'),
          (9,'created_at','timestamp with time zone','clock_timestamp()')
         ) AS expected(position,name,type,default_expression)
          LEFT JOIN pg_attribute a ON a.attrelid=to_regclass('creator.agent_privacy_export_scope') AND a.attnum=expected.position
          LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE a.attname IS DISTINCT FROM expected.name OR a.atttypid IS DISTINCT FROM to_regtype(expected.type)
           OR a.attisdropped OR NOT a.attnotnull OR a.atttypmod<>-1 OR a.attndims<>0
           OR a.attidentity<>'' OR a.attgenerated<>'' OR NOT a.attislocal OR a.attinhcount<>0
           OR a.attcollation IS DISTINCT FROM (SELECT typcollation FROM pg_type WHERE oid=to_regtype(expected.type))
           OR a.atthasdef IS DISTINCT FROM (expected.default_expression IS NOT NULL)
           OR pg_get_expr(d.adbin,d.adrelid) IS DISTINCT FROM expected.default_expression)
         AND (SELECT count(*)=1 FROM pg_constraint WHERE conrelid=to_regclass('creator.agent_privacy_export_scope') AND contype='p'
          AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('creator.agent_privacy_export_scope') AND attname='pid'),
           (SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('creator.agent_privacy_export_scope') AND attname='xid')]::smallint[])
         AND (SELECT count(*)=1 FROM pg_constraint WHERE conrelid=to_regclass('creator.agent_privacy_export_scope') AND contype='u'
          AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=to_regclass('creator.agent_privacy_export_scope') AND attname='nonce')]::smallint[])
         AND NOT EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND pg_get_userbyid(p.proowner)<>$3
           AND ((p.prosecdef AND has_function_privilege($3,p.oid,'EXECUTE'))
            OR EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
             WHERE a.grantee=(SELECT oid FROM pg_roles WHERE rolname=$3) AND a.privilege_type='EXECUTE'))) AS ready`,
        [review.migration.version, review.migration.checksum, Owner],
      )
    ).rows[0]?.ready;
    if (ready !== true) throw new Error("Unreviewed export owner custody");
    for (const signature of AGENT_PRIVACY_EXPORT_SIGNATURES) {
      const executable = PublicExecutables.includes(signature);
      const row = (
        await database.query<{ ready: boolean; definition: string }>(
          `SELECT p.prosecdef AND p.provolatile='v' AND pg_get_userbyid(p.proowner)=$2
           AND p.proconfig=ARRAY['search_path=pg_catalog']
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE a.privilege_type<>'EXECUTE' OR r.rolname IS NULL
             OR r.rolname<>$2 AND ($3=false OR r.rolname<>'creator_runtime') OR a.grantor<>p.proowner OR a.is_grantable)
           AND has_function_privilege(session_user,p.oid,'EXECUTE')=$3 AS ready,
           pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure($1)`,
          [signature, Owner, executable],
        )
      ).rows[0];
      if (
        row?.ready !== true ||
        createHash("sha256").update(row.definition).digest("hex") !==
          review.definitions[signature]
      )
        throw new Error("Unreviewed fixed export executable");
    }
    if (
      contentHash(await generationConsumerCatalogue(database, Owner)) !==
      review.catalogueChecksum
    )
      throw new Error("Unreviewed export source permissions");
  } catch (cause) {
    const failure = new DomainError(
      "privacy_export_unconfigured",
      "Reviewed current all-source export custody is unavailable.",
      503,
    );
    Object.defineProperty(failure, "cause", {
      value: cause,
      configurable: true,
    });
    throw failure;
  }
}

/** One fixed SQL union, privately derived from the actual leased export job.
 * No caller IDs, portal query, EOF flag, Actor or ThreadScope are accepted. */
export class PreparedAgentPrivacyExport {
  private readonly issued = new WeakMap<
    AgentPrivacyExportSource,
    {
      client: PoolClient;
      job: PrivacyTaskInput;
      nonce: string;
      portal: string;
      eof: boolean;
      ended: boolean;
      hash: string;
      signal: AbortSignal;
      serialized: boolean;
    }
  >();
  private constructor(
    private readonly pool: Pool,
    private readonly assertTask: (
      client: PoolClient,
      job: PrivacyTaskInput,
    ) => Promise<readonly string[]>,
    private readonly review: AgentPrivacyExportReview,
  ) {}
  assertHostPool(pool: Pool) {
    invariant(
      pool === this.pool,
      "privacy_export_pool_mismatch",
      "Use this prepared source's actual canonical host pool.",
    );
  }
  static async prepare(input: {
    pool: Pool;
    migration: { version: string; checksum: string };
    definitions: Readonly<Record<Signature, string>>;
    catalogueChecksum: string;
    /** Real W8 same-client task + current restoration + cancellation port. */
    assertTaskInTransaction: (
      client: PoolClient,
      job: PrivacyTaskInput,
    ) => Promise<readonly string[]>;
  }): Promise<PreparedAgentPrivacyExport> {
    const migration = Object.freeze({ ...input.migration });
    const definitions = Object.freeze({ ...input.definitions });
    invariant(
      migration.version === AGENT_PRIVACY_EXPORT_MIGRATION &&
        Hash.safeParse(migration.checksum).success &&
        Hash.safeParse(input.catalogueChecksum).success &&
        Object.keys(definitions).length ===
          AGENT_PRIVACY_EXPORT_SIGNATURES.length &&
        AGENT_PRIVACY_EXPORT_SIGNATURES.every(
          (signature) => Hash.safeParse(definitions[signature]).success,
        ) &&
        typeof input.assertTaskInTransaction === "function",
      "privacy_export_unconfigured",
      "Exact independently reviewed snapshot source, catalogue and real lifecycle ports are required.",
    );
    const review = Object.freeze({
      migration,
      definitions,
      catalogueChecksum: input.catalogueChecksum,
    });
    await assertReviewedExport(input.pool, review);
    return new PreparedAgentPrivacyExport(
      input.pool,
      input.assertTaskInTransaction,
      review,
    );
  }

  private assertWorker(job: PrivacyTaskInput) {
    invariant(
      !requestAuthority.getStore() &&
        job.signal &&
        job.kind === "export" &&
        job.scope === "account" &&
        job.idempotencyKey === `${job.jobId}:agent`,
      "privacy_export_task_required",
      "Use the actual cancellable Agent export task outside an interactive request.",
    );
    job.signal.throwIfAborted();
  }
  /** Cancel only the backend PID obtained from this actual held source client.
   * The control connection uses the same canonical non-owner configuration;
   * it supplies no lifecycle authority or caller-chosen PID. Await cancellation
   * before advancing the source, so a late cancel cannot hit a later COMMIT. */
  private async queryWithCancellation(
    client: PoolClient,
    signal: AbortSignal,
    sql: string,
  ) {
    signal.throwIfAborted();
    const pidQuery = {
      text: "SELECT pg_backend_pid() AS pid",
      query_timeout: 5000,
    };
    const pid = z
      .int()
      .positive()
      .parse((await client.query(pidQuery)).rows[0]?.pid);
    let cancelling: Promise<void> | undefined;
    let cancellationFailure: unknown;
    const abort = () => {
      cancelling = (async () => {
        const control = new Client({
          ...this.pool.options,
          connectionTimeoutMillis: 1500,
          statement_timeout: 1500,
          query_timeout: 1500,
          pipeline: false,
        });
        const onError = (error: Error) => {
          cancellationFailure ??= error;
        };
        control.on("error", onError);
        try {
          await control.connect();
          const cancelled = await control.query<{ cancelled: boolean }>(
            "SELECT pg_cancel_backend($1) AS cancelled",
            [pid],
          );
          invariant(
            cancelled.rows[0]?.cancelled === true,
            "privacy_export_cancel_unavailable",
            "The actual source backend could not be cancelled.",
          );
        } finally {
          try {
            await control.end();
          } finally {
            control.removeListener("error", onError);
          }
        }
      })().catch((error: unknown) => {
        cancellationFailure = error;
      });
    };
    signal.addEventListener("abort", abort, { once: true });
    let result: QueryResult<{ document: unknown }> | undefined;
    let queryFailure: unknown;
    try {
      signal.throwIfAborted();
      result = await client.query<{ document: unknown }>(sql);
    } catch (error) {
      queryFailure = error;
    } finally {
      signal.removeEventListener("abort", abort);
      await cancelling;
    }
    if (cancellationFailure)
      throw new DomainError(
        "privacy_export_cancel_unavailable",
        "Source cancellation failed; this export cannot complete.",
        503,
      );
    signal.throwIfAborted();
    if (queryFailure) throw queryFailure;
    invariant(
      result,
      "privacy_export_source_unavailable",
      "The actual source query must complete.",
    );
    return result;
  }
  async beginInTransaction(
    client: PoolClient,
    job: PrivacyTaskInput,
    parentSignal?: AbortSignal,
  ): Promise<AgentPrivacyExportSource> {
    this.assertWorker(job);
    const expected = await this.assertTask(client, job);
    await assertReviewedExport(client, this.review);
    const raw = (
      await client.query<{ proof: unknown }>(
        "SELECT creator.begin_agent_privacy_export($1,$2,$3,$4,$5) AS proof",
        [job.jobId, job.accountId, job.creatorId, job.threadId, job.leaseToken],
      )
    ).rows[0]?.proof;
    const proof = z
      .strictObject({
        nonce: z.uuid(),
        accountId: z.uuid(),
        creatorIds: z.array(z.uuid()).max(100),
      })
      .parse(raw);
    invariant(
      proof.accountId === job.accountId &&
        new Set(proof.creatorIds).size === proof.creatorIds.length &&
        contentHash([...proof.creatorIds].sort()) ===
          contentHash([...expected].sort()),
      "privacy_export_ownership_changed",
      "The actual task's immutable owned creators must match this source.",
    );
    const portal = `w2_agent_export_${proof.nonce.replaceAll("-", "")}`;
    // Parsed database UUID + fixed identifier grammar; no caller query text.
    await client.query(
      `DECLARE ${portal} NO SCROLL CURSOR FOR SELECT document FROM creator.agent_privacy_export_rows('${proof.nonce}'::uuid)`,
    );
    const source = Object.freeze({
      [SourceBrand]: true as const,
      snapshotRef: `agent-export:${randomUUID()}`,
      creatorIds: Object.freeze([...proof.creatorIds].sort()),
    });
    this.issued.set(source, {
      client,
      job,
      nonce: proof.nonce,
      portal,
      eof: false,
      serialized: false,
      ended: false,
      hash: contentHash(source),
      signal: AbortSignal.any([
        job.signal!,
        AbortSignal.timeout(45_000),
        ...(parentSignal ? [parentSignal] : []),
      ]),
    });
    await this.authorizeInTransaction(client, source);
    return source;
  }
  async authorizeInTransaction(
    client: PoolClient,
    source: AgentPrivacyExportSource,
  ): Promise<void> {
    const binding = this.issued.get(source);
    invariant(
      binding?.client === client &&
        !binding.ended &&
        binding.hash === contentHash(source),
      "privacy_export_source_required",
      "Use this same held client's privately issued source.",
    );
    this.assertWorker(binding.job);
    binding.signal.throwIfAborted();
    const ids = await this.assertTask(client, binding.job);
    invariant(
      contentHash([...ids].sort()) === contentHash(source.creatorIds),
      "privacy_export_ownership_changed",
      "The held export task changed ownership.",
    );
    const allowed = (
      await client.query<{ allowed: boolean }>(
        "SELECT creator.current_agent_privacy_export($1) AS allowed",
        [binding.nonce],
      )
    ).rows[0]?.allowed;
    invariant(
      allowed === true,
      "privacy_export_task_changed",
      "Current source custody ended.",
    );
  }
  private async fetchInTransaction(
    client: PoolClient,
    source: AgentPrivacyExportSource,
  ): Promise<readonly AgentPrivacyExportPacket[]> {
    await this.authorizeInTransaction(client, source);
    const binding = this.issued.get(source)!;
    invariant(
      !binding.eof,
      "privacy_export_source_exhausted",
      "Do not restart an exhausted source portal.",
    );
    const packets = z
      .array(Packet)
      .max(8)
      .parse(
        (
          await this.queryWithCancellation(
            client,
            binding.signal,
            `FETCH FORWARD 8 FROM ${binding.portal}`,
          )
        ).rows.map((row) => row.document),
      );
    if (!packets.length) binding.eof = true;
    invariant(
      packets.every((packet) => source.creatorIds.includes(packet.creatorId)),
      "privacy_export_family_changed",
      "Only actual owned source families are accepted.",
    );
    await this.authorizeInTransaction(client, source);
    return Object.freeze(packets.map((packet) => Object.freeze(packet)));
  }
  /** Serializes every privately issued packet in its fixed complete topology.
   * A missing/repeated family, array, header, scalar or end marker refuses;
   * private EOF alone cannot attest a complete protected artifact. */
  async writeInTransaction(
    client: PoolClient,
    source: AgentPrivacyExportSource,
    write: (part: string) => Promise<void>,
  ): Promise<void> {
    await this.authorizeInTransaction(client, source);
    const binding = this.issued.get(source)!;
    invariant(
      !binding.serialized && !binding.eof,
      "privacy_export_source_consumed",
      "Serialize the complete original source once.",
    );
    let creator = 0;
    let phase:
      | "header"
      | "array_start"
      | "array_item"
      | "scalar"
      | "creator_end" = "header";
    let array = 0;
    let items = 0;
    const invalid = () =>
      new DomainError(
        "privacy_export_source_incomplete",
        "The complete original source topology is required.",
        503,
      );
    const emit = async (part: string) => {
      binding.signal.throwIfAborted();
      await write(part);
      binding.signal.throwIfAborted();
    };
    const rowDocument = (packet: AgentPrivacyExportPacket) => {
      const document = z.record(z.string(), z.unknown()).parse(packet.document);
      if ("creator_id" in document && document.creator_id !== packet.creatorId)
        throw invalid();
      if ("completion_capability_hash" in document) throw invalid();
      return document;
    };
    await emit('{"schemaVersion":2,"creatorExports":[');
    for (;;) {
      const packets = await this.fetchInTransaction(client, source);
      if (!packets.length) break;
      for (const packet of packets) {
        if (packet.creatorId !== source.creatorIds[creator]) throw invalid();
        switch (phase) {
          case "header": {
            if (packet.kind !== "header" || packet.name !== undefined)
              throw invalid();
            const header = z
              .strictObject({
                schemaVersion: z.literal(2),
                state: z.enum(["configured", "not_configured", "deleted"]),
                workspace: z.record(z.string(), z.unknown()).nullable(),
                exportedAt: z.iso.datetime({ offset: true }),
                configuration: z.unknown(),
                interview: z.unknown(),
                status: z.unknown(),
                license: z.unknown(),
              })
              .parse(packet.document);
            if (
              header.workspace &&
              header.workspace.creator_id !== packet.creatorId
            )
              throw invalid();
            await emit(
              `${creator ? "," : ""}{"creatorId":${JSON.stringify(packet.creatorId)},"data":${JSON.stringify(header).slice(0, -1)}`,
            );
            array = 0;
            phase = "array_start";
            break;
          }
          case "array_start":
            if (
              packet.kind !== "array_start" ||
              packet.name !== AGENT_PRIVACY_EXPORT_ARRAYS[array] ||
              packet.document !== undefined
            )
              throw invalid();
            await emit(`,${JSON.stringify(packet.name)}:[`);
            items = 0;
            phase = "array_item";
            break;
          case "array_item":
            if (packet.name !== AGENT_PRIVACY_EXPORT_ARRAYS[array])
              throw invalid();
            if (packet.kind === "array_item") {
              await emit(
                `${items++ ? "," : ""}${JSON.stringify(rowDocument(packet))}`,
              );
            } else if (
              packet.kind === "array_end" &&
              packet.document === undefined
            ) {
              await emit("]");
              array++;
              phase =
                array === AGENT_PRIVACY_EXPORT_ARRAYS.length
                  ? "scalar"
                  : "array_start";
            } else throw invalid();
            break;
          case "scalar": {
            if (packet.kind !== "scalar" || packet.name !== undefined)
              throw invalid();
            const scalar = z
              .strictObject({
                licenseRecord: z.record(z.string(), z.unknown()).nullable(),
                tombstone: z.record(z.string(), z.unknown()).nullable(),
              })
              .parse(packet.document);
            for (const document of Object.values(scalar))
              if (document && document.creator_id !== packet.creatorId)
                throw invalid();
            await emit(
              `,"licenseRecord":${JSON.stringify(scalar.licenseRecord)},"tombstone":${JSON.stringify(scalar.tombstone)}`,
            );
            phase = "creator_end";
            break;
          }
          case "creator_end":
            if (
              packet.kind !== "creator_end" ||
              packet.name !== undefined ||
              packet.document !== undefined
            )
              throw invalid();
            await emit("}}");
            creator++;
            phase = "header";
            break;
        }
      }
    }
    if (creator !== source.creatorIds.length || phase !== "header")
      throw invalid();
    await emit("]}");
    await this.authorizeInTransaction(client, source);
    binding.serialized = true;
  }
  async finishInTransaction(
    client: PoolClient,
    source: AgentPrivacyExportSource,
  ): Promise<void> {
    await this.authorizeInTransaction(client, source);
    const binding = this.issued.get(source)!;
    invariant(
      binding.eof && binding.serialized,
      "privacy_export_source_incomplete",
      "Consume the complete original source before EOF verification.",
    );
    await assertReviewedExport(client, this.review);
    await client.query("SELECT creator.end_agent_privacy_export($1)", [
      binding.nonce,
    ]);
    await this.assertTask(client, binding.job);
    await client.query(`CLOSE ${binding.portal}`);
    binding.ended = true;
    this.issued.delete(source);
  }
}
