import type { FeatureRegistration } from "../../app.js";
import { createW6Router, type W6RouterDependencies } from "./router.js";

/** Canonical bootstrap supplies W1's fresh actor/thread authority. No competing identity middleware. */
export function mediaFeature(
  services: Omit<W6RouterDependencies, "scopeFor" | "creatorScopeFor">,
): FeatureRegistration {
  return {
    name: "media",
    path: "/v1/w6",
    router: ({ scopeFor, actorFor }) => {
      const creatorIdentity =
        services.creatorMedia?.identity ?? services.availability?.identity;
      return createW6Router({
        ...services,
        scopeFor,
        creatorScopeFor: creatorIdentity
          ? async (req) =>
              creatorIdentity.open(
                await actorFor(req),
                String(req.params.creatorId),
              )
          : undefined,
      });
    },
  };
}
