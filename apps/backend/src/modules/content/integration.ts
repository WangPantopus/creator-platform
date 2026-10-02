import type { Pool } from "pg";
import { ContentService, type ContentDependencies } from "./service.js";
import { contentFeature, contentSignedSubjects } from "./registration.js";
import { ContentSources } from "./sources.js";
import { contentPublicProjection } from "../growth/content.js";
import { createCommercePublicationPermission } from "../commerce/publication.js";
import { DomainError } from "../../core/errors.js";
import { StudioService } from "../studio/service.js";
import { studioFeature } from "../studio/registration.js";

/** W1 host seam: one service instance for HTTP and exact W1 signed subjects.
 * Production hosts supply W8's current scope denial callback. Each downstream
 * adapter remains explicit; missing producers cannot imply successful delivery.
 */
export function createContentStudio(input: {
  pool: Pool;
  owners: ConstructorParameters<typeof StudioService>[1];
  dependencies: ContentDependencies &
    Required<Pick<ContentDependencies, "assertAllowed">>;
}) {
  const content = new ContentService(input.pool, input.dependencies);
  const studio = new StudioService(content, input.owners);
  return {
    content,
    studio,
    features: [contentFeature(content), studioFeature(studio)],
    signedSubjects: contentSignedSubjects(content),
  };
}

/** Canonical background eligibility port shared with W7's consent collectors.
 * Its implementation must check the target's current fan visibility and the
 * verified, recovered creator; it never invents a signed-in fan Actor.
 */
export type CurrentThanksTarget = (input: {
  creatorId: string;
  fanAccountId: string;
  targetKind: string;
  targetId: string;
}) => Promise<boolean>;

export type ContentFollowReaders = {
  follows: NonNullable<ContentDependencies["follows"]>;
  count?: NonNullable<ContentDependencies["audienceCount"]>;
};

/** Bind W5 to genuine owner producers once, then share that exact instance with
 * HTTP, signing, media and distribution. Missing paths stay unavailable. The
 * host can feed these dependencies into either content or commerce assembly.
 */
export function composeContentHost(input: {
  pool: Pool;
  owners: ConstructorParameters<typeof StudioService>[1];
  dependencies: ContentDependencies &
    Required<Pick<ContentDependencies, "assertAllowed">>;
  sources?: {
    service: import("../sources/service.js").SourceService;
    repository: import("../agent/repository.js").AgentRepository;
  };
  growth?: {
    service: import("../growth/service.js").GrowthService;
    signing: Pick<
      import("../identity/signed-acts.js").SignedActService,
      "publicVerification"
    >;
    follows?: ContentFollowReaders;
  };
  paidAudienceCount?: NonNullable<ContentDependencies["audienceCount"]>;
  assertScopeAllowedInTransaction?: import("../access/scope.js").ScopeRestrictionInTransaction;
}) {
  if (
    (input.sources && input.sources.repository.pool !== input.pool) ||
    (input.growth && input.growth.service.db.runtime !== input.pool)
  )
    throw new Error(
      "Content producers must share the configured runtime pool.",
    );
  let content: ContentService | null = null;
  let sources: ContentSources | null = null;
  let projection: ReturnType<typeof contentPublicProjection> | null = null;
  const unavailable = () => {
    throw new DomainError(
      "content_producer_unconfigured",
      "This content producer is not connected in the current workspace.",
      503,
    );
  };
  const dependencies: ContentDependencies &
    Required<Pick<ContentDependencies, "assertAllowed">> = {
    ...input.dependencies,
    ...(input.growth?.follows ? { follows: input.growth.follows.follows } : {}),
    ...(input.growth?.follows?.count || input.paidAudienceCount
      ? {
          audienceCount: async (client, creatorId, audience) => {
            const reader =
              audience.kind === "followers"
                ? input.growth?.follows?.count
                : input.paidAudienceCount;
            const value = reader
              ? await reader(client, creatorId, audience)
              : null;
            if (value !== null && (!Number.isSafeInteger(value) || value < 0))
              throw new DomainError(
                "audience_count_unavailable",
                "Current audience size is unavailable.",
                503,
              );
            return value;
          },
        }
      : {}),
    ...(input.assertScopeAllowedInTransaction
      ? {
          publicPacket: createCommercePublicationPermission(
            input.assertScopeAllowedInTransaction,
          ),
          thanksMessage: currentThanksMessage(input.owners.access),
        }
      : {}),
    ...(input.sources
      ? {
          revokeSource: (actor, creatorId, contentId, version) =>
            sources
              ? sources.revoke(actor, creatorId, contentId, version)
              : unavailable(),
        }
      : {}),
    effect: async (actor, effect) => {
      if (effect.type === "source_candidate")
        return sources ? sources.candidate(actor, effect) : unavailable();
      if (effect.type === "source_revoke") {
        if (!sources) return unavailable();
        await sources.revoke(
          actor,
          effect.creatorId,
          effect.contentId,
          effect.version,
        );
        return { reference: `revoked:${effect.contentId}:${effect.version}` };
      }
      if (["published", "withdrawn"].includes(effect.type))
        return projection ? projection(actor, effect) : unavailable();
      return input.dependencies.effect
        ? input.dependencies.effect(actor, effect)
        : unavailable();
    },
  };
  return {
    owners: input.owners,
    dependencies,
    bindContent(service: ContentService) {
      if (service.pool !== input.pool || (content && content !== service))
        throw new Error(
          "Content composition must bind one service on its configured pool.",
        );
      if (
        service.dependencies.effect !== dependencies.effect ||
        service.dependencies.assertAllowed !== dependencies.assertAllowed
      )
        throw new Error(
          "Content composition must retain its configured producers and denial authority.",
        );
      content = service;
      if (input.sources)
        sources = new ContentSources(
          service,
          input.sources.service,
          input.sources.repository,
        );
      if (input.growth)
        projection = contentPublicProjection(
          input.growth.service,
          service,
          input.growth.signing,
        );
    },
  };
}

