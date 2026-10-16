// The control plane, served under /__harness/. It is how a scenario looks
// behind the screen (state, request log, requests per minute) and changes
// the world (faults, clock, model switch, the creator showing up). The real
// API has none of it.
import { Failure } from "../http.mjs";
import { randomUUID } from "node:crypto";
import { addMessage, copy, publishNote, react, seed } from "../world.mjs";
import { presenceItem } from "./content.mjs";
import { sendToAi } from "./conversation.mjs";

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

/** What the real server does when the speaker changes: interrupt a reply in
 * progress, raise the epoch, write the announcement as a system message, and
 * send the control frame that points at it (INV-03, INV-04). */
function changeControl(world, thread, control) {
  const live = thread.messages.find(
    (m) => m.id === thread.generation?.messageId,
  );
  if (live) live.deliveryState = "interrupted";
  thread.generation = null;
  thread.control = control;
  thread.epoch += 1;
  const key =
    control === "human_active"
      ? "takeover"
      : control === "ai_active"
        ? "handback"
        : "aiPaused";
  addMessage(world, thread, "system", copy(key, { name: thread.creatorName }), {
    frameKind: "control",
    frame: { control },
  });
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
      if (
        Date.parse(e.at) < from ||
        e.path.startsWith("/__harness/") ||
        (query.client && e.client !== query.client)
      )
        continue;
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
      comparisonsAvailable: world.comparisonsAvailable,
      policyVerified: world.policy.verified,
      policyVersion: world.policy.version,
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
    // C4 presence, by creator: what each account may currently see.
    presence: [...world.presence.entries()].map(([creatorId, p]) => ({
      creator: world.creators.get(creatorId).handle,
      notes: p.notes.length,
      published: p.notes.filter((n) => n.published).length,
      visible: Object.fromEntries(
        [...world.accounts.values()].map((a) => [
          a.key,
          p.notes.filter((n) => n.published && n.visibleTo.has(a.id)).length,
        ]),
      ),
      reactions: p.reactions.map((r) => ({
        id: r.id,
        account: world.accounts.get(r.fanAccountId).key,
        replyAvailable: r.replyAvailable,
      })),
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
    // WP 7.4 P11: comparisons on, or off again while a choice is open.
    if (typeof body?.comparisonsAvailable === "boolean")
      world.comparisonsAvailable = body.comparisonsAvailable;
    if (typeof body?.policyVerified === "boolean")
      world.policy.verified = body.policyVerified;
    // WP 7.4 P6: the providers the consent screen names. A new list is a new
    // policy version, so earlier consents no longer match it.
    if (Array.isArray(body?.providers) && body.providers.length) {
      world.policy.providers = body.providers.slice(0, 8).map((p) => ({
        name: String(p.name),
        termsUrl: String(p.termsUrl ?? "https://example.invalid/terms"),
        noTraining: p.noTraining === true,
        noRetention: p.noRetention === true,
      }));
      world.policy.version = "harness-providers-custom";
    }
    if (Number.isFinite(body?.replyDelayMs))
      world.replyDelayMs = body.replyDelayMs;
    if (Number.isFinite(body?.sentenceDelayMs))
      world.sentenceDelayMs = body.sentenceDelayMs;
    return { ok: true };
  });

  // WP 7.4 P7: flag an account under 18 after sign-in (an ops review), or
  // clear the flag. Its next authenticated request ends its session.
  router.add("POST", "/__harness/accounts/:key", ({ world, params, body }) => {
    const account = [...world.accounts.values()].find(
      (a) => a.key === params.key,
    );
    if (!account) throw new Failure(404, "not_found", "No such account.");
    if (typeof body?.adult === "boolean") account.adult = body.adult;
    return { key: account.key, adult: account.adult };
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

  // The person shows up. A Note or a reaction is never a thread message (C4):
  // it is published once and the thread reads it from /v1/content/.../presence,
  // so nothing is pushed to an open screen.
  router.add("POST", "/__harness/threads/:handle/note", (ctx) => {
    const thread = threadOf(ctx);
    const creator = ctx.world.creators.get(thread.creatorId);
    const note = publishNote(ctx.world, creator, {
      text: String(
        ctx.body?.text ?? "A new Note: the glaze clinic moved to 6pm.",
      ),
      audience: ctx.body?.audience,
      visibleTo: ctx.body?.visible === false ? [] : [thread.fanAccountId],
    });
    return presenceItem(creator, note);
  });
  // Maya reacts to the fan's own reply to her newest Note that fan may see.
  router.add("POST", "/__harness/threads/:handle/reaction", (ctx) => {
    const thread = threadOf(ctx);
    const creator = ctx.world.creators.get(thread.creatorId);
    const note = ctx.world.presence
      .get(creator.id)
      ?.notes.filter((n) => n.visibleTo.has(thread.fanAccountId))
      .at(-1);
    if (!note)
      throw new Failure(404, "harness_no_note", "No Note this fan may see.");
    const account = ctx.world.accounts.get(thread.fanAccountId);
    return presenceItem(
      creator,
      react(ctx.world, creator, note, account, {
        reaction: ctx.body?.reaction,
      }),
    );
  });
  // Eligibility changes take effect on the next read (the fan leaves a tier,
  // a Note is withdrawn, a reply is withdrawn), as on the real server.
  router.add("POST", "/__harness/threads/:handle/presence", (ctx) => {
    const thread = threadOf(ctx);
    const presence = ctx.world.presence.get(thread.creatorId);
    if (!presence) throw new Failure(404, "harness_no_presence", "No Notes.");
    let changed = 0;
    for (const note of presence.notes) {
      if (ctx.body?.noteId && note.id !== ctx.body.noteId) continue;
      if (typeof ctx.body?.visible === "boolean") {
        if (ctx.body.visible) note.visibleTo.add(thread.fanAccountId);
        else note.visibleTo.delete(thread.fanAccountId);
        changed += 1;
      }
      if (typeof ctx.body?.published === "boolean") {
        note.published = ctx.body.published;
        changed += 1;
      }
    }
    if (typeof ctx.body?.replyAvailable === "boolean")
      for (const reaction of presence.reactions)
        if (reaction.fanAccountId === thread.fanAccountId) {
          reaction.replyAvailable = ctx.body.replyAvailable;
          changed += 1;
        }
    return { changed };
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
  // The fan's other device sends a message: the reply streams to this thread's open screens.
  router.add("POST", "/__harness/threads/:handle/ask", (ctx) =>
    sendToAi(
      ctx.world,
      threadOf(ctx),
      String(ctx.body?.text ?? "A question from my other device"),
      `harness-${ctx.world.now()}-${Math.random()}`,
    ),
  );
  // Ends every live connection, as a dropped network or a server restart would.
  router.add("POST", "/__harness/sockets/close", ({ world, body }) => {
    const count = world.sockets.size;
    for (const socket of [...world.sockets])
      socket.close(body?.code ?? 1013, "Harness closed this connection");
    return { closed: count };
  });
  router.add("POST", "/__harness/threads/:handle/takeover", (ctx) => {
    changeControl(ctx.world, threadOf(ctx), "human_active");
    return { ok: true };
  });
  router.add("POST", "/__harness/threads/:handle/handback", (ctx) => {
    changeControl(ctx.world, threadOf(ctx), "ai_active");
    return { ok: true };
  });
  router.add("POST", "/__harness/threads/:handle/pause", (ctx) => {
    changeControl(ctx.world, threadOf(ctx), "ai_paused");
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
  // A deleted/recreated conversation keeps its route but has a new physical
  // identity. Used with the app stopped; it must never inherit the old draft.
  router.add("POST", "/__harness/threads/:handle/recreate", (ctx) => {
    const thread = threadOf(ctx);
    if (thread.listeners.size || thread.generation)
      throw new Failure(
        409,
        "harness_thread_active",
        "Stop the app and generation first.",
      );
    thread.id = randomUUID();
    thread.messages = [];
    thread.frames = [];
    thread.idempotency.clear();
    thread.memory = [];
    thread.cursor = 0;
    thread.epoch = 0;
    thread.revision = 1;
    return { id: thread.id };
  });
}
