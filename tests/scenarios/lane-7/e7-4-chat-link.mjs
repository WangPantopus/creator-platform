// WP 7.4 on Android: `/creators/{handle}/chat` (the link a Note or reaction
// notice and "Message {name}'s AI" open), against the lane 7 fake API. iOS
// runs the same flows as XCUITest (Lane7ChatLinkFlows, through
// ios-navigation.mjs --chat-link). A notice opening the thread is P2's U2.
//   node tests/scenarios/lane-7/e7-4-chat-link.mjs [H1 H2]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

async function open(path, actor) {
  await L.harness("POST", "/__harness/reset");
  await L.harness("POST", "/__harness/log/clear");
  L.launch("android", "--reset", "--actor", actor, "--to", path);
}
const begins = async () =>
  L.seen(await L.log(0, "android"), {
    method: "POST",
    path: /^\/v1\/conversations(\/begin)?$/u,
  }).length;
const has = (label) => A.texts().some((t) => t.includes(label));

if (run("H1")) {
  await open("/creators/maya/chat", "devon");
  await A.waitFor("Me and privacy", 30000);
  L.step(
    "android",
    "H1 an existing conversation opens, nothing begun",
    !has("Before your first message") && (await begins()) === 0,
  );
  L.screenshot("android", "H1-thread");
}

if (run("H2")) {
  await open("/creators/lenapark/chat", "priya");
  await A.waitFor("Before your first message", 30000);
  L.step(
    "android",
    "H2 no conversation: the first-conversation screen, as before",
    Boolean(await A.waitFor("Synthetic provider processing terms", 30000)),
  );
  L.screenshot("android", "H2-first-conversation");
}

stop();
L.finish();
