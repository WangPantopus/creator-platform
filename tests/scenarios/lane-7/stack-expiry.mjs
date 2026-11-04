// An open thread outlives its access token, on lane 7's disposable real API
// (`stack up --growth`). The app keeps Maya's thread open, with a typed draft,
// past the session's 15-minute access token. The gateway closes the live
// connection 4401, the app renews through its own session check and
// reconnects, and the thread, the draft and its saved copy stay; a message
// sent from another session after the expiry arrives live. No clock is moved:
// `expiry` waits the token out (about 16 minutes). Then the real denials still
// end the thread: `revoked` (the account signs out everywhere from another
// session: 1008, then the app signs out) and `closed` (the fan blocks Maya from
// another session: 1008, the thread ends, still signed in). D-11's 4403 is
// stack-under-18.mjs's `live` run. `closed` closes Maya's thread for good: run
// it last on a stack.
// The app reaches the API through log-proxy.mjs, which logs every answer, each
// upgrade and each close the gateway sends, and never a header or a body.
//   LANE7_STACK_API=http://127.0.0.1:57901 \
//     node tests/scenarios/lane-7/stack-expiry.mjs ios|android expiry|revoked|closed
// LANE7_IOS names the simulator (a debug build: the proxy's origin is passed at
// launch) and LANE7_XCTESTRUN its built UI tests: the iOS draft is typed by
// Lane7ExpiryFlows E1, which attaches to the running app. LANE7_ANDROID names
// the emulator, LANE7_PROXY_PORT the proxy's port. Android is fan one and iOS
// fan two, so both can run at once on one stack.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";
import { creator as MAYA, request, signIn } from "./stack-api.mjs";

const [platform, mode] = process.argv.slice(2);
if (!["ios", "android"].includes(platform))
  throw new Error("Name the platform: ios or android.");
if (!["expiry", "revoked", "closed"].includes(mode))
  throw new Error("Name the run: expiry, revoked or closed.");
const api = process.env.LANE7_STACK_API ?? "http://127.0.0.1:56471";
const target = Number(new URL(api).port);
const port = Number(
  process.env.LANE7_PROXY_PORT ?? target + (platform === "ios" ? 7 : 8),
);
const origin = `http://127.0.0.1:${port}`;
const root = new URL("../../..", import.meta.url).pathname;
const BUNDLE = "com.pantopus.qelvora";
const NUMBER = platform === "android" ? 1 : 2;
const ACTOR = platform === "android" ? "actor one" : "actor two";
// Digits only after the words, which screen text recognition reads reliably.
const run = String(Date.now() % 1_000_000).padStart(6, "0");
const DRAFT = `lane7 expiry draft ${run}`;
const BEFORE = `lane7 expiry before ${run}`;
const AFTER = `lane7 expiry after ${run}`;
const pattern = (marker) =>
  new RegExp(marker.replace("lane7", "lane\\s*7").replaceAll(" ", "\\s*"), "u");
const DENIALS =
  /Your account changed|Reconnect to refresh this conversation|Sign in to continue|This conversation is unavailable/u;
// The thread is on screen: the marker message, or an AI row's own author label
// (a line of its own, never the disclosure banner that also names the AI). A
// reply can scroll the marker out of a short list, and Android's screen text
// holds only the rows in view.
const AI_ROW = /^Maya's AI$/mu;
const threadShown = (text) => pattern(BEFORE).test(text) || AI_ROW.test(text);

// ------------------------------------------------------------- the proxy
const proxy = spawn(
  process.execPath,
  [
    join(root, "tests/scenarios/lane-7/log-proxy.mjs"),
    "--listen",
    String(port),
    "--target",
    String(target),
  ],
  { stdio: "ignore" },
);
const entries = async () =>
  (await fetch(`${origin}/__proxy/log`).then((r) => r.json())).filter(
    (e) => e.path !== "/__proxy/log",
  );
for (let i = 0; ; i += 1) {
  try {
    await entries();
    break;
  } catch (error) {
    if (i > 50) throw error;
    await L.sleep(100);
  }
}
const matching = (list, from, match) =>
  list.filter(
    (e) =>
      e.at >= from &&
      Object.entries(match).every(([k, v]) =>
        v instanceof RegExp ? v.test(String(e[k])) : e[k] === v,
      ),
  );
