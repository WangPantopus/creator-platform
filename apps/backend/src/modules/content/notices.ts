import { copy } from "@qelvora/copy";
import type { Pool } from "pg";
import {
  ContentAudience,
  type Audience,
} from "../../../../../packages/api/src/content.js";
import { DomainError } from "../../core/errors.js";
import type { GrowthOwners, NotificationState } from "../growth/contracts.js";
import type { GrowthRelay } from "../growth/relay.js";
import type { Actor } from "../identity/adapter.js";
import type { ContentService } from "./service.js";
import { ThreadPresence } from "./thread-presence.js";

export type ContentEffect = {
  id: string;
  creatorId: string;
  contentId: string;
  version: number;
  type: string;
  subjectKind?: "content" | "reply" | "thanks";
};

const unavailable: NotificationState = {
  available: false,
  authorized: false,
  version: 0,
  creatorName: "",
  authorKind: "system",
  safePreview: "",
  destination: "/notifications",
};
function refused(code: string, message: string, status = 503) {
  return new DomainError(code, message, status);
}

/** Who is told about a Note or a reaction, decided where authority exists.
 *
 * The creator's own session (the request that published or reacted, or the
 * Studio's effects run) is the only place that may enumerate her members and ask
 * W8 whether each pair is denied; a background worker has neither (the growth
 * roles read nothing outside `growth`, and no worker scope issuer exists yet).
 * So the fan-out happens here, once per cause, and the worker later only checks
 * that the notice is still current. Returns null for an effect that is not a
 * Note or a reaction, so the caller can handle it as before. */
