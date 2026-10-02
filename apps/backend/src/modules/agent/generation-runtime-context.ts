import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  AgentAudience,
  DraftConfig,
} from "../../../../../packages/api/src/agent/contracts.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTask,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import { PreparedGenerationConversationContext } from "../conversation/generation-context.js";
import { PreparedGenerationAgentInputs } from "./generation-inputs.js";
import {
  PreparedGenerationProviderAccounting,
  type GenerationProviderAttempt,
} from "./generation-provider-usage.js";
import type { AgentModel } from "./model.js";
import { compile } from "./pipeline.js";
import { AgentService } from "./service.js";

export const GENERATION_RETRIEVAL_MIGRATION =
  "0104_w2_generation_retrieval_context";
export const GENERATION_RETRIEVAL_SIGNATURE =
  "creator.generation_agent_runtime_context(uuid,uuid,text,text)";
const owner = "creator_w2_generation_retrieval";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const RuntimeContext = z.strictObject({
  creatorId: z.uuid(),
  creatorName: z.string().min(1).max(200),
  compiledHash: Hash,
  pipelineHash: Hash,
  audience: z.strictObject({
    revision: Hash,
    tierIds: z.array(z.uuid()).max(1000),
    groupIds: z.array(z.uuid()).length(0),
    validUntil: z.iso.datetime({ offset: true }),
  }),
  passages: z
    .array(
      z.strictObject({
        id: z.uuid(),
        sourceId: z.uuid(),
        sourceRevision: z.int().positive(),
        title: z.string().max(500),
        text: z.string().min(1).max(262144),
        start: z.int().nonnegative(),
        end: z.int().positive(),
        audience: AgentAudience,
      }),
    )
    .max(4),
  styleExamples: z.array(z.string().max(20000)).max(5),
});
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export type GenerationRuntimeContext = DeepReadonly<
  z.infer<typeof RuntimeContext>
>;
/** Only this prepared consumer can issue a query embedding. There is no vector
 * or eligibility field on a request/worker task that can supply this custody. */
export type GenerationQueryEmbedding = Readonly<{
  generationId: string;
  workerToken: string;
}>;
function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Actual stored-source retrieval, independent of interactive ThreadScope.
 * The fixed SQL function applies the genuine W4 audience and W5 origin before
 * distance LIMIT. Each read remains within W1's current held callback. */
