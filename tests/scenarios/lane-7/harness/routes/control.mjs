// The control plane, served under /__harness/. It is how a scenario looks
// behind the screen (state, request log, requests per minute) and changes
// the world (faults, clock, model switch, the creator showing up). The real
// API has none of it.
import { Failure } from "../http.mjs";
import { addMessage, copy, frame, seed } from "../world.mjs";

const ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu;
const shape = (path) => path.replace(ID, ":id");

/** The thread a control call means: the creator's handle, for one fan account. */
function threadOf({ world, params, query }) {
  const account = [...world.accounts.values()].find(
    (a) => a.key === (query.account ?? "devon"),
  );
  const thread = [...world.threads.values()].find(
    (t) =>
      t.fanAccountId === account?.id &&
      world.creators.get(t.creatorId).handle === params.handle,
  );
  if (!thread)
    throw new Failure(
      404,
      "harness_no_thread",
      `No thread for ${params.handle} and ${query.account ?? "devon"}.`,
    );
  return thread;
}

function takeover(world, thread, control) {
  const live = thread.messages.find(
    (m) => m.id === thread.generation?.messageId,
  );
  if (live) live.deliveryState = "interrupted";
  thread.generation = null;
  thread.control = control;
  thread.epoch += 1;
  thread.revision += 1;
  frame(thread, "control", null, { control });
}

