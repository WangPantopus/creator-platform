import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { FrameSchema, type Frame } from "@qelvora/api";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { generationHostDatabase } from "../identity/generation-host-database.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { generationOutputRepairSource } from "../../db/generation-output-profile.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTask,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import { assertGenerationOutputCursorCatalogue } from "../identity/generation-output-cursor.js";
import {
  PreparedGenerationPipeline,
  type ApprovedGenerationSentence,
} from "../agent/generation-pipeline.js";

export const GENERATION_OUTPUT_MIGRATION = "0212_w3_generation_worker_output";
export const GENERATION_OUTPUT_SOURCE_SHA256 =
  "76ee832c45e5dc422a8128afdc162a354fc54b7df4f611fb6186cdf3bd094df8";
export const GENERATION_OUTPUT_SIGNATURE =
  "creator.generation_worker_output(uuid,uuid,integer,text,jsonb)";
const Owner = "creator_w3_generation_output";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Columns = {
  "creator.schema_migration": { SELECT: ["version", "checksum"] },
  "creator.generation_worker_scope": {
    SELECT: [
      "id",
      "transaction_id",
      "backend_pid",
      "login_name",
      "generation_id",
      "worker_token",
      "operation",
      "task",
      "created_at",
    ],
  },
  "creator.generation": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "fan_message_id",
      "ai_message_id",
      "epoch",
      "context_revision",
      "last_sequence",
      "first_visible_at",
      "state",
      "worker_token",
      "lease_until",
    ],
    UPDATE: ["last_sequence", "first_visible_at"],
  },
  "creator.thread": {
    SELECT: [
      "id",
      "creator_id",
      "fan_id",
      "control",
      "control_epoch",
      "revision",
      "event_cursor",
      "processor_consent_version",
      "deleted_at",
    ],
    UPDATE: ["revision", "event_cursor"],
  },
  "creator.message": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "author_kind",
      "author_account_id",
      "text",
      "citations",
      "delivery_state",
      "control_epoch",
      "agent_version_id",
      "agent_version_hash",
    ],
    UPDATE: ["text", "citations", "agent_version_id", "agent_version_hash"],
  },
  "creator.event": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "cursor",
      "type",
      "payload",
      "actor_account_id",
    ],
    INSERT: [
      "thread_id",
      "creator_id",
      "fan_id",
      "cursor",
      "type",
      "payload",
      "actor_account_id",
    ],
  },
  "creator.generation_sentence_provenance": {
    SELECT: [
      "generation_id",
      "sequence",
      "thread_id",
      "creator_id",
      "fan_id",
      "message_id",
      "event_id",
      "content_hash",
      "approval",
      "created_at",
      "transaction_id",
    ],
    INSERT: [
      "generation_id",
      "sequence",
      "thread_id",
      "creator_id",
      "fan_id",
      "message_id",
      "event_id",
      "content_hash",
      "approval",
      "transaction_id",
    ],
  },
} as const;

// Role/column/policy metadata alone omits an added ordinary column, default,
// trigger or foreign key. Bind those shapes and every effective executable as
// part of the independently reviewed combined catalogue, never startup approval.
export const generationOutputShapeCatalogueQuery = `SELECT jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('relation',c.oid::regclass::text,
  'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
  'partition',c.relispartition,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated)
   ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid),
   'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred) ORDER BY k.conname)
   FROM pg_constraint k WHERE k.conrelid=c.oid),
  'indexes',(SELECT jsonb_agg(jsonb_build_object('definition',pg_get_indexdef(i.indexrelid),
   'valid',i.indisvalid,'ready',i.indisready,'live',i.indislive) ORDER BY pg_get_indexdef(i.indexrelid))
   FROM pg_index i WHERE i.indrelid=c.oid),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
   'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) ORDER BY t.tgname)
   FROM pg_trigger t WHERE t.tgrelid=c.oid AND NOT t.tgisinternal)) ORDER BY c.oid::regclass::text)
  FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='creator' AND c.relname=ANY($1::text[])),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
  'owner',pg_get_userbyid(p.proowner),'definition',pg_get_functiondef(p.oid),
  'grants',(SELECT jsonb_agg(jsonb_build_object('role',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE CASE WHEN ns.nspname !~ '^pg_' AND ns.nspname<>'information_schema' AND p.prokind IN('f','p') THEN
   pg_get_userbyid(p.proowner)=$2 OR has_function_privilege($2,p.oid,'EXECUTE') ELSE false END)
) AS catalogue`;