export function contentNoticeProducer(input: {
  content: ContentService;
  relay: Pick<GrowthRelay, "enqueueRecipients" | "hasAudience">;
}) {
  const { content, relay } = input;
  const hold = () => {
    if (!content.dependencies.holdCreatorFanNegative)
      throw refused(
        "content_delivery_unconfigured",
        "Notices wait until the creator/fan denial authority is connected.",
      );
    return content.dependencies.holdCreatorFanNegative;
  };

  /** Keep only the fans W8 does not deny, 50 per short transaction. A denial
   * drops that fan; an unknown answer stops the whole run so it can retry. */
  async function notDenied(
    actor: Actor,
    creatorId: string,
    fans: readonly { account_id: string; fan_id: string }[],
  ) {
    const check = hold();
    const allowed: { accountId: string; role: "fan" }[] = [];
    for (let start = 0; start < fans.length; start += 50)
      await content.transaction(actor, creatorId, async (client) => {
        for (const fan of fans.slice(start, start + 50)) {
          try {
            await check(client, actor, { creatorId, fanId: fan.fan_id });
            allowed.push({ accountId: fan.account_id, role: "fan" });
          } catch (error) {
            if (error instanceof DomainError && error.code === "scope_revoked")
              continue;
            throw error;
          }
        }
      });
    return allowed;
  }

  async function note(actor: Actor, effect: ContentEffect) {
    const found = await content.transaction(
      actor,
      effect.creatorId,
      async (client) => {
        await content.role(client, actor, effect.creatorId, ["publisher"]);
        const row = (
          await client.query<{
            kind: string;
            state: string;
            version: number;
            audience: Audience;
            published_at: Date | null;
          }>(
            `SELECT i.kind,i.state,i.version,i.audience,i.published_at FROM creator.content_index i
           JOIN creator.creator_profile p ON p.id=i.creator_id
           WHERE i.id=$1 AND i.creator_id=$2 AND p.verification='verified' AND NOT p.recovery_required`,
            [effect.contentId, effect.creatorId],
          )
        ).rows[0];
        if (!row || row.kind !== "note") return null;
        if (
          row.state !== "published" ||
          row.version !== effect.version ||
          !row.published_at
        )
          return { stale: true as const };
        const audience = ContentAudience.parse(row.audience);
        if (audience.kind !== "members" && audience.kind !== "tiers")
          return { unsupported: audience.kind };
        const fans = (
          await client.query<{ account_id: string; fan_id: string }>(
            `SELECT DISTINCT f.account_id,m.fan_id FROM creator.commerce_membership m
           JOIN creator.fan_profile f ON f.id=m.fan_id
           WHERE m.creator_id=$1 AND m.state IN('active','grace','cancelled') AND m.period_start<=now()
           AND CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END>now()
           AND ($2::uuid[] IS NULL OR m.tier_id=ANY($2::uuid[]))
           ORDER BY f.account_id LIMIT 100001`,
            [effect.creatorId, audience.kind === "tiers" ? audience.ids : null],
          )
        ).rows;
        if (fans.length > 100000)
          throw refused("audience_too_large", "This audience needs paging.");
        return { row, fans };
      },
    );
    if (found === null) return null;
    if ("stale" in found)
      return {
        reference: `note-notice:stale:${effect.contentId}:${effect.version}`,
      };
    if ("unsupported" in found)
      return {
        reference: `note-notice:audience-not-notified:${found.unsupported}:${effect.contentId}`,
      };
    // An edit is not news: only the first publication of a Note tells its audience.
    if (
      effect.version > 1 &&
      (await relay.hasAudience(
        "content",
        effect.creatorId,
        "note",
        effect.contentId,
      ))
    )
      return {
        reference: `note-notice:edit-silent:${effect.contentId}:${effect.version}`,
      };
    const recipients = await notDenied(actor, effect.creatorId, found.fans);
    const queued = await relay.enqueueRecipients("content", {
      type: "note",
      creatorId: effect.creatorId,
      aggregateId: effect.contentId,
      aggregateVersion: effect.version,
      causationId: effect.id,
      correlationId: effect.contentId,
      occurredAt: found.row.published_at!.toISOString(),
      recipients,
    });
    return {
      reference: `note-notice:${effect.contentId}:eligible=${recipients.length}:queued=${queued.queued}`,
    };
  }

  async function reaction(actor: Actor, effect: ContentEffect) {
    const found = await content.transaction(
      actor,
      effect.creatorId,
      async (client) => {
        await content.role(client, actor, effect.creatorId, ["publisher"]);
        return (
          await client.query<{
            fan_id: string;
            account_id: string;
            created_at: Date;
            withdrawn_at: Date | null;
          }>(
            `SELECT r.fan_id,f.account_id,re.created_at,r.withdrawn_at FROM creator.content_reply r
           JOIN creator.content_reaction re ON re.reply_id=r.id
           JOIN creator.fan_profile f ON f.id=r.fan_id
           WHERE r.id=$1 AND r.creator_id=$2`,
            [effect.contentId, effect.creatorId],
          )
        ).rows[0];
      },
    );
    if (!found || found.withdrawn_at)
      return { reference: `reaction-notice:stale:${effect.contentId}` };
    const [fan] = await notDenied(actor, effect.creatorId, [
      { account_id: found.account_id, fan_id: found.fan_id },
    ]);
    if (!fan)
      return { reference: `reaction-notice:denied:${effect.contentId}` };
    const queued = await relay.enqueueRecipients("content", {
      type: "reaction",
      creatorId: effect.creatorId,
      aggregateId: effect.contentId,
      aggregateVersion: 1,
      causationId: effect.id,
      correlationId: effect.contentId,
      occurredAt: found.created_at.toISOString(),
      recipients: [fan],
    });
    return {
      reference: `reaction-notice:${effect.contentId}:queued=${queued.queued}`,
    };
  }

  return async (
    actor: Actor,
    effect: ContentEffect,
  ): Promise<{ reference: string } | null> => {
    if (
      effect.type === "published" &&
      (effect.subjectKind ?? "content") === "content"
    )
      return note(actor, effect);
    if (effect.type === "reaction" && effect.subjectKind === "reply")
      return reaction(actor, effect);
    return null;
  };
}

/** What a notice may say right now, for the growth engine. Two paths:
 *
 * - the fan's own request (the notification list) passes interactive custody:
 *   the Note or reaction is checked as that fan through the same guards as the
 *   thread, so a row can never promise what the thread would refuse, and the
 *   Note's opening words may be shown in the app;
 * - the growth worker has no fan session, so it checks only what the content
 *   module publishes about itself (the public index, the creator's profile): the
 *   Note is still published at this version and the creator is still verified.
 *   Its wording is the generic hidden update, never any text. The fan was
 *   checked when the notice was queued, and meets the strict check again on
 *   every tap. */
