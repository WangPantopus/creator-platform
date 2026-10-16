// E6.9 part 1: what an open, idle Studio screen asks the server for. For each screen,
// sign in as Maya's owner, open it, wait until it shows content, then count every
// /api/ request the page starts over an idle window (default 30 s).
// Expected after WP 6.9: only the live stream's renewal (/api/studio/live, about
// one every 30 s) and lane 1's identity check, which is not Studio's.
//   node tests/scenarios/lane-6/e6-9-idle.mjs [--before]   (--before only reports)
//   LANE6_ONLY=notes,team limits the screens.
import * as L from "./e6-9-lib.mjs";
const { step, expect, MAYA, WEB } = L;
const IDLE = Number(process.env.LANE6_IDLE_MS ?? 30_000);
const before = process.argv.includes("--before");
const [fan] = await L.sql(
  "SELECT f.id FROM creator.fan_profile f JOIN creator.thread t ON t.fan_id=f.id AND t.creator_id=$1 ORDER BY f.handle LIMIT 1",
  [MAYA],
);
// Ready means the content behind each screen's access check is visible, not
// only its heading (the heading shows while the content is still hidden).
const screens = [
  ["notes", "text=REPLIES"],
  ["threads", "text=Show conversations"],
  [`threads/${fan.id}`, "textarea"],
  ["team", ".w5-team-member"],
  ["thanks", "text=No shared thanks yet"],
  ["requests", "h1:text-is('Requests')"],
];
const browser = await L.launch();
const { page } = await L.phone(browser);
const log = L.requestLog(page);
await L.signIn(page, 3, `/studio/${MAYA}/notes`);
const only = process.env.LANE6_ONLY?.split(",");
for (const [screen, ready] of [...screens, ["workspace", null]].filter(
  ([screen]) => !only || only.includes(screen.split("/")[0]),
)) {
  await step("E6.9-1", `idle ${screen}`, async () => {
    await page.goto(
      screen === "workspace"
        ? `${WEB}/studio/workspace`
        : `${WEB}/studio/${MAYA}/${screen}`,
    );
    await page
      .locator(ready ?? "a.w5-card")
      .first()
      .waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3_000);
    const from = Date.now();
    await page.waitForTimeout(IDLE);
    const seen = L.count(log, from);
    const perMinute = Math.round((seen.total * 60_000) / IDLE);
    // Lane 1's session boundary re-reads the session every 4 s on every signed-in
    // page (features/identity/session-boundary.tsx); it is reported, not Studio's.
    const other = Object.keys(seen.byPath).filter(
      (p) => p !== "/api/studio/live" && p !== "/api/platform/identity/session",
    );
    const visible = await page.evaluate(
      () => !document.querySelector(".w5-studio[hidden]"),
    );
    const report = `${perMinute}/min ${JSON.stringify(seen.byPath)}${visible ? "" : " (Studio hidden)"}`;
    if (!before) {
      expect(!other.length, `timed reads: ${report}`);
      expect((seen.byPath["/api/studio/live"] ?? 0) <= 2, report);
      expect(visible, `Studio hid while idle: ${report}`);
    }
    return report;
  });
}
await L.finish(browser);
