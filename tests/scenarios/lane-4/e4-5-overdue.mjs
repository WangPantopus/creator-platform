// E4.5 overdue commitment: an accepted request that is not delivered by its
// deadline is refunded by the scheduler exactly once, with nobody tapping; a
// team reply or a reply from before the accept never completes it (INV-09); a
// delivery after the refund is refused; a delivered commitment is never refunded
// for lateness; and a scheduler killed in the middle of the refund refunds once.
// Deadlines are moved by editing them in this stack's own database.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-5-overdue.mjs
import {
  ACCOUNT,
  CREATOR,
  accept,
  asCreator,
  asFan,
  expect,
  finish,
  http,
  intentsFor,
  key,
  ledger,
  offer,
  packetRow,
  setLimit,
  signAct,
  sleep,
  sql,
  step,
  stripe,
  stripeState,
  submit,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 5 })).body;
const root = `/v1/conversations/${CREATOR.maya}/${fan.fanId}`;
const commitment = async (id) =>
  (
    await sql("SELECT * FROM creator.commerce_commitment WHERE packet_id=$1", [
      id,
    ])
  )[0];
const dueIn = (id, seconds) =>
  sql(
    "UPDATE creator.commerce_commitment SET due_at=now()+($2*interval '1 second') WHERE packet_id=$1",
    [id, seconds],
  );
const deliver = async (id, messageId) =>
  http("POST", `/v1/commerce/packets/${id}/deliver`, maya.token, {
    version: (await commitment(id)).version,
    messageId,
    idempotencyKey: key("deliver"),
  });
async function signedReply(text) {
  await http("POST", `${root}/takeover`, maya.token, {
    idempotencyKey: key("takeover"),
  });
  const thread = (await packetRow(first.id)).thread_id;
  const signed = await signAct(
    maya,
    { actType: "reply", subjectId: thread, content: { text } },
    { fanId: fan.fanId },
  );
  const sent = await http("POST", `${root}/human-replies`, maya.token, {
    text,
    signedActId: signed.signedActId,
    idempotencyKey: key("reply"),
  });
  expect(
    sent.status === 200,
    `reply ${sent.status} ${JSON.stringify(sent.body)}`,
  );
  return sent.body.id;
}
async function until(what, check, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}

await startScheduler(2000);
let first;
let early;
/** A message in the thread that the creator did not sign. Team replies cannot
 * be sent on the development stack (their route answers 503
 * scope_denial_unconfigured), so the row stands in for that path. */
