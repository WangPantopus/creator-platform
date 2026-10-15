// E5.3 / E5.4 (answers, request status, call reminders, commitments): the owners
// of private state record what a notice may say, and the growth worker tells the
// right person from that record alone. Block 4000-4199.
// Fakes: the push gateway (records what APNs/FCM would get) and the stand-in
// owners in host.mts, which make the calls lanes 3 and 4 will make
// (growth.notices.emit / withdraw, growth.relay) and, for the privacy steps, run
// the real growth export and erasure over a fake job authority.
// Run: node tests/scenarios/lane-5/e5-4-owner-snapshots.mjs
import { randomUUID } from "node:crypto";
import {
  clearPushes,
  closeDb,
  delay,
  expect,
  finish,
  gateway,
  http,
  inbox,
  pushes,
  seedCreator,
  seedFan,
  setPreferences,
  sql,
  step,
  waitFor,
} from "./lib.mjs";

const B = 4000;
const maya = await seedCreator(B, "maya_own", "Maya");
const rival = await seedCreator(B + 1, "rival_own", "Rival");
const ana = await seedFan(B + 10, "ana_own");
const ben = await seedFan(B + 11, "ben_own");
const cy = await seedFan(B + 12, "cy_own");
const dee = await seedFan(B + 13, "dee_own");
// Push is off until a fan turns it on (ben never does). cy muted Maya for push;
// dee switched AI answers off for push.
await setPreferences(ana);
await setPreferences(cy, { mutedCreators: [maya.id] });
await setPreferences(dee, { disabledPushTypes: ["ai_reply"] });
await clearPushes();

const secret = "the glaze recipe is 42 parts silica";
const owner = (path, caller, body) =>
  http("POST", `/v1/lane5-owners/${path}`, caller.token, body);
const call = (fan, kind, aggregateId, extra = {}) => ({
  kind,
  creatorId: maya.id,
  recipientAccountId: fan.accountId,
  aggregateId,
  version: 1,
  secretText: secret,
  ...extra,
});
/** What an owner does in one request: record what a notice may say, then enqueue the event. */
const both = (caller, fan, kind, aggregateId, extra) =>
  owner("both", caller, call(fan, kind, aggregateId, extra));
const rows = (text, values) => sql(text, values).then((r) => r.rows);
const pushesTo = async (fan) =>
  (await pushes()).filter((p) => p.accountId === fan.accountId);
// The worker ticks every second; a few ticks is enough for "nothing more happens".
const settle = () => delay(2500);
const everSent = [];

