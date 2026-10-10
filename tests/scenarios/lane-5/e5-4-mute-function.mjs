// E5.4: the Note mute projection. Only the creator who owns the Notes can ask
// which of her members muted them; it fails closed when missing; a team
// publisher can never finish a Note's notices with an empty audience.
// Block 3900-3999. Run: node tests/scenarios/lane-5/e5-4-mute-function.mjs
import { randomUUID } from "node:crypto";
import {
  asAccount,
  closeDb,
  expect,
  finish,
  http,
  inbox,
  publishNote,
  runEffects,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  signIn,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 3900;
const maya = await seedCreator(B, "maya_mute", "Maya");
const rival = await seedCreator(B + 1, "rival_mute", "Rival");
const tier = await seedTier(maya.id, "Kiln Club");
const f = {};
for (const [i, name] of ["ana", "ben", "cy", "dee", "eli"].entries()) {
  f[name] = await seedFan(B + 10 + i, `${name}_mute`);
  await seedMembership(maya.id, f[name].id, tier);
}
const mute = (fan, creator, muted = true) =>
  http("POST", `/v1/content/${creator.id}/mute`, fan.token, { muted });
// ana and dee mute Maya; cy mutes only the rival (who has no Notes to be heard).
for (const fan of [f.ana, f.dee]) await mute(fan, maya);
await mute(f.cy, rival);
const accounts = Object.values(f).map((x) => x.accountId);
const ask = (caller, creatorId, list) =>
  asAccount(
    caller,
    async (client) =>
      (
        await client.query(
          "SELECT creator.content_note_muters($1,$2::uuid[]) AS muted",
          [creatorId, list],
        )
      ).rows[0].muted,
  );

await step(
  "E5.4-mute-main",
  "Maya's session learns which of these accounts muted her Notes, and only those",
  async () => {
    const muted = await ask(maya.accountId, maya.id, accounts);
    expect(
      JSON.stringify(muted) ===
        JSON.stringify([f.ana.accountId, f.dee.accountId].sort()),
      `muted ${JSON.stringify(muted)}`,
    );
  },
);
await step(
  "E5.4-mute-wrong-person",
  "a fan, a rival creator, a signed-out caller and the wrong creator id all learn nothing",
  async () => {
    for (const [who, caller, creatorId] of [
      ["a member", f.ben.accountId, maya.id],
      ["a muted member about herself", f.ana.accountId, maya.id],
      ["the rival", rival.accountId, maya.id],
      ["no one signed in", null, maya.id],
      ["Maya asking as the rival's id", maya.accountId, rival.id],
    ])
      expect(
        (await ask(caller, creatorId, accounts)) === null,
        `${who} learned something`,
      );
  },
);
await step(
  "E5.4-mute-no-leak",
  "the database role behind it opens nothing else, and its scope is dropped after the call",
  async () => {
    await asAccount(maya.accountId, async (client) => {
      const direct = await client.query(
        "SELECT count(*)::int AS n FROM creator.content_preference",
      );
      expect(
        direct.rows[0].n === 0,
        `Maya read ${direct.rows[0].n} preference rows directly`,
      );
      await client.query("SELECT creator.content_note_muters($1,$2::uuid[])", [
        maya.id,
        accounts,
      ]);
      const left = (
        await client.query(
          "SELECT current_setting('content.mute_creator_id',true) AS v",
        )
      ).rows[0].v;
      expect(!left, `the creator scope was left set: ${left}`);
      const still = await client.query(
        "SELECT count(*)::int AS n FROM creator.content_preference",
      );
      expect(still.rows[0].n === 0, "rows became readable after the call");
    });
  },
);
await step("E5.4-mute-bounds", "zero, 500, 501 and a null entry", async () => {
  expect(
    JSON.stringify(await ask(maya.accountId, maya.id, [])) === "[]",
    "empty list",
  );
  const five = Array.from({ length: 500 }, () => randomUUID());
  expect(
    JSON.stringify(await ask(maya.accountId, maya.id, five)) === "[]",
    "500 accounts",
  );
  const over = await ask(maya.accountId, maya.id, [...five, randomUUID()]).then(
    () => "answered",
    (e) => e.message,
  );
  expect(
    over.includes("Invalid Note mute projection"),
    `501 accounts: ${over}`,
  );
  const nul = await asAccount(maya.accountId, (client) =>
    client.query("SELECT creator.content_note_muters($1,ARRAY[NULL]::uuid[])", [
      maya.id,
    ]),
  ).then(
    () => "answered",
    (e) => e.message,
  );
  expect(nul.includes("Invalid Note mute projection"), `null entry: ${nul}`);
});
await step(
  "E5.4-mute-missing-and-team",
  "with the function missing nothing is sent; a team publisher cannot finish the Note; the creator then does",
  async () => {
    await sql(
      "ALTER FUNCTION creator.content_note_muters(uuid,uuid[]) RENAME TO content_note_muters_off",
    );
    try {
      const note = await publishNote(
        maya,
        "A Note sent while the projection is missing.",
        { kind: "members" },
      );
      expect(note.response.status === 200, `publish ${note.response.status}`);
      const effect = () =>
        sql(
          "SELECT state,last_error FROM creator.content_effect WHERE content_id=$1 AND type='published'",
          [note.id],
        ).then((r) => r.rows[0]);
      await waitFor(
        "the blocked effect",
        async () => (await effect())?.state === "blocked",
      );
      expect(
        (await effect()).last_error === "content_delivery_unconfigured",
        `error ${(await effect()).last_error}`,
      );
      expect(
        (await sql("SELECT count(*)::int AS n FROM growth.notification"))
          .rows[0].n === 0,
        "a notice went out without the projection",
      );
      // A team publisher presses the Studio's run button.
      const team = await signIn(B + 50);
      await sql(
        "INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES($1,$2,ARRAY['publisher'])",
        [maya.id, team.accountId],
      );
      await sql(
        "UPDATE creator.content_effect SET next_at=now() WHERE content_id=$1",
        [note.id],
      );
      const ran = await http(
        "POST",
        `/v1/content/${maya.id}/studio/effects/run`,
        team.token,
        {},
      );
      expect(
        ran.status === 200,
        `team run ${ran.status} ${JSON.stringify(ran.body)}`,
      );
      const after = await effect();
      expect(
        after.state === "blocked" &&
          after.last_error === "creator_session_required",
        `team run left ${JSON.stringify(after)}`,
      );
      expect(
        (await sql("SELECT count(*)::int AS n FROM growth.notification"))
          .rows[0].n === 0,
        "the team session finished the Note",
      );
      // The projection returns; Maya's own run finishes it.
      await sql(
        "ALTER FUNCTION creator.content_note_muters_off(uuid,uuid[]) RENAME TO content_note_muters",
      );
      await sql(
        "UPDATE creator.content_effect SET next_at=now() WHERE content_id=$1",
        [note.id],
      );
      expect((await runEffects(maya)).status === 200, "creator run");
      const done = await effect();
      expect(
        done.state === "done",
        `after the creator's run ${JSON.stringify(done)}`,
      );
      await waitFor(
        "the notices",
        async () =>
          (await sql("SELECT count(*)::int AS n FROM growth.notification"))
            .rows[0].n >= 3,
      );
      const told = (
        await sql(
          "SELECT f.handle FROM growth.notification n JOIN creator.fan_profile f ON f.account_id=n.account_id ORDER BY 1",
        )
      ).rows.map((r) => r.handle.replace("_mute", ""));
      expect(told.join() === "ben,cy,eli", `told ${told.join()}`);
      expect(
        (await inbox(f.ben)).length === 1 && (await inbox(f.ana)).length === 0,
        "lists",
      );
    } finally {
      await sql(
        "DO $$ BEGIN IF to_regprocedure('creator.content_note_muters_off(uuid,uuid[])') IS NOT NULL THEN ALTER FUNCTION creator.content_note_muters_off(uuid,uuid[]) RENAME TO content_note_muters; END IF; END $$",
      );
    }
  },
);
await closeDb();
process.exit(finish());
