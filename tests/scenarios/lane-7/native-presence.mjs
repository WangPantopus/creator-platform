import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import * as ui from "./android-ui.mjs";
// Operated Android C4 checks. Use an explicitly owned emulator and API.
// Real mode only reads the supplied signed Note/member/outsider fixture.
// Default mode owns/reset the disposable lane-7 UI harness; fixture reactions
// do not qualify Trust review, creator signing, or held migration activation.
assert(
  process.env.LANE7_ANDROID,
  "Select an owned emulator with LANE7_ANDROID",
);
const real = process.argv[2] === "real";
const api = process.env.QELVORA_PRESENCE_API;
assert(
  api && /^http:\/\/127\.0\.0\.1:\d+$/.test(api),
  "Set an owned loopback QELVORA_PRESENCE_API",
);
const required = (key) => {
  const value = process.env[key];
  assert(value, `Set ${key}`);
  return value;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const quote = (s) => `'${s.replaceAll("'", `'\\''`)}'`;
function launch(actor, route) {
  ui.adb("shell", "am", "force-stop", "com.pantopus.qelvora");
  ui.adb(
    "shell",
    "am",
    "start",
    "-W",
    "-n",
    "com.pantopus.qelvora/.MainActivity",
    "--es",
    "api_url",
    api,
    "--ez",
    "harness_reset",
    "true",
    "--es",
    "harness_actor",
    quote(actor),
    "--es",
    "return_to",
    quote(route),
  );
}
const has = (text) => ui.texts().some((v) => v.includes(text));
const hasReaction = (label) =>
  ui.screen().some((node) => node.desc === label && node.h > 0);
function capture(name) {
  ui.adb("shell", "screencap", "-p", `/data/local/tmp/${name}.png`);
  ui.adb("pull", `/data/local/tmp/${name}.png`, `/tmp/${name}.png`);
  writeFileSync(`/tmp/${name}.json`, JSON.stringify(ui.screen(), null, 2));
}
async function control(path, body = {}) {
  const r = await fetch(api + "/__harness/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200);
  return r.json();
}
if (real) {
  const text = required("QELVORA_PRESENCE_NOTE_TEXT");
  const creator = required("QELVORA_PRESENCE_CREATOR");
  launch(
    required("QELVORA_PRESENCE_MEMBER_ACTOR"),
    `/threads/${creator}/${required("QELVORA_PRESENCE_MEMBER_FAN")}`,
  );
  const note = await ui.waitFor(text, 30000);
  assert(note.desc.startsWith("Maya"));
  assert(note.desc.includes(text));
  console.log("PASS: author-first complete accessibility body", note.desc);
  for (let i = 0; i < 3; i++) {
    await sleep(2500);
    assert(has(text));
  }
  console.log("PASS: member Note survives healthy refresh >7.5s");
  capture("native-c4-android-real-member");
  await ui.tap("Signed by Maya. Open the verification page");
  await ui.waitFor("Signature verification", 15000);
  assert(!has("Your private replies"));
  console.log("PASS: signature opens distinct public verification");
  ui.key("BACK");
  await ui.waitFor(text, 15000);
  await ui.tap(text);
  await ui.waitFor("Your private replies", 15000);
  console.log("PASS: Note opens Content/private replies");
  launch(
    required("QELVORA_PRESENCE_OUTSIDER_ACTOR"),
    `/threads/${creator}/${required("QELVORA_PRESENCE_OUTSIDER_FAN")}`,
  );
  await ui.waitFor("Me and privacy", 30000);
  await sleep(3500);
  assert(!has(text));
  capture("native-c4-android-real-outsider");
  console.log("PASS: outsider receives no members Note");
} else {
  await control("reset");
  const seeded = await control("threads/maya/presence", { mode: "live" });
  const text = "Native C4 fixture: a signed Note.";
  const reaction = seeded.items[1].authorLabel;
  const route =
    "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
  launch("Devon", route);
  const note = await ui.waitFor(text, 30000);
  await ui.waitFor(reaction, 10000);
  assert(note.desc.startsWith("Maya"));
  assert(note.desc.includes("The kiln opens at nine 🔥"));
  for (let i = 0; i < 3; i++) {
    await sleep(2500);
    assert(has(text));
    assert(hasReaction(reaction));
  }
  capture("native-c4-android-fixture");
  console.log(
    "PASS: fixture Note and own reaction, accessibility, healthy refresh",
  );
  await control("faults", {
    rules: [{ match: "/v1/content/.*/presence", status: 503, remaining: -1 }],
  });
  await ui.waitFor("Content could not be refreshed", 10000);
  assert(!has(text));
  assert(!hasReaction(reaction));
  await control("faults", { rules: [] });
  await ui.waitFor(text, 10000);
  await ui.waitFor(reaction, 10000);
  console.log("PASS: failure concealment and recovery");
  await control("threads/maya/presence", { mode: "empty_first" });
  await sleep(3000);
  assert(!has(text));
  for (let i = 0; i < 8 && !has("EARLIER"); i++) ui.swipe(540, 600, 540, 1800);
  await ui.tap("EARLIER");
  for (let i = 0; i < 8 && !has(text); i++) ui.swipe(540, 1800, 540, 600);
  await ui.waitFor(text, 10000);
  await ui.waitFor(reaction, 10000);
  console.log(
    "PASS: empty first candidate page follows its independent cursor",
  );
  await control("threads/maya/presence", { mode: "removed" });
  await sleep(3000);
  assert(!has(text));
  assert(!hasReaction(reaction));
  console.log("PASS: withdrawal and reaction retraction removed on refresh");
  await control("threads/maya/presence", { mode: "live" });
  await ui.waitFor(text, 10000);
  ui.home();
  await control("faults", {
    rules: [{ match: "/v1/content/.*/presence", delayMs: 6000, remaining: -1 }],
  });
  ui.resume();
  await sleep(1000);
  assert(!has(text));
  await sleep(6000);
  assert(!has(text));
  await control("faults", { rules: [] });
  await ui.waitFor(text, 18000);
  console.log("PASS: foreground authority reset and slow-response expiry");
  await control("sessions", { account: "devon", action: "revoke" });
  await sleep(5000);
  assert(!has(text));
  assert(!hasReaction(reaction));
  launch("Priya", route);
  await ui.waitFor("Conversation unavailable", 30000);
  assert(!has(text));
  assert(!hasReaction(reaction));
  console.log("PASS: session revocation/account switch conceals all C4 bodies");
  await control("threads/maya/presence", { mode: "deep" });
  launch("Devon", route);
  await ui.waitFor("Me and privacy", 30000);
  for (let page = 1; page <= 7; page++) {
    for (let step = 0; step < 8 && !has("EARLIER"); step++)
      ui.swipe(540, 600, 540, 1800);
    await ui.tap("EARLIER");
    await sleep(600);
  }
  for (let step = 0; step < 8 && !has(text); step++)
    ui.swipe(540, 1800, 540, 600);
  await ui.waitFor(text, 10000);
  assert(hasReaction(reaction));
  console.log(
    "PASS: seven older cursors advance beyond the five-page retained window",
  );
}
