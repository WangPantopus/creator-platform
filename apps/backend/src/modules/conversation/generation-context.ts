import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { generationConsumerCatalogue } from "../../core/purpose-catalogue.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import type { ThreadSnapshot } from "../agent/pipeline.js";

export const GENERATION_CONTEXT_MIGRATION =
  "0179_w3_generation_purpose_consumers";
export const GENERATION_CONTEXT_SOURCE_SHA256 =
  "9449f7f9254aa1c9c77713b1683d5c85076b357f13e573882ee5d2d03d1715e0";
export const GENERATION_CONTEXT_SIGNATURE =
  "creator.generation_conversation_context(uuid,uuid)";
export const generationContextProfileBoundSource = Object.freeze({
  owner: "W3",
  name: "w3_generation_context_profile_bound",
  path: "apps/backend/src/modules/conversation/migrations/pending_w3_generation_context_profile_bound.sql",
  checksum: "b0fe4643e110a4a6b752ae44847543c7cb8897bdd2a56c2daa58574b9c58536e",
});
const owner = "creator_generation_conversation_context";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Columns = {
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
  "creator.thread": {
    SELECT: [
      "id",
      "creator_id",
      "fan_id",
      "revision",
      "control_epoch",
      "off_the_record",
      "intro_shared",
      "deleted_at",
    ],
  },
  "creator.message": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "author_kind",
      "text",
      "sequence",
      "off_the_record",
      "delivery_state",
    ],
  },
  "creator.memory": {
    SELECT: [
      "id",
      "thread_id",
      "creator_id",
      "fan_id",
      "text",
      "semantic_key",
      "state",
      "sensitive_category",
      "consent_id",
      "created_at",
    ],
  },
  "creator.memory_consent": {
    SELECT: ["id", "thread_id", "creator_id", "fan_id", "withdrawn_at"],
  },
  "creator.memory_exclusion": {
    SELECT: ["thread_id", "creator_id", "fan_id", "semantic_key"],
  },
  "creator.fan_profile": { SELECT: ["id", "account_id", "intro"] },
} as const;
const Context = z.strictObject({
  generationId: z.uuid(),
  threadId: z.uuid(),
  creatorId: z.uuid(),
  fanId: z.uuid(),
  acceptedText: z.string().min(1).max(10000),
  snapshot: z.strictObject({
    revision: z.int().nonnegative(),
    epoch: z.int().nonnegative(),
    messages: z.array(z.string().max(262144)).max(30),
    memory: z.array(z.string().max(2000)).max(100),
    intro: z.string().max(2000).nullable(),
    offTheRecord: z.boolean(),
    excludedKeys: z.array(z.string().max(256)).max(1000),
    provenanceMessageId: z.uuid(),
  }),
});
export type GenerationConversationContext = Readonly<{
  generationId: string;
  threadId: string;
  creatorId: string;
  fanId: string;
  acceptedText: string;
  snapshot: Readonly<ThreadSnapshot>;
}>;

/** A read consumer of W1's actual worker purpose, never a ThreadScope or a
 * source licence/provider admission. Each stage obtains a new current read. */
