// E4.8 limits: the minimum price (WP 4.6), the monthly spend limit exactly
// reached and one cent over, no limit chosen, a limit lowered while holds are
// outstanding, and an offer whose price changed between reading and sending
// (INV-13: refused, and the fan sees the new price first). Every refusal is
// checked behind the answer: no request, no hold, no slot taken. The fan's spend
// limit row is cleared in this stack's own database first, so the fan starts
// with none. Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-8-limits.mjs
import {
  ACCOUNT,
  CREATOR,
  asCreator,
  asFan,
  expect,
  finish,
  http,
  offer,
  setLimit,
  sql,
  step,
  stripeState,
  submit,
  withdraw,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanThree);
await sql("DELETE FROM creator.commerce_spend_limit WHERE fan_id=$1", [
  fan.fanId,
]);
// Withdraw this fan's earlier requests from other runs, so its exposure starts at zero.
for (const { id } of await sql(
  "SELECT id FROM creator.commerce_packet WHERE fan_id=$1 AND state IN ('submitted','more_info')",
  [fan.fanId],
))
  await withdraw(fan, id);
const made = [];
const mode = async (amount, extra = {}) => {
  const saved = await offer(maya, {
    amount,
    weeklyLimit: 5,
    title: `Written reply ${amount}`,
    ...extra,
  });
  if (saved.status === 200) made.push(saved.body.id);
  return saved;
};
const mine = async () =>
  (
    await sql("SELECT id FROM creator.commerce_packet WHERE fan_id=$1", [
      fan.fanId,
    ])
  ).map((r) => r.id);
const holds = async () => {
  const ids = new Set(await mine());
  return (await stripeState()).intents.filter(
    (i) => i.status === "requires_capture" && ids.has(i.metadata.packet_id),
  ).length;
};
const reserved = async (id) =>
  (
    await sql(
      "SELECT coalesce(sum(reserved),0)::int AS n FROM creator.commerce_capacity WHERE mode_id=$1",
      [id],
    )
  )[0].n;
/** A refusal that leaves no request, no hold and no reserved slot behind. */
async function refusedCleanly(mode, code) {
  const before = {
    holds: await holds(),
    packets: (await mine()).length,
    slots: await reserved(mode.id),
  };
  const sent = await submit(fan, mode);
  const after = {
    holds: await holds(),
    packets: (await mine()).length,
    slots: await reserved(mode.id),
  };
  expect(
    sent.status >= 400 && sent.code === code,
    `${sent.status} ${sent.code}`,
  );
  expect(
    JSON.stringify(after) === JSON.stringify(before),
    `before ${JSON.stringify(before)}, after ${JSON.stringify(after)}`,
  );
  return `${sent.status} ${sent.code}; no request, no hold, no slot`;
}

let a, b, c, d;
await step(
  "E4.8-1",
  "the minimum price: 0.49 is refused, 0.50 is accepted, a 0.30 public price is refused",
  async () => {
    const low = await mode(49);
    const lowPublic = await mode(5000, { publicAmount: 30 });
    const ok = await mode(50);
    expect(
      low.status === 403 &&
        low.code === "price_below_minimum" &&
        lowPublic.code === "price_below_minimum" &&
        ok.status === 200,
      `${low.status} ${low.code} / ${lowPublic.code} / ${ok.status}`,
    );
    c = ok.body;
    return `${low.status} ${low.code}: "${low.body.error.message}"; public 0.30: ${lowPublic.code}; 0.50: saved`;
  },
);
await step(
  "E4.8-2",
  "no monthly limit chosen: refused before any hold",
  async () => {
    a = (await mode(5000)).body;
    return refusedCleanly(a, "spend_limit_required");
  },
);
await step(
  "E4.8-3",
  "a 100.49 limit: 50.00 and 49.99 held; a 0.51 request (one cent over) refused",
  async () => {
    expect((await setLimit(fan, 10049)).status === 200, "limit");
    b = (await mode(4999)).body;
    d = (await mode(51)).body;
    const first = await submit(fan, a);
    const second = await submit(fan, b);
    expect(
      first.body?.packet?.state === "submitted" &&
        second.body?.packet?.state === "submitted",
      `${first.code ?? first.body.packet.state} ${second.code ?? second.body.packet.state}`,
    );
    return `99.99 held; one cent over: ${await refusedCleanly(d, "spend_limit")}`;
  },
);
await step(
  "E4.8-4",
  "a 0.50 request reaches the limit exactly and is held; one more is refused",
  async () => {
    const exact = await submit(fan, c);
    expect(
      exact.body?.packet?.state === "submitted",
      `${exact.status} ${exact.code}`,
    );
    return `100.49 of 100.49 held; then ${await refusedCleanly(c, "spend_limit")}`;
  },
);
await step(
  "E4.8-5",
  "the limit lowered to 50.00 while 100.49 is held: the holds stay, new requests are refused",
  async () => {
    const lowered = await setLimit(fan, 5000);
    const live = await sql(
      "SELECT count(*)::int AS n FROM creator.commerce_packet WHERE fan_id=$1 AND state='submitted' AND payment_state='requires_capture'",
      [fan.fanId],
    );
    expect(
      lowered.status === 200 && live[0].n === 3,
      `${lowered.status}, ${live[0].n} live holds`,
    );
    return `limit now 50.00 at once; 3 holds untouched; ${await refusedCleanly(c, "spend_limit")}`;
  },
);
await step(
  "E4.8-6",
  "the price changes between reading the offer and sending: refused, and the fan sees the new price",
  async () => {
    for (const { id } of await sql(
      "SELECT id FROM creator.commerce_packet WHERE fan_id=$1 AND state='submitted'",
      [fan.fanId],
    ))
      await withdraw(fan, id);
    const read = (
      await http(
        "GET",
        `/v1/commerce/overview?creatorId=${CREATOR.maya}`,
        fan.token,
      )
    ).body.modes.find((m) => m.id === a.id);
    const changed = await http(
      "POST",
      `/v1/commerce/creators/${CREATOR.maya}/modes/${a.id}`,
      maya.token,
      {
        title: "Written reply 6000",
        kind: "written_reply",
        amount: 6000,
        publicAmount: null,
        currency: "USD",
        decisionHours: 48,
        deliveryHours: 72,
        durationSeconds: null,
        weeklyLimit: 5,
        shareable: false,
        state: "offered",
        version: read.version,
        idempotencyKey: `edit-${a.id}`,
      },
    );
    expect(changed.status === 200, `edit ${changed.status} ${changed.code}`);
    const refusal = await refusedCleanly(
      { id: a.id, version: read.version },
      "mode_unavailable",
    );
    const now = (
      await http(
        "GET",
        `/v1/commerce/overview?creatorId=${CREATOR.maya}`,
        fan.token,
      )
    ).body.modes.find((m) => m.id === a.id);
    expect(
      Number(read.amount) === 5000 &&
        Number(now.amount) === 6000 &&
        now.version === read.version + 1,
      `${read.amount} v${read.version} -> ${now.amount} v${now.version}`,
    );
    return `${refusal}; the fan now reads 60.00 (version ${now.version})`;
  },
);
// Leave the other runs' view of Maya's offers as it was: these offers are hidden again.
await sql(
  "UPDATE creator.commerce_mode SET state='hidden' WHERE id=ANY($1::uuid[])",
  [made],
);
await finish();
