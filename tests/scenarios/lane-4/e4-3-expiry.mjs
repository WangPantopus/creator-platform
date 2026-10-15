// E4.3 expiry with no tap: a request nobody decides is expired by the
// scheduler at its deadline, the hold released at the processor, the slot
// returned and the outcome recorded for the fan, while nobody taps anything.
// The scheduler is then killed while the deadline passes and restarted, and
// killed again in the middle of a release: each request still ends exactly once.
// Deadlines are moved by editing them in this stack's own database.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-3-expiry.mjs
import {
  ACCOUNT,
  CREATOR,
  asCreator,
  asFan,
  expect,
  finish,
  intentsFor,
  ledger,
  offer,
  packet,
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
const mode = (await offer(maya, { weeklyLimit: 3 })).body;
const capacity = async () =>
  (
    await sql(
      "SELECT reserved,used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0];
const decideBy = (id, seconds) =>
  sql(
    "UPDATE creator.commerce_packet SET decision_at=now()+($2*interval '1 second') WHERE id=$1",
    [id, seconds],
  );
async function until(what, check, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}
/** The request ended expired with its hold released exactly once, everywhere. */
async function expiredOnce(id) {
  const p = await packetRow(id);
  const rows = (await ledger(id)).map((r) => `${r.kind}:${r.amount}`).join(" ");
  const intents = await intentsFor(id);
  const cancels = (await stripeState()).calls.filter(
    (c) => c.op === "cancel" && c.ref === intents[0]?.id,
  );
  expect(
    p.state === "expired" && p.payment_state === "released",
    `${p.state}/${p.payment_state}`,
  );
  expect(rows === "hold:5000 release:5000", rows);
  expect(
    intents.length === 1 &&
      intents[0].status === "canceled" &&
      intents[0].amount_received === 0,
    JSON.stringify(intents),
  );
  expect(
    cancels.filter((c) => !c.replayed && String(c.status).startsWith("200"))
      .length === 1,
    `${cancels.length} cancel calls`,
  );
  return `expired/released, ledger ${rows}, processor canceled (${cancels.length} cancel call(s))`;
}

await startScheduler(2000);
let first;
await step(
  "E4.3-1",
  "a request is held and left alone; its decision deadline comes in 6 s",
  async () => {
    first = (await submit(fan, mode)).body.packet;
    await decideBy(first.id, 6);
    expect((await capacity()).reserved === 1, JSON.stringify(await capacity()));
    return `${first.id.slice(0, 8)} ${first.state}, 1 slot reserved`;
  },
);
await step("E4.3-2", "nothing happens before the deadline", async () => {
  await sleep(3000);
  const p = await packetRow(first.id);
  expect(p.state === "submitted", p.state);
  return "still submitted 3 s before";
});
await step(
  "E4.3-3",
  "after it the scheduler expires it: released once, slot back, nobody tapped",
  async () => {
    const seen = await until(
      "expiry",
      async () =>
        (await packetRow(first.id)).state === "expired" &&
        (await packetRow(first.id)),
    );
    const lag = (seen.updated_at - seen.decision_at) / 1000;
    const slot = await capacity();
    expect(slot.reserved === 0 && slot.used === 0, JSON.stringify(slot));
    return `${await expiredOnce(first.id)}; ${lag.toFixed(1)} s after the deadline; slot free`;
  },
);
await step(
  "E4.3-4",
  "the fan sees the outcome and the event a notice is made from",
  async () => {
    const seen = await packet(fan, first.id);
    const events = (
      await sql(
        "SELECT type FROM creator.commerce_event WHERE aggregate_id=$1 ORDER BY created_at,id",
        [first.id],
      )
    ).map((e) => e.type);
    expect(
      seen.status === 200 &&
        seen.body.packet.state === "expired" &&
        events.includes("hold_released"),
      `${seen.body?.packet?.state} ${events}`,
    );
    return `fan view ${seen.body.packet.state}/${seen.body.packet.payment_state}; events ${events.join(", ")}`;
  },
);

let second;
await step(
  "E4.3-5",
  "the scheduler is killed while a deadline passes: nothing happens, and nothing is lost",
  async () => {
    second = (await submit(fan, mode)).body.packet;
    await stopScheduler("SIGKILL");
    await decideBy(second.id, -5);
    await sleep(6000);
    const p = await packetRow(second.id);
    expect(
      p.state === "submitted" && p.payment_state === "requires_capture",
      `${p.state}/${p.payment_state}`,
    );
    return "past its deadline and still submitted while no scheduler runs";
  },
);
await step(
  "E4.3-6",
  "restarted, the scheduler finishes it on its first pass",
  async () => {
    await startScheduler(2000);
    await until(
      "expiry after restart",
      async () => (await packetRow(second.id)).state === "expired",
    );
    return expiredOnce(second.id);
  },
);

let third;
await step(
  "E4.3-7",
  "killed in the middle of a release, a restarted scheduler finishes it exactly once",
  async () => {
    third = (await submit(fan, mode)).body.packet;
    const [hold] = await intentsFor(third.id);
    // The processor takes 4 s to cancel this hold; the scheduler dies after 2 s.
    await stripe({
      fault: { op: "cancel", phase: "delay", delayMs: 4000, times: 1 },
    });
    await decideBy(third.id, -1);
    await until(
      "the release call",
      async () =>
        (await stripeState()).calls.some(
          (c) => c.op === "cancel" && c.ref === hold.id,
        ),
      15000,
    );
    await sleep(2000);
    await stopScheduler("SIGKILL");
    await sleep(3000);
    const mid = await packetRow(third.id);
    const [effect] = await sql(
      "SELECT state,lease_until FROM creator.commerce_effect WHERE packet_id=$1 AND operation='release'",
      [third.id],
    );
    expect(
      mid.state === "releasing" &&
        effect.state === "processing" &&
        (await intentsFor(third.id))[0].status === "canceled",
      `${mid.state} ${effect.state}`,
    );
    await startScheduler(2000);
    await until(
      "the release after the lease lapses",
      async () => (await packetRow(third.id)).state === "expired",
      60000,
    );
    return `mid-flight: ${mid.state}, effect ${effect.state}, processor already canceled; after restart: ${await expiredOnce(third.id)}`;
  },
);
await step("E4.3-8", "every slot came back", async () => {
  const slot = await capacity();
  expect(slot.reserved === 0 && slot.used === 0, JSON.stringify(slot));
  return JSON.stringify(slot);
});
await finish();
