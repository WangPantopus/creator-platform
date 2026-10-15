// E6.2 an audience with nobody in it warns before signing, on the creator's own
// view only; the Note still publishes, and a member who joins later can read it.
// Membership rows stand in for lane 4's purchases and expiries.
//   node tests/scenarios/lane-6/e6-2-audience.mjs
import * as L from "./e6-2-lib.mjs";
const { step, expect, sql, MAYA, WEB } = L;

const browser = await L.launch();
const { page } = await L.phone(browser);
const [one, two] = [await L.fan(1), await L.fan(2)];
const maya = await L.apiSession(3);
await L.approvedProof();
await L.signIn(page, 3, `/studio/${MAYA}/today`);
await L.registerPasskey(page);
const audiences = (token) =>
  L.api("GET", `/v1/studio/${MAYA}/audiences`, token);
const warning = () => page.getByText("No one is in this audience right now.");
/** Open a new Note and wait until its audience options have answered. */
async function compose() {
  const catalog = page.waitForResponse((r) => r.url().includes("/audiences"));
  await page.goto(`${WEB}/studio/${MAYA}/compose?from=today`);
  await catalog;
}
const shown = async (expected, what) => {
  let visible;
  for (const deadline = Date.now() + 5_000; Date.now() < deadline; ) {
    visible = await warning().first().isVisible();
    if (visible === expected) return;
    await page.waitForTimeout(200);
  }
  expect(false, `${what}: warning ${visible ? "shown" : "not shown"}`);
};
// Nobody is a current member now, and fan 2 has no team role.
await L.endMemberships();
await L.team(2, null);
const empty = await L.tier("Empty");
const nobody = `Nobody yet ${L.run}`;
await step(
  "E6.2-18",
  "members with nobody in them warns, in the composer and the review",
  async () => {
    const r = await audiences(maya);
    expect(
      r.json?.members === "none" &&
        r.json.tiers.find((t) => t.id === empty)?.reach === "none",
      JSON.stringify(r.json).slice(0, 160),
    );
    await compose();
    await page.locator("#note-text").fill(nobody);
    await shown(true, "composer");
    if (process.env.LANE6_OUT)
      await page.screenshot({
        path: `${process.env.LANE6_OUT}/compose-no-members.png`,
      });
    await page.getByRole("button", { name: "Review and sign" }).click();
    await page
      .getByRole("dialog")
      .getByText("No one is in this audience right now.")
      .waitFor();
    await page.getByRole("button", { name: "Sign with your passkey" }).click();
    await page.waitForURL((u) => u.pathname.endsWith("/today"));
    const [row] = await sql(
      "SELECT i.id,i.state FROM creator.content_index i JOIN creator.content_revision r ON r.content_id=i.id AND r.version=i.version WHERE r.document->>'text'=$1",
      [nobody],
    );
    expect(row?.state === "published", `state ${row?.state}`);
    return "members: none; the warning shows twice; the Note still publishes";
  },
);
await step(
  "E6.2-19",
  "nobody sees it now; a member who joins later can read it",
  async () => {
    const before = (await L.presence(one.token)).items.some(
      (i) => i.text === nobody,
    );
    expect(!before, "fan 1 sees it without a membership");
    await L.member(two.id, await L.tier("Later"));
    const later = (await L.presence(two.token)).items.find(
      (i) => i.text === nobody,
    );
    expect(
      later?.authorLabel === "Maya · to all members",
      JSON.stringify(later)?.slice(0, 120),
    );
    return "fan 1 does not see it; fan 2 joins and sees it";
  },
);
const full = await L.tier("Full"),
  grace = await L.tier("Grace"),
  old = await L.tier("Old"),
  leaving = await L.tier("Leaving"),
  lapsed = await L.tier("Lapsed");
await L.member(one.id, full);
await L.member(two.id, grace, "grace", "1 second", "3 days"); // period over, grace and grant run on
await L.leave(await L.member(one.id, old));
await L.member(two.id, leaving, "cancelled");
await L.member(one.id, lapsed, "active", "30 days", "1 second"); // membership on, access grant over
await L.sleep(1500);
const reach = async () => {
  const r = (await audiences(maya)).json;
  return {
    members: r.members,
    ...Object.fromEntries(r.tiers.map((t) => [t.id, t.reach])),
  };
};
await step(
  "E6.2-20",
  "reach follows the membership rule (active, grace, cancelled until its end)",
  async () => {
    const r = await reach();
    const got = [r[full], r[grace], r[old], r[leaving], r[empty], r.members];
    expect(got.join() === "some,some,none,some,none,some", got.join());
    return "active some · grace some · ended none · cancelled-until-end some · empty none · members some";
  },
);
await step(
  "E6.2-21",
  "choosing tiers: the warning follows the selection",
  async () => {
    await compose();
    await page.locator("#note-text").fill(`Tier choice ${L.run}`);
    await shown(false, "all members");
    await page.getByRole("button", { name: "Tiers" }).click();
    await page.getByLabel(new RegExp(`^Empty ${L.run}$`)).check();
    await shown(true, "the empty tier");
    await page.getByLabel(new RegExp(`^Full ${L.run}$`)).check();
    await shown(false, "empty and full tiers");
    await page.getByRole("button", { name: "Followers" }).click();
    await shown(false, "followers (not readable here, so unknown)");
    return "empty tier warns; adding a tier with a member clears it; followers stay silent";
  },
);
await step(
  "E6.2-22",
  "a team drafter never sees member reach; fans and visitors are refused",
  async () => {
    await L.team(2, ["drafter"]);
    const team = (await audiences(two.token)).json;
    expect(
      team?.members === "unknown" &&
        team.tiers.every((t) => t.reach === "unknown"),
      JSON.stringify(team).slice(0, 160),
    );
    const [fan, out] = [
      await audiences(one.token),
      await L.api("GET", `/v1/studio/${MAYA}/audiences`),
    ];
    expect(
      fan.status === 403 && out.status === 401,
      `${fan.status} ${out.status}`,
    );
    return `team: members and every tier unknown; fan ${fan.status} ${fan.json?.error?.code}; signed out ${out.status}`;
  },
);
const sees = {};
await step(
  "E6.2-23",
  "the thread agrees with each answer (C4 read rule)",
  async () => {
    for (const [name, tierId, fan] of [
      ["Grace", grace, two],
      ["Leaving", leaving, two],
      ["Old", old, one],
      ["Lapsed", lapsed, one],
    ]) {
      const words = `To ${name} ${L.run}`;
      await compose();
      await page.locator("#note-text").fill(words);
      await page.getByRole("button", { name: "Tiers" }).click();
      await page.getByLabel(new RegExp(`^${name} ${L.run}$`)).check();
      await page.getByRole("button", { name: "Review and sign" }).click();
      await page
        .getByRole("button", { name: "Sign with your passkey" })
        .click();
      await page.waitForURL((u) => u.pathname.endsWith("/today"));
      sees[name] = (await L.presence(fan.token)).items.some(
        (i) => i.text === words,
      );
      void tierId;
    }
    expect(sees.Grace && sees.Leaving && !sees.Old, JSON.stringify(sees));
    return "grace and cancelled-until-end members see it; an ended member does not";
  },
);
await L.note(
  "E6.2-24",
  "known limit: a member whose access grant lapsed still counts",
  async () => {
    const r = await reach();
    return `reach ${r[lapsed]}; the Note to that tier was ${sees.Lapsed ? "seen" : "not seen"} by its only member (exact once W4's narrow count, migration 0155, is registered)`;
  },
);
await L.team(2, null);
await L.finish(browser);
