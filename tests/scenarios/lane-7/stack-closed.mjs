// Closed conversations on both sides, on a real stack (F11, F15 and the honest
// states in the product design's section 8): a fan deletes a conversation, a
// fan blocks a creator, Ops pauses a creator, and a creator deletes their
// account. After each, fan Home and the creators' Studio Threads pages answer
// and leave the closed conversation out, and nothing else changes: it still
// answers 403 scope_revoked, every other conversation stays, and a closed
// Studio still refuses its own page. Then the same pages in Chrome.
// Fakes and stand-ins, each named where used: the development identity, the
// model fake, software passkeys enrolled as rows (lane 1's registration
// ceremony, as in lanes 4 and 5) and Priya's verification as a row (lane 1's
// review). No token is printed, put in a fixture or written to disk.
// It pauses Priya and deletes Devon's account: give it a fresh stack of its
// own, with the web app, and an optional screenshot folder outside the
// repository. --native ios|android also opens each fan's Home in the app, signed
// in afresh, on LANE7_IOS or LANE7_ANDROID (lane 7's run-app.mjs; its
// screenshots go to LANE7_OUT). The iOS build names the stack's API; CI's
// Android APK gets it from LANE7_API_URL, with LANE7_PORT set to its port.
//   node infra/local/stack.mjs up --lane N --base-port P --growth
//   LANE7_STACK_API=http://127.0.0.1:<P+1> LANE7_STACK_WEB=http://localhost:<P+2> \
//     LANE7_STACK_POSTGRES=qelvora-laneN-postgres \
//     node tests/scenarios/lane-7/stack-closed.mjs [--native ios|android] [screenshot folder]
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { launch, screenshot, sleep, waitForText } from "./lib.mjs";
import {
  creator as maya,
  devon,
  preparePriya,
  psql,
  publishAI,
  request,
  signIn,
} from "./stack-api.mjs";

const web = new URL(process.env.LANE7_STACK_WEB ?? "http://localhost:56472");
const args = process.argv.slice(2);
const native = args.includes("--native")
  ? args.splice(args.indexOf("--native"), 2)[1]
  : null;
