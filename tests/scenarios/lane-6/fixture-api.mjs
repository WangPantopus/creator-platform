// Stand-in for the backend HTTP API (the /v1 routes the web app proxies to), for lane 6
// scenarios while lane 2's one-command stack is not on main. It is the only fake in the
// E6.1 run. Run it with: node --import tsx tests/scenarios/lane-6/fixture-api.mjs
// Control: GET /__mode?mode=default|empty|outage, GET /__delay?ms=N[&match=regex] (slow answers),
// GET /__log, GET /__log/clear.
import { createServer } from "node:http";
import { SessionSchema } from "../../../packages/api/src/identity.ts";
import {
  ContentList,
  ContentReplyList,
  ContentThanksFeed,
  ContentLiveCatalog,
} from "../../../packages/api/src/content.ts";
import {
  StudioSession,
  StudioAudiences,
  StudioTeam,
  StudioThreadEntries,
} from "../../../packages/api/src/studio.ts";
import { ConversationMessageSchema } from "../../../packages/api/src/conversation/contracts.ts";
import * as F from "./fixtures.mjs";

const live = { available: false, items: [] };
SessionSchema.parse(F.session);
StudioSession.parse(F.studioSession);
ContentList.parse({
  items: F.contentItems,
  nextCursor: null,
  serverTime: F.NOW,
});
ContentReplyList.parse({ items: F.replies, nextCursor: null });
ContentThanksFeed.parse(F.thanks);
ContentLiveCatalog.parse(live);
StudioAudiences.parse(F.audiences);
StudioTeam.parse(F.team);
StudioThreadEntries.parse(F.threadEntries);
ConversationMessageSchema.array().parse(F.messages);

