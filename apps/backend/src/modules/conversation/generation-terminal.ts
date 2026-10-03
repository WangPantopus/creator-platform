import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { FrameSchema, type Frame } from "@qelvora/api";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import {
  GenerationIdentityAuthority,
  type GenerationTerminalPurposeConsumer,
} from "../identity/generation-scope.js";
import {
  GenerationTerminalAuthority,
  type GenerationTerminalScope,
} from "../identity/generation-terminal.js";

// Distinct held W8 allocation. Source allocation is not installed authority.
export const GENERATION_FINALIZATION_MIGRATION =
  "0203_w3_terminal_only_finalization";
export const GENERATION_FINALIZATION_SOURCE_SHA256 =
  "8de1897f2e70f763382984459274eb7616ad7149b457811fffd90fb8b7df2e8c";
export const GENERATION_FINALIZATION_SIGNATURE =
  "creator.generation_terminal_output(uuid,uuid)";
const Owner = "creator_w3_terminal_output";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Columns = {
  "creator.generation_terminal_scope": {
    SELECT: [
      "id",
      "transaction_id",
      "backend_pid",
      "login_name",
      "generation_id",
      "custody_token",
      "mode",
      "task",
      "transitioned",
      "finalized",
      "created_at",
    ],
  },
  "creator.generation": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "state",
      "last_sequence",
      "ai_message_id",
    ],
    UPDATE: ["state", "completed_at", "worker_token", "lease_until"],
  },
  "creator.message": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "author_kind",
      "delivery_state",
    ],
    UPDATE: ["delivery_state"],
  },
  "creator.thread": {
    SELECT: ["id", "creator_id", "fan_id", "event_cursor"],
    UPDATE: ["event_cursor"],
  },
  "creator.event": {
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
} as const;

