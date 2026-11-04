// WP 7.4 P7 on Android: the designed under-18 state (D-11), against the lane 7
// fake API. iOS runs the same flows as XCUITest (Lane7AdultFlows, through
// ios-navigation.mjs --adults).
//   node tests/scenarios/lane-7/e7-4-adults.mjs [A1 A2 A3 A4]
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const TITLE = "This app is for adults";
const BODY = "This app is available to adults aged 18 and over.";
const THREAD =
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
const DRAFT = "lane7 under18 private draft";
const wanted = process.argv.slice(2);
const run = (id) => !wanted.length || wanted.includes(id);
const stop = await L.ensureHarness();

/** The adults-only state and nothing else: no retry, help, sign-in or tabs. */
function only() {
  const texts = A.texts();
  const extra = texts.filter((t) =>
    /Retry|Crisis help|Sign in to continue|Your people|Discover|session is kept/u.test(
      t,
    ),
  );
  return {
    ok: texts.includes(TITLE) && texts.includes(BODY) && !extra.length,
    detail: extra.length ? `also shown: ${extra.join(" | ")}` : "",
  };
}

/** What the app keeps of a thread and a session (run-as works on a debug
 * build): draft and offline files, and the resume and session stores' entries. */
function saved() {
  const sh = (command) =>
    A.adb(
      "exec-out",
      "run-as",
      "com.pantopus.qelvora",
      "sh",
      "-c",
      `${command} 2>/dev/null; true`,
    ).trim();
  const entries = (files) =>
    (
      sh(`cat ${files}`).match(
        /<(string|long|int|boolean|float|set) name=/gu,
      ) ?? []
    ).length;
  return {
    drafts: sh("ls no_backup/conversation-drafts").split(/\s+/u).filter(Boolean)
      .length,
    offline: sh("ls no_backup/conversation-offline.enc").length > 0,
    resume: entries("shared_prefs/conversation-resume.xml"),
    session: entries("shared_prefs/identity-session*.xml"),
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
  await A.waitFor("Sign in to continue", 30000);
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
  await A.tap("Sign in to continue", 30000);
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
  await A.waitFor("Sign in to continue", 30000);
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

if (run("A4")) {
  // In a thread, its own reads (Notes and reactions, the offline copy) meet
  // the flag before the 30-second session check does, and the server ends the
  // session there. The same state must show, and nothing of the thread stay.
  await L.harness("POST", "/__harness/reset");
  L.launch("android", "--reset", "--actor", "devon", "--to", THREAD);
  await A.waitFor("Pinholes in celadon", 30000);
  await A.tap("Message Maya's AI");
  A.type(DRAFT);
  // Wait until the thread has left something behind: the draft, the offline
  // copy, the resume cursor and the session.
  let before = saved();
  for (
    let until = Date.now() + 20000;
    !(before.drafts && before.offline && before.resume && before.session) &&
    Date.now() < until;
    before = saved()
  )
    await L.sleep(500);
  L.step(
    "android",
    "P7.4 before the flag the thread is saved: draft, offline copy, resume cursor, session",
    before.drafts > 0 &&
      before.offline &&
      before.resume > 0 &&
      before.session > 0,
    JSON.stringify(before),
  );
  const since = (await L.log()).at(-1)?.n ?? 0;
  await L.harness("POST", "/__harness/accounts/devon", { adult: false });
  await A.waitFor(TITLE, 40000);
  const shown = only();
  L.step(
    "android",
    "P7.4 flagged in a thread: the adults-only state, nothing else",
    shown.ok,
    shown.detail,
  );
  L.screenshot("android", "A4-flagged-in-a-thread");
  const refused = (await L.log(since, "android")).find((e) => e.status === 403);
  L.step(
    "android",
    "P7.4 a thread's own read met the flag, not the session check",
    Boolean(refused) && !/\/identity\/session$/u.test(refused.path),
    refused ? `${refused.method} ${L.shape(refused.path)}` : "no refusal",
  );
  const left = A.texts().filter((t) =>
    /Pinholes in celadon|Maya's AI|under18 private draft/u.test(t),
  );
  L.step(
    "android",
    "P7.4 nothing of the thread stays on screen",
    !left.length,
    left.join(" | "),
  );
  const after = saved();
  L.step(
    "android",
    "P7.4 nothing of the thread or the session stays in the app's storage",
    !after.drafts && !after.offline && !after.resume && !after.session,
    JSON.stringify(after),
  );
  // A relaunch into the thread finds no session: the welcome, not the thread.
  L.launch("android", "--to", THREAD);
  await A.waitFor("Sign in to continue", 30000);
  L.step(
    "android",
    "P7.4 a relaunch into the thread shows the welcome",
    !A.texts().some((t) => /Pinholes in celadon/u.test(t)),
  );
}

stop();
L.finish();