export function register(router) {
  router.add("GET", "/__harness/health", ({ world }) => ({
    ok: true,
    uptimeSeconds: Math.round((Date.now() - world.startedAt) / 1000),
    requests: world.requestCount,
    sockets: world.sockets.size,
  }));

  router.add("GET", "/__harness/log", ({ world, query }) => {
    const since = Number(query.since ?? 0);
    return world.log
      .filter((e) => e.n > since && (!query.unserved || e.status === 404))
      .slice(-Number(query.limit ?? 200));
  });
  router.add("POST", "/__harness/log/clear", ({ world }) => {
    world.log.length = 0;
    return { cleared: true };
  });

  // Requests in the last N seconds by route shape, and the per-minute rate.
  router.add("GET", "/__harness/stats", ({ world, query }) => {
    const seconds = Number(query.seconds ?? 60);
    const from = Date.now() - seconds * 1000;
    const routes = {};
    let total = 0;
    for (const e of world.log) {
      if (Date.parse(e.at) < from || e.path.startsWith("/__harness/")) continue;
      const key = `${e.method} ${shape(e.path)}`;
      routes[key] = (routes[key] ?? 0) + 1;
      total += 1;
    }
    return {
      seconds,
      total,
      perMinute: Math.round((total * 60) / seconds),
      routes,
    };
  });

  router.add("GET", "/__harness/state", ({ world }) => ({
    clockOffsetSeconds: Math.round(world.clockOffsetMs / 1000),
    flags: {
      generationAvailable: world.generationAvailable,
      policyVerified: world.policy.verified,
      replyDelayMs: world.replyDelayMs,
      sentenceDelayMs: world.sentenceDelayMs,
    },
    faults: world.faults,
    sessions: [...world.sessions.values()].map((s) => ({
      id: s.id,
      account: world.accounts.get(s.accountId).key,
      revoked: s.revoked,
      expiresInSeconds: Math.round((s.expiresAt - world.now()) / 1000),
    })),
    accounts: [...world.accounts.values()].map((a) => ({
      key: a.key,
      id: a.id,
      handle: a.fan?.handle ?? null,
      fanVersion: a.fan?.version ?? null,
    })),
    devices: world.devices,
    notifications: world.notifications.map((n) => ({
      id: n.id,
      type: n.type,
      account: world.accounts.get(n.accountId).key,
      read: n.readAt !== null,
    })),
    threads: [...world.threads.values()].map((t) => ({
      creator: world.creators.get(t.creatorId).handle,
      account: world.accounts.get(t.fanAccountId).key,
      id: t.id,
      control: t.control,
      epoch: t.epoch,
      cursor: t.cursor,
      revision: t.revision,
      consent: t.consentVersion === world.policy.version,
      access: t.access,
      offTheRecord: t.offTheRecord,
      generating: t.generation !== null,
      listeners: t.listeners.size,
      messages: t.messages.map(
        (m) =>
          `${m.sequence} ${m.authorKind} ${m.deliveryState}: ${m.text.slice(0, 60)}`,
      ),
    })),
  }));

  router.add("POST", "/__harness/reset", ({ world }) => {
    seed(world);
    return { reset: true };
  });

  router.add("POST", "/__harness/faults", ({ world, body }) => {
    world.faults = Array.isArray(body?.rules) ? body.rules : [];
    return { faults: world.faults };
  });

  router.add("POST", "/__harness/clock", ({ world, body }) => {
    if (body?.reset) world.clockOffsetMs = 0;
    else world.clockOffsetMs += Number(body?.advanceSeconds ?? 0) * 1000;
    return { clockOffsetSeconds: Math.round(world.clockOffsetMs / 1000) };
  });

  router.add("POST", "/__harness/flags", ({ world, body }) => {
    if (typeof body?.generationAvailable === "boolean")
      world.generationAvailable = body.generationAvailable;
    if (typeof body?.policyVerified === "boolean")
      world.policy.verified = body.policyVerified;
    if (Number.isFinite(body?.replyDelayMs))
      world.replyDelayMs = body.replyDelayMs;
    if (Number.isFinite(body?.sentenceDelayMs))
      world.sentenceDelayMs = body.sentenceDelayMs;
    return { ok: true };
  });

  // Ends sessions without the app asking: expire (refreshable) or revoke.
  router.add("POST", "/__harness/sessions", ({ world, body }) => {
    for (const s of world.sessions.values()) {
      if (body?.account && world.accounts.get(s.accountId).key !== body.account)
        continue;
      if (body?.action === "revoke") s.revoked = true;
      else s.expiresAt = world.now();
    }
    return { ok: true };
  });

  // The person shows up in a thread while it is open.
  const first = (thread) => thread.creatorName;
  router.add("POST", "/__harness/threads/:handle/note", (ctx) =>
    addMessage(
      ctx.world,
      threadOf(ctx),
      "human_broadcast",
      String(ctx.body?.text ?? "A new Note: the glaze clinic moved to 6pm."),
      {},
    ),
  );
  router.add("POST", "/__harness/threads/:handle/reaction", (ctx) => {
    const thread = threadOf(ctx);
    return addMessage(
      ctx.world,
      thread,
      "human_reaction",
      copy("reaction", { name: first(thread) }),
      {},
    );
  });
  router.add("POST", "/__harness/threads/:handle/reply", (ctx) =>
    addMessage(
      ctx.world,
      threadOf(ctx),
      "human_creator",
      String(
        ctx.body?.text ??
          "Thanks for the photo. The glaze looks too thin at the rim.",
      ),
      {},
    ),
  );
  router.add("POST", "/__harness/threads/:handle/team", (ctx) =>
    addMessage(
      ctx.world,
      threadOf(ctx),
      "team",
      String(ctx.body?.text ?? "I'm covering the queue today."),
      {},
    ),
  );
  router.add("POST", "/__harness/threads/:handle/takeover", (ctx) => {
    takeover(ctx.world, threadOf(ctx), "human_active");
    return { ok: true };
  });
  router.add("POST", "/__harness/threads/:handle/handback", (ctx) => {
    takeover(ctx.world, threadOf(ctx), "ai_active");
    return { ok: true };
  });
  router.add("POST", "/__harness/threads/:handle/pause", (ctx) => {
    takeover(ctx.world, threadOf(ctx), "ai_paused");
    return { ok: true };
  });
  router.add("POST", "/__harness/threads/:handle/set", (ctx) => {
    const thread = threadOf(ctx);
    for (const key of ["access", "offTheRecord", "introShared"])
      if (typeof ctx.body?.[key] === "boolean") thread[key] = ctx.body[key];
    if (ctx.body?.consent === false) thread.consentVersion = null;
    if (ctx.body?.consent === true)
      thread.consentVersion = ctx.world.policy.version;
    thread.revision += 1;
    return { ok: true };
  });
}
