// E4.1 happy path: a fan asks Maya for a written reply, the hold is placed,
// Maya accepts with her passkey, the hold is captured, she replies (signed),
// the reply is delivered and the fan's receipt matches the ledger exactly.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-1-happy-path.mjs
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
  packet,
  packetRow,
  setLimit,
  signAct,
  sql,
  step,
  submitBody,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
let mode;
let id;
let thread;

await step(
  "E4.1-1",
  "Maya offers a written reply at $50.00, decided in 48 h, delivered in 72 h",
  async () => {
    const saved = await offer(maya, {
      amount: 5000,
      decisionHours: 48,
      deliveryHours: 72,
      weeklyLimit: 3,
    });
    expect(
      saved.status === 200,
      `status ${saved.status} ${JSON.stringify(saved.body)}`,
    );
    mode = saved.body;
    return `mode ${mode.id.slice(0, 8)} version ${mode.version}`;
  },
);

const body = submitBody(fan, mode);
await step(
  "E4.1-2",
  "the fan submits: a hold of exactly 5000 USD, nothing captured",
  async () => {
    const sent = await http("POST", "/v1/commerce/packets", fan.token, body);
    expect(
      sent.status === 200,
      `status ${sent.status} ${JSON.stringify(sent.body)}`,
    );
    id = sent.body.packet.id;
    thread = sent.body.packet.thread_id;
    const p = await packetRow(id);
    expect(
      p.state === "submitted" && p.payment_state === "requires_capture",
      `${p.state}/${p.payment_state}`,
    );
    const [intent, ...more] = await intentsFor(id);
    expect(
      intent && !more.length,
      `${more.length + (intent ? 1 : 0)} intents at the processor`,
    );
    expect(
      intent.amount === 5000 &&
        intent.currency === "usd" &&
        intent.capture_method === "manual" &&
        intent.status === "requires_capture",
      JSON.stringify(intent),
    );
    const rows = await ledger(id);
    expect(
      rows.length === 1 &&
        rows[0].kind === "hold" &&
        Number(rows[0].amount) === 5000 &&
        rows[0].currency === "USD",
      JSON.stringify(rows),
    );
    const hours = (p.decision_at - p.submitted_at) / 3600000;
    expect(Math.abs(hours - 48) < 0.01, `decision window ${hours} h`);
    return `packet ${id.slice(0, 8)} submitted, decision in ${hours.toFixed(2)} h, hold until ${intent.captureBefore ? new Date(intent.captureBefore * 1000).toISOString() : "?"}`;
  },
);

await step(
  "E4.1-3",
  "the same key again returns the same request and places no second hold",
  async () => {
    const again = await http("POST", "/v1/commerce/packets", fan.token, body);
    expect(
      again.status === 200 && again.body.packet.id === id,
      `status ${again.status} id ${again.body?.packet?.id}`,
    );
    const count = (await intentsFor(id)).length;
    expect(count === 1, `${count} intents at the processor`);
    return "one request, one hold";
  },
);

await step(
  "E4.1-4",
  "Maya sees the request with the fan's summary and the price",
  async () => {
    const seen = await packet(maya, id);
    expect(seen.status === 200, `status ${seen.status}`);
    expect(
      seen.body.packet.disclosure.summary === body.disclosure.summary &&
        seen.body.packet.snapshot.amount === 5000,
      JSON.stringify(seen.body.packet.snapshot),
    );
    return `${seen.body.packet.state}, ${seen.body.packet.snapshot.amount} ${seen.body.packet.snapshot.currency}`;
  },
);

