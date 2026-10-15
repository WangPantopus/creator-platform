// E4.5, the refund failure cases (WP 4.3): a refund for an overdue commitment
// that the processor fails is never dropped. Down or 5xx: tried again later each
// time, reported to operations after six tries and still tried. Refused (4xx):
// reported to operations at once. Reported failed: tried again as a new refund,
// up to three, then reported. Every outcome is checked in the ledger, at the
// processor and in the request's events. Waits between tries are read from the
// database, then shortened by editing them in this stack's own database.
// Fakes: card processor (faults and refund outcomes), development identity,
// software passkey.
//   node tests/scenarios/lane-4/e4-5-refund-failures.mjs
import {
  ACCOUNT,
  CREATOR,
  accept,
  asCreator,
  asFan,
  expect,
  finish,
  intentsFor,
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
} from "./lib.mjs";
import { startScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 10 })).body;
await startScheduler(2000);
async function until(what, check, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(250);
  }
}
/** An accepted request whose delivery deadline has just passed. */
async function overdue() {
  const id = (await submit(fan, mode)).body.packet.id;
  expect((await accept(maya, id)).status === 200, "accept");
  await sql(
    "UPDATE creator.commerce_commitment SET due_at=now()-interval '1 second' WHERE packet_id=$1",
    [id],
  );
  return id;
}
const refundEffects = (id) =>
  sql(
    "SELECT id,provider_key,state,attempt,error_code,extract(epoch FROM next_at-updated_at)::int AS wait FROM creator.commerce_effect WHERE packet_id=$1 AND operation='refund' ORDER BY created_at,id",
    [id],
  );
const commitment = async (id) =>
  (
    await sql(
      "SELECT state,outcome FROM creator.commerce_commitment WHERE packet_id=$1",
      [id],
    )
  )[0];
const escalations = async (id) =>
  (
    await sql(
      "SELECT payload FROM creator.commerce_event WHERE aggregate_id=$1 AND type='refund_escalated' ORDER BY created_at",
      [id],
    )
  ).map((e) => e.payload);
const refundCalls = async (intent) =>
  (await stripeState()).calls.filter(
    (c) => c.op === "refund" && c.ref === intent,
  );
/** Wait for a refund try to finish, note the wait it scheduled, then make the next try due now. */
async function nextTry(id, count) {
  await until(
    `refund try ${count}`,
    async () =>
      (await refundEffects(id)).reduce((n, e) => n + e.attempt, 0) >= count &&
      !(await refundEffects(id)).some((e) => e.state === "processing"),
  );
  const effects = await refundEffects(id);
  const waits = effects
    .filter((e) => ["unknown", "pending"].includes(e.state))
    .map((e) => e.wait);
  await sql(
    "UPDATE creator.commerce_effect SET next_at=now() WHERE packet_id=$1 AND operation='refund' AND state IN ('unknown','pending')",
    [id],
  );
  return waits;
}

