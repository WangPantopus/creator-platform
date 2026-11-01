import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import type { StudioService } from "./service.js";

/** One open Studio tab's live view. The browser no longer polls: this stream
 * re-runs the current roles and the open screen's own read (the same access
 * checks the screen's request makes) every two seconds and sends a fingerprint
 * of each. The screen fetches only when its fingerprint changes. The session
 * was resolved when the stream opened, so each stream ends after 30 seconds and
 * the browser opens the next one; every action still resolves its own session. */
export const studioLiveTick = 2000;
export const studioLiveLifetime = 30000;
const LiveQuery = z
  .strictObject({
    creator: z.uuid().optional(),
    view: z.enum(["notes", "threads", "thread", "team", "thanks"]).optional(),
    fan: z.uuid().optional(),
    filter: z.enum(["all", "unread", "reacted", "flagged"]).optional(),
    cursor: z.uuid().optional(),
  })
  .refine((q) => !q.view || q.creator)
  .refine((q) => (q.view === "thread") === Boolean(q.fan));
type LiveQuery = z.infer<typeof LiveQuery>;
// Response times are not changes; a fingerprint over them would refetch every tick.
const stable = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object" && !(value instanceof Date)
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([key]) => key !== "serverTime")
            .map(([key, item]) => [key, stable(item)]),
        )
      : value;
const fingerprint = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("base64url")
    .slice(0, 16);
const failure = (error: unknown) =>
  error instanceof DomainError
    ? { status: error.status, code: error.code, message: error.message }
    : {
        status: 503,
        code: "service_unavailable",
        message: "The service is unavailable. Please try again.",
      };

type Role = { id: string; owned: boolean; roles: string[] };
async function viewRead(
  service: StudioService,
  actor: Actor,
  creator: Role,
  query: LiveQuery,
) {
  const creatorId = creator.id,
    cursor = query.cursor ? { cursor: query.cursor } : {};
  switch (query.view) {
    case "notes":
      return Promise.all([
        service.content.list(actor, creatorId, {}, true),
        creator.owned || creator.roles.includes("triage")
          ? service.content.replies(
              actor,
              creatorId,
              { filter: query.filter ?? "all", ...cursor },
              true,
            )
          : null,
      ]);
    case "threads":
      return service.threadEntries(actor, creatorId, cursor);
    case "thread":
      return Promise.all([
        service.thread(actor, creatorId, query.fan!, false),
        service.replyDraft(actor, creatorId, query.fan!),
      ]);
    case "team":
      return service.team(actor, creatorId);
    case "thanks":
      return service.content.thanksFeed(actor, creatorId);
  }
}

export async function studioLive(
  service: StudioService,
  actor: Actor,
  req: Request,
  res: Response,
) {
  const query = LiveQuery.parse(req.query);
  const opened = performance.now();
  let closed = false,
    timer: ReturnType<typeof setTimeout> | undefined,
    lastSession: string | undefined;
  const tick = async () => {
    const t = Math.round(performance.now() - opened);
    const { creators, invitations } = await service.session(actor),
      session = { creators, invitations };
    const frame: Record<string, unknown> = {
      t,
      session: fingerprint(session),
    };
    if (frame.session !== lastSession) frame.state = session;
    lastSession = frame.session as string;
    const creator = (creators as Role[]).find((c) => c.id === query.creator);
    if (query.creator && creator) {
      const [badge, view] = await Promise.all([
        creator.owned || creator.roles.includes("triage")
          ? service
              .queue(actor, query.creator, { filter: "all", limit: 1 })
              .then(
                (queue) => queue.requests,
                () => null,
              )
          : null,
        query.view
          ? viewRead(service, actor, creator, query).then(
              (value) => ({ digest: fingerprint(value) }),
              (error: unknown) => ({ error: failure(error) }),
            )
          : null,
      ]);
      frame.badge = badge;
      if (view) frame.view = view;
    }
    return frame;
  };
  res.on("close", () => {
    closed = true;
    clearTimeout(timer);
  });
  // The first check answers as an ordinary request, so a refused session or
  // role reaches the browser as the same status a direct read would return.
  const first = await tick();
  if (closed) return;
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
  });
  const send = (frame: unknown) =>
    res.write(`data: ${JSON.stringify(frame)}\n\n`);
  const end = (frame: unknown) => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    send(frame);
    res.end();
  };
  send(first);
  const schedule = (started: number) => {
    if (closed) return;
    const next = started + studioLiveTick;
    if (next - opened >= studioLiveLifetime) {
      timer = setTimeout(
        () => end({ t: Math.round(performance.now() - opened), end: "renew" }),
        Math.max(0, next - performance.now()),
      );
      return;
    }
    timer = setTimeout(
      () => {
        const started = performance.now();
        // A reader that stopped reading reconnects through a fresh stream.
        if (res.writableNeedDrain) {
          end({ t: Math.round(started - opened), end: "renew" });
          return;
        }
        tick().then(
          (frame) => {
            if (closed) return;
            send(frame);
            schedule(started);
          },
          (error: unknown) =>
            end({
              t: Math.round(started - opened),
              end: "error",
              error: failure(error),
            }),
        );
      },
      Math.max(0, next - performance.now()),
    );
  };
  schedule(opened);
}
