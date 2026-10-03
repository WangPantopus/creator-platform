import type { Pool } from "pg";
import { AgentRepository } from "./repository.js";
import { AgentPipeline } from "./pipeline.js";
import { AgentService, type LicenseVerifier } from "./service.js";
import {
  LiveAgentRuntime,
  type AudiencePort,
  type ConversationContextPort,
} from "./runtime.js";
import { AgentLifecycle } from "./lifecycle.js";
import { SourceService } from "../sources/service.js";
import { IngestionWorker } from "../ingestion/worker.js";
import { ShadowReplay, type PrivacyParaphrasePort } from "./shadow.js";
import type { AgentModel } from "./model.js";
import {
  agentNoticeHook,
  agentPrivacyHook,
  type AgentExportArtifactSink,
  type AgentTrustAuthority,
} from "./trust-adapter.js";
import type { EffectHook } from "../trust/contracts.js";
import type { PreparedGenerationJournal } from "./generation-journal.js";
import type { PreparedUsageRetention } from "./usage-retention.js";

/** The configured host supplies canonical authorities and approved providers.
 * Missing producers remain explicit; constructing Studio never enables fan delivery. */
export function createAgentDomain(input: {
  pool: Pool;
  model: AgentModel | null;
  licenseVerifier?: LicenseVerifier;
  conversation?: ConversationContextPort;
  audience?: AudiencePort;
  shadowFeed?: PrivacyParaphrasePort;
  trust?: AgentTrustAuthority;
  exports?: AgentExportArtifactSink;
  /** Opt-in owner producer for W8's actual configured stream coordinator/store. */
  coordinatorExportStream?: boolean;
  usageJournal?: PreparedGenerationJournal;
  usageRetention?: PreparedUsageRetention;
  settleDeparture?: (
    input: Parameters<EffectHook["run"]>[0],
  ) => Promise<{ complete: boolean; receipt: Record<string, unknown> }>;
}) {
  const repository = new AgentRepository(input.pool, input.usageJournal);
  const service = new AgentService(
    repository,
    new AgentPipeline(repository, input.model),
    input.licenseVerifier ?? null,
  );
  const runtime =
    input.conversation && input.audience
      ? new LiveAgentRuntime(service, input.conversation, input.audience)
      : null;
  const lifecycle = new AgentLifecycle(
    repository,
    runtime,
    input.usageRetention,
  );
  const sources = new SourceService(repository, (creatorId) =>
    runtime?.interruptCreator(creatorId),
  );
  return {
    service,
    sources,
    runtime,
    lifecycle,
    ingestion: new IngestionWorker(repository, input.model),
    shadow: input.shadowFeed
      ? new ShadowReplay(service, input.shadowFeed)
      : undefined,
    privacy: input.trust
      ? agentPrivacyHook(
          service,
          lifecycle,
          input.trust,
          input.exports,
          input.coordinatorExportStream,
        )
      : undefined,
    effects:
      input.trust && input.settleDeparture
        ? (["agent.pause", "agent.revoke_license"] as const).map((type) =>
            agentNoticeHook(
              type,
              lifecycle,
              input.trust!,
              input.settleDeparture!,
            ),
          )
        : [],
    readiness: {
      provider: Boolean(input.model?.pricingConfigured),
      licensing: Boolean(input.licenseVerifier),
      conversation: Boolean(
        runtime && input.conversation?.assertProcessorConsent,
      ),
      atomicDelivery: Boolean(
        runtime &&
          input.audience?.currentInTransaction &&
          input.licenseVerifier?.isCurrentInTransaction,
      ),
      shadow: Boolean(input.shadowFeed),
      trust: Boolean(input.trust && input.settleDeparture),
      exports: Boolean(input.exports),
      exportStreamProducer: Boolean(
        input.trust && input.coordinatorExportStream,
      ),
      usageJournal: Boolean(input.usageJournal),
    },
  };
}
