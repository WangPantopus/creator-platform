import type { FeatureRegistration } from "./app.js";
import { createAgentRouter } from "./modules/agent/router.js";
import type { AgentService } from "./modules/agent/service.js";
import type { SourceService } from "./modules/sources/service.js";
import { commerceFeature } from "./modules/commerce/registration.js";
import type { CommerceService } from "./modules/commerce/service.js";
import type { ExtendedCommerce } from "./modules/commerce/extended.js";
import { createGrowthRouter } from "./modules/growth/router.js";
import type { GrowthService } from "./modules/growth/service.js";
import {
  createW6Router,
  type W6RouterDependencies,
} from "./modules/media/router.js";
import {
  createTrustRouter,
  type TrustRouterOptions,
} from "./modules/trust/router.js";

/** The host constructs owner services with approved configuration. W1 supplies the
 * same current actor and issued ThreadScope to every router. */
export function registerDomainFeatures(input: {
  agent?: {
    service: AgentService;
    sources: SourceService;
    development: boolean;
  };
  commerce?: CommerceService;
  extendedCommerce?: ExtendedCommerce;
  growth?: GrowthService;
  media?: Omit<W6RouterDependencies, "scopeFor">;
  trust?: Omit<TrustRouterOptions, "actor">;
}): FeatureRegistration[] {
  const registrations: FeatureRegistration[] = [];
  if (input.agent)
    registrations.push({
      name: "agent",
      path: "/v1/agent",
      router: ({ actorFor }) =>
        createAgentRouter({ ...input.agent!, resolveActor: actorFor }),
    });
  if (input.commerce)
    registrations.push(commerceFeature(input.commerce, input.extendedCommerce));
  if (input.growth)
    registrations.push({
      name: "growth",
      path: "/v1/growth",
      router: ({ actorFor }) => createGrowthRouter(input.growth!, actorFor),
    });
  if (input.media)
    registrations.push({
      name: "media",
      path: "/v1/w6",
      router: ({ scopeFor }) => createW6Router({ ...input.media, scopeFor }),
    });
  if (input.trust)
    registrations.push({
      name: "trust",
      path: "/",
      router: ({ actorFor }) =>
        createTrustRouter({ ...input.trust!, actor: actorFor }),
    });
  return registrations;
}
