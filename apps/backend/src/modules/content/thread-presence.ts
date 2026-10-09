import { formatCopy } from "@qelvora/copy";
import type { PoolClient } from "pg";
import {
  ThreadPresenceQuery,
  type ThreadPresenceItem,
  type ThreadPresencePage,
} from "../../../../../packages/api/src/content.js";
import { DomainError } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type { ContentService, Index } from "./service.js";

/** C4: the Notes and reactions one fan sees in their thread with a creator.
 *
 * A Note is stored once and rendered into each eligible fan's thread at read
 * time (Domain Model); there is no per-fan copy to deliver, drift or revoke.
 * Eligibility therefore needs no recipient list: it is the same rule, with the
 * same guards in the same order, that lets this fan read the Note directly
 * (`ContentService.list`). Joining later, leaving later, a block, a deleted
 * account, a mute, an edit or a withdrawal all take effect on the next read.
 *
 * Nothing here reads another fan's rows (INV-24): reactions are selected for
 * the asking fan's own replies, and no reply text is returned at all. */
export class ThreadPresence {
  constructor(private readonly content: ContentService) {}

  async read(
    actor: Actor,
    creatorId: string,
    raw: unknown,
  ): Promise<ThreadPresencePage> {
    const query = ThreadPresenceQuery.parse(raw);
    const before = query.before ? parseCursor(query.before) : null;
    // As in `list`: the fan's audience identity is prepared before any
    // content transaction opens, so an unknown creator is refused the same way.
    await this.content.dependencies.prepareAudienceRequest?.(actor, creatorId);
    const { candidates, creatorName } = await this.content.transaction(
      actor,
      creatorId,
      (client) =>
        this.candidates(client, actor, creatorId, before, query.limit),
    );
    // The page is a window over candidates by time. Items the fan may not see
    // are dropped below, so the cursor is the window's edge, not the last item.
    const more = candidates.length > query.limit;
    const window = candidates.slice(0, query.limit);
    const noteIds = window
      .filter((candidate) => candidate.kind === "note")
      .map((candidate) => candidate.id);
    const notes = noteIds.length
      ? await this.eligibleNotes(actor, creatorId, noteIds)
      : new Map<string, ThreadPresenceItem>();
    const items: ThreadPresenceItem[] = [];
    for (const candidate of window) {
      if (candidate.kind === "note") {
        const note = notes.get(candidate.id);
        if (note) items.push({ ...note, occurredAt: candidate.at });
      } else
        items.push({
          authorKind: "human_reaction",
          id: candidate.id,
          creatorId,
          creatorName,
          authorLabel: formatCopy("reaction", { name: creatorName }),
          glyph: "heart",
          reaction: candidate.reaction,
          replyId: candidate.id,
          noteId: candidate.noteId,
          signedActId: candidate.signedActId,
          occurredAt: candidate.at,
        });
    }
    const edge = window.at(-1);
    return {
      items: items.reverse(),
      nextBefore: more && edge ? `${edge.at}~${edge.id}` : null,
      serverTime: new Date().toISOString(),
    };
  }

  /** Body-free candidates from two sources, newest first. The Note index is
   * public by design (no text, no identity); the reactions are the asking
   * fan's own. Neither list is permission to show anything. */
  private async candidates(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    before: { at: string; id: string } | null,
    limit: number,
  ) {
    const creator = (
      await client.query<{ display_name: string }>(
        "SELECT display_name FROM creator.creator_profile WHERE id=$1 AND verification='verified' AND NOT recovery_required",
        [creatorId],
      )
    ).rows[0];
    if (!creator)
      throw new DomainError(
        "content_unavailable",
        "This content is unavailable.",
        404,
      );
    const notes = await client.query<{ id: string; at: string }>(
      `SELECT id,${microseconds("published_at")} AS at FROM creator.content_index
       WHERE creator_id=$1 AND kind='note' AND state='published' AND published_at IS NOT NULL
       AND ($2::timestamptz IS NULL OR (published_at,id)<($2::timestamptz,$3::uuid))
       ORDER BY published_at DESC,id DESC LIMIT $4`,
      [creatorId, before?.at ?? null, before?.id ?? null, limit + 1],
    );
    const reactions = await this.reactionRows(
      client,
      creatorId,
      actor.accountId,
      before,
      limit + 1,
      null,
    );
    type Candidate =
      | { kind: "note"; id: string; at: string }
      | {
          kind: "reaction";
          id: string;
          at: string;
          noteId: string;
          reaction: "heart" | "thanks" | "helpful";
          signedActId: string;
        };
    const candidates: Candidate[] = [
      ...notes.rows.map((row) => ({ kind: "note" as const, ...row })),
      ...reactions.map((row) => ({
        kind: "reaction" as const,
        id: row.id,
        at: row.at,
        noteId: row.note_id,
        reaction: row.kind,
        signedActId: row.signed_act_id,
      })),
    ].sort((a, b) =>
      // Fixed-width UTC text and lowercase uuids sort exactly as the database does.
      a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1,
    );
    return { candidates, creatorName: creator.display_name };
  }