const since = async (from, match) => matching(await entries(), from, match);
async function waitForEntry(from, match, ms) {
  for (const until = Date.now() + ms; ; await L.sleep(250)) {
    const [found] = await since(from, match);
    if (found || Date.now() > until) return found ?? null;
  }
}
const shown = (e) =>
  e ? `${e.method} ${e.status}${e.reason ? ` "${e.reason}"` : ""}` : "none";

// -------------------------------------------- the fan and Maya's thread
/** A message from one of the fan's sessions, as another device sends it. */
async function say(token, fanId, text) {
  const sent = await request(
    "POST",
    `/v1/conversations/${MAYA}/${fanId}/messages`,
    token,
    {
      text,
      idempotencyKey: randomUUID(),
      clientSequence: Date.now() % 1_000_000,
    },
  );
  return sent.status;
}
const fan = await (async () => {
  const owner = await signIn(NUMBER);
  let id = owner.session.fan?.id;
  if (!id) {
    const made = await request(
      "POST",
      "/v1/identity/fan-profile",
      owner.token,
      { handle: `lane7expiry${NUMBER}`, intro: "" },
    );
    id = made.body.id;
  }
  const caps = await request(
    "GET",
    "/v1/conversations/capabilities",
    owner.token,
  );
  await request("POST", "/v1/conversations/begin", owner.token, {
    creatorId: MAYA,
    policyVersion: caps.body.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: randomUUID(),
  });
  const sent = await say(owner.token, id, BEFORE);
  await request("POST", "/v1/identity/logout", owner.token);
  if (sent !== 200) throw new Error(`The thread must take a message: ${sent}`);
  return id;
})();
const THREAD = `/threads/${MAYA}/${fan}`;

// ------------------------------------------------------------- the app
const udid = () =>
  Object.values(
    JSON.parse(execFileSync("xcrun", ["simctl", "list", "-j", "devices"]))
      .devices,
  )
    .flat()
    .find(
      (d) =>
        d.name === (process.env.LANE7_IOS ?? "qelvora-lane7-ios") ||
        d.udid === process.env.LANE7_IOS,
    ).udid;
/** A launch through the proxy into the thread, signed in afresh as the fan,
 * or (iOS, `fresh` false) with the session and draft the app already holds. */
function launch(fresh = true) {
  if (platform === "ios") {
    try {
      execFileSync("xcrun", ["simctl", "terminate", udid(), BUNDLE]);
    } catch {
      /* it was not running */
    }
    execFileSync("xcrun", [
      "simctl",
      "launch",
      udid(),
      BUNDLE,
      "--api-url",
      origin,
      "--appearance",
      "light",
      ...(fresh ? ["--harness-reset", "--harness-actor", ACTOR] : []),
      "--return-to",
      THREAD,
    ]);
  } else {
    A.adb("reverse", `tcp:${port}`, `tcp:${port}`);
    A.adb("shell", "am", "force-stop", BUNDLE);
    A.adb(
      "shell",
      "am",
      "start",
      "-W",
      "-n",
      `${BUNDLE}/.MainActivity`,
      "--es",
      "api_url",
      `'${origin}'`,
      "--ez",
      "harness_reset",
      "true",
      "--es",
      "harness_actor",
      `'${ACTOR}'`,
      "--es",
      "return_to",
      THREAD,
    );
  }
}
/** The app's process, to tell that the thread stayed the one opened. */
const pid = () => {
  if (platform === "android")
    return A.adb("shell", "pidof", BUNDLE).trim() || null;
  const line = execFileSync(
    "xcrun",
    ["simctl", "spawn", udid(), "launchctl", "list"],
    { encoding: "utf8" },
  )
    .split("\n")
    .find((l) => l.includes(`UIKitApplication:${BUNDLE}[`));
  return line ? line.trim().split(/\s+/u)[0] : null;
};
/** Encrypted draft files the app keeps for its threads. */
function drafts() {
  if (platform === "android")
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
const flow = (id, extra = {}) =>
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
          LANE7_EXPIRY_DRAFT: DRAFT,
          ...extra,
        },
      },
    );
    child.on("close", (code) => resolve(code === 0));
  });
async function typeDraft() {
  if (platform === "android") {
    await A.tap("Message Maya's AI", 30000);
    A.type(DRAFT);
    await A.waitFor(DRAFT, 10000);
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
    return Boolean(await A.waitFor(DRAFT, 5000));
  }
  return flow("E1");
}
const screen = (name) => L.screenText(platform, name);
const denials = (text) =>
  text
    .split("\n")
    .filter((t) => DENIALS.test(t))
    .join(" | ");

