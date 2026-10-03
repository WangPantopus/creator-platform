import type { Pool } from "pg";
import { ContentService, type ContentDependencies } from "./service.js";
import { contentFeature, contentSignedSubjects } from "./registration.js";
import { ContentSources } from "./sources.js";
import { contentPublicProjection } from "../growth/content.js";
import { createCommercePublicationPermission } from "../commerce/publication.js";
export {
  createCurrentContentPostEntryReader,
  type CurrentContentPostEntryReader,
} from "./post-entry.js";
import { assertCommercePublicationSource } from "../commerce/publication-source.js";
export {
  PreparedContentGenerationOrigins,
  GENERATION_CONTENT_ORIGIN_MIGRATION,
  GENERATION_CONTENT_ORIGIN_SIGNATURE,
  type GenerationContentOriginSource,
} from "./generation-origin.js";
import { DomainError } from "../../core/errors.js";
import { StudioService } from "../studio/service.js";
import { studioFeature } from "../studio/registration.js";
import {
  createContentCreatorTenureHost,
  createContentTenureHost,
} from "./tenure.js";
import {
  ContentPublicationWorker,
  type ContentPublicationDependencies,
} from "./publication.js";

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
  if (input.dependencies.publicationSource)
    assertCommercePublicationSource(
      input.dependencies.publicationSource,
      input.pool,
    );
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
  /** Propagates the real worker deadline; it cannot grant target access. */
  signal?: AbortSignal;
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
  /** W7's actual canonical-core reader can remain on Content's held client
   * while public projection uses a separately configured Growth API pool. */
  followReaders?: ContentFollowReaders;
  paidAudienceCount?: NonNullable<ContentDependencies["audienceCount"]>;
  tenure?: Parameters<typeof createContentTenureHost>[0];
  creatorTenure?: Parameters<typeof createContentCreatorTenureHost>[0];
  /** Use W7's contentPublicProjection bound to this exact Content service.
   * This producer is neither a recipient grant nor a background purpose. */
  publicProjection?: NonNullable<ContentDependencies["effect"]>;
  publication?: ContentPublicationDependencies;
  publicationSource?: ContentDependencies["publicationSource"];
  groupPublication?: ContentDependencies["groupPublication"];
  packetRead?: {
    prepare: NonNullable<ContentDependencies["preparePublicPacketRead"]>;
    preparePositive: NonNullable<
      ContentDependencies["preparePublicPacketReadPositive"]
    >;
    read: NonNullable<ContentDependencies["publicPacketRead"]>;
  };
  assertScopeAllowedInTransaction?: import("../access/scope.js").ScopeRestrictionInTransaction;
}) {
  if (input.publicationSource)
    assertCommercePublicationSource(input.publicationSource, input.pool);
  if (input.dependencies.publicationSource)
    assertCommercePublicationSource(
      input.dependencies.publicationSource,
      input.pool,
    );
  if (
    input.publicationSource &&
    input.dependencies.publicationSource &&
    input.publicationSource !== input.dependencies.publicationSource
  )
    throw new Error(
      "Content composition must retain one actual publication source.",
    );
  if (input.growth && input.growth.service.db.runtime !== input.pool)
    throw new Error(
      "Content and Growth must share the configured runtime pool.",
    );
  const follows = input.followReaders ?? input.growth?.follows;
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
    ...(input.groupPublication
      ? { groupPublication: input.groupPublication }
      : {}),
    ...(input.tenure ? createContentTenureHost(input.tenure) : {}),
    ...(input.creatorTenure
      ? createContentCreatorTenureHost(input.creatorTenure)
      : {}),
    ...(input.publicationSource
      ? { publicationSource: input.publicationSource }
      : {}),
    ...(input.packetRead
      ? {
          preparePublicPacketRead: input.packetRead.prepare,
          preparePublicPacketReadPositive: input.packetRead.preparePositive,
          publicPacketRead: input.packetRead.read,
        }
      : {}),
    ...(follows ? { follows: follows.follows } : {}),
    ...(follows?.count || input.paidAudienceCount
      ? {
          audienceCount: async (client, creatorId, audience) => {
            // W4's count is creator authoring metadata. A fan or Team view
            // must neither call that owner-only port nor substitute its owner.
            const owner = await client.query<{ owned: boolean }>(
              "SELECT account_id=nullif(current_setting('app.account_id',true),'')::uuid AS owned FROM creator.creator_profile WHERE id=$1",
              [creatorId],
            );
            if (owner.rows[0]?.owned !== true) return null;
            const reader =
              audience.kind === "followers"
                ? follows?.count
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
      if (["published", "withdrawn"].includes(effect.type)) {
        if (!content) return unavailable();
        return projection
          ? projection(actor, effect)
          : input.publicProjection
            ? input.publicProjection(actor, effect)
            : unavailable();
      }
      return input.dependencies.effect
        ? input.dependencies.effect(actor, effect)
        : unavailable();
    },
  };
  return {
    owners: input.owners,
    dependencies,
    publicationWorker: input.publication
      ? new ContentPublicationWorker(input.publication)
      : null,
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
