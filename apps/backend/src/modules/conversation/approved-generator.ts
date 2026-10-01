import type { AgentService } from "../agent/service.js";
import {
  LiveAgentRuntime,
  type AudiencePort,
  type ApprovedSentence,
} from "../agent/runtime.js";
import {
  proposeMemory,
  type MemoryProposalPort,
} from "../agent/memory-proposals.js";
import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import type { ThreadScope } from "../access/scope.js";
import type {
  ConversationGenerator,
  GenerationExecution,
} from "./generation.js";
import { invariant } from "../../core/errors.js";
import type { MemoryService } from "./memory.js";

/** Consumes W2's real pipeline and pre-call journal. The host supplies current
 * W4 audiences; no source approvals, grants or cost records are invented. */
export function approvedConversationGenerator(input: {
  agent: AgentService;
  audiences: AudiencePort;
  memory: MemoryService;
  /** Diagnostic only. W2 already journals every actual extraction call. */
  onExtractionUsage?: (scope: ThreadScope, usage: Usage) => Promise<void>;
}): ConversationGenerator {
  // Only an actually released approved sentence supplies version lineage.
  // Attempt keys are memory-only and disappear when the processor releases them.
  const attempts = new WeakMap<
    GenerationExecution,
    {
      runtime: LiveAgentRuntime;
      sentence?: ApprovedSentence;
    }
  >();
  return {
    async routeSafety(scope, text, context, signal, deliver) {
      return new LiveAgentRuntime(
        input.agent,
        context,
        input.audiences,
      ).routeSafety(scope, text, signal, deliver);
    },
    async generate(scope, text, context, signal, deliver, execution) {
      const runtime = new LiveAgentRuntime(
        input.agent,
        context,
        input.audiences,
      );
      const attempt: {
        runtime: LiveAgentRuntime;
        sentence?: ApprovedSentence;
      } = { runtime };
      if (execution) attempts.set(execution, attempt);
      return runtime.generate(
        scope,
        text,
        signal,
        async (sentence) => {
          await deliver(sentence);
          attempt.sentence = sentence;
        },
        execution,
      );
    },
    // This closes the existing creator-cap hold through the actual attempt.
    // It is not a terminal generation receipt or executionAttributed readiness.
    async seal(scope, execution) {
      const attempt = attempts.get(execution);
      if (!attempt) return;
      await attempt.runtime.sealExecution(scope, execution);
      attempts.delete(execution);
    },
    async extract(scope, snapshot, exchange, signal, execution) {
      const model = input.agent.pipeline.model;
      if (!model || snapshot.offTheRecord) return;
      const attempt = execution ? attempts.get(execution) : undefined;
      const delivered = attempt?.sentence;
      invariant(
        execution && attempt && delivered,
        "generation_context_unavailable",
        "Current approved generation context is required before memory extraction.",
      );
      const runtime = attempt.runtime;
      const proposals: unknown[] = [];
      const port: MemoryProposalPort = {
        async propose(_scope, item) {
          proposals.push(item);
          return true;
        },
        async requestConsentOnce(_scope, item) {
          proposals.push({
            kind: item.kind,
            text: item.text,
            semanticKey: item.semanticKey,
            provenanceMessageId: item.provenanceMessageId,
            expectedRevision: item.expectedRevision,
            sensitiveCategory: item.category,
          });
        },
      };
      await proposeMemory({
        scope,
        snapshot,
        exchange,
        model,
        port,
        signal,
        journal: {
          repository: input.agent.repository,
          versionHash: delivered.versionHash,
          execution,
          assertAdmission: (client) =>
            runtime.assertApproved(scope, client, delivered),
          assertCurrent: () =>
            execution.admit((client) =>
              runtime.assertApproved(scope, client, delivered),
            ),
        },
        ...(input.onExtractionUsage
          ? {
              onUsage: (usage: Usage) => input.onExtractionUsage!(scope, usage),
            }
          : {}),
      });
      signal.throwIfAborted();
      return await input.memory.writeProposalsWithReceipt(scope, proposals);
    },
  };
}
