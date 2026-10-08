import type { PoolClient } from "pg";
import { ConversationOfflineIssuer } from "./offline.js";
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
import { DevelopmentConversationPolicy } from "./development-policy.js";
import type { ConversationLineage } from "./lineage.js";
import type { ConversationRecordings } from "./recordings.js";
import type { ConversationCorrections } from "./corrections.js";
import type { GenerationCostReconciliation } from "../commerce/generation-allowance.js";
import type { CommerceFulfillmentPlans } from "../commerce/fulfillment-plans.js";
import { PreparedGenerationAcceptance } from "./generation-acceptance.js";

export function createConversationRuntime(input: {
  database: Database;
  access: AccessService;
  conversation: ConversationService;
  policy?: ProviderPolicy;
  developmentPolicy?: DevelopmentConversationPolicy;
  offlineIssuer?: { origin: string; environment: string | undefined };
  generator?: ConversationGenerator;
  generatorFactory?: (memory: MemoryService) => ConversationGenerator;
  generationAcceptance?: PreparedGenerationAcceptance;
  allowance?: ConversationAllowance;
  /** W4's prepared port proves the exact configured AccessService identity.
   * Keep allowance absent to select its single canonical generation path. */
  generationCostReconciliation?: GenerationCostReconciliation;
  firstConversation?: Pick<
    CommerceService,
    "pool" | "firstConversationAvailable" | "openTrialInTransaction"
  >;
  semantics?: SemanticExclusionPort;
  mode?: ConversationMode;
  /** Prepared only after W8's real migration/checksum and lifecycle policy. */
  lineage?: ConversationLineage;
  corrections?: ConversationCorrections;
  recordings?: ConversationRecordings;
  comparisons?: {
    consent: import("./comparison-consent.js").ConversationComparisonConsent;
    samples: import("./comparison-samples.js").ConversationComparisonSamples;
  };
  fulfillmentPlans?: CommerceFulfillmentPlans;
  assertReady?: (scope: ThreadScope, client: PoolClient) => Promise<void>;
  assertApproved?: (
    scope: ThreadScope,
    client: PoolClient,
    sentence: ApprovedSentence,
  ) => Promise<void>;
  citation?: (scope: ThreadScope, id: string) => Promise<unknown>;
}) {
  invariant(
    !input.developmentPolicy ||
      (input.developmentPolicy instanceof DevelopmentConversationPolicy &&
        input.policy &&
        input.developmentPolicy.isFor(input.database.pool, input.policy)),
    "synthetic_policy_pool_mismatch",
    "The development policy must belong to this conversation database and exact policy.",
  );
  invariant(
    !(input.allowance && input.generationCostReconciliation),
    "allowance_conflict",
    "Configure one generation allowance path.",
  );
  invariant(
    !input.corrections || input.lineage,
    "correction_lineage_unavailable",
    "Signed corrections require the prepared original-message lineage projection.",
  );
  invariant(
    !input.firstConversation ||
      input.firstConversation.pool === input.database.pool,
    "trial_pool_mismatch",
    "First-conversation admission must use this actual conversation database pool.",
  );
  invariant(
    !input.recordings || input.lineage,
    "recording_lineage_unavailable",
    "Recordings require their actual prepared message lineage projection.",
  );
  if (input.recordings) {
    input.recordings.assertRuntime(input.database, input.access);
    input.lineage!.configureRecordings(input.recordings);
  }
  if (input.fulfillmentPlans)
    input.conversation.configureFulfillmentPlans(input.fulfillmentPlans);
  const memory = new MemoryService(input.database, input.semantics);
  const wellbeing = new ConversationWellbeing(input.database, input.mode);
  const acceptance = input.generationAcceptance;
  invariant(
    !acceptance ||
      (acceptance instanceof PreparedGenerationAcceptance &&
        !input.generator &&
        !input.generatorFactory &&
        !input.allowance &&
        input.generationCostReconciliation),
    "generation_execution_conflict",
    "Scoped generation requires its original acceptance and cost reconciliation.",
  );
  acceptance?.assertComposition(input.database, input.access);
  const generator = input.generator ?? input.generatorFactory?.(memory);
  const journal = acceptance?.journal ?? generator?.journal;
  journal?.assertPool(input.database.pool);
  const assertReady = acceptance
    ? async (scope: ThreadScope, client: PoolClient) => {
        await acceptance.assertReady(scope, client);
        await input.assertReady?.(scope, client);
      }
    : input.assertReady;
  const citation = acceptance
    ? acceptance.citation.bind(acceptance)
    : input.citation;
  const routeSafety = acceptance
    ? acceptance.routeSafety.bind(acceptance)
    : generator?.routeSafety?.bind(generator);
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
    ...(input.generationCostReconciliation
      ? { reconciliation: input.generationCostReconciliation }
      : {}),
    ...(assertReady ? { assertReady } : {}),
    ...(input.assertApproved ? { assertApproved: input.assertApproved } : {}),
    ...(citation ? { citation } : {}),
    ...(input.lineage ? { lineage: input.lineage } : {}),
    ...(journal ? { journal } : {}),
    ...(acceptance ? { generationAcceptance: acceptance } : {}),
  });
  const feature = new ConversationFeature(
    input.database,
    input.access,
    input.conversation,
    memory,
    input.policy,
    Boolean(
      (acceptance ||
        (generator &&
          generator.executionAttributed &&
          generator.journal &&
          generator.seal &&
          input.assertApproved)) &&
        (input.allowance || input.generationCostReconciliation) &&
        citation &&
        assertReady &&
        (input.policy?.verified || input.developmentPolicy),
    ),
    (scope) => processor?.schedule(scope),
    conversationSocketTickets,
    citation,
    wellbeing,
    input.firstConversation,
    routeSafety
      ? (scope, text, signal, deliver) =>
          routeSafety(
            scope,
            text,
            {
              current: (current) => memory.context(current),
              safetyCheckpoint: (current) =>
                input.conversation.safetyCheckpoint(current),
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
    input.lineage,
    input.corrections,
    assertReady,
    input.recordings,
    input.offlineIssuer
      ? new ConversationOfflineIssuer(
          input.offlineIssuer.origin,
          input.offlineIssuer.environment,
        )
      : undefined,
    input.developmentPolicy,
    acceptance ? () => acceptance.isRunning : undefined,
    input.comparisons,
  );
  return {
    feature,
    registration: conversationFeature(feature),
    memory,
    wellbeing,
    processor,
    signedSubjectPolicies: [
      ...(input.corrections ? [input.corrections.signedSubjectPolicy()] : []),
      ...(input.recordings ? [input.recordings.signedSubjectPolicy()] : []),
    ],
    close: () => processor?.close(),
  };
}
