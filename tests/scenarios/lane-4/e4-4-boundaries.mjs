// E4.4 late and boundary: an accept one second before the decision deadline
// is captured, one second after is refused with the signature unspent; an
// accept when under six hours of the card hold remain is refused and captures
// nothing, and the request then ends released; a decision window of zero hours
// cannot be offered; a delivery one second before its deadline lands, one
// second after is refused and refunded. Deadlines are moved by editing them in
// this stack's own database; the scheduler is stopped where it would race.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-4-boundaries.mjs
import {
  ACCOUNT,
  CREATOR,
  accept,
  acceptCommand,
  asCreator,
  asFan,
  decide,
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
  stripeState,
  submit,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 10 })).body;
const root = `/v1/conversations/${CREATOR.maya}/${fan.fanId}`;
const spent = async (id) =>
  (
    await sql(
      "SELECT 1 FROM creator.signed_act_consumption WHERE signed_act_id=$1",
      [id],
    )
  ).length === 1;
const captures = async (id) => {
  const [intent] = await intentsFor(id);
  return (await stripeState()).calls.filter(
    (c) => c.op === "capture" && c.ref === intent.id,
  ).length;
};
async function signed(seconds) {
  const p = (await submit(fan, mode)).body.packet;
  const { signedActId } = await signAct(
    maya,
    acceptCommand(await packetRow(p.id)),
  );
  await sql(
    "UPDATE creator.commerce_packet SET decision_at=now()+($2*interval '1 second') WHERE id=$1",
    [p.id, seconds],
  );
  return { id: p.id, signedActId };
}
async function until(what, check, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}

await stopScheduler();
await step(
  "E4.4-1",
  "an accept one second before the decision deadline is captured",
  async () => {
    const { id, signedActId } = await signed(1);
    const done = await decide(maya, id, {
      action: "reply_myself",
      signedActId,
    });
    expect(
      done.status === 200 && (await packetRow(id)).state === "accepted",
      `${done.status} ${done.code}`,
    );
    return `accepted with ${(await packetRow(id)).decision_at.getTime() - Date.now()} ms left on the window`;
  },
);
await step(
  "E4.4-2",
  "an accept one second after it is refused, nothing captured, the signature unspent",
  async () => {
    const { id, signedActId } = await signed(60);
    await sql(
      "UPDATE creator.commerce_packet SET decision_at=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    const late = await decide(maya, id, {
      action: "reply_myself",
      signedActId,
    });
    expect(
      late.status === 403 &&
        late.code === "decision_expired" &&
        !(await spent(signedActId)) &&
        (await captures(id)) === 0,
      `${late.status} ${late.code}`,
    );
    return `${late.status} ${late.code}; signature unspent; 0 capture calls`;
  },
);
await step(
  "E4.4-3",
  "under six hours of hold left: no new signature, and an earlier signature cannot accept",
  async () => {
    const { id, signedActId } = await signed(3600);
    await sql(
      "UPDATE creator.commerce_packet SET hold_expires_at=now()+interval '5 hours 59 minutes' WHERE id=$1",
      [id],
    );
    const fresh = await accept(maya, id);
    const earlier = await decide(maya, id, {
      action: "reply_myself",
      signedActId,
    });
    expect(
      fresh.status === 403 &&
        earlier.status === 403 &&
        earlier.code === "authorization_expiring" &&
        !(await spent(signedActId)) &&
        (await captures(id)) === 0 &&
        (await packetRow(id)).state === "submitted",
      `${fresh.status} ${fresh.code} / ${earlier.status} ${earlier.code}`,
    );
    return `new signature: ${fresh.status} ${fresh.code}; signed earlier: ${earlier.status} ${earlier.code}, unspent; 0 capture calls`;
  },
);
await step(
  "E4.4-4",
  "that request then ends released by the scheduler, nobody tapping",
  async () => {
    const [{ id }] = await sql(
      "SELECT id FROM creator.commerce_packet WHERE mode_id=$1 AND hold_expires_at<now()+interval '6 hours' AND state='submitted'",
      [mode.id],
    );
    await sql(
      "UPDATE creator.commerce_packet SET decision_at=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    await startScheduler(2000);
    await until(
      "the release",
      async () => (await packetRow(id)).state === "expired",
    );
    await stopScheduler();
    const rows = (await ledger(id)).map((r) => r.kind).join(" ");
    expect(rows === "hold release" && (await captures(id)) === 0, rows);
    return `expired/released; ledger ${rows}`;
  },
);
await step(
  "E4.4-5",
  "a decision window of zero hours cannot be offered",
  async () => {
    const zero = await offer(maya, { decisionHours: 0 });
    const one = await offer(maya, { decisionHours: 1 });
    expect(
      zero.status === 400 && one.status === 200,
      `${zero.status} ${zero.code} / ${one.status}`,
    );
    return `0 h: ${zero.status} ${zero.code}; 1 h: saved`;
  },
);
async function acceptedWithReply() {
  const id = (await submit(fan, mode)).body.packet.id;
  expect((await accept(maya, id)).status === 200, "accept");
  await http("POST", `${root}/takeover`, maya.token, {
    idempotencyKey: key("takeover"),
  });
  const text = `On time? (${Date.now()})`;
  const { signedActId } = await signAct(
    maya,
    {
      actType: "reply",
      subjectId: (await packetRow(id)).thread_id,
      content: { text },
    },
    { fanId: fan.fanId },
  );
  const message = (
    await http("POST", `${root}/human-replies`, maya.token, {
      text,
      signedActId,
      idempotencyKey: key("reply"),
    })
  ).body;
  return { id, message };
}
const deliver = async (id, messageId) => {
  const [c] = await sql(
    "SELECT version FROM creator.commerce_commitment WHERE packet_id=$1",
    [id],
  );
  return http("POST", `/v1/commerce/packets/${id}/deliver`, maya.token, {
    version: c.version,
    messageId,
    idempotencyKey: key("deliver"),
  });
};
await step(
  "E4.4-6",
  "a delivery one second before its deadline lands",
  async () => {
    const { id, message } = await acceptedWithReply();
    await sql(
      "UPDATE creator.commerce_commitment SET due_at=now()+interval '1 second' WHERE packet_id=$1",
      [id],
    );
    const done = await deliver(id, message.id);
    expect(done.status === 200, `${done.status} ${done.code}`);
    // Put the real deadline back, so the history stays true for the sweep.
    await sql(
      "UPDATE creator.commerce_commitment c SET due_at=p.accepted_at+interval '72 hours' FROM creator.commerce_packet p WHERE p.id=c.packet_id AND c.packet_id=$1",
      [id],
    );
    return "delivered";
  },
);
await step(
  "E4.4-7",
  "one second after it is refused, and the scheduler refunds it",
  async () => {
    const { id, message } = await acceptedWithReply();
    await sql(
      "UPDATE creator.commerce_commitment SET due_at=now()-interval '1 second' WHERE packet_id=$1",
      [id],
    );
    const late = await deliver(id, message.id);
    expect(
      late.status === 403 && late.code === "deadline_passed",
      `${late.status} ${late.code}`,
    );
    await startScheduler(2000);
    await until(
      "the refund",
      async () => (await packetRow(id)).payment_state === "refunded",
    );
    return `${late.status} ${late.code}; then refunded`;
  },
);
await http("POST", `${root}/handback`, maya.token, {
  idempotencyKey: key("handback"),
});
await finish();
