import type { PoolClient } from "pg";
import type { ApprovedSentence } from "../agent/runtime.js";
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
  generatorFactory?: (memory: MemoryService) => ConversationGenerator;
  allowance?: ConversationAllowance;
  semantics?: SemanticExclusionPort;
  assertReady?: (scope: ThreadScope, client: PoolClient) => Promise<void>;
  assertApproved?: (
    scope: ThreadScope,
    client: PoolClient,
    sentence: ApprovedSentence,
  ) => Promise<void>;
  citation?: (scope: ThreadScope, id: string) => Promise<unknown>;
}) {
  const memory = new MemoryService(input.database, input.semantics);
  const generator = input.generator ?? input.generatorFactory?.(memory);
  const processor = generator
    ? new ConversationGenerationProcessor(
        input.database,
        input.conversation,
        memory,
        generator,
      )
    : undefined;
  input.conversation.configureDelivery({
    ...(input.policy ? { policyVersion: input.policy.version } : {}),
    ...(input.allowance ? { allowance: input.allowance } : {}),
    ...(input.assertReady ? { assertReady: input.assertReady } : {}),
    ...(input.assertApproved ? { assertApproved: input.assertApproved } : {}),
    ...(input.citation ? { citation: input.citation } : {}),
  });
  const feature = new ConversationFeature(
    input.database,
    input.access,
    input.conversation,
    memory,
    input.policy,
    Boolean(
      generator &&
        input.allowance &&
        input.citation &&
        input.assertReady &&
        input.assertApproved &&
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
