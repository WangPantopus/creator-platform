// W5 interactive browser operator for MANUAL app operation. It is not a test
// suite: no assertions, not run by CI, nothing in it decides pass/fail.
// Why: when this Claude session is not displayed, the desktop app's Browser
// pane is hidden, document.hidden is true, and Studio correctly conceals
// private content ("Loading Studio…"). This operator drives headless Chromium
// (visibilityState "visible") with one isolated persistent profile per actor,
// so creator, two fans and team can be operated at once at 390/1280 in
// Light/Night. Each HTTP command performs exactly one interactive action.
// Start: BROWSERD_ROOT=<scratch dir> node browserd.mjs   (port 47905)
// Use:   curl -s -X POST 127.0.0.1:47905 -d '{"op":"open","actor":"fan1","url":"http://localhost:3005/..."}'
// Ops: open goto click fill focus type press wait text aria shot eval media
//      viewport offline net console clearlog focused close list.
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(
  process.env.BROWSERD_REPO_PACKAGE ??
    new URL("../../../../../../package.json", import.meta.url).pathname,
);
const { chromium } = require("@playwright/test");

const root = process.env.BROWSERD_ROOT;
const port = Number(process.env.BROWSERD_PORT ?? 47905);
const actors = new Map();

async function actor(name, options = {}) {
  let entry = actors.get(name);
  if (entry && !options.reset) return entry;
  if (entry) await entry.context.close().catch(() => {});
  const dir = path.join(root, "profiles", name);
  await mkdir(dir, { recursive: true });
  const context = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: options.viewport ?? { width: 390, height: 844 },
    deviceScaleFactor: options.scale ?? 2,
    colorScheme: options.colorScheme ?? "light",
    reducedMotion: options.reducedMotion ?? "no-preference",
    hasTouch: Boolean(options.touch),
    isMobile: Boolean(options.mobile),
    locale: "en-US",
    timezoneId: options.timezone ?? "America/Los_Angeles",
  });
  const page = context.pages()[0] ?? (await context.newPage());
  entry = { context, page, net: [], console: [] };
  const track = (p) => {
    p.on("request", (r) => {
      if (!/\/api\//u.test(r.url())) return;
      entry.net.push({ t: Date.now(), m: r.method(), u: r.url(), s: null });
      if (entry.net.length > 400) entry.net.shift();
    });
    p.on("response", (r) => {
      const hit = [...entry.net]
        .reverse()
        .find((x) => x.u === r.url() && x.s === null);
      if (hit) hit.s = r.status();
    });
    p.on("console", (m) => {
      entry.console.push(`[${m.type()}] ${m.text()}`.slice(0, 400));
      if (entry.console.length > 200) entry.console.shift();
    });
    p.on("pageerror", (e) => entry.console.push(`[pageerror] ${e.message}`));
  };
  track(page);
  context.on("page", (p) => track(p));
  actors.set(name, entry);
  return entry;
}

const visible = async (page) =>
  page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    return (main?.innerText ?? "").slice(0, 12000);
  });

async function run(cmd) {
  const a = cmd.actor ? await actor(cmd.actor, cmd) : null;
  const page = a?.page;
  const timeout = cmd.timeout ?? 8000;
  switch (cmd.op) {
    case "open":
      if (cmd.url) await page.goto(cmd.url, { waitUntil: "domcontentloaded" });
      return { url: page.url() };
    case "goto":
      await page.goto(cmd.url, { waitUntil: cmd.wait ?? "domcontentloaded" });
      return { url: page.url() };
    case "click":
      await page.locator(cmd.selector).first().click({ timeout });
      return { url: page.url() };
    case "fill":
      await page.locator(cmd.selector).first().fill(cmd.value, { timeout });
      return { ok: true };
    case "focus":
      await page.locator(cmd.selector).first().focus({ timeout });
      return { ok: true };
    case "type":
      await page.keyboard.type(cmd.text, { delay: cmd.delay ?? 10 });
      return { ok: true };
    case "press":
      await page.keyboard.press(cmd.key);
      return { ok: true };
    case "wait":
      if (cmd.selector)
        await page
          .locator(cmd.selector)
          .first()
          .waitFor({ state: cmd.state ?? "visible", timeout });
      else await page.waitForTimeout(Math.min(cmd.ms ?? 1000, 30000));
      return { url: page.url() };
    case "text":
      return { url: page.url(), text: await visible(page) };
    case "aria":
      return {
        url: page.url(),
        aria: (await page.locator(cmd.selector ?? "body").ariaSnapshot()).slice(
          0,
          cmd.max ?? 14000,
        ),
      };
    case "shot": {
      const file = path.join(root, "shots", cmd.name ?? `${Date.now()}.png`);
      await mkdir(path.dirname(file), { recursive: true });
      await page.screenshot({ path: file, fullPage: Boolean(cmd.full) });
      return { file };
    }
    case "eval":
      return { value: await page.evaluate(cmd.js) };
    case "media":
      await page.emulateMedia({
        colorScheme: cmd.colorScheme,
        reducedMotion: cmd.reducedMotion,
      });
      return { ok: true };
    case "viewport":
      await page.setViewportSize({ width: cmd.width, height: cmd.height });
      return { ok: true };
    case "offline":
      await a.context.setOffline(Boolean(cmd.value));
      return { ok: true };
    case "net":
      return { net: a.net.slice(-(cmd.n ?? 30)) };
    case "console":
      return { console: a.console.slice(-(cmd.n ?? 30)) };
    case "clearlog":
      a.net.length = 0;
      a.console.length = 0;
      return { ok: true };
    case "focused":
      return {
        value: await page.evaluate(() => {
          const e = document.activeElement;
          return e
            ? `${e.tagName.toLowerCase()} ${e.getAttribute("aria-label") ?? ""} ${(e.textContent ?? "").trim().slice(0, 80)} ${e.id ? "#" + e.id : ""}`
            : null;
        }),
      };
    case "close":
      await a.context.close();
      actors.delete(cmd.actor);
      return { closed: true };
    case "list":
      return { actors: [...actors.keys()] };
    default:
      throw new Error(`Unknown op ${cmd.op}`);
  }
}

createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const result = await run(JSON.parse(body || "{}"));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(error?.message ?? error) }));
  }
}).listen(port, "127.0.0.1", () =>
  process.stdout.write(`browserd on ${port}\n`),
);
