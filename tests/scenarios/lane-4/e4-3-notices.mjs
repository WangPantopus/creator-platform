// E4.3 and lane 5's ticket, the request notices. A request nobody decides
// expires with no tap and the fan is told, as a request update from Maya with
// no amount and no words of the request; Maya is told about a new request while
// it waits for her, and the notice is withdrawn once she has dealt with it; an
// accepted request near its deadline reminds Maya once, and delivering
// withdraws the reminder; each event is told once, also across a scheduler
// crash. The chain is real: the scheduler side process records each notice in
// growth's notice table and the relay enqueues it, the backend's growth worker
// makes the notification, and each person reads their own list.
// Deadlines and the acceptance time are moved in this stack's own database.
// Needs growth: node tests/scenarios/lane-4/stack.mjs up --no-web --growth
// Fakes: card processor, development identity, software passkey. Development
// stand-ins (payments/recovery.ts): who may be told is any adult-eligible
// development account, because W8 has no worker denial for commerce notices
// yet, and the commerce outbox's privacy registration is taken as given (Q16).
//   node tests/scenarios/lane-4/e4-3-notices.mjs
import {
  ACCOUNT,
  CREATOR,
  accept,
  asCreator,
  asFan,
  decide,
  expect,
  finish,
  http,
  key,
  offer,
  packetRow,
  setLimit,
  signAct,
  sleep,
  sql,
  step,
  submit,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const probe = await http("GET", "/v1/growth/notifications", fan.token);
if (probe.status !== 200)
  throw new Error(
    `growth is not running on this stack (${probe.status} ${probe.code}); bring it up with --growth`,
  );
const mode = (
  await offer(maya, { weeklyLimit: 10, title: "Written reply (notices)" })
).body;
await stopScheduler();
await startScheduler(500);
const root = `/v1/conversations/${CREATOR.maya}/${fan.fanId}`;

async function until(what, check, ms = 45000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}
/** What commerce recorded for this notice in growth's own table. */
const record = async (type, packetId, accountId) =>
  (
    await sql(
      "SELECT state,author_kind,creator_name,safe_preview,destination,status,version FROM growth.notice WHERE type=$1 AND aggregate_id=$2 AND account_id=$3",
      [type, packetId, accountId],
    )
  )[0];
/** The notifications growth made for this person from this request's event. */
const told = (eventType, packetId, accountId) =>
  sql(
    `SELECT n.id,n.type,n.sender,n.preview,n.destination FROM growth.notification n
     JOIN creator.commerce_event e ON e.id=n.event_id
     WHERE e.aggregate_id=$1 AND e.type=$2 AND n.account_id=$3`,
    [packetId, eventType, accountId],
  );
/** The person's own list, read through the API. */
const listed = async (who, id) =>
  (
    (await http("GET", "/v1/growth/notifications", who.token)).body
      .notifications ?? []
  ).find((n) => n.id === id);
/** Maya's signed reply, then the delivery of the request. */
async function deliver(id) {
  await http("POST", `${root}/takeover`, maya.token, {
    idempotencyKey: key("takeover"),
  });
  const thread = (await packetRow(id)).thread_id;
  const text = `The answer you asked for (${Date.now()})`;
  const { signedActId } = await signAct(
    maya,
    { actType: "reply", subjectId: thread, content: { text } },
    { fanId: fan.fanId },
  );
  const sent = await http("POST", `${root}/human-replies`, maya.token, {
    text,
    signedActId,
    idempotencyKey: key("reply"),
  });
  const version = (
    await sql(
      "SELECT version FROM creator.commerce_commitment WHERE packet_id=$1",
      [id],
    )
  )[0].version;
  const done = await http(
    "POST",
    `/v1/commerce/packets/${id}/deliver`,
    maya.token,
    { version, messageId: sent.body.id, idempotencyKey: key("deliver") },
  );
  expect(done.status === 200, `deliver ${done.status} ${done.code}`);
}

await step(
  "E4.3-13",
  "a request nobody decides expires with no tap, and the fan is told: a request update from Maya, with no amount and no words of the request",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    await sql(
      "UPDATE creator.commerce_packet SET decision_at=now()+interval '2 seconds' WHERE id=$1",
      [id],
    );
    await until(
      "the expiry",
      async () => (await packetRow(id)).state === "expired",
    );
    const [n] = await until("the fan's notification", async () => {
      const rows = await told("hold_released", id, fan.accountId);
      return rows.length ? rows : null;
    });
    const r = await record("request_status", id, fan.accountId);
    const item = await until("the fan's list", () => listed(fan, n.id));
    expect(
      n.type === "request_status" &&
        n.preview === "Request update" &&
        n.destination === "/commerce/requests" &&
        r?.state === "current" &&
        r.author_kind === "system" &&
        r.creator_name === "Maya" &&
        r.status === "expired" &&
        item.available === true &&
        item.creatorName === "Maya" &&
        !/\$|glaze/iu.test(`${item.preview} ${item.sender}`),
      `${JSON.stringify(n)} / ${JSON.stringify(r)} / ${JSON.stringify(item)}`,
    );
    return `"${item.preview}" from ${item.creatorName} (${item.sender}), to ${item.destination}; recorded as ${r.status}`;
  },
);
await step(
  "E4.3-14",
  "Maya is told about a new request while it waits for her; once she declines it the notice is withdrawn and the fan is told",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    const [n] = await until("Maya's notification", async () => {
      const rows = await told("packet_submitted_creator", id, maya.accountId);
      return rows.length ? rows : null;
    });
    const before = await record("new_packet", id, maya.accountId);
    const item = await until("Maya's list", () => listed(maya, n.id));
    expect(
      n.type === "new_packet" &&
        n.preview === "New request" &&
        before?.state === "current" &&
        item.available === true,
      `${JSON.stringify(n)} / ${JSON.stringify(before)} / ${JSON.stringify(item)}`,
    );
    expect(
      (await decide(maya, id, { action: "decline" })).status === 200,
      "decline",
    );
    const after = await until("the withdrawal", async () => {
      const r = await record("new_packet", id, maya.accountId);
      return r?.state === "withdrawn" ? r : null;
    });
    const fanTold = await until("the fan's notification", async () => {
      const rows = await told("hold_released", id, fan.accountId);
      return rows.length ? rows : null;
    });
    const later = await listed(maya, n.id);
    return `Maya: "${n.preview}", then withdrawn (v${after.version}); her list now shows it ${later ? `available=${later.available}` : "gone"}; the fan: "${fanTold[0].preview}" (${(await record("request_status", id, fan.accountId)).status})`;
  },
);
await step(
  "E4.3-15",
  "an accepted request near its deadline reminds Maya once; delivering withdraws the reminder",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    expect((await accept(maya, id)).status === 200, "accept");
    // A day-long window with an hour left: the reminder is due.
    await sql(
      "UPDATE creator.commerce_packet SET accepted_at=now()-interval '1 day' WHERE id=$1",
      [id],
    );
    await sql(
      "UPDATE creator.commerce_commitment SET due_at=now()+interval '1 hour' WHERE packet_id=$1",
      [id],
    );
    const [n] = await until("Maya's reminder", async () => {
      const rows = await told("commitment_due", id, maya.accountId);
      return rows.length ? rows : null;
    });
    await sleep(3000);
    const reminders = (
      await sql(
        "SELECT count(*)::int AS n FROM creator.commerce_event WHERE aggregate_id=$1 AND type='commitment_due'",
        [id],
      )
    )[0].n;
    const due = await record("commitment_due", id, maya.accountId);
    expect(
      n.type === "commitment_due" &&
        reminders === 1 &&
        due?.state === "current" &&
        due.status === "due" &&
        due.author_kind === "system",
      `${JSON.stringify(n)} ${reminders} ${JSON.stringify(due)}`,
    );
    await deliver(id);
    const gone = await until("the reminder withdrawn", async () => {
      const r = await record("commitment_due", id, maya.accountId);
      return r?.state === "withdrawn" ? r : null;
    });
    return `one reminder ("${n.preview}", ${due.status}) after several passes; delivered, then the reminder is ${gone.state}`;
  },
);
await step(
  "E4.3-16",
  "each event is told once, also after the scheduler is killed and started again",
  async () => {
    await stopScheduler("SIGKILL");
    await startScheduler(500);
    await sleep(4000);
    const relayed = await sql(
      "SELECT envelope->>'id' AS id,count(*)::int AS n FROM growth.producer_relay WHERE producer='commerce' GROUP BY 1 HAVING count(*)>1",
    );
    const notified = await sql(
      "SELECT event_id,account_id,count(*)::int AS n FROM growth.notification GROUP BY 1,2 HAVING count(*)>1",
    );
    const waiting = (
      await sql(
        "SELECT count(*)::int AS n FROM creator.commerce_event WHERE published_at IS NULL AND type<>'share_changed' AND creator_id=$1",
        [CREATOR.maya],
      )
    )[0].n;
    expect(
      relayed.length === 0 && notified.length === 0 && waiting === 0,
      `${relayed.length} relayed twice, ${notified.length} notified twice, ${waiting} waiting`,
    );
    return "no event relayed or notified twice; nothing left waiting";
  },
);
await http("POST", `${root}/handback`, maya.token, {
  idempotencyKey: key("handback"),
});
await stopScheduler();
await finish();