await step(
  "E4.1-5",
  "Maya accepts with her passkey: captured exactly once, commitment due in 72 h",
  async () => {
    const decided = await accept(maya, id);
    expect(
      decided.status === 200,
      `status ${decided.status} ${JSON.stringify(decided.body)}`,
    );
    const p = await packetRow(id);
    expect(
      p.state === "accepted" &&
        p.payment_state === "captured" &&
        p.accepted_act_id,
      `${p.state}/${p.payment_state}`,
    );
    const [intent] = await intentsFor(id);
    expect(
      intent.status === "succeeded" && intent.amount_received === 5000,
      `${intent.status} ${intent.amount_received}`,
    );
    const kinds = (await ledger(id)).map((r) => `${r.kind}:${r.amount}`);
    expect(kinds.join() === "hold:5000,capture:5000", kinds.join());
    const [c] = await sql(
      "SELECT state,due_at FROM creator.commerce_commitment WHERE packet_id=$1",
      [id],
    );
    const due = (c.due_at - p.accepted_at) / 3600000;
    expect(
      c.state === "due" && Math.abs(due - 72) < 0.01,
      `${c.state}, due in ${due} h`,
    );
    return `accepted; ledger ${kinds.join(" ")}; due ${c.due_at.toISOString()}`;
  },
);

let messageId;
await step(
  "E4.1-6",
  "Maya takes over and sends her reply, signed with her passkey",
  async () => {
    const root = `/v1/conversations/${CREATOR.maya}/${fan.fanId}`;
    const over = await http("POST", `${root}/takeover`, maya.token, {
      idempotencyKey: key("takeover"),
    });
    expect(
      over.status === 200 || over.code === "control_unchanged",
      `takeover ${over.status} ${JSON.stringify(over.body)}`,
    );
    const text = `Thin the glaze and fire a little slower. (${new Date().toISOString()})`;
    const signed = await signAct(
      maya,
      { actType: "reply", subjectId: thread, content: { text } },
      { fanId: fan.fanId },
    );
    expect(
      signed.signedActId,
      `signing refused ${JSON.stringify(signed.refused?.body)}`,
    );
    const sent = await http("POST", `${root}/human-replies`, maya.token, {
      text,
      signedActId: signed.signedActId,
      idempotencyKey: key("reply"),
    });
    expect(
      sent.status === 200 && sent.body.authorKind === "human_creator",
      `status ${sent.status} ${JSON.stringify(sent.body)}`,
    );
    messageId = sent.body.id;
    return `message ${messageId.slice(0, 8)} human_creator`;
  },
);

await step(
  "E4.1-7",
  "Maya delivers the reply: the commitment is delivered",
  async () => {
    const [c] = await sql(
      "SELECT version FROM creator.commerce_commitment WHERE packet_id=$1",
      [id],
    );
    const done = await http(
      "POST",
      `/v1/commerce/packets/${id}/deliver`,
      maya.token,
      { version: c.version, messageId, idempotencyKey: key("deliver") },
    );
    expect(
      done.status === 200,
      `status ${done.status} ${JSON.stringify(done.body)}`,
    );
    const [after] = await sql(
      "SELECT state,delivered_message_id FROM creator.commerce_commitment WHERE packet_id=$1",
      [id],
    );
    expect(
      after.state === "delivered" && after.delivered_message_id === messageId,
      JSON.stringify(after),
    );
    return "delivered";
  },
);

await step(
  "E4.1-8",
  "the fan's receipt shows exactly what the ledger holds",
  async () => {
    const seen = await packet(fan, id);
    expect(seen.status === 200, `status ${seen.status}`);
    const receipt = seen.body.ledger
      .map((r) => `${r.kind}:${r.amount}:${r.currency}`)
      .join();
    const truth = (await ledger(id))
      .map((r) => `${r.kind}:${r.amount}:${r.currency}`)
      .join();
    expect(
      receipt === truth && seen.body.commitment.state === "delivered",
      `receipt ${receipt}, ledger ${truth}`,
    );
    return receipt;
  },
);

// Leave the conversation as it was found: the AI speaks again.
await http(
  "POST",
  `/v1/conversations/${CREATOR.maya}/${fan.fanId}/handback`,
  maya.token,
  { idempotencyKey: key("handback") },
);
await finish();
