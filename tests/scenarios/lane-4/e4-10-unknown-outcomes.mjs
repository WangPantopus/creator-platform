// E4.10 and E4.9 with the scheduler: when the processor's answer is lost or
// the processor is down, the request is left in an honest "unknown" state with
// its slot held, and the scheduler, with nobody tapping, reconciles it to the
// processor's truth: one hold, never two; one capture, never two; and a request
// stuck while its hold was being placed is ended without leaking its slot.
// The Stripe SDK retries once, with the same idempotency key, when a
// connection is reset, so a lost answer is a reset twice in a row here.
// Fakes: card processor (faults before and after acting), development
// identity, software passkey. Deadlines moved in this stack's own database.
//   node tests/scenarios/lane-4/e4-10-unknown-outcomes.mjs
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
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 10 })).body;
const reserved = async () =>
  (
    await sql(
      "SELECT reserved,used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0];
const creates = async (id) =>
  (await stripeState()).calls.filter(
    (c) => c.op === "create" && c.key === `${id}:authorize:1`,
  );
async function until(what, check, ms = 75000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}

await stopScheduler();
await startScheduler(2000);
await step(
  "E4.10-1",
  "the hold is placed but its answer is lost: unknown, slot kept, then one hold with nobody tapping",
  async () => {
    await stripe({
      fault: { op: "create", phase: "after", drop: true, times: 2 },
    });
    const sent = await submit(fan, mode);
    const id = sent.body.packet.id;
    const first = await packetRow(id);
    expect(
      first.state === "submitting" && first.payment_state === "unknown",
      `${first.state}/${first.payment_state}`,
    );
    await until(
      "reconciliation",
      async () => (await packetRow(id)).state === "submitted",
    );
    const intents = await intentsFor(id);
    const rows = (await ledger(id)).map((r) => r.kind).join(" ");
    expect(
      intents.length === 1 &&
        intents[0].status === "requires_capture" &&
        rows === "hold",
      `${intents.length} intents, ledger ${rows}`,
    );
    return `answered ${first.state}/${first.payment_state}; scheduler found the hold: 1 intent, ledger ${rows}, ${(await creates(id)).length} create call(s)`;
  },
);
await step(
  "E4.10-2",
  "the processor is down when the hold is asked for: retried with backoff, then one hold",
  async () => {
    await stripe({
      fault: { op: "create", phase: "before", status: 500, times: 2 },
    });
    const id = (await submit(fan, mode)).body.packet.id;
    await until(
      "the retry",
      async () => (await packetRow(id)).state === "submitted",
    );
    const calls = await creates(id);
    expect(
      (await intentsFor(id)).length === 1,
      `${(await intentsFor(id)).length} intents`,
    );
    return `${calls.length} create calls (${calls.map((c) => c.status).join(", ")}), 1 hold`;
  },
);
await step(
  "E4.10-3",
  "the capture happens but its answer is lost: the accept waits, then is booked once",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    await stripe({
      fault: { op: "capture", phase: "after", drop: true, times: 2 },
    });
    await accept(maya, id);
    const mid = await packetRow(id);
    expect(
      mid.state === "accepting" && mid.payment_state === "unknown",
      `answered ${mid.state}/${mid.payment_state}`,
    );
    await until(
      "the capture booking",
      async () => (await packetRow(id)).state === "accepted",
    );
    const rows = (await ledger(id))
      .map((r) => `${r.kind}:${r.amount}`)
      .join(" ");
    const captures = (await stripeState()).calls.filter(
      (c) => c.op === "capture" && c.ref === mid.intent_ref,
    );
    expect(
      rows === "hold:5000 capture:5000" &&
        (await intentsFor(id))[0].amount_received === 5000,
      rows,
    );
    return `answered ${mid.state}/${mid.payment_state}; booked once (${rows}); ${captures.length} capture call(s) at the processor`;
  },
);
await step(
  "E4.9-1",
  "a request stuck while its hold is placed (processor never answers) ends without leaking its slot",
  async () => {
    // Every attempt is lost before the processor acts, so no hold ever exists.
    await stripe({
      fault: { op: "create", phase: "before", drop: true, times: 50 },
    });
    const before = await reserved();
    const id = (await submit(fan, mode)).body.packet.id;
    const held = await reserved();
    await sql(
      "UPDATE creator.commerce_packet SET auth_pending_until=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    await stripe({ clearFaults: true });
    await until("the release of the stuck request", async () =>
      ["expired", "draft"].includes((await packetRow(id)).state),
    );
    const after = await reserved();
    const p = await packetRow(id);
    const open = (await intentsFor(id)).filter(
      (i) => i.status === "requires_capture",
    ).length;
    expect(
      after.reserved === before.reserved && open === 0,
      `slots ${JSON.stringify(before)} -> ${JSON.stringify(held)} -> ${JSON.stringify(after)}, ${open} open holds`,
    );
    return `${p.state}/${p.payment_state}; reserved ${before.reserved} -> ${held.reserved} -> ${after.reserved}; no open hold`;
  },
);
await stripe({ clearFaults: true });
await finish();
