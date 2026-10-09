// Checks that the fake API answers in the shapes the real contracts allow: it
// signs in as each persona, calls what the apps call, and parses every answer
// with the same Zod schemas the real backend uses. Not a unit test of product
// code: it keeps the fake honest.
//   pnpm exec tsx tests/scenarios/lane-7/harness/check-contract.mjs [--base http://127.0.0.1:56473]
// Without --base it starts its own harness on port 56474, so a harness you are
// operating by hand is not disturbed (this check sends messages and signs out).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const root = new URL("../../../../", import.meta.url);
const { z } = createRequire(new URL("packages/api/package.json", root))("zod");
const api = (path) => import(new URL(`packages/api/src/${path}`, root).href);
const {
  SessionSchema,
  IdentityCompletionSchema,
  SessionTokenSchema,
  DoneSchema,
  FanProfileSchema,
} = await api("identity.ts");
const {
  IdentityCapabilitiesSchema,
  IdentityRedirectSchema,
  ErrorSchema,
  FrameSchema,
  AcceptedMessageSchema,
  MessageSchema,
} = await api("schemas.ts");
const {
  ConversationPageSchema,
  ConversationOfflineSnapshotSchema,
  MemoryItemSchema,
  ConversationAccountPageSchema,
  ConversationUsageSchema,
  AuditEntrySchema,
  ProviderPolicySchema,
} = await api("conversation/contracts.ts");
const growth = await import(
  new URL("apps/backend/src/modules/growth/contracts.ts", root).href
);

const args = process.argv.slice(2);
const own = args.includes("--base")
  ? null
  : spawn(
      process.execPath,
      [new URL("server.mjs", import.meta.url).pathname, "--port", "56474"],
      { stdio: "ignore" },
    );
const base = own ? "http://127.0.0.1:56474" : args[args.indexOf("--base") + 1];
for (let attempt = 0; own && attempt < 50; attempt += 1) {
  if (
    await fetch(`${base}/__harness/health`).then(
      (r) => r.ok,
      () => false,
    )
  )
    break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
let failures = 0;
let checks = 0;

const check = (name, schema, value) => {
  checks += 1;
  const result = schema.safeParse(value);
  console.log(`${result.success ? "ok  " : "FAIL"} ${name}`);
  if (result.success) return;
  failures += 1;
  for (const issue of result.error.issues.slice(0, 3))
    console.log(`       ${issue.path.join(".")}: ${issue.message}`);
};
const call = async (method, path, { token, body, headers } = {}) => {
  const response = await fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json().catch(() => null),
  };
};

const signIn = async (actorId) => {
  const started = await call("POST", "/v1/identity/continue", {
    body: { returnTo: "/home" },
  });
  check("continue", IdentityRedirectSchema, started.json);
  return call("POST", "/v1/identity/complete", {
    body: { continuationId: started.json.continuationId, code: actorId },
  });
};

const capabilities = await call("GET", "/v1/identity/capabilities");
check("capabilities", IdentityCapabilitiesSchema, capabilities.json);
// The chooser lists the personas in a fixed order: Devon, Priya, a new fan, Maya, an account under 18.
const [devonId, , newFanId, , minorId] =
  capabilities.json.developmentActors.map((a) => a.id);

const devon = await signIn(devonId);
check("complete (devon)", IdentityCompletionSchema, devon.json);
const token = devon.json.token;
check(
  "session",
  SessionSchema,
  (await call("GET", "/v1/identity/session", { token })).json,
);
const refreshed = await call("POST", "/v1/identity/refresh", { token });
check("refresh", SessionTokenSchema, refreshed.json);
const stale = await call("GET", "/v1/identity/session", { token });
check(
  "the rotated-out token is refused (401)",
  ErrorSchema,
  stale.status === 401 ? stale.json : null,
);
const live = refreshed.json.token;
const minor = await signIn(minorId);
check(
  "under 18 is refused (403)",
  ErrorSchema,
  minor.status === 403 ? minor.json : null,
);
const fresh = await signIn(newFanId);
check(
  "new fan has no profile yet",
  SessionSchema.extend({ fan: z.null() }),
  fresh.json.session,
);
const saved = await call("POST", "/v1/identity/fan-profile", {
  token: fresh.json.token,
  body: { handle: "@Checker_1", intro: "" },
});
check("fan-profile", FanProfileSchema, saved.json);
check(
  "duplicate handle is refused (409)",
  ErrorSchema,
  (
    await call("POST", "/v1/identity/fan-profile", {
      token: live,
      body: { handle: "checker_1", intro: "" },
    })
  ).json,
);

