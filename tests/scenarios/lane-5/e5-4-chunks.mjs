// E5.1 / E5.4: a Note to 600 members is queued in chunks of at most 500, one
// notice per fan, none duplicated, none for outsiders. Block 3000-3999.
// Run: node tests/scenarios/lane-5/e5-4-chunks.mjs
import {
  closeDb,
  expect,
  finish,
  http,
  publishNote,
  runEffects,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 3000;
const MEMBERS = 600;
async function inBatches(count, size, work) {
  const out = [];
  for (let start = 0; start < count; start += size)
    out.push(
      ...(await Promise.all(
        Array.from({ length: Math.min(size, count - start) }, (_u, i) =>
          work(start + i),
        ),
      )),
    );
  return out;
}

const maya = await seedCreator(B, "maya_chunks", "Maya");
const tier = await seedTier(maya.id, "Kiln Club");
const members = await inBatches(MEMBERS, 20, async (n) => {
  const fan = await seedFan(B + 10 + n, `m${n}_chunks`);
  await seedMembership(maya.id, fan.id, tier);
  return fan;
});
await inBatches(20, 20, (n) => seedFan(B + 800 + n, `o${n}_chunks`));

const counts = async () =>
  (
    await sql(
      `SELECT (SELECT count(*) FROM growth.notification WHERE type='note')::int AS notices,
              (SELECT count(DISTINCT account_id) FROM growth.notification WHERE type='note')::int AS fans,
              (SELECT count(*) FROM growth.producer_relay WHERE envelope->>'type'='note')::int AS events`,
    )
  ).rows[0];

const started = Date.now();
const note = await publishNote(maya, "Six hundred of you, thank you.", {
  kind: "members",
});
await step(
  "E5.1-chunks",
  `a Note to ${MEMBERS} members is two events (500 and 100) and ${MEMBERS} notices`,
  async () => {
    expect(note.response.status === 200, `publish ${note.response.status}`);
    await waitFor(
      "all notices",
      async () => (await counts()).notices >= MEMBERS,
      120000,
    );
    const took = ((Date.now() - started) / 1000).toFixed(1);
    const sizes = (
      await sql(
        "SELECT jsonb_array_length(envelope->'recipients')::int AS n FROM growth.producer_relay WHERE envelope->>'type'='note' ORDER BY 1 DESC",
      )
    ).rows.map((r) => r.n);
    expect(sizes.join() === "500,100", `event sizes ${sizes}`);
    const c = await counts();
    expect(c.notices === MEMBERS && c.fans === MEMBERS, JSON.stringify(c));
    const outsiders = (
      await sql(
        "SELECT count(*)::int AS n FROM growth.notification n JOIN creator.fan_profile f ON f.account_id=n.account_id WHERE f.handle LIKE 'o%\\_chunks'",
      )
    ).rows[0].n;
    expect(outsiders === 0, `${outsiders} outsiders were told`);
    return `${MEMBERS} notices from events ${sizes} in ${took} s after publish`;
  },
);
await step(
  "E5.4-chunks-once",
  "running the work again, and after a simulated crash, changes nothing",
  async () => {
    const before = await counts();
    await Promise.all([runEffects(maya), runEffects(maya)]);
    await sql(
      "UPDATE creator.content_effect SET state='pending',result_ref=NULL WHERE content_id=$1 AND type='published'",
      [note.id],
    );
    await runEffects(maya);
    const after = await counts();
    expect(
      JSON.stringify(before) === JSON.stringify(after),
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    );
  },
);
await step(
  "E5.1-chunks-cap",
  "after 100 of the 600 mute Maya's Notes, the next Note is exactly one event of exactly 500",
  async () => {
    const results = await inBatches(100, 20, (n) =>
      http("POST", `/v1/content/${maya.id}/mute`, members[n].token, {
        muted: true,
      }),
    );
    expect(
      results.every((r) => r.status === 200),
      "a mute failed",
    );
    const second = await publishNote(maya, "Five hundred of you remain.", {
      kind: "members",
    });
    expect(second.response.status === 200, `publish ${second.response.status}`);
    await waitFor(
      "the second Note's notices",
      async () =>
        (
          await sql(
            "SELECT count(*)::int AS n FROM growth.notification n JOIN growth.producer_relay r ON r.id=n.event_id WHERE r.envelope->>'aggregateId'=$1",
            [second.id],
          )
        ).rows[0].n >= 500,
      120000,
    );
    await new Promise((r) => setTimeout(r, 2000));
    const sizes = (
      await sql(
        "SELECT jsonb_array_length(envelope->'recipients')::int AS n FROM growth.producer_relay WHERE envelope->>'aggregateId'=$1",
        [second.id],
      )
    ).rows.map((r) => r.n);
    expect(sizes.join() === "500", `event sizes ${sizes}`);
    const mutedTold = (
      await sql(
        "SELECT count(*)::int AS n FROM growth.notification n JOIN growth.producer_relay r ON r.id=n.event_id JOIN creator.fan_profile f ON f.account_id=n.account_id WHERE r.envelope->>'aggregateId'=$1 AND f.handle ~ '^m[0-9]{1,2}_chunks$' AND substring(f.handle from 2 for length(f.handle)-8)::int < 100",
        [second.id],
      )
    ).rows[0].n;
    expect(mutedTold === 0, `${mutedTold} muted members were told`);
    return "one event of 500; the 100 who muted were left out";
  },
);
await closeDb();
process.exit(finish());
