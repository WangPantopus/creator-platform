// WP 7.4 P2 on Android: notification rows (authorship, time, unread) against
// the lane 7 fake API, as Devon. iOS runs the same flows as XCUITest
// (Lane7NotificationFlows, through ios-navigation.mjs --notifications).
//   node tests/scenarios/lane-7/e7-4-notifications.mjs [U1 U2 U3 U4]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();
// Today's time ("14:05") or the day ("Oct 14").
const TIME = "([0-2][0-9]:[0-5][0-9]|[A-Z][a-z]{2} [0-9]{1,2})";
const escape = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const STUDIO = "Studio note: the kiln is cooling until Thursday.";

async function open(appearance = "light") {
  await L.harness("POST", "/__harness/reset");
  L.launch(
    "android",
    "--reset",
    "--actor",
    "devon",
    "--to",
    "/notifications",
    "--appearance",
    appearance,
  );
  await A.waitFor("The Friday glaze clinic is back", 30000);
  await L.sleep(1000);
}
const descs = () => A.screen().map((n) => n.desc);
/** Scrolls down with short drags until a row is on screen. */
async function reveal(label) {
  for (let i = 0; i < 10 && !descs().some((d) => d.includes(label)); i += 1) {
    A.swipe(540, 1500, 540, 1000, 600);
    await L.sleep(500);
  }
  return A.screen().find((n) => n.desc.includes(label));
}

if (run("U1")) {
  await open();
  const rows = [
    [
      "Maya · to followers",
      "The Friday glaze clinic is back. Bring one test tile.",
      true,
    ],
    [
      "Maya reacted to your reply.",
      "You have an update. Open the app to view it.",
      true,
    ],
    ["Approved by Maya.", "Your bisque question has an approved reply.", false],
    [
      "Kiln Club's AI.",
      "Your question about firing schedules has a reply.",
      false,
    ],
    ["System.", "Your request was passed on this one.", false],
    ["Maya · to members.", STUDIO, true],
  ];
  const seen = new Set();
  for (let i = 0; i < 6; i += 1) {
    for (const d of descs()) seen.add(d);
    A.swipe(540, 1500, 540, 1000, 600);
    await L.sleep(500);
  }
  for (const [sender, preview, unread] of rows) {
    const separator = sender.endsWith(".") ? " " : ". ";
    const pattern = new RegExp(
      `^${escape(sender)}${separator}${escape(preview)} ${TIME}${unread ? "\\. Unread" : ""}$`,
      "u",
    );
    const match = [...seen].filter((d) => pattern.test(d));
    L.step(
      "android",
      `P2.1 ${sender} ${unread ? "(unread)" : "(read)"}: sender, preview, time${unread ? ", Unread" : ""}`,
      match.length === 1,
      match[0] ?? [...seen].find((d) => d.includes(preview)) ?? "missing",
    );
  }
  await open();
  L.screenshot("android", "U1-rows");
}

if (run("U2")) {
  await open();
  const note = await reveal(STUDIO);
  const before = note?.desc ?? "";
  A.tapAt(note.x, note.y);
  await A.waitFor("Me and privacy", 30000);
  const state = await L.state();
  const read = state.notifications.some(
    (n) => n.id === "9e000000-0000-4000-8000-000000000006" && n.read,
  );
  A.key("BACK");
  await A.waitFor(STUDIO, 30000);
  const after = (await reveal(STUDIO))?.desc ?? "";
  L.step(
    "android",
    "P2.2 a Note notice opens Maya's thread and is read after",
    before.endsWith("Unread") && read && !after.endsWith("Unread"),
    after,
  );
  L.screenshot("android", "U2-note-read");
}

if (run("U3")) {
  await open();
  const reaction = await A.waitFor("Maya reacted to your reply", 15000);
  const generic = reaction.desc.includes(
    "You have an update. Open the app to view it.",
  );
  A.tapAt(reaction.x, reaction.y);
  const thread = Boolean(await A.waitFor("Me and privacy", 30000));
  L.step(
    "android",
    "P2.3 a reaction notice: the generic preview, and it opens the thread",
    generic && thread,
  );
}

if (run("U4")) {
  A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
  await open("night");
  L.screenshot("android", "U4-largest-night-top");
  const note = await reveal(STUDIO);
  L.step(
    "android",
    "P2.4 largest, Night: the last row reachable",
    Boolean(note),
  );
  L.screenshot("android", "U4-largest-night-note");
  A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
}

stop();
L.finish();