/** W5 Thanks accepts only a current delivered message in the fan's own pair.
 * W8's configured denial locks are held on the caller's actual transaction.
 */
function currentThanksMessage(
  access: import("../access/scope.js").AccessService,
): NonNullable<ContentDependencies["thanksMessage"]> {
  return async (client, actor, creatorId, messageId) => {
    const previous = (
      await client.query<{ fan_id: string | null; creator_id: string | null }>(
        "SELECT current_setting('app.fan_id',true) AS fan_id,current_setting('app.creator_id',true) AS creator_id",
      )
    ).rows[0]!;
    const fan = (
      await client.query<{ id: string }>(
        "SELECT id FROM creator.fan_profile WHERE account_id=$1",
        [actor.accountId],
      )
    ).rows[0];
    if (!fan) return null;
    await client.query("SELECT set_config('app.fan_id',$1,true)", [fan.id]);
    const pointer = (
      await client.query<{ thread_id: string }>(
        "SELECT thread_id FROM creator.message WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        [messageId, creatorId, fan.id],
      )
    ).rows[0];
    let threadId: string | null = null;
    if (pointer) {
      const scope = await access.openThreadInTransaction(
        client,
        actor,
        creatorId,
        fan.id,
        false,
        "read",
      );
      if (scope.authority === "fan" && scope.threadId === pointer.thread_id) {
        const current = await client.query(
          "SELECT m.id FROM creator.message m JOIN creator.creator_profile c ON c.id=m.creator_id WHERE m.id=$1 AND m.creator_id=$2 AND m.fan_id=$3 AND m.thread_id=$4 AND m.delivery_state='delivered' AND m.author_kind IN('ai','human_creator','approved_draft','human_call','human_broadcast') AND c.verification='verified' AND NOT c.recovery_required",
          [messageId, creatorId, fan.id, scope.threadId],
        );
        if (current.rowCount === 1) threadId = scope.threadId;
      }
    }
    await client.query(
      "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
      [previous.creator_id ?? "", previous.fan_id ?? "", actor.accountId],
    );
    return threadId;
  };
}
