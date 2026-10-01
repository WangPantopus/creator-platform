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
import { ConversationWellbeing, type ConversationMode } from "./wellbeing.js";
import type { CommerceService } from "../commerce/service.js";
import { invariant } from "../../core/errors.js";

export function createConversationRuntime(input: {
  database: Database;
  access: AccessService;
  conversation: ConversationService;
  policy?: ProviderPolicy;
  generator?: ConversationGenerator;
  generatorFactory?: (memory: MemoryService) => ConversationGenerator;
  allowance?: ConversationAllowance;
  /** From W4's awaited prepared runtime, using this exact AccessService.
   * Keep allowance absent to select its single canonical generation path. */
  generationAllowanceAvailable?: boolean;
  firstConversation?: Pick<CommerceService, "openTrial">;
  semantics?: SemanticExclusionPort;
  mode?: ConversationMode;
  assertReady?: (scope: ThreadScope, client: PoolClient) => Promise<void>;
  assertApproved?: (
    scope: ThreadScope,
    client: PoolClient,
    sentence: ApprovedSentence,
  ) => Promise<void>;
  citation?: (scope: ThreadScope, id: string) => Promise<unknown>;
}) {
  invariant(
    !(input.allowance && input.generationAllowanceAvailable),
    "allowance_conflict",
    "Configure one generation allowance path.",
  );
  const memory = new MemoryService(input.database, input.semantics);
  const wellbeing = new ConversationWellbeing(input.database, input.mode);
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
    wellbeing,
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
        generator.executionAttributed &&
        generator.seal &&
        (input.allowance || input.generationAllowanceAvailable) &&
        input.citation &&
        input.assertReady &&
        input.assertApproved &&
        input.policy?.verified,
    ),
    (scope) => processor?.schedule(scope),
    conversationSocketTickets,
    input.citation,
    wellbeing,
    input.firstConversation,
    generator?.routeSafety
      ? (scope, text, signal, deliver) =>
          generator.routeSafety!(
            scope,
            text,
            {
              current: (current) => memory.context(current),
              assertProcessorConsent: (current) =>
                input.conversation.assertProcessorConsent(current),
              assertDeliveryCurrent: (current, expected) =>
                input.conversation.assertSafetyCurrent(current, expected),
            },
            signal,
            deliver,
          )
      : undefined,
    (scope, epoch) => processor?.interrupt(scope.threadId, epoch),
  );
  return {
    feature,
    registration: conversationFeature(feature),
    memory,
    wellbeing,
    processor,
    close: () => processor?.close(),
  };
}
