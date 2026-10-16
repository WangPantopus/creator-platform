// WP 7.4 P3 on Android: the creator seal on creator-colored buttons, against
// the lane 7 fake API. The seal is decorative (no accessibility node), so each
// step captures the screen for visual review; iOS runs the same flows as
// XCUITest (Lane7SealFlows, through ios-navigation.mjs --seal).
//   node tests/scenarios/lane-7/e7-4-seal.mjs [S1 S2 S3]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const thread = (n) =>
  `/threads/c1000000-0000-4000-8000-00000000000${n}/f1000000-0000-4000-8000-000000000001`;
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

async function open(path, actor = "devon", appearance = "light") {
  await L.harness("POST", "/__harness/reset");
  L.launch(
    "android",
    "--reset",
    "--actor",
    actor,
    "--to",
    path,
    "--appearance",
    appearance,
  );
}

if (run("S1")) {
  for (const [n, name] of [
    [1, "Maya"],
    [2, "Kiln Club"],
    [3, "Glazeco"],
  ]) {
    await open(thread(n));
    await A.waitFor(`Ask ${name} to step in`, 30000);
    await L.sleep(1000);
    L.screenshot("android", `S1-${name.replace(" ", "-")}`);
    L.step("android", `S3.1 ${name} thread captured`, true);
  }
}

/** Scrolls the thread with slow drags until a label's row is clear of the
 * list's edges (uiautomator clips a partly shown row to them), or centered
 * when taller; older rows are above. */
async function reveal(label) {
  let last = "";
  for (let i = 0; i < 30; i += 1) {
    const nodes = A.screen();
    const list = nodes.find((n) => n.scrollable);
    const node = nodes.find(
      (n) => n.text.includes(label) || n.desc.includes(label),
    );
    if (!list) return false;
    const [, top, , bottom] = list.bounds;
    const middle = (top + bottom) / 2;
    if (node) {
      const [, y1, , y2] = node.bounds;
      if (y1 > top + 2 && y2 < bottom - 2) return true;
      if (Math.abs(node.y - middle) < (bottom - top) * 0.1) return true;
      if (node.bounds.join() === last) return true;
      last = node.bounds.join();
    }
    // A finger move of 2 × step scrolls the content about that far.
    const limit = (bottom - top) * 0.3;
    const step = node ? (middle - node.y) / 2 : limit;
    const s = Math.max(-limit, Math.min(limit, step));
    A.swipe(540, Math.round(middle - s), 540, Math.round(middle + s), 900);
    await L.sleep(500);
  }
  return false;
}

if (run("S2")) {
  A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
  for (const appearance of ["light", "night"]) {
    await open(thread(2), "devon", appearance);
    await A.waitFor("Ask Kiln Club to step in", 30000);
    await L.sleep(1000);
    L.screenshot("android", `S2-largest-${appearance}`);
    L.step("android", `S3.2 largest ${appearance} captured`, true);
    const strip = await reveal("in this conversation now");
    L.screenshot("android", `S2-largest-strip-${appearance}`);
    L.step("android", `S3.2 largest ${appearance} "is here" line`, strip);
  }
  await open(thread(1));
  await A.waitFor("Ask Maya to step in", 30000);
  const chip = await reveal("Maya reacted to your reply");
  L.screenshot("android", "S2-largest-reaction");
  L.step("android", "S3.2 largest reaction chip", chip);
  A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
}

if (run("S3")) {
  await open("/discover", "priya");
  await A.tap("Search creators", 30000);
  A.type("fern");
  A.key("ENTER");
  await A.tap("🌿 fern studio", 30000);
  await A.tap("Message 🌿 fern studio's AI", 30000);
  // The first-conversation button waits for the provider terms.
  const start = await A.waitEnabled("Start with 🌿 fern studio's AI");
  A.tapAt(start.x, start.y);
  await A.waitFor("Ask 🌿 fern studio to step in", 30000);
  await L.sleep(1000);
  L.screenshot("android", "S3-emoji-lowercase-name");
  L.step("android", "S3.3 emoji and lowercase name captured", true);
}

stop();
L.finish();
