import type { FeatureRegistration } from "../../app.js";
import type { Pool } from "pg";
import { invariant } from "../../core/errors.js";
import type { createAgentDomain } from "./integration.js";
import { createAgentRouter } from "./router.js";

/** Register owner Studio routes with W1's actual actorFor. The host retains
 * session/current-denial authority; W2 still verifies ownership under RLS.
 * This registration does not configure a fan generator or enable publication. */
export function agentFeature(input: {
  domain: ReturnType<typeof createAgentDomain>;
  pool: Pool;
  development: boolean;
}): FeatureRegistration {
  const { service, sources, shadow } = input.domain;
  const development = input.development;
  invariant(
    service.repository.pool === input.pool,
    "agent_pool_mismatch",
    "Register Creator AI on its canonical host runtime pool.",
  );
  return Object.freeze({
    name: "creator-ai",
    path: "/v1/agent",
    router: ({ actorFor }: Parameters<FeatureRegistration["router"]>[0]) =>
      createAgentRouter({
        service,
        sources,
        shadow,
        development,
        resolveActor: actorFor,
      }),
  });
}
