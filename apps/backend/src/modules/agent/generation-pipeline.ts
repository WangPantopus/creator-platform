import type { PoolClient } from "pg";
import { z } from "zod";
import {
  DraftConfig,
  AgentAudience,
  type Passage,
} from "../../../../../packages/api/src/agent/contracts.js";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import {
  GenerationIdentityAuthority,
  type GenerationTask,
  type GenerationTaskScope,
} from "../identity/generation-scope.js";
import {
  PreparedGenerationConversationContext,
  type GenerationConversationContext,
} from "../conversation/generation-context.js";
import { PreparedGenerationConversationOutput } from "../conversation/generation-output.js";
import { CommerceGenerationAudience } from "../commerce/generation-audience.js";
import {
  PreparedGenerationAgentInputs,
  type GenerationAgentFacts,
} from "./generation-inputs.js";
import {
  PreparedGenerationAgentMetadata,
  type GenerationAgentMetadata,
} from "./generation-metadata.js";
import {
  PreparedGenerationProviderAccounting,
  type GenerationProviderAttempt,
  type GenerationProviderCall,
} from "./generation-provider-usage.js";
import {
  PreparedGenerationRuntimeContext,
  type GenerationRuntimeContext,
  type GenerationQueryEmbedding,
} from "./generation-runtime-context.js";
import { PreparedGenerationGuardrail } from "./generation-guardrail.js";
import { AgentService } from "./service.js";
import {
  crisisText,
  needsImmediateSafety,
  type PipelineResult,
  type PipelineSentenceProof,
} from "./pipeline.js";

const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Sentence = z.strictObject({
  text: z.string().min(1).max(10000),
  citations: z.array(z.uuid()).max(4),
});
const approvedBrand: unique symbol = Symbol("ApprovedGenerationSentence");
/** Server-only output. A copied shape/symbol never replaces private issuance
 * and current same-client W1/W2/W3/W4/W5/W8 authority. */
export type ApprovedGenerationSentence = Readonly<{
  [approvedBrand]: true;
  authorKind: "ai";
  kind: "sentence" | "fallback" | "crisis";
  generationId: string;
  workerToken: string;
  fanMessageId: string;
  epoch: number;
  contextRevision: number;
  sequence: number;
  text: string;
  citations: readonly string[];
  versionId: string;
  versionHash: string;
  pipelineHash: string;
  contextHash: string;
  providerUsageId: string;
  permittedPassages: readonly Readonly<{
    id: string;
    sourceId: string;
    sourceRevision: number;
    sourceHash: string;
  }>[];
}>;
type Run = {
  task: GenerationTask;
  signal: AbortSignal;
  conversation: GenerationConversationContext;
  facts: GenerationAgentFacts;
  metadata: GenerationAgentMetadata;
  attempt: GenerationProviderAttempt;
  embedding?: GenerationQueryEmbedding;
  retrieval?: GenerationRuntimeContext;
  classifierCall?: GenerationProviderCall;
  replyCall?: GenerationProviderCall;
  nextSequence: number;
  live: boolean;
};
function intent(task: GenerationTask) {
  return contentHash({
    generationId: task.generationId,
    threadId: task.threadId,
    creatorId: task.creatorId,
    fanId: task.fanId,
    initiatingAccountId: task.initiatingAccountId,
    initiatingSessionId: task.initiatingSessionId,
    creatorAccountId: task.creatorAccountId,
    fanMessageId: task.fanMessageId,
    aiMessageId: task.aiMessageId,
    grantId: task.grantId,
    reservationId: task.reservationId,
    epoch: task.epoch,
    contextRevision: task.contextRevision,
    workerToken: task.workerToken,
    leaseUntil: task.leaseUntil,
    processorConsentVersion: task.processorConsentVersion,
  });
}
function conversationInput(context: GenerationConversationContext) {
  // Original W3 input stays stable while only its own generating output cursor
  // advances. Current revision is separately checked against genuine W1 scope.
  return contentHash({
    ...context,
    snapshot: { ...context.snapshot, revision: 0 },
  });
}
function audienceInput(
  audience: Readonly<{
    revision: string;
    tierIds: readonly string[];
    groupIds: readonly string[];
  }>,
) {
  return {
    revision: audience.revision,
    tierIds: audience.tierIds,
    groupIds: audience.groupIds,
  };
}
function metadataInput(metadata: GenerationAgentMetadata) {
  return contentHash({
    ...metadata,
    audience: audienceInput(metadata.audience),
  });
}
function retrievalInput(context: GenerationRuntimeContext) {
  return contentHash({ ...context, audience: audienceInput(context.audience) });
}