assert.ok([null, "ios", "android"].includes(native), "--native ios|android");
const folder = args[0];
const account = (n) => `10000000-0000-4000-8000-00000000000${n}`;
let failures = 0;
const step = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`,
  );
};

async function fan(number, label) {
  const owner = await signIn(number);
  let profile = owner.session.fan;
  if (!profile) {
    const made = await request(
      "POST",
      "/v1/identity/fan-profile",
      owner.token,
      { handle: `lane7closed${number}`, intro: "" },
    );
    assert.equal(made.status, 200, `Fan ${label}'s profile: ${made.status}`);
    profile = made.body;
  }
  return { number, label, token: owner.token, id: profile.id };
}
async function begin(person, creatorId) {
  const caps = await request(
    "GET",
    "/v1/conversations/capabilities",
    person.token,
  );
  assert.equal(caps.status, 200);
  const begun = await request("POST", "/v1/conversations/begin", person.token, {
    creatorId,
    policyVersion: caps.body.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: randomUUID(),
  });
  assert.equal(begun.status, 200, `Fan ${person.label}'s conversation`);
  const page = await request(
    "GET",
    `/v1/conversations/${creatorId}/${person.id}`,
    person.token,
  );
  assert.equal(page.status, 200);
  return page.body.threadId;
}
// A software passkey enrolled as a row: a stand-in for lane 1's registration
// ceremony. It signs through the real begin and verify endpoints.
function passkey(number) {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = keys.publicKey.export({ format: "jwk" });
  const id = randomBytes(16).toString("base64url");
  const cose = Buffer.concat([
    Buffer.from("a5010203262001215820", "hex"),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from("225820", "hex"),
    Buffer.from(jwk.y, "base64url"),
  ]);
  psql(
    "INSERT INTO creator.passkey_credential(id,account_id,public_key,counter) VALUES(:'id',:'account'::uuid,decode(:'key','hex'),0);",
    { id, account: account(number), key: cose.toString("hex") },
  );
  let counter = 0;
  return (challenge) => {
    const clientData = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge, origin: web.origin }),
    );
    const count = Buffer.alloc(4);
    count.writeUInt32BE(++counter);
    const authenticatorData = Buffer.concat([
      createHash("sha256").update(web.hostname).digest(),
      Buffer.from([5]),
      count,
    ]);
    const signature = sign(
      "sha256",
      Buffer.concat([
        authenticatorData,
        createHash("sha256").update(clientData).digest(),
      ]),
      keys.privateKey,
    );
    return {
      id,
      rawId: id,
      type: "public-key",
      response: {
        clientDataJSON: clientData.toString("base64url"),
        authenticatorData: authenticatorData.toString("base64url"),
        signature: signature.toString("base64url"),
      },
      clientExtensionResults: {},
    };
  };
}
// Studio Threads lists the fans linked by a Note reply or a request: both
// fans follow the creator, who signs a Note to followers, and both reply.
async function publishNote(number, creatorId, name) {
  const owner = await signIn(number);
  const assertion = passkey(number);
  const id = randomUUID();
  const document = {
    kind: "note",
    title: "",
    text: `${name}'s Note for the lane 7 closed-conversation check.`,
    audience: { kind: "followers" },
    media: [],
    nameToken: false,
    showAudienceCount: false,
    aiUseIntent: false,
    scheduledAt: null,
    quote: null,
    packetId: null,
  };
  const saved = await request(
    "POST",
    `/v1/content/${creatorId}/drafts`,
    owner.token,
    { id, expectedVersion: 0, document, idempotencyKey: randomUUID() },
  );
  assert.equal(saved.status, 200, `${name}'s draft: ${saved.status}`);
  const begun = await request(
    "POST",
    `/v1/identity/${creatorId}/signed-acts/begin`,
    owner.token,
    {
      command: {
        actType: "broadcast",
        subjectId: id,
        content: {
          kind: "content_publication",
          creatorId,
          version: saved.body.version,
          document,
        },
      },
    },
  );
  assert.equal(begun.status, 200, `${name}'s signing: ${begun.status}`);
  const verified = await request(
    "POST",
    "/v1/identity/signed-acts/verify",
    owner.token,
    {
      challengeId: begun.body.challengeId,
      assertion: assertion(begun.body.publicKey.challenge),
    },
  );
  assert.equal(verified.status, 200, `${name}'s signature: ${verified.status}`);
  const published = await request(
    "POST",
    `/v1/content/${creatorId}/${id}/publish`,
    owner.token,
    {
      version: saved.body.version,
      signedActId: verified.body.signedActId,
      idempotencyKey: randomUUID(),
    },
  );
  assert.equal(published.status, 200, `${name}'s Note: ${published.status}`);
  return { token: owner.token, note: id };
}
async function follow(person, creatorId) {
  const made = await request(
    "PUT",
    `/v1/growth/follow/${creatorId}`,
    person.token,
    { following: true },
  );
  assert.equal(made.status, 200, `Fan ${person.label} follows: ${made.status}`);
}
// A reply reaches the creator once Trust's reviewer allows it (here the Ops
// supervisor, through the real case lease and decision) and the fan's app
// asks for the review again, which records that decision.
async function reply(person, creatorId, note, reviewer) {
  const made = await request(
    "POST",
    `/v1/content/${creatorId}/${note}/replies`,
    person.token,
    {
      text: `Fan ${person.label}'s reply for the closed-conversation check.`,
      idempotencyKey: randomUUID(),
    },
  );
  assert.equal(made.status, 200, `Fan ${person.label}'s reply: ${made.status}`);
  assert.match(made.body.id, /^[0-9a-f-]{36}$/u);
  const id = psql(
    "SELECT case_id FROM creator_trust.reply_review WHERE reply_id=:'id';",
    { id: made.body.id },
  );
  await decide(reviewer, id, "allow_reply", "The reply is within policy.");
  const reviewed = await request(
    "POST",
    `/v1/content/${creatorId}/replies/${made.body.id}/review`,
    person.token,
    { version: made.body.version, idempotencyKey: randomUUID() },
  );
  assert.equal(
    reviewed.body.safetyState,
    "allowed",
    `Fan ${person.label}'s reply review: ${reviewed.status}`,
  );
}
async function decide(reviewer, id, resolution, reason) {
  const opened = await request(
    "POST",
    `/v1/trust/cases/${id}/access`,
    reviewer.token,
    { purpose: "Review this case for the lane 7 check.", minutes: 15 },
  );
  assert.equal(opened.status, 200, `The case opens: ${opened.status}`);
  const detail = await request("GET", `/v1/trust/cases/${id}`, reviewer.token);
  assert.equal(detail.status, 200, `The case reads: ${detail.status}`);
  const decided = await request(
    "POST",
    `/v1/trust/cases/${id}/decisions`,
    reviewer.token,
    {
      version: detail.body.version,
      resolution,
      reason,
      idempotencyKey: randomUUID(),
    },
  );
  assert.equal(decided.status, 200, `${resolution}: ${decided.status}`);
}

