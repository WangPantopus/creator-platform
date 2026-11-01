// WP 7.4 P9 on Android: the packet's terms block, in the approved wording,
// against the lane 7 fake API. iOS runs the same flows as XCUITest
// (Lane7PacketFlows, through ios-navigation.mjs --packet).
//   node tests/scenarios/lane-7/e7-4-packet.mjs [M1 M2 M3]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

const has = (label, nodes) =>
  nodes.some((n) => n.text === label || n.desc === label);
async function open(n, appearance = "light") {
  await L.harness("POST", "/__harness/reset");
  L.launch(
    "android",
    "--reset",
    "--actor",
    "devon",
    "--to",
    `/commerce/packet?creatorId=c1000000-0000-4000-8000-00000000000${n}`,
    "--appearance",
    appearance,
  );
  await A.waitFor("Included in your request", 30000);
  await L.sleep(1000);
}
/** Scrolls down with short drags until a label is on screen. */
async function reveal(label) {
  for (let i = 0; i < 12; i += 1) {
    const node = A.screen().find((n) => n.text.includes(label));
    if (node) return node;
    A.swipe(540, 1500, 540, 1000, 600);
    await L.sleep(500);
  }
  return null;
}
/** The block for one creator: both rows, the rule and the hold, never "she". */
async function terms(name, price, hours) {
  const rule = `Charged only when ${name} accepts. If ${name} declines or ${hours} h pass, nothing is charged.`;
  await reveal("Your bank may show a pending hold");
  const seen = new Set();
  for (let i = 0; i < 3; i += 1) {
    for (const n of A.screen()) seen.add(n.text);
    A.swipe(540, 1000, 540, 1300, 600);
    await L.sleep(400);
  }
  const nodes = [...seen].map((text) => ({ text, desc: "" }));
  return (
    has(rule, nodes) &&
    has(`IF ${name.toUpperCase()} ACCEPTS`, nodes) &&
    has(price, nodes) &&
    has(`IF ${name.toUpperCase()} DECLINES OR ${hours} H PASS`, nodes) &&
    has("Your bank may show a pending hold for a few days.", nodes) &&
    ![...seen].some((t) => /she declines|usually decides/u.test(t))
  );
}
async function choose(mode) {
  const node = await reveal(mode);
  A.tapAt(node.x, node.y);
  await L.sleep(800);
}

if (run("M1")) {
  await open(1);
  const before = !A.texts().some((t) => t.includes("Charged only when"));
  await choose("Written reply");
  const ok = await terms("Maya", "$25.00", 48);
  L.screenshot("android", "M1-maya-terms");
  L.step(
    "android",
    "P9.1 no terms before a choice; Maya's terms in the approved wording, 48 h",
    before && ok,
  );
}

if (run("M2")) {
  await open(2);
  await choose("Voice note");
  const ok = await terms("Kiln Club", "$15.00", 72);
  L.screenshot("android", "M2-kiln-terms");
  L.step("android", "P9.2 Kiln Club's own name and deadline", ok);
}

if (run("M3")) {
  A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
  await open(1, "night");
  await choose("Written reply");
  const ok = await terms("Maya", "$25.00", 48);
  L.screenshot("android", "M3-largest-night");
  L.step("android", "P9.3 largest, Night: the block whole", ok);
  A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
}

stop();
L.finish();
