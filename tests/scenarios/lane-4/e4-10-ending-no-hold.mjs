// E4.10 and the founder's decision 4 (lane-4-decisions.md, taken as the
// proposed default on 2026-10-16): a request that is already ending never gets
// a new hold. When every try to place its hold was lost before the processor
// acted, and the request then times out or the fan withdraws it, the retry
// asks the processor and places nothing. The request waits, honestly unknown
// and with its slot kept, until no earlier try can still reach the processor
// (five minutes after its release began); then it ends with nothing held, its
// slot back and nothing at the processor. A hold the processor did place is
// still found and released, and never a second one. A scheduler crash changes
// nothing. The release's start and the deadlines are moved in this stack's own
// database, and the retries are brought forward there too.
// Fakes: card processor (faults before and after acting), development
// identity, software passkey.
//   node tests/scenarios/lane-4/e4-10-ending-no-hold.mjs
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
  withdraw,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (
  await offer(maya, {
    weeklyLimit: 10,
    title: "Written reply (ending, no new hold)",
  })
).body;
// The scheduler runs this checkout's code as it is now.
await stopScheduler();
await startScheduler(2000);

const reserved = async () =>
  (
    await sql(
      "SELECT coalesce(sum(reserved),0)::int AS n FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0].n;
const creates = async (id) =>
  (await stripeState()).calls.filter(
    (c) => c.op === "create" && c.key === `${id}:authorize:1`,
  ).length;
const effects = async (id) =>
  Object.fromEntries(
    (
      await sql(
        "SELECT operation,state,error_code,attempt FROM creator.commerce_effect WHERE packet_id=$1",
        [id],
      )
    ).map((e) => [e.operation, e]),
  );
const shown = (e) =>
  Object.entries(e)
    .map(
      ([op, r]) => `${op} ${r.state}${r.error_code ? `/${r.error_code}` : ""}`,
    )
    .join(", ");
async function until(what, check, ms = 60000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}
/** Brings the next retry of the hold forward, and waits until the scheduler
 * has made it (this stack's own database). */
async function retryNow(id) {
  const { attempt } = (await effects(id)).authorize;
  await sql(
    "UPDATE creator.commerce_effect SET next_at=now() WHERE packet_id=$1 AND operation IN ('authorize','release') AND state<>'done'",
    [id],
  );
  await until("the scheduler's retry", async () => {
    const e = (await effects(id)).authorize;
    return e.attempt > attempt && e.state !== "processing";
  });
  await sleep(2500); // one more pass, for a release it may have queued
}
/** Starts the release this many seconds ago (this stack's own database). */
const releaseBegan = (id, seconds) =>
  sql(
    "UPDATE creator.commerce_effect SET created_at=now()-($2*interval '1 second') WHERE packet_id=$1 AND operation='release'",
    [id, seconds],
  );
/** A request whose every try to place its hold is lost before the processor acts. */
async function stuck() {
  await stripe({
    fault: { op: "create", phase: "before", drop: true, times: 1000 },
  });
  const id = (await submit(fan, mode)).body.packet.id;
  const p = await packetRow(id);
  expect(
    p.state === "submitting" && p.payment_state === "unknown",
    `${p.state}/${p.payment_state}`,
  );
  return id;
}

const free = await reserved();
let timedOut;
let atRelease;
await step(
  "D4-1",
  "every try to hold was lost, then the request times out: its retry places no new hold, and it waits with its slot kept",
  async () => {
    timedOut = await stuck();
    await sql(
      "UPDATE creator.commerce_packet SET auth_pending_until=now()-interval '1 second' WHERE id=$1",
      [timedOut],
    );
    await until(
      "the release",
      async () => (await packetRow(timedOut)).state === "releasing",
    );
    atRelease = await creates(timedOut);
    await stripe({ clearFaults: true });
    await retryNow(timedOut);
    const p = await packetRow(timedOut);
    const intents = await intentsFor(timedOut);
    expect(
      (await creates(timedOut)) === atRelease &&
        intents.length === 0 &&
        p.state === "releasing" &&
        (await reserved()) === free + 1,
      `${(await creates(timedOut)) - atRelease} create call(s) after the release began, ${intents.length} intent(s) (${intents.map((i) => i.status)}), ${p.state}/${p.payment_state}, ${await reserved()} reserved`,
    );
    return `${atRelease} lost create call(s) before the release, none after; nothing at the processor; ${p.state}/${p.payment_state}, slot kept; ${shown(await effects(timedOut))}`;
  },
);
await step(
  "D4-2",
  "boundary: 4 min 30 s after the release began it still waits; at 5 min 30 s it ends with nothing held, after a scheduler crash",
  async () => {
    await releaseBegan(timedOut, 270);
    await retryNow(timedOut);
    const waiting = await packetRow(timedOut);
    expect(waiting.state === "releasing", `${waiting.state} at 4 min 30 s`);
    await stopScheduler("SIGKILL");
    await startScheduler(2000);
    await releaseBegan(timedOut, 330);
    await retryNow(timedOut);
    const p = await packetRow(timedOut);
    const e = await effects(timedOut);
    const rows = await ledger(timedOut);
    // What the fan's request page is drawn from.
    const seen = (await packet(fan, timedOut)).body;
    expect(
      p.state === "expired" &&
        p.payment_state === "released" &&
        seen.packet.state === "expired" &&
        seen.ledger.length === 0 &&
        (await reserved()) === free &&
        (await intentsFor(timedOut)).length === 0 &&
        (await creates(timedOut)) === atRelease &&
        rows.length === 0 &&
        e.authorize.state === "done" &&
        e.authorize.error_code === "nothing_held" &&
        e.release.state === "done" &&
        e.release.error_code === "nothing_held",
      `${p.state}/${p.payment_state}, ${await reserved()} reserved (free ${free}), ${(await intentsFor(timedOut)).length} intent(s), ledger [${rows.map((r) => r.kind)}], ${shown(e)}`,
    );
    return `4:30 still releasing; scheduler killed and restarted; 5:30 ${p.state}/${p.payment_state} (the fan reads ${seen.packet.state}, no ledger lines), slot back, nothing at the processor; ${shown(e)}`;
  },
);
await step(
  "D4-3",
  "the processor cannot be asked: no new hold, and the fan's withdrawal waits until it can",
  async () => {
    const id = await stuck();
    const sent = await creates(id);
    expect((await withdraw(fan, id)).status === 200, "withdraw");
    await stripe({ clearFaults: true });
    await stripe({
      fault: { op: "list_intents", phase: "before", status: 500, times: 1000 },
    });
    await releaseBegan(id, 330);
    await retryNow(id);
    const p = await packetRow(id);
    expect(
      p.state === "releasing" &&
        (await creates(id)) === sent &&
        (await intentsFor(id)).length === 0,
      `${p.state}/${p.payment_state}, ${(await creates(id)) - sent} new create call(s)`,
    );
    await stripe({ clearFaults: true });
    await retryNow(id);
    const done = await packetRow(id);
    expect(
      done.state === "withdrawn" &&
        done.payment_state === "released" &&
        (await creates(id)) === sent &&
        (await intentsFor(id)).length === 0 &&
        (await reserved()) === free,
      `${done.state}/${done.payment_state}, ${(await intentsFor(id)).length} intent(s), ${await reserved()} reserved`,
    );
    return `while the processor's list failed: ${p.state}, no create; once it answered: ${done.state}/${done.payment_state}, nothing at the processor, slot back`;
  },
);
await step(
  "D4-4",
  "the processor did place the hold but its answer was lost, and the fan withdraws: that hold is found and released, never a second",
  async () => {
    await stripe({
      fault: { op: "create", phase: "after", drop: true, times: 2 },
    });
    const id = (await submit(fan, mode)).body.packet.id;
    const sent = await creates(id);
    expect((await withdraw(fan, id)).status === 200, "withdraw");
    await retryNow(id);
    await until(
      "the withdrawal",
      async () => (await packetRow(id)).state === "withdrawn",
    );
    const intents = await intentsFor(id);
    const rows = (await ledger(id)).map((r) => r.kind).join(" ");
    expect(
      intents.length === 1 &&
        intents[0].status === "canceled" &&
        rows === "hold release" &&
        (await creates(id)) === sent &&
        (await reserved()) === free,
      `${intents.length} intent(s) (${intents.map((i) => i.status)}), ledger ${rows}, ${(await creates(id)) - sent} new create call(s)`,
    );
    return `1 intent, canceled; ledger ${rows}; no create call after the withdrawal; slot back`;
  },
);
await step(
  "D4-5",
  "repeat: a second withdrawal of a settled request is refused and changes nothing",
  async () => {
    const before = await packetRow(timedOut);
    const again = await withdraw(fan, timedOut);
    const after = await packetRow(timedOut);
    expect(
      again.status >= 400 &&
        again.code === "request_committed" &&
        after.version === before.version &&
        after.state === before.state,
      `${again.status} ${again.code}, ${before.version} -> ${after.version}`,
    );
    return `${again.status} ${again.code}; unchanged`;
  },
);
await stripe({ clearFaults: true });
await finish();
