// Real app + disposable lane 7 API/PostgreSQL. Development identities are
// synthetic; no access token is printed, put in a fixture or written to disk.
// LANE7_STACK_API names another stack's API (its first port + 1), and
// LANE7_STACK_POSTGRES its database container. Android D6 needs the app behind
// delay-proxy.mjs (LANE7_APP_API) until follow-up 12 in
// docs/engineering/native-device-checks.md (idle keep-alive sockets) is fixed.
// After D6's deletion, Home must still open with the fan's other conversation,
// with Devon, whose AI this script publishes through the Studio API.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as A from "./android-ui.mjs";
import { launch as launchApp, sleep, screenshot, waitForText } from "./lib.mjs";

const api = process.env.LANE7_STACK_API ?? "http://127.0.0.1:56471";
// D6R: the app may reach the API through delay-proxy.mjs; checks stay direct.
const appApi = process.env.LANE7_APP_API ?? api;
// Links opened through android-ui.mjs carry this origin, not a fake API's.
process.env.LANE7_API_URL = appApi;
const creator = "20000000-0000-4000-8000-000000000001";
const devon = "20000000-0000-4000-8000-000000000002";
async function request(method, path, token, body, headers = {}) {
  // A kept-alive socket the server closed while the app was being driven fails
  // the next fetch ("other side closed"); a read is safe to send again once.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(api + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
      return { status: response.status, body: await response.json() };
    } catch (error) {
      if (method !== "GET" || attempt > 0 || !(error instanceof TypeError))
        throw error;
    }
  }
}
async function signIn(number) {
  const begun = await request("POST", "/v1/identity/continue", null, {
    returnTo: "/home",
  });
  assert.equal(begun.status, 200);
  const result = await request("POST", "/v1/identity/complete", null, {
    continuationId: begun.body.continuationId,
    code: `10000000-0000-4000-8000-00000000000${number}`,
  });
  assert.equal(result.status, 200);
  return result.body;
}
// The stack publishes Maya's AI only. Devon's goes through the same Studio
// steps as lane 2's seed-maya.mjs, as Devon, once per stack.
async function publishDevon() {
  const owner = await signIn(5);
  const agent = `/v1/agent/${devon}`;
  const state = async () => {
    const read = await request("GET", `${agent}/state`, owner.token);
    assert.equal(read.status, 200);
    return read.body;
  };
  const send = async (method, path, body, status = 200) => {
    const reply = await request(method, agent + path, owner.token, body, {
      "Idempotency-Key": `lane7-devon-${randomUUID()}`,
    });
    assert.equal(reply.status, status, `Devon's ${path}: ${reply.status}`);
  };
  let current = await state();
  if (current.liveVersion && !current.paused) return;
  assert.ok(!current.liveVersion, "Do not replace or resume Devon's AI");
  await send("PUT", "/draft", {
    expectedRevision: current.revision,
    configuration: {
      mode: "companion",
      tone: "As written",
      styleCard: "",
      examples: [],
      rules: ["Always say you are the creator's AI, never the creator."],
      neverReveal: ["home address"],
      handoff: "Offer to ask Devon to step in when a question needs him.",
      dailyCostCapMicros: 5_000_000,
      sessionNudgeMinutes: 90,
      usefulnessCriteria: "Helpful, specific and honest about being an AI.",
      styleCriteria: "Warm, plain and short.",
    },
  });
  await send("POST", "/license", {
    proofReference: `development-synthetic:${devon}`,
    counselVersion: "development-synthetic-unreviewed",
    permittedUses: ["text_ai"],
    termEndsAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
  });
  current = await state();
  await send(
    "POST",
    "/evaluations",
    { expectedRevision: current.revision },
    202,
  );
  const until = Date.now() + 120000;
  while (!current.evaluation || current.evaluation.state === "running") {
    assert.ok(Date.now() < until, "Devon's evaluation must finish");
    await sleep(2000);
    current = await state();
  }
  assert.equal(current.evaluation.state, "passed");
  await send("POST", "/publish", {
    expectedRevision: current.revision,
    evaluationId: current.evaluation.id,
    changes: "Lane 7 development publish",
  });
  current = await state();
  assert.ok(current.liveVersion && !current.paused, "Devon's AI must be live");
  console.log("PASS real API: Devon's AI published through the Studio API");
}
async function prepare(platform) {
  const number = platform === "ios" ? 2 : 1;
  const owner = await signIn(number);
  let fan = owner.session.fan;
  if (!fan) {
    const profile = await request(
      "POST",
      "/v1/identity/fan-profile",
      owner.token,
      { handle: `lane7draft${number}`, intro: "" },
    );
    assert.equal(profile.status, 200);
    fan = profile.body;
  }
  const caps = await request(
    "GET",
    "/v1/conversations/capabilities",
    owner.token,
  );
  assert.equal(caps.status, 200);
  const begun = await request("POST", "/v1/conversations/begin", owner.token, {
    creatorId: creator,
    policyVersion: caps.body.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: randomUUID(),
  });
  assert.equal(begun.status, 200, "The real conversation must be available");
  await publishDevon();
  const other = await request("POST", "/v1/conversations/begin", owner.token, {
    creatorId: devon,
    policyVersion: caps.body.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: randomUUID(),
  });
  assert.equal(other.status, 200, "The conversation with Devon must open");
  const path = `/v1/conversations/${creator}/${fan.id}`;
  let page = await request("GET", path, owner.token);
  assert.equal(page.status, 200);
  if (page.body.control !== "human_active") {
    const author = await signIn(3);
    const takeover = await request("POST", path + "/takeover", author.token, {
      idempotencyKey: randomUUID(),
    });
    assert.equal(
      takeover.status,
      200,
      "Maya's real authority must allow takeover",
    );
    page = await request("GET", path, owner.token);
    assert.equal(page.status, 200);
  }
  assert.equal(page.body.control, "human_active");
  const fixture = {
    api,
    appApi,
    actor: number === 1 ? "actor one" : "actor two",
    creator,
    fan: fan.id,
    thread: page.body.threadId,
    route: `/threads/${creator}/${fan.id}`,
    marker: `lane7 ${platform} real draft ${randomUUID().slice(0, 8)}`,
  };
  console.log(`PASS real ${platform}: authorized human conversation prepared`);
  return { fixture, token: owner.token, path };
}
async function verifyAccepted(fixture, token, path) {
  const until = Date.now() + 30000;
  for (;;) {
    const page = await request("GET", path, token);
    assert.equal(page.status, 200);
    const sent = page.body.messages.filter(
      (message) =>
        message.authorKind === "fan" && message.text === fixture.marker,
    );
    if (sent.length === 1) break;
    assert.equal(sent.length, 0, "No duplicate accepted message");
    assert.ok(Date.now() < until, "The explicit Send must reach the real API");
    await sleep(250);
  }
  console.log("PASS real API: exactly one accepted fan reply");
}
async function verifyDeleted(fixture, token, path) {
  const until = Date.now() + 30000;
  for (;;) {
    const jobs = await request("GET", "/v1/trust/privacy/jobs", token);
    assert.equal(jobs.status, 200);
    if (
      jobs.body.items.some(
        (job) => job.kind === "delete" && job.scope === "thread",
      )
    )
      break;
    assert.ok(Date.now() < until, "A real thread deletion job must exist");
    await sleep(250);
  }
  const denied = await request("GET", path, token);
  assert.ok(
    [403, 404, 410].includes(denied.status),
    `Deleted conversation returned ${denied.status}`,
  );
  console.log(
    `PASS real API: saved thread deletion; subsequent conversation read ${denied.status}`,
  );
}
function persistedDeletion(fixture, number) {
  for (const value of [fixture.creator, fixture.thread])
    assert.match(value, /^[0-9a-f-]{36}$/u);
  const result = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      process.env.LANE7_STACK_POSTGRES ?? "qelvora-lane7-postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "creator_stack",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `thread=${fixture.thread}`,
      "-v",
      `creator=${fixture.creator}`,
      "-v",
      `account=10000000-0000-4000-8000-00000000000${number}`,
    ],
    {
      encoding: "utf8",
      input: `SELECT count(DISTINCT j.id), count(DISTINCT t.id), count(p.domain)
FROM creator_trust.privacy_job j
LEFT JOIN creator_trust.tombstone t ON t.job_id=j.id
LEFT JOIN creator_trust.privacy_task p ON p.job_id=j.id
WHERE j.account_id=:'account'::uuid AND j.creator_id=:'creator'::uuid
AND j.thread_id=:'thread'::uuid AND j.kind='delete' AND j.scope='thread';`,
    },
  ).trim();
  assert.equal(
    result,
    "1|1|8",
    "Exact account/thread must have one saved deletion, one tombstone and eight domain tasks",
  );
  console.log(
    "PASS real PostgreSQL: exact account/thread has one deletion job, one tombstone and eight domain tasks",
  );
}
// Follow-up 13: the conversation purge can wait, but the account's list leaves
// an accepted deletion out at once, and Home keeps the other conversation.
async function verifyHome(fixture, token) {
  const listed = await request("GET", "/v1/conversations/account", token);
  assert.equal(listed.status, 200);
  assert.ok(
    !listed.body.threads.some((thread) => thread.id === fixture.thread),
    "The account's list must leave the deleted conversation out",
  );
  assert.ok(
    listed.body.threads.some((thread) => thread.creatorId === devon),
    "The account's list must keep the conversation with Devon",
  );
  const home = await request("GET", "/v1/growth/home", token);
  assert.equal(
    home.status,
    200,
    `Home after the deletion: ${home.status} ${home.body.error?.code ?? ""}`,
  );
  const destinations = home.body.entries.map((entry) => entry.destination);
  assert.ok(!destinations.includes(fixture.route), "Home must leave it out");
  assert.ok(
    destinations.includes(`/threads/${devon}/${fixture.fan}`),
    "Home must list the conversation with Devon",
  );
  console.log(
    "PASS real API: the account's list leaves the deleted conversation out; Home answers 200 with the one with Devon",
  );
}
function draftCount() {
  const files = A.adb(
    "exec-out",
    "run-as",
    "com.pantopus.qelvora",
    "sh",
    "-c",
    "if [ -d no_backup ]; then if [ -d no_backup/conversation-drafts ]; then ls no_backup/conversation-drafts; fi; else echo LANE7_STORAGE_UNAVAILABLE; fi",
  )
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  assert.ok(
    files.every((file) => /^[0-9a-f]{64}\.enc$/u.test(file)),
    "Draft storage must be readable and contain only encrypted records",
  );
  return files.length;
}
async function reveal(label) {
  for (let i = 0; i < 8; i++) {
    if (A.texts().includes(label)) return;
    A.swipe(520, 1700, 520, 650);
    await sleep(200);
  }
  throw new Error(`Could not reach ${label}`);
}
async function fillField(label, value) {
  const keyboard = () =>
    /type=ime frame=[^\n]*visible=true/u.test(
      A.adb("shell", "dumpsys", "window"),
    );
  let focused = false;
  for (let i = 0; i < 8; i++) {
    const field = A.screen().find(
      (node) => node.desc === label && node.clickable,
    );
    if (!field || field.y > 1900) {
      A.swipe(520, 1700, 520, 650);
      await sleep(400);
      continue;
    }
    // Re-read bounds after keyboard/scroll transitions instead of tapping a
    // stale caption position. No input is sent until the live field focuses.
    A.tapAt(field.x, field.y);
    await sleep(700);
    if (keyboard()) {
      focused = true;
      break;
    }
  }
  assert.ok(focused, `${label} must focus the live keyboard`);
  // adb drops characters from one long burst under load (a 36-character id
  // arrived as 32): send short chunks and let each one land.
  for (const chunk of value.match(/.{1,6}/gsu)) {
    A.type(chunk);
    await sleep(250);
  }
  await A.waitFor(value);
  A.key("BACK");
  const until = Date.now() + 10000;
  while (keyboard()) {
    assert.ok(
      Date.now() < until,
      "The keyboard must dismiss before the next field",
    );
    await sleep(250);
  }
  await sleep(500);
}
async function android() {
  const { fixture, token, path } = await prepare("android");
  const apiPort = new URL(api).port;
  A.adb("reverse", `tcp:${apiPort}`, `tcp:${apiPort}`);
  const appPort = new URL(appApi).port;
  A.adb("reverse", `tcp:${appPort}`, `tcp:${appPort}`);
  const launch = (reset = false, to = reset ? fixture.route : null) => {
    A.adb("shell", "am", "force-stop", "com.pantopus.qelvora");
    A.adb(
      "shell",
      "am",
      "start",
      "-W",
      "-n",
      "com.pantopus.qelvora/.MainActivity",
      "--es",
      "api_url",
      appApi,
      ...(reset
        ? [
            "--ez",
            "harness_reset",
            "true",
            "--es",
            "harness_actor",
            "'actor one'",
          ]
        : []),
      ...(to ? ["--es", "return_to", to] : []),
    );
  };
  launch(true);
  // Maya is in this conversation (prepare), so since #497 the composer says
  // "Reply to Maya".
  await A.tap("Reply to Maya", 30000);
  A.type(fixture.marker);
  await A.waitFor(fixture.marker);
  assert.equal(draftCount(), 1);
  const before = await request("GET", path, token);
  assert.equal(
    before.body.messages.filter((message) => message.text === fixture.marker)
      .length,
    0,
  );
  launch();
  await A.waitFor(fixture.marker, 30000);
  // Send stays disabled until the relaunched thread is live again.
  const send = await A.waitEnabled("Send");
  A.tapAt(send.x, send.y);
  await verifyAccepted(fixture, token, path);
  for (let i = 0; i < 40 && draftCount() !== 0; i++) await sleep(250);
  assert.equal(draftCount(), 0);
  await A.tap("Reply to Maya");
  A.type("real deletion draft");
  await A.waitFor("real deletion draft");
  assert.equal(draftCount(), 1);
  A.openLink("qelvora://app/support/privacy");
  await A.waitFor("Your data", 30000);
  // Since #505 the scopes have names, and since #500 (WP 7.4 P5) the
  // conversation is chosen by its creator's name, never typed as ids.
  await reveal("Conversation");
  // Controls are disabled during each session check: retry until it takes.
  for (
    let i = 0;
    i < 5 && !A.texts().includes("Data scope: Conversation");
    i++
  ) {
    const chip = await A.waitEnabled("Conversation");
    A.tapAt(chip.x, chip.y);
    await sleep(700);
  }
  assert.ok(
    A.texts().includes("Data scope: Conversation"),
    "Choose the conversation scope",
  );
  for (let i = 0; i < 5 && A.texts().includes("Choose a conversation"); i++) {
    await reveal("Choose a conversation");
    const picker = A.screen().find((n) => n.text === "Choose a conversation");
    if (picker) A.tapAt(picker.x, picker.y);
    await sleep(800);
    const option = A.screen().find((n) => n.text === "Maya");
    if (option) A.tapAt(option.x, option.y);
    await sleep(800);
  }
  assert.ok(
    !A.texts().includes("Choose a conversation"),
    "Choose Maya's conversation by name",
  );
  await fillField("Local confirmation", "LOCAL DEVELOPMENT");
  await reveal("Request deletion");
  // Actions are disabled during each session check, by design: tap a control
  // only when it is enabled.
  const requestDeletion = async () => {
    const button = await A.waitEnabled("Request deletion");
    A.tapAt(button.x, button.y);
    await A.waitFor("Delete this data scope?");
  };
  await requestDeletion();
  await sleep(6000); // Cross the ordinary session-readiness heartbeat.
  await A.waitFor("Delete this data scope?");
  const keep = await A.waitEnabled("Keep data");
  A.tapAt(keep.x, keep.y);
  assert.equal(draftCount(), 1);
  assert.equal((await request("GET", path, token)).status, 200);
  await requestDeletion();
  await sleep(6000);
  await A.waitFor("Delete this data scope?");
  // Actions are disabled for the moment of each session check, by design.
  const confirm = await A.waitEnabled("Request deletion");
  A.tapAt(confirm.x, confirm.y);
  await verifyDeleted(fixture, token, path);
  persistedDeletion(fixture, 1);
  // A held answer (D6R) reaches the app up to 9 s after the API accepted it.
  for (let i = 0; i < 80 && draftCount() !== 0; i++) await sleep(250);
  assert.equal(
    draftCount(),
    0,
    "Accepted deletion must remove local ciphertext",
  );
  A.key("BACK");
  await A.waitFor("Conversation unavailable", 30000);
  assert.ok(!A.texts().includes("real deletion draft"));
  assert.equal(draftCount(), 0);
  launch();
  await A.waitFor("Conversation unavailable", 30000);
  assert.equal(draftCount(), 0);
  assert.ok(!A.texts().includes("real deletion draft"));
  screenshot("android", "D6-real-deletion-restored");
  console.log(
    "PASS real Android D6: restart/send accepted once; thread deletion clears ciphertext, Back and restart cannot restore it",
  );
  await verifyHome(fixture, token);
  launch(false, "/home");
  // Devon's row exists only once Home has loaded its entries.
  await A.waitFor("Devon", 30000);
  const home = A.texts();
  assert.ok(home.includes("Your people"), "Home must be open");
  assert.ok(!home.includes("Unavailable"), "Home must not refuse");
  assert.ok(
    !home.some((text) => text.startsWith("Maya")),
    "Home must not show the deleted conversation",
  );
  screenshot("android", "D6-home-after-deletion");
  console.log(
    "PASS real Android: after the deletion Home opens with the conversation with Devon and without Maya's",
  );
}
// The API half of D6 and the Home step, with no device: the deletion request
// the apps' privacy screen sends. Fan one, as Android, so use another stack.
async function apiOnly() {
  const { fixture, token, path } = await prepare("api");
  const job = await request("POST", "/v1/trust/privacy/jobs", token, {
    kind: "delete",
    scope: "thread",
    creatorId: fixture.creator,
    threadId: fixture.thread,
    proof: "LOCAL DEVELOPMENT",
    idempotencyKey: randomUUID(),
  });
  assert.equal(job.status, 202);
  await verifyDeleted(fixture, token, path);
  persistedDeletion(fixture, 1);
  await verifyHome(fixture, token);
  // Home's own guard: a conversation the list still holds but Trust closes
  // (here a block, which is not a deletion) is left off Home, not refused.
  const blocked = await request("POST", "/v1/trust/blocks", token, {
    creatorId: devon,
    reason: "Lane 7 Home check: block this creator.",
    idempotencyKey: randomUUID(),
  });
  assert.equal(blocked.status, 200);
  const listed = await request("GET", "/v1/conversations/account", token);
  assert.ok(
    listed.body.threads.some((thread) => thread.creatorId === devon),
    "A block is not a deletion: the account's list keeps it",
  );
  const closed = await request(
    "GET",
    `/v1/conversations/${devon}/${fixture.fan}`,
    token,
  );
  assert.equal(closed.status, 403);
  assert.equal(closed.body.error.code, "scope_revoked");
  const home = await request("GET", "/v1/growth/home", token);
  assert.equal(
    home.status,
    200,
    `Home with a closed conversation: ${home.status}`,
  );
  assert.ok(!home.body.entries.some((entry) => entry.creatorId === devon));
  console.log(
    "PASS real API: Home leaves out a listed conversation that answers scope_revoked (a block) instead of refusing the page",
  );
}
const [mode, file] = process.argv.slice(2);
if (mode === "android") await android();
else if (mode === "api") await apiOnly();
else if (mode === "prepare-ios") {
  assert.ok(file, "Choose an off-repository fixture file");
  const { fixture } = await prepare("ios");
  writeFileSync(file, JSON.stringify(fixture));
} else if (mode === "verify-ios") {
  const fixture = JSON.parse(readFileSync(file, "utf8"));
  const owner = await signIn(2);
  await verifyDeleted(
    fixture,
    owner.token,
    `/v1/conversations/${fixture.creator}/${fixture.fan}`,
  );
  persistedDeletion(fixture, 2);
  await verifyHome(fixture, owner.token);
  // A launch to /home restores the saved place, here the deleted thread, so
  // the same fan signs in afresh on LANE7_IOS and lands on Home. The screen
  // is read from a screenshot (lib.mjs).
  launchApp("ios", "--reset", "--actor", fixture.actor, "--to", "/home");
  const home = await waitForText("ios", /Devon/u, 45000);
  assert.ok(home.ok, `Home must list Devon: ${home.text.slice(0, 300)}`);
  assert.match(home.text, /Your people/u, "Home must be open");
  assert.doesNotMatch(home.text, /Unavailable/u, "Home must not refuse");
  assert.doesNotMatch(
    home.text,
    /\bMaya\b/u,
    "Home must not show the deleted conversation",
  );
  screenshot("ios", "D6-home-after-deletion");
  console.log(
    "PASS real iOS: after the deletion Home opens with the conversation with Devon and without Maya's",
  );
} else
  throw new Error(
    "Choose android, api, prepare-ios or verify-ios <fixture.json>",
  );