// ------------------------------------------------------------------ setup
const A = await fan(1, "A");
const B = await fan(2, "B");
await publishAI(5, devon, "Devon");
const priya = await preparePriya();
const creators = new Map([
  [maya, "Maya"],
  [devon, "Devon"],
  [priya, "Priya"],
]);
const threads = {};
for (const person of [A, B])
  for (const [id, name] of creators)
    threads[`${person.label} ${name}`] = await begin(person, id);
for (const person of [A, B])
  for (const id of [maya, devon]) await follow(person, id);
const studios = [
  { name: "Maya", creatorId: maya, ...(await publishNote(3, maya, "Maya")) },
  {
    name: "Devon",
    creatorId: devon,
    ...(await publishNote(5, devon, "Devon")),
  },
  { name: "Priya", creatorId: priya, token: (await signIn(6)).token },
];
const supervisor = await signIn(4);
for (const studio of studios.slice(0, 2))
  for (const person of [A, B])
    await reply(person, studio.creatorId, studio.note, supervisor);
const fans = new Map([
  [A.id, "A"],
  [B.id, "B"],
]);
for (const studio of studios.slice(0, 2))
  for (let i = 0; ; i++) {
    const listed = await request(
      "GET",
      `/v1/studio/${studio.creatorId}/threads`,
      studio.token,
    );
    if (listed.status === 200 && listed.body.items.length === 2) break;
    assert.ok(i < 60, `${studio.name}'s Studio must list both fans`);
    await sleep(500);
  }
console.log(
  "PASS setup: fans A and B each talk with Maya, Devon and Priya, follow Maya and Devon, and replied to their signed Notes",
);

// Everything both sides can see: fan Home, every conversation read and every
// Studio Threads page. A refusal is its status and code.
const answer = (read, list) =>
  read.status === 200
    ? list(read.body).sort().join(",") || "(none)"
    : `${read.status} ${read.body.error?.code ?? ""}`;
