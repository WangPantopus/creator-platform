// Cases that describe what a person should get and that this code does not yet
// deliver. They are kept, with their true expectation, so the gap stays visible
// and so the fix can be proved; they are NOT in run-all.sh's default list.
// Block 2600-2799. Run: node tests/scenarios/lane-5/e5-4-known-gaps.mjs
import {
  allowReply,
  clearPushes,
  closeDb,
  expect,
  finish,
  gateway,
  http,
  key,
  publishNote,
  pushes,
  react,
  replyToNote,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  setPreferences,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 2600;
const maya = await seedCreator(B, "maya_gap", "Maya");
const kiln = await seedTier(maya.id, "Kiln Club");
const jon = await seedFan(B + 10, "jon_gap");
const ben = await seedFan(B + 11, "ben_gap");
for (const fan of [jon, ben]) {
  await seedMembership(maya.id, fan.id, kiln);
  await setPreferences(fan);
}

await step(
  "GAP-mute-push",
  "a member who muted Maya's Notes gets no push for a new Note",
  async () => {
    expect(
      (
        await http("POST", `/v1/content/${maya.id}/mute`, jon.token, {
          muted: true,
        })
      ).status === 200,
      "mute",
    );
    await clearPushes();
    await publishNote(maya, "A Note jon muted.", { kind: "members" });
    await waitFor("pushes", async () => (await pushes()).length >= 1);
    await new Promise((r) => setTimeout(r, 2000));
    const sent = await pushes();
    const jonPush = sent.filter((p) => p.accountId === jon.accountId);
    expect(
      jonPush.length === 0,
      `jon muted Notes and still got ${jonPush.length} push(es)`,
    );
  },
);
await step(
  "GAP-withdrawn-reply-push",
  "a reaction push is not sent after the fan withdrew the reply",
  async () => {
    const note = await publishNote(maya, "Reply to this one.", {
      kind: "members",
    });
    const reply = await replyToNote(
      ben,
      maya.id,
      note.id,
      "My question about glazes.",
    );
    await allowReply(reply.replyId);
    await new Promise((r) => setTimeout(r, 2500));
    await clearPushes();
    await gateway("down");
    await react(maya, reply.replyId, reply.version, "heart");
    await waitFor(
      "the failed first attempt",
      async () =>
        (
          await sql(
            "SELECT count(*)::int AS n FROM growth.delivery d JOIN growth.notification n ON n.id=d.notification_id WHERE n.type='reaction' AND d.channel='push' AND d.attempts>=1 AND d.state='queued'",
          )
        ).rows[0].n >= 1,
      30000,
    );
    await http(
      "POST",
      `/v1/content/${maya.id}/replies/${reply.replyId}/withdraw`,
      ben.token,
      { version: reply.version, idempotencyKey: key("w") },
    );
    await gateway("up");
    await sql(
      "UPDATE growth.delivery SET available_at=now() WHERE channel='push' AND state='queued'",
    );
    await new Promise((r) => setTimeout(r, 4000));
    const benPush = (await pushes()).filter(
      (p) => p.accountId === ben.accountId && p.sender.includes("reacted"),
    );
    expect(
      benPush.length === 0,
      `a reaction push went out for a withdrawn reply (${benPush.length})`,
    );
  },
);
await closeDb();
process.exit(finish());