// ------------------------------------------------------------- the runs
const opened = Date.now();
launch();
const signedIn = await waitForEntry(
  opened,
  { method: "POST", path: "/v1/identity/complete", status: 200 },
  60000,
);
const ready = await L.waitForText(
  platform,
  new RegExp(`${pattern(BEFORE).source}|${AI_ROW.source}`, "mu"),
  60000,
);
if (!signedIn || !ready.ok)
  throw new Error(`The thread did not open: ${ready.text.slice(0, 300)}`);
await waitForEntry(opened, { method: "WS", status: 101 }, 30000);
const before = pid();
const typed = await typeDraft();
let process0 = pid();
// If XCTest's runner ends the app with E1, it opens again with the session and
// the saved draft it holds, and the thread is kept open from there.
const relaunched = platform === "ios" && process0 !== before;
if (relaunched) {
  launch(false);
  await L.waitForText(platform, pattern(DRAFT), 60000);
  process0 = pid();
}
let saved = 0;
for (let until = Date.now() + 15000; Date.now() < until && !saved; )
  if (!(saved = drafts())) await L.sleep(500);
L.step(
  platform,
  `${mode}: the thread is open with a typed draft, saved`,
  typed && saved > 0 && Boolean(process0),
  `${saved} draft file(s)${relaunched ? "; E1's runner ended the app, so it was opened again with its saved draft" : "; the same app process as before the draft"}`,
);
L.screenshot(platform, `stack-expiry-${mode}-before`);