async function unsignedMessage(authorKind, accountId, text) {
  const p = await packetRow(first.id);
  // Take the next message number the way the conversation service does.
  const [row] = await sql(
    `WITH next AS (UPDATE creator.thread SET message_sequence=message_sequence+1,revision=revision+1 WHERE id=$1 RETURNING id,creator_id,fan_id,control_epoch,message_sequence)
     INSERT INTO creator.message(thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence)
     SELECT id,creator_id,fan_id,$2,$3,$4,'delivered',control_epoch,message_sequence FROM next RETURNING id`,
    [p.thread_id, authorKind, accountId, text],
  );
  return row.id;
}
await step(
  "E4.5-1",
  "a reply written before the accept, a team reply and an AI reply do not complete the commitment",
  async () => {
    first = (await submit(fan, mode)).body.packet;
    early = await signedReply(`An early note (${Date.now()})`);
    const accepted = await accept(maya, first.id);
    expect(accepted.status === 200, `accept ${accepted.status}`);
    const tries = [
      await deliver(first.id, early),
      await deliver(
        first.id,
        await unsignedMessage("team", ACCOUNT.team, "The team saw this."),
      ),
      await deliver(
        first.id,
        await unsignedMessage("ai", null, "Maya's AI: here is a thought."),
      ),
    ];
    expect(
      tries.every((t) => t.status >= 400) &&
        (await commitment(first.id)).state === "due",
      tries.map((t) => `${t.status} ${t.code}`).join(", "),
    );
    return `before the accept, team, AI: ${tries.map((t) => `${t.status} ${t.code}`).join(", ")}; still due`;
  },
);
await step(
  "E4.5-2",
  "left undelivered past its deadline, it is refunded exactly once with nobody tapping",
  async () => {
    await dueIn(first.id, 3);
    await until(
      "refund",
      async () => (await packetRow(first.id)).payment_state === "refunded",
      30000,
    );
    await sleep(5000); // two more passes: nothing more happens
    const [intent] = await intentsFor(first.id);
    const made = (await stripeState()).refunds.filter(
      (r) => r.payment_intent === intent.id,
    );
    const rows = (await ledger(first.id))
      .map((r) => `${r.kind}:${r.amount}`)
      .join(" ");
    const c = await commitment(first.id);
    expect(
      made.length === 1 &&
        made[0].amount === 5000 &&
        made[0].status === "succeeded",
      JSON.stringify(made),
    );
    expect(
      rows === "hold:5000 capture:5000 refund:5000" &&
        c.state === "refunded" &&
        c.outcome === "deadline_missed",
      `${rows} ${c.state} ${c.outcome}`,
    );
    return `commitment ${c.state}/${c.outcome}; ledger ${rows}; processor 1 refund of 5000`;
  },
);
await step("E4.5-3", "a delivery after the refund is refused", async () => {
  const late = await deliver(
    first.id,
    await signedReply(`Here is my answer (${Date.now()})`),
  );
  expect(
    late.status >= 400 && (await commitment(first.id)).state === "refunded",
    `${late.status} ${late.code}`,
  );
  return `${late.status} ${late.code}`;
});
await step(
  "E4.5-4",
  "a commitment delivered in time is never refunded when its deadline passes",
  async () => {
    const second = (await submit(fan, mode)).body.packet;
    expect((await accept(maya, second.id)).status === 200, "accept");
    const done = await deliver(
      second.id,
      await signedReply(`Delivered on time (${Date.now()})`),
    );
    expect(done.status === 200, `deliver ${done.status} ${done.code}`);
    const promised = (await commitment(second.id)).due_at;
    await dueIn(second.id, -10);
    await sleep(6000);
    // Put the real deadline back, so the history stays true for the sweep.
    await sql(
      "UPDATE creator.commerce_commitment SET due_at=$2 WHERE packet_id=$1",
      [second.id, promised],
    );
    const rows = (await ledger(second.id)).map((r) => r.kind).join(" ");
    expect(
      (await commitment(second.id)).state === "delivered" &&
        !rows.includes("refund"),
      rows,
    );
    return `delivered, ledger ${rows}`;
  },
);
await step(
  "E4.5-5",
  "killed in the middle of the refund, a restarted scheduler refunds exactly once",
  async () => {
    const third = (await submit(fan, mode)).body.packet;
    expect((await accept(maya, third.id)).status === 200, "accept");
    const [intent] = await intentsFor(third.id);
    await stripe({
      fault: { op: "refund", phase: "delay", delayMs: 4000, times: 1 },
    });
    await dueIn(third.id, -1);
    await until(
      "the refund call",
      async () =>
        (await stripeState()).calls.some(
          (c) => c.op === "refund" && c.ref === intent.id,
        ),
      15000,
    );
    await sleep(2000);
    await stopScheduler("SIGKILL");
    await sleep(3000);
    const mid = await commitment(third.id);
    await startScheduler(2000);
    await until(
      "the refund after the lease lapses",
      async () => (await packetRow(third.id)).payment_state === "refunded",
      60000,
    );
    const made = (await stripeState()).refunds.filter(
      (r) => r.payment_intent === intent.id,
    );
    const rows = (await ledger(third.id)).filter((r) => r.kind === "refund");
    expect(
      made.length === 1 && rows.length === 1,
      `${made.length} refunds at the processor, ${rows.length} in the ledger`,
    );
    return `mid-flight commitment ${mid.state}; after restart 1 refund at the processor, 1 in the ledger`;
  },
);
// Leave the conversation as it was found: the AI speaks again.
await http("POST", `${root}/handback`, maya.token, {
  idempotencyKey: key("handback"),
});
await finish();