/** Actual shared engine adapter, distinct from interactive Actor/ThreadScope.
 * It never writes W3 output/epoch or W4 money. W3's original prepared writer
 * calls assertApprovedInTransaction around its append; W1 alone commits.
 */
export class PreparedGenerationPipeline {
  private readonly running = new Set<string>();
  private readonly approved = new WeakMap<
    ApprovedGenerationSentence,
    { run: Run; call: GenerationProviderCall; hash: string }
  >();

  private constructor(
    private readonly identity: GenerationIdentityAuthority,
    private readonly service: AgentService,
    private readonly inputs: PreparedGenerationAgentInputs,
    private readonly context: PreparedGenerationConversationContext,
    private readonly metadata: PreparedGenerationAgentMetadata,
    private readonly accounting: PreparedGenerationProviderAccounting,
    private readonly retrieval: PreparedGenerationRuntimeContext,
    private readonly guardrail: PreparedGenerationGuardrail,
  ) {}

  static prepare(input: {
    identity: GenerationIdentityAuthority;
    service: AgentService;
    inputs: PreparedGenerationAgentInputs;
    context: PreparedGenerationConversationContext;
    audience: CommerceGenerationAudience;
    metadata: PreparedGenerationAgentMetadata;
    accounting: PreparedGenerationProviderAccounting;
    retrieval: PreparedGenerationRuntimeContext;
    guardrail: PreparedGenerationGuardrail;
  }): PreparedGenerationPipeline {
    invariant(
      input.identity instanceof GenerationIdentityAuthority &&
        input.service instanceof AgentService &&
        input.inputs instanceof PreparedGenerationAgentInputs &&
        input.context instanceof PreparedGenerationConversationContext &&
        input.audience instanceof CommerceGenerationAudience &&
        input.metadata instanceof PreparedGenerationAgentMetadata &&
        input.accounting instanceof PreparedGenerationProviderAccounting &&
        input.retrieval instanceof PreparedGenerationRuntimeContext &&
        input.guardrail instanceof PreparedGenerationGuardrail &&
        input.service.pipeline.model?.pricingConfigured,
      "generation_pipeline_unconfigured",
      "All original prepared current-input, accounting, context and audit producers are required.",
    );
    input.inputs.assertHostPool(input.service.repository.pool);
    input.context.assertHostPool(input.service.repository.pool);
    input.audience.assertComposition(
      input.identity,
      input.service.repository.pool,
    );
    input.metadata.assertComposition(input);
    input.accounting.assertComposition(input);
    input.retrieval.assertComposition(input);
    input.guardrail.assertComposition(input);
    return new PreparedGenerationPipeline(
      input.identity,
      input.service,
      input.inputs,
      input.context,
      input.metadata,
      input.accounting,
      input.retrieval,
      input.guardrail,
    );
  }

  assertComposition(
    identity: GenerationIdentityAuthority,
    hostPool: import("pg").Pool,
  ): void {
    invariant(
      identity === this.identity && hostPool === this.service.repository.pool,
      "generation_pipeline_composition_changed",
      "Use this pipeline's original identity and canonical host.",
    );
  }

  assertService(service: AgentService): void {
    invariant(
      service === this.service,
      "generation_pipeline_service_changed",
      "Acceptance must use this worker's original Creator AI service.",
    );
  }