export class PreparedGenerationRuntimeContext {
  private readonly embeddings = new WeakMap<
    GenerationQueryEmbedding,
    {
      vector: readonly number[];
      acceptedHash: string;
      sourceMessageId: string;
      compiledHash: string;
    }
  >();
  private readonly issued = new WeakMap<
    GenerationRuntimeContext,
    {
      scope: GenerationTaskScope;
      client: PoolClient;
      embedding: GenerationQueryEmbedding;
      hash: string;
    }
  >();
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly service: AgentService,
    private readonly model: AgentModel,
    private readonly inputs: PreparedGenerationAgentInputs,
    private readonly context: PreparedGenerationConversationContext,
    private readonly accounting: PreparedGenerationProviderAccounting,
  ) {}

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    workerPool: Pool;
    service: AgentService;
    inputs: PreparedGenerationAgentInputs;
    context: PreparedGenerationConversationContext;
    accounting: PreparedGenerationProviderAccounting;
    consumer: GenerationPurposeConsumer;
    /** Exact source-reviewed effective ACL/policy catalogue receipt. Read-back
     * hashes cannot approve an unreviewed database's own authority. */
    catalogueChecksum: string;
  }): Promise<PreparedGenerationRuntimeContext> {
    const model = input.service.pipeline.model;
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.service instanceof AgentService &&
        input.inputs instanceof PreparedGenerationAgentInputs &&
        input.context instanceof PreparedGenerationConversationContext &&
        input.accounting instanceof PreparedGenerationProviderAccounting &&
        model !== null &&
        model.pricingConfigured,
      "generation_retrieval_unconfigured",
      "Actual current input, conversation, provider accounting and configured model consumers are required.",
    );
    input.identity.assertPool(input.workerPool);
    input.inputs.assertHostPool(input.service.repository.pool);
    input.context.assertHostPool(input.service.repository.pool);
    input.accounting.assertComposition(input);
    const receipt = input.consumer;
    input.identity.assertConsumerRegistered(receipt);
    invariant(
      receipt.owner === owner &&
        receipt.signature === GENERATION_RETRIEVAL_SIGNATURE &&
        receipt.migration.version === GENERATION_RETRIEVAL_MIGRATION &&
        Hash.safeParse(receipt.migration.checksum).success &&
        Hash.safeParse(receipt.definitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success,
      "generation_retrieval_unconfigured",
      "The exact reviewed stored-source retrieval executable and catalogue are required.",
    );
    try {
      const row = (
        await input.workerPool.query<{ ready: boolean; definition: string }>(
          `SELECT session_user='creator_generation_worker' AND current_user=session_user
           AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
           AND r.rolname=$3 AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper
           AND NOT r.rolbypassrls AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication
           AND (r.rolconfig IS NULL OR cardinality(r.rolconfig)=0)
           AND NOT EXISTS(SELECT FROM pg_auth_members WHERE member=r.oid OR roleid=r.oid)
           AND NOT EXISTS(SELECT FROM pg_namespace WHERE nspowner=r.oid)
           AND NOT EXISTS(SELECT FROM pg_class WHERE relowner=r.oid)
           AND (SELECT count(*)=1 FROM pg_proc WHERE proowner=r.oid)
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
           AND NOT EXISTS(SELECT FROM aclexplode(p.proacl) a LEFT JOIN pg_roles recipient ON recipient.oid=a.grantee
            WHERE a.privilege_type<>'EXECUTE' OR recipient.rolname IS NULL
             OR recipient.rolname NOT IN('creator_w2_generation_retrieval','creator_generation_worker')
             OR (a.grantee<>p.proowner AND a.is_grantable))
           AND has_function_privilege(session_user,p.oid,'EXECUTE')
           AND (SELECT count(*)=5 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['generation_worker_scope','creator_profile','ai_source','ai_chunk','ai_style_embedding'])
             AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
           AS ready,pg_get_functiondef(p.oid) AS definition
           FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid=to_regprocedure($4)`,
          [
            receipt.migration.version,
            receipt.migration.checksum,
            owner,
            receipt.signature,
          ],
        )
      ).rows[0];
      const catalogue = await generationRetrievalCatalogue(input.workerPool);
      if (
        row?.ready !== true ||
        createHash("sha256").update(row.definition).digest("hex") !==
          receipt.definitionChecksum ||
        contentHash(catalogue) !== input.catalogueChecksum
      )
        throw new Error("Unreviewed retrieval custody");
    } catch {
      throw new DomainError(
        "generation_retrieval_unconfigured",
        "Reviewed current stored-source retrieval is unavailable.",
        503,
      );
    }
    return new PreparedGenerationRuntimeContext(
      input.identity,
      input.service,
      model,
      input.inputs,
      input.context,
      input.accounting,
    );
  }

  async embedAcceptedMessage(
    task: GenerationTask,
    attempt: GenerationProviderAttempt,
    signal: AbortSignal,
  ): Promise<GenerationQueryEmbedding> {
    const accepted = await this.identity.withGeneration(
      task,
      async (client, scope) => {
        const context = await this.context.currentInTransaction(client, scope);
        const facts = await this.inputs.currentInTransaction(client, scope);
        invariant(
          facts.version.compiledHash === attempt.compiledHash,
          "generation_inputs_changed",
          "The accepted embedding must use this attempt's current version.",
        );
        await this.inputs.authorizeInTransaction(facts, scope, client);
        await this.context.assertCurrentInTransaction(client, scope, context);
        return {
          text: context.acceptedText,
          sourceMessageId: scope.fanMessageId,
          acceptedHash: contentHash({ text: context.acceptedText }),
          compiledHash: facts.version.compiledHash,
        };
      },
    );
    // Admission commits before actual provider I/O; reported usage persists even
    // for invalid vectors/cancellation. No caller text or synthetic vector enters.
    const result = await this.accounting.withUsage(
      task,
      attempt,
      "reply",
      signal,
      () => this.model.embed([accepted.text], signal),
    );
    const vector = z
      .array(z.array(z.number().finite()).min(16).max(4096))
      .length(1)
      .parse(result.vectors)[0]!;
    const embedding = Object.freeze({
      generationId: task.generationId,
      workerToken: task.workerToken,
    });
    this.embeddings.set(embedding, {
      vector: Object.freeze([...vector]),
      acceptedHash: accepted.acceptedHash,
      sourceMessageId: accepted.sourceMessageId,
      compiledHash: accepted.compiledHash,
    });
    return embedding;
  }

  private async read(
    client: PoolClient,
    scope: GenerationTaskScope,
    embedding: GenerationQueryEmbedding,
  ): Promise<GenerationRuntimeContext> {
    const query = this.embeddings.get(embedding);
    invariant(
      query &&
        embedding.generationId === scope.generationId &&
        embedding.workerToken === scope.workerToken &&
        query.sourceMessageId === scope.fanMessageId,
      "generation_query_embedding_required",
      "Use this actual accepted turn's privately issued model embedding.",
    );
    await this.identity.authorizeInTransaction(scope, client);
    const conversation = await this.context.currentInTransaction(client, scope);
    invariant(
      query.acceptedHash === contentHash({ text: conversation.acceptedText }),
      "generation_query_embedding_changed",
      "The privately embedded accepted message changed.",
    );
    const facts = await this.inputs.currentInTransaction(client, scope);
    const raw = (
      await client.query<{ context: unknown }>(
        "SELECT creator.generation_agent_runtime_context($1,$2,$3,$4) AS context",
        [
          scope.generationId,
          scope.workerToken,
          JSON.stringify(query.vector),
          this.model.embeddingModel,
        ],
      )
    ).rows[0]?.context;
    const value = RuntimeContext.parse(raw);
    invariant(
      value.creatorId === scope.creatorId &&
        value.compiledHash === query.compiledHash &&
        value.compiledHash === facts.version.compiledHash &&
        value.pipelineHash === this.service.pipeline.fingerprint &&
        compile(
          DraftConfig.parse(facts.version.configuration),
          value.creatorName,
        ).hash === value.compiledHash &&
        Date.parse(value.audience.validUntil) > Date.now() &&
        new Set(value.passages.map((p) => p.id)).size ===
          value.passages.length &&
        value.passages.every(
          (passage) =>
            passage.end > passage.start &&
            facts.version.sourceSet.some(
              (source) =>
                source.id === passage.sourceId &&
                source.revision === passage.sourceRevision,
            ),
        ),
      "generation_retrieval_changed",
      "Current creator identity, version, allowance and stored passages are required.",
    );
    await this.inputs.authorizeInTransaction(facts, scope, client);
    await this.context.assertCurrentInTransaction(client, scope, conversation);
    await this.identity.authorizeInTransaction(scope, client);
    return freeze(value);
  }

  async currentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    embedding: GenerationQueryEmbedding,
  ): Promise<GenerationRuntimeContext> {
    const value = await this.read(client, scope, embedding);
    this.issued.set(value, {
      client,
      scope,
      embedding,
      hash: contentHash(value),
    });
    return value;
  }

  async assertCurrentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    value: GenerationRuntimeContext,
  ): Promise<void> {
    const binding = this.issued.get(value);
    invariant(
      binding?.client === client &&
        binding.scope === scope &&
        binding.hash === contentHash(value),
      "generation_retrieval_required",
      "Use this same held client's current issued stored-source context.",
    );
    invariant(
      contentHash(await this.read(client, scope, binding.embedding)) ===
        binding.hash,
      "generation_retrieval_changed",
      "Stored-source context changed during this generation stage.",
    );
  }
}