export function contentNoticeOwner(input: {
  pool: Pool;
  content: ContentService;
}): GrowthOwners["notificationState"] {
  const presence = new ThreadPresence(input.content);
  // One event names up to 500 recipients and the engine asks about each at the
  // same moment: coalesce those concurrent reads into one. An answer is never
  // reused after it settles, so a withdrawal is seen by the very next check.
  const inflight = new Map<string, Promise<unknown>>();
  function once<T>(key: string, read: () => Promise<T>): Promise<T> {
    const running = inflight.get(key);
    if (running) return running as Promise<T>;
    const value = read().finally(() => inflight.delete(key));
    inflight.set(key, value);
    return value;
  }
  async function creator(creatorId: string) {
    return once(
      `creator:${creatorId}`,
      async () =>
        (
          await input.pool.query<{ name: string; handle: string; ok: boolean }>(
            "SELECT display_name AS name,handle,(verification='verified' AND NOT recovery_required) AS ok FROM creator.creator_profile WHERE id=$1",
            [creatorId],
          )
        ).rows[0],
    );
  }
  async function noteIndex(creatorId: string, noteId: string) {
    return once(`note:${creatorId}:${noteId}`, async () => {
      const client = await input.pool.connect();
      try {
        const row = (
          await client.query<{
            kind: string;
            state: string;
            version: number;
            audience: Audience;
          }>(
            "SELECT kind,state,version,audience FROM creator.content_index WHERE id=$1 AND creator_id=$2",
            [noteId, creatorId],
          )
        ).rows[0];
        if (!row) return null;
        return {
          ...row,
          label: await input.content.audienceLabel(
            client,
            creatorId,
            row.audience,
          ),
        };
      } finally {
        client.release();
      }
    });
  }
  const excerpt = (text: string) =>
    Array.from(text.replace(/\s+/gu, " ").trim()).slice(0, 240).join("");

  return async (event, recipient, custody) => {
    if (
      (event.type !== "note" && event.type !== "reaction") ||
      event.creatorId === null
    )
      return { ...unavailable, retryable: true };
    if (recipient.role !== "fan") return unavailable;
    const profile = await creator(event.creatorId);
    if (!profile?.ok || !/^[a-z0-9_]{3,30}$/u.test(profile.handle))
      return unavailable;
    const base = {
      available: true,
      authorized: true,
      creatorName: profile.name,
      destination: `/creators/${profile.handle}/chat`,
      safePreview: copy.growthHiddenUpdate,
    } as const;
    // The fan's own request: ask the thread's own guards.
    const strict = custody
      ? await custody.withCurrent(async (facts) => {
          if (
            facts.kind !== "interactive" ||
            facts.accountId !== recipient.accountId
          )
            throw new Error("notice_custody_mismatch");
          return facts.actor;
        })
      : null;
    if (event.type === "note") {
      const index = await noteIndex(event.creatorId, event.aggregateId);
      if (
        !index ||
        index.kind !== "note" ||
        index.state !== "published" ||
        index.version < event.aggregateVersion
      )
        return unavailable;
      let preview: string = copy.growthHiddenUpdate;
      if (strict) {
        const item = await presence.noteFor(
          strict,
          event.creatorId,
          event.aggregateId,
        );
        if (!item) return { ...unavailable, version: index.version };
        preview = excerpt(item.text) || copy.growthHiddenUpdate;
      }
      return {
        ...base,
        version: index.version,
        authorKind: "human_broadcast",
        audienceLabel: index.label,
        safePreview: preview,
      };
    }
    if (strict) {
      const row = await presence.reactionFor(
        strict,
        event.creatorId,
        event.aggregateId,
      );
      if (!row) return unavailable;
    }
    return { ...base, version: 1, authorKind: "human_reaction" };
  };
}
