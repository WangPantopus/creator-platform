import { createHash } from "node:crypto";
import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  AgentAudience,
  DraftConfig,
  LicenseRequest,
} from "../../../../../packages/api/src/agent/contracts.js";
import { canonical, contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { PreparedContentGenerationOrigins } from "../content/generation-origin.js";
import { generationHostDatabase } from "../identity/generation-host-database.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import { AgentService } from "./service.js";
import {
  assertGenerationConsumerCustody,
  type GenerationConsumerCustody,
} from "./generation-consumer-catalogue.js";

export const GENERATION_INPUT_MIGRATION = "0180_w2_generation_input_consumers";
export const GENERATION_INPUT_SIGNATURE =
  "creator.generation_agent_inputs(uuid,uuid)";
const owner = "creator_w2_generation_input";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
// Persisted published configuration is complete. Draft defaults must not
// silently reinterpret a malformed stored version under its compiled hash.
const StoredConfiguration = z.preprocess((value) => {
  const parsed = DraftConfig.safeParse(value);
  return parsed.success && canonical(value) === canonical(parsed.data)
    ? value
    : undefined;
}, DraftConfig);
const SourceIdentity = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  hash: Hash,
});
const SourceProof = SourceIdentity.extend({
  origin: z.enum([
    "manual_text",
    "manual_upload",
    "interview",
    "youtube_caption",
    "platform_export",
  ]),
  originReference: z.string().max(500).nullable(),
  audience: AgentAudience,
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
});
const Facts = z.strictObject({
  creatorId: z.uuid(),
  creatorAccountId: z.uuid(),
  version: z.strictObject({
    id: z.uuid(),
    compiledHash: Hash,
    pipelineHash: Hash,
    configuration: StoredConfiguration,
    compiledPrefix: z.string().max(262144),
    sourceSet: z.array(SourceIdentity).max(1000),
  }),
  license: LicenseRequest.extend({
    state: z.enum(["active", "revoked", "suspended"]),
  }),
  sources: z.array(SourceProof).max(1000),
  status: z
    .strictObject({
      text: z.string().max(2000),
      expiresAt: z.iso.datetime({ offset: true }),
    })
    .nullable(),
  sponsors: z
    .array(
      z.strictObject({
        id: z.uuid(),
        brand: z.string().max(80),
        aliases: z.array(z.string().max(80)).max(20),
        expiresAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(64),
});
type DeepReadonly<T> = T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T;
export type GenerationAgentFacts = DeepReadonly<z.infer<typeof Facts>>;
function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export type GenerationAILicenseContext = Readonly<{
  inputs: PreparedGenerationAgentInputs;
  scope: GenerationTaskScope;
  facts: GenerationAgentFacts;
}>;

/** Server-only current compiled inputs for a genuinely accepted worker turn.
 * No provider admission, audience, Actor, consent or ThreadScope is minted.
 * Private inputs never leave the purpose callback without current licence.
 */
export class PreparedGenerationAgentInputs {
  private readonly licensed = new WeakSet<GenerationAgentFacts>();
  private readonly issued = new WeakMap<
    GenerationAgentFacts,
    { scope: GenerationTaskScope; client: PoolClient; hash: string }
  >();
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly service: AgentService,
    private readonly origins: PreparedContentGenerationOrigins | undefined,
    private readonly custody: GenerationConsumerCustody,
  ) {}

  assertHostPool(pool: Pool): void {
    invariant(
      pool === this.service.repository.pool,
      "generation_input_pool_mismatch",
      "Use the actual canonical Creator AI host pool.",
    );
  }

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    workerPool: Pool;
    service: AgentService;
    /** Actual source-reviewed SQL install/function definition receipt, not a
     * hash read back from an unreviewed database and accepted as its own proof. */
    consumer: GenerationPurposeConsumer;
    /** Independently reviewed effective permissions and RLS catalogue. */
    catalogueChecksum: string;
    origins?: PreparedContentGenerationOrigins;
    signal?: AbortSignal;
  }): Promise<PreparedGenerationAgentInputs> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.service instanceof AgentService,
      "generation_inputs_unconfigured",
      "Genuine worker identity and canonical Creator AI are required.",
    );
    input.identity.assertPool(input.workerPool);
    if (input.origins !== undefined) {
      invariant(
        input.origins instanceof PreparedContentGenerationOrigins,
        "generation_source_origin_unconfigured",
        "Use the original prepared Content publication and reuse authority.",
      );
      input.origins.assertComposition(input.identity, input.workerPool);
    }
    const host = new Client(input.service.repository.pool.options);
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
      "generation_input_pool_mismatch",
      "The canonical host and distinct worker must use the same database endpoint.",
    );
    const receipt = Object.freeze({
      ...input.consumer,
      migration: Object.freeze({ ...input.consumer.migration }),
    });
    input.identity.assertConsumerRegistered(receipt);
    invariant(
      receipt.signature === GENERATION_INPUT_SIGNATURE &&
        receipt.owner === owner &&
        receipt.migration.version === GENERATION_INPUT_MIGRATION &&
        Hash.safeParse(receipt.migration.checksum).success &&
        Hash.safeParse(receipt.definitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success,
      "generation_inputs_unconfigured",
      "The exact reviewed W2 generation input consumer is required.",
    );
    const custody: GenerationConsumerCustody = Object.freeze({
      owner,
      consumers: Object.freeze([receipt]),
      catalogueChecksum: input.catalogueChecksum,
      callers: Object.freeze([
        "creator_w2_generation_journal",
        "creator_w2_generation_retrieval",
        "creator_w2_generation_guardrail",
        "creator_w2_generation_metadata",
        "creator_w3_generation_output",
      ]),
      dependencies: Object.freeze([
        "creator.generation_scope_matches(uuid,uuid)",
        "creator.generation_allowance_audience(uuid,uuid)",
        "creator.generation_content_origins(uuid,uuid,jsonb)",
      ]),
    });
    try {
      input.signal?.throwIfAborted();
      await assertGenerationConsumerCustody(
        input.workerPool,
        custody,
        input.signal,
      );
      input.signal?.throwIfAborted();
      const installed = (
        await input.workerPool.query<{
          ready: boolean;
          definition: string;
          database: string;
          database_oid: number;
        }>(
          `SELECT current_database() AS database,(SELECT oid FROM pg_database WHERE datname=current_database()) AS database_oid,
           session_user='creator_generation_worker' AND current_user=session_user
           AND EXISTS(SELECT FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
           AND p.prosecdef AND p.provolatile='v' AND p.proconfig=ARRAY['search_path=pg_catalog']
           AND pg_get_userbyid(p.proowner)=$3
           AND NOT EXISTS(SELECT FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
           AND has_function_privilege(current_user,p.oid,'EXECUTE')
           AND (SELECT count(*)=7 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='creator' AND c.relname=ANY(ARRAY['generation_worker_scope','ai_workspace','ai_tombstone','ai_license','ai_version','ai_source','ai_sponsor'])
             AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner')
           AS ready,pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.oid=to_regprocedure($4)`,
          [
            receipt.migration.version,
            receipt.migration.checksum,
            owner,
            receipt.signature,
          ],
        )
      ).rows[0];
      const canonicalDatabase = await generationHostDatabase(
        input.service.repository.pool,
        input.signal,
      );
      if (
        installed?.ready !== true ||
        installed.database !== canonicalDatabase?.database ||
        installed.database_oid !== canonicalDatabase.oid ||
        createHash("sha256").update(installed.definition).digest("hex") !==
          receipt.definitionChecksum
      )
        throw new Error("Reviewed generation inputs are not installed");
    } catch (cause) {
      const failure = new DomainError(
        "generation_inputs_unconfigured",
        "The reviewed current generation input consumer is unavailable.",
        503,
      );
      Object.defineProperty(failure, "cause", {
        value: cause,
        configurable: true,
        writable: true,
      });
      throw failure;
    }
    return new PreparedGenerationAgentInputs(
      input.identity,
      input.service,
      input.origins,
      custody,
    );
  }

  private async read(client: PoolClient, scope: GenerationTaskScope) {
    // Only W1's genuinely issued current binding can supply this signal.
    // Nested admission/licence/retrieval reads retain the original caller's
    // cancellation without constructing a controller or widening authority.
    const signal = this.identity.originalSignalInTransaction(scope, client);
    signal?.throwIfAborted();
    await this.identity.authorizeInTransaction(scope, client);
    signal?.throwIfAborted();
    await assertGenerationConsumerCustody(client, this.custody, signal);
    signal?.throwIfAborted();
    const raw = (
      await client.query<{ facts: unknown }>(
        "SELECT creator.generation_agent_inputs($1,$2) AS facts",
        [scope.generationId, scope.workerToken],
      )
    ).rows[0]?.facts;
    signal?.throwIfAborted();
    let facts: z.infer<typeof Facts>;
    try {
      facts = Facts.parse(raw);
    } catch (cause) {
      const failure = new DomainError(
        "generation_inputs_unavailable",
        "Current compiled inputs are unavailable.",
        503,
      );
      Object.defineProperty(failure, "cause", {
        value: cause,
        configurable: true,
        writable: true,
      });
      throw failure;
    }
    invariant(
      facts.creatorId === scope.creatorId &&
        facts.creatorAccountId === scope.creatorAccountId &&
        facts.version.pipelineHash === this.service.pipeline.fingerprint &&
        facts.version.compiledHash ===
          contentHash({ prefix: facts.version.compiledPrefix }) &&
        facts.version.configuration.dailyCostCapMicros > 0 &&
        (facts.version.configuration.mode !== "expert" ||
          facts.version.sourceSet.length > 0) &&
        new Set(facts.version.sourceSet.map((source) => source.id)).size ===
          facts.version.sourceSet.length &&
        facts.sources.length === facts.version.sourceSet.length &&
        facts.version.sourceSet.every((expected) =>
          facts.sources.some(
            (source) =>
              source.id === expected.id &&
              source.revision === expected.revision &&
              source.hash === expected.hash,
          ),
        ),
      "generation_inputs_changed",
      "Use the current evaluated pipeline, compiled version and exact source revisions.",
    );
    const frozen = freeze(facts);
    const contentOrigins = frozen.sources.filter((source) =>
      source.originReference?.startsWith("content:"),
    );
    if (contentOrigins.length) {
      invariant(
        this.origins,
        "generation_source_origin_unconfigured",
        "Current content publication and reuse authority is required.",
      );
      await this.origins.assertCurrent(client, scope, contentOrigins, signal);
      signal?.throwIfAborted();
    }
    await this.identity.authorizeInTransaction(scope, client);
    signal?.throwIfAborted();
    await assertGenerationConsumerCustody(client, this.custody, signal);
    signal?.throwIfAborted();
    return frozen;
  }

  /** Called only inside W3's actual held GenerationIdentityAuthority callback.
   * Provider I/O must follow its successful transaction commit. */
  async currentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
  ): Promise<GenerationAgentFacts> {
    const facts = await this.read(client, scope);
    const signal = this.identity.originalSignalInTransaction(scope, client);
    signal?.throwIfAborted();
    this.issued.set(facts, { scope, client, hash: contentHash(facts) });
    try {
      const context = Object.freeze({ inputs: this, scope, facts });
      invariant(
        await this.service.currentGenerationLicense(context, client),
        "license_expired",
        "Current generation-purpose licence authority is required.",
      );
      // currentGenerationLicense finishes with this exact facts/client/scope
      // authorization after the verifier returns. No intervening operation
      // occurs before handing the same immutable facts back to the caller.
      signal?.throwIfAborted();
      this.licensed.add(facts);
      return facts;
    } catch (error) {
      this.issued.delete(facts);
      throw error;
    }
  }

  /** Reuse across nested readers only after this exact object completed the
   * actual licence verifier. A verifier's in-progress input is insufficient. */
  async authorizeLicensedInTransaction(
    facts: GenerationAgentFacts,
    scope: GenerationTaskScope,
    client: PoolClient,
  ): Promise<void> {
    invariant(
      this.licensed.has(facts),
      "generation_licensed_inputs_required",
      "Use the original inputs after their licence verification completed.",
    );
    await this.authorizeInTransaction(facts, scope, client);
  }

  /** Same issued facts, same held client, same current tuple and private nonce.
   * Retained/cast/copied facts never supply permission to admit or release. */
  async authorizeInTransaction(
    facts: GenerationAgentFacts,
    scope: GenerationTaskScope,
    client: PoolClient,
  ): Promise<void> {
    const binding = this.issued.get(facts);
    invariant(
      binding?.client === client &&
        binding.scope === scope &&
        binding.hash === contentHash(facts),
      "generation_inputs_required",
      "Use this generation's current issued compiled facts.",
    );
    const current = await this.read(client, scope);
    invariant(
      contentHash(current) === binding.hash,
      "generation_inputs_changed",
      "Creator AI inputs changed during generation.",
    );
  }
}