  private async current(
    client: PoolClient,
    scope: GenerationTaskScope,
    run: Run,
  ) {
    run.signal.throwIfAborted();
    invariant(
      run.live && intent(scope) === intent(run.task),
      "generation_pipeline_intent_changed",
      "Use this original generation run and current private purpose.",
    );
    await this.identity.authorizeInTransaction(scope, client);
    const conversation = await this.context.currentInTransaction(client, scope);
    const metadata = await this.metadata.currentInTransaction(client, scope);
    const facts = await this.metadata.factsInTransaction(
      client,
      scope,
      metadata,
    );
    invariant(
      conversation.snapshot.revision ===
        scope.contextRevision + scope.lastSequence &&
        conversation.snapshot.epoch === scope.epoch &&
        conversation.snapshot.provenanceMessageId === scope.fanMessageId &&
        conversationInput(conversation) ===
          conversationInput(run.conversation) &&
        contentHash(facts) === contentHash(run.facts) &&
        metadataInput(metadata) === metadataInput(run.metadata),
      "generation_pipeline_inputs_changed",
      "The original accepted input, memory exclusions, licence, audience or compiled sources changed.",
    );
    if (run.retrieval && run.embedding) {
      const retrieved = await this.retrieval.currentInTransaction(
        client,
        scope,
        run.embedding,
        facts,
      );
      invariant(
        retrievalInput(retrieved) === retrievalInput(run.retrieval),
        "generation_pipeline_evidence_changed",
        "The exact originally permitted source/style evidence changed.",
      );
      // currentInTransaction owns both authority/input bookends around this
      // fresh read. Its returned evidence is compared to the original run
      // above; immediately rereading that same value adds no new operation.
    }
    await this.inputs.authorizeInTransaction(facts, scope, client);
    await this.metadata.assertCurrentInTransaction(client, scope, metadata);
    await this.context.assertCurrentInTransaction(client, scope, conversation);
    await this.identity.authorizeInTransaction(scope, client);
    run.signal.throwIfAborted();
    return facts;
  }

  /** W3 supplies its original held client and genuine purpose, before and after
   * append. Postappend needs W1's actual bounded issued cursor refresh; the old
   * 0179 nonce/task view correctly refuses rather than skipping this bookend. */
  async assertApprovedInTransaction(
    client: PoolClient,
    scope: GenerationTaskScope,
    sentence: ApprovedGenerationSentence,
  ): Promise<void> {
    const issued = this.approved.get(sentence);
    invariant(
      issued &&
        issued.hash === contentHash(sentence) &&
        sentence.generationId === scope.generationId &&
        sentence.workerToken === scope.workerToken &&
        sentence.fanMessageId === scope.fanMessageId &&
        sentence.epoch === scope.epoch &&
        sentence.contextRevision === scope.contextRevision &&
        (scope.lastSequence === sentence.sequence - 1 ||
          scope.lastSequence === sentence.sequence),
      "generation_sentence_approval_required",
      "Use this exact run's privately issued ordered approved sentence.",
    );
    this.accounting.assertCall(
      issued.call,
      issued.run.attempt,
      issued.run.task,
    );
    await this.current(client, scope, issued.run);
    this.accounting.assertCall(
      issued.call,
      issued.run.attempt,
      issued.run.task,
    );
    invariant(
      issued.hash === contentHash(sentence),
      "generation_sentence_changed",
      "Approved output changed during its held operation.",
    );
  }

  private issue(
    run: Run,
    raw: { text: string; citations: readonly string[] },
    proof: {
      kind: ApprovedGenerationSentence["kind"];
      compiledHash: string;
      contextHash: string;
      passages: readonly Passage[];
    },
    call: GenerationProviderCall,
  ): ApprovedGenerationSentence {
    const value = Sentence.parse({
      text: raw.text,
      citations: [...raw.citations],
    });
    this.accounting.assertCall(call, run.attempt, run.task);
    invariant(
      run.live &&
        Hash.safeParse(proof.contextHash).success &&
        proof.compiledHash === run.facts.version.compiledHash &&
        new Set(value.citations).size === value.citations.length &&
        proof.passages.every((p) =>
          run.retrieval?.passages.some(
            (current) => contentHash(current) === contentHash(p),
          ),
        ) &&
        value.citations.every((id) => proof.passages.some((p) => p.id === id)),
      "generation_sentence_evidence_changed",
      "The engine approval requires the exact permitted original evidence and compiled version.",
    );
    const permittedPassages = proof.passages.map((p) => {
      const source = run.facts.version.sourceSet.find(
        (s) => s.id === p.sourceId && s.revision === p.sourceRevision,
      );
      invariant(
        source,
        "generation_sentence_source_changed",
        "Original source revision/hash custody is required.",
      );
      return Object.freeze({
        id: p.id,
        sourceId: p.sourceId,
        sourceRevision: p.sourceRevision,
        sourceHash: source.hash,
      });
    });
    const sentence: ApprovedGenerationSentence = Object.freeze({
      [approvedBrand]: true as const,
      authorKind: "ai" as const,
      kind: proof.kind,
      generationId: run.task.generationId,
      workerToken: run.task.workerToken,
      fanMessageId: run.task.fanMessageId,
      epoch: run.task.epoch,
      contextRevision: run.task.contextRevision,
      sequence: ++run.nextSequence,
      text: value.text,
      citations: Object.freeze(value.citations),
      versionId: run.facts.version.id,
      versionHash: proof.compiledHash,
      pipelineHash: run.facts.version.pipelineHash,
      contextHash: proof.contextHash,
      providerUsageId: call.usageId,
      permittedPassages: Object.freeze(permittedPassages),
    });
    this.approved.set(sentence, { run, call, hash: contentHash(sentence) });
    return sentence;
  }

