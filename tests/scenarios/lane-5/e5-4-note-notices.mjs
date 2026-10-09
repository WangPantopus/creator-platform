// E5.4 / E5.3 (Notes): who is told about a Note and what a push may say.
// Block 2100-2399. Fakes: the push gateway (records what APNs/FCM would get).
// Run: node tests/scenarios/lane-5/e5-4-note-notices.mjs
import {
  blockFan,
  clearPushes,
  closeDb,
  deleteFan,
  endMembership,
  expect,
  finish,
  gateway,
  http,
  inbox,
  publishNote,
  pushes,
  restrictFan,
  runEffects,
  saveDraft,
  seedCreator,
  seedFan,
  seedMembership,
  seedTier,
  setPreferences,
  signAndPublish,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 2100;
const maya = await seedCreator(B, "maya_e54", "Maya");
const kiln = await seedTier(maya.id, "Kiln Club");
const f = {};
const members = [
  "ana",
  "ben",
  "cy",
  "eve",
  "fay",
  "gus",
  "hal",
  "kim",
  "lee",
  "jon",
];
for (const [i, name] of [...members, "dee", "ivy"].entries())
  f[name] = await seedFan(B + 10 + i, `${name}_e54`);
const joined = {};
for (const name of members)
  joined[name] = await seedMembership(maya.id, f[name].id, kiln);
// Push is off for everyone until they turn it on (ben never does).
for (const name of [
  "ana",
  "cy",
  "eve",
  "fay",
  "gus",
  "hal",
  "kim",
  "lee",
  "jon",
  "dee",
  "ivy",
])
  await setPreferences(f[name], {
    ...(name === "cy" ? { hideSensitive: false } : {}),
    ...(name === "kim" ? { mutedCreators: [maya.id] } : {}),
    ...(name === "lee" ? { disabledPushTypes: ["note"] } : {}),
  });
// jon muted Maya's Notes in the content module before this Note is published.
expect(
  (
    await http("POST", `/v1/content/${maya.id}/mute`, f.jon.token, {
      muted: true,
    })
  ).status === 200,
  "jon could not mute",
);
await blockFan(f.eve, maya.id);
await deleteFan(f.fay);
await restrictFan(f.gus, maya.id);
await clearPushes();

const text = "Kiln opens Friday, members first. Bring a friend.";
const notified = async (type = "note") =>
  (
    await sql(
      "SELECT a.handle FROM growth.notification n JOIN creator.fan_profile a ON a.account_id=n.account_id WHERE n.type=$1 ORDER BY 1",
      [type],
    )
  ).rows.map((r) => r.handle.replace("_e54", ""));
const note = await publishNote(maya, text, { kind: "members" });
await waitFor(
  "the notices to be queued",
  async () => (await notified()).length >= 6,
);

await step(
  "E5.4-recipients",
  "only fans who may read the Note are told: not outsiders, blocked, deleted, restricted or muted",
  async () => {
    const got = await notified();
    expect(got.join() === "ana,ben,cy,hal,kim,lee", `notified ${got.join()}`);
    const effect = (
      await sql(
        "SELECT state,result_ref FROM creator.content_effect WHERE content_id=$1 AND type='published'",
        [note.id],
      )
    ).rows[0];
    expect(
      effect.state === "done" &&
        effect.result_ref.includes("eligible=6") &&
        effect.result_ref.includes("muted=1"),
      `effect ${JSON.stringify(effect)}`,
    );
    expect(
      !(await notified()).includes("jon"),
      "a member who muted Notes was told",
    );
    return `6 told of 10 members (1 muted); ${effect.result_ref.split(":").slice(2).join(":")}`;
  },
);
await step(
  "E5.4-inbox",
  "the fan's list shows the Note with its audience and the Note's opening words",
  async () => {
    const list = await inbox(f.ana);
    expect(list.length === 1, `ana's list has ${list.length}`);
    const item = list[0];
    expect(
      item.type === "note" &&
        item.available &&
        item.authorKind === "human_broadcast",
      JSON.stringify(item),
    );
    expect(item.sender === "Maya · to all members", `sender ${item.sender}`);
    expect(
      item.preview.startsWith("Kiln opens Friday"),
      `preview ${item.preview}`,
    );
    expect(
      item.destination === "/creators/maya_e54/chat",
      `destination ${item.destination}`,
    );
    for (const name of ["dee", "eve", "fay", "gus", "ivy"])
      expect(
        (await inbox(f[name]).catch(() => [])).length === 0,
        `${name} has a notice`,
      );
  },
);
await step(
  "E5.3-push",
  "push goes only to opted-in fans, names the audience, and carries no Note text",
  async () => {
    await waitFor("pushes", async () => (await pushes()).length >= 3);
    await new Promise((r) => setTimeout(r, 2500));
    const sent = await pushes();
    const who = (await sql("SELECT account_id,handle FROM creator.fan_profile"))
      .rows;
    const names = sent
      .map((p) =>
        who
          .find((w) => w.account_id === p.accountId)
          .handle.replace("_e54", ""),
      )
      .sort();
    expect(names.join() === "ana,cy,hal", `pushed to ${names.join()}`);
    for (const p of sent) {
      expect(
        p.channel === "push" &&
          p.sender === "Maya · to all members" &&
          p.authorship === "human",
        JSON.stringify(p),
      );
      expect(
        p.destination === "/creators/maya_e54/chat",
        `destination ${p.destination}`,
      );
      expect(
        !/Kiln opens|friend|replied/u.test(JSON.stringify(p)),
        `push leaked text or said replied: ${JSON.stringify(p)}`,
      );
    }
    const states = (
      await sql(
        "SELECT a.handle,d.state FROM growth.delivery d JOIN growth.notification n ON n.id=d.notification_id JOIN creator.fan_profile a ON a.account_id=n.account_id WHERE d.channel='push' ORDER BY 1",
      )
    ).rows.map((r) => `${r.handle.replace("_e54", "")}:${r.state}`);
    for (const expected of [
      "ana:sent",
      "ben:suppressed",
      "cy:sent",
      "hal:sent",
      "kim:suppressed",
      "lee:suppressed",
    ])
      expect(states.includes(expected), `delivery states ${states}`);
    return `pushed ana, cy, hal; suppressed ben (push off), kim (muted creator), lee (Notes off)`;
  },
);
await step(
  "E5.4-once",
  "the same cause never notifies twice: three effects runs at once change nothing",
  async () => {
    const before = (
      await sql("SELECT count(*)::int AS n FROM growth.notification")
    ).rows[0].n;
    const runs = await Promise.all([
      runEffects(maya),
      runEffects(maya),
      runEffects(maya),
    ]);
    expect(
      runs.every((r) => r.status === 200),
      `runs ${runs.map((r) => r.status)}`,
    );
    const after = (
      await sql("SELECT count(*)::int AS n FROM growth.notification")
    ).rows[0].n;
    const events = (
      await sql(
        "SELECT count(*)::int AS n FROM growth.producer_relay WHERE envelope->>'type'='note'",
      )
    ).rows[0].n;
    expect(
      after === before && events === 1,
      `notifications ${before} -> ${after}, events ${events}`,
    );
    // Pretend the first run died after queueing but before marking the effect done.
    await sql(
      "UPDATE creator.content_effect SET state='pending',result_ref=NULL WHERE content_id=$1 AND type='published'",
      [note.id],
    );
    await runEffects(maya);
    const again = (
      await sql("SELECT count(*)::int AS n FROM growth.notification")
    ).rows[0].n;
    expect(
      again === before,
      `a re-run after a simulated crash changed notifications ${before} -> ${again}`,
    );
  },
);
await step(
  "E5.4-edit-silent",
  "editing and republishing a Note does not notify again",
  async () => {
    const before = (
      await sql("SELECT count(*)::int AS n FROM growth.notification")
    ).rows[0].n;
    const draft = await saveDraft(maya, note.id, 1, `${text} (Doors at ten.)`, {
      kind: "members",
    });
    const v2 = await signAndPublish(
      maya,
      note.id,
      draft.version,
      draft.document,
    );
    expect(v2.response.status === 200, `republish ${v2.response.status}`);
    await waitFor(
      "the republish effect",
      async () =>
        (
          await sql(
            "SELECT result_ref FROM creator.content_effect WHERE content_id=$1 AND version=2 AND type='published' AND state='done'",
            [note.id],
          )
        ).rows[0],
    );
    const ref = (
      await sql(
        "SELECT result_ref FROM creator.content_effect WHERE content_id=$1 AND version=2 AND type='published'",
        [note.id],
      )
    ).rows[0].result_ref;
    expect(ref.includes("edit-silent"), `ref ${ref}`);
    expect(
      (await sql("SELECT count(*)::int AS n FROM growth.notification")).rows[0]
        .n === before,
      "an edit notified again",
    );
    const item = (await inbox(f.ana))[0];
    expect(
      item.preview.includes("Doors at ten"),
      `the list should show the current words: ${item.preview}`,
    );
  },
);
await step(
  "E5.4-joins-leaves",
  "a fan who joins later is not told; a fan who leaves stops seeing the notice",
  async () => {
    await seedMembership(maya.id, f.ivy.id, kiln);
    expect(
      (await inbox(f.ivy)).length === 0,
      "a late joiner was told about an old Note",
    );
    expect((await inbox(f.hal)).length === 1, "hal sees it before leaving");
    await endMembership(joined.hal.membership, joined.hal.grant);
    expect(
      (await inbox(f.hal)).length === 0,
      "hal still sees a notice after leaving",
    );
  },
);
await step(
  "E5.4-blocked-after",
  "a fan blocked after the notice still loads their list; that creator's rows are hidden",
  async () => {
    expect((await inbox(f.ben)).length === 1, "ben sees the notice first");
    await blockFan(f.ben, maya.id);
    const r = await http("GET", "/v1/growth/notifications", f.ben.token);
    expect(r.status === 200, `the list failed with ${r.status}`);
    expect(
      r.body.notifications.every((n) => n.creatorId !== maya.id),
      "a blocked creator's notice is still listed",
    );
  },
);
await step(
  "E5.4-failure-and-withdrawn",
  "a push that cannot be sent is retried once, and never sent for a Note withdrawn meanwhile",
  async () => {
    await clearPushes();
    await gateway("down");
    const kept = await publishNote(maya, "Studio sale on Saturday.", {
      kind: "members",
    });
    const gone = await publishNote(maya, "Oops, wrong date.", {
      kind: "members",
    });
    await waitFor(
      "both notices queued",
      async () =>
        (
          await sql(
            "SELECT count(*)::int AS n FROM growth.notification WHERE type='note'",
          )
        ).rows[0].n >= 12,
    );
    await waitFor(
      "every first attempt to fail",
      async () =>
        (
          await sql(
            "SELECT count(*)::int AS n FROM growth.delivery WHERE channel='push' AND state='queued' AND attempts>=1 AND last_error IS NOT NULL",
          )
        ).rows[0].n >= 6,
      30000,
    );
    const withdrawn = await http(
      "POST",
      `/v1/content/${maya.id}/${gone.id}/unpublish`,
      maya.token,
      { version: 1, idempotencyKey: `unpub-${gone.id}` },
    );
    expect(withdrawn.status === 200, `unpublish ${withdrawn.status}`);
    expect(
      (await pushes()).length === 0,
      "something was sent while the gateway was down",
    );
    await gateway("up");
    await sql(
      "UPDATE growth.delivery SET available_at=now() WHERE channel='push' AND state='queued'",
    );
    await waitFor(
      "retries",
      async () =>
        (
          await sql(
            "SELECT count(*)::int AS n FROM growth.delivery WHERE channel='push' AND state='queued'",
          )
        ).rows[0].n === 0,
      30000,
    );
    await new Promise((r) => setTimeout(r, 1500));
    const sent = await pushes();
    expect(
      sent.length >= 1,
      "the Note that stayed published was never delivered",
    );
    const perFan = new Map();
    for (const p of sent)
      perFan.set(p.accountId, (perFan.get(p.accountId) ?? 0) + 1);
    expect(
      [...perFan.values()].every((n) => n === 1),
      `a fan was pushed twice: ${[...perFan.values()]}`,
    );
    const states = async (noteId) =>
      Object.fromEntries(
        (
          await sql(
            `SELECT d.state,count(*)::int AS n FROM growth.delivery d
           JOIN growth.notification n ON n.id=d.notification_id
           JOIN growth.producer_relay r ON r.id=n.event_id
           WHERE r.envelope->>'aggregateId'=$1 AND d.channel='push' GROUP BY 1`,
            [noteId],
          )
        ).rows.map((r) => [r.state, r.n]),
      );
    const goneStates = await states(gone.id);
    expect(
      Object.keys(goneStates).join() === "suppressed",
      `the withdrawn Note's pushes: ${JSON.stringify(goneStates)}`,
    );
    const keptStates = await states(kept.id);
    expect(
      keptStates.sent === 3 && !keptStates.queued && !keptStates.dead,
      `the kept Note's pushes: ${JSON.stringify(keptStates)}`,
    );
    return `${sent.length} push after the retry, none for the withdrawn Note`;
  },
);
await step(
  "E5.4-unmute",
  "a member who unmutes is told about the next Note, and a muted member's push never leaves",
  async () => {
    // Across every push sent in this whole run, none went to the muted member.
    expect(
      !(await pushes()).some((p) => p.accountId === f.jon.accountId),
      "jon was pushed while muted",
    );
    const unmute = await http(
      "POST",
      `/v1/content/${maya.id}/mute`,
      f.jon.token,
      { muted: false },
    );
    expect(unmute.status === 200, `unmute ${unmute.status}`);
    await publishNote(maya, "A Note after jon unmuted.", { kind: "members" });
    await waitFor(
      "jon's notice",
      async () =>
        (
          await sql(
            "SELECT count(*)::int AS n FROM growth.notification n JOIN creator.fan_profile f ON f.account_id=n.account_id WHERE f.handle='jon_e54' AND n.type='note'",
          )
        ).rows[0].n >= 1,
    );
    await waitFor("jon's push", async () =>
      (await pushes()).some((p) => p.accountId === f.jon.accountId),
    );
    const mine = (await inbox(f.jon)).filter((n) => n.type === "note");
    expect(
      mine.length === 1 && mine[0].preview.startsWith("A Note after jon"),
      JSON.stringify(mine),
    );
  },
);
await closeDb();
process.exit(finish());
