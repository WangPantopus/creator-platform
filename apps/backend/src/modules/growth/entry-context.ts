import { z } from "zod";
import { copy } from "@qelvora/copy";
import type { Actor } from "../identity/adapter.js";
import { requestAuthority } from "../identity/request-authority.js";
import { DomainError } from "../../core/errors.js";
import { Destination } from "./contracts.js";
import {
  PostEntryContextSchema,
  type PostEntryContext,
} from "../../../../../packages/api/src/growth.js";
export type { PostEntryContext } from "../../../../../packages/api/src/growth.js";
import type { GrowthService } from "./service.js";

/** W5's actual current recipient/public-entry purpose reads only metadata on
 * its genuine held client, with current publication, source withdrawal and
 * recipient denial checked before and after the read. Publisher proof, Follow
 * metadata and the public projection cannot substitute for this reader. */
export interface CurrentPostEntryReader {
  current(input: {
    actor: Actor;
    creatorId: string;
    contentId: string;
  }): Promise<{
    creatorId: string;
    contentId: string;
    version: number;
    title: string;
  } | null>;
}
const PostReference = z.strictObject({
  creatorId: z.uuid(),
  contentId: z.uuid(),
  version: z.int().positive().max(2147483647),
  title: z.string().max(180),
});
const Entry = z.strictObject({
  handle: z.string().regex(/^[a-z0-9_]{3,30}$/u),
  contentId: z.uuid(),
});

/** A displayable immutable reference, never body, processor/reuse consent or
 * continuing private read authority. W3 must preserve the UUID through entry
 * and sign-in, and call the real reader again when displaying that reference.
 * Generation obtains its separate actual current purpose/consent/lineage.
 * This consumer opens no transaction and manufactures no Actor or scope. */
export function canonicalPostEntryContext(
  growth: Pick<GrowthService, "creator">,
  reader?: CurrentPostEntryReader,
) {
  return async (
    actor: Actor,
    input: unknown,
  ): Promise<PostEntryContext | null> => {
    const entry = Entry.parse(input),
      authority = requestAuthority.getStore();
    if (!actor.adultEligible || authority?.accountId !== actor.accountId)
      throw new DomainError(
        "growth_entry_session_required",
        copy.growthErrorGrowthAuthorityRequired,
        401,
      );
    if (!reader)
      throw new DomainError(
        "growth_entry_context_unconfigured",
        copy.growthThisDestinationIsUnavailableReconnectAndTryAgain,
        503,
      );
    const creator = await growth.creator(entry.handle);
    if (!creator?.verified || creator.state !== "published") return null;
    const supplied = await reader.current({
      actor,
      creatorId: creator.id,
      contentId: entry.contentId,
    });
    if (supplied === null) return null;
    // Strict metadata rejects a complete/private body or signing command.
    const post = PostReference.parse(supplied);
    if (post.creatorId !== creator.id || post.contentId !== entry.contentId)
      throw new DomainError(
        "growth_entry_context_changed",
        copy.growthThisDestinationIsUnavailableReconnectAndTryAgain,
        503,
      );
    const current = await growth.creator(entry.handle);
    if (
      !current?.verified ||
      current.id !== creator.id ||
      current.handle !== creator.handle ||
      current.state !== "published"
    )
      return null;
    // Finish on the actual owner reader again after the public projection read.
    // A title/version changed or withdrawn during that read cannot be returned
    // as the original reference; the owner also rechecks the held W1 session.
    const final = await reader.current({
      actor,
      creatorId: creator.id,
      contentId: entry.contentId,
    });
    if (final === null) return null;
    const fresh = PostReference.parse(final);
    if (
      fresh.creatorId !== post.creatorId ||
      fresh.contentId !== post.contentId ||
      fresh.version !== post.version ||
      fresh.title !== post.title
    )
      throw new DomainError(
        "growth_entry_context_changed",
        copy.growthThisDestinationIsUnavailableReconnectAndTryAgain,
        503,
      );
    return Object.freeze(
      PostEntryContextSchema.parse({
        source: "post" as const,
        creatorId: post.creatorId,
        contentId: post.contentId,
        version: post.version,
        title: post.title,
        destination: Destination.parse(
          `/creators/${current.handle}/posts/${post.contentId}`,
        ),
      }),
    );
  };
}
