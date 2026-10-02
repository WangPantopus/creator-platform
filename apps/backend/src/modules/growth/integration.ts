import type { PoolClient } from "pg";
import { z } from "zod";
import { copy } from "@qelvora/copy";
import {
  assertCurrentSession,
  requestAuthority,
} from "../identity/request-authority.js";
import { DomainError } from "../../core/errors.js";
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

/** Bounded account-scoped W4 read; no spending/ledger data enters the projection. */
export function canonicalPassAccess(
  commerce: import("../commerce/service.js").CommerceService,
  publicCreatorIds: () => Promise<string[]>,
): GrowthOwners["discoveryAccess"] {
  return async (actor) => {
    const overview = await commerce.overview(actor);
    if (
      !overview.policy.passEnabled ||
      !overview.pass.some(
        (pass) =>
          pass.state === "active" &&
          new Date(pass.cycle_end).valueOf() > Date.now(),
      )
    )
      return { enabled: false, markers: [] };
    const creatorIds = await publicCreatorIds(),
      now = Date.now();
    return {
      enabled: true,
      markers: creatorIds.slice(0, 100).map((creatorId) => {
        const slots = overview.slots.filter(
          (slot) =>
            slot.creator_id === creatorId &&
            new Date(slot.ends_at).valueOf() > now,
        );
        const active = slots.find(
          (slot) =>
            slot.state === "active" &&
            new Date(slot.starts_at).valueOf() <= now,
        );
        const scheduled = slots
          .filter(
            (slot) =>
              slot.state === "draft_next" &&
              new Date(slot.starts_at).valueOf() > now,
          )
          .sort(
            (a, b) =>
              new Date(a.starts_at).valueOf() - new Date(b.starts_at).valueOf(),
          )[0];
        return {
          creatorId,
          state: active ? "active" : scheduled ? "draft_next" : "none",
          startsAt:
            scheduled && !active
              ? new Date(scheduled.starts_at).toISOString()
              : null,
        };
      }),
    };
  };
}

/** W5's interactive follower audience uses the caller's held transaction.
 * A separate-pool Boolean would release the follow lock before content read.
 * Background purpose scopes must use their own approved issuer instead. */
export function canonicalContentFollows() {
  return async (client: PoolClient, accountId: string, creatorId: string) => {
    z.uuid().parse(accountId);
    z.uuid().parse(creatorId);
    const authority = requestAuthority.getStore();
    if (!authority || authority.accountId !== accountId)
      throw new DomainError(
        "growth_authority_required",
        copy.growthErrorGrowthAuthorityRequired,
        503,
      );
    await assertCurrentSession(client, accountId);
    const context = (
      await client.query(
        `SELECT current_setting('app.account_id',true) AS account_id,
         pg_current_xact_id_if_assigned() IS NOT NULL AS held,
         pg_has_role(current_user,'growth_runtime','MEMBER') AS runtime,
         pg_has_role(current_user,'growth_worker','MEMBER') AS worker,
         r.rolsuper,r.rolbypassrls,
         EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='growth' AND c.relowner=r.oid) AS owns
         FROM pg_roles r WHERE r.rolname=current_user`,
      )
    ).rows[0];
    if (
      context?.account_id !== accountId ||
      !context.held ||
      !context.runtime ||
      context.worker ||
      context.rolsuper ||
      context.rolbypassrls ||
      context.owns
    )
      throw new DomainError(
        "growth_authority_required",
        copy.growthErrorGrowthAuthorityRequired,
        503,
      );
    return Boolean(
      (
        await client.query(
          "SELECT 1 FROM growth.follow WHERE account_id=$1 AND creator_id=$2 FOR SHARE",
          [accountId, creatorId],
        )
      ).rowCount,
    );
  };
}
