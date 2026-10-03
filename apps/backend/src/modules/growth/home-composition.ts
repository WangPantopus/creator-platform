import { copy } from "@qelvora/copy";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import type { GrowthOwners, HomeEntry } from "./contracts.js";
import { Destination } from "./contracts.js";

type Kind = HomeEntry["kind"];
type Source = NonNullable<GrowthOwners["homePage"]>;
const kinds = ["thread", "request", "call"] as const;
const prefix = "home-v1:";
const Position = z.string().min(1).max(512);
const Cursor = z.strictObject({
  version: z.literal(1),
  accountId: z.uuid(),
  positions: z.strictObject({
    thread: Position.optional(),
    request: Position.optional(),
    call: Position.optional(),
  }),
  done: z.array(z.enum(kinds)).max(3),
});
const Entry = z.strictObject({
  id: z.uuid(),
  creatorId: z.uuid(),
  creatorName: z.string().max(200),
  label: z.string().max(200),
  preview: z.string().max(1000),
  destination: Destination,
  updatedAt: z.iso.datetime().regex(/T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u),
  kind: z.enum(kinds),
  cursor: Position,
});

/** Compare UTC microsecond directory clocks consistently across owners. */
export function compareHomeActivity(a: HomeEntry, b: HomeEntry) {
  const clock = (value: string) => {
    const match = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/u.exec(value);
    if (!match || !z.iso.datetime().safeParse(value).success)
      throw unavailable();
    return `${match[1]}.${(match[2] ?? "").padEnd(6, "0")}Z`;
  };
  return (
    clock(b.updatedAt).localeCompare(clock(a.updatedAt)) ||
    b.kind.localeCompare(a.kind) ||
    b.id.localeCompare(a.id)
  );
}
function unavailable() {
  return new DomainError(
    "home_scope_invalid",
    copy.growthErrorPrivateReplyUnavailable,
    503,
  );
}
function encode(value: z.infer<typeof Cursor>) {
  const cursor =
    prefix +
    Buffer.from(JSON.stringify(Cursor.parse(value))).toString("base64url");
  if (cursor.length > 3072) throw unavailable();
  return cursor;
}

/** Each owner reissues current account/session scopes on every read. Only
 * directory positions are retained, and Growth seals this to the actual actor.
 * Unselected private rows are neither cached nor skipped between merged pages. */
export function canonicalHomePage(
  sources: Partial<Record<Kind, Source>>,
): Source {
  const configured = kinds.filter((kind) => sources[kind]);
  if (!configured.length) throw unavailable();
  return async (actor, cursor) => {
    // Preserve the single-source directory fallback and its existing cursors.
    // It cannot establish a global activity order across multiple owners.
    const legacy =
      configured.length === 1 && (!cursor || !cursor.startsWith(prefix));
    let state: z.infer<typeof Cursor> = {
      version: 1,
      accountId: actor.accountId,
      positions: {},
      done: [],
    };
    if (cursor && !legacy) {
      try {
        if (cursor.length > 3072 || !cursor.startsWith(prefix))
          throw new Error();
        state = Cursor.parse(
          JSON.parse(
            Buffer.from(cursor.slice(prefix.length), "base64url").toString(
              "utf8",
            ),
          ),
        );
        if (
          encode(state) !== cursor ||
          state.accountId !== actor.accountId ||
          new Set(state.done).size !== state.done.length ||
          state.done.some((kind) => state.positions[kind] !== undefined) ||
          [...Object.keys(state.positions), ...state.done].some(
            (kind) => !configured.includes(kind as Kind),
          )
        )
          throw new Error();
      } catch {
        throw new DomainError(
          "home_cursor_invalid",
          copy.growthThisDestinationIsNoLongerAvailable,
          400,
        );
      }
    }
    const pages = new Map<Kind, Awaited<ReturnType<Source>>>();
    const entries: HomeEntry[] = [];
    for (const kind of configured) {
      if (state.done.includes(kind)) continue;
      const before = legacy ? cursor : state.positions[kind];
      const page = await sources[kind]!(actor, before);
      if (
        page.entries.length > 50 ||
        (page.nextCursor &&
          (!Position.safeParse(page.nextCursor).success ||
            page.nextCursor === before))
      )
        throw unavailable();
      if (legacy && page.order !== "activity") return page;
      if (page.order !== "activity") throw unavailable();
      const parsed = page.entries.map((entry) => {
        const value = Entry.safeParse(entry);
        if (
          !value.success ||
          value.data.kind !== kind ||
          value.data.cursor === before
        )
          throw unavailable();
        return value.data;
      });
      const seen = new Set<string>();
      const positions = new Set<string>();
      for (let i = 0; i < parsed.length; i++) {
        const entry = parsed[i]!;
        if (
          seen.has(entry.id) ||
          positions.has(entry.cursor) ||
          (i && compareHomeActivity(parsed[i - 1]!, entry) > 0)
        )
          throw unavailable();
        seen.add(entry.id);
        positions.add(entry.cursor);
      }
      pages.set(kind, { ...page, entries: parsed });
      entries.push(...parsed);
    }
    const selected = entries.sort(compareHomeActivity).slice(0, 50);
    for (const [kind, page] of pages) {
      const displayed = selected.filter((entry) => entry.kind === kind);
      if (displayed.length === page.entries.length) {
        // Every eligible row was consumed; a directory tail may include rows
        // that current authority excluded, so the owner's tail is authoritative.
        if (page.nextCursor) state.positions[kind] = page.nextCursor;
        else {
          delete state.positions[kind];
          state.done.push(kind);
        }
      } else if (displayed.length)
        state.positions[kind] = displayed.at(-1)!.cursor;
    }
    const nextCursor = configured.every((kind) => state.done.includes(kind))
      ? null
      : encode(state);
    if (nextCursor === cursor) throw unavailable();
    return { entries: selected, nextCursor, order: "activity" };
  };
}
