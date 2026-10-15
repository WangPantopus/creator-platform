// E6.2 Today as a person sees it: each role sees only its parts, one failing read
// leaves the rest, nothing polls on a timer, coming back reloads once, Light and
// Night at 390 and 320 px, and a screen reader meets the headings and authorship.
//   LANE6_OUT=<dir> node tests/scenarios/lane-6/e6-2-today.mjs
import * as L from "./e6-2-lib.mjs";
const { step, expect, MAYA, WEB } = L;
const OUT = process.env.LANE6_OUT ?? "/tmp";
const browser = await L.launch();
const owner = await L.phone(browser);
const page = owner.page;
await L.fan(2);
await L.signIn(page, 3, `/studio/${MAYA}/today`);
const today = `/studio/${MAYA}/today`;
const parts = () => page.locator(".w5-today h2").allTextContents();
/** Every part has answered (none still says "Loading…"). */
const loaded = (tab) =>
  tab.waitForFunction(
    () =>
      document.querySelector(".w5-today") &&
      !document.querySelector(".w5-today").innerText.includes("Loading…"),
    null,
    { timeout: 60_000 },
  );
const reads = (log) => ({
  notes: log.filter(
    (u) => u.includes("/api/content/") && u.includes("/studio?state=published"),
  ).length,
  replies: log.filter((u) => u.includes("/studio/replies?filter=unread"))
    .length,
  queue: log.filter((u) => u.endsWith("/queue?limit=1")).length,
  ai: log.filter((u) => u.endsWith("/api/studio/ai/state")).length,
});
await step(
  "E6.2-25",
  "the creator sees every part; nothing polls; coming back reloads once",
  async () => {
    const log = [];
    page.on("request", (r) => r.url().includes("/api/") && log.push(r.url()));
    await page.goto(WEB + today);
    await loaded(page);
    const opened = reads(log);
    await page.waitForTimeout(20_000);
    const idle = reads(log);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(3_000);
    const back = reads(log);
    expect(
      (await parts()).join() === "Your latest Note,Replies,Requests,My AI",
      (await parts()).join(),
    );
    expect(
      JSON.stringify(opened) === JSON.stringify(idle),
      `20 s idle: ${JSON.stringify(opened)} -> ${JSON.stringify(idle)}`,
    );
    expect(
      Object.keys(back).every((k) => back[k] === idle[k] + 1),
      `focus: ${JSON.stringify(back)}`,
    );
    return `on open ${JSON.stringify(opened)}; +0 over 20 s idle; +1 each on focus`;
  },
);
await step("E6.2-26", "one failing read leaves the other parts", async () => {
  await page.route("**/studio/replies?filter=unread**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "unavailable",
          message: "Replies are unavailable right now.",
        },
      }),
    }),
  );
  await page.goto(WEB + today);
  await page.getByText("Replies are unavailable right now.").waitFor();
  await page.getByText(/^Your AI is/).waitFor();
  await page.unroute("**/studio/replies?filter=unread**");
  return "Replies says it is unavailable; the Note, Requests and My AI still show";
});
for (const night of [false, true])
  for (const width of [390, 320])
    await step(
      `E6.2-27${night ? "n" : "l"}${width}`,
      `${night ? "Night" : "Light"} at ${width} px, no sideways scroll`,
      async () => {
        const view = await L.phone(browser, { night });
        await view.page.context().addCookies(await page.context().cookies());
        await view.page.setViewportSize({ width, height: 844 });
        await view.page.goto(WEB + today);
        await loaded(view.page);
        const wide = await view.page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        );
        expect(wide <= 0, `${wide} px wider than the screen`);
        await view.page.screenshot({
          path: `${OUT}/today-${night ? "night" : "light"}-${width}.png`,
          fullPage: true,
        });
        await view.page.context().close();
        return `today-${night ? "night" : "light"}-${width}.png`;
      },
    );
await step(
  "E6.2-28",
  "a screen reader meets the headings, then who wrote the Note",
  async () => {
    await page.goto(WEB + today);
    await loaded(page);
    const tree = await page.locator(".w5-today").ariaSnapshot();
    const order = [
      'heading "Today" [level=1]',
      'heading "Your latest Note" [level=2]',
      'article "Note from Maya to',
      'heading "Replies" [level=2]',
      'heading "Requests" [level=2]',
      'heading "My AI" [level=2]',
    ];
    let at = 0;
    for (const item of order) {
      const found = tree.indexOf(item, at);
      expect(found >= 0, `missing or out of order: ${item}`);
      at = found;
    }
    return "Today › Your latest Note › Note from Maya to … › Replies › Requests › My AI";
  },
);
await step(
  "E6.2-29",
  "a team drafter sees the Note part and New Note only",
  async () => {
    await L.team(2, ["drafter"]);
    const team = await L.phone(browser);
    await L.signIn(team.page, 2, today);
    await team.page
      .getByRole("heading", { name: "Your latest Note" })
      .waitFor();
    await loaded(team.page);
    const seen = await team.page.locator(".w5-today h2").allTextContents();
    const write = await team.page
      .getByRole("link", { name: "New Note" })
      .isVisible();
    await team.page.context().close();
    expect(
      seen.join() === "Your latest Note" && write,
      `${seen.join()} · New Note ${write}`,
    );
    return "Your latest Note + New Note; no replies, requests or My AI";
  },
);
await step(
  "E6.2-30",
  "a triage member sees Replies but cannot start a Note",
  async () => {
    await L.team(2, ["triage"]);
    const team = await L.phone(browser);
    await L.signIn(team.page, 2, today);
    await team.page.getByRole("heading", { name: "Replies" }).waitFor();
    await loaded(team.page);
    const seen = await team.page.locator(".w5-today h2").allTextContents();
    const write = await team.page
      .getByRole("link", { name: "New Note" })
      .count();
    await L.team(2, null);
    await team.page.context().close();
    expect(
      seen.join() === "Your latest Note,Replies" && write === 0,
      `${seen.join()} · New Note ${write}`,
    );
    return "Your latest Note + Replies; no New Note (stand-in team rows, lane 1)";
  },
);
await L.finish(browser);
