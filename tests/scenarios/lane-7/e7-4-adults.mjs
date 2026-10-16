// WP 7.4 P7 on Android: the designed under-18 state (D-11), against the lane 7
// fake API. iOS runs the same flows as XCUITest (Lane7AdultFlows, through
// ios-navigation.mjs --adults).
//   node tests/scenarios/lane-7/e7-4-adults.mjs [A1 A2 A3]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const TITLE = "This app is for adults";
const BODY = "This app is available to adults aged 18 and over.";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

/** The adults-only state and nothing else: no retry, help, sign-in or tabs. */
function only() {
  const texts = A.texts();
  const extra = texts.filter((t) =>
    /Retry|Crisis help|Continue with Pantopus|Your people|Discover|session is kept/u.test(
      t,
    ),
  );
  return {
    ok: texts.includes(TITLE) && texts.includes(BODY) && !extra.length,
    detail: extra.length ? `also shown: ${extra.join(" | ")}` : "",
  };
}

/** Devon signed in on Home, then flagged under 18 (an ops review). */
async function flagged(appearance = "light") {
  await L.harness("POST", "/__harness/reset");
  L.launch(
    "android",
    "--reset",
    "--actor",
    "devon",
    "--to",
    "/",
    "--appearance",
    appearance,
  );
  await A.waitFor("Your people", 30000);
  await L.harness("POST", "/__harness/accounts/devon", { adult: false });
  await A.waitFor(TITLE, 40000);
}

if (run("A1")) {
  await flagged();
  const shown = only();
  L.step(
    "android",
    "P7.1 flagged after sign-in: the adults-only state, nothing else",
    shown.ok,
    shown.detail,
  );
  L.screenshot("android", "A1-flagged-later");
  // The session ended on the server and here: nothing retries with it.
  const seen = (await L.log(0, "android")).length;
  await L.sleep(10000);
  const later = (await L.log(0, "android")).slice(seen);
  const refused = (await L.log(0, "android")).filter(
    (e) => e.status === 403 && e.account === "devon",
  );
  L.step(
    "android",
    "P7.1 no request with the old session after the refusal",
    refused.length >= 1 && later.every((e) => e.account !== "devon"),
    `refused ${refused.length}, later requests ${later.length}`,
  );
  // A relaunch finds no session: the welcome, not Home.
  L.launch("android", "--to", "/");
  await A.waitFor("Continue with Pantopus", 30000);
  L.step(
    "android",
    "P7.1 the session is gone after a relaunch",
    !A.texts().includes("Your people"),
  );
}

if (run("A2")) {
  // The under-18 persona at sign-in: refused, with the same state.
  await L.harness("POST", "/__harness/reset");
  L.launch("android", "--reset", "--to", "/");
  await A.tap("Continue with Pantopus", 30000);
  await A.tap("Harness: an account under 18 (refused)", 30000);
  await A.waitFor(TITLE, 40000);
  const shown = only();
  L.step(
    "android",
    "P7.2 refused at sign-in: the adults-only state, nothing else",
    shown.ok,
    shown.detail,
  );
  L.screenshot("android", "A2-refused-at-sign-in");
  L.launch("android", "--to", "/");
  await A.waitFor("Continue with Pantopus", 30000);
  L.step(
    "android",
    "P7.2 no session was kept",
    !A.texts().includes("Your people"),
  );
}

if (run("A3")) {
  A.adb("shell", "settings", "put", "system", "font_scale", "2.0");
  await flagged("night");
  const shown = only();
  L.step(
    "android",
    "P7.3 largest text, Night: the state in full",
    shown.ok,
    shown.detail,
  );
  L.screenshot("android", "A3-largest-night");
  A.adb("shell", "settings", "put", "system", "font_scale", "1.0");
}

stop();
L.finish();
