// E4.9 and the founder's decision 2 (lane-4-decisions.md, taken as the
// proposed default on 2026-10-16): a request Maya accepted and then did not
// deliver gives its weekly slot back once it is refunded in full. With a full
// week, the slot stays taken while the refund is in flight (nothing is freed
// on a guess), and is freed the moment the refund succeeds: the waiting fan
// can book it, and what every fan reads, the public summary included, equals
// the capacity row. A refund that fails first and is retried frees exactly one
// slot, not two. Deadlines and retries are moved in this stack's own database.
// Fakes: card processor (refund outcomes), development identity, software
// passkey.
//   node tests/scenarios/lane-4/e4-9-refund-slot.mjs
import {
  ACCOUNT,
  API,
  CREATOR,
  accept,
  asCreator,
  asFan,
  expect,
  finish,
  http,
  offer,
  packetRow,
  setLimit,
  sleep,
  sql,
  step,
  stripe,
  stripeState,
  submit,
  withdraw,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
const waiting = await asFan(ACCOUNT.fanOne);
for (const who of [fan, waiting]) {
  await sql("DELETE FROM creator.commerce_spend_limit WHERE fan_id=$1", [
    who.fanId,
  ]);
  await setLimit(who, null);
}
await stopScheduler();
await startScheduler(2000);
const mode = (
  await offer(maya, { weeklyLimit: 1, title: "Written reply (one a week)" })
).body;

const row = async () =>
  (
    await sql(
      "SELECT capacity_limit,reserved,used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0];
/** What a signed-in fan reads for this offer: slots left this week. */
const shown = async (who) => {
  const m = (
    await http(
      "GET",
      `/v1/commerce/overview?creatorId=${CREATOR.maya}`,
      who.token,
    )
  ).body.modes.find((x) => x.id === mode.id);
  return m.weekly_limit - Number(m.used) - Number(m.reserved);
};
/** What a signed-out visitor reads in the public summary. */
const summary = async () =>
  (
    await (
      await fetch(`${API}/v1/commerce/creators/${CREATOR.maya}/summary`)
    ).json()
  ).offers.find((o) => o.modeId === mode.id)?.left;
async function until(what, check, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}
const refundCall = (id) =>
  until(
    "the refund call",
    async () =>
      (
        await sql(
          "SELECT 1 FROM creator.commerce_effect WHERE packet_id=$1 AND operation='refund' AND provider_ref IS NOT NULL",
          [id],
        )
      ).length,
  );
const retryRefunds = (id) =>
  sql(
    "UPDATE creator.commerce_effect SET next_at=now() WHERE packet_id=$1 AND operation='refund' AND state<>'done'",
    [id],
  );
/** Maya accepts the fan's request; its delivery deadline then passes. */
async function acceptedThenMissed(status) {
  const id = (await submit(fan, mode)).body.packet.id;
  expect((await accept(maya, id)).status === 200, "accept");
  await stripe({ refundStatus: status });
  await sql(
    "UPDATE creator.commerce_commitment SET due_at=now()-interval '1 second' WHERE packet_id=$1",
    [id],
  );
  await refundCall(id);
  return id;
}

let missed;
await step(
  "D2-1",
  "a full week: the slot stays taken while the refund is in flight; the waiting fan is refused",
  async () => {
    missed = await acceptedThenMissed("pending");
    const r = await row();
    const refused = await submit(waiting, mode);
    expect(
      (await packetRow(missed)).payment_state === "refund_pending" &&
        r.used === 1 &&
        r.reserved === 0 &&
        (await shown(waiting)) === 0 &&
        refused.code === "capacity_full",
      `${JSON.stringify(r)}, ${refused.status} ${refused.code}`,
    );
    return `refund pending; row ${JSON.stringify(r)}; the waiting fan reads 0 left and is refused (${refused.status} ${refused.code})`;
  },
);
let booked;
await step(
  "D2-2",
  "the refund succeeds: the slot is freed at once, and the waiting fan books it",
  async () => {
    const intent = (await packetRow(missed)).intent_ref;
    const [refund] = (await stripeState()).refunds.filter(
      (r) => r.payment_intent === intent,
    );
    await stripe({ settleRefund: refund.id, status: "succeeded" });
    await stripe({ refundStatus: "succeeded" });
    await retryRefunds(missed);
    await until(
      "the refund to finish",
      async () => (await packetRow(missed)).payment_state === "refunded",
    );
    const r = await row();
    const counts = [await shown(waiting), await shown(fan), await summary()];
    expect(
      r.used === 0 && r.reserved === 0 && counts.every((n) => n === 1),
      `${JSON.stringify(r)}; fans and summary read ${counts}`,
    );
    booked = await submit(waiting, mode);
    expect(
      booked.body?.packet?.state === "submitted",
      `${booked.status} ${booked.code}`,
    );
    return `refunded; row ${JSON.stringify(r)}; both fans and the public summary read 1 left; the waiting fan booked it`;
  },
);
await step(
  "D2-3",
  "repeat: a refund that fails, then succeeds on its retry, frees exactly one slot",
  async () => {
    if (booked?.body?.packet)
      expect(
        (await withdraw(waiting, booked.body.packet.id)).status === 200,
        "withdraw",
      );
    const before = await row();
    const id = await acceptedThenMissed("failed");
    const taken = await row();
    await stripe({ refundStatus: "succeeded" });
    await until("the retried refund", async () => {
      await retryRefunds(id);
      return (await packetRow(id)).payment_state === "refunded";
    });
    const r = await row();
    const tries = (
      await sql(
        "SELECT count(*)::int AS n FROM creator.commerce_effect WHERE packet_id=$1 AND operation='refund'",
        [id],
      )
    )[0].n;
    expect(
      taken.used === before.used + 1 &&
        r.used === before.used &&
        r.reserved === 0 &&
        tries >= 2,
      `${JSON.stringify(before)} -> ${JSON.stringify(taken)} -> ${JSON.stringify(r)}, ${tries} refund effect(s)`,
    );
    return `used ${before.used} -> ${taken.used} -> ${r.used} after ${tries} refund tries (one failed)`;
  },
);
await stripe({ refundStatus: "succeeded" });
for (const { id, fan_id } of await sql(
  "SELECT id,fan_id FROM creator.commerce_packet WHERE mode_id=$1 AND state='submitted'",
  [mode.id],
))
  await withdraw(fan_id === fan.fanId ? fan : waiting, id);
await finish();
