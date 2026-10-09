// Shared by the lane 7 scenario scripts: talk to the harness, start an app,
// read what a screen says on either platform, and report one line per step.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as android from "./android-ui.mjs";

const here = new URL(".", import.meta.url).pathname;
export const PORT = process.env.LANE7_PORT ?? "56473";
export const BASE = `http://127.0.0.1:${PORT}`;
const OUT = process.env.LANE7_OUT ?? join(tmpdir(), "lane7-scenarios");
mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function harness(method, path, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return response.json();
}
/** Requests after `since`; with a platform, only that app's (never the control calls). */
export const log = async (since = 0, platform) =>
  (await harness("GET", `/__harness/log?since=${since}&limit=1000`)).filter(
    (e) => !platform || e.client === platform,
  );
export const state = () => harness("GET", "/__harness/state");
export const shape = (path) =>
  path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu,
    ":id",
  );
/** Entries after `since` that match, e.g. { method: "POST", path: /complete/, status: 200, account: "devon" }. */
export const seen = (entries, match) =>
  entries.filter(
    (e) =>
      (!match.method || e.method === match.method) &&
      (!match.path || match.path.test(e.path)) &&
      (!match.status || e.status === match.status) &&
      (!match.account || e.account === match.account),
  );

export async function ensureHarness() {
  if (
    await fetch(`${BASE}/__harness/health`).then(
      (r) => r.ok,
      () => false,
    )
  )
    return () => {};
  const child = spawn(
    process.execPath,
    [join(here, "harness/server.mjs"), "--port", PORT],
    { stdio: "ignore" },
  );
  for (
    let i = 0;
    i < 50 &&
    !(await fetch(`${BASE}/__harness/health`).then(
      (r) => r.ok,
      () => false,
    ));
    i += 1
  )
    await sleep(100);
  return () => child.kill();
}

export function launch(platform, ...args) {
  const result = spawnSync(
    process.execPath,
    [join(here, "run-app.mjs"), platform, ...args],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(
      `launch ${platform} failed: ${result.stderr || result.stdout}`,
    );
}
export const stop = (platform) =>
  spawnSync(process.execPath, [join(here, "run-app.mjs"), "stop", platform]);

let ocrBinary;
/** The text on screen: the accessibility tree on Android, recognised text from a screenshot on iOS. */
export function screenText(platform, name = "screen") {
  if (platform === "android") return android.texts().join("\n");
  const file = screenshot(platform, name);
  ocrBinary ??= (() => {
    const binary = join(OUT, "ocr");
    if (!existsSync(binary))
      execFileSync("swiftc", ["-O", join(here, "ocr.swift"), "-o", binary]);
    return binary;
  })();
  // Recognition reads "AI" as "Al" and "·" as "•": put the words back.
  return execFileSync(ocrBinary, [file], { encoding: "utf8" })
    .replaceAll(/\bAl\b/gu, "AI")
    .replaceAll("•", "·");
}
export function screenshot(platform, name) {
  const file = join(OUT, `${platform}-${name}.png`);
  execFileSync(
    process.execPath,
    [join(here, "run-app.mjs"), "shot", platform, file],
    { stdio: "ignore" },
  );
  return file;
}
/** A sentence that wraps across two lines on screen still matches. */
const matches = (pattern, text) =>
  pattern.test(text) || pattern.test(text.replaceAll(/\s*\n\s*/gu, " "));

/** Waits until the screen says something that matches, or returns the last text. */
export async function waitForText(platform, pattern, timeoutMs = 12000) {
  const until = Date.now() + timeoutMs;
  let text = "";
  do {
    text = screenText(platform, "wait");
    if (matches(pattern, text)) return { ok: true, text };
    await sleep(1000);
  } while (Date.now() < until);
  return { ok: false, text };
}
/** Waits until the screen no longer says something that matches. */
export async function waitForAbsent(platform, pattern, timeoutMs = 15000) {
  const until = Date.now() + timeoutMs;
  let text = "";
  do {
    text = screenText(platform, "wait");
    if (!matches(pattern, text)) return { ok: true, text };
    await sleep(1000);
  } while (Date.now() < until);
  return { ok: false, text };
}
export async function waitForLog(since, match, timeoutMs = 12000, platform) {
  const until = Date.now() + timeoutMs;
  let entries = [];
  do {
    entries = await log(since, platform);
    if (seen(entries, match).length) return entries;
    await sleep(400);
  } while (Date.now() < until);
  return entries;
}

let failures = 0;
export const step = (platform, id, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${platform.padEnd(7)} ${id} ${detail}`);
};
export const finish = () => {
  console.log(failures ? `\n${failures} step(s) failed` : "\nall steps passed");
  process.exit(failures ? 1 : 0);
};
export const platforms = (arg) =>
  arg === "ios" || arg === "android" ? [arg] : ["ios", "android"];
