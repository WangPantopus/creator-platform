// E5.2 / E5.3 (reactions): the fan whose reply Maya reacted to is told, and only
// that fan, without any of anyone's reply text. Block 2400-2599.
// Run: node tests/scenarios/lane-5/e5-4-reaction-notices.mjs
import {
  allowReply,
  blockFan,
  clearPushes,
  closeDb,
  expect,
  finish,
  http,
  inbox,
  key,
  publishNote,
  pushes,
  react,
  replyToNote,
  runEffects,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  setPreferences,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 2400;
const maya = await seedCreator(B, "maya_e54r", "Maya");
const kiln = await seedTier(maya.id, "Kiln Club");
const f = {};
for (const [i, name] of ["ana", "ben", "cy", "dan"].entries()) {
  f[name] = await seedFan(B + 10 + i, `${name}_e54r`);
  await seedMembership(maya.id, f[name].id, kiln);
}
// ana, ben and dan turn push on; cy never does.
for (const name of ["ana", "ben", "dan"]) await setPreferences(f[name]);
const ANA = "crackle-secret-ANA cone six";
const BEN = "breaker-secret-BEN help";
const note = await publishNote(maya, "Thanks for firing with me.", {
  kind: "members",
});
const replies = {};
for (const [name, text] of [
  ["ana", ANA],
  ["ben", BEN],
  ["dan", "dan reply to a Note"],
])
  replies[name] = await replyToNote(f[name], maya.id, note.id, text);
for (const r of Object.values(replies)) await allowReply(r.replyId);
await waitFor(
  "the Note notices",
  async () =>
    (
      await sql(
        "SELECT count(*)::int AS n FROM growth.notification WHERE type='note'",
      )
    ).rows[0].n >= 4,
);
await new Promise((r) => setTimeout(r, 2500));
await clearPushes();

const reactionRows = async () =>
  (
    await sql(
      "SELECT a.handle,n.sender FROM growth.notification n JOIN creator.fan_profile a ON a.account_id=n.account_id WHERE n.type='reaction' ORDER BY 1",
    )
  ).rows;
const done = await react(
  maya,
  replies.ana.replyId,
  replies.ana.version,
  "heart",
);

await step(
  "E5.2-notice",
  "Ana is told 'Maya reacted to your reply'; nobody else is",
  async () => {
    expect(done.response.status === 200, `react ${done.response.status}`);
    await waitFor(
      "the reaction notice",
      async () => (await reactionRows()).length >= 1,
    );
    const rows = await reactionRows();
    expect(
      rows.length === 1 && rows[0].handle === "ana_e54r",
      JSON.stringify(rows),
    );
    expect(
      rows[0].sender === "Maya reacted to your reply",
      `sender ${rows[0].sender}`,
    );
    const item = (await inbox(f.ana)).find((n) => n.type === "reaction");
    expect(
      item && item.available && item.authorKind === "human_reaction",
      JSON.stringify(item),
    );
    expect(item.destination === "/creators/maya_e54r/chat", item.destination);
    for (const other of ["ben", "cy", "dan"])
      expect(
        !(await inbox(f[other])).some((n) => n.type === "reaction"),
        `${other} was told`,
      );
  },
);
await step(
  "E5.3-reaction-push",
  "the push says what happened and nothing of anyone's reply, and never 'replied'",
  async () => {
    await waitFor("the push", async () => (await pushes()).length >= 1);
    await new Promise((r) => setTimeout(r, 2000));
    const sent = await pushes();
    expect(sent.length === 1, `pushes ${sent.length}`);
    const p = sent[0];
    expect(
      p.sender === "Maya reacted to your reply" &&
        p.authorship === "human" &&
        p.destination === "/creators/maya_e54r/chat",
      JSON.stringify(p),
    );
    const everything = JSON.stringify([
      sent,
      ...(await Promise.all(Object.values(f).map((x) => inbox(x)))),
    ]);
    for (const secret of ["crackle", "cone six", "breaker", "dan reply"])
      expect(
        !everything.includes(secret),
        `"${secret}" leaked into a push or a notification list`,
      );
    expect(!/replied/u.test(JSON.stringify(sent)), "a push said replied");
  },
);
await step(
  "E5.2-once",
  "three effects runs at once, and a re-run after a simulated crash, notify once",
  async () => {
    await Promise.all([runEffects(maya), runEffects(maya), runEffects(maya)]);
    await sql(
      "UPDATE creator.content_effect SET state='pending',result_ref=NULL WHERE content_id=$1 AND type='reaction'",
      [replies.ana.replyId],
    );
    await runEffects(maya);
    await new Promise((r) => setTimeout(r, 2000));
    expect(
      (await reactionRows()).length === 1,
      "a duplicate notice was created",
    );
    expect((await pushes()).length === 1, "a duplicate push was sent");
  },
);
await step(
  "E5.2-withdrawn-reply",
  "when Ana withdraws her reply the notice leaves her list",
  async () => {
    const gone = await http(
      "POST",
      `/v1/content/${maya.id}/replies/${replies.ana.replyId}/withdraw`,
      f.ana.token,
      { version: replies.ana.version, idempotencyKey: key("w") },
    );
    expect(gone.status === 200, `withdraw ${gone.status}`);
    expect(
      !(await inbox(f.ana)).some((n) => n.type === "reaction"),
      "the notice is still listed for a withdrawn reply",
    );
  },
);
await step(
  "E5.2-denied-fan",
  "a fan who is blocked when Maya reacts is not told",
  async () => {
    await blockFan(f.dan, maya.id);
    const out = await react(
      maya,
      replies.dan.replyId,
      replies.dan.version,
      "thanks",
    );
    expect(out.response.status === 200, `react ${out.response.status}`);
    const effect = await waitFor(
      "the effect",
      async () =>
        (
          await sql(
            "SELECT state,result_ref FROM creator.content_effect WHERE content_id=$1 AND type='reaction' AND state='done'",
            [replies.dan.replyId],
          )
        ).rows[0],
    );
    expect(effect.result_ref.includes("denied"), `ref ${effect.result_ref}`);
    expect(
      (await reactionRows()).every((r) => r.handle !== "dan_e54r"),
      "the blocked fan was told",
    );
  },
);
await closeDb();
process.exit(finish());
