import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import type { ThreadScope } from "../access/scope.js";
import type { createAgentDomain } from "./integration.js";
import { proposeMemory, type MemoryProposalPort } from "./memory-proposals.js";
import {
  selectMemorySurvivors,
  type MemoryExclusionSnapshot,
} from "./memory-exclusions.js";
import type { ThreadSnapshot } from "./pipeline.js";
import type { ProviderExecution } from "./provider-usage.js";
import type { ApprovedSentence, ConversationContextPort } from "./runtime.js";

type Proposal = Parameters<MemoryProposalPort["propose"]>[1];
/** Structural consumer of W3's published 63c61a9 GenerationExecution.
 * W3's processor must supply its actual held-client batch producer. A host
 * cannot substitute an interactive scope or a check followed by another TX. */
export interface MemoryGenerationExecution extends ProviderExecution {
  memoryExclusions(
    assertAuthority: (client: PoolClient) => Promise<void>,
  ): Promise<MemoryExclusionSnapshot>;
  commitMemory(
    proposals: readonly unknown[],
    assertAuthority: (client: PoolClient) => Promise<void>,
    exclusions?: MemoryExclusionSnapshot,
  ): Promise<{ written: number; revision: number | null }>;
}

/** Construct the W2 side of W3's ConversationGenerator. Preparation does not
 * approve a license, policy or worker: each execution still checks authority. */
export function createAgentConversationGenerator(
  domain: ReturnType<typeof createAgentDomain>,
) {
  const { runtime, service, readiness } = domain;
  const journal = service.repository.usageJournal;
  const model = service.pipeline.model;
  invariant(
    runtime &&
      journal &&
      model &&
      readiness.provider &&
      readiness.conversation &&
      readiness.licensing &&
      readiness.atomicDelivery,
    "generation_unconfigured",
    "Prepare canonical generation custody, processor consent, licensing and audience authority before registering fan generation.",
  );
  return Object.freeze({
    journal,
    executionAttributed: true as const,
    assertReady: runtime.assertReady.bind(runtime),
    assertApproved: runtime.assertApproved.bind(runtime),
    citation: runtime.passage.bind(runtime),
    seal: (scope: ThreadScope, execution: ProviderExecution) =>
      runtime.sealExecution(scope, execution),
    routeSafety: (
      scope: ThreadScope,
      text: string,
      context: ConversationContextPort,
      signal: AbortSignal,
      deliver: Parameters<typeof runtime.routeSafety>[3],
    ) => runtime.routeSafety(scope, text, signal, deliver, context),
    generate: (
      scope: ThreadScope,
      text: string,
      context: ConversationContextPort,
      signal: AbortSignal,
      deliver: (sentence: ApprovedSentence) => Promise<void>,
      execution?: ProviderExecution,
    ) => {
      invariant(
        execution &&
          typeof (execution as Partial<MemoryGenerationExecution>)
            .commitMemory === "function" &&
          typeof (execution as Partial<MemoryGenerationExecution>)
            .memoryExclusions === "function",
        "generation_execution_required",
        "The actual generation processor must own provider admission, memory commit and sealing.",
      );
      return runtime.generate(scope, text, signal, deliver, execution, context);
    },
    extract: async (
      scope: ThreadScope,
      snapshot: ThreadSnapshot,
      exchange: readonly string[],
      signal: AbortSignal,
      execution?: ProviderExecution,
    ) => {
      invariant(
        execution &&
          typeof (execution as Partial<MemoryGenerationExecution>)
            .commitMemory === "function" &&
          typeof (execution as Partial<MemoryGenerationExecution>)
            .memoryExclusions === "function",
        "memory_execution_required",
        "Memory must commit on the actual generation processor's held client.",
      );
      if (snapshot.offTheRecord) return { revision: null };
      const admission = runtime.memoryJournal(
        scope,
        snapshot,
        execution,
        signal,
      );
      const memoryExecution = execution as MemoryGenerationExecution;
      const exclusions = await memoryExecution.memoryExclusions(
        admission.assertAdmission,
      );
      invariant(
        exclusions.revision === snapshot.revision,
        "memory_exclusions_changed",
        "Use this extraction's actual current exclusion snapshot.",
      );
      // Retained hashes are not recoverable text or semantic approval.
      if (exclusions.exclusions.some((item) => item.text === null))
        return { revision: null };
      const proposals: Proposal[] = [];
      await proposeMemory({
        scope,
        snapshot,
        exchange,
        model,
        signal,
        journal: admission,
        port: {
          propose: async (_scope, proposal) => {
            proposals.push(proposal);
            return true;
          },
          requestConsentOnce: async (_scope, item) => {
            proposals.push({
              kind: item.kind,
              text: item.text,
              semanticKey: item.semanticKey,
              provenanceMessageId: item.provenanceMessageId,
              expectedRevision: item.expectedRevision,
              sensitiveCategory: item.category,
            });
          },
        },
      });
      invariant(
        proposals.length <= 5,
        "memory_batch_large",
        "Memory must use one bounded extraction batch.",
      );
      if (!proposals.length) return { revision: null };
      const survivors = await selectMemorySurvivors({
        scope,
        proposals,
        exclusions,
        model,
        journal: admission,
        signal,
      });
      if (!survivors.length) return { revision: null };
      await admission.assertCurrent();
      // Classifiers completed outside locks. W3 now checks its exact lease,
      // thread snapshot and this SQL-only W2 authority through the batch commit.
      return memoryExecution.commitMemory(
        survivors,
        admission.assertAdmission,
        exclusions,
      );
    },
  });
}