function unavailable(cause?: unknown): never {
  const error = new DomainError(
    "generation_finalization_unconfigured",
    "Reviewed conversation terminal finalization is not installed.",
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

/** Fixed original-output finalization. W1 owns this held transaction and
 * requires genuine W2/W4 settlement before COMMIT. This consumer supplies no
 * ThreadScope, Actor, input, provider call or financial result. */
export class PreparedGenerationConversationTerminal {
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly terminal: GenerationTerminalAuthority,
    private readonly hostPool: Pool,
    private readonly custody: Readonly<{
      consumer: GenerationTerminalPurposeConsumer;
      catalogueChecksum: string;
    }>,
  ) {}

  assertHostPool(pool: Pool): void {
    invariant(
      pool === this.hostPool,
      "generation_finalization_pool_mismatch",
      "Use this finalization consumer's canonical conversation host.",
    );
  }

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    terminal: GenerationTerminalAuthority;
    workerPool: Pool;
    hostPool: Pool;
    /** Independently reviewed source/install definition, never a hash read
     * from an unreviewed database and accepted as its own approval. */
    consumer: GenerationTerminalPurposeConsumer;
    /** Independently reviewed effective columns, tables, policies and schemas. */
    catalogueChecksum: string;
  }): Promise<PreparedGenerationConversationTerminal> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.terminal instanceof GenerationTerminalAuthority,
      "generation_finalization_unconfigured",
      "Genuine original-generation identity and terminal issuers are required.",
    );
    input.identity.assertPool(input.workerPool);
    input.terminal.assertPool(input.workerPool);
    const receipt = Object.freeze({
      ...input.consumer,
      migration: Object.freeze({ ...input.consumer.migration }),
    });
    invariant(
      receipt.purpose === "generation_terminal" &&
        receipt.signature === GENERATION_FINALIZATION_SIGNATURE &&
        receipt.owner === Owner &&
        receipt.migration.version === GENERATION_FINALIZATION_MIGRATION &&
        receipt.migration.checksum === GENERATION_FINALIZATION_SOURCE_SHA256 &&
        Hash.safeParse(receipt.definitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success,
      "generation_finalization_unconfigured",
      "The exact reviewed terminal-only W3 executable and catalogue are required.",
    );
    input.identity.assertTerminalConsumerRegistered(receipt);
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
      "generation_finalization_pool_mismatch",
      "Use the canonical host and distinct worker on the same actual database.",
    );
    const prepared = new PreparedGenerationConversationTerminal(
      input.identity,
      input.terminal,
      input.hostPool,
      Object.freeze({
        consumer: receipt,
        catalogueChecksum: input.catalogueChecksum,
      }),
    );
    for (const pool of [input.hostPool, input.workerPool])
      invariant(
        Number.isSafeInteger(pool.options.connectionTimeoutMillis) &&
          pool.options.connectionTimeoutMillis! > 0 &&
          pool.options.connectionTimeoutMillis! <= 5000 &&
          pool.options.pipeline !== true,
        "generation_finalization_pool_mismatch",
        "Use bounded original non-pipelined host and worker pools.",
      );
    const signal = AbortSignal.timeout(15_000);
    const client = await input.workerPool.connect();
    let discardClient = true;
    let failed = false;
    let failure: unknown;
    const transport: unknown[] = [];
    const cleanup: unknown[] = [];
    let ending: Promise<void> | undefined;
    const endSource = () =>
      (ending ??= client.end().catch((cause: unknown) => {
        cleanup.push(cause);
      }));
    const onError = (cause: Error) => {
      transport.push(cause);
      discardClient = true;
    };
    const abort = () => {
      discardClient = true;
      // Qualification reads metadata only. Close its exact original socket,
      // including an uncertain BEGIN/read; never guess a PID or queue SQL.
      void endSource();
    };
    client.on("error", onError);
    signal.addEventListener("abort", abort, { once: true });
    const bounded = (text: string) => ({ text, query_timeout: 5000 });
    try {
      signal.throwIfAborted();
      if (client.pipeline) unavailable();
      // W1's catalogue proof deliberately requires a caller-held transaction.
      // Qualification reads metadata only and must leave no scope or GUC state
      // behind for the next worker borrowing this connection.
      const begun = await client.query(
        bounded("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY"),
      );
      invariant(
        begun.command === "BEGIN",
        "generation_finalization_unconfigured",
        "The actual original read-only transaction is required.",
      );
      discardClient = false;
      signal.throwIfAborted();
      if (transport.length) throw transport[0];
      await client.query(
        bounded(`SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true),
         set_config('idle_in_transaction_session_timeout','5000',true),
         set_config('app.account_id','',true),set_config('app.identity_session_id','',true),
         set_config('app.creator_id','',true),set_config('app.fan_id','',true),
         set_config('generation.scope_nonce','',true),set_config('generation.terminal_nonce','',true)`),
      );
      const hostDatabase = (
        await input.hostPool.query<{ databaseOid: number }>(
          bounded(
            'SELECT oid AS "databaseOid" FROM pg_database WHERE datname=current_database()',
          ),
        )
      ).rows[0];
      const workerDatabase = (
        await client.query<{ databaseOid: number }>(
          bounded(
            'SELECT oid AS "databaseOid" FROM pg_database WHERE datname=current_database()',
          ),
        )
      ).rows[0];
      invariant(
        workerDatabase !== undefined &&
          Number.isSafeInteger(workerDatabase.databaseOid) &&
          workerDatabase.databaseOid > 0 &&
          hostDatabase?.databaseOid === workerDatabase.databaseOid,
        "generation_finalization_pool_mismatch",
        "Use the same actual canonical database.",
      );
      await prepared.assertCustody(client);
      signal.throwIfAborted();
      if (transport.length) throw transport[0];
      // A failed qualification rollback must also refuse the factory result.
      discardClient = true;
      const rolledBack = await client.query(bounded("ROLLBACK"));
      invariant(
        rolledBack.command === "ROLLBACK",
        "generation_finalization_unconfigured",
        "The actual metadata rollback receipt is required.",
      );
      discardClient = false;
    } catch (cause) {
      failed = true;
      failure = cause;
      // Every failed qualification closes instead of queueing another command.
      // A wrapped uncertain response or failed ROLLBACK is never retried.
      discardClient = true;
    } finally {
      signal.removeEventListener("abort", abort);
      discardClient ||= signal.aborted || transport.length > 0;
      if (discardClient || ending) await endSource();
      try {
        client.release(discardClient);
      } catch (cause) {
        cleanup.push(cause);
      } finally {
        client.removeListener("error", onError);
      }
    }
    if (failed || transport.length || cleanup.length || signal.aborted)
      unavailable(
        new AggregateError(
          [
            ...(failed ? [failure] : []),
            ...transport,
            ...cleanup,
            ...(signal.aborted ? [signal.reason] : []),
          ],
          "Original terminal metadata qualification and settlement failed",
        ),
      );
    return prepared;
  }

  /** Recheck actual live custody on the original worker client. Factory
   * qualification cannot approve a later owner, grant, policy or code change. */
  private async assertCustody(client: PoolClient): Promise<void> {
    const receipt = this.custody.consumer;
    try {
      await this.identity.assertCatalogueInTransaction(client);
      const row = (
        await client.query<{ ready: boolean; definition: string }>(
          `SELECT session_user='creator_generation_worker' AND current_user=session_user
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
         AND p.prokind='f' AND p.prosecdef AND p.provolatile='v'
         AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)=$3
         AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper AND NOT r.rolbypassrls
         AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
         AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
         AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
         AND NOT EXISTS(SELECT FROM pg_db_role_setting WHERE setrole=r.oid)
         AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
         AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
         AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=r.oid)
         AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
           AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN
            has_table_privilege($3,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') ELSE false END)
         AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
          CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS privilege
          WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
           AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN
            has_column_privilege($3,c.oid,a.attnum,privilege) ELSE false END
           AND NOT coalesce(($5::jsonb->(n.nspname||'.'||c.relname)->privilege) ? a.attname,false))
         AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
           AND CASE WHEN c.relkind='S' THEN has_sequence_privilege($3,c.oid,'USAGE,SELECT,UPDATE') ELSE false END)
         AND NOT EXISTS(SELECT FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
          AND has_schema_privilege($3,n.oid,'CREATE'))
         AND has_function_privilege($3,to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)'),'EXECUTE')
         AND NOT has_function_privilege($3,to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),'EXECUTE')
         AND NOT EXISTS(SELECT FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
          WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND f.proowner<>r.oid
           AND f.oid<>to_regprocedure('creator.generation_terminal_matches(uuid,uuid,boolean)')
           AND ((f.prosecdef AND has_function_privilege($3,f.oid,'EXECUTE'))
            OR EXISTS(SELECT FROM aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
             WHERE a.grantee=r.oid AND a.privilege_type='EXECUTE')))
         AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          LEFT JOIN pg_roles grantee ON grantee.oid=a.grantee
          WHERE a.privilege_type<>'EXECUTE' OR grantee.rolname IS NULL
           OR grantee.rolname NOT IN($3,'creator_generation_worker')
           OR (a.grantee<>p.proowner AND a.is_grantable))
         AND has_function_privilege(session_user,p.oid,'EXECUTE')
         AND NOT has_function_privilege('creator_runtime',p.oid,'EXECUTE')
         AND (SELECT count(*)=5 FROM pg_class c WHERE c.oid=ANY(ARRAY[
          to_regclass('creator.generation_terminal_scope'),to_regclass('creator.generation'),
          to_regclass('creator.message'),to_regclass('creator.thread'),to_regclass('creator.event')])
          AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity
          AND pg_get_userbyid(c.relowner)='creator_owner') AS ready,
         pg_get_functiondef(p.oid) AS definition
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
        row?.ready !== true ||
        createHash("sha256").update(row.definition).digest("hex") !==
          receipt.definitionChecksum ||
        contentHash(await generationConsumerCatalogue(client, Owner)) !==
          this.custody.catalogueChecksum
      )
        throw new Error("Unreviewed W3 terminal-only custody");
    } catch (cause) {
      unavailable(cause);
    }
  }

  /** Caller awaits this inside W1 withTerminal. The issuer then requires the
   * real original journal/cost settlement on this same scope and client. */
  async finalizeInTransaction(
    client: PoolClient,
    scope: GenerationTerminalScope,
  ): Promise<Readonly<Frame>> {
    await this.terminal.authorizeInTransaction(scope, client);
    await this.assertCustody(client);
    const raw = (
      await client.query<{ frame: unknown }>(
        "SELECT creator.generation_terminal_output($1,$2) AS frame",
        [scope.generationId, scope.custodyToken],
      )
    ).rows[0]?.frame;
    let frame: Frame;
    try {
      frame = FrameSchema.parse(raw);
    } catch {
      throw new DomainError(
        "generation_finalization_unavailable",
        "The original conversation finalization is unavailable.",
        503,
      );
    }
    invariant(
      frame.threadId === scope.threadId &&
        frame.epoch === scope.epoch &&
        frame.generationId === scope.generationId &&
        frame.messageId === scope.aiMessageId &&
        frame.sequence === scope.lastSequence &&
        frame.kind ===
          (scope.targetState === "delivered" ? "delivered" : "interrupted") &&
        frame.authorKind === "ai" &&
        frame.text === "" &&
        frame.control === undefined,
      "generation_finalization_changed",
      "The captured original terminal frame changed.",
    );
    await this.assertCustody(client);
    await this.terminal.authorizeInTransaction(scope, client, true);
    return Object.freeze(frame);
  }
}
