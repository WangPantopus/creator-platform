// Real app + disposable lane 7 API/PostgreSQL. Development identities are
// synthetic; no access token is printed, put in a fixture or written to disk.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import * as A from "./android-ui.mjs";
import { sleep, screenshot } from "./lib.mjs";

const api = "http://127.0.0.1:56471";
const creator = "20000000-0000-4000-8000-000000000001";
async function request(method, path, token, body) {
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
  const author = await signIn(3);
  const takeover = await request("POST", path + "/takeover", author.token, {
    idempotencyKey: randomUUID(),
  });
  assert.equal(
    takeover.status,
    200,
    "Maya's real authority must allow takeover",
  );
  const page = await request("GET", path, owner.token);
  assert.equal(page.status, 200);
  assert.equal(page.body.control, "human_active");
  const fixture = {
    api,
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
function draftCount() {
  try {
    return A.adb(
      "exec-out",
      "run-as",
      "com.pantopus.qelvora",
      "ls",
      "no_backup/conversation-drafts",
    )
      .trim()
      .split(/\s+/u)
      .filter(Boolean).length;
  } catch {
    return 0;
  }
}
async function reveal(label) {
  for (let i = 0; i < 8; i++) {
    if (A.texts().includes(label)) return;
    A.swipe(520, 1700, 520, 650);
    await sleep(200);
  }
  throw new Error(`Could not reach ${label}`);
}
async function android() {
  const { fixture, token, path } = await prepare("android");
  A.adb("reverse", "tcp:56471", "tcp:56471");
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
      api,
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
  await A.tap("Message Maya", 30000);
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
  await A.tap("Send");
  await verifyAccepted(fixture, token, path);
  for (let i = 0; i < 40 && draftCount() !== 0; i++) await sleep(250);
  assert.equal(draftCount(), 0);
  await A.tap("Message Maya");
  A.type("real deletion draft");
  await A.waitFor("real deletion draft");
  assert.equal(draftCount(), 1);
  A.openLink("qelvora://app/support/privacy");
  await A.waitFor("Your data", 30000);
  await reveal("thread");
  await A.tap("thread");
  for (const [label, value] of [
    ["Creator ID", fixture.creator],
    ["Conversation ID", fixture.thread],
    ["Local confirmation", "LOCAL DEVELOPMENT"],
  ]) {
    await reveal(label);
    await A.tap(label);
    A.type(value);
    A.key("BACK");
  }
  await reveal("Request deletion");
  await A.tap("Request deletion");
  await A.waitFor("Delete this data scope?");
  await A.tap("Request deletion");
  await verifyDeleted(fixture, token, path);
  for (let i = 0; i < 40 && draftCount() !== 0; i++) await sleep(250);
  assert.equal(
    draftCount(),
    0,
    "Accepted deletion must remove local ciphertext",
  );
  A.key("BACK");
  await sleep(1500);
  assert.equal(draftCount(), 0);
  launch();
  await sleep(2000);
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
} else throw new Error("Choose android or prepare-ios <fixture.json>");
