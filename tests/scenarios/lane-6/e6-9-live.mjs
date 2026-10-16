// E6.9 part 2: with no polling, updates still arrive and role changes apply at once.
// Maya's owner (development actor three) and a team member (actor two) in Chrome at
// 390 px; a fan (actor one) through the real API. Fakes: the development identity,
// the model fake, and team rows standing in for lane 1's invitation.
//   node tests/scenarios/lane-6/e6-9-live.mjs
import * as L from "./e6-9-lib.mjs";
const { step, expect, until, hidden, MAYA, WEB } = L;
const fan = await L.stackFan();
const browser = await L.launch();
const owner = await L.phone(browser);
const A = owner.page;
await L.team(2, ["triage"]);
await L.signIn(A, 3, `/studio/${MAYA}/threads/${fan.id}`);
const member = await L.phone(browser);
const B = member.page;
await L.signIn(B, 2, `/studio/${MAYA}/notes`);

await step("E6.9-2", "a fan's message reaches an open thread", async () => {
  await A.goto(`${WEB}/studio/${MAYA}/threads/${fan.id}`);
  await until(A, async () => !(await hidden(A)), 30_000, "thread shown");
  await A.waitForTimeout(3_000);
  const text = `E6.9 live ${L.run} ${Date.now()}`;
  await A.evaluate(() => (window.e69 = "same page"));
  await fan.say(text);
  const ms = await until(
    A,
    () => A.getByText(text).isVisible(),
    10_000,
    "the message",
  );
  expect(
    (await A.evaluate(() => window.e69)) === "same page",
    "the page reloaded",
  );
  return `shown after ${ms} ms, same page (no reload)`;
});
await step("E6.9-3", "Team shows a member added, then removed", async () => {
  await A.goto(`${WEB}/studio/${MAYA}/team`);
  await A.locator(".w5-team-member").first().waitFor();
  await A.waitForTimeout(3_000);
  const name = `@${fan.handle}`;
  await L.team(1, ["drafter"]);
  const added = await until(
    A,
    () =>
      A.locator(".w5-team-member", { hasText: name })
        .locator("p", { hasText: /^drafter$/u })
        .isVisible(),
    8_000,
    "the new member",
  );
  await L.team(1, null);
  const removed = await until(
    A,
    () =>
      A.locator(".w5-team-member", { hasText: name })
        .locator("p", { hasText: /^Removed$/u })
        .isVisible(),
    8_000,
    "the removal",
  ).catch(async (e) => {
    const row = await A.locator(".w5-team-member", { hasText: name })
      .innerText()
      .catch(() => "(no row)");
    throw new Error(`${e.message}; row: ${row.replace(/\s+/gu, " ")}`);
  });
  return `added after ${added} ms, removal shown after ${removed} ms`;
});
await step(
  "E6.9-4",
  "a removed team member's Studio hides within 5 s",
  async () => {
    await B.getByText(/^REPLIES ·/u).waitFor({ timeout: 30_000 });
    await until(B, async () => !(await hidden(B)), 30_000, "member Studio");
    await B.waitForTimeout(2_000);
    await L.team(2, null);
    const ms = await until(
      B,
      () => B.getByText("Studio unavailable").isVisible(),
      5_000,
      "Studio unavailable",
    );
    const leaked = await B.locator(".w5-replies, .w5-note-list").count();
    expect(!leaked, `${leaked} private sections still in the page`);
    return `hidden after ${ms} ms; no Notes or replies left in the page`;
  },
);
await step(
  "E6.9-5",
  "a restored, then changed role applies without a reload",
  async () => {
    await L.team(2, ["triage"]);
    const back = await until(
      B,
      () => B.locator(".w5-replies").isVisible(),
      8_000,
      "replies for triage",
    );
    await L.team(2, ["drafter"]);
    const gone = await until(
      B,
      async () =>
        !(await B.locator(".w5-replies").count()) &&
        (await B.locator("h1:text-is('Notes')").isVisible()),
      8_000,
      "replies hidden for drafting",
    );
    return `back after ${back} ms; replies gone ${gone} ms after the change`;
  },
);
await step(
  "E6.9-10",
  "the stream refuses a signed-out visitor and unknown input",
  async () => {
    const out = await browser.newContext();
    const r = await out.request.get(`${WEB}/api/studio/live?creator=${MAYA}`);
    const odd = await A.request.get(
      `${WEB}/api/studio/live?creator=${MAYA}&x=1`,
    );
    const bad = await A.request.get(`${WEB}/api/studio/live?view=thread`);
    await out.close();
    expect(r.status() === 401, `signed out ${r.status()}`);
    expect(odd.status() === 404, `unknown parameter ${odd.status()}`);
    expect(bad.status() === 400, `invalid view ${bad.status()}`);
    return `signed out 401, unknown parameter 404, a thread without a fan 400`;
  },
);
await L.team(2, null);
await L.finish(browser);
