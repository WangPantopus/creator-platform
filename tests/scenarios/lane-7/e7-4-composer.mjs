// WP 7.4 P3 on Android: the composer states, following the design
// reference's `Composer`, against the lane 7 fake API. iOS runs the same flows
// as XCUITest (Lane7ComposerFlows, through ios-navigation.mjs --composer).
//   node tests/scenarios/lane-7/e7-4-composer.mjs [Q1 Q2 Q3 Q4 Q5]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const thread = (n) =>
  `/threads/c1000000-0000-4000-8000-00000000000${n}/f1000000-0000-4000-8000-000000000001`;
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

const has = (label, nodes = A.screen()) =>
  nodes.some((n) => n.text.includes(label) || n.desc.includes(label));
const count = (label, nodes = A.screen()) =>
  nodes.filter((n) => n.text === label || n.desc === label).length;
/** The composer's field: "Message {name}'s AI" or "Reply to {name}". */
const inputs = (nodes = A.screen()) =>
  nodes.filter((n) => /^(Message .+'s AI|Reply to .+)$/u.test(n.desc)).length;
async function until(condition, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (!condition() && Date.now() < end) await L.sleep(400);
  return condition();
}
async function open(n, appearance = "light") {
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/log/clear");
  L.launch(
    "android",
    "--reset",
    "--actor",
    "devon",
    "--to",
    thread(n),
    "--appearance",
    appearance,
  );
  await A.waitFor("Me and privacy", 30000);
  await L.sleep(1500);
}
const posts = async (path) =>
  L.seen(await L.log(0, "android"), { method: "POST", path, status: 200 })
    .length;

if (run("Q1")) {
  await open(1);
  const nodes = A.screen();
  L.step(
    "android",
    "P3.1 AI on: Message Maya's AI, one step-in, no notice",
    count("Message Maya's AI", nodes) >= 1 &&
      count("Ask Maya to step in", nodes) === 1 &&
      !has("AI unavailable", nodes),
  );
  L.screenshot("android", "Q1-ai-on");
}

if (run("Q2")) {
  await open(2);
  const nodes = A.screen();
  L.step(
    "android",
    "P3.2 creator here: Reply to Kiln Club, no step-in, no notice",
    count("Reply to Kiln Club", nodes) >= 1 &&
      !has("Ask Kiln Club to step in", nodes) &&
      !has("AI unavailable", nodes),
  );
  L.screenshot("android", "Q2-creator-here");
  await A.tap("Reply to Kiln Club");
  A.type("Here is the tile after the firing.");
  await L.sleep(1000);
  L.screenshot("android", "Q2-typed");
  const send = await A.waitEnabled("Send");
  A.tapAt(send.x, send.y);
  await L.waitForLog(
    0,
    { method: "POST", path: /\/fan-replies$/u, status: 200 },
    20000,
    "android",
  );
  const replies = await posts(/\/fan-replies$/u);
  // The sent reply is a row in the thread now; the field itself is empty.
  const field = () =>
    A.screen().find((n) => n.desc === "Reply to Kiln Club")?.text ?? "";
  const cleared = await until(() => !field().includes("tile"));
  L.step(
    "android",
    "P3.2 the reply goes to the creator once and the field empties",
    replies === 1 && cleared,
    `fan-replies ${replies}`,
  );
}

if (run("Q3")) {
  await open(3);
  const nodes = A.screen();
  L.step(
    "android",
    "P3.3 paused: the paused line, one step-in, no input, no notice",
    has("Glazeco's AI is paused · requests still work", nodes) &&
      count("Ask Glazeco to step in", nodes) === 1 &&
      inputs(nodes) === 0 &&
      !has("Send", nodes) &&
      !has("AI unavailable", nodes) &&
      !has("AI messaging is paused in this conversation", nodes),
  );
  L.screenshot("android", "Q3-paused");
  await A.tap("Ask Glazeco to step in");
  L.step(
    "android",
    "P3.3 step-in opens the packet",
    Boolean(await A.waitFor("Included in your request", 30000)),
  );
}

if (run("Q4")) {
  await open(1);
  const draft = "Kept through every change";
  await A.tap("Message Maya's AI");
  A.type(draft);
  A.key("BACK"); // the keyboard
  await L.sleep(1000);
  await L.harness("POST", "/__harness/threads/maya/pause");
  const paused = await until(
    () => inputs() === 0 && count("Ask Maya to step in") === 1,
  );
  L.step(
    "android",
    "P3.4 paused live: the input leaves, step-in stays, no notice",
    paused &&
      has("Maya's AI is paused · requests still work") &&
      !has("AI unavailable"),
  );
  L.screenshot("android", "Q4-paused");
  await L.harness("POST", "/__harness/threads/maya/takeover");
  await A.waitFor("Reply to Maya", 20000);
  const human = A.screen();
  L.step(
    "android",
    "P3.4 the creator steps in: Reply to Maya, the draft back, no step-in",
    has(draft, human) && !has("Ask Maya to step in", human),
  );
  L.screenshot("android", "Q4-creator-here");
  await L.harness("POST", "/__harness/threads/maya/handback");
  await A.waitFor("Message Maya's AI", 20000);
  const back = await until(() => count("Ask Maya to step in") === 1);
  L.step(
    "android",
    "P3.4 handed back: Message Maya's AI, the draft kept, step-in back, nothing sent",
    back &&
      has(draft) &&
      (await posts(/\/messages$/u)) === 0 &&
      (await posts(/\/fan-replies$/u)) === 0,
  );
  L.screenshot("android", "Q4-ai-again");
}

if (run("Q5")) {
  A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
  await open(3, "night");
  await A.waitFor("Ask Glazeco to step in", 30000);
  const paused = A.screen();
  L.step(
    "android",
    "P3.5 largest, Night, paused: one step-in, no input, no notice",
    count("Ask Glazeco to step in", paused) === 1 &&
      inputs(paused) === 0 &&
      !has("AI unavailable", paused),
  );
  L.screenshot("android", "Q5-largest-paused");
  await open(2, "night");
  await A.waitFor("Reply to Kiln Club", 30000);
  const human = A.screen();
  L.step(
    "android",
    "P3.5 largest, Night, creator here: Reply to Kiln Club, no step-in",
    !has("Ask Kiln Club to step in", human),
  );
  L.screenshot("android", "Q5-largest-creator-here");
  A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
}

stop();
L.finish();