  /** The asking fan's own reactions, newest first: the reply must still exist,
   * be allowed by review and belong to this fan. One query for the page and for
   * the single-item check, so the two cannot disagree. */
  private async reactionRows(
    client: PoolClient,
    creatorId: string,
    accountId: string,
    before: { at: string; id: string } | null,
    limit: number,
    replyId: string | null,
  ) {
    return (
      await client.query<{
        id: string;
        at: string;
        note_id: string;
        kind: "heart" | "thanks" | "helpful";
        signed_act_id: string;
      }>(
        `SELECT r.id,${microseconds("re.created_at")} AS at,r.content_id AS note_id,re.kind,re.signed_act_id
         FROM creator.content_reaction re
         JOIN creator.content_reply r ON r.id=re.reply_id AND r.creator_id=$1 AND r.withdrawn_at IS NULL
         JOIN creator.content_reply_review m ON m.reply_id=r.id AND m.creator_id=r.creator_id
           AND m.reply_version=r.version AND m.state='allowed' AND m.withdrawn_at IS NULL
         JOIN creator.fan_profile f ON f.id=r.fan_id AND f.account_id=$2
         WHERE ($3::timestamptz IS NULL OR (re.created_at,r.id)<($3::timestamptz,$4::uuid))
         AND ($6::uuid IS NULL OR r.id=$6)
         ORDER BY re.created_at DESC,r.id DESC LIMIT $5`,
        [
          creatorId,
          accountId,
          before?.at ?? null,
          before?.id ?? null,
          limit,
          replyId,
        ],
      )
    ).rows;
  }

  /** The strict check for one Note, as the asking fan: the exact item `read`
   * would show right now, or null. The notification list uses it so a row can
   * never promise what the thread would refuse. */
  async noteFor(actor: Actor, creatorId: string, noteId: string) {
    await this.content.dependencies.prepareAudienceRequest?.(actor, creatorId);
    const notes = await this.eligibleNotes(actor, creatorId, [noteId]);
    const note = notes.get(noteId);
    return note?.authorKind === "human_broadcast" ? note : null;
  }

  /** The strict check for one reaction, as the fan whose reply it answers. */
  async reactionFor(actor: Actor, creatorId: string, replyId: string) {
    return this.content.transaction(actor, creatorId, async (client) => {
      const row = (
        await this.reactionRows(
          client,
          creatorId,
          actor.accountId,
          null,
          1,
          replyId,
        )
      )[0];
      return row ?? null;
    });
  }

  /** The exact guard sequence of `ContentService.list` for a fan: every bounded
   * family's negatives are prepared before the first content lock, then each
   * Note is checked against this fan's current audience, packet and denial
   * authority. A Note that fails any check is simply absent. */
  private async eligibleNotes(
    actor: Actor,
    creatorId: string,
    noteIds: readonly string[],
  ) {
    const dependencies = this.content.dependencies;
    return this.content.transaction(actor, creatorId, async (client) => {
      const rows = (
        await client.query<Index>(
          "SELECT * FROM creator.content_index WHERE creator_id=$1 AND id=ANY($2::uuid[]) AND kind='note' AND state='published' ORDER BY published_at DESC,id DESC",
          [creatorId, noteIds],
        )
      ).rows;
      for (const row of rows)
        await this.content.requireOrdinaryRead(
          client,
          creatorId,
          row.id,
          row.version,
        );
      for (const row of rows)
        await dependencies.preparePublicPacketRead?.(client, actor, {
          creatorId,
          contentId: row.id,
        });
      await dependencies.prepareAudienceRead?.(client, actor, creatorId);
      const current: Index[] = [];
      for (const row of rows) {
        try {
          current.push(await this.content.index(client, creatorId, row.id));
        } catch (error) {
          if (
            error instanceof DomainError &&
            error.code === "content_unavailable" &&
            error.status === 404
          )
            continue;
          throw error;
        }
      }
      const permitted: Index[] = [];
      for (const row of current) {
        await client.query("SELECT set_config('app.content_id',$1,true)", [
          row.id,
        ]);
        if (await this.content.eligibleBeforePacket(client, actor, row))
          permitted.push(row);
      }
      const prepared: Index[] = [];
      for (const row of permitted)
        if (await this.content.preparePacketPositive(client, actor, row))
          prepared.push(row);
      const notes = new Map<string, ThreadPresenceItem>();
      for (const row of prepared) {
        if (!(await this.content.packetEligible(client, actor, row))) continue;
        await client.query("SELECT set_config('app.content_id',$1,true)", [
          row.id,
        ]);
        const view = await this.content.view(client, actor, row, false);
        if (
          view.authorKind !== "human_broadcast" ||
          !view.signedActId ||
          view.document.audience.kind === "public"
        )
          continue;
        notes.set(row.id, {
          authorKind: "human_broadcast",
          id: view.id,
          version: view.version,
          creatorId: view.creatorId,
          creatorName: view.creatorName,
          authorLabel: formatCopy("noteAudience", {
            name: view.creatorName,
            audience: view.audienceLabel,
          }),
          glyph: "broadcast",
          audience: {
            kind: view.document.audience.kind,
            label: view.audienceLabel,
            glyph: "broadcast",
          },
          text: view.displayText,
          signedActId: view.signedActId,
          // Replaced by the candidate's own instant, which keeps microseconds.
          occurredAt: view.publishedAt ?? new Date().toISOString(),
        });
      }
      return notes;
    });
  }
}

const CURSOR =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)~([0-9a-f-]{36})$/u;
function parseCursor(value: string) {
  const match = CURSOR.exec(value);
  if (!match)
    throw new DomainError(
      "presence_cursor_invalid",
      "Reload to continue from the start.",
      400,
    );
  return { at: match[1]!, id: match[2]! };
}
function microseconds(column: string) {
  return `to_char(${column} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
}