function unavailable(cause?: unknown): never {
  const error = new DomainError(
    "generation_output_unconfigured",
    "The reviewed original conversation output is unavailable.",
    503,
  );
  if (cause !== undefined)
    Object.defineProperty(error, "cause", {
      value: cause,
      configurable: true,
      writable: true,
    });
  throw error;
}

/** Metadata guards retain their private cause. A wrapped client timeout still
 * leaves the original response uncertain; bounded/cyclic causes fail closed. */
function uncertainReadResponse(failure: unknown): boolean {
  const pending = [failure];
  const seen = new Set<Error>();
  while (pending.length) {
    const error = pending.pop();
    if (!(error instanceof Error)) continue;
    if (seen.has(error)) return true;
    seen.add(error);
    if (seen.size > 128 || error.message === "Query read timeout") return true;
    pending.push(error.cause);
    if (error instanceof AggregateError) {
      if (error.errors.length > 128) return true;
      pending.push(...error.errors);
    }
  }
  return false;
}

/** W1 owns each held transaction and sole COMMIT. This writer consumes only
 * W2's private approval and W1's genuine scope; it cannot issue either one. */
export class PreparedGenerationConversationOutput {
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly pipeline: PreparedGenerationPipeline,
    private readonly hostPool: Pool,
    private readonly custody: Readonly<{
      consumer: GenerationPurposeConsumer;
      catalogueChecksum: string;
    }>,
  ) {}

  assertComposition(input: {
    identity: GenerationIdentityAuthority;
    pipeline: PreparedGenerationPipeline;
    hostPool: Pool;
  }): void {
    invariant(
      input.identity === this.identity &&
        input.pipeline === this.pipeline &&
        input.hostPool === this.hostPool,
      "generation_output_composition_changed",
      "Use this writer's actual original issuer, pipeline and canonical host.",
    );
  }

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    pipeline: PreparedGenerationPipeline;
    workerPool: Pool;
    hostPool: Pool;
    consumer: GenerationPurposeConsumer;
    /** Reviewed outside this database, not a current readback accepted as approval. */
    catalogueChecksum: string;
    signal?: AbortSignal;
  }): Promise<PreparedGenerationConversationOutput> {
    if (
      !(input.identity instanceof GenerationIdentityAuthority) ||
      !(input.pipeline instanceof PreparedGenerationPipeline)
    )
      unavailable();
    input.identity.assertPool(input.workerPool);
    const receipt = Object.freeze({
      ...input.consumer,
      migration: Object.freeze({ ...input.consumer.migration }),
    });
    if (
      receipt.signature !== GENERATION_OUTPUT_SIGNATURE ||
      receipt.owner !== Owner ||
      receipt.migration.version !== GENERATION_OUTPUT_MIGRATION ||
      receipt.migration.checksum !== GENERATION_OUTPUT_SOURCE_SHA256 ||
      !Hash.safeParse(receipt.definitionChecksum).success ||
      !Hash.safeParse(input.catalogueChecksum).success
    )
      unavailable();
    input.identity.assertConsumerRegistered(receipt);
    const host = new Client(input.hostPool.options);
    const worker = new Client(input.workerPool.options);
    const endpoint = (client: Client) =>
      canonical({
        host: client.host,
        port: client.port,
        database: client.database,
      });
    invariant(
      host.user === "creator_runtime" &&
        worker.user === "creator_generation_worker" &&
        endpoint(host) === endpoint(worker),
      "generation_output_pool_mismatch",
      "Use the canonical host and distinct worker on the same actual database.",
    );
    const prepared = new PreparedGenerationConversationOutput(
      input.identity,
      input.pipeline,
      input.hostPool,
      Object.freeze({
        consumer: receipt,
        catalogueChecksum: input.catalogueChecksum,
      }),
    );
    const hostDatabase = await generationHostDatabase(
      input.hostPool,
      input.signal,
    );
    const client = await input.workerPool.connect();
    let started = false;
    let discard = true;
    let failure: unknown;
    let failed = false;
    const transportErrors: Error[] = [];
    const cleanupErrors: unknown[] = [];
    const onError = (error: Error) => {
      transportErrors.push(error);
      discard = true;
    };
    client.on("error", onError);
    try {
      input.signal?.throwIfAborted();
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
      started = true;
      discard = false;
      await client.query(`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true),
       set_config('idle_in_transaction_session_timeout','5000',true),
       set_config('app.account_id','',true),set_config('app.identity_session_id','',true),
       set_config('app.creator_id','',true),set_config('app.fan_id','',true),
       set_config('generation.scope_nonce','',true),set_config('generation.terminal_nonce','',true)`);
      const workerDatabase = (
        await client.query<{ databaseOid: number }>(
          'SELECT oid AS "databaseOid" FROM pg_database WHERE datname=current_database()',
        )
      ).rows[0];
      invariant(
        workerDatabase &&
          Number.isInteger(workerDatabase.databaseOid) &&
          workerDatabase.databaseOid > 0 &&
          hostDatabase.oid === workerDatabase.databaseOid,
        "generation_output_pool_mismatch",
        "Use the same actual canonical database.",
      );
      await prepared.assertCustody(client);
      input.signal?.throwIfAborted();
    } catch (error) {
      failed = true;
      failure = error;
      // A client read timeout does not prove that the original query ended.
      // Failed BEGIN already retains discard=true. Never queue cleanup SQL on
      // either uncertain source, or retry a failed ROLLBACK.
      discard ||= uncertainReadResponse(error);
    } finally {
      discard ||= transportErrors.length > 0;
      if (started && !discard) {
        try {
          await client.query("ROLLBACK");
        } catch (error) {
          discard = true;
          cleanupErrors.push(error);
        }
      }
      discard ||= transportErrors.length > 0;
      try {
        if (discard) await client.end();
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        try {
          client.release(discard);
        } catch (error) {
          cleanupErrors.push(error);
        }
        client.removeListener("error", onError);
      }
    }
    if (failed || transportErrors.length || cleanupErrors.length)
      unavailable(
        new AggregateError(
          [
            ...new Set([
              ...(failed ? [failure] : []),
              ...transportErrors,
              ...cleanupErrors,
            ]),
          ],
          "Generation output qualification and cleanup failed",
        ),
      );
    return prepared;
  }

  private async assertCustody(client: PoolClient): Promise<void> {
    const receipt = this.custody.consumer;
    try {
      await assertRegisteredMigration(client, generationOutputRepairSource);
      await this.identity.assertCatalogueInTransaction(client);
      await assertGenerationOutputCursorCatalogue(client);
      const installed = (
        await client.query<{ ready: boolean; definition: string }>(
          `SELECT session_user='creator_generation_worker' AND current_user=session_user
         AND current_setting('transaction_isolation')='read committed'
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
         AND p.prokind='f' AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
         AND pg_get_userbyid(p.proowner)=$3 AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper
         AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication AND r.rolconfig IS NULL
         AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
         AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
         AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
         AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
         AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=r.oid)
         AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
          WHERE ns.nspname !~ '^pg_' AND ns.nspname<>'information_schema' AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN
           has_table_privilege($3,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
           WHEN c.relkind='S' THEN has_sequence_privilege($3,c.oid,'SELECT,UPDATE,USAGE') ELSE false END)
         AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
          JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
          CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) privilege
          WHERE ns.nspname !~ '^pg_' AND ns.nspname<>'information_schema' AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN
           has_column_privilege($3,c.oid,a.attnum,privilege) ELSE false END
          AND NOT coalesce(($5::jsonb->(ns.nspname||'.'||c.relname)->privilege) ? a.attname,false))
         AND NOT EXISTS(SELECT FROM pg_namespace ns WHERE ns.nspname !~ '^pg_' AND ns.nspname<>'information_schema'
          AND has_schema_privilege($3,ns.oid,'CREATE'))
         AND has_function_privilege($3,to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),'EXECUTE')
         AND has_function_privilege($3,to_regprocedure('creator.generation_agent_inputs(uuid,uuid)'),'EXECUTE')
         AND has_function_privilege($3,to_regprocedure('creator.refresh_generation_output_cursor(uuid,uuid,integer,uuid)'),'EXECUTE')
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee WHERE a.privilege_type<>'EXECUTE'
          OR grantee.rolname IS NULL OR grantee.rolname NOT IN($3,'creator_generation_worker')
          OR (a.grantee<>p.proowner AND a.is_grantable))
         AND has_function_privilege(session_user,p.oid,'EXECUTE')
         AND NOT has_function_privilege('creator_runtime',p.oid,'EXECUTE') AS ready,pg_get_functiondef(p.oid) AS definition
         FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($4)`,
          [
            receipt.migration.version,
            receipt.migration.checksum,
            Owner,
            receipt.signature,
            JSON.stringify(Columns),
          ],
        )
      ).rows[0];
      if (
        installed?.ready !== true ||
        createHash("sha256").update(installed.definition).digest("hex") !==
          receipt.definitionChecksum
      )
        unavailable();
      const privileges = await generationConsumerCatalogue(client, Owner);
      const catalogue = (
        await client.query<{ catalogue: unknown }>(
          generationOutputShapeCatalogueQuery,
          [Object.keys(Columns).map((name) => name.split(".")[1]), Owner],
        )
      ).rows[0]?.catalogue;
      if (
        contentHash({ privileges, catalogue }) !==
        this.custody.catalogueChecksum
      )
        unavailable();
    } catch (error) {
      unavailable(error);
    }
  }

  async appendInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    sentence: ApprovedGenerationSentence,
  ): Promise<Readonly<{ scope: GenerationTaskScope; frame: Frame }>> {
    await this.identity.authorizeInTransaction(scope, client);
    await this.assertCustody(client);
    // No copied shape, permissive fallback or request Actor can replace W2's
    // privately issued approval. Map only the actual cited evidence afterwards.
    await this.pipeline.assertApprovedInTransaction(client, scope, sentence);
    const passages = sentence.citations.map((id) => {
      const matches = sentence.permittedPassages.filter((p) => p.id === id);
      invariant(
        matches.length === 1,
        "generation_output_evidence_changed",
        "Use each exact originally approved citation once.",
      );
      const p = matches[0]!;
      return {
        id: p.id,
        sourceId: p.sourceId,
        sourceRevision: p.sourceRevision,
        sourceHash: p.sourceHash,
      };
    });
    const approved = {
      kind: sentence.kind,
      versionId: sentence.versionId,
      versionHash: sentence.versionHash,
      pipelineHash: sentence.pipelineHash,
      contextHash: sentence.contextHash,
      fanMessageId: sentence.fanMessageId,
      epoch: sentence.epoch,
      contextRevision: sentence.contextRevision,
      providerUsageId: sentence.providerUsageId,
      citations: [...sentence.citations],
      passages,
    };
    const frame = FrameSchema.parse(
      (
        await client.query<{ frame: unknown }>(
          "SELECT creator.generation_worker_output($1,$2,$3,$4,$5::jsonb) AS frame",
          [
            scope.generationId,
            scope.workerToken,
            sentence.sequence,
            sentence.text,
            JSON.stringify(approved),
          ],
        )
      ).rows[0]?.frame,
    );
    invariant(
      frame.kind === "sentence" &&
        frame.authorKind === "ai" &&
        frame.threadId === scope.threadId &&
        frame.generationId === scope.generationId &&
        frame.messageId === scope.aiMessageId &&
        frame.epoch === scope.epoch &&
        frame.sequence === sentence.sequence &&
        frame.text === sentence.text,
      "generation_output_changed",
      "The original durable approved frame changed.",
    );
    // A genuine new same-fullXID append advances the private view exactly once.
    // A prior committed exact retry already has its current view.
    const current =
      sentence.sequence === scope.lastSequence
        ? scope
        : await this.identity.refreshAfterOutput(scope, client, {
            generationId: frame.generationId,
            messageId: frame.messageId,
            sequence: frame.sequence,
            cursor: frame.cursor,
          });
    await this.pipeline.assertApprovedInTransaction(client, current, sentence);
    await this.assertCustody(client);
    await this.identity.authorizeInTransaction(current, client);
    return Object.freeze({ scope: current, frame: Object.freeze(frame) });
  }

  /** The pipeline callback resolves only after the original W1 COMMIT. It
   * never commits locally or performs provider I/O on a held SQL connection. */
  async deliver(
    task: GenerationTask,
    sentence: ApprovedGenerationSentence,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.identity.withGeneration(
      task,
      async (client, scope) => {
        await this.appendInTransaction(client, scope, sentence);
      },
      signal,
    );
  }
}