async function observe() {
  const seen = {};
  for (const person of [A, B]) {
    seen[`Home ${person.label}`] = answer(
      await request("GET", "/v1/growth/home", person.token),
      (body) =>
        body.entries
          .filter((entry) => entry.kind === "thread")
          .map((entry) => creators.get(entry.creatorId) ?? entry.creatorId),
    );
    for (const [id, name] of creators)
      seen[`${person.label} reads ${name}`] = answer(
        await request(
          "GET",
          `/v1/conversations/${id}/${person.id}`,
          person.token,
        ),
        () => ["200"],
      );
  }
  for (const studio of studios)
    seen[`Studio ${studio.name}`] = answer(
      await request(
        "GET",
        `/v1/studio/${studio.creatorId}/threads`,
        studio.token,
      ),
      (body) => body.items.map((item) => fans.get(item.fanId) ?? item.fanId),
    );
  return seen;
}
let expected = {
  "Home A": "Devon,Maya,Priya",
  "Home B": "Devon,Maya,Priya",
  ...Object.fromEntries(
    [A, B].flatMap((person) =>
      [...creators.values()].map((name) => [
        `${person.label} reads ${name}`,
        "200",
      ]),
    ),
  ),
  "Studio Maya": "A,B",
  "Studio Devon": "A,B",
  "Studio Priya": "(none)",
};
// One case: what changed is exactly the expected change, and nothing else.
async function check(name, changes) {
  expected = { ...expected, ...changes };
  const seen = await observe();
  const wrong = Object.keys({ ...expected, ...seen }).filter((key) =>
    expected[key] instanceof RegExp
      ? !expected[key].test(seen[key])
      : expected[key] !== seen[key],
  );
  step(
    name,
    wrong.length === 0,
    Object.entries(seen)
      .filter(([key]) => key in changes || wrong.includes(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ") +
      (wrong.length
        ? ` | unexpected: ${wrong.map((key) => `${key} wanted ${expected[key]}`).join("; ")}`
        : " | everything else unchanged"),
  );
  return seen;
}
await check("before any closure, both sides see every conversation", {});

// ------------------------------------------------------- Chrome, both sides
const browser = await chromium.launch({ channel: "chrome", headless: true });
const labels = {
  1: "Development actor one",
  2: "Development actor two",
  3: "Development actor three",
  5: "Development support reviewer",
  6: "Development verification reviewer",
};
const pages = {};
async function signedIn(number) {
  if (pages[number]) return pages[number];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "en-US",
  });
  const page = await context.newPage();
  await page.goto(new URL("/auth/continue?returnTo=%2Fhome", web).href);
  await page.getByRole("link", { name: "Continue with Pantopus" }).click();
  await page.getByRole("button", { name: labels[number], exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 60_000,
  });
  if (new URL(page.url()).pathname === "/onboarding/handle") {
    await page.locator("#handle").fill(`lane7web${number}${Date.now() % 1e5}`);
    await page.locator("button.handle-continue").click();
    await page.waitForURL((url) => url.pathname !== "/onboarding/handle");
  }
  return (pages[number] = page);
}
async function shot(page, name) {
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `${name}.png`), fullPage: true });
}
async function webHome(person, want, name) {
  const page = await signedIn(person.number);
  await page.goto(new URL("/home", web).href);
  await page.getByRole("heading", { name: "Your people", level: 1 }).waitFor();
  const rows = await page
    .locator('a.growth-card[href^="/threads/"] strong')
    .allInnerTexts();
  const shown = rows
    .map((row) => row.split(" · ")[0])
    .sort()
    .join(",");
  await shot(page, name);
  step(
    `web: fan ${person.label}'s Home in Chrome`,
    shown === want ||
      (want === "(none)" &&
        rows.length === 0 &&
        // Its empty state: "No updates yet" once the fan follows anyone.
        (await page
          .getByText(/^(Pick a creator to start|No updates yet)$/u)
          .isVisible())),
    `rows ${shown || "(none)"}`,
  );
}
// The same Home in the app. Its text is read from the accessibility tree on
// Android and from a screenshot on iOS.
async function nativeHome(person, want, name) {
  if (!native) return;
  launch(
    native,
    "--reset",
    "--actor",
    person.number === 1 ? "actor one" : "actor two",
    "--to",
    "/home",
  );
  const listed = want === "(none)" ? [] : want.split(",");
  const shown = await waitForText(
    native,
    new RegExp(
      `^(?=[\\s\\S]*Your people)${(listed.length
        ? listed.map((creator) => `(?=[\\s\\S]*\\b${creator}\\b)`)
        : ["(?=[\\s\\S]*(No updates yet|Pick a creator to start))"]
      ).join("")}`,
      "u",
    ),
    45000,
  );
  screenshot(native, name);
  const hidden = [...creators.values()].filter(
    (creator) =>
      !listed.includes(creator) &&
      new RegExp(`\\b${creator}\\b`, "u").test(shown.text),
  );
  step(
    `${native}: fan ${person.label}'s Home in the app`,
    shown.ok && hidden.length === 0,
    `shows ${want}${hidden.length ? `, and also ${hidden.join(",")}` : ""}`,
  );
}
// The list, its empty state, or what a refused Studio shows instead.
async function webStudio(number, studio, want, name) {
  const page = await signedIn(number);
  await page.goto(new URL(`/studio/${studio.creatorId}/threads`, web).href);
  const until = Date.now() + 30_000;
  let shown;
  for (;;) {
    const listed = await page
      .getByRole("heading", { name: "Threads", level: 1 })
      .isVisible();
    const handles = await page.locator("article.w5-card h2").allInnerTexts();
    const empty = await page.getByText("No linked conversations").isVisible();
    const alert = (await page.getByRole("alert").allInnerTexts())
      .join(" ")
      .trim();
    shown =
      listed && handles.length
        ? `${handles.length} fan(s)`
        : listed && empty
          ? "(none)"
          : alert;
    if (shown || Date.now() > until) break;
    await sleep(500);
  }
  if (!shown)
    shown = `no list: ${(await page.locator("body").innerText()).replace(/\s+/gu, " ").slice(0, 200)}`;
  await shot(page, name);
  step(
    `web: ${studio.name}'s Studio Threads in Chrome`,
    want instanceof RegExp ? want.test(shown) : shown === want,
    shown,
  );
}
await webHome(A, "Devon,Maya,Priya", "0-home-A-before");
await nativeHome(A, "Devon,Maya,Priya", "0-home-A-before");
await webStudio(3, studios[0], "2 fan(s)", "0-studio-maya-before");