await step(
  "E5.3-answer-ai",
  "an AI answer reaches the fan as Maya's AI, never as Maya, in the list and in the push",
  async () => {
    const message = randomUUID();
    const r = await both(ana, ana, "ai_reply", message);
    expect(
      r.status === 200 && r.body.recorded === true && r.body.enqueued === true,
      `owner ${r.status} ${JSON.stringify(r.body)}`,
    );
    await waitFor("Ana's notice", async () => (await inbox(ana)).length === 1);
    const item = (await inbox(ana))[0];
    expect(
      item.type === "ai_reply" && item.available && item.authorKind === "ai",
      JSON.stringify(item),
    );
    expect(item.sender === "Maya's AI", `sender ${item.sender}`);
    expect(
      item.preview === "An AI reply is available in your conversation.",
      `preview ${item.preview}`,
    );
    expect(
      item.destination === "/creators/maya_own/chat",
      `destination ${item.destination}`,
    );
    await waitFor("Ana's push", async () => (await pushesTo(ana)).length >= 1);
    await settle();
    const sent = await pushesTo(ana);
    expect(sent.length === 1, `${sent.length} pushes to Ana`);
    expect(
      sent[0].sender === "Maya's AI" && sent[0].authorship === "ai",
      JSON.stringify(sent[0]),
    );
    expect(
      !/replied|silica/iu.test(JSON.stringify([sent, item])),
      "the push or the list said replied or carried the private words",
    );
    return `list "${item.sender}", push sent labeled ai`;
  },
);
await step(
  "E5.3-answer-human",
  "Maya's signed reply reaches the fan as Maya, and the push is labeled as a person's",
  async () => {
    const r = await both(maya, ana, "personal_reply", randomUUID());
    expect(
      r.status === 200 && r.body.recorded === true,
      JSON.stringify(r.body),
    );
    await waitFor(
      "Ana's second notice",
      async () => (await inbox(ana)).length === 2,
    );
    const item = (await inbox(ana)).find((x) => x.type === "personal_reply");
    expect(
      item.authorKind === "human_creator" &&
        item.sender === "Maya" &&
        item.preview === "A signed reply is available in your conversation.",
      JSON.stringify(item),
    );
    await waitFor(
      "the second push",
      async () => (await pushesTo(ana)).length >= 2,
    );
    await settle();
    const sent = await pushesTo(ana);
    expect(sent.length === 2, `${sent.length} pushes to Ana`);
    const human = sent.find((p) => p.sender === "Maya");
    const ai = sent.find((p) => p.sender === "Maya's AI");
    expect(
      human?.authorship === "human" && ai?.authorship === "ai",
      JSON.stringify(sent),
    );
    return "the AI push and the person's push are told apart by sender and authorship";
  },
);
await step(
  "E5.3-controls",
  "a fan's own settings still decide: push off, a muted creator and a switched-off type are listed but not pushed",
  async () => {
    const before = (await pushes()).length;
    const ids = {
      ben: randomUUID(),
      cy: randomUUID(),
      deeAi: randomUUID(),
      deeHuman: randomUUID(),
    };
    const made = await Promise.all([
      both(maya, ben, "personal_reply", ids.ben),
      both(maya, cy, "personal_reply", ids.cy),
      both(ana, dee, "ai_reply", ids.deeAi),
      both(maya, dee, "personal_reply", ids.deeHuman),
    ]);
    expect(
      made.every((r) => r.status === 200),
      JSON.stringify(made.map((r) => r.status)),
    );
    for (const [fan, count] of [
      [ben, 1],
      [cy, 1],
      [dee, 2],
    ])
      await waitFor(
        `${fan.handle}'s list`,
        async () => (await inbox(fan)).length === count,
      );
    await waitFor("Dee's push", async () => (await pushesTo(dee)).length >= 1);
    await settle();
    expect(
      (await pushesTo(ben)).length === 0 && (await pushesTo(cy)).length === 0,
      "push off, or a muted creator, was pushed",
    );
    const deePushes = await pushesTo(dee);
    expect(
      deePushes.length === 1 && deePushes[0].sender === "Maya",
      `Dee's pushes ${JSON.stringify(deePushes)}`,
    );
    expect((await pushes()).length === before + 1, "more than one new push");
    const states = (
      await rows(
        `SELECT a.handle||':'||n.type||':'||d.state AS s FROM growth.delivery d
         JOIN growth.notification n ON n.id=d.notification_id
         JOIN creator.fan_profile a ON a.account_id=n.account_id
         WHERE d.channel='push' AND a.handle IN ('ben_own','cy_own','dee_own') ORDER BY 1`,
      )
    ).map((r) => r.s);
    for (const expected of [
      "ben_own:personal_reply:suppressed",
      "cy_own:personal_reply:suppressed",
      "dee_own:ai_reply:suppressed",
      "dee_own:personal_reply:sent",
    ])
      expect(states.includes(expected), `delivery states ${states}`);
    return "ben (push off), cy (muted Maya) and dee's AI answer suppressed; dee's personal reply sent";
  },
);
await step(
  "E5.4-types",
  "request status, an offer, a new request, a commitment and a call reminder each arrive once, to the right role, in the right voice",
  async () => {
    const id = {
      status: randomUUID(),
      offer: randomUUID(),
      packet: randomUUID(),
      due: randomUUID(),
      call: randomUUID(),
      over: randomUUID(),
    };
    const made = await Promise.all([
      both(maya, ana, "request_status", id.status),
      both(maya, ana, "creator_offer", id.offer),
      both(ana, maya, "new_packet", id.packet),
      both(ana, maya, "commitment_due", id.due),
      both(maya, ana, "call_reminder", id.call, { status: "joinable" }),
      both(maya, ana, "call_reminder", id.over, { status: "completed" }),
    ]);
    expect(
      made.every((r) => r.status === 200),
      JSON.stringify(made.map((r) => r.status)),
    );
    await waitFor(
      "the notices",
      async () =>
        (await inbox(ana)).length === 5 && (await inbox(maya)).length === 2,
    );
    await settle();
    const mine = await inbox(ana);
    const byType = (list, type) => list.filter((x) => x.type === type);
    const one = (list, type) => {
      const found = byType(list, type);
      expect(found.length === 1, `${type} x${found.length}`);
      return found[0];
    };
    const status = one(mine, "request_status");
    expect(
      status.sender === "System" &&
        status.authorKind === "system" &&
        status.preview === "Request update" &&
        status.destination === "/commerce/requests",
      JSON.stringify(status),
    );
    const offer = one(mine, "creator_offer");
    expect(
      offer.sender === "Maya" && offer.authorKind === "human_creator",
      JSON.stringify(offer),
    );
    const reminder = one(mine, "call_reminder");
    expect(
      reminder.destination === `/calls/${maya.id}/${ana.id}/${id.call}` &&
        reminder.preview.startsWith("Your scheduled call has an update"),
      JSON.stringify(reminder),
    );
    // A call that is already over tells no one.
    expect(
      byType(mine, "call_reminder").length === 1,
      "a finished call was announced",
    );
    const hers = await inbox(maya);
    const packet = one(hers, "new_packet");
    const due = one(hers, "commitment_due");
    expect(
      packet.sender === "System" &&
        due.sender === "System" &&
        packet.destination === "/commerce/requests",
      JSON.stringify([packet, due]),
    );
    const roles = await rows(
      `SELECT n.type,n.role,count(*)::int AS n FROM growth.notification n
       WHERE n.type IN ('request_status','creator_offer','new_packet','commitment_due','call_reminder')
       GROUP BY 1,2 ORDER BY 1`,
    );
    const asText = roles.map((r) => `${r.type}:${r.role}:${r.n}`).join();
    expect(
      asText ===
        "call_reminder:fan:1,commitment_due:creator:1,creator_offer:fan:1,new_packet:creator:1,request_status:fan:1",
      `roles ${asText}`,
    );
    return "one each, to fan or creator as the type requires; the finished call told no one";
  },
);
await step(
  "E5.4-author-guard",
  "the engine's own author rule refuses a wrong author at the record, and nothing is recorded or enqueued",
  async () => {
    const count = async () =>
      (
        await rows(
          `SELECT (SELECT count(*) FROM growth.notice)::int AS notices,
                  (SELECT count(*) FROM growth.producer_relay)::int AS events`,
        )
      )[0];
    const before = await count();
    const attempts = await Promise.all([
      // An AI answer claiming to be a person.
      both(ana, ana, "ai_reply", randomUUID(), { liar: "human_creator" }),
      // Maya's reply claiming to be an AI.
      both(maya, ana, "personal_reply", randomUUID(), { liar: "ai" }),
      // A status update claiming a person wrote it.
      both(maya, ana, "request_status", randomUUID(), {
        liar: "human_creator",
      }),
    ]);
    for (const r of attempts)
      expect(
        r.status === 409 &&
          r.body?.error?.code === "notification_author_mismatch",
        `${r.status} ${JSON.stringify(r.body)}`,
      );
    const after = await count();
    expect(
      before.notices === after.notices && before.events === after.events,
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
    );
    return "3 of 3 refused with notification_author_mismatch (409)";
  },
);
await step(
  "E5.4-once",
  "the same cause never notifies twice: three calls at once, then a later repeat",
  async () => {
    const message = randomUUID();
    const listBefore = (await inbox(ana)).length;
    const pushBefore = (await pushesTo(ana)).length;
    const runs = await Promise.all(
      [1, 2, 3].map(() => both(ana, ana, "ai_reply", message)),
    );
    expect(
      runs.every((r) => r.status === 200),
      JSON.stringify(runs.map((r) => r.status)),
    );
    await waitFor(
      "one new notice",
      async () => (await inbox(ana)).length === listBefore + 1,
    );
    await waitFor(
      "one new push",
      async () => (await pushesTo(ana)).length === pushBefore + 1,
    );
    await settle();
    const again = await both(ana, ana, "ai_reply", message);
    expect(again.status === 200, `repeat ${again.status}`);
    await settle();
    const events = (
      await rows(
        "SELECT count(*)::int AS n FROM growth.producer_relay WHERE envelope->>'aggregateId'=$1",
        [message],
      )
    )[0].n;
    expect(
      (await inbox(ana)).length === listBefore + 1 &&
        (await pushesTo(ana)).length === pushBefore + 1 &&
        events === 1,
      `list ${listBefore}->${(await inbox(ana)).length}, pushes ${pushBefore}->${(await pushesTo(ana)).length}, events ${events}`,
    );
    return "one event, one notice, one push";
  },
);
await step(
  "E5.4-order",
  "an event that arrives before its owner has recorded anything waits, and is told once the record exists",
  async () => {
    const message = randomUUID();
    const listBefore = (await inbox(ana)).length;
    const pushBefore = (await pushesTo(ana)).length;
    const early = await owner("enqueue", ana, call(ana, "ai_reply", message));
    expect(early.status === 200, `enqueue ${early.status}`);
    const relay = () =>
      rows(
        "SELECT state,error_code FROM growth.producer_relay WHERE envelope->>'aggregateId'=$1",
        [message],
      ).then((r) => r[0]);
    await waitFor(
      "the event to wait",
      async () => (await relay())?.state === "blocked",
      30000,
    );
    expect(
      (await relay()).error_code === "owner_unconfigured",
      JSON.stringify(await relay()),
    );
    await settle();
    expect(
      (await inbox(ana)).length === listBefore &&
        (await pushesTo(ana)).length === pushBefore,
      "someone was told before the owner recorded anything",
    );
    expect(
      (await owner("emit", ana, call(ana, "ai_reply", message))).status === 200,
      "emit",
    );
    const resumed = await owner("resume", ana, {
      producer: "conversation",
      creatorId: maya.id,
    });
    expect(resumed.status === 200, `resume ${resumed.status}`);
    await waitFor(
      "the notice",
      async () => (await inbox(ana)).length === listBefore + 1,
    );
    expect((await relay()).state === "consumed", JSON.stringify(await relay()));
    return "blocked as owner_unconfigured, then told once after the record and a resume";
  },
);
await step(
  "E5.4-versions",
  "a record never goes back to an older version, never moves to another creator, and a withdrawn one is revived only by a newer version",
  async () => {
    const message = randomUUID();
    const held = () =>
      rows(
        "SELECT version,state,creator_id FROM growth.notice WHERE type='ai_reply' AND aggregate_id=$1 AND account_id=$2",
        [message, ana.accountId],
      ).then((r) => r[0]);
    const emit = (extra) =>
      owner("emit", ana, call(ana, "ai_reply", message, extra));
    let r = await emit({ version: 2 });
    expect(r.body.recorded === true && (await held()).version === 2, "v2");
    r = await emit({ version: 1 });
    expect(
      r.status === 200 &&
        r.body.recorded === false &&
        r.body.reason === "superseded" &&
        (await held()).version === 2,
      `late v1 ${JSON.stringify(r.body)}`,
    );
    r = await emit({ version: 3, creatorId: rival.id });
    expect(
      r.status === 409 && r.body?.error?.code === "notice_creator_conflict",
      `other creator ${r.status} ${JSON.stringify(r.body)}`,
    );
    expect((await held()).creator_id === maya.id, "the creator changed");
    const w = await owner("withdraw", ana, {
      kind: "ai_reply",
      aggregateId: message,
      recipientAccountId: ana.accountId,
      version: 2,
    });
    expect(
      w.status === 200 &&
        w.body.withdrawn === 1 &&
        (await held()).state === "withdrawn",
      `withdraw ${JSON.stringify(w.body)}`,
    );
    r = await emit({ version: 2 });
    expect(
      r.body.recorded === false && (await held()).state === "withdrawn",
      `same version revived it: ${JSON.stringify(r.body)}`,
    );
    r = await emit({ version: 3 });
    expect(
      r.body.recorded === true &&
        (await held()).state === "current" &&
        (await held()).version === 3,
      `newer version ${JSON.stringify(r.body)}`,
    );
    return "v1 after v2 refused; another creator refused (409); withdrawn v2 stays withdrawn; v3 revives";
  },
);
await step(
  "E5.4-withdraw",
  "a message withdrawn before its push is sent is never pushed, and leaves the list",
  async () => {
    everSent.push(...(await pushes()));
    await clearPushes();
    await gateway("down");
    const message = randomUUID();
    const listBefore = (await inbox(ana)).length;
    await both(ana, ana, "ai_reply", message);
    const delivery = () =>
      rows(
        `SELECT d.state,d.attempts,d.last_error FROM growth.delivery d
         JOIN growth.notification n ON n.id=d.notification_id
         JOIN growth.producer_relay r ON r.id=n.event_id
         WHERE r.envelope->>'aggregateId'=$1 AND d.channel='push'`,
        [message],
      ).then((r) => r[0]);
    await waitFor(
      "the first attempt to fail",
      async () => {
        const d = await delivery();
        return d?.state === "queued" && d.attempts >= 1 && d.last_error;
      },
      30000,
    );
    expect(
      (await inbox(ana)).length === listBefore + 1,
      "the notice was not listed while its push waited",
    );
    const w = await owner("withdraw", ana, {
      kind: "ai_reply",
      aggregateId: message,
      recipientAccountId: ana.accountId,
    });
    expect(w.status === 200 && w.body.withdrawn === 1, JSON.stringify(w.body));
    await gateway("up");
    await rows(
      "UPDATE growth.delivery SET available_at=now() WHERE channel='push' AND state='queued'",
    );
    await waitFor(
      "the retry to be decided",
      async () => (await delivery())?.state === "suppressed",
      30000,
    );
    await settle();
    expect((await pushes()).length === 0, "a withdrawn message was pushed");
    expect(
      (await inbox(ana)).length === listBefore,
      "the withdrawn notice is still listed",
    );
    return "delivery suppressed, nothing sent, the row left the list";
  },
);
await step(
  "E5.4-live-owner",
  "a connected owner's live answer wins in the person's own list; the recorded state is what the worker acts on",
  async () => {
    const message = randomUUID();
    const listBefore = (await inbox(ana)).length;
    await both(ana, ana, "ai_reply", message);
    await waitFor(
      "the notice",
      async () => (await inbox(ana)).length === listBefore + 1,
    );
    expect(
      (await owner("live", ana, { aggregateId: message, gone: true }))
        .status === 200,
      "live",
    );
    expect(
      (await inbox(ana)).length === listBefore,
      "the owner said it is gone but the list still showed it",
    );
    const recorded = (
      await rows("SELECT state FROM growth.notice WHERE aggregate_id=$1", [
        message,
      ])
    )[0];
    expect(
      recorded.state === "current",
      "the record changed without the owner's call",
    );
    await owner("live", ana, { aggregateId: message, gone: false });
    expect(
      (await inbox(ana)).length === listBefore + 1,
      "the row did not come back when the owner agreed again",
    );
    return "hidden while the owner says gone; the record stays current, so an owner must also withdraw";
  },
);
await step(
  "E5.3-no-private-words",
  "the private words an owner holds are in no table growth keeps, no push and no list",
  async () => {
    everSent.push(...(await pushes()));
    const search = async (word) =>
      Object.fromEntries(
        (
          await rows(
            `SELECT 'notice' AS t,count(*)::int AS n FROM growth.notice x WHERE row_to_json(x)::text ILIKE $1
             UNION ALL SELECT 'notification',count(*)::int FROM growth.notification x WHERE row_to_json(x)::text ILIKE $1
             UNION ALL SELECT 'event_inbox',count(*)::int FROM growth.event_inbox x WHERE row_to_json(x)::text ILIKE $1
             UNION ALL SELECT 'producer_relay',count(*)::int FROM growth.producer_relay x WHERE row_to_json(x)::text ILIKE $1
             UNION ALL SELECT 'delivery',count(*)::int FROM growth.delivery x WHERE row_to_json(x)::text ILIKE $1`,
            [`%${word}%`],
          )
        ).map((r) => [r.t, r.n]),
      );
    // The search can find a word that is there (Maya's name is in the records)...
    const control = await search("maya");
    expect(
      control.notice > 0 && control.notification > 0,
      `the search found nothing for a word that is there: ${JSON.stringify(control)}`,
    );
    // ...and the private words are in none of the tables.
    const found = await search("silica");
    expect(
      Object.values(found).every((n) => n === 0),
      `found in ${Object.entries(found)
        .filter(([, n]) => n)
        .map(([t]) => t)}`,
    );
    const lists = JSON.stringify([
      await inbox(ana),
      await inbox(ben),
      await inbox(cy),
      await inbox(dee),
      await inbox(maya),
    ]);
    expect(
      !/silica/iu.test(lists) && !/silica/iu.test(JSON.stringify(everSent)),
      "the words reached a list or a push",
    );
    return `${everSent.length} pushes, 5 lists and 5 tables searched (the same search finds Maya's name)`;
  },
);
await step(
  "E5.4-export-and-erasure",
  "the real growth export lists a person's notice records; the real erasure removes them, and a late owner call cannot bring them back",
  async () => {
    const mine = (
      await rows(
        "SELECT count(*)::int AS n FROM growth.notice WHERE account_id=$1",
        [ana.accountId],
      )
    )[0].n;
    expect(mine > 0, "Ana has no records to export");
    const exported = await owner("export", ana, { accountId: ana.accountId });
    expect(
      exported.status === 200,
      `export ${exported.status} ${JSON.stringify(exported.body)}`,
    );
    const records = exported.body.ndjson
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const noticeRecords = records.filter((r) => r.collection === "notice");
    expect(
      noticeRecords.length === mine,
      `export has ${noticeRecords.length} notice records, the table has ${mine}`,
    );
    expect(
      !/silica/iu.test(exported.body.ndjson),
      "the private words are in the export",
    );
    // A second creator's records go with her own erasure.
    const other = randomUUID();
    expect(
      (
        await both(rival, dee, "personal_reply", other, {
          creatorId: rival.id,
        })
      ).body.recorded === true,
      "rival's record",
    );
    const erased = await owner("erase", ana, { accountId: ana.accountId });
    expect(
      erased.status === 200,
      `erase ${erased.status} ${JSON.stringify(erased.body)}`,
    );
    const left = await rows(
      `SELECT (SELECT count(*) FROM growth.notice WHERE account_id=$1)::int AS notices,
              (SELECT count(*) FROM growth.notification WHERE account_id=$1)::int AS notifications`,
      [ana.accountId],
    );
    expect(
      left[0].notices === 0 && left[0].notifications === 0,
      `after erasure ${JSON.stringify(left[0])}`,
    );
    // The owner has not heard yet and calls again.
    const late = await both(maya, ana, "personal_reply", randomUUID());
    expect(
      late.status === 200 &&
        late.body.recorded === false &&
        late.body.reason === "erased",
      `late call ${JSON.stringify(late.body)}`,
    );
    await settle();
    const back = await rows(
      "SELECT count(*)::int AS n FROM growth.notification WHERE account_id=$1",
      [ana.accountId],
    );
    expect(back[0].n === 0, "an erased person was told again");
    const rivalErased = await owner("erase", rival, {
      accountId: rival.accountId,
      ownedCreatorIds: [rival.id],
    });
    expect(rivalErased.status === 200, `erase rival ${rivalErased.status}`);
    const rivalLeft = await rows(
      "SELECT count(*)::int AS n FROM growth.notice WHERE creator_id=$1",
      [rival.id],
    );
    expect(rivalLeft[0].n === 0, "the creator's records survived her erasure");
    const mayaLeft = await rows(
      "SELECT count(*)::int AS n FROM growth.notice WHERE creator_id=$1",
      [maya.id],
    );
    expect(mayaLeft[0].n > 0, "another creator's records were erased too");
    return `${mine} records exported and erased; the late call refused as erased; the creator's records gone with hers`;
  },
);
await closeDb();
process.exit(finish());
