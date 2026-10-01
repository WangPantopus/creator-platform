import type { FeatureRegistration } from "../../app.js";
import type { IdentityProfiles } from "../identity/profiles.js";
import type { Actor } from "../identity/adapter.js";
import type { GrowthOwners } from "./contracts.js";
import type { GrowthService } from "./service.js";
import { createGrowthRouter } from "./router.js";

/** W1's configured host mounts this before its terminal 404 and resolves each session. */
export function registerGrowth(
  service: GrowthService,
  options: Parameters<typeof createGrowthRouter>[2] = {},
): FeatureRegistration {
  return {
    name: "growth",
    path: "/v1/growth",
    router: ({ actorFor }) => createGrowthRouter(service, actorFor, options),
  };
}

/** Only the current owned verified creator gains Studio authority; team rights stay distinct. */
export function canonicalCreatorOwner(
  profiles: IdentityProfiles,
  assertAllowed: (actor: Actor, creatorId?: string) => Promise<void>,
): GrowthOwners["creatorFor"] {
  return async (actor) => {
    await assertAllowed(actor);
    const profile = await profiles.view(actor);
    const creator = profile.creator;
    if (!creator || creator.verification !== "verified") return null;
    await assertAllowed(actor, creator.id);
    return creator.id as string;
  };
}

/** W4 reads the displayed page under current account/session authority. */
export function canonicalPassAccess(
  commerce: import("../commerce/service.js").CommerceService,
): GrowthOwners["discoveryAccess"] {
  return (actor, creatorIds) => commerce.passDiscovery(actor, creatorIds);
}
