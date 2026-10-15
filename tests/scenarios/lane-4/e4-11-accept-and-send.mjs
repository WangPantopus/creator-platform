// E4.11 accept and send, on today's calls of contract C3 (draft, #418): the two
// taps work; when the send fails after the accept the request stays accepted
// and undelivered, and a retry with the same keys delivers once; with two open
// commitments in one conversation the creator chooses, and one reply cannot
// fulfil both; a signature older than five minutes asks to sign again; a
// changed amount in the content to sign is refused. Signed-act ages are moved
// by editing them in this stack's own database.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-11-accept-and-send.mjs
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
  key,
  offer,
  packetRow,
  setLimit,
  signAct,
  sql,
  step,
  submit,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 10 })).body;
const root = `/v1/conversations/${CREATOR.maya}/${fan.fanId}`;
const commitment = async (id) =>
  (
    await sql(
      "SELECT state,version,delivered_message_id FROM creator.commerce_commitment WHERE packet_id=$1",
      [id],
    )
  )[0];
const deliverBody = async (id, messageId, idempotencyKey = key("deliver")) => ({
  version: (await commitment(id)).version,
  messageId,
  idempotencyKey,
});
async function reply(text, idempotencyKey = key("reply")) {
  await http("POST", `${root}/takeover`, maya.token, {
    idempotencyKey: key("takeover"),
  });
  const thread = (
    await sql(
      "SELECT id FROM creator.thread WHERE creator_id=$1 AND fan_id=$2",
      [CREATOR.maya, fan.fanId],
    )
  )[0].id;
  const { signedActId } = await signAct(
    maya,
    { actType: "reply", subjectId: thread, content: { text } },
    { fanId: fan.fanId },
  );
  return { body: { text, signedActId, idempotencyKey } };
}

await step(
  "E4.11-1",
  "tap 1 (sign and accept) and tap 2 (sign and send, then deliver): delivered",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    expect((await accept(maya, id)).status === 200, "accept");
    const { body } = await reply(`Your answer (${Date.now()})`);
    const sent = await http("POST", `${root}/human-replies`, maya.token, body);
    const done = await http(
      "POST",
      `/v1/commerce/packets/${id}/deliver`,
      maya.token,
      await deliverBody(id, sent.body.id),
    );
    expect(
      sent.status === 200 &&
        done.status === 200 &&
        (await commitment(id)).state === "delivered",
      `${sent.status} ${done.status}`,
    );
    return "accepted, sent, delivered";
  },
);
await step(
  "E4.11-2",
  "the send fails after the accept: accepted and undelivered; the retry with the same keys delivers once",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    expect((await accept(maya, id)).status === 200, "accept");
    const { body } = await reply(`A retried answer (${Date.now()})`);
    // The reply is stored but its answer never reaches the Studio, so delivery was never asked.
    const lost = await http("POST", `${root}/human-replies`, maya.token, body);
    const between = await commitment(id);
    expect(
      (await packetRow(id)).state === "accepted" && between.state === "due",
      `${between.state}`,
    );
    const again = await http("POST", `${root}/human-replies`, maya.token, body);
    const deliveryKey = key("deliver");
    const first = await http(
      "POST",
      `/v1/commerce/packets/${id}/deliver`,
      maya.token,
      await deliverBody(id, again.body.id, deliveryKey),
    );
    const repeat = await http(
      "POST",
      `/v1/commerce/packets/${id}/deliver`,
      maya.token,
      {
        ...(await deliverBody(id, again.body.id, deliveryKey)),
        version: between.version,
      },
    );
    const messages = await sql(
      "SELECT count(*)::int AS n FROM creator.message WHERE thread_id=$1 AND text=$2",
      [(await packetRow(id)).thread_id, body.text],
    );
    expect(
      again.body.id === lost.body.id &&
        messages[0].n === 1 &&
        first.status === 200 &&
        repeat.status === 200 &&
        (await commitment(id)).state === "delivered",
      `${again.body.id === lost.body.id} ${messages[0].n} ${first.status} ${repeat.status}`,
    );
    return "accepted/due between; the same reply returned (1 message); delivered once, the repeat answered from the first";
  },
);
await step(
  "E4.11-3",
  "two open commitments: the creator chooses, and one reply cannot fulfil both",
  async () => {
    const a = (await submit(fan, mode)).body.packet.id;
    const b = (await submit(fan, mode)).body.packet.id;
    for (const id of [a, b])
      expect((await accept(maya, id)).status === 200, "accept");
    const { body } = await reply(`An answer for the first (${Date.now()})`);
    const sent = await http("POST", `${root}/human-replies`, maya.token, body);
    const forA = await http(
      "POST",
      `/v1/commerce/packets/${a}/deliver`,
      maya.token,
      await deliverBody(a, sent.body.id),
    );
    const forB = await http(
      "POST",
      `/v1/commerce/packets/${b}/deliver`,
      maya.token,
      await deliverBody(b, sent.body.id),
    );
    expect(
      forA.status === 200 &&
        forB.status === 403 &&
        forB.code === "delivery_already_used" &&
        (await commitment(b)).state === "due",
      `${forA.status} ${forB.status} ${forB.code}`,
    );
    const second = await reply(`And for the second (${Date.now()})`);
    const sentB = await http(
      "POST",
      `${root}/human-replies`,
      maya.token,
      second.body,
    );
    const forB2 = await http(
      "POST",
      `/v1/commerce/packets/${b}/deliver`,
      maya.token,
      await deliverBody(b, sentB.body.id),
    );
    expect(forB2.status === 200, `${forB2.status} ${forB2.code}`);
    return `first delivered; the same reply for the second: ${forB.status} ${forB.code}; a second reply delivered it`;
  },
);
await step(
  "E4.11-4",
  "a signature older than five minutes asks to sign again; a fresh one works",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    const p = await packetRow(id);
    const old = (await signAct(maya, acceptCommand(p))).signedActId;
    await sql(
      "UPDATE creator.signed_act SET verified_at=now()-interval '6 minutes' WHERE id=$1",
      [old],
    );
    const stale = await decide(maya, id, {
      action: "reply_myself",
      signedActId: old,
      version: p.version,
    });
    const fresh = await accept(maya, id);
    expect(
      stale.status === 403 &&
        stale.code === "signed_act_required" &&
        fresh.status === 200,
      `${stale.status} ${stale.code} / ${fresh.status}`,
    );
    return `stale: ${stale.status} ${stale.code}; signed again: accepted`;
  },
);
await step(
  "E4.11-5",
  "a changed amount in the content to sign is refused before any signature",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    const p = await packetRow(id);
    const tampered = acceptCommand({
      ...p,
      snapshot: { ...p.snapshot, amount: 1 },
    });
    const begun = await http(
      "POST",
      `/v1/identity/${CREATOR.maya}/signed-acts/begin`,
      maya.token,
      { command: tampered },
    );
    expect(
      begun.status === 403 && begun.code === "signed_content_changed",
      `${begun.status} ${begun.code}`,
    );
    await http("POST", `/v1/commerce/packets/${id}/withdraw`, fan.token, {
      version: p.version,
      idempotencyKey: key("withdraw"),
    });
    return `${begun.status} ${begun.code}`;
  },
);
await http("POST", `${root}/handback`, maya.token, {
  idempotencyKey: key("handback"),
});
await finish();