// ------------------------------------------------- 1. a fan deletes one
const deletion = await request("POST", "/v1/trust/privacy/jobs", A.token, {
  kind: "delete",
  scope: "thread",
  creatorId: maya,
  threadId: threads["A Maya"],
  proof: "LOCAL DEVELOPMENT",
  idempotencyKey: randomUUID(),
});
assert.equal(deletion.status, 202, `A's deletion: ${deletion.status}`);
await check(
  "1. fan A deletes the conversation with Maya: A's Home and Maya's Studio leave it out",
  {
    "Home A": "Devon,Priya",
    "A reads Maya": "403 scope_revoked",
    "Studio Maya": "B",
  },
);
// Only the list's filter can leave it out yet: the purge waits (retention).
const waiting = psql(
  `SELECT (SELECT count(*) FROM creator.conversation_relationship WHERE thread_id=:'thread'::uuid),
(SELECT string_agg(p.state,',') FROM creator_trust.privacy_task p JOIN creator_trust.privacy_job j ON j.id=p.job_id
 WHERE j.thread_id=:'thread'::uuid AND j.kind='delete' AND p.domain='conversation');`,
  { thread: threads["A Maya"] },
).split("|");
step(
  "1. the relationship row is still there and the conversation task is not complete",
  waiting[0] === "1" &&
    Boolean(waiting[1]) &&
    !waiting[1].split(",").includes("complete"),
  `rows ${waiting[0]}, conversation task ${waiting[1]}`,
);
await webHome(A, "Devon,Priya", "1-home-A-after-deletion");
await nativeHome(A, "Devon,Priya", "1-home-A-after-deletion");
await webStudio(3, studios[0], "1 fan(s)", "1-studio-maya-after-deletion");

// --------------------------------------------------- 2. a fan blocks one
const block = await request("POST", "/v1/trust/blocks", B.token, {
  creatorId: devon,
  reason: "Lane 7 closed-conversation check: block this creator.",
  idempotencyKey: randomUUID(),
});
assert.equal(block.status, 200, `B's block: ${block.status}`);
await check("2. fan B blocks Devon: B's Home and Devon's Studio leave it out", {
  "Home B": "Maya,Priya",
  "B reads Devon": "403 scope_revoked",
  "Studio Devon": "A",
});
await webHome(B, "Maya,Priya", "2-home-B-after-block");
await nativeHome(B, "Maya,Priya", "2-home-B-after-block");
await webStudio(5, studios[1], "1 fan(s)", "2-studio-devon-after-block");

// ------------------------------------------- 3. Ops pauses a creator (E1.6)
const filed = await request("POST", "/v1/trust/reports", A.token, {
  kind: "pause",
  creatorId: priya,
  reason: "Please pause this AI while it is reviewed.",
  idempotencyKey: randomUUID(),
});
assert.ok([200, 201].includes(filed.status), `A's request: ${filed.status}`);
await decide(
  supervisor,
  filed.body.id,
  "pause_creator",
  "Paused while the AI's replies are reviewed.",
);
for (let i = 0; i < 40; i++) {
  const read = await request(
    "GET",
    `/v1/conversations/${priya}/${A.id}`,
    A.token,
  );
  if (read.status !== 200) break;
  await sleep(250);
}
await check(
  "3. Ops pauses Priya: both fans' Homes leave her out, and her closed Studio still refuses its page",
  {
    "Home A": "Devon",
    "Home B": "Maya",
    "A reads Priya": "403 scope_revoked",
    "B reads Priya": "403 scope_revoked",
    "Studio Priya": "403 scope_revoked",
  },
);
await webHome(A, "Devon", "3-home-A-after-pause");
await nativeHome(A, "Devon", "3-home-A-after-pause");
await webHome(B, "Maya", "3-home-B-after-pause");
await nativeHome(B, "Maya", "3-home-B-after-pause");
await webStudio(6, studios[2], /\S/u, "3-studio-priya-after-pause");

