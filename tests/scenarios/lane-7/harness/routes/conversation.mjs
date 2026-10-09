// Conversations: the page, replay, offline lease, sending (to the AI while it
// is in control, to the person once she has stepped in), memory, consent and
// the live frames. Behavior and error codes follow
// apps/backend/src/modules/conversation (feature.ts, service.ts, offline.ts).
import { createHash, randomUUID } from "node:crypto";
import { Failure } from "../http.mjs";
import { addMessage, copy, frame, ids, uid } from "../world.mjs";
import { authenticate } from "./identity.mjs";

const invalid = () =>
  new Failure(
    400,
    "invalid_request",
    "The request does not match the API contract.",
  );

export function ownThread(ctx) {
  const { account, session } = authenticate(ctx);
  const thread = ctx.world.threads.get(
    `${ctx.params.creatorId}/${ctx.params.fanId}`,
  );
  // The same refusal for a thread that does not exist and one that is not yours.
  if (!thread || thread.fanAccountId !== account.id)
    throw new Failure(
      403,
      "thread_unavailable",
      "This conversation is unavailable.",
    );
  return { thread, account, session };
}

/** Why the composer cannot send, or null: the same order feature.ts uses. */
export function unavailableReason(world, thread) {
  if (thread.control === "human_active") return null;
  if (thread.consentVersion !== world.policy.version)
    return "Review the AI providers before messaging.";
  if (!world.generationAvailable) return "AI messaging is not connected yet.";
  if (thread.control !== "ai_active")
    return "AI messaging is paused in this conversation.";
  if (!thread.access)
    return "Your AI access or allowance is unavailable. You can still ask the creator to step in.";
  return null;
}

export function pageOf(world, thread, before) {
  const all = before
    ? thread.messages.filter((m) => m.sequence < before)
    : thread.messages;
  const messages = all.slice(-50);
  const reason = unavailableReason(world, thread);
  return {
    threadId: thread.id,
    creatorId: thread.creatorId,
    fanId: thread.fanId,
    creatorName: thread.creatorName,
    fanHandle: thread.fanHandle,
    control: thread.control,
    epoch: thread.epoch,
    cursor: thread.cursor,
    revision: thread.revision,
    generationSequences: thread.generation
      ? { [thread.generation.id]: thread.generation.sequence }
      : {},
    messages,
    before: all.length > 50 ? messages[0].sequence : null,
    offTheRecord: thread.offTheRecord,
    introShared: thread.introShared,
    consentCurrent: thread.consentVersion === world.policy.version,
    canSend: reason === null,
    unavailableReason: reason,
    feedbackPolicy: null,
  };
}

/** A send answers with the base message: the page adds citations, time and version. */
const base = (m) => ({
  id: m.id,
  threadId: m.threadId,
  authorKind: m.authorKind,
  text: m.text,
  deliveryState: m.deliveryState,
  controlEpoch: m.controlEpoch,
  sequence: m.sequence,
  signedActId: m.signedActId,
  member: m.member,
  authorAccountId: m.authorAccountId,
});

const REPLIES = [
  [
    "Here's how I'd think about that.",
    "Start with the simplest change you can test on one tile.",
    "If it still happens, tell me your clay body and firing schedule and we can narrow it down.",
  ],
  [
    "That depends on a few things I can't see from here.",
    "Your clay body and the thickness of the glaze matter most.",
    "Share them and I'll point to the posts that cover it.",
  ],
];
const replyFor = (text) =>
  /\blong\b/iu.test(text)
    ? Array.from(
        { length: 14 },
        (_, i) =>
          `Point ${i + 1}: keep the test small, change one thing, and write down what you did.`,
      )
    : REPLIES[text.length % REPLIES.length];

function schedule(world, ms, work) {
  const timer = setTimeout(() => {
    world.timers.delete(timer);
    work();
  }, ms);
  world.timers.add(timer);
}

/** Streams a reply sentence by sentence. A takeover that raises the epoch
 * clears `thread.generation`, and the next sentence is dropped (INV-03). */
