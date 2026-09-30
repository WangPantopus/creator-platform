import type { FeatureRegistration } from "./app.js";
import { createAgentRouter } from "./modules/agent/router.js";
import type { AgentService } from "./modules/agent/service.js";
import type { SourceService } from "./modules/sources/service.js";
import type { ShadowReplay } from "./modules/agent/shadow.js";
import { commerceFeature } from "./modules/commerce/registration.js";
import type { CommerceService } from "./modules/commerce/service.js";
import type { ExtendedCommerce } from "./modules/commerce/extended.js";
import {
  conversationFeature,
  type ConversationFeature,
} from "./modules/conversation/feature.js";
import { contentFeature } from "./modules/content/registration.js";
import type { ContentService } from "./modules/content/service.js";
import { studioFeature } from "./modules/studio/registration.js";
import type { StudioService } from "./modules/studio/service.js";
import { createGrowthRouter } from "./modules/growth/router.js";
import type { GrowthService } from "./modules/growth/service.js";
import { mediaFeature } from "./modules/media/registration.js";
import {
  createTrustRouter,
  type TrustRouterOptions,
} from "./modules/trust/router.js";

/** The host constructs owner services with approved configuration. W1 supplies the
 * same current actor and issued ThreadScope to every router. */
export function registerDomainFeatures(input: {
  conversation?: ConversationFeature;
  content?: ContentService;
  studio?: StudioService;
  agent?: {
    service: AgentService;
    sources: SourceService;
    development: boolean;
    shadow?: ShadowReplay;
  };
  commerce?: CommerceService;
  extendedCommerce?: ExtendedCommerce;
  growth?: GrowthService;
  media?: Parameters<typeof mediaFeature>[0];
  trust?: Omit<TrustRouterOptions, "actor">;
}): FeatureRegistration[] {
  const registrations: FeatureRegistration[] = [];
  if (input.conversation)
    registrations.push(conversationFeature(input.conversation));
  if (input.content) registrations.push(contentFeature(input.content));
  if (input.studio) registrations.push(studioFeature(input.studio));
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
  if (input.media) registrations.push(mediaFeature(input.media));
  if (input.trust)
    registrations.push({
      name: "trust",
      path: "/",
      router: ({ actorFor }) =>
        createTrustRouter({ ...input.trust!, actor: actorFor }),
    });
  return registrations;
}
