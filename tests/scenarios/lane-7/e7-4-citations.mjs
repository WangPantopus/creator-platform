// WP 7.4 P4 on Android: citations in Maya's thread, against the lane 7 fake
// API. iOS runs the same flows as XCUITest (Lane7CitationFlows, through
// ios-navigation.mjs --citations).
//   node tests/scenarios/lane-7/e7-4-citations.mjs [P1 P2 P3]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const THREAD =
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
const DRAFT = "Kept draft about the glaze";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

const visible = (label) =>
  A.screen().some((n) => n.text.includes(label) || n.desc.includes(label));
/** Scrolls the thread up with short drags until a label is on screen. */
async function find(label) {
  for (let i = 0; i < 20 && !visible(label); i += 1) {
    A.swipe(540, 900, 540, 1300, 600);
    await L.sleep(500);
  }
  return visible(label);
}
/** Maya's thread with a draft typed, the newest citation on screen. */
async function thread() {
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/faults", { rules: [] });
  L.launch("android", "--reset", "--actor", "devon", "--to", THREAD);
  await A.waitFor("Send", 30000);
  await L.sleep(1500);
  await A.tap("Message Maya's AI", 10000);
  A.type(DRAFT);
  A.key("BACK"); // the keyboard
  await L.sleep(800);
  return find("Read the original passage");
}
/** The thread is still there, with its draft. */
const kept = () =>
  visible("Ask Maya to step in") && visible(DRAFT) && !visible("unavailable");

async function refused(rule, id) {
  const found = await thread();
  await L.harness("POST", "/__harness/faults", { rules: [rule] });
  await A.tap("Read the original passage");
  const said =
    (await A.waitFor("Source unavailable", 15000).then(
      () => true,
      () => false,
    )) && visible("No longer accessible to you");
  L.screenshot("android", `${id}-refused`);
  await A.tap("Close");
  await L.sleep(1500);
  return { found, said, kept: kept() };
}

if (run("P1")) {
  const found = await thread();
  await A.tap("Read the original passage");
  const opened = await A.waitFor("Why celadon pinholes", 15000).then(
    () => true,
    () => false,
  );
  L.step(
    "android",
    "P4.1 a citation opens its passage",
    found && opened && visible("Original source"),
  );
  L.screenshot("android", "P1-passage");
  await A.tap("Close");
  await L.sleep(1000);
  L.step("android", "P4.1 closing returns to the thread", kept());
}

if (run("P2")) {
  // The real refusal for a passage that is no longer readable.
  const r = await refused(
    {
      match: "/citations/",
      status: 403,
      code: "citation_unavailable",
      message: "No longer accessible to you",
    },
    "P2",
  );
  L.step(
    "android",
    "P4.2 a refused passage (403) is said, the thread and draft stay",
    r.found && r.said && r.kept,
    JSON.stringify(r),
  );
}

if (run("P3")) {
  const r = await refused(
    {
      match: "/citations/",
      status: 404,
      code: "not_found",
      message: "Not found",
    },
    "P3",
  );
  L.step(
    "android",
    "P4.3 a missing passage (404) is said the same way",
    r.found && r.said && r.kept,
    JSON.stringify(r),
  );
}

await L.harness("POST", "/__harness/faults", { rules: [] });
stop();
L.finish();
