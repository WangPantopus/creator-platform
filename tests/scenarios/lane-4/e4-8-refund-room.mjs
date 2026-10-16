// E4.8 and the founder's decision 1 (lane-4-decisions.md, taken as the
// proposed default on 2026-10-16): a refunded payment gives its room under the
// fan's monthly limit back. A fan with $60 of room pays $50 and Maya misses her
// deadline. While the refund is in flight the $50 still counts, so a $20
// request is refused. Once the refund succeeds the fan has the whole $60 again,
// to the cent: a $60 request is held and the minimum one more is refused.
// The fan's spending screen, in a real browser, reads what is enforced.
// Another fan's refund gives this fan nothing, and reading again changes
// nothing. The fan's limit row is reset, and the deadline and the refund's
// retry are moved, in this stack's own database. Needs the stack's web app.
// Fakes: card processor (refund outcomes), development identity, software
// passkey.
//   node tests/scenarios/lane-4/e4-8-refund-room.mjs
import { chromium } from "@playwright/test";
import {
  ACCOUNT,
  CREATOR,
  ORIGIN,
  accept,
  asCreator,
  asFan,
  expect,
  finish,
  http,
  ledger,
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
const fan = await asFan(ACCOUNT.fanOne);
const other = await asFan(ACCOUNT.fanTwo);
await stopScheduler();
await startScheduler(2000);
const money = { written: 5000, small: 2000, room: 6000, minimum: 50 };
const modes = {};
for (const [name, amount] of Object.entries(money))
  modes[name] = (
    await offer(maya, {
      amount,
      weeklyLimit: 20,
      title: `Written reply (refund room, ${amount})`,
    })
  ).body;

const exposure = async (who = fan) =>
  (
    await http(
      "GET",
      `/v1/commerce/overview?creatorId=${CREATOR.maya}`,
      who.token,
    )
  ).body.exposure;
async function until(what, check, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}
const mine = async () =>
  (
    await sql("SELECT id FROM creator.commerce_packet WHERE fan_id=$1", [
      fan.fanId,
    ])
  ).map((r) => r.id);
/** Refused for the limit, leaving no request and no hold behind. */
async function refusedForLimit(mode) {
  const before = (await mine()).length;
  const holds = (await stripeState()).intents.length;
  const sent = await submit(fan, mode);
  expect(
    sent.code === "spend_limit" &&
      (await mine()).length === before &&
      (await stripeState()).intents.length === holds,
    `${sent.status} ${sent.code}`,
  );
  return `${sent.status} ${sent.code}, no request, no hold`;
}
/** An accepted request whose deadline has just passed, refunded by the
 * scheduler with the processor answering `status`. */
async function missed(who, status) {
  const id = (await submit(who, modes.written)).body.packet.id;
  expect((await accept(maya, id)).status === 200, "accept");
  await stripe({ refundStatus: status });
  await sql(
    "UPDATE creator.commerce_commitment SET due_at=now()-interval '1 second' WHERE packet_id=$1",
    [id],
  );
  await until(
    "the refund",
    async () =>
      ["refund_pending", "refunded"].includes(
        (await packetRow(id)).payment_state,
      ) &&
      (
        await sql(
          "SELECT 1 FROM creator.commerce_effect WHERE packet_id=$1 AND operation='refund' AND provider_ref IS NOT NULL",
          [id],
        )
      ).length,
  );
  await stripe({ refundStatus: "succeeded" });
  return id;
}

// This fan's own month: open requests withdrawn, the limit chosen afresh (so it
// applies at once), at what the fan has already spent plus $60.
for (const { id } of await sql(
  "SELECT id FROM creator.commerce_packet WHERE fan_id=$1 AND state IN ('submitted','more_info')",
  [fan.fanId],
))
  await withdraw(fan, id);
await sql("DELETE FROM creator.commerce_spend_limit WHERE fan_id=$1", [
  fan.fanId,
]);
await setLimit(other, 1_000_000);
const base = await exposure();
expect((await setLimit(fan, base.total + money.room)).status === 200, "limit");

/** Pays for a written reply now: Maya accepts, and the $50 is captured. */
async function paidReply() {
  const id = (await submit(fan, modes.written)).body.packet.id;
  expect((await accept(maya, id)).status === 200, "accept");
  return id;
}
let paid;
await step(
  "D1-1",
  "a $50 payment counts against the $60: a $20 request is refused",
  async () => {
    paid = await paidReply();
    const e = await exposure();
    expect(
      e.total === base.total + money.written && e.returned === base.returned,
      JSON.stringify(e),
    );
    return `total ${e.total - base.total} over the month's start; ${await refusedForLimit(modes.small)}`;
  },
);
await step(
  "D1-2",
  "Maya misses her deadline; while the refund is in flight the $50 still counts",
  async () => {
    await stripe({ refundStatus: "pending" });
    await sql(
      "UPDATE creator.commerce_commitment SET due_at=now()-interval '1 second' WHERE packet_id=$1",
      [paid],
    );
    await until(
      "the refund call",
      async () =>
        (
          await sql(
            "SELECT 1 FROM creator.commerce_effect WHERE packet_id=$1 AND operation='refund' AND provider_ref IS NOT NULL",
            [paid],
          )
        ).length,
    );
    const p = await packetRow(paid);
    const e = await exposure();
    expect(
      p.payment_state === "refund_pending" &&
        e.total === base.total + money.written &&
        e.returned === base.returned,
      `${p.payment_state}, ${JSON.stringify(e)}`,
    );
    return `${p.payment_state}; still counts ${e.total - base.total}; ${await refusedForLimit(modes.small)}`;
  },
);
await step(
  "D1-3",
  "the refund succeeds: the whole $60 is back, to the cent ($60 held, the minimum more refused)",
  async () => {
    const intent = (await packetRow(paid)).intent_ref;
    const [refund] = (await stripeState()).refunds.filter(
      (r) => r.payment_intent === intent,
    );
    await stripe({ settleRefund: refund.id, status: "succeeded" });
    await sql(
      "UPDATE creator.commerce_effect SET next_at=now() WHERE packet_id=$1 AND operation='refund' AND state<>'done'",
      [paid],
    );
    await until(
      "the refund to finish",
      async () => (await packetRow(paid)).payment_state === "refunded",
    );
    const e = await exposure();
    expect(
      e.total === base.total &&
        e.returned === base.returned + money.written &&
        e.captured === base.captured + money.written,
      JSON.stringify(e),
    );
    const full = await submit(fan, modes.room);
    expect(
      full.body?.packet?.state === "submitted",
      `the $60 request: ${full.status} ${full.code}`,
    );
    return `refunded; total back to the month's start (captured ${e.captured - base.captured}, returned ${e.returned - base.returned}); $60 held; the minimum more: ${await refusedForLimit(modes.minimum)}`;
  },
);
await step(
  "D1-4",
  "the fan's spending screen reads what is enforced",
  async () => {
    const e = await exposure();
    const dollars = (minor) =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(minor / 100);
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      const context = await browser.newContext({
        locale: "en-US",
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      await page.goto(
        `${ORIGIN}/auth/continue?returnTo=%2Fcommerce%2Fspending`,
      );
      await page.getByRole("link", { name: "Continue with Pantopus" }).click();
      await page
        .getByRole("button", { name: "Development actor one", exact: true })
        .click();
      await page.waitForURL((url) => url.pathname === "/commerce/spending", {
        timeout: 60000,
      });
      const headline = page.locator(".commerce-spend-total");
      await headline.waitFor({ timeout: 60000 });
      const shown = (await headline.innerText()).trim();
      const bar = await page
        .getByRole("progressbar", { name: "Monthly exposure" })
        .getAttribute("aria-valuetext");
      const want = dollars(e.captured - e.returned);
      expect(
        shown === want && bar.startsWith(`${dollars(e.total)} including`),
        `headline ${shown} (want ${want}); bar "${bar}"`,
      );
      return `headline ${shown} (captured ${dollars(e.captured)} less ${dollars(e.returned)} refunded); bar "${bar}"`;
    } finally {
      await browser.close();
    }
  },
);
await step(
  "D1-5",
  "wrong person: another fan's refund gives this fan nothing",
  async () => {
    const before = await exposure();
    const theirs = await missed(other, "succeeded");
    await until(
      "their refund",
      async () => (await packetRow(theirs)).payment_state === "refunded",
    );
    const after = await exposure();
    expect(
      JSON.stringify(after) === JSON.stringify(before),
      JSON.stringify(after),
    );
    return `their request refunded; this fan's exposure unchanged (${after.total})`;
  },
);
await step(
  "D1-6",
  "repeat: reading again changes nothing; one refund line, one room returned",
  async () => {
    const a = await exposure();
    const b = await exposure();
    const lines = (await ledger(paid)).map((r) => r.kind).join(" ");
    expect(
      JSON.stringify(a) === JSON.stringify(b) &&
        lines === "hold capture refund",
      `${lines}; ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
    );
    return `ledger ${lines}; the same exposure twice`;
  },
);
for (const { id } of await sql(
  "SELECT id FROM creator.commerce_packet WHERE fan_id=$1 AND state='submitted'",
  [fan.fanId],
))
  await withdraw(fan, id);
await stripe({ refundStatus: "succeeded" });
await finish();
