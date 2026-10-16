// WP 7.4 P1 (C4): Notes and reactions in Maya's thread on Android, against
// the lane 7 fake API. iOS runs the same flows as XCUITest (Lane7PresenceFlows,
// through ios-navigation.mjs --presence). Each step looks at the screen (the
// accessibility tree) and behind it (the fake's request log and state).
//   node tests/scenarios/lane-7/e7-4-presence.mjs [R1 R4 R5 R8 R9]
// Needs the debug APK built for http://127.0.0.1:56473 and installed.
import { execFileSync } from "node:child_process";
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const THREAD =
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
const NOTE = "Maya · to all members";
const REACTION = "Maya reacted to your reply";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

const presence = async () =>
  (await L.log(0, "android")).filter(
    (e) =>
      e.method === "GET" && /^\/v1\/content\/[^/]+\/presence$/u.test(e.path),
  );
async function reads(count, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  let rows = await presence();
  while (rows.length < count && Date.now() < until) {
    await L.sleep(400);
    rows = await presence();
  }
  await L.sleep(1500);
  return presence();
}
/** Scroll the lazy thread until a label is on screen: first the preferred
 * direction, then the other, so an earlier search cannot strand it. */
async function find(label, up = true) {
  const seen = () =>
    A.screen().find((n) => n.text.includes(label) || n.desc.includes(label));
  for (const direction of [up, !up])
    for (let i = 0; i < 16; i += 1) {
      const node = seen();
      if (node) return node;
      if (direction) A.swipe(540, 700, 540, 1500);
      else A.swipe(540, 1500, 540, 700);
      await L.sleep(500);
    }
  return seen() ?? null;
}
const visible = (label) =>
  A.screen().some((n) => n.text.includes(label) || n.desc.includes(label));
async function fresh(appearance = "light") {
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/log/clear");
  L.launch(
    "android",
    "--reset",
    "--actor",
    "devon",
    "--to",
    THREAD,
    "--appearance",
    appearance,
  );
  await A.waitFor("Send", 30000);
  await L.sleep(1500);
}
async function cycle() {
  A.home();
  await L.sleep(2500);
  A.resume();
  await A.waitFor("Send", 30000);
  await L.sleep(2500);
}

if (run("R1")) {
  await fresh();
  const rows = await reads(3);
  L.step(
    "android",
    "R1.2 pages",
    rows.length === 3,
    `presence reads ${rows.length}`,
  );
  L.step(
    "android",
    "R1.2 cursors",
    rows.length === 3 &&
      rows[0].before === null &&
      rows[1].before === rows[0].nextBefore &&
      rows[2].before === rows[1].nextBefore,
    JSON.stringify(rows.map((r) => [r.before?.slice(0, 27) ?? null, r.items])),
  );
  L.step(
    "android",
    "R1.2 empty page followed",
    rows.map((r) => r.items).join(",") === "2,0,2",
  );
  const reply = await find("send me a photo of the tile", false);
  const reaction = await find(REACTION);
  const note = await find(NOTE);
  const draft = await find("I bisque to cone 04");
  const nodes = A.screen();
  const y = (label) =>
    nodes.find((n) => n.text.includes(label) || n.desc.includes(label))?.y ??
    -1;
  L.step(
    "android",
    "R1.1 order",
    reply &&
      reaction &&
      note &&
      draft &&
      y("I bisque to cone 04") < y(NOTE) &&
      y(NOTE) < y("The Friday glaze clinic") &&
      y("The Friday glaze clinic") < y(REACTION),
    `draft ${y("I bisque to cone 04")} < label ${y(NOTE)} < body ${y("The Friday glaze clinic")} < reaction ${y(REACTION)}`,
  );
  L.step(
    "android",
    "R1.1 tier Note hidden",
    !(await find("Gold members", true)),
  );
  const old = await find("Thank you for the glaze questions this month.");
  const older = await find("Studio hours change next month.");
  L.screenshot("android", "R1-older-notes");
  const first = await find("I keep getting pinholes", false);
  L.step(
    "android",
    "R1.1 older Notes above the first message",
    Boolean(old && older && first),
  );
  // R1.3: the label is its own accessibility node, immediately before the body.
  await find("The Friday glaze clinic", false);
  let order = [];
  let body = -1;
  for (let i = 0; i < 6; i += 1) {
    order = A.screen()
      .map((n) => n.desc || n.text)
      .filter(Boolean);
    body = order.findIndex((v) => v.startsWith("The Friday glaze clinic"));
    if (body > 0 && order[body - 1] === NOTE) break;
    A.swipe(540, 900, 540, 1150); // a small drag down shows what is above
    await L.sleep(500);
  }
  L.step(
    "android",
    "R1.3 label read before body",
    body > 0 && order[body - 1] === NOTE,
    `before the body: ${order[body - 1] ?? "nothing"}`,
  );
  L.screenshot("android", "R1-note-and-reaction");
}

if (run("R4")) {
  await fresh();
  await reads(3);
  await L.harness("POST", "/__harness/threads/maya/note", {
    text: "Kiln opening moved to Sunday.",
  });
  await L.harness("POST", "/__harness/threads/maya/ask", {
    text: "A frame from my other device",
  });
  await L.sleep(6000);
  const quiet = await presence();
  L.step(
    "android",
    "R1.4 no read on a message frame",
    quiet.length === 3,
    `reads ${quiet.length}`,
  );
  L.step(
    "android",
    "R1.4 not shown before a read",
    !visible("Kiln opening moved to Sunday."),
  );
  await cycle();
  const after = await reads(6);
  L.step(
    "android",
    "R1.4 foreground reads again",
    after.length === 6,
    `reads ${after.length}`,
  );
  L.step(
    "android",
    "R1.4 new Note shown",
    Boolean(await find("Kiln opening moved to Sunday.", false)),
  );
  await L.harness("POST", "/__harness/threads/maya/reaction", {
    reaction: "thanks",
  });
  await L.harness("POST", "/__harness/sockets/close", {});
  const again = await reads(9, 30000);
  L.step(
    "android",
    "R1.4 lost connection reads again",
    again.length === 9,
    `reads ${again.length}`,
  );
  L.screenshot("android", "R4-new-note-and-reaction");
}