const U = "([a-f0-9-]{36})";
const port = Number(process.env.LANE6_FAKE_PORT ?? 56463);
let mode = "default";
let delay = { ms: 0, match: /./u };
const log = [];
const saved = new Map();
const ok = (value = { ok: true }) => [200, value];
const empty = () => mode === "empty";
const route = (method, re) => [method, new RegExp(`^${re}$`)];
const listFor = (q) => {
  const state = q.get("state"),
    text = (q.get("query") ?? "").toLowerCase();
  const items = empty()
    ? []
    : F.contentItems.filter(
        (v) =>
          (!state || v.state === state) &&
          (!text ||
            v.document.text.toLowerCase().includes(text) ||
            v.document.title.toLowerCase().includes(text)),
      );
  return { items, nextCursor: null, serverTime: F.NOW };
};
const queueFor = (q) => {
  const filter = q.get("filter") ?? "all",
    cursor = q.get("cursor");
  const pick = {
    all: () => true,
    due: (i) => i.commitment_state === "due",
    decide: (i) => i.state === "submitted",
    more_info: (i) => i.state === "more_info",
  }[filter];
  const items = empty()
    ? []
    : (cursor ? F.queueMore : F.queueItems)
        .filter(pick)
        .slice(0, Number(q.get("limit") ?? 20));
  return {
    items,
    nextCursor: empty() || cursor || filter !== "all" ? null : F.queueCursor,
    capacity: F.capacity,
    serverTime: F.NOW,
    requests: empty() ? 0 : 3,
  };
};
const repliesFor = (q) => {
  const filter = q.get("filter") ?? "all";
  const pick = {
    all: () => true,
    unread: (r) => !r.read,
    reacted: (r) => r.reaction,
    flagged: (r) => r.safetyState === "flagged",
  }[filter];
  return { items: empty() ? [] : F.replies.filter(pick), nextCursor: null };
};
const reviewFor = (id) => {
  const document = saved.get(id) ?? F.contentItems[1].document;
  const view = {
    ...F.contentItems[1],
    id,
    document,
    displayText: document.text,
    audienceLabel: document.audience.kind,
  };
  return {
    command: {
      actType: document.kind === "note" ? "broadcast" : "reply",
      subjectId: id,
      content: {
        kind: "content_publication",
        creatorId: F.ID.maya,
        version: 1,
        document,
      },
    },
    view,
  };
};
const routes = [
  [route("GET", "identity/session"), () => ok(F.session)],
  [route("GET", "studio/session"), () => ok(F.studioSession)],
  [route("POST", `studio/invitations/${U}/accept`), () => ok({ done: true })],
  [route("GET", `studio/${U}/queue`), (m, q) => ok(queueFor(q))],
  [route("GET", `studio/${U}/audiences`), () => ok(F.audiences)],
  [
    route("GET", `studio/${U}/team`),
    () => ok(empty() ? { members: [], invitations: [] } : F.team),
  ],
  [route("POST", `studio/${U}/team/invite`), () => ok({ id: F.ID.invite })],
  [route("GET", `studio/${U}/corrections`), () => ok({ revision: 3 })],
  [route("POST", `studio/${U}/corrections`), () => ok({ id: F.ID.signed })],
  [route("GET", `studio/${U}/packets/${U}`), (m) => ok(F.packet(m[2]))],
  [route("POST", `studio/${U}/packets/${U}/(?:decide|deliver)`), () => ok()],
  [route("GET", `studio/${U}/packets/${U}/deliveries`), () => ok(F.deliveries)],
  [
    route("GET", `studio/${U}/threads`),
    () => ok(empty() ? { ...F.threadEntries, items: [] } : F.threadEntries),
  ],
  [
    route("GET", `studio/${U}/threads/${U}`),
    (m) => ok(F.timeline(m[2] === F.ID.fanB ? "human_active" : "ai_active")),
  ],
  [
    route("GET", `studio/${U}/threads/${U}/draft`),
    (m) =>
      ok(
        m[2] === F.ID.fanB
          ? {
              text: "Slower through the peak is the real fix.",
              version: 3,
              sentMessageId: null,
            }
          : { text: "", version: 0, sentMessageId: null },
      ),
  ],
  [
    route("POST", `studio/${U}/threads/${U}/draft`),
    (m, q, b) => ok({ version: (b?.expectedVersion ?? 0) + 1 }),
  ],
  [
    route(
      "POST",
      `studio/${U}/threads/${U}/(?:takeover|handback|pause|send-draft|reply)`,
    ),
    () => ok(),
  ],
  [route("GET", `content/${U}/studio`), (m, q) => ok(listFor(q))],
  [route("GET", `content/${U}/studio/replies`), (m, q) => ok(repliesFor(q))],
  [route("GET", `content/${U}/studio/live`), () => ok(live)],
  [
    route("GET", `content/${U}/studio/thanks`),
    () => ok(empty() ? [] : F.thanks),
  ],
  [
    route("POST", `content/${U}/drafts`),
    (m, q, b) => (
      saved.set(b.id, b.document),
      ok({ id: b.id, version: b.expectedVersion + 1 })
    ),
  ],
  [
    route("GET", `content/${U}/${U}/studio`),
    (m) =>
      ok(
        F.contentItems.find((v) => v.id === m[2]) ?? {
          ...F.contentItems[1],
          id: m[2],
        },
      ),
  ],
  [route("GET", `content/${U}/${U}/review`), (m) => ok(reviewFor(m[2]))],
  [
    route(
      "POST",
      `content/${U}/${U}/(?:publish|team-publish|unpublish|archive)`,
    ),
    () => ok({ id: F.ID.signed, version: 2, state: "published" }),
  ],
  [route("POST", `content/${U}/replies/${U}/(?:read|reaction)`), () => ok()],
];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const send = (status, value) => (
    res.writeHead(status, { "Content-Type": "application/json" }),
    res.end(JSON.stringify(value))
  );
  if (url.pathname === "/__mode")
    return send(200, {
      mode: (mode = url.searchParams.get("mode") ?? "default"),
    });
  if (url.pathname === "/__delay") {
    delay = {
      ms: Number(url.searchParams.get("ms") ?? 0),
      match: new RegExp(url.searchParams.get("match") ?? ".", "u"),
    };
    return send(200, { ms: delay.ms });
  }
  if (url.pathname === "/__log") return send(200, log);
  if (url.pathname === "/__log/clear")
    return send(200, { cleared: log.splice(0).length });
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = text ? JSON.parse(text) : undefined;
  const path = url.pathname.replace(/^\/v1\//u, "");
  log.push({ method: req.method, path: path + url.search, body });
  if (req.headers.authorization !== "Bearer fixture-token")
    return send(401, {
      error: {
        code: "session_invalid",
        message: "Continue with Pantopus again.",
      },
    });
  if (mode === "outage" && /^(?:studio|content)\//u.test(path))
    return send(503, {
      error: {
        code: "service_unavailable",
        message: "The stand-in API is paused for this check.",
      },
    });
  if (delay.ms && delay.match.test(path))
    await new Promise((resolve) => setTimeout(resolve, delay.ms));
  for (const [[method, re], handler] of routes) {
    const m = method === req.method && path.match(re);
    if (m) return send(...handler(m, url.searchParams, body));
  }
  send(404, {
    error: { code: "not_found", message: "Not connected in the stand-in API." },
  });
});
server.listen(port, "127.0.0.1", () =>
  console.log(`lane 6 stand-in API on ${port}`),
);
