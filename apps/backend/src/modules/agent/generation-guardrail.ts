import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationPurposeConsumer,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import { PreparedGenerationConversationContext } from "../conversation/generation-context.js";
import { PreparedGenerationAgentInputs } from "./generation-inputs.js";
import { AgentService } from "./service.js";
import {
  assertGenerationConsumerCustody,
  type GenerationConsumerCustody,
} from "./generation-consumer-catalogue.js";

export const GENERATION_GUARDRAIL_MIGRATION =
  "0210_w2_generation_guardrail_event";
export const GENERATION_GUARDRAIL_SIGNATURE =
  "creator.generation_record_agent_guardrail(uuid,uuid,text,text)";
const owner = "creator_w2_generation_guardrail";
const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Category = z.enum([
  "never_reveal",
  "impersonation",
  "promise_or_sales",
  "dependency",
  "citation_invalid",
  "output_policy",
]);

/** Audit-only consumer. Actual W1/W2/W3 and registered C10 custody are required
 * on the original held client; no sentence, provider or terminal is authorized. */
export class PreparedGenerationGuardrail {
  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly service: AgentService,
    private readonly inputs: PreparedGenerationAgentInputs,
    private readonly context: PreparedGenerationConversationContext,
    private readonly custody: GenerationConsumerCustody,
    private readonly assertPrivacyRegistered: () => Promise<void>,
  ) {}

  static async prepare(input: {
    identity: GenerationIdentityAuthority;
    workerPool: Pool;
    service: AgentService;
    inputs: PreparedGenerationAgentInputs;
    context: PreparedGenerationConversationContext;
    consumer: GenerationPurposeConsumer;
    catalogueChecksum: string;
    /** Actual W8 registration including this event's complete family export,
     * deletion and finite approved ordinary-data policy; never a no-op. */
    assertPrivacyRegistered: () => Promise<void>;
  }): Promise<PreparedGenerationGuardrail> {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.service instanceof AgentService &&
        input.inputs instanceof PreparedGenerationAgentInputs &&
        input.context instanceof PreparedGenerationConversationContext &&
        typeof input.assertPrivacyRegistered === "function",
      "generation_guardrail_unconfigured",
      "Actual current generation, compiled inputs, conversation and C10 registration are required.",
    );
    input.identity.assertPool(input.workerPool);
    input.inputs.assertHostPool(input.service.repository.pool);
    input.context.assertHostPool(input.service.repository.pool);
    const receipt = Object.freeze({
      ...input.consumer,
      migration: Object.freeze({ ...input.consumer.migration }),
    });
    invariant(
      receipt.owner === owner &&
        receipt.signature === GENERATION_GUARDRAIL_SIGNATURE &&
        receipt.migration.version === GENERATION_GUARDRAIL_MIGRATION &&
        Hash.safeParse(receipt.migration.checksum).success &&
        Hash.safeParse(receipt.definitionChecksum).success &&
        Hash.safeParse(input.catalogueChecksum).success,
      "generation_guardrail_unconfigured",
      "Use the exact independently reviewed fixed audit executable and catalogue.",
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
      ]),
    });
    const registered = input.assertPrivacyRegistered.bind(input);
    await registered();
    await assertGenerationConsumerCustody(input.workerPool, custody);
    return new PreparedGenerationGuardrail(
      input.identity,
      input.service,
      input.inputs,
      input.context,
      custody,
      registered,
    );
  }

  assertComposition(input: {
    identity: GenerationIdentityAuthority;
    service: AgentService;
    inputs: PreparedGenerationAgentInputs;
    context: PreparedGenerationConversationContext;
  }): void {
    invariant(
      input.identity === this.identity &&
        input.service === this.service &&
        input.inputs === this.inputs &&
        input.context === this.context,
      "generation_guardrail_composition_mismatch",
      "Use this actual prepared guardrail consumer's canonical producers.",
    );
  }

  async recordInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    event: Readonly<{
      category: string;
      versionHash: string;
      contextHash: string;
    }>,
  ): Promise<void> {
    await this.assertPrivacyRegistered();
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    const conversation = await this.context.currentInTransaction(client, scope);
    const facts = await this.inputs.currentInTransaction(client, scope);
    invariant(
      Hash.safeParse(event.versionHash).success &&
        event.versionHash === facts.version.compiledHash,
      "generation_guardrail_version_changed",
      "The guardrail event must use this generation's current compiled version.",
    );
    // A provider category is untrusted prose. Persist only this closed code
    // set, with a generic policy category for any other classifier outcome.
    const category = Category.safeParse(event.category);
    const recorded = (
      await client.query<{ recorded: boolean }>(
        "SELECT creator.generation_record_agent_guardrail($1,$2,$3,$4) AS recorded",
        [
          scope.generationId,
          scope.workerToken,
          category.success ? category.data : "output_policy",
          Hash.parse(event.contextHash),
        ],
      )
    ).rows[0]?.recorded;
    invariant(
      recorded === true,
      "generation_guardrail_unavailable",
      "The original bounded guardrail audit is unavailable.",
    );
    await this.inputs.authorizeInTransaction(facts, scope, client);
    await this.context.assertCurrentInTransaction(client, scope, conversation);
    await this.identity.authorizeInTransaction(scope, client);
    await assertGenerationConsumerCustody(client, this.custody);
    await this.assertPrivacyRegistered();
  }
}
