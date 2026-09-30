import type { FeatureRegistration } from "../../app.js";
import { createW6Router, type W6RouterDependencies } from "./router.js";

/** Canonical bootstrap supplies W1's fresh actor/thread authority. No competing identity middleware. */
export function mediaFeature(
  services: Omit<W6RouterDependencies, "scopeFor">,
): FeatureRegistration {
  return {
    name: "media",
    path: "/v1/w6",
    router: ({ scopeFor }) => createW6Router({ ...services, scopeFor }),
  };
}