// ------------------------------------- 4. a creator deletes their account
const closing = await request(
  "POST",
  "/v1/trust/privacy/jobs",
  studios[1].token,
  {
    kind: "delete",
    scope: "account",
    proof: "LOCAL DEVELOPMENT",
    idempotencyKey: randomUUID(),
  },
);
assert.equal(
  closing.status,
  202,
  `Devon's account deletion: ${closing.status}`,
);
await check(
  "4. Devon deletes his account: A's Home leaves him out, B's keeps Maya, and his Studio refuses as any closed account",
  {
    "Home A": "(none)",
    "A reads Devon": "403 scope_revoked",
    "Studio Devon": /^40[13] /u,
  },
);
step(
  "4. Trust holds Devon's account tombstone with the creator it owned",
  psql(
    `SELECT count(*)||'|'||coalesce(string_agg(array_to_string(j.owned_creator_ids,','),','),'')
FROM creator_trust.tombstone t JOIN creator_trust.privacy_job j ON j.id=t.job_id
WHERE t.account_id=:'account'::uuid AND t.scope='account';`,
    { account: account(5) },
  ) === `1|${devon}`,
);
await webHome(A, "(none)", "4-home-A-after-account-deletion");
await nativeHome(A, "(none)", "4-home-A-after-account-deletion");
await webHome(B, "Maya", "4-home-B-after-account-deletion");
await nativeHome(B, "Maya", "4-home-B-after-account-deletion");

// What Trust's reason can read: its runtime role, as each fan, sees that
// fan's own tombstones and blocks only, never Devon's account deletion.
for (const [person, want] of [
  [A, `thread:${maya}|0`],
  [B, "(none)|1"],
]) {
  const view = psql(
    `SELECT set_config('role','creator_trust_runtime',false),set_config('app.account_id',:'account',false);
SELECT coalesce((SELECT string_agg(scope||':'||coalesce(creator_id::text,'-'),',') FROM creator_trust.tombstone),'(none)'),
(SELECT count(*) FROM creator_trust.block);`,
    { account: account(person.number) },
  )
    .split("\n")
    .at(-1);
  step(
    `Trust's runtime role, as fan ${person.label}, sees only ${person.label}'s own records`,
    view === want,
    `tombstones|blocks ${view}`,
  );
}

// A malformed tombstone, a NULL reference that no request can write (here a
// row, with its own completed export job), matches no family in Trust's
// denial. It must not hide fan B's list or Home either.
psql(
  `WITH job AS (INSERT INTO creator_trust.privacy_job(account_id,kind,scope,state,verified_at,verification_ref)
 VALUES(:'account'::uuid,'export','account','complete',now(),'lane7-malformed-standin') RETURNING id)
INSERT INTO creator_trust.tombstone(account_id,scope,creator_id,thread_id,job_id)
 SELECT :'account'::uuid,'creator',NULL,NULL,id FROM job;`,
  { account: account(B.number) },
);
const listed = await request("GET", "/v1/conversations/account", B.token);
const kept = (listed.body.threads ?? [])
  .map((thread) => creators.get(thread.creatorId))
  .sort()
  .join(",");
await check("a NULL reference among B's tombstones changes no answer", {});
step(
  "a NULL reference among B's tombstones leaves B's list whole",
  listed.status === 200 && kept === "Devon,Maya,Priya",
  `list ${listed.status} ${kept || "(none)"}`,
);

await browser.close();
console.log(failures ? `\n${failures} step(s) failed` : "\nall steps passed");
process.exit(failures ? 1 : 0);