function generate(world, thread, fanMessage, generationId) {
  const ai = addMessage(world, thread, "ai", "", {
    fields: { deliveryState: "generating" },
  });
  thread.generation = { id: generationId, messageId: ai.id, sequence: 0 };
  const sentences = replyFor(fanMessage.text);
  const step = () => {
    if (thread.generation?.id !== generationId) return;
    if (thread.generation.sequence < sentences.length) {
      const sentence = sentences[thread.generation.sequence];
      thread.generation.sequence += 1;
      ai.text += (ai.text ? " " : "") + sentence;
      frame(
        thread,
        "sentence",
        { ...ai, text: sentence },
        { generationId, sequence: thread.generation.sequence },
      );
      thread.revision += 1;
      schedule(world, world.sentenceDelayMs, step);
    } else {
      ai.deliveryState = "delivered";
      ai.citations = [ids.post(1)];
      fanMessage.deliveryState = "delivered";
      thread.generation = null;
      thread.revision += 1;
      frame(thread, "delivered", ai, {
        generationId,
        sequence: sentences.length,
      });
    }
  };
  schedule(world, world.replyDelayMs, step);
}

/** Replays an accepted key, or null. Existing keys reconcile even when the
 * model is down, as the real send path does. */
function prior(thread, key) {
  return thread.idempotency.get(key) ?? null;
}

function sendBody(body) {
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const key = body?.idempotencyKey;
  if (
    !text ||
    text.length > 10_000 ||
    typeof key !== "string" ||
    key.length < 8 ||
    key.length > 128 ||
    !Number.isInteger(body?.clientSequence)
  )
    throw invalid();
  return { text, key };
}

