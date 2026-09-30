import type { AgentService } from "../agent/service.js";
import { LiveAgentRuntime, type AudiencePort } from "../agent/runtime.js";
import {
  proposeMemory,
  type MemoryProposalPort,
} from "../agent/memory-proposals.js";
import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import type { ThreadScope } from "../access/scope.js";
import type { ConversationGenerator } from "./generation.js";
import type { MemoryService } from "./memory.js";

/** Consumes W2's real pipeline. The host supplies current W4 source audiences and
 * W2's usage recorder; no source approvals, grants or cost records are invented. */
export function approvedConversationGenerator(input: {
  agent: AgentService;
  audiences: AudiencePort;
  memory: MemoryService;
  onExtractionUsage?: (scope: ThreadScope, usage: Usage) => Promise<void>;
}): ConversationGenerator {
  return {
    async generate(scope, text, context, signal, deliver) {
      return new LiveAgentRuntime(
        input.agent,
        context,
        input.audiences,
      ).generate(scope, text, signal, deliver);
    },
    ...(input.onExtractionUsage
      ? {
          async extract(scope, snapshot, exchange, signal) {
            const model = input.agent.pipeline.model;
            if (!model || snapshot.offTheRecord) return;
            const proposals: unknown[] = [];
            const port: MemoryProposalPort = {
              async propose(_scope, item) {
                proposals.push(item);
                return true;
              },
              async requestConsentOnce(_scope, item) {
                // W2's current sensitive proposal contract lacks semanticKey/kind.
                // Preserve exact item consent; conservative exclusion handling still
                // prevents re-extraction until W2 provides canonical semantic metadata.
                proposals.push({
                  kind: "fact",
                  text: item.text,
                  semanticKey: item.itemHash,
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
              onUsage: (usage) => input.onExtractionUsage!(scope, usage),
            });
            signal.throwIfAborted();
            await input.memory.writeProposals(scope, proposals);
          },
        }
      : {}),
  };
}
