// WP 7.8, the access token's end, on lane 7's fake API (harness/server.mjs) and
// both apps. Devon keeps Maya's thread open with a typed draft, and the harness
// ends his session's access window without moving a clock (POST
// /__harness/sessions {action: "expire"}). Its 2-second socket re-check, like
// the real gateway's, closes the live connection 4401; the app renews through
// its session check and reconnects; the thread and the draft stay, and Maya's
// reply sent after it arrives live (X1). A revoked session still closes 1008:
// the thread ends, its draft is discarded and the app signs out (X2). D-11's
// 4403 is e7-4-adults.mjs's P7.4 and P7.5, and Lane7AdultFlows A4 and A5.
// The real stack's run, which waits a real token out, is stack-expiry.mjs.
//   node tests/scenarios/lane-7/e7-8-expiry.mjs [ios|android] [X1 X2]
// iOS: LANE7_XCTESTRUN names the built UI tests; the draft is typed by
// Lane7ExpiryFlows E1, which attaches to the running app.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";

const THREAD =
  "/threads/c1000000-0000-4000-8000-000000000001/f1000000-0000-4000-8000-000000000001";
// Maya's signed message in the thread, whichever part of it is in view.
const SEEN = /send me a photo of the tile|look at it properly/u;
const BUNDLE = "com.pantopus.qelvora";
const root = new URL("../../..", import.meta.url).pathname;
const args = process.argv.slice(2);
const platformArg = ["ios", "android"].includes(args[0])
  ? args.shift()
  : undefined;
const run = (id) => !args.length || args.includes(id);
const DENIALS =
  /Your account changed|Reconnect to refresh this conversation|Sign in to continue|This conversation is unavailable/u;
const mark = async () => (await L.log()).at(-1)?.n ?? 0;
/** Log entries after `n` that match, each field exactly or by pattern. */
const after = async (n, match) =>
  (await L.log(n)).filter((e) =>
    Object.entries(match).every(([k, v]) =>
      v instanceof RegExp ? v.test(String(e[k])) : e[k] === v,
    ),
  );
async function waitFor(n, match, ms = 15000) {
  for (const until = Date.now() + ms; ; await L.sleep(250)) {
    const [found] = await after(n, match);
    if (found || Date.now() > until) return found ?? null;
  }
}
const stopHarness = await L.ensureHarness();

const udid = () =>
  Object.values(
    JSON.parse(execFileSync("xcrun", ["simctl", "list", "-j", "devices"]))
      .devices,
  )
    .flat()
    .find((d) => d.name === (process.env.LANE7_IOS ?? "qelvora-lane7-ios"))
    .udid;
/** Encrypted draft files the app keeps for its threads. */
function drafts(p) {
  if (p === "android")
    return A.adb(
      "exec-out",
      "run-as",
      BUNDLE,
      "sh",
      "-c",
      "ls no_backup/conversation-drafts 2>/dev/null; true",
    )
      .split(/\s+/u)
      .filter(Boolean).length;
  const folder = join(
    execFileSync(
      "xcrun",
      ["simctl", "get_app_container", udid(), BUNDLE, "data"],
      { encoding: "utf8" },
    ).trim(),
    "Library/Application Support",
    `${BUNDLE}.conversation-drafts`,
  );
  return existsSync(folder) ? readdirSync(folder).length : 0;
}
/** Lane7ExpiryFlows on the running app (ios-navigation.mjs --expiry). */
const flow = (id, draft, extra = {}) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "tests/scenarios/lane-7/ios-navigation.mjs",
        process.env.LANE7_XCTESTRUN,
        "--expiry",
        id,
      ],
      {
        cwd: root,
        stdio: "ignore",
        env: {
          ...process.env,
          LANE7_IOS: udid(),
          LANE7_EXPIRY_DRAFT: draft,
          ...extra,
        },
      },
    );
    child.on("close", (code) => resolve(code === 0));
  });
/** Devon, signed in afresh, in Maya's thread with a typed draft. */
async function open(p, draft) {
  L.stop(p);
  await L.harness("POST", "/__harness/reset");
  L.launch(p, "--reset", "--actor", "devon", "--to", THREAD);
  const shown = await L.waitForText(p, SEEN, 45000);
  const n = await mark();
  await waitFor(0, { method: "WS", status: 101 }, 20000);
  let typed;
  if (p === "android") {
    await A.tap("Message Maya's AI", 30000);
    A.type(draft);
    await A.waitFor(draft, 10000);
    // Close the keyboard, so the thread's rows have the screen.
    A.key("BACK");
    for (
      let until = Date.now() + 10000;
      Date.now() < until &&
      /type=ime frame=[^\n]*visible=true/u.test(
        A.adb("shell", "dumpsys", "window"),
      );

    )
      await L.sleep(250);
    typed = Boolean(await A.waitFor(draft, 5000));
  } else typed = await flow("E1", draft);
  let saved = 0;
  for (let until = Date.now() + 15000; Date.now() < until && !saved; )
    if (!(saved = drafts(p))) await L.sleep(500);
  return { ok: shown.ok && typed && saved > 0, saved, n };
}

