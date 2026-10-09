// Browser helpers for the E6.1 capture: record /api calls and console messages, wait for a page to
// go quiet, and walk the keyboard (Tab) order.
import { fixtureIds } from "./fixtures.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The page runs on Playwright's fake clock, started on a fixed date so "overdue" and "expires"
// do not depend on the day the check runs. It flows while a page loads, then is paused: polls and
// freshness timers fire only when a step advances the clock, so a poll can never land mid-tap.
export const CLOCK_START = new Date("2026-10-08T12:00:00.000Z");
export async function pauseClock(page) {
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 20);
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
// Random ids (idempotency keys, new draft ids) differ per run; fixture ids are kept as they are.
export const stable = (text) =>
  text.replace(UUID, (id) => (fixtureIds.has(id) ? id : "<uuid>"));

export function record(page) {
  const state = {
    entries: [],
    pending: new Map(),
    inflight: 0,
    last: Date.now(),
    console: [],
  };
  const done = (request) => {
    if (!state.pending.has(request)) return;
    state.inflight--;
    state.last = Date.now();
    request
      .response()
      .then(
        (r) =>
          state.pending.get(request) &&
          (state.pending.get(request).status = r?.status() ?? "aborted"),
      );
  };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith("/api/")) return;
    const h = request.headers();
    const entry = {
      call: stable(`${request.method()} ${url.pathname}${url.search}`),
      body: request.postData() ? stable(request.postData()) : null,
      headers: [
        h["x-expected-session-id"],
        h["x-qelvora-expected-account"],
      ].map((v) => (v ? stable(v) : null)),
    };
    state.pending.set(request, entry);
    state.entries.push(entry);
    state.inflight++;
    state.last = Date.now();
  });
  page.on("requestfinished", done);
  page.on("requestfailed", (request) => {
    if (state.pending.has(request))
      state.pending.get(request).status = "aborted";
    done(request);
  });
  page.on(
    "console",
    (m) =>
      ["error", "warning"].includes(m.type()) &&
      !/HMR|Fast Refresh|DevTools/.test(m.text()) &&
      state.console.push(`${m.type()}: ${stable(m.text()).slice(0, 160)}`),
  );
  page.on("pageerror", (e) =>
    state.console.push(`pageerror: ${stable(e.message).slice(0, 160)}`),
  );
  return state;
}

export async function settle(page, state, quiet = 800) {
  const start = Date.now();
  while (state.inflight > 0 || Date.now() - state.last < quiet) {
    if (Date.now() - start > 30000) throw new Error("page did not settle");
    await sleep(50);
  }
  await page.evaluate(() => document.fonts.ready);
}

export async function tabOrder(page) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    // Focusing <body> puts the keyboard's starting point at the top of the page, so every pass reads
    // the whole page in order instead of starting where the last click happened.
    document.body.tabIndex = -1;
    document.body.focus({ preventScroll: true });
    document.body.removeAttribute("tabindex");
    window.scrollTo(0, 0);
  });
  const seen = [];
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate((first) => {
      const e = document.activeElement;
      if (!e || e === document.body) return "end";
      const label =
        e.getAttribute("aria-label") ||
        e.labels?.[0]?.innerText ||
        e.innerText ||
        e.value ||
        e.placeholder ||
        "";
      const d = `${e.tagName.toLowerCase()}${e.type ? `:${e.type}` : ""}|${e.getAttribute("role") ?? ""}|${label.trim().replace(/\s+/g, " ").slice(0, 48)}|${e.closest("dialog") ? "dialog" : ""}`;
      return d === first ? "end" : d;
    }, seen[0] ?? null);
    if (stop === "end") break;
    seen.push(stop);
  }
  // Leaving the last stop parks focus on <body>, which arms Team's focus restoration after the next
  // poll (it scrolls the page mid-click). Step back in so every later action starts from a real control.
  if (await page.evaluate(() => document.activeElement === document.body))
    await page.keyboard.press("Shift+Tab");
  await page.evaluate(() => window.scrollTo(0, 0));
  return seen;
}
