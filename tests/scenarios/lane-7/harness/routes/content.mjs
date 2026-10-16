// C4: the Notes and reactions one fan sees in a thread, the way
// apps/backend/src/modules/content/thread-presence.ts answers. A window over
// candidates newest first, eligibility after the window (so a page can be
// empty and still have a cursor), items oldest first, the window edge as the
// cursor, and the same refusals. Never more forgiving than the real API.
import { Failure } from "../http.mjs";
import { copy } from "../world.mjs";
import { authenticate } from "./identity.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const CURSOR =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)~([0-9a-f-]{36})$/u;
const invalid = () =>
  new Failure(
    400,
    "invalid_request",
    "The request does not match the API contract.",
  );

/** Newest first by (at, id), as the database orders them. */
const newestFirst = (a, b) =>
  a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1;

export function presenceItem(creator, item) {
  if (item.kind === "note")
    return {
      authorKind: "human_broadcast",
      id: item.id,
      version: item.version,
      creatorId: creator.id,
      creatorName: creator.name,
      authorLabel: copy("noteAudience", {
        name: creator.name,
        audience: item.audience.label,
      }),
      glyph: "broadcast",
      audience: { ...item.audience, glyph: "broadcast" },
      text: item.text,
      signedActId: item.signedActId,
      occurredAt: item.at,
    };
  return {
    authorKind: "human_reaction",
    id: item.id,
    creatorId: creator.id,
    creatorName: creator.name,
    authorLabel: copy("reaction", { name: creator.name }),
    glyph: "heart",
    reaction: item.reaction,
    replyId: item.id,
    noteId: item.noteId,
    signedActId: item.signedActId,
    occurredAt: item.at,
  };
}

export function register(router) {
  router.add("GET", "/v1/content/:creatorId/presence", (ctx) => {
    const { world, params, query } = ctx;
    const { account } = authenticate(ctx);
    if (!UUID.test(params.creatorId)) throw invalid();
    // z.coerce.number().int().min(1).max(50).default(20)
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw invalid();
    let before = null;
    if (query.before !== undefined) {
      const match = CURSOR.exec(query.before);
      if (!match)
        throw new Failure(
          400,
          "presence_cursor_invalid",
          "Reload to continue from the start.",
        );
      before = { at: match[1], id: match[2] };
    }
    const creator = world.creators.get(params.creatorId);
    if (!creator)
      throw new Failure(
        403,
        "audience_unavailable",
        "This content is unavailable.",
      );
    if (!["published", "paused"].includes(creator.state))
      throw new Failure(
        404,
        "content_unavailable",
        "This content is unavailable.",
      );
    const presence = world.presence.get(creator.id) ?? {
      notes: [],
      reactions: [],
    };
    const older = (item) =>
      !before ||
      item.at < before.at ||
      (item.at === before.at && item.id < before.id);
    // Body-free candidates: every published Note, and this fan's own reactions
    // whose reply is still allowed and not withdrawn.
    const candidates = [
      ...presence.notes.filter((note) => note.published),
      ...presence.reactions.filter(
        (reaction) =>
          reaction.fanAccountId === account.id && reaction.replyAvailable,
      ),
    ]
      .filter(older)
      .sort(newestFirst);
    const window = candidates.slice(0, limit);
    const edge = window.at(-1);
    const nextBefore =
      candidates.length > limit && edge ? `${edge.at}~${edge.id}` : null;
    const items = window
      .filter(
        (item) => item.kind === "reaction" || item.visibleTo.has(account.id),
      )
      .map((item) => presenceItem(creator, item))
      .reverse();
    // Behind the screen: which cursor came in and which went out (synthetic).
    Object.assign(ctx.entry, {
      before: query.before ?? null,
      nextBefore,
      items: items.length,
    });
    return {
      items,
      nextBefore,
      serverTime: new Date(world.now()).toISOString(),
    };
  });
}