  async generate(
    task: GenerationTask,
    signal: AbortSignal,
    /** The original prepared W3 writer finishes its W1-held append, both
     * private approval bookends and sole W1 COMMIT before delivery resolves. */
    output: PreparedGenerationConversationOutput,
  ): Promise<PipelineResult> {
    const started = performance.now();
    let firstApprovedMs: number | null = null;
    invariant(
      output instanceof PreparedGenerationConversationOutput,
      "generation_pipeline_output_required",
      "Use the original prepared conversation output writer.",
    );
    output.assertComposition({
      identity: this.identity,
      pipeline: this,
      hostPool: this.service.repository.pool,
    });
    const key = task.generationId + ":" + task.workerToken;
    invariant(
      !this.running.has(key),
      "generation_pipeline_running",
      "This original generation already has a live producer.",
    );
    this.running.add(key);
    let run: Run | undefined;
    try {
      signal.throwIfAborted();
      run = await this.identity.withGeneration(
        task,
        async (client, scope) => {
          const conversation = await this.context.currentInTransaction(
            client,
            scope,
          );
          // W3 handles immediate safety before financial/provider acceptance.
          // Never start/restart a paid run over durable partial output.
          invariant(
            !needsImmediateSafety(conversation.acceptedText),
            "generation_safety_route_required",
            "Use the original free conversation safety route before provider or allowance work.",
          );
          invariant(
            scope.lastSequence === 0,
            "generation_partial_output_terminal_required",
            "Seal the original partial output as interrupted before accepting another model run.",
          );
          const metadata = await this.metadata.currentInTransaction(
            client,
            scope,
          );
          const facts = await this.metadata.factsInTransaction(
            client,
            scope,
            metadata,
          );
          const attempt = await this.accounting.beginInTransaction(
            client,
            scope,
          );
          await this.inputs.authorizeInTransaction(facts, scope, client);
          await this.metadata.assertCurrentInTransaction(
            client,
            scope,
            metadata,
          );
          await this.context.assertCurrentInTransaction(
            client,
            scope,
            conversation,
          );
          return {
            task: Object.freeze({ ...task }),
            signal,
            conversation,
            facts,
            metadata,
            attempt,
            nextSequence: 0,
            live: true,
          };
        },
        signal,
      );
      const current = run;
      const bookend = async (
        client: PoolClient,
        scope: GenerationTaskScope,
      ) => {
        await this.current(client, scope, current);
      };
      let emitted = 0;
      const emit = async (
        sentence: { text: string; citations: readonly string[] },
        proof: PipelineSentenceProof,
      ) => {
        invariant(
          current.replyCall,
          "generation_reply_admission_required",
          "An original committed reply admission is required for model output.",
        );
        const approved = this.issue(
          current,
          sentence,
          proof,
          current.replyCall,
        );
        await output.deliver(task, approved, signal);
        await this.identity.withGeneration(
          task,
          async (client, scope) => {
            invariant(
              scope.lastSequence === approved.sequence,
              "generation_output_not_committed",
              "The actual original writer must commit this exact ordered cursor.",
            );
            await this.assertApprovedInTransaction(client, scope, approved);
          },
          signal,
        );
        firstApprovedMs ??= Math.round(performance.now() - started);
        emitted++;
      };
      const result = await this.service.pipeline.runWithPorts(
        {
          creatorId: task.creatorId,
          configuration: DraftConfig.parse(current.facts.version.configuration),
          creatorName: current.metadata.creatorName,
          message: current.conversation.acceptedText,
          grants: {
            ...current.metadata.audience,
            tierIds: [...current.metadata.audience.tierIds],
            groupIds: [...current.metadata.audience.groupIds],
          },
          snapshot: current.conversation.snapshot,
          status: current.facts.status,
          sponsors: current.facts.sponsors.map((s) => ({
            ...s,
            aliases: [...s.aliases],
            active: true,
          })),
          signal,
          beforeSentence: () =>
            this.identity.withGeneration(
              task,
              (client, scope) => bookend(client, scope),
              signal,
            ),
          onSentence: emit,
        },
        {
          withUsage: (call, stage) =>
            this.accounting.withUsage(
              task,
              current.attempt,
              "guardrail",
              signal,
              call,
              bookend,
              (admitted) => {
                if (stage === "classifier") current.classifierCall = admitted;
              },
            ),
          withStreamUsage: (call) =>
            this.accounting.withStreamUsage(
              task,
              current.attempt,
              signal,
              call,
              bookend,
              (admitted) => {
                current.replyCall = admitted;
              },
            ),
          retrieve: async () => {
            const embedding = await this.retrieval.embedAcceptedMessage(
              task,
              current.attempt,
              signal,
              bookend,
            );
            const retrieved = await this.identity.withGeneration(
              task,
              async (client, scope) => {
                const facts = await this.current(client, scope, current);
                const value = await this.retrieval.currentInTransaction(
                  client,
                  scope,
                  embedding,
                  facts,
                );
                // The fresh reader already completes its own authority and
                // input bookends before returning this immutable value.
                return value;
              },
              signal,
            );
            current.embedding = embedding;
            current.retrieval = retrieved;
            return {
              passages: retrieved.passages.map((p) => ({
                ...p,
                audience: AgentAudience.parse(p.audience),
              })),
              examples: async () => [...retrieved.styleExamples],
              usage: this.retrieval.embeddingUsage(
                embedding,
                task,
                current.attempt,
              ),
            };
          },
          finish: (event) =>
            this.identity.withGeneration(
              task,
              async (client, scope) => {
                await bookend(client, scope);
                if (event.blocked) {
                  invariant(
                    event.category,
                    "generation_guardrail_category_required",
                    "An actual blocked category is required.",
                  );
                  await this.guardrail.recordInTransaction(client, scope, {
                    category: event.category,
                    versionHash: event.versionHash,
                    contextHash: event.contextHash,
                  });
                }
                await bookend(client, scope);
              },
              signal,
            ),
        },
      );
      if (emitted === 0 && result.category === "crisis") {
        invariant(
          current.classifierCall &&
            result.sentences.length === 1 &&
            result.sentences[0]?.text === crisisText &&
            result.sentences[0].citations.length === 0,
          "generation_crisis_provenance_required",
          "Use the actual classifier's fixed free safety outcome.",
        );
        const approved = this.issue(
          current,
          result.sentences[0],
          {
            kind: "crisis",
            compiledHash: result.compiledHash,
            contextHash: result.contextHash,
            passages: [],
          },
          current.classifierCall,
        );
        await output.deliver(task, approved, signal);
        await this.identity.withGeneration(
          task,
          async (client, scope) => {
            invariant(
              scope.lastSequence === approved.sequence,
              "generation_output_not_committed",
              "The original safety output must commit its exact ordered cursor.",
            );
            await this.assertApprovedInTransaction(client, scope, approved);
          },
          signal,
        );
        firstApprovedMs ??= Math.round(performance.now() - started);
        emitted++;
      }
      invariant(
        emitted > 0 && emitted === result.sentences.length,
        "generation_output_missing",
        "Every approved sentence requires its actual ordered durable writer.",
      );
      // The shared engine also serves previews. This worker measures from its
      // original preflight through the durable append and current-cursor
      // readback, including classifier safety/fallback delivery. Terminal
      // settlement and client receipt are separate end-to-end measurements.
      return {
        ...result,
        durationMs: Math.round(performance.now() - started),
        firstApprovedMs,
      };
    } finally {
      if (run) run.live = false;
      this.running.delete(key);
    }
  }
}