if (mode === "expiry") {
  // The token the app signed in with expires 15 minutes after sign-in. Wait
  // it out, looking at the thread every half minute.
  const expiresAt = signedIn.at + 15 * 60_000;
  let denial = "";
  for (;;) {
    await L.sleep(30_000);
    const closes = await since(opened, { method: "CLOSE" });
    denial ||= denials(screen("expiry-wait"));
    if (closes.length || denial || Date.now() > expiresAt + 60_000) break;
  }
  const renewal = await waitForEntry(
    opened,
    { method: "CLOSE", status: 4401 },
    Math.max(0, expiresAt + 90_000 - Date.now()),
  );
  const refused = await since(opened, {
    method: "CLOSE",
    status: /^(1008|4403)$/u,
  });
  L.step(
    platform,
    "expiry: the gateway closed the live connection 4401 once the token's 15 minutes passed, never 1008",
    renewal?.reason === "session_renewal_required" &&
      renewal.at >= expiresAt &&
      !refused.length,
    `${shown(renewal)} ${renewal ? ((renewal.at - signedIn.at) / 60_000).toFixed(2) : "-"} min after sign-in; refused: ${refused.map(shown).join(", ") || "none"}`,
  );
  const refreshed = renewal
    ? await waitForEntry(
        renewal.at - 30_000,
        { method: "POST", path: "/v1/identity/refresh", status: 200 },
        15000,
      )
    : null;
  const reopened = renewal
    ? await waitForEntry(renewal.at, { method: "WS", status: 101 }, 15000)
    : null;
  L.step(
    platform,
    "expiry: the app renewed through its session check, then opened a new live connection",
    Boolean(refreshed && reopened && reopened.at >= refreshed.at),
    renewal && reopened && refreshed
      ? `refresh ${((refreshed.at - renewal.at) / 1000).toFixed(2)} s, new connection ${((reopened.at - renewal.at) / 1000).toFixed(2)} s after the close`
      : "",
  );
  await L.sleep(3000);
  const after = screen("expiry-after");
  L.step(
    platform,
    "expiry: the thread and the draft stay, with no denial",
    !denial &&
      threadShown(after) &&
      pattern(DRAFT).test(after) &&
      !DENIALS.test(after),
    denial ||
      denials(after) ||
      (pattern(BEFORE).test(after)
        ? "the marker message is in view"
        : "an AI row is in view"),
  );
  if (platform === "ios")
    L.step(
      platform,
      "expiry: the composer still holds exactly the draft (Lane7ExpiryFlows E2)",
      await flow("E2", { LANE7_EXPIRY_SEEN: BEFORE }),
    );
  const left = drafts();
  L.step(
    platform,
    "expiry: the same app process, and the draft still saved",
    pid() === process0 && left > 0,
    `${left} draft file(s)`,
  );
  L.screenshot(platform, "stack-expiry-after-renewal");
  // A message from another session, sent after the expiry: it reaches the
  // open thread through the new live connection (a frame, then the page read
  // the frame asks for), and the thread shows it. Both apps order rows by
  // createdAt, which the real API sends as PostgreSQL text that neither
  // parses, so a new row can land above the fold: look up the thread for it.
  const other = await signIn(NUMBER);
  const sentAt = Date.now();
  const sent = await say(other.token, fan, AFTER);
  const frame = await waitForEntry(sentAt, { method: "FRAME" }, 10000);
  const read = frame
    ? await waitForEntry(
        frame.at,
        { method: "GET", path: `/v1/conversations/${MAYA}/${fan}` },
        10000,
      )
    : null;
  let live = await L.waitForText(platform, pattern(AFTER), 15000);
  let scrolls = 0;
  for (; !live.ok && platform === "android" && scrolls < 8; scrolls += 1) {
    A.swipe(540, 700, 540, 1400);
    await L.sleep(700);
    const text = screen("find-after");
    live = { ok: pattern(AFTER).test(text), text };
  }
  L.step(
    platform,
    "expiry: a message sent from another session after it arrives live",
    sent === 200 && Boolean(frame && read) && live.ok,
    `a frame ${frame ? ((frame.at - sentAt) / 1000).toFixed(2) : "-"} s and the page read ${read ? ((read.at - sentAt) / 1000).toFixed(2) : "-"} s after the send; on screen${scrolls ? ` after ${scrolls} scroll(s) up the thread` : ""}`,
  );
  await request("POST", "/v1/identity/logout", other.token);
  L.screenshot(platform, "stack-expiry-live-after");
} else {
  // Sign in elsewhere as the same account, then end the thread from there.
  const other = await signIn(NUMBER);
  const from = Date.now();
  const ended =
    mode === "revoked"
      ? await request("POST", "/v1/identity/revoke-sessions", other.token)
      : await request("POST", "/v1/trust/blocks", other.token, {
          creatorId: MAYA,
          reason: "Lane 7 expiry check: a closed scope still ends the thread.",
          idempotencyKey: randomUUID(),
        });
  const closed = await waitForEntry(from, { method: "CLOSE" }, 10000);
  L.step(
    platform,
    `${mode}: the gateway still closes the live connection 1008, not 4401`,
    ended.status === 200 && closed?.status === 1008,
    `${mode === "revoked" ? "revoke-sessions" : "block"} ${ended.status}; ${shown(closed)} after ${closed ? ((closed.at - from) / 1000).toFixed(1) : "-"} s`,
  );
  let gone = screen("gone");
  for (
    let until = Date.now() + 15000;
    Date.now() < until && (threadShown(gone) || pattern(DRAFT).test(gone));
    gone = screen("gone")
  )
    await L.sleep(1000);
  L.step(
    platform,
    `${mode}: the thread and the draft are gone from the screen`,
    !threadShown(gone) && !pattern(DRAFT).test(gone),
    denials(gone),
  );
  if (mode === "revoked") {
    const out = await L.waitForText(platform, /Sign in to continue/u, 45000);
    L.step(
      platform,
      "revoked: the app signs out and says the session ended",
      out.ok && /session ended/iu.test(out.text),
      out.text
        .split("\n")
        .filter((t) => /ended/iu.test(t))
        .join(" | "),
    );
  } else {
    await L.sleep(35000);
    const still = screen("closed-after");
    L.step(
      platform,
      "closed: still signed in after the next session check",
      !/Sign in to continue/u.test(still) &&
        !(await since(from, { method: "POST", path: "/v1/identity/refresh" }))
          .length,
    );
    await request("POST", "/v1/identity/logout", other.token);
  }
  let left = drafts();
  for (let until = Date.now() + 10000; Date.now() < until && left; )
    if ((left = drafts())) await L.sleep(500);
  L.step(
    platform,
    `${mode}: the draft is discarded from the app's storage`,
    left === 0,
    `${left} draft file(s)`,
  );
  L.screenshot(platform, `stack-expiry-${mode}-after`);
}
// What passed through the proxy (methods, paths, statuses, close codes), next
// to the screenshots.
writeFileSync(
  join(
    process.env.LANE7_OUT ?? join(tmpdir(), "lane7-scenarios"),
    `stack-expiry-${platform}-${mode}-proxy.json`,
  ),
  JSON.stringify(await entries(), null, 1),
);
L.stop(platform);
proxy.kill();
L.finish();
