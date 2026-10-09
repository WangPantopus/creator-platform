// E6.1 capture: walks every Studio step at 390 px in Light and Night in the installed Chrome and
// records, per shot, the screenshot, every /api call, console messages and the Tab order.
// node tests/scenarios/lane-6/e6-1-capture.mjs --out DIR [--web URL] [--api URL] [--only step,step] [--cadence]
// (the polling cadence is measured on full runs; --cadence adds it to a run limited with --only)
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { ID } from "./fixtures.mjs";
import { steps } from "./e6-1-steps.mjs";
import {
  CLOCK_START,
  pauseClock,
  record,
  settle,
  tabOrder,
} from "./e6-1-page.mjs";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? fallback : process.argv[at + 1];
};
const out = arg("out"),
  web = arg("web", "http://localhost:56462"),
  api = arg("api", "http://127.0.0.1:56463");
const only = process.argv.includes("--only") ? arg("only").split(",") : null;
if (!out) throw new Error("--out DIR is required");
const setMode = (mode) => fetch(`${api}/__mode?mode=${mode}`);

async function shoot(page, theme, step, shot, state, result) {
  const file = `${theme}-${step.id}-${shot.name}.png`;
  await page.evaluate(() => window.scrollTo(0, 0));
  const png = await page.screenshot({
    fullPage: true,
    animations: "disabled",
    caret: "hide", // a blinking caret is a different pixel run to run
  });
  await writeFile(`${out}/${file}`, png);
  const requests = state.entries.splice(0).map((e) => ({ ...e }));
  const entry = {
    key: `${theme}/${step.id}/${shot.name}`,
    png: file,
    sha256: createHash("sha256").update(png).digest("hex"),
    first: step.shots[0] === shot,
    requests,
    console: state.console.splice(0),
  };
  entry.tabs = await tabOrder(page);
  // Leaving and re-entering the page with Tab makes Studio refresh; wait it out so the next action
  // does not land while that refresh holds Studio's one-action-at-a-time gate (it would be dropped).
  await settle(page, state, 500);
  // Calls and messages made while pressing Tab belong to no shot.
  state.entries.length = 0;
  state.console.length = 0;
  result.shots.push(entry);
  console.log(`ok ${theme} ${step.id}/${shot.name}  ${requests.length} calls`);
}
// Polling cadence, exactly: 20 s of page time in one-second steps. A changed interval changes a count.
async function cadence(page, state) {
  await page.goto(`${web}${steps.find((s) => s.id === "notes-owner").url}`);
  state.last = Date.now();
  await settle(page, state);
  await pauseClock(page);
  state.entries.length = 0;
  for (let second = 0; second < 20; second++) {
    await page.clock.runFor(1000);
    await settle(page, state, 150);
  }
  const counts = {};
  for (const e of state.entries) counts[e.call] = (counts[e.call] ?? 0) + 1;
  return counts;
}
const waitFor = (page, what) =>
  !what
    ? undefined
    : typeof what === "function"
      ? what(page)
      : page.getByText(what).first().waitFor({ timeout: 20000 });
async function runShot(page, theme, step, shot, state) {
  try {
    if (shot.setMode) {
      await waitFor(page, shot.loaded);
      await settle(page, state);
      await setMode(shot.setMode);
    }
    await shot.act?.(page);
    // What an action sets off (a read, a re-render) may start a moment later: count the quiet from now.
    state.last = Date.now();
    await waitFor(page, shot.ready);
    await settle(page, state);
    if (!state.paused) {
      await pauseClock(page);
      state.paused = true;
    }
  } catch (error) {
    const text = await page.evaluate(() => document.body.innerText);
    console.log(
      `FAILED ${theme} ${step.id}/${shot.name}: ${error.message.split("\n")[0]}\n${text.slice(0, 600)}`,
    );
    await page.screenshot({
      path: `${out}/failed-${theme}-${step.id}-${shot.name}.png`,
      fullPage: true,
    });
    throw error;
  }
}

// Compile every route before measuring. In `next dev` the first call to a route can take seconds, long
// enough for the clock to run on and a 4-second poll to land in a step's first shot.
async function warmUp() {
  const [maya, fan] = [ID.maya, ID.fanB];
  const headers = {
    Cookie: `qelvora_session_${new URL(web).port}=fixture-token`,
  };
  for (const path of [
    "/studio/workspace",
    `/studio/${maya}/notes`,
    "/api/platform/identity/session",
    "/api/studio/session",
    `/api/content/${maya}/studio`,
    `/api/commerce-approvals/creators/${maya}/fans/${fan}/drafts`,
    `/api/w6/creators/${maya}/call-availability`,
  ])
    await fetch(`${web}${path}`, { headers }).catch(() => {});
}
await warmUp();

await mkdir(out, { recursive: true });
// Software rendering and a fixed colour profile keep pixels the same from run to run.
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--disable-gpu", "--force-color-profile=srgb", "--disable-lcd-text"],
});
const result = { chrome: browser.version(), web, shots: [], cadence: {} };
// One browser context per step: its own cookies, sessionStorage and fake clock, so no step can
// inherit another's paused time.
const newPage = async (theme) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: theme === "night" ? "dark" : "light",
    reducedMotion: "reduce",
  });
  await context.addCookies([
    {
      name: `qelvora_session_${new URL(web).port}`,
      value: "fixture-token",
      url: web,
    },
  ]);
  // Next's development "N Issues" badge floats over the page and is not part of the product.
  await context.addInitScript(() =>
    addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal{display:none!important}";
      document.head.append(style);
    }),
  );
  const page = await context.newPage();
  const state = record(page);
  await page.clock.install({ time: CLOCK_START });
  return { context, page, state };
};
for (const theme of ["light", "night"]) {
  for (const step of steps.filter((s) => !only || only.includes(s.id))) {
    await setMode(step.mode ?? "default");
    const { context, page, state } = await newPage(theme);
    await page.goto(`${web}${step.url}`);
    state.last = Date.now();
    for (const shot of step.shots) {
      await runShot(page, theme, step, shot, state);
      await shoot(page, theme, step, shot, state, result);
    }
    await context.close();
  }
  if ((!only || process.argv.includes("--cadence")) && theme === "light") {
    await setMode("default");
    const { context, page, state } = await newPage(theme);
    result.cadence[theme] = await cadence(page, state);
    await context.close();
  }
}
await browser.close();
await setMode("default");
await writeFile(`${out}/result.json`, JSON.stringify(result, null, 2));
console.log(
  `captured ${result.shots.length} shots with Chrome ${result.chrome}`,
);
