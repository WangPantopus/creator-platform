// E4.9 capacity (INV-10): three fans send at once to an offer with two slots
// left: exactly two are held, the third is refused before any hold; the number
// a fan reads equals the capacity row and what is enforced; a decline and an
// expiry each free a slot that another fan can then book, and so does a refund
// for a missed deadline (the founder's decision 2, taken as the proposed
// default on 2026-10-16; e4-9-refund-slot covers it in full). Deadlines are
// moved by editing them in this stack's own database.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-9-capacity.mjs
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
  offer,
  packetRow,
  setLimit,
  sleep,
  sql,
  step,
  stripeState,
  submit,
  withdraw,
} from "./lib.mjs";
import { startScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fans = [
  await asFan(ACCOUNT.fanOne),
  await asFan(ACCOUNT.fanTwo),
  await asFan(ACCOUNT.fanThree),
];
for (const fan of fans) {
  await sql("DELETE FROM creator.commerce_spend_limit WHERE fan_id=$1", [
    fan.fanId,
  ]);
  await setLimit(fan, null);
}
const mode = (
  await offer(maya, { weeklyLimit: 2, title: "Written reply (two a week)" })
).body;
await startScheduler(2000);
const row = async () =>
  (
    await sql(
      "SELECT capacity_limit,reserved,used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0];
const shown = async (fan) => {
  const m = (
    await http(
      "GET",
      `/v1/commerce/overview?creatorId=${CREATOR.maya}`,
      fan.token,
    )
  ).body.modes.find((x) => x.id === mode.id);
  return m.weekly_limit - Number(m.used) - Number(m.reserved);
};
const holdsFor = async (ids) =>
  (await stripeState()).intents.filter(
    (i) =>
      ids.includes(i.metadata.packet_id) && i.status === "requires_capture",
  ).length;
async function until(what, check, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}

let held;
let waiting;
await step(
  "E4.9-2",
  "three fans send at once with two slots: exactly two are held, one refused before any hold",
  async () => {
    const answers = await Promise.all(fans.map((fan) => submit(fan, mode)));
    held = answers
      .filter((a) => a.body?.packet?.state === "submitted")
      .map((a) => a.body.packet.id);
    const refused = answers.filter((a) => a.status >= 400);
    waiting = fans[answers.findIndex((a) => a.status >= 400)];
    const all = (
      await sql("SELECT id FROM creator.commerce_packet WHERE mode_id=$1", [
        mode.id,
      ])
    ).map((r) => r.id);
    expect(
      held.length === 2 &&
        refused.length === 1 &&
        refused[0].code === "capacity_full" &&
        all.length === 2 &&
        (await holdsFor(all)) === 2,
      `${held.length} held, ${refused.map((r) => r.code)}, ${all.length} requests`,
    );
    return `2 held, 1 refused (${refused[0].status} ${refused[0].code}), 2 requests, 2 holds; row ${JSON.stringify(await row())}`;
  },
);
await step(
  "E4.9-3",
  "what each fan reads equals the capacity row and what is enforced",
  async () => {
    const counts = await Promise.all(fans.map(shown));
    const r = await row();
    expect(
      counts.every((n) => n === 0) &&
        r.capacity_limit - r.used - r.reserved === 0,
      `${counts} vs ${JSON.stringify(r)}`,
    );
    return `every fan reads 0 left; row ${r.reserved} reserved + ${r.used} used of ${r.capacity_limit}`;
  },
);
await step(
  "E4.9-4",
  "a decline frees a slot, and the waiting fan can now book it",
  async () => {
    expect(
      (await decide(maya, held[0], { action: "decline" })).status === 200,
      "decline",
    );
    const freed = await shown(waiting);
    const third = await submit(waiting, mode);
    expect(
      freed === 1 && third.body?.packet?.state === "submitted",
      `${freed} shown free, then ${third.status} ${third.code}`,
    );
    held = [held[1], third.body.packet.id];
    return `1 slot shown free after the decline; booked again (${JSON.stringify(await row())})`;
  },
);
await step(
  "E4.9-5",
  "an expiry frees a slot too, with nobody tapping",
  async () => {
    await sql(
      "UPDATE creator.commerce_packet SET decision_at=now()-interval '1 second' WHERE id=$1",
      [held[0]],
    );
    await until(
      "the expiry",
      async () => (await packetRow(held[0])).state === "expired",
    );
    const r = await row();
    expect(r.reserved === 1 && (await shown(fans[0])) === 1, JSON.stringify(r));
    return `expired; row ${JSON.stringify(r)}; fans read 1 left`;
  },
);
await step(
  "E4.9-6",
  "a refund for a missed deadline frees its slot too (decision 2), with nobody tapping",
  async () => {
    expect((await accept(maya, held[1])).status === 200, "accept");
    const before = await row();
    await sql(
      "UPDATE creator.commerce_commitment SET due_at=now()-interval '1 second' WHERE packet_id=$1",
      [held[1]],
    );
    await until(
      "the refund",
      async () => (await packetRow(held[1])).payment_state === "refunded",
    );
    const after = await row();
    expect(
      after.used === before.used - 1 &&
        (await shown(fans[0])) ===
          after.capacity_limit - after.used - after.reserved,
      `accepted: ${JSON.stringify(before)}; refunded: ${JSON.stringify(after)}`,
    );
    return `accepted: ${JSON.stringify(before)}; refunded: ${JSON.stringify(after)}; the slot is freed, and fans read it`;
  },
);
for (const { id, fan_id } of await sql(
  "SELECT id,fan_id FROM creator.commerce_packet WHERE mode_id=$1 AND state='submitted'",
  [mode.id],
))
  await withdraw(
    fans.find((f) => f.fanId === fan_id),
    id,
  );
await finish();
