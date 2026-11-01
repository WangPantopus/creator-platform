// WP 7.4 P8 on Android: the 3-hour reminder, against the lane 7 fake API.
// The debug launch shortens the two durations: the reminder after 20 s of
// counted time, a break from 6 s. iOS runs the same flows as XCUITest
// (Lane7LongSessionFlows, through ios-navigation.mjs --long-session).
//   node tests/scenarios/lane-7/e7-4-long-session.mjs [T1 T2 T3 T4 T5]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const thread = (n) =>
  `/threads/c1000000-0000-4000-8000-00000000000${n}/f1000000-0000-4000-8000-000000000001`;
const line = (name) =>
  `You've been talking with ${name}'s AI for a while. It's an AI, and it will be here when you're back.`;
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

const count = (name) => A.screen().filter((n) => n.text === line(name)).length;
async function until(seconds, condition) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (condition()) return true;
    await L.sleep(500);
  }
  return condition();
}
async function open(n) {
  await L.harness("POST", "/__harness/reset");
  L.launch(
    "android",
    "--reset",
    "--actor",
    "devon",
    "--to",
    thread(n),
    "--long-session",
    "20,6",
  );
  await A.waitFor("Me and privacy", 30000);
}
async function background(seconds) {
  A.home();
  await L.sleep(seconds * 1000);
  A.resume();
  await A.waitFor("Me and privacy", 30000);
}

if (run("T1")) {
  await open(1);
  const first = await until(45, () => count("Maya") >= 1);
  const once = count("Maya") === 1;
  L.screenshot("android", "T1-first");
  await A.tap("Message Maya's AI");
  A.type("Still here");
  const send = await A.waitEnabled("Send", 5000).catch(() => null);
  A.key("BACK");
  const second = await until(45, () => count("Maya") >= 2);
  L.screenshot("android", "T1-second");
  L.step(
    "android",
    "P8.1 the line once at 20 s, it blocks nothing, again at 40 s",
    first && once && Boolean(send) && second && count("Maya") === 2,
  );
}

if (run("T2")) {
  await open(1);
  await L.sleep(12000);
  const none = count("Maya") === 0;
  A.openLink(`qelvora://app${thread(4)}`);
  await A.waitFor("Tomás Reyes", 30000);
  const shown = await until(18, () => count("Tomás Reyes") >= 1);
  L.screenshot("android", "T2-tomas");
  L.step(
    "android",
    "P8.2 across creators the count continues; the line names Tomás Reyes",
    none && shown,
  );
}

if (run("T3")) {
  await open(1);
  await L.sleep(14000);
  await background(9);
  const early = await until(12, () => count("Maya") >= 1);
  const later = await until(30, () => count("Maya") >= 1);
  L.screenshot("android", "T3-after-reset");
  L.step(
    "android",
    "P8.3 a long break starts the count again",
    !early && later,
  );
}

if (run("T4")) {
  await open(1);
  await L.sleep(14000);
  await background(2);
  const shown = await until(14, () => count("Maya") >= 1);
  L.screenshot("android", "T4-kept");
  L.step("android", "P8.4 a short break keeps the count", shown);
}

if (run("T5")) {
  await open(2);
  const human = await until(28, () => count("Kiln Club") >= 1);
  await open(3);
  const paused = await until(28, () => count("Glazeco") >= 1);
  L.screenshot("android", "T5-paused");
  L.step(
    "android",
    "P8.5 the creator here, or the AI paused: no count, no line",
    !human && !paused,
  );
}

stop();
L.finish();
