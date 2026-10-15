// E4.10 card failures: a declined card, insufficient funds, an expired card,
// failed 3-D Secure and an unknown payment method each place no hold, free the
// slot at once and leave the request ready for another card; another card
// then holds once. The fan's status screen for a failed card is read in the
// browser separately (no purchase is offered as the way out).
// Fakes: card processor (Stripe-style declines), development identity,
// software passkey.
//   node tests/scenarios/lane-4/e4-10-card-failures.mjs
import {
  ACCOUNT,
  CREATOR,
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
  sql,
  step,
  stripe,
  submit,
} from "./lib.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (
  await offer(maya, { weeklyLimit: 1, title: "Written reply (one a week)" })
).body;
const slot = async () =>
  (
    await sql(
      "SELECT reserved,used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0] ?? { reserved: 0, used: 0 };
/** The card failed: no hold anywhere, the slot is free again, ready for another card. */
async function failedCleanly(id) {
  const p = await packetRow(id);
  const open = (await intentsFor(id)).filter(
    (i) => i.status === "requires_capture",
  ).length;
  const rows = (await ledger(id)).length;
  const s = await slot();
  expect(
    p.state === "draft" &&
      p.payment_state === "failed" &&
      open === 0 &&
      rows === 0 &&
      s.reserved === 0,
    `${p.state}/${p.payment_state}, ${open} holds, ${rows} ledger rows, ${s.reserved} reserved`,
  );
  return `${p.state}/${p.payment_state}; no hold, nothing in the ledger, slot free`;
}
const ids = {};
for (const [id, card, label] of [
  ["E4.10-6", "pm_cardDeclined", "a declined card"],
  ["E4.10-7", "pm_cardInsufficientFunds", "insufficient funds"],
  ["E4.10-8", "pm_cardExpired", "an expired card"],
  [
    "E4.10-9",
    "pm_cardUnknown123",
    "a payment method the processor does not know (a 400)",
  ],
])
  await step(id, `${label}: no hold, the slot is free at once`, async () => {
    const sent = await submit(fan, mode, { paymentMethodId: card });
    expect(sent.status === 200, `${sent.status} ${sent.code}`);
    ids[card] = sent.body.packet.id;
    return failedCleanly(sent.body.packet.id);
  });
await step(
  "E4.10-10",
  "3-D Secure fails: no hold, the slot is free once the fan's screen checks",
  async () => {
    const sent = await submit(fan, mode, {
      paymentMethodId: "pm_cardAuthRequired",
    });
    const id = sent.body.packet.id;
    await stripe({ authenticate: (await packetRow(id)).intent_ref, ok: false });
    const checked = await http(
      "POST",
      `/v1/commerce/packets/${id}/reconcile`,
      fan.token,
      {},
    );
    expect(checked.status === 200, `${checked.status} ${checked.code}`);
    ids.auth = id;
    return failedCleanly(id);
  },
);
await step(
  "E4.10-11",
  "after a declined card, another card holds once on the same request",
  async () => {
    const id = ids.pm_cardDeclined;
    const p = await packetRow(id);
    const again = await http(
      "POST",
      `/v1/commerce/packets/${id}/reauthorize`,
      fan.token,
      {
        version: p.version,
        paymentMethodId: "pm_cardVisa",
        idempotencyKey: key("reauthorize"),
      },
    );
    const after = await packetRow(id);
    const live = (await intentsFor(id)).filter(
      (i) => i.status === "requires_capture",
    ).length;
    expect(
      again.status === 200 &&
        after.state === "submitted" &&
        live === 1 &&
        (await slot()).reserved === 1,
      `${again.status} ${again.code} ${after.state} ${live}`,
    );
    return `${after.state}/${after.payment_state}; 1 hold; attempt ${after.authorization_attempt}`;
  },
);
await step(
  "E4.10-12",
  "with the one slot taken, another failed request cannot be re-authorized into it",
  async () => {
    const id = ids.pm_cardInsufficientFunds;
    const p = await packetRow(id);
    const again = await http(
      "POST",
      `/v1/commerce/packets/${id}/reauthorize`,
      fan.token,
      {
        version: p.version,
        paymentMethodId: "pm_cardVisa",
        idempotencyKey: key("reauthorize"),
      },
    );
    expect(
      again.status === 403 &&
        again.code === "capacity_full" &&
        (await packetRow(id)).state === "draft",
      `${again.status} ${again.code}`,
    );
    return `${again.status} ${again.code}; still draft, nothing held`;
  },
);
for (const { id } of await sql(
  "SELECT id FROM creator.commerce_packet WHERE mode_id=$1 AND state='submitted'",
  [mode.id],
))
  await http("POST", `/v1/commerce/packets/${id}/withdraw`, fan.token, {
    version: (await packetRow(id)).version,
    idempotencyKey: key("withdraw"),
  });
await finish();
