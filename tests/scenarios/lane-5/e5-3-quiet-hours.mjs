// E5.3: quiet hours are read in the fan's own time zone. A push inside a fan's
// quiet window is held and released later; one outside it goes out at once.
// Block 2900-2999. DST edges are not run: they need a clock fake.
// Run: node tests/scenarios/lane-5/e5-3-quiet-hours.mjs
import {
  clearPushes,
  closeDb,
  expect,
  finish,
  publishNote,
  pushes,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  setPreferences,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 2900;
const minutesIn = (zone) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  return (
    Number(parts.find((p) => p.type === "hour").value) * 60 +
    Number(parts.find((p) => p.type === "minute").value)
  );
};
/** A window an hour wide around the current minute of the day in `clockZone`,
 * read by the fan's preference in `timeZone`. */
const windowAround = (clockZone, timeZone) => {
  const m = minutesIn(clockZone);
  return {
    quietStart: (m + 1440 - 30) % 1440,
    quietEnd: (m + 30) % 1440,
    timeZone,
  };
};

const maya = await seedCreator(B, "maya_quiet", "Maya");
const kiln = await seedTier(maya.id, "Kiln Club");
const fans = {};
for (const [i, name] of ["utc", "auckland", "wrongzone"].entries()) {
  fans[name] = await seedFan(B + 10 + i, `${name}_quiet`);
  await seedMembership(maya.id, fans[name].id, kiln);
}
// Quiet around now in UTC / around now in Auckland / a window that is "now" in UTC
// but read in Auckland, twelve hours or more away from its own now.
await setPreferences(fans.utc, windowAround("UTC", "UTC"));
await setPreferences(
  fans.auckland,
  windowAround("Pacific/Auckland", "Pacific/Auckland"),
);
await setPreferences(fans.wrongzone, windowAround("UTC", "Pacific/Auckland"));
await clearPushes();
await publishNote(maya, "A quiet Note.", { kind: "members" });
const who = async () => {
  const sent = await pushes();
  const accounts = (
    await sql("SELECT account_id,handle FROM creator.fan_profile")
  ).rows;
  return sent
    .map((p) =>
      accounts
        .find((a) => a.account_id === p.accountId)
        .handle.replace("_quiet", ""),
    )
    .sort();
};

await step(
  "E5.3-quiet-zones",
  "only the fan whose own clock is outside the window is pushed now",
  async () => {
    await waitFor(
      "the outside-window push",
      async () => (await pushes()).length >= 1,
    );
    await new Promise((r) => setTimeout(r, 2500));
    const got = await who();
    expect(got.join() === "wrongzone", `pushed to ${got.join()}`);
    const held = (
      await sql(
        `SELECT f.handle,d.state,(d.available_at>now()+interval '10 minutes') AS later
       FROM growth.delivery d JOIN growth.notification n ON n.id=d.notification_id
       JOIN creator.fan_profile f ON f.account_id=n.account_id
       WHERE d.channel='push' ORDER BY 1`,
      )
    ).rows;
    const state = Object.fromEntries(
      held.map((r) => [
        r.handle.replace("_quiet", ""),
        `${r.state}${r.later ? " later" : ""}`,
      ]),
    );
    expect(
      state.utc === "queued later" && state.auckland === "queued later",
      JSON.stringify(state),
    );
    expect(state.wrongzone === "sent", JSON.stringify(state));
    return JSON.stringify(state);
  },
);
await step(
  "E5.3-quiet-release",
  "a held push is released once its fan's window is lifted; one still inside its window stays held",
  async () => {
    await setPreferences(fans.utc, { quietStart: null, quietEnd: null });
    await sql(
      "UPDATE growth.delivery SET available_at=now() WHERE channel='push' AND state='queued'",
    );
    await waitFor(
      "the released push",
      async () => (await who()).includes("utc"),
      20000,
    );
    await new Promise((r) => setTimeout(r, 2500));
    const got = await who();
    // Auckland's own window has not passed, so that push is deferred again.
    expect(got.join() === "utc,wrongzone", `pushed to ${got.join()}`);
    const held = (
      await sql(
        `SELECT count(*)::int AS n FROM growth.delivery d JOIN growth.notification n ON n.id=d.notification_id
       JOIN creator.fan_profile f ON f.account_id=n.account_id
       WHERE d.channel='push' AND d.state='queued' AND f.handle='auckland_quiet'`,
      )
    ).rows[0].n;
    expect(held === 1, `Auckland's push should still be held, held=${held}`);
    const twice = got.filter((name, i) => got.indexOf(name) !== i);
    expect(twice.length === 0, `pushed twice: ${twice}`);
  },
);
await closeDb();
process.exit(finish());
