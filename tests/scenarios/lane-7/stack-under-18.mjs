// D-11 on lane 7's disposable real API and PostgreSQL (`stack up --growth`):
// how long after an account is flagged under 18 the app shows the adults-only
// state, on Home, in Maya's thread, and in the thread when only its live
// connection can meet the flag; and that the thread leaves nothing behind.
// The backend gives every refusal itself. A development account can't be
// flagged, so the flag points fan one's open sessions at the under-18
// development actor: the backend resolves a session's identity at every
// request and at the realtime gateway's 2-second check, refuses it as D-11
// and revokes it (sessions.ts). A loopback proxy between the app and the API
// logs each answer, and for the live-connection step holds every HTTP request
// with a session, so only the gateway can meet the flag.
//   LANE7_STACK_API=http://127.0.0.1:57501 LANE7_STACK_POSTGRES=qelvora-laned11-postgres \
//     node tests/scenarios/lane-7/stack-under-18.mjs ios|android [runs] [home|thread|live]
// LANE7_IOS names the simulator (a debug build: the proxy's origin is passed
// at launch), LANE7_ANDROID the emulator, LANE7_PROXY_PORT the proxy's port.
import http from "node:http";
import net from "node:net";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as A from "./android-ui.mjs";
import * as L from "./lib.mjs";
import { stackFlag } from "./stack-flag.mjs";

const platform = process.argv[2];
if (!["ios", "android"].includes(platform))
  throw new Error("Name the platform: ios or android.");
const runs = Number(process.argv[3] ?? 3);
const place = process.argv[4];
const api = process.env.LANE7_STACK_API ?? "http://127.0.0.1:56471";
const postgres = process.env.LANE7_STACK_POSTGRES ?? "qelvora-lane7-postgres";
const target = Number(new URL(api).port);
const port = Number(process.env.LANE7_PROXY_PORT ?? target + 6);
const origin = `http://127.0.0.1:${port}`;
const BUNDLE = "com.pantopus.qelvora";
const MAYA = "20000000-0000-4000-8000-000000000001";
const FAN_ONE = "10000000-0000-4000-8000-000000000001";
const TITLE = /This app is for adults/u;
const DRAFT = "lane7 under18 private draft";

// The flag: the backend's own D-11 refusal (stack-flag.mjs).
const flagAccount = stackFlag(postgres);
const flag = () => flagAccount(FAN_ONE);