for (const p of L.platforms(platformArg)) {
  if (run("X1")) {
    const draft = `lane7 expiry draft ${Date.now() % 1_000_000}`;
    const opened = await open(p, draft);
    L.step(
      p,
      "X1 Maya's thread is open with a typed draft, saved",
      opened.ok,
      `${opened.saved} draft file(s)`,
    );
    const n = await mark();
    await L.harness("POST", "/__harness/sessions", {
      account: "devon",
      action: "expire",
    });
    const closed = await waitFor(n, { method: "WS", status: 4401 }, 10000);
    const refused = await after(n, { method: "WS", status: /^40[13]$/u });
    L.step(
      p,
      "X1 the access window ends: the socket re-check closes 4401, not 1008",
      Boolean(closed) && !refused.length,
      refused.map((e) => e.status).join(", "),
    );
    const refreshed = await waitFor(n, {
      path: /^\/v1\/identity\/refresh$/u,
      status: 200,
    });
    const reopened = closed
      ? await waitFor(closed.n, { method: "WS", status: 101 })
      : null;
    L.step(
      p,
      "X1 the app renews through its session check and opens a new live connection",
      Boolean(refreshed && reopened && reopened.n > refreshed.n),
      refreshed && reopened
        ? `refresh ${Date.parse(refreshed.at) - Date.parse(closed.at)} ms, new connection ${Date.parse(reopened.at) - Date.parse(closed.at)} ms after the close`
        : "",
    );
    await L.sleep(2000);
    const text = L.screenText(p, "X1-after");
    const flat = text.replaceAll(/\s*\n\s*/gu, " ");
    L.step(
      p,
      "X1 the thread and the draft stay, with no denial",
      SEEN.test(flat) && flat.includes(draft) && !DENIALS.test(flat),
      text
        .split("\n")
        .filter((t) => DENIALS.test(t))
        .join(" | "),
    );
    if (p === "ios")
      L.step(
        p,
        "X1 the composer still holds exactly the draft (Lane7ExpiryFlows E2)",
        await flow("E2", draft, { LANE7_EXPIRY_SEEN: "send me a photo" }),
      );
    L.step(p, "X1 the draft is still saved", drafts(p) > 0);
    L.screenshot(p, "X1-after-renewal");
    const reply = `Maya after the renewal ${Date.now() % 1_000_000}`;
    const sentAt = Date.now();
    await L.harness("POST", "/__harness/threads/maya/reply", { text: reply });
    const live = await L.waitForText(p, new RegExp(reply, "u"), 15000);
    L.step(
      p,
      "X1 Maya's reply sent after the renewal arrives live",
      live.ok,
      `${((Date.now() - sentAt) / 1000).toFixed(1)} s after it was sent`,
    );
  }
  if (run("X2")) {
    const draft = `lane7 revoked draft ${Date.now() % 1_000_000}`;
    const opened = await open(p, draft);
    L.step(
      p,
      "X2 Maya's thread is open with a typed draft, saved",
      opened.ok,
      `${opened.saved} draft file(s)`,
    );
    const n = await mark();
    await L.harness("POST", "/__harness/sessions", {
      account: "devon",
      action: "revoke",
    });
    const closed = await waitFor(
      n,
      { method: "WS", status: /^(401|403|4401)$/u },
      10000,
    );
    L.step(
      p,
      "X2 a revoked session: the socket re-check still closes 1008, not 4401",
      closed?.status === 401,
      `logged ${closed?.status ?? "nothing"}`,
    );
    const out = await L.waitForText(p, /Sign in to continue/u, 45000);
    L.step(
      p,
      "X2 the thread ends and the app signs out, saying the session ended",
      out.ok &&
        /session ended/iu.test(out.text) &&
        !SEEN.test(out.text) &&
        !out.text.includes(draft),
    );
    let left = drafts(p);
    for (let until = Date.now() + 10000; Date.now() < until && left; )
      if ((left = drafts(p))) await L.sleep(500);
    L.step(p, "X2 the draft is discarded", left === 0, `${left} draft file(s)`);
    L.screenshot(p, "X2-revoked");
  }
  L.stop(p);
}
stopHarness?.();
L.finish();
