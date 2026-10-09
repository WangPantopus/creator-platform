// E5.4: a scheduled Note. Nobody sees or hears of it before its time; at its
// time the audience is told once, even when two runs race. Block 2800-2899.
// Run: node tests/scenarios/lane-5/e5-4-scheduled.mjs
import {
  closeDb,
  delay,
  expect,
  finish,
  http,
  inbox,
  saveDraft,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  signAndPublish,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 2800;
const maya = await seedCreator(B, "maya_sched", "Maya");
const kiln = await seedTier(maya.id, "Kiln Club");
const ana = await seedFan(B + 10, "ana_sched");
const ben = await seedFan(B + 11, "ben_sched");
await seedMembership(maya.id, ana.id, kiln);
await seedMembership(maya.id, ben.id, kiln);
const run = () =>
  http("POST", `/v1/content/${maya.id}/studio/scheduled/run`, maya.token, {});
const notices = async () =>
  (
    await sql(
      "SELECT count(*)::int AS n FROM growth.notification WHERE type='note'",
    )
  ).rows[0].n;

const id = crypto.randomUUID();
const dueAt = new Date(Date.now() + 6000).toISOString();
const draft = await saveDraft(
  maya,
  id,
  0,
  "Doors open at noon.",
  { kind: "members" },
  { scheduledAt: dueAt },
);
const signed = await signAndPublish(maya, id, draft.version, draft.document);

await step(
  "E5.4-scheduled-early",
  "before its time the Note is invisible, untold and a run publishes nothing",
  async () => {
    expect(signed.response.status === 200, `publish ${signed.response.status}`);
    expect(signed.response.body.state === "scheduled", "state");
    const early = await run();
    expect(
      early.status === 200 && early.body.published === 0,
      JSON.stringify(early.body),
    );
    const seen = await http(
      "GET",
      `/v1/content/${maya.id}/presence`,
      ana.token,
    );
    expect(seen.body.items.length === 0, "a scheduled Note was visible");
    expect((await notices()) === 0, "someone was told early");
  },
);
await step(
  "E5.4-scheduled-due",
  "at its time two runs at once publish it once and the audience is told once",
  async () => {
    await delay(Math.max(0, Date.parse(dueAt) - Date.now() + 500));
    const both = await Promise.all([run(), run()]);
    expect(
      both.every((r) => r.status === 200),
      `runs ${both.map((r) => r.status)}`,
    );
    const published = both.reduce((sum, r) => sum + r.body.published, 0);
    expect(published === 1, `published ${published} times`);
    await waitFor("the notices", async () => (await notices()) >= 2);
    await delay(2500);
    expect((await notices()) === 2, `notices ${await notices()}`);
    expect(
      (await run()).body.published === 0,
      "a later run published it again",
    );
    expect((await notices()) === 2, "a later run told them again");
    for (const fan of [ana, ben]) {
      const list = await inbox(fan);
      expect(
        list.length === 1 && list[0].preview.startsWith("Doors open"),
        JSON.stringify(list),
      );
    }
    const effects = (
      await sql(
        "SELECT count(*)::int AS n FROM creator.content_effect WHERE content_id=$1 AND type='published'",
        [id],
      )
    ).rows[0].n;
    expect(effects === 1, `published effects ${effects}`);
  },
);
await closeDb();
process.exit(finish());
