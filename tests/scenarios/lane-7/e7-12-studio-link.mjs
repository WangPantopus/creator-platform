// WP 7.12 on Android: a creator in the fan app opens the web Studio in the
// system browser; a fan sees no link. iOS runs the same flows as XCUITest
// (Lane7StudioLinkFlows, through ios-navigation.mjs --studio).
//   node tests/scenarios/lane-7/e7-12-studio-link.mjs [Z1 Z2]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const STUDIO = "/studio/c1000000-0000-4000-8000-000000000001";
const LINK = "Open Qelvora Studio";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

async function account(actor) {
  await L.harness("POST", "/__harness/reset");
  L.launch("android", "--reset", "--actor", actor, "--to", "/identity/account");
  await A.waitFor("Your account", 30000);
  await L.sleep(1500);
}
async function reveal(label) {
  for (let i = 0; i < 8; i += 1) {
    const node = A.screen().find((n) => n.text === label || n.desc === label);
    if (node) return node;
    A.swipe(540, 1600, 540, 900, 600);
    await L.sleep(600);
  }
  return null;
}

if (run("Z1")) {
  await account("maya");
  const link = await reveal(LINK);
  L.step(
    "android",
    "Z1 a creator's account has the Studio link",
    Boolean(link),
  );
  if (link) {
    const since = (await L.log()).at(-1)?.n ?? 0;
    A.adb("logcat", "-c");
    A.tapAt(link.x, link.y);
    await L.sleep(5000);
    // The VIEW intent the system browser received. Android writes its path as
    // "/..." in the log; the path itself shows in the fake's log once the
    // browser loads the page (Chrome's first run holds it until accepted).
    const asked =
      /act=android\.intent\.action\.VIEW dat=http:\/\/127\.0\.0\.1:56473\/\S* .*cmp=com\.android\.chrome/u.test(
        A.adb("logcat", "-d"),
      );
    const visits = L.seen(await L.log(since), {
      method: "GET",
      path: new RegExp(`^${STUDIO}$`, "u"),
    }).length;
    L.screenshot("android", "Z1-browser");
    L.step(
      "android",
      "Z1 the system browser is asked for this creator's web Studio",
      asked || visits > 0,
      `intent ${asked ? "seen" : "not seen"}; the web origin saw ${visits} visit(s)`,
    );
    A.adb("shell", "am", "force-stop", "com.android.chrome");
  }
}
if (run("Z2")) {
  await account("devon");
  L.step(
    "android",
    "Z2 a fan's account has no Studio link",
    !(await reveal(LINK)),
  );
}
L.stop("android");
stop();
L.finish();