/** Full effective relation/column ACLs, sequence and schema grants, executable
 * recipients and every applicable PUBLIC/owner RLS policy. A new wider policy
 * cannot hide behind an expected policy name. Used only against reviewed bytes. */
export async function generationRetrievalCatalogue(pool: Pool) {
  return generationConsumerCatalogue(pool, owner);
}

/** Shared read-only catalogue for W2's independently reviewed fixed consumers. */
export async function generationConsumerCatalogue(pool: Pool, role: string) {
  const relations = (
    await pool.query(
      `SELECT n.nspname AS schema,c.relname AS relation,c.relkind,pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity,c.relforcerowsecurity,
       ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) privilege
        WHERE CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_table_privilege($1,c.oid,privilege) ELSE false END ORDER BY privilege) AS table_privileges,
       ARRAY(SELECT privilege FROM unnest(ARRAY['SELECT','UPDATE','USAGE']) privilege
        WHERE CASE WHEN c.relkind='S' THEN has_sequence_privilege($1,c.oid,privilege) ELSE false END ORDER BY privilege) AS sequence_privileges,
       coalesce((SELECT jsonb_agg(jsonb_build_object('column',a.attname,'privilege',privilege) ORDER BY a.attname,privilege)
        FROM pg_attribute a CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) privilege
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
         AND CASE WHEN c.relkind IN('r','p','v','m','f') THEN has_column_privilege($1,c.oid,a.attnum,privilege) ELSE false END),'[]'::jsonb) AS columns,
       coalesce((SELECT jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,
         'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r ORDER BY r),
         'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) ORDER BY p.polname)
        FROM pg_policy p WHERE p.polrelid=c.oid AND (0=ANY(p.polroles) OR (SELECT oid FROM pg_roles WHERE rolname=$1)=ANY(p.polroles))),'[]'::jsonb) AS policies
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'
       ORDER BY n.nspname,c.relname,c.relkind`,
      [role],
    )
  ).rows;
  const schemas = (
    await pool.query(
      `SELECT nspname AS schema,has_schema_privilege($1,oid,'USAGE') AS usage,
       has_schema_privilege($1,oid,'CREATE') AS create FROM pg_namespace
       WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY nspname`,
      [role],
    )
  ).rows;
  return { relations, schemas };
}
