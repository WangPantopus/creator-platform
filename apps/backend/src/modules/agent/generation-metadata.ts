import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { DraftConfig } from "../../../../../packages/api/src/agent/contracts.js";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import { CommerceGenerationAudience } from "../commerce/generation-audience.js";
import {
  PreparedGenerationAgentInputs,
  type GenerationAgentFacts,
} from "./generation-inputs.js";
import { AgentService } from "./service.js";
import { compile, type AudienceSnapshot } from "./pipeline.js";
import {
  assertGenerationConsumerCustody,
  type GenerationConsumerCustody,
} from "./generation-consumer-catalogue.js";

export const GENERATION_METADATA_MIGRATION =
  "0211_w2_generation_agent_metadata";
export const GENERATION_METADATA_SIGNATURE =
  "creator.generation_agent_metadata(uuid,uuid)";
const owner = "creator_w2_generation_metadata";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Metadata = z.strictObject({
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
});
export type GenerationAgentMetadata = Readonly<{
  creatorId: string;
  creatorName: string;
  compiledHash: string;
  pipelineHash: string;
  audience: Readonly<AudienceSnapshot>;
}>;

/** Classifier preflight only. No query vector is synthesized and no provider
 * call precedes the actual current public identity, licence and W4 audience. */
export class PreparedGenerationAgentMetadata {
  private readonly issued = new WeakMap<
    GenerationAgentMetadata,
    {
      client: PoolClient;
      scope: GenerationTaskScope;
      facts: GenerationAgentFacts;
      audience: Readonly<AudienceSnapshot>;
      hash: string;
    }
  >();

  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly service: AgentService,
    private readonly inputs: PreparedGenerationAgentInputs,
    private readonly audience: CommerceGenerationAudience,
    private readonly custody: GenerationConsumerCustody,
  ) {}

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    workerPool: Pool;
    service: AgentService;
    inputs: PreparedGenerationAgentInputs;
    audience: CommerceGenerationAudience;
    consumer: GenerationPurposeConsumer;
    catalogueChecksum: string;
  }): Promise<PreparedGenerationAgentMetadata> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.service instanceof AgentService &&
        input.inputs instanceof PreparedGenerationAgentInputs &&
        input.audience instanceof CommerceGenerationAudience,
      "generation_metadata_unconfigured",
      "Actual current generation, compiled inputs and financial audience are required.",
    );
    input.identity.assertPool(input.workerPool);
    input.inputs.assertHostPool(input.service.repository.pool);
    input.audience.assertComposition(
      input.identity,
      input.service.repository.pool,
    );
    const receipt = Object.freeze({
      ...input.consumer,
      migration: Object.freeze({ ...input.consumer.migration }),
    });
    invariant(
      receipt.owner === owner &&
        receipt.signature === GENERATION_METADATA_SIGNATURE &&
        receipt.migration.version === GENERATION_METADATA_MIGRATION &&
        Hash.safeParse(receipt.migration.checksum).success &&
        Hash.safeParse(receipt.definitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success,
      "generation_metadata_unconfigured",
      "Use the independently reviewed fixed metadata executable and catalogue.",
    );
    input.identity.assertConsumerRegistered(receipt);
    const custody: GenerationConsumerCustody = Object.freeze({
      owner,
      consumers: Object.freeze([receipt]),
      catalogueChecksum: input.catalogueChecksum,
      callers: Object.freeze([]),
      dependencies: Object.freeze([
        "creator.generation_scope_matches(uuid,uuid)",
        "creator.generation_agent_inputs(uuid,uuid)",
        "creator.generation_allowance_audience(uuid,uuid)",
      ]),
    });
    await assertGenerationConsumerCustody(input.workerPool, custody);
    return new PreparedGenerationAgentMetadata(
      input.identity,
      input.service,
      input.inputs,
      input.audience,
      custody,
    );
  }

  assertComposition(input: {
    identity: GenerationIdentityAuthority;
    service: AgentService;
    inputs: PreparedGenerationAgentInputs;
    audience: CommerceGenerationAudience;
  }): void {
    invariant(
      input.identity === this.identity &&
        input.service === this.service &&
        input.inputs === this.inputs &&
        input.audience === this.audience,
      "generation_metadata_composition_mismatch",
      "Use this metadata consumer's actual canonical producers.",
    );
  }

  async currentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
  ): Promise<GenerationAgentMetadata> {
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    const facts = await this.inputs.currentInTransaction(client, scope);
    const audience = await this.audience.currentInTransaction(client, scope);
    const value = Metadata.parse(
      (
        await client.query<{ metadata: unknown }>(
          "SELECT creator.generation_agent_metadata($1,$2) AS metadata",
          [scope.generationId, scope.workerToken],
        )
      ).rows[0]?.metadata,
    );
    const compiled = compile(
      DraftConfig.parse(facts.version.configuration),
      value.creatorName,
    );
    invariant(
      value.creatorId === scope.creatorId &&
        value.compiledHash === facts.version.compiledHash &&
        value.compiledHash === compiled.hash &&
        facts.version.compiledPrefix === compiled.prefix &&
        value.pipelineHash === this.service.pipeline.fingerprint &&
        value.pipelineHash === facts.version.pipelineHash &&
        contentHash({
          ...value.audience,
          validUntil: new Date(value.audience.validUntil).toISOString(),
        }) === contentHash(audience),
      "generation_metadata_changed",
      "Current creator identity, compiled prefix and original allowance audience must match.",
    );
    await this.inputs.authorizeInTransaction(facts, scope, client);
    await this.audience.authorizeInTransaction(audience, scope, client);
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    Object.freeze(value.audience.tierIds);
    Object.freeze(value.audience.groupIds);
    Object.freeze(value.audience);
    Object.freeze(value);
    this.issued.set(value, {
      client,
      scope,
      facts,
      audience,
      hash: contentHash(value),
    });
    return value;
  }

  async assertCurrentInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    value: GenerationAgentMetadata,
  ): Promise<void> {
    const binding = this.issued.get(value);
    invariant(
      binding?.client === client &&
        binding.scope === scope &&
        binding.hash === contentHash(value),
      "generation_metadata_required",
      "Use the original metadata issued for this held client and purpose.",
    );
    await this.inputs.authorizeInTransaction(binding.facts, scope, client);
    await this.audience.authorizeInTransaction(binding.audience, scope, client);
    const current = await this.currentInTransaction(client, scope);
    invariant(
      contentHash(current) === binding.hash,
      "generation_metadata_changed",
      "Creator identity or allowance changed during the current generation stage.",
    );
  }
}