// Growth
const directory = (await call("GET", "/v1/growth/public/creators")).json;
check(
  "discover",
  z.strictObject({
    creators: growth.CreatorProjection.array(),
    hasMore: z.boolean(),
    nextCursor: z.null(),
  }),
  directory,
);
const maya = directory.creators.find((c) => c.handle === "maya");
const page = (await call("GET", "/v1/growth/public/creators/maya")).json;
check(
  "creator page",
  z.strictObject({
    creator: growth.CreatorProjection,
    posts: growth.ContentProjection.array(),
  }),
  page,
);
check(
  "post",
  z.strictObject({
    creator: growth.CreatorProjection,
    post: growth.ContentProjection,
  }),
  (
    await call(
      "GET",
      `/v1/growth/public/creators/maya/posts/${page.posts[0].id}`,
    )
  ).json,
);
const homeEntry = z.strictObject({
  id: z.uuid(),
  creatorId: z.uuid(),
  creatorName: z.string(),
  label: z.string(),
  preview: z.string(),
  destination: growth.HomeThreadDestination,
  updatedAt: z.string(),
  kind: z.literal("thread"),
});
const postEntry = z.strictObject({
  post: z.strictObject({
    id: z.uuid(),
    creatorId: z.uuid(),
    version: z.int(),
    title: z.string(),
    authorLabel: z.string(),
    preview: z.string(),
  }),
  creator: growth.CreatorProjection,
});
check(
  "home",
  z.strictObject({
    entries: homeEntry.array(),
    posts: postEntry.array(),
    followingCount: z.int(),
    threadOrder: z.literal("activity"),
    nextThreadsCursor: z.null(),
    nextPostsCursor: z.null(),
    unread: z.int(),
  }),
  (await call("GET", "/v1/growth/home", { token: live })).json,
);
check(
  "follow",
  z.strictObject({ following: z.boolean() }),
  (
    await call("PUT", `/v1/growth/follow/${maya.id}`, {
      token: live,
      body: { following: true },
    })
  ).json,
);
const item = z.strictObject({
  id: z.uuid(),
  available: z.boolean(),
  creatorId: z.uuid(),
  type: growth.NotificationType,
  sender: z.string(),
  authorKind: z.string(),
  creatorName: z.string(),
  preview: z.string(),
  destination: growth.Destination,
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
const inbox = (await call("GET", "/v1/growth/notifications", { token: live }))
  .json;
check("notifications", z.strictObject({ notifications: item.array() }), inbox);
check(
  "notification",
  item,
  (
    await call("GET", `/v1/growth/notifications/${inbox.notifications[0].id}`, {
      token: live,
    })
  ).json,
);
check(
  "preferences",
  growth.Preferences,
  (await call("GET", "/v1/growth/preferences", { token: live })).json,
);

// Conversations: every thread state
const capabilitiesPage = (await call("GET", "/v1/conversations/capabilities"))
  .json;
check(
  "conversation capabilities: providers",
  ProviderPolicySchema,
  capabilitiesPage.providers,
);
const account = (
  await call("GET", "/v1/conversations/account", { token: live })
).json;
check("account", ConversationAccountPageSchema, account);
for (const thread of account.threads) {
  const root = `/v1/conversations/${thread.creatorId}/${thread.fanId}`;
  const page = (await call("GET", root, { token: live })).json;
  check(
    `thread page: ${thread.name} (${page.control}, canSend ${page.canSend})`,
    ConversationPageSchema,
    page,
  );
  check(
    `  frames: ${thread.name}`,
    FrameSchema.array(),
    (await call("GET", `${root}/events?cursor=0`, { token: live })).json,
  );
  const offline = await call("GET", `${root}/offline`, { token: live });
  if (page.consentCurrent)
    check(
      `  offline lease: ${thread.name}`,
      ConversationOfflineSnapshotSchema,
      offline.json,
    );
  else
    check(
      `  offline refused without consent: ${thread.name}`,
      ErrorSchema,
      offline.json,
    );
}
const rich = account.threads.find((t) => t.name === "Maya");
const richRoot = `/v1/conversations/${rich.creatorId}/${rich.fanId}`;
check(
  "usage",
  ConversationUsageSchema,
  (await call("GET", `${richRoot}/usage`, { token: live })).json,
);
check(
  "audit",
  AuditEntrySchema.array(),
  (await call("GET", `${richRoot}/audit`, { token: live })).json,
);
const memory = (await call("GET", `${richRoot}/memory`, { token: live })).json;
check(
  "memory",
  z.strictObject({
    revision: z.int(),
    offTheRecord: z.boolean(),
    introShared: z.boolean(),
    items: MemoryItemSchema.array(),
  }),
  memory,
);

// Sending: a reply streams in, a repeated key is one effect, the wrong person is refused.
await call("POST", "/__harness/flags", {
  body: { replyDelayMs: 20, sentenceDelayMs: 20 },
});
const key = `check-${Date.now()}`;
const sent = await call("POST", `${richRoot}/messages`, {
  token: live,
  body: { text: "Hello again", idempotencyKey: key, clientSequence: 99 },
});
check("send: accepted message", AcceptedMessageSchema, sent.json);
const again = await call("POST", `${richRoot}/messages`, {
  token: live,
  body: { text: "Hello again", idempotencyKey: key, clientSequence: 99 },
});
check(
  "send: the same key returns the same message",
  z.literal(sent.json.message.id),
  again.json.message.id,
);
await new Promise((resolve) => setTimeout(resolve, 600));
const after = (await call("GET", richRoot, { token: live })).json;
check(
  "send: the reply was delivered once",
  z.literal(1),
  after.messages.filter(
    (m) => m.authorKind === "fan" && m.text === "Hello again",
  ).length,
);
check("send: page after the reply", ConversationPageSchema, after);
check(
  "send: a message",
  MessageSchema.extend({
    citations: z.array(z.uuid()),
    createdAt: z.string(),
    member: z.string().nullable(),
    offTheRecord: z.boolean(),
    version: z.int(),
    agentVersion: z.unknown().optional(),
  }),
  after.messages.at(-1),
);
check(
  "another account cannot read the thread (403)",
  ErrorSchema,
  (await call("GET", richRoot, { token: fresh.json.token })).json,
);
check(
  "signed out is refused (401)",
  ErrorSchema,
  (await call("GET", richRoot)).json,
);
check(
  "logout",
  DoneSchema,
  (await call("POST", "/v1/identity/logout", { token: live })).json,
);

console.log(`\n${checks - failures} of ${checks} checks passed`);
own?.kill();
process.exit(failures ? 1 : 0);
