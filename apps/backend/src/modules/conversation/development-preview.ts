import type { Pool } from "pg";
import { z } from "zod";
import type { FeatureRegistration } from "../../app.js";
import { invariant } from "../../core/errors.js";
import { AgentRepository } from "../agent/repository.js";
import { AgentPipeline } from "../agent/pipeline.js";
import { AgentService } from "../agent/service.js";
import { modelFromEnvironment } from "../agent/model.js";
import { createAgentRouter } from "../agent/router.js";
import { SourceService } from "../sources/service.js";
import { IngestionWorker } from "../ingestion/worker.js";

/** Explicit local draft demonstration. Canonical W1 sessions and W2 source,
 * ingestion, retrieval and guardrail pipeline are used. Development publication
 * is refused by W2; this never issues verification, a license or fan allowance. */
export function syntheticDraftPreview(pool: Pool, origin: string) {
  invariant(
    process.env.NODE_ENV === "development" &&
      process.env.W3_DEVELOPMENT_MODE === "true" &&
      process.env.W3_SYNTHETIC_PREVIEW === "true" &&
      ["localhost", "127.0.0.1"].includes(new URL(origin).hostname),
    "development_preview_unavailable",
    "Synthetic draft preview requires explicit loopback development mode.",
  );
  const repository = new AgentRepository(pool);
  const model = modelFromEnvironment();
  const service = new AgentService(
    repository,
    new AgentPipeline(repository, model),
  );
  const sources = new SourceService(repository);
  const ingestion = new IngestionWorker(repository, model);
  const controller = new AbortController();
  const creatorId = process.env.W3_SYNTHETIC_CREATOR_ID;
  const accountId = process.env.W3_SYNTHETIC_OWNER_ID;
  invariant(
    Boolean(creatorId) === Boolean(accountId),
    "development_owner_required",
    "Configure both canonical synthetic creator and owner identifiers for ingestion.",
  );
  if (creatorId) z.uuid().parse(creatorId);
  if (accountId) z.uuid().parse(accountId);
  // Explicitly selected synthetic owner only; no private creator enumeration.
  const timer =
    creatorId && accountId
      ? setInterval(() => {
          void ingestion
            .tick(
              { creatorId, accountId, development: true },
              controller.signal,
            )
            .catch(() =>
              process.stderr.write(
                "Synthetic source processing is unavailable; inspect its saved source state.\n",
              ),
            );
        }, 1000)
      : undefined;
  timer?.unref();
  const registration: FeatureRegistration = {
    name: "synthetic-draft-preview",
    path: "/v1/agent",
    router: ({ actorFor }) =>
      createAgentRouter({
        service,
        sources,
        resolveActor: actorFor,
        development: true,
      }),
  };
  return {
    registration,
    providerConfigured: Boolean(model),
    close() {
      if (timer) clearInterval(timer);
      controller.abort();
    },
  };
}