if (run("R5")) {
  // A read here follows a lost live connection: going to the background hides
  // the whole thread (presence included) by design, so it cannot test "keep".
  // A dropped connection only checks that Notes stay: iOS's URLSession retries
  // a dropped GET by itself (this client never retries).
  await fresh();
  let seen = (await reads(3)).length;
  L.step("android", "R1.6 Notes shown first", Boolean(await find(NOTE)));
  async function reconnect(rule, settleMs = 1500) {
    if (rule)
      await L.harness("POST", "/__harness/faults", {
        rules: [
          { match: "^/v1/content/", method: "GET", remaining: 1, ...rule },
        ],
      });
    await L.harness("POST", "/__harness/sockets/close", {});
    const until = Date.now() + 30000;
    while ((await presence()).length === seen && Date.now() < until)
      await L.sleep(250);
    await L.sleep(settleMs);
    const now = (await presence()).length;
    const added = now - seen;
    seen = now;
    return added;
  }
  const failed = await reconnect({ status: 500 });
  L.step(
    "android",
    "R1.6 500 ends the read",
    failed === 1,
    `requests ${failed}`,
  );
  L.step("android", "R1.6 500 keeps the list", Boolean(await find(NOTE)));
  const slow = await reconnect({ delayMs: 20000 }, 18000);
  L.step("android", "R1.6 timeout not retried", slow === 1, `requests ${slow}`);
  L.step("android", "R1.6 timeout keeps the list", Boolean(await find(NOTE)));
  const dropped = await reconnect({ drop: true, remaining: 3 });
  L.step(
    "android",
    "R1.6 dropped request read",
    dropped >= 1,
    `requests ${dropped}`,
  );
  L.step(
    "android",
    "R1.6 dropped request leaves Notes",
    Boolean(await find(NOTE)),
  );
  L.screenshot("android", "R6-kept-after-500-timeout-and-drop");
  await L.harness("POST", "/__harness/faults", { rules: [] });
  const refused = await reconnect({
    status: 403,
    code: "scope_revoked",
    message: "This scope is closed.",
  });
  L.step(
    "android",
    "R1.6 403 ends the read",
    refused === 1,
    `requests ${refused}`,
  );
  L.step(
    "android",
    "R1.6 403 clears the list",
    !(await find(NOTE)) && !(await find(REACTION, false)),
  );
  L.step(
    "android",
    "R1.6 thread untouched",
    Boolean(await find("send me a photo of the tile", false)) &&
      visible("Send"),
  );
  L.screenshot("android", "R6-cleared-after-403");
  await L.harness("POST", "/__harness/threads/maya/presence", {
    visible: false,
  });
  const good = await reconnect(null);
  L.step(
    "android",
    "R1.5 a good read follows every page",
    good === 3,
    `requests ${good}`,
  );
  L.step("android", "R1.5 ineligible Note gone", !(await find(NOTE)));
  L.step(
    "android",
    "R1.5 reaction still shown",
    Boolean(await find(REACTION, false)),
  );
  L.screenshot("android", "R5-note-no-longer-eligible");
}

if (run("R9")) {
  // Nothing from presence is written to the app's storage (memory only).
  await fresh();
  await reads(3);
  await find(NOTE);
  const files = A.adb(
    "shell",
    "run-as",
    "com.pantopus.qelvora",
    "find",
    ".",
    "-type",
    "f",
  )
    .split("\n")
    .filter(Boolean);
  let hits = 0;
  for (const file of files) {
    const bytes = execFileSync(
      "adb",
      [
        "-s",
        process.env.LANE7_ANDROID ?? "emulator-5574",
        "exec-out",
        "run-as",
        "com.pantopus.qelvora",
        "cat",
        file,
      ],
      { maxBuffer: 64 << 20 },
    );
    if (
      bytes.includes(Buffer.from("Friday glaze clinic")) ||
      bytes.includes(Buffer.from("Maya · to all members"))
    )
      hits += 1;
  }
  L.step(
    "android",
    "R1.9 no presence on disk",
    hits === 0,
    `${files.length} files scanned, ${hits} with Note text`,
  );
}

if (run("R8")) {
  const long =
    "Glaze notes for the long weekend, with every kiln detail. ".repeat(12);
  for (const appearance of ["light", "night"]) {
    await fresh(appearance);
    await L.harness("POST", "/__harness/threads/maya/note", {
      text: `🔥 שלום עולם · ${long}مرحبا`,
    });
    A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
    await cycle();
    L.step(
      "android",
      `R1.8 long Unicode Note ${appearance}`,
      Boolean(await find("🔥", false)),
    );
    L.screenshot("android", `R8-long-unicode-largest-${appearance}`);
    L.step(
      "android",
      `R1.8 label at largest ${appearance}`,
      Boolean(await find(NOTE)),
    );
    L.screenshot("android", `R8-label-largest-${appearance}`);
    A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
  }
}

stop();
L.finish();