export class PreparedGenerationConversationContext {
  private readonly issued = new WeakMap<
    GenerationConversationContext,
    { scope: GenerationTaskScope; client: PoolClient; hash: string }
  >();
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly hostPool: Pool,
    private readonly custody: Readonly<{
      consumer: GenerationPurposeConsumer;
      catalogueChecksum: string;
    }>,
  ) {}

  assertHostPool(pool: Pool): void {
    invariant(
      pool === this.hostPool,
      "generation_context_pool_mismatch",
      "Use this context consumer's actual canonical conversation host.",
    );
  }

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    workerPool: Pool;
    hostPool: Pool;
    /** Reviewed source/install receipt; a database cannot approve its own
     * executable by reading its current function hash back into this field. */
    consumer: GenerationPurposeConsumer;
    /** Independently reviewed effective role, columns, policies and schemas. */
    catalogueChecksum: string;
  }): Promise<PreparedGenerationConversationContext> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority,
      "generation_context_unconfigured",
      "The genuine generation purpose issuer is required.",
    );
    input.identity.assertPool(input.workerPool);
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
      "generation_context_pool_mismatch",
      "Use the canonical host and distinct worker on the same database endpoint.",
    );
    const receipt = Object.freeze({
      ...input.consumer,
      migration: Object.freeze({ ...input.consumer.migration }),
    });
    invariant(
      receipt.signature === GENERATION_CONTEXT_SIGNATURE &&
        receipt.owner === owner &&
        receipt.migration.version === GENERATION_CONTEXT_MIGRATION &&
        receipt.migration.checksum === GENERATION_CONTEXT_SOURCE_SHA256 &&
        Hash.safeParse(receipt.definitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success,
      "generation_context_unconfigured",
      "The exact reviewed W3 context executable and catalogue are required.",
    );
    input.identity.assertConsumerRegistered(receipt);
    const prepared = new PreparedGenerationConversationContext(
      input.identity,
      input.hostPool,
      Object.freeze({
        consumer: receipt,
        catalogueChecksum: input.catalogueChecksum,
      }),
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
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED READ ONLY");
      started = true;
      discard = false;
      if (transportErrors.length) throw transportErrors[0];
      await client.query(
        `SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','1000',true),
         set_config('idle_in_transaction_session_timeout','5000',true),
         set_config('app.account_id','',true),set_config('app.identity_session_id','',true),
         set_config('app.creator_id','',true),set_config('app.fan_id','',true),
         set_config('generation.scope_nonce','',true),set_config('generation.terminal_nonce','',true)`,
      );
      const canonicalDatabase = (
        await input.hostPool.query<{ databaseOid: number }>(
          'SELECT oid AS "databaseOid" FROM pg_database WHERE datname=current_database()',
        )
      ).rows[0];
      const workerDatabase = (
        await client.query<{ databaseOid: number }>(
          'SELECT oid AS "databaseOid" FROM pg_database WHERE datname=current_database()',
        )
      ).rows[0];
      invariant(
        workerDatabase !== undefined &&
          Number.isInteger(workerDatabase.databaseOid) &&
          workerDatabase.databaseOid > 0 &&
          canonicalDatabase?.databaseOid === workerDatabase.databaseOid,
        "generation_context_pool_mismatch",
        "Use the same actual canonical database.",
      );
      await prepared.assertCustody(client);
    } catch (error) {
      failure = error;
      failed = true;
      // A purpose guard may wrap an uncertain client response. Close this
      // exact read-only source instead of submitting more transaction SQL.
      discard = true;
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
    if (failed || transportErrors.length || cleanupErrors.length) {
      const unavailable = new DomainError(
        "generation_context_unconfigured",
        "The reviewed generation context purpose is not installed.",
        503,
      );
      const causes = new AggregateError(
        [
          ...new Set([
            ...(failed ? [failure] : []),
            ...transportErrors,
            ...cleanupErrors,
          ]),
        ],
        "Generation context qualification and cleanup failed",
      );
      Object.defineProperty(unavailable, "cause", {
        value: causes,
        configurable: true,
        writable: true,
      });
      throw unavailable;
    }
    return prepared;
  }

  /** Factory qualification cannot approve later role, policy or code drift. */
  private async assertCustody(client: PoolClient): Promise<void> {
    const receipt = this.custody.consumer;
    try {
      await assertRegisteredMigration(
        client,
        generationContextProfileBoundSource,
      );
      await this.identity.assertCatalogueInTransaction(client);
      const installed = (
        await client.query<{ ready: boolean; definition: string }>(
          `SELECT session_user='creator_generation_worker' AND current_user=session_user
           AND current_setting('transaction_isolation')='read committed'
           AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND EXISTS(SELECT FROM pg_policy policy
            WHERE policy.polrelid=to_regclass('creator.fan_profile')
             AND policy.polname='w3_generation_context_profile_bound'
             AND policy.polcmd='r' AND NOT policy.polpermissive
             AND policy.polroles=ARRAY[r.oid])
           AND p.prokind='f' AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
           AND pg_get_userbyid(p.proowner)=$3 AND NOT r.rolcanlogin AND NOT r.rolinherit
           AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
           AND NOT r.rolreplication AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
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
           AND has_function_privilege($3,to_regprocedure('creator.generation_scope_matches(uuid,uuid)'),'EXECUTE')
           AND NOT EXISTS(SELECT FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace
            WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND f.proowner<>r.oid
             AND f.oid<>to_regprocedure('creator.generation_scope_matches(uuid,uuid)')
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
           AND (SELECT count(*)=7 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['generation_worker_scope','thread','message','memory','memory_consent','memory_exclusion','fan_profile'])
             AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner') AS ready,
           pg_get_functiondef(p.oid) AS definition
           FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($4)`,
          [
            receipt.migration.version,
            receipt.migration.checksum,
            owner,
            receipt.signature,
            JSON.stringify(Columns),
          ],
        )
      ).rows[0];
      if (
        installed?.ready !== true ||
        createHash("sha256").update(installed.definition).digest("hex") !==
          receipt.definitionChecksum ||
        contentHash(await generationConsumerCatalogue(client, owner)) !==
          this.custody.catalogueChecksum
      )
        throw new Error("Unreviewed generation context executable");
    } catch (cause) {
      const unavailable = new DomainError(
        "generation_context_unconfigured",
        "The reviewed generation context purpose is not installed.",
        503,
      );
      Object.defineProperty(unavailable, "cause", {
        value: cause,
        configurable: true,
        writable: true,
      });
      throw unavailable;
    }
  }

  async currentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
  ): Promise<GenerationConversationContext> {
    await this.identity.authorizeInTransaction(scope, client);
    await this.assertCustody(client);
    const raw = (
      await client.query<{ context: unknown }>(
        "SELECT creator.generation_conversation_context($1,$2) AS context",
        [scope.generationId, scope.workerToken],
      )
    ).rows[0]?.context;
    let value: z.infer<typeof Context>;
    try {
      value = Context.parse(raw);
    } catch {
      throw new DomainError(
        "generation_context_unavailable",
        "The current accepted conversation context is unavailable.",
        503,
      );
    }
    invariant(
      value.generationId === scope.generationId &&
        value.threadId === scope.threadId &&
        value.creatorId === scope.creatorId &&
        value.fanId === scope.fanId &&
        value.snapshot.epoch === scope.epoch &&
        value.snapshot.revision ===
          scope.contextRevision + scope.lastSequence &&
        value.snapshot.provenanceMessageId === scope.fanMessageId,
      "generation_context_changed",
      "The accepted conversation context ended or changed.",
    );
    Object.freeze(value.snapshot.messages);
    Object.freeze(value.snapshot.memory);
    Object.freeze(value.snapshot.excludedKeys);
    Object.freeze(value.snapshot);
    Object.freeze(value);
    await this.assertCustody(client);
    await this.identity.authorizeInTransaction(scope, client);
    this.issued.set(value, { scope, client, hash: contentHash(value) });
    return value;
  }

  /** Retained facts are provider input, never authority for another transaction. */
  async assertCurrentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    context: GenerationConversationContext,
  ): Promise<void> {
    await this.identity.authorizeInTransaction(scope, client);
    const issued = this.issued.get(context);
    invariant(
      issued?.scope === scope &&
        issued.client === client &&
        issued.hash === contentHash(context),
      "generation_context_changed",
      "Use the actual context issued on this generation transaction.",
    );
    const current = await this.currentInTransaction(client, scope);
    invariant(
      contentHash(current) === issued.hash,
      "generation_context_changed",
      "The current conversation context changed.",
    );
  }
}
