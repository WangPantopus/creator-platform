// WP 7.4 P11 on Android: no comparison placeholder, in Devon's thread with
// Tomás Reyes, against the lane 7 fake API. iOS runs the same flows as
// XCUITest (Lane7ComparisonFlows, through ios-navigation.mjs --comparison).
//   node tests/scenarios/lane-7/e7-4-comparison.mjs [K1 K2 K3 K4]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const THREAD =
  "/threads/c1000000-0000-4000-8000-000000000004/f1000000-0000-4000-8000-000000000001";
const ALLOW = "Allow questions for AI comparisons";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

const visible = (label, nodes = A.screen()) =>
  nodes.some((n) => n.text.includes(label) || n.desc.includes(label));
const placeholder = (nodes = A.screen()) =>
  nodes.some((n) => /not available yet/iu.test(n.text + n.desc));
/** Waits until a label has left the screen. */
async function gone(label, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  while (visible(label) && Date.now() < until) await L.sleep(400);
  return !visible(label);
}
/** Scrolls down with short drags until a label is on screen. */
async function reveal(label) {
  for (let i = 0; i < 12 && !visible(label); i += 1) {
    A.swipe(540, 1500, 540, 1000, 600);
    await L.sleep(500);
  }
  return visible(label);
}
/** Devon's thread with Tomás Reyes, after the app has asked for the capabilities. */
async function open(comparisons) {
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/flags", {
    comparisonsAvailable: comparisons,
  });
  const since = (await L.log()).at(-1)?.n ?? 0;
  L.launch("android", "--reset", "--actor", "devon", "--to", THREAD);
  await A.waitFor("Me and privacy", 30000);
  await L.waitForLog(
    since,
    { method: "GET", path: /\/v1\/conversations\/capabilities$/u },
    15000,
    "android",
  );
  await L.sleep(800);
}
async function privacy() {
  await A.tap("Me and privacy");
  await A.waitFor("Me and privacy", 15000);
  return reveal("Time with this creator's AI");
}
const refused = async (since) =>
  L.seen(
    await L.waitForLog(
      since,
      { method: "POST", path: /\/comparison-consent$/u, status: 403 },
      15000,
      "android",
    ),
    { method: "POST", path: /\/comparison-consent$/u, status: 403 },
  ).length === 1;

if (run("K1")) {
  await open(false);
  const thread = A.screen();
  L.step(
    "android",
    "P11.1 off: no options button on the question",
    !visible("AI comparison options", thread),
  );
  const shown = await privacy();
  const nodes = A.screen();
  L.step(
    "android",
    "P11.1 off: Me and privacy has no section and no placeholder",
    shown &&
      visible("AI providers", nodes) &&
      !visible("AI comparisons", nodes) &&
      !placeholder(nodes),
  );
  L.screenshot("android", "K1-privacy-off");
}

if (run("K2")) {
  await open(true);
  await A.tap("AI comparison options", 20000);
  await A.waitFor(ALLOW, 20000);
  L.step(
    "android",
    "P11.2 on: the choice opens from the question",
    visible("Off · optional"),
  );
  L.screenshot("android", "K2-choice-open");
  await L.harness("POST", "/__harness/flags", { comparisonsAvailable: false });
  const since = (await L.log()).at(-1)?.n ?? 0;
  await A.tap(ALLOW);
  const refusal = await refused(since);
  const closed = await gone("Your question");
  const nodes = A.screen();
  L.step(
    "android",
    "P11.2 turned off while open: refused once, the choice closes, nothing said",
    refusal &&
      closed &&
      !placeholder(nodes) &&
      !visible("AI comparison options", nodes) &&
      visible("Me and privacy", nodes),
  );
  L.screenshot("android", "K2-closed");
}

if (run("K3")) {
  await open(true);
  await privacy();
  const on = await reveal(ALLOW);
  L.step(
    "android",
    "P11.3 on: Me and privacy shows the choice",
    on && visible("AI comparisons"),
  );
  L.screenshot("android", "K3-section-on");
  await L.harness("POST", "/__harness/flags", { comparisonsAvailable: false });
  const since = (await L.log()).at(-1)?.n ?? 0;
  await A.tap(ALLOW);
  const refusal = await refused(since);
  const left = await gone("AI comparisons");
  const nodes = A.screen();
  L.step(
    "android",
    "P11.3 turned off: refused once, the section leaves, nothing said",
    refusal &&
      left &&
      !visible(ALLOW, nodes) &&
      !placeholder(nodes) &&
      visible("AI providers", nodes),
  );
  L.screenshot("android", "K3-section-off");
}

if (run("K4")) {
  await open(true);
  await privacy();
  await reveal(ALLOW);
  await L.harness("POST", "/__harness/flags", { comparisonsAvailable: false });
  A.home();
  await L.sleep(2000);
  A.resume();
  await A.waitFor("Me and privacy", 30000);
  await reveal("Time with this creator's AI");
  const left = await gone("AI comparisons", 30000);
  const nodes = A.screen();
  L.step(
    "android",
    "P11.4 turned off in the background: the section is gone, nothing said",
    left && visible("AI providers", nodes) && !placeholder(nodes),
  );
  L.screenshot("android", "K4-after-background");
}

stop();
L.finish();
