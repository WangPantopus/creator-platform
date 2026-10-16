// E4.10 in a busy processor account (WP 4.6): when a hold's answer is lost,
// recovery looks for it among the payments created since the attempt began,
// not through the account's whole history, so an account with more than 1,000
// earlier payments still finds the one hold. Fakes: card processor (with 1,200
// settled payments from two days ago, and lost answers), development identity,
// software passkey.
//   node tests/scenarios/lane-4/e4-10-busy-account.mjs
import {
  ACCOUNT,
  CREATOR,
  asCreator,
  asFan,
  expect,
  finish,
  intentsFor,
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
async function until(what, check, ms = 75000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}

await step(
  "E4.10-4",
  "the processor account already holds more than 1,000 earlier payments",
  async () => {
    const before = (await stripeState()).intents.length;
    if (before < 1200)
      await stripe({ seedHistory: { count: 1200, ageSeconds: 2 * 86400 } });
    const after = (await stripeState()).intents.length;
    expect(after >= 1200, `${after} payments`);
    return `${after} payments at the processor`;
  },
);
await step(
  "E4.10-5",
  "a hold whose answer is lost is still found, with one hold and a short scan",
  async () => {
    await stripe({
      fault: { op: "create", phase: "after", drop: true, times: 2 },
    });
    const id = (await submit(fan, mode)).body.packet.id;
    const first = await packetRow(id);
    expect(
      first.payment_state === "unknown",
      `${first.state}/${first.payment_state}`,
    );
    const listsBefore = (await stripeState()).calls.filter(
      (c) => c.op === "list_intents",
    ).length;
    // The answer was lost, so the scheduler's retry must look the hold up.
    await sql(
      "UPDATE creator.commerce_effect SET next_at=now() WHERE packet_id=$1 AND operation='authorize'",
      [id],
    );
    const done = await until("recovery", async () => {
      const p = await packetRow(id);
      const [effect] = await sql(
        "SELECT error_code,attempt FROM creator.commerce_effect WHERE packet_id=$1 AND operation='authorize'",
        [id],
      );
      return p.state === "submitted"
        ? { p, effect }
        : effect.attempt >= 2 &&
            effect.error_code === "provider_statement_too_large"
          ? { p, effect }
          : null;
    });
    const lists =
      (await stripeState()).calls.filter((c) => c.op === "list_intents")
        .length - listsBefore;
    expect(
      done.p.state === "submitted" && (await intentsFor(id)).length === 1,
      `${done.p.state}/${done.p.payment_state}, recovery error ${done.effect.error_code}, ${lists} list pages`,
    );
    return `${done.p.state}/${done.p.payment_state}; 1 hold; ${lists} list page(s) read`;
  },
);
await finish();
