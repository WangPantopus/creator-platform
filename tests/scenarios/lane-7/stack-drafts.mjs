// Real app + disposable lane 7 API/PostgreSQL. Development identities are
// synthetic; no access token is printed, put in a fixture or written to disk.
// LANE7_STACK_API names another stack's API (its first port + 1), and
// LANE7_STACK_POSTGRES its database container. Android D6 needs the app behind
// delay-proxy.mjs (LANE7_APP_API) until follow-up 12 in
// docs/engineering/native-device-checks.md (idle keep-alive sockets) is fixed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import * as A from "./android-ui.mjs";
import { sleep, screenshot } from "./lib.mjs";

const api = process.env.LANE7_STACK_API ?? "http://127.0.0.1:56471";
// D6R: the app may reach the API through delay-proxy.mjs; checks stay direct.
const appApi = process.env.LANE7_APP_API ?? api;
// Links opened through android-ui.mjs carry this origin, not a fake API's.
process.env.LANE7_API_URL = appApi;
const creator = "20000000-0000-4000-8000-000000000001";
async function request(method, path, token, body) {
  // A kept-alive socket the server closed while the app was being driven fails
  // the next fetch ("other side closed"); a read is safe to send again once.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(api + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
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
async function prepare(platform) {
  const number = platform === "android" ? 1 : 2;
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
  const launch = (reset = false) => {
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
            "--es",
            "return_to",
            fixture.route,
          ]
        : []),
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
}
const [mode, file] = process.argv.slice(2);
if (mode === "android") await android();
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
} else
  throw new Error("Choose android, prepare-ios or verify-ios <fixture.json>");
