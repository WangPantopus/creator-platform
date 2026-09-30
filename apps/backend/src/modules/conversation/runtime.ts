import type { Database } from "../../db/database.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import type { ConversationService } from "./service.js";
import { ConversationFeature, conversationFeature } from "./feature.js";
import { MemoryService, type SemanticExclusionPort } from "./memory.js";
import {
  ConversationGenerationProcessor,
  type ConversationGenerator,
} from "./generation.js";
import { conversationSocketTickets } from "./realtime-tickets.js";
import type { ConversationAllowance } from "./allowance.js";
import type { ProviderPolicy } from "../../../../../packages/api/src/conversation/contracts.js";

export function createConversationRuntime(input: {
  database: Database;
  access: AccessService;
  conversation: ConversationService;
  policy?: ProviderPolicy;
  generator?: ConversationGenerator;
  allowance?: ConversationAllowance;
  semantics?: SemanticExclusionPort;
  assertReady?: (scope: ThreadScope) => Promise<void>;
  citation?: (scope: ThreadScope, id: string) => Promise<unknown>;
}) {
  const memory = new MemoryService(input.database, input.semantics);
  const processor = input.generator
    ? new ConversationGenerationProcessor(
        input.database,
        input.conversation,
        memory,
        input.generator,
      )
    : undefined;
  input.conversation.configureDelivery({
    ...(input.policy ? { policyVersion: input.policy.version } : {}),
    ...(input.allowance ? { allowance: input.allowance } : {}),
    ...(input.assertReady ? { assertReady: input.assertReady } : {}),
    ...(input.citation ? { citation: input.citation } : {}),
  });
  const feature = new ConversationFeature(
    input.database,
    input.access,
    input.conversation,
    memory,
    input.policy,
    Boolean(
      input.generator &&
        input.allowance &&
        input.citation &&
        input.policy?.verified,
    ),
    (scope) => processor?.schedule(scope),
    conversationSocketTickets,
    input.citation,
  );
  return {
    feature,
    registration: conversationFeature(feature),
    memory,
    processor,
  };
}