export function register(router) {
  router.add("GET", "/v1/conversations/capabilities", ({ world }) => ({
    providers: world.policy,
    developmentSynthetic: !world.policy.verified,
    consentAvailable: true,
    generationAvailable: world.generationAvailable,
    firstConversationAvailable: true,
    correctionsAvailable: false,
    comparisonsAvailable: false,
    recordingDeliveryAvailable: false,
    offlineAvailable: world.policy.verified,
    accessDisclosure: copy("conversationAccess"),
  }));

  router.add("GET", "/v1/conversations/account", (ctx) => {
    const { account } = authenticate(ctx);
    if (!account.fan)
      throw new Failure(403, "fan_profile_required", "Choose a handle first.");
    const threads = [...ctx.world.threads.values()]
      .filter((t) => t.fanAccountId === account.id)
      .map((t) => ({
        id: t.id,
        creatorId: t.creatorId,
        fanId: t.fanId,
        name: ctx.world.creators.get(t.creatorId).name,
      }));
    return {
      fan: {
        id: account.fan.id,
        handle: account.fan.handle,
        intro: account.fan.intro,
      },
      threads,
      nextCursor: null,
    };
  });

  const begin = (ctx) => {
    const { account } = authenticate(ctx);
    const { world, body } = ctx;
    const creator = world.creators.get(body?.creatorId);
    if (
      !account.fan ||
      !creator ||
      body?.accessNoticeAccepted !== true ||
      typeof body?.idempotencyKey !== "string"
    )
      throw invalid();
    if (body.policyVersion !== world.policy.version)
      throw new Failure(
        403,
        "providers_unconfigured",
        "AI provider policy is unavailable for this account.",
      );
    if (!world.generationAvailable)
      throw new Failure(
        403,
        "generation_unavailable",
        "AI conversations are not available yet. No first conversation has started.",
      );
    let thread = world.threads.get(`${creator.id}/${account.fan.id}`);
    if (!thread) {
      thread = {
        id: uid("71000000", 100 + world.threads.size),
        creatorId: creator.id,
        creatorAccountId: creator.accountId,
        creatorName: creator.name,
        fanId: account.fan.id,
        fanAccountId: account.id,
        fanHandle: account.fan.handle,
        control: "ai_active",
        epoch: 0,
        cursor: 0,
        revision: 1,
        messages: [],
        frames: [],
        listeners: new Set(),
        offTheRecord: false,
        introShared: false,
        consentVersion: world.policy.version,
        access: true,
        generation: null,
        idempotency: new Map(),
        memory: [],
      };
      world.threads.set(`${creator.id}/${account.fan.id}`, thread);
    }
    return pageOf(world, thread);
  };
  router.add("POST", "/v1/conversations/begin", begin);
  router.add("POST", "/v1/conversations", begin);

  router.add("GET", "/v1/conversations/:creatorId/:fanId", (ctx) => {
    const { thread } = ownThread(ctx);
    return pageOf(
      ctx.world,
      thread,
      ctx.query.before ? Number(ctx.query.before) : undefined,
    );
  });

  router.add("GET", "/v1/conversations/:creatorId/:fanId/events", (ctx) => {
    const { thread } = ownThread(ctx);
    const cursor = Number(ctx.query.cursor ?? 0);
    if (!Number.isInteger(cursor) || cursor < 0) throw invalid();
    return thread.frames.filter((f) => f.cursor > cursor).slice(0, 256);
  });

  router.add(
    "GET",
    "/v1/conversations/:creatorId/:fanId/messages/:id",
    (ctx) => {
      const { thread } = ownThread(ctx);
      const message = thread.messages.find((m) => m.id === ctx.params.id);
      if (!message)
        throw new Failure(
          404,
          "message_unavailable",
          "This message is unavailable.",
        );
      return message;
    },
  );

  router.add("GET", "/v1/conversations/:creatorId/:fanId/offline", (ctx) => {
    const { world, req } = ctx;
    const { thread, account, session } = ownThread(ctx);
    if (!world.policy.verified)
      throw new Failure(
        503,
        "offline_unavailable",
        "Offline reading is not connected yet.",
      );
    const page = pageOf(world, thread);
    if (!page.consentCurrent || page.offTheRecord)
      throw new Failure(
        403,
        "offline_unavailable",
        "This conversation cannot be saved for offline reading.",
      );
    const issuer = `http://${req.headers.host}`;
    const issuedAt = world.now();
    const messages = page.messages
      .filter(
        (m) =>
          !m.offTheRecord &&
          !m.recording &&
          ["accepted", "delivered", "interrupted"].includes(m.deliveryState),
      )
      .map((m) => ({ ...m, feedback: null }));
    return {
      lease: {
        issuer,
        accountId: account.id,
        sessionBinding: createHash("sha256")
          .update(
            JSON.stringify({
              accountId: account.id,
              issuer,
              purpose: "conversation-offline-session-v1",
              sessionId: session.id,
            }),
          )
          .digest("hex"),
        threadId: thread.id,
        creatorId: thread.creatorId,
        fanId: thread.fanId,
        revision: page.revision,
        epoch: page.epoch,
        cursor: page.cursor,
        policyVersion: "conversation-offline-five-seconds-v1",
        providerPolicyVersion: world.policy.version,
        issuedAt: new Date(issuedAt).toISOString(),
        expiresAt: new Date(
          Math.min(issuedAt + 5000, session.expiresAt),
        ).toISOString(),
        messages: messages.map((m) => ({ id: m.id, version: m.version })),
      },
      page: {
        ...page,
        messages,
        canSend: false,
        before: null,
        generationSequences: {},
        feedbackPolicy: null,
        unavailableReason: "You're offline. Reconnect to send.",
      },
    };
  });

  router.add("POST", "/v1/conversations/:creatorId/:fanId/presence", (ctx) => {
    ownThread(ctx);
    if (
      typeof ctx.body?.active !== "boolean" ||
      typeof ctx.body?.clientId !== "string"
    )
      throw invalid();
    return { recorded: true };
  });

  router.add("GET", "/v1/conversations/:creatorId/:fanId/usage", (ctx) => {
    ownThread(ctx);
    const day = new Date(ctx.world.now()).toISOString().slice(0, 10);
    return {
      timezone: "UTC",
      days: [{ day, seconds: 600, companionSeconds: 0 }],
      modeAvailable: true,
      measurement: "Time with this AI, counted while this screen is open.",
    };
  });

  router.add("POST", "/v1/conversations/:creatorId/:fanId/messages", (ctx) => {
    const { thread } = ownThread(ctx);
    const { world } = ctx;
    const { text, key } = sendBody(ctx.body);
    const accepted = prior(thread, key);
    if (accepted) return accepted;
    if (!world.generationAvailable)
      throw new Failure(
        503,
        "model_unconfigured",
        "AI messaging is not connected yet.",
      );
    if (thread.control !== "ai_active")
      throw new Failure(
        403,
        "ai_unavailable",
        "The AI is unavailable in this conversation.",
      );
    if (thread.consentVersion !== world.policy.version)
      throw new Failure(
        403,
        "processor_consent_required",
        "Review the current AI providers before messaging.",
      );
    if (!thread.access)
      throw new Failure(
        403,
        "allowance_unavailable",
        "Your AI access or allowance is unavailable. You can still ask the creator to step in.",
      );
    if (thread.generation)
      throw new Failure(
        403,
        "reply_in_progress",
        "Wait for this reply before sending another message.",
      );
    const generationId = randomUUID();
    const fan = addMessage(world, thread, "fan", text, {
      fields: { deliveryState: "accepted" },
      frame: { generationId },
    });
    const result = { message: base(fan), generationId };
    thread.idempotency.set(key, result);
    generate(world, thread, fan, generationId);
    return result;
  });

  router.add(
    "POST",
    "/v1/conversations/:creatorId/:fanId/fan-replies",
    (ctx) => {
      const { thread } = ownThread(ctx);
      const { text, key } = sendBody(ctx.body);
      const accepted = prior(thread, key);
      if (accepted) return accepted;
      if (thread.control !== "human_active")
        throw new Failure(
          403,
          "human_unavailable",
          "The creator is no longer in this conversation. Refresh before sending.",
        );
      const message = addMessage(ctx.world, thread, "fan", text, {
        fields: { deliveryState: "accepted" },
      });
      const result = base(message);
      thread.idempotency.set(key, result);
      return result;
    },
  );

  router.add(
    "POST",
    "/v1/conversations/:creatorId/:fanId/messages/status",
    (ctx) => {
      const { thread } = ownThread(ctx);
      if (typeof ctx.body?.idempotencyKey !== "string") throw invalid();
      return { accepted: thread.idempotency.has(ctx.body.idempotencyKey) };
    },
  );

  router.add("GET", "/v1/conversations/:creatorId/:fanId/memory", (ctx) => {
    const { thread } = ownThread(ctx);
    return {
      revision: thread.revision,
      offTheRecord: thread.offTheRecord,
      introShared: thread.introShared,
      items: thread.memory,
    };
  });

  const changed = () =>
    new Failure(
      409,
      "revision_conflict",
      "This conversation changed. Review it and try again.",
    );
  router.add(
    "POST",
    "/v1/conversations/:creatorId/:fanId/memory/:id",
    (ctx) => {
      const { thread } = ownThread(ctx);
      const { action, expectedRevision, text } = ctx.body ?? {};
      if (
        !["accept", "delete", "edit", "resolve"].includes(action) ||
        !Number.isInteger(expectedRevision)
      )
        throw invalid();
      if (expectedRevision !== thread.revision) throw changed();
      const item = thread.memory.find((m) => m.id === ctx.params.id);
      if (!item)
        throw new Failure(
          404,
          "memory_unavailable",
          "This memory is unavailable.",
        );
      if (action === "delete")
        thread.memory = thread.memory.filter((m) => m !== item);
      else if (action === "edit")
        Object.assign(item, {
          text: String(text ?? item.text),
          editedByFan: true,
        });
      else item.state = action === "accept" ? "remembered" : "resolved";
      thread.revision += 1;
      return {
        revision: thread.revision,
        offTheRecord: thread.offTheRecord,
        introShared: thread.introShared,
        items: thread.memory,
      };
    },
  );

  router.add(
    "POST",
    "/v1/conversations/:creatorId/:fanId/preferences",
    (ctx) => {
      const { thread } = ownThread(ctx);
      const { offTheRecord, introShared, expectedRevision } = ctx.body ?? {};
      if (
        typeof offTheRecord !== "boolean" ||
        typeof introShared !== "boolean" ||
        !Number.isInteger(expectedRevision)
      )
        throw invalid();
      if (expectedRevision !== thread.revision) throw changed();
      Object.assign(thread, { offTheRecord, introShared });
      thread.revision += 1;
      return { revision: thread.revision, offTheRecord, introShared };
    },
  );

  router.add("POST", "/v1/conversations/:creatorId/:fanId/consent", (ctx) => {
    const { thread } = ownThread(ctx);
    const { version, accepted } = ctx.body ?? {};
    if (typeof accepted !== "boolean" || typeof version !== "string")
      throw invalid();
    if (version !== ctx.world.policy.version)
      throw new Failure(
        403,
        "providers_changed",
        "The AI providers changed. Review them again.",
      );
    thread.consentVersion = accepted ? version : null;
    thread.revision += 1;
    return { consentCurrent: accepted };
  });

  router.add("GET", "/v1/conversations/:creatorId/:fanId/audit", (ctx) => {
    const { thread } = ownThread(ctx);
    return [
      {
        id: uid("a0d17000", 1),
        readerAccountId: thread.creatorAccountId,
        role: "creator",
        readAt: new Date(ctx.world.now() - 3_600_000).toISOString(),
      },
    ];
  });
}
