import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import type { ThreadSnapshot } from "../agent/pipeline.js";

export const GENERATION_CONTEXT_MIGRATION =
  "0179_w3_generation_purpose_consumers";
export const GENERATION_CONTEXT_SIGNATURE =
  "creator.generation_conversation_context(uuid,uuid)";
const owner = "creator_generation_conversation_context";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
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
    const receipt = input.consumer;
    invariant(
      receipt.signature === GENERATION_CONTEXT_SIGNATURE &&
        receipt.owner === owner &&
        receipt.migration.version === GENERATION_CONTEXT_MIGRATION &&
        Hash.safeParse(receipt.migration.checksum).success &&
        Hash.safeParse(receipt.definitionChecksum).success,
      "generation_context_unconfigured",
      "The exact reviewed W3 context consumer is required.",
    );
    try {
      const installed = (
        await input.workerPool.query<{
          ready: boolean;
          definition: string;
          database: string;
          databaseOid: number;
        }>(
          `SELECT current_database() AS database,(SELECT oid FROM pg_database WHERE datname=current_database()) AS "databaseOid",
           session_user='creator_generation_worker' AND current_user=session_user
           AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
           AND pg_get_userbyid(p.proowner)=$3 AND NOT r.rolcanlogin AND NOT r.rolinherit
           AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole
           AND NOT r.rolreplication AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
           AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
           AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
           AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
           AND has_function_privilege(session_user,p.oid,'EXECUTE')
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
          ],
        )
      ).rows[0];
      const canonicalDatabase = (
        await input.hostPool.query<{ database: string; databaseOid: number }>(
          'SELECT current_database() AS database,(SELECT oid FROM pg_database WHERE datname=current_database()) AS "databaseOid"',
        )
      ).rows[0];
      if (
        installed?.ready !== true ||
        installed.database !== canonicalDatabase?.database ||
        installed.databaseOid !== canonicalDatabase.databaseOid ||
        createHash("sha256").update(installed.definition).digest("hex") !==
          receipt.definitionChecksum
      )
        throw new Error("Unreviewed generation context executable");
    } catch {
      throw new DomainError(
        "generation_context_unconfigured",
        "The reviewed generation context purpose is not installed.",
        503,
      );
    }
    return new PreparedGenerationConversationContext(
      input.identity,
      input.hostPool,
    );
  }

  async currentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
  ): Promise<GenerationConversationContext> {
    await this.identity.authorizeInTransaction(scope, client);
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