await step(
  "E4.5-6",
  "processor down twice at refund time: tried again after 30 s, then 60 s, then refunded exactly once",
  async () => {
    await stripe({
      fault: { op: "refund", phase: "before", status: 500, times: 2 },
    });
    const id = await overdue();
    const waits = [...(await nextTry(id, 1)), ...(await nextTry(id, 2))];
    await until(
      "the refund",
      async () => (await packetRow(id)).payment_state === "refunded",
    );
    const [intent] = await intentsFor(id);
    const made = (await stripeState()).refunds.filter(
      (r) => r.payment_intent === intent.id,
    );
    const rows = (await ledger(id)).filter((r) => r.kind === "refund");
    expect(
      waits.join() === "30,60" &&
        made.length === 1 &&
        rows.length === 1 &&
        (await commitment(id)).state === "refunded",
      `waits ${waits}, ${made.length} refunds, ${rows.length} booked`,
    );
    return `waits ${waits.join(" s, ")} s; ${(await refundCalls(intent.id)).length} refund calls; 1 refund, booked once; commitment refunded`;
  },
);
await step(
  "E4.5-7",
  "the processor refuses the refund (4xx): reported to operations at once, not retried, never dropped",
  async () => {
    await stripe({
      fault: { op: "refund", phase: "before", status: 400, times: 1 },
    });
    const id = await overdue();
    await until(
      "the escalation",
      async () => (await escalations(id)).length === 1,
    );
    await sleep(6000); // three more passes
    const [intent] = await intentsFor(id);
    const c = await commitment(id);
    const [report] = await escalations(id);
    const p = await packetRow(id);
    expect(
      c.state === "resolution_required" &&
        c.outcome === "refund_rejected" &&
        report.cause === "refund_rejected",
      JSON.stringify({ c, report }),
    );
    expect(
      (await refundCalls(intent.id)).length === 1 &&
        p.payment_state === "refund_pending" &&
        !(await ledger(id)).some((r) => r.kind === "refund"),
      `${(await refundCalls(intent.id)).length} calls, ${p.payment_state}`,
    );
    return `commitment ${c.state}/${c.outcome}; event refund_escalated (${report.cause}); 1 refund call; request still ${p.payment_state}, nothing booked`;
  },
);
await step(
  "E4.5-8",
  "the refund comes back failed: tried again as a new refund, then succeeds once",
  async () => {
    await stripe({ refundStatus: "failed" });
    const id = await overdue();
    await until("the first refund", async () =>
      (await refundEffects(id)).some((e) => e.state === "failed"),
    );
    await stripe({ refundStatus: "succeeded" });
    const waits = await nextTry(id, 1);
    await until(
      "the second refund",
      async () => (await packetRow(id)).payment_state === "refunded",
    );
    const [intent] = await intentsFor(id);
    const made = (await stripeState()).refunds
      .filter((r) => r.payment_intent === intent.id)
      .map((r) => r.status);
    const effects = await refundEffects(id);
    expect(
      made.join() === "failed,succeeded" &&
        effects.length === 2 &&
        effects[1].provider_key.endsWith(":refund:deadline:retry:1") &&
        !(await escalations(id)).length,
      `${made} ${effects.map((e) => e.provider_key)}`,
    );
    return `the retry waited ${waits.join()} s under key …:retry:1; refunds ${made.join(", ")}; booked once; no report`;
  },
);
await step(
  "E4.5-9",
  "every refund comes back failed: three refunds, then reported to operations, and no fourth",
  async () => {
    await stripe({ refundStatus: "failed" });
    const id = await overdue();
    await until("the first refund", async () =>
      (await refundEffects(id)).some((e) => e.state === "failed"),
    );
    const waits = [...(await nextTry(id, 1)), ...(await nextTry(id, 2))];
    await until(
      "the escalation",
      async () => (await escalations(id)).length === 1,
    );
    await sleep(6000);
    await stripe({ refundStatus: "succeeded" });
    const [intent] = await intentsFor(id);
    const made = (await stripeState()).refunds.filter(
      (r) => r.payment_intent === intent.id,
    );
    const c = await commitment(id);
    const [report] = await escalations(id);
    expect(
      made.length === 3 &&
        made.every((r) => r.status === "failed") &&
        c.state === "resolution_required" &&
        c.outcome === "refund_failed" &&
        report.refunds === 3,
      JSON.stringify({ made: made.length, c, report }),
    );
    return `refunds ${made.map((r) => r.status).join(", ")} (waits ${waits.join(" s, ")} s); commitment ${c.state}/${c.outcome}; reported once with 3 refunds`;
  },
);
await step(
  "E4.5-10",
  "a long outage: reported to operations on the sixth try, still tried, refunded once when it ends",
  async () => {
    await stripe({
      fault: { op: "refund", phase: "before", status: 503, times: 6 },
    });
    const id = await overdue();
    const waits = [];
    for (let count = 1; count <= 6; count++)
      waits.push(...(await nextTry(id, count)));
    const reports = await escalations(id);
    const during = await commitment(id);
    await until(
      "the refund after the outage",
      async () => (await packetRow(id)).payment_state === "refunded",
    );
    const [intent] = await intentsFor(id);
    const made = (await stripeState()).refunds.filter(
      (r) => r.payment_intent === intent.id,
    );
    expect(
      reports.length === 1 &&
        reports[0].cause === "refund_delayed" &&
        reports[0].tries === 6 &&
        during.state === "refund_pending" &&
        made.length === 1,
      JSON.stringify({ reports, during, made: made.length }),
    );
    return `waits ${waits.join(", ")} s; reported once (refund_delayed, try 6) while still refund_pending; then 1 refund, ${(await commitment(id)).state}`;
  },
);
await stripe({ clearFaults: true, refundStatus: "succeeded" });
await finish();