// The proxy: the real API's answers, logged. `holding` parks every HTTP
// request that carries a session until release().
let entries = [];
let holding = false;
const held = [];
function forward(req, res, path) {
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: target,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${target}` },
    },
    async (reply) => {
      const chunks = [];
      for await (const chunk of reply) chunks.push(chunk);
      entries.push({
        at: Date.now(),
        method: req.method,
        path,
        status: reply.statusCode,
      });
      // Connection: close, as lane 7's other proxies (device checks, follow-up 12).
      res.writeHead(reply.statusCode, {
        ...reply.headers,
        connection: "close",
      });
      res.end(Buffer.concat(chunks));
    },
  );
  upstream.on("error", () => {
    res.writeHead(502, { connection: "close" });
    res.end();
  });
  req.pipe(upstream);
}
const proxy = http.createServer((req, res) => {
  const path = new URL(req.url, origin).pathname;
  if (holding && req.headers.authorization)
    held.push(() => forward(req, res, path));
  else forward(req, res, path);
});
function release() {
  holding = false;
  for (const go of held.splice(0)) go();
}
// The gateway's D-11 close: an unmasked close frame, 2 + 26 bytes, code 4403.
const CLOSE_4403 = Buffer.from([0x88, 28, 0x11, 0x33]);
proxy.on("upgrade", (req, socket, head) => {
  const path = new URL(req.url, origin).pathname;
  entries.push({ at: Date.now(), method: "WS", path, status: 101 });
  const upstream = net.connect(target, "127.0.0.1", () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2)
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.on("data", (chunk) => {
      if (chunk.includes(CLOSE_4403))
        entries.push({ at: Date.now(), method: "WS", path, status: 4403 });
      socket.write(chunk);
    });
    upstream.on("end", () => socket.end());
  });
  const close = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", close);
  socket.on("error", close);
});
await new Promise((resolve) => proxy.listen(port, "127.0.0.1", resolve));

// Fan one's conversation with Maya, which the stack's smoke check created.
async function call(method, path, body, token) {
  const response = await fetch(api + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response.json();
}
const begun = await call("POST", "/v1/identity/continue", {
  returnTo: "/home",
});
const signedIn = await call("POST", "/v1/identity/complete", {
  continuationId: begun.continuationId,
  code: "10000000-0000-4000-8000-000000000001",
});
const fan = signedIn.session?.fan?.id;
if (!fan) throw new Error("The stack's smoke check must have made fan one.");
await call("POST", "/v1/identity/logout", undefined, signedIn.token);
const THREAD = `/threads/${MAYA}/${fan}`;

const udid = () =>
  Object.values(
    JSON.parse(execFileSync("xcrun", ["simctl", "list", "-j", "devices"]))
      .devices,
  )
    .flat()
    .find((d) => d.name === (process.env.LANE7_IOS ?? "qelvora-lane7-ios"))
    .udid;
/** A fresh launch through the proxy, signed in as fan one when `fresh`. */
function launch(to, fresh) {
  if (platform === "ios") {
    const id = udid();
    try {
      execFileSync("xcrun", ["simctl", "terminate", id, BUNDLE]);
    } catch {
      /* it was not running */
    }
    execFileSync("xcrun", [
      "simctl",
      "launch",
      id,
      BUNDLE,
      "--api-url",
      origin,
      ...(fresh ? ["--harness-reset", "--harness-actor", "actor one"] : []),
      "--return-to",
      to,
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
      ...(fresh
        ? [
            "--ez",
            "harness_reset",
            "true",
            "--es",
            "harness_actor",
            "'actor one'",
          ]
        : []),
      "--es",
      "return_to",
      to,
    );
  }
}

// The app's Keychain items of this run, by name. The simulator's Keychain
// stores each item's account and service names as their SHA-1; this reads
// names only, never values. Another API origin's session is not this run's.
const sha1 = (value) =>
  createHash("sha1").update(value).digest("hex").toUpperCase();
const SERVICES = new Set(
  [
    `${BUNDLE}.identity-session.${createHash("sha256").update(origin).digest("hex")}`,
    `${BUNDLE}.conversation-resume`,
    `${BUNDLE}.conversation-offline`,
    `${BUNDLE}.conversation-drafts`,
  ].map(sha1),
);
const KEYCHAIN = Object.fromEntries(
  [
    "identity-session",
    "identity-route",
    "scoped-cursors",
    "current-key",
    "device-key",
  ].map((name) => [sha1(name), name]),
);
/** What the app keeps of a thread: draft files and the offline copy, files
 * that hold the thread's text, and the session, saved place and resume
 * cursor (the Keychain on iOS, the session and resume stores on Android). */
function saved() {
  const markers = ["Smoke check", DRAFT].map((m) => Buffer.from(m));
  if (platform === "ios") {
    const container = execFileSync(
      "xcrun",
      ["simctl", "get_app_container", udid(), BUNDLE, "data"],
      { encoding: "utf8" },
    ).trim();
    const support = join(container, "Library/Application Support");
    const drafts = join(support, `${BUNDLE}.conversation-drafts`);
    let hits = 0;
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (
          entry.isFile() &&
          markers.some((m) => readFileSync(file).includes(m))
        )
          hits += 1;
      }
    };
    walk(container);
    const keychain = execFileSync(
      "sqlite3",
      [
        `file:${join(homedir(), "Library/Developer/CoreSimulator/Devices", udid(), "data/Library/Keychains/keychain-2-debug.db")}?mode=ro`,
        `SELECT hex(acct) || ' ' || hex(svce) FROM genp WHERE agrp LIKE '%.${BUNDLE}'`,
      ],
      { encoding: "utf8" },
    )
      .split("\n")
      .map((row) => row.split(" "))
      .filter(([, service]) => SERVICES.has(service))
      .map(([account]) => KEYCHAIN[account] ?? "other");
    return {
      drafts: existsSync(drafts) ? readdirSync(drafts).length : 0,
      offline: existsSync(
        join(support, `${BUNDLE}.conversation-offline/snapshot.enc`),
      ),
      hits,
      keychain,
    };
  }
  const sh = (command) =>
    A.adb(
      "exec-out",
      "run-as",
      BUNDLE,
      "sh",
      "-c",
      `${command} 2>/dev/null; true`,
    ).trim();
  const count = (files) =>
    (
      sh(`cat ${files}`).match(
        /<(string|long|int|boolean|float|set) name=/gu,
      ) ?? []
    ).length;
  return {
    drafts: sh("ls no_backup/conversation-drafts").split(/\s+/u).filter(Boolean)
      .length,
    offline: sh("ls no_backup/conversation-offline.enc").length > 0,
    hits: Number(sh(`grep -rlF -e "Smoke check" -e "${DRAFT}" . | wc -l`) || 0),
    resume: count("shared_prefs/conversation-resume.xml"),
    session: count("shared_prefs/identity-session*.xml"),
  };
}
/** The adults-only state and nothing else: no retry, help, sign-in or tabs. */
function onlyAdults(text) {
  const extra = text
    .split("\n")
    .filter((t) =>
      /Retry|Crisis help|Sign in to continue|Your people|Discover|session is kept|Smoke check|Maya/u.test(
        t,
      ),
    );
  return {
    ok:
      /This app is available to adults aged 18 and over/u.test(
        text.replaceAll(/\s*\n\s*/gu, " "),
      ) && !extra.length,
    detail: extra.length ? `also shown: ${extra.join(" | ")}` : "",
  };
}

const places = [
  ["on Home", "/home", /Your people/u, "home"],
  ["in Maya's thread", THREAD, /Me and privacy/u, "thread"],
  ["in Maya's thread, HTTP held", THREAD, /Me and privacy/u, "live"],
].filter(([, , , id]) => !place || place === id);
for (const [where, to, ready, id] of places) {
  const results = [];
  for (let i = 0; i < runs; i += 1) {
    release();
    entries = [];
    launch(to, true);
    const opened = await L.waitForText(platform, ready, 60000);
    if (!opened.ok)
      throw new Error(`${where}: not open: ${opened.text.slice(0, 300)}`);
    const first = id === "thread" && i === 0;
    let before;
    if (first) {
      if (platform === "android") {
        await A.tap("Message Maya's AI", 30000);
        A.type(DRAFT);
      }
      // The thread leaves its place and resume cursor behind (and on Android
      // the draft). A local stack has no offline copy: its lease answers 503.
      const kept = (state) =>
        platform === "ios"
          ? ["identity-session", "identity-route", "scoped-cursors"].every(
              (name) => state.keychain.includes(name),
            )
          : state.drafts > 0 && state.resume > 0 && state.session > 0;
      before = saved();
      for (
        let until = Date.now() + 30000;
        !kept(before) && Date.now() < until;
        before = saved()
      )
        await L.sleep(500);
      L.step(
        platform,
        "before the flag the thread is saved: session, place, resume cursor" +
          (platform === "android" ? ", draft" : ""),
        kept(before),
        JSON.stringify(before),
      );
    }
    if (id === "live") {
      // The thread's live connection is open before the flag.
      for (
        let until = Date.now() + 30000;
        !entries.some((e) => e.method === "WS") && Date.now() < until;

      )
        await L.sleep(250);
      await L.sleep(3000);
    }
    // Each run flags the account at a different moment of the 30 s cycle.
    else await L.sleep(3000 + Math.round((i * 30000) / runs));
    entries = [];
    holding = id === "live";
    const from = Date.now();
    const sessions = flag();
    const shown = await L.waitForText(platform, TITLE, 45000);
    const screen = (Date.now() - from) / 1000;
    const refused = entries.find((e) => e.status === 403 || e.status === 4403);
    const parked = held.length;
    release();
    results.push({
      shown: shown.ok,
      screen,
      server: refused ? (refused.at - from) / 1000 : null,
      path: refused
        ? refused.status === 4403
          ? "the live connection, closed 4403"
          : `${refused.method} ${L.shape(refused.path)}`
        : "none",
    });
    if (!shown.ok) continue;
    if (id === "live")
      L.step(
        platform,
        `${where}, run ${i + 1}: only the live connection met the flag`,
        refused?.status === 4403 && !entries.some((e) => e.status === 403),
        `${sessions} session(s) flagged, ${parked} HTTP request(s) held`,
      );
    await L.sleep(1500);
    const only = onlyAdults(L.screenText(platform, "adults"));
    L.step(
      platform,
      `${where}, run ${i + 1}: the adults-only state, nothing else`,
      only.ok,
      only.detail,
    );
    if (first) {
      L.screenshot(platform, "stack-under-18-thread");
      const after = saved();
      L.step(
        platform,
        "nothing of the thread stays in the app's storage",
        !after.drafts &&
          !after.offline &&
          !after.hits &&
          !after.resume &&
          !after.session &&
          !after.keychain?.length,
        JSON.stringify(after),
      );
      // The session is gone too: a relaunch into the thread shows the welcome.
      launch(THREAD, false);
      const welcome = await L.waitForText(
        platform,
        /Sign in to continue/u,
        30000,
      );
      L.step(
        platform,
        "a relaunch into the thread shows the welcome, not the thread",
        welcome.ok && !/Smoke check|Me and privacy/u.test(welcome.text),
      );
    }
    if (id === "live" && i === 0) L.screenshot(platform, "stack-under-18-live");
  }
  L.step(
    platform,
    `under-18 ${where}: shown after ${results.map((r) => (r.shown ? `${r.screen.toFixed(1)} s` : "never")).join(", ")}`,
    results.every((r) => r.shown),
    `first refusal after ${results.map((r) => (r.server === null ? "none" : `${r.server.toFixed(1)} s (${r.path})`)).join(", ")}`,
  );
}
release();
L.stop(platform);
proxy.close();
L.finish();
