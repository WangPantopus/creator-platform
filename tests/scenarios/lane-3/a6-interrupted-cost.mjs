// A6: an interrupted reply's unknown provider cost counts as its whole cost
// hold, is recorded once as an estimate, and no longer locks the creator's AI.
// A reply is interrupted the way a person does it: Maya takes the thread over
// while the model is streaming (then hands it back). An interrupted attempt's
// hold stays held for its 5 minutes (W4 keeps an unknown cost's full ceiling);
// once it lapses, the next admission records the estimate. Checks the state
// behind the screen: the unknown rows stay unknown, exactly one estimate per
// hold, the next reply is admitted while the daily budget allows, a clean
// budget refusal once it does not, and the next day the budget is free. The
// clock is moved only in lane 3's own disposable database (fake clock).
//   node tests/scenarios/lane-3/a6-interrupted-cost.mjs [--cap 12000000]
import {
  ACTORS,
  API,
  MAYA_CREATOR_ID,
  MODEL,
  call,
  closeDb,
  ensureMaya,
  flag,
  key,
  openFan,
  reporter,
  signIn,
  sleep,
  sql,
} from "./lib.mjs";

const { step, finish } = reporter();
const cap = Number(flag("--cap", "12000000"));
step("Maya's AI is live", true, await ensureMaya(cap));
await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 300 } });
const maya = (await signIn(API, ACTORS.maya, "/studio/ai")).token;
const fan = await openFan(ACTORS.fanOne, "lane3fan1");
const replies = async () =>
  (await call(MODEL, "GET", "/__stats")).json?.counts?.reply ?? 0;
const ask = (text) =>
  call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: { idempotencyKey: key("a6"), text, clientSequence: Date.now() % 1e6 },
  });
const settle = async (g) => {
  for (let w = 0; w < 200; w++) {
    const [row] = await sql(
      "SELECT g.state, m.delivery_state AS delivery FROM creator.generation g JOIN creator.message m ON m.id=g.ai_message_id WHERE g.id=$1",
      [g],
    );
    if (
      row &&
      !["queued", "generating"].includes(row.state) &&
      row.delivery !== "generating"
    )
      return row;
    await sleep(500);
  }
  return null;
};
const ledger = async () =>
  (
    await sql(
      `SELECT count(*) FILTER (WHERE u.cost_micros IS NULL)::int AS unknown,
     count(*) FILTER (WHERE u.purpose='interrupted_hold_estimate')::int AS estimates,
     count(DISTINCT u.creator_hold_id) FILTER (WHERE u.purpose='interrupted_hold_estimate')::int AS estimated_holds,
     coalesce(sum(u.cost_micros) FILTER (WHERE u.purpose='interrupted_hold_estimate'),0)::bigint AS estimated
   FROM creator.ai_usage u WHERE u.creator_id=$1`,
      [MAYA_CREATOR_ID],
    )
  )[0];
async function interrupt(label) {
  const before = await replies();
  const sent = await ask(`${label}: why does my glaze crawl?`);
  for (let w = 0; w < 2400 && (await replies()) === before; w++)
    await sleep(25);
  const streaming = (await replies()) > before;
  const took = await call(API, "POST", `${fan.thread}/takeover`, {
    token: maya,
    body: { idempotencyKey: key("takeover") },
  });
  const end = await settle(sent.json?.generationId);
  await call(API, "POST", `${fan.thread}/handback`, {
    token: maya,
    body: { idempotencyKey: key("handback") },
  });
  return {
    took: took.status,
    end,
    streaming,
    sent: sent.status,
    generationId: sent.json?.generationId,
  };
}

// Fake clock: the interrupted holds' 5 minutes have passed.
const lapse = () =>
  sql(
    "UPDATE creator.ai_cost_hold SET expires_at=clock_timestamp()-interval '1 second' WHERE creator_id=$1 AND state='held' AND id IN (SELECT creator_hold_id FROM creator.ai_usage WHERE cost_micros IS NULL)",
    [MAYA_CREATOR_ID],
  );
const ask2 = async (text) => {
  const sent = await ask(text);
  return { sent: sent.status, end: await settle(sent.json?.generationId) };
};

const first = await interrupt("Interrupted 1");
const afterOne = await ledger();
step(
  "a takeover during the stream interrupts the reply and leaves an unknown cost on a held hold",
  first.streaming &&
    first.took === 200 &&
    first.end?.state === "failed" &&
    afterOne.unknown > 0,
  `sent ${first.sent}, stream started ${first.streaming}, takeover ${first.took}, answer ${first.end?.state}, ${afterOne.unknown} unknown row(s)`,
);
const [allowance] = await sql(
  "SELECT state, units, settled_units AS settled FROM creator.commerce_allowance_reservation WHERE key='generation:'||$1",
  [first.generationId],
);
step(
  "the fan's allowance keeps its full held ceiling for the interrupted reply (W4 rule unchanged)",
  allowance?.state === "reserved" && allowance.settled === null,
  `${allowance?.state}, ${allowance?.units} units held, settled ${allowance?.settled}`,
);
const next = await ask2("While the hold is held: why does my glaze crawl?");
step(
  "the next reply is admitted and delivered while the interrupted hold is still held (not locked)",
  next.end?.state === "delivered" && (await ledger()).estimates === 0,
  `${next.end?.state}/${next.end?.delivery}, ${(await ledger()).estimates} estimate(s) yet`,
);
await lapse();
const after = await ask2("After the hold lapsed: why does my glaze crawl?");
const afterLapse = await ledger();
const [hold] = await sql(
  `SELECT h.state, h.amount_micros::bigint AS amount,
     coalesce((SELECT sum(k.cost_micros) FROM creator.ai_usage k WHERE k.creator_hold_id=h.id AND k.cost_micros IS NOT NULL AND k.purpose IS DISTINCT FROM 'interrupted_hold_estimate'),0)::bigint AS known,
     (SELECT cost_micros FROM creator.ai_usage e WHERE e.creator_hold_id=h.id AND e.purpose='interrupted_hold_estimate')::bigint AS estimate,
     (SELECT e.created_at=h.created_at AND e.provider='estimate' FROM creator.ai_usage e WHERE e.creator_hold_id=h.id AND e.purpose='interrupted_hold_estimate') AS labelled
   FROM creator.ai_cost_hold h WHERE h.id=(SELECT creator_hold_id FROM creator.ai_usage WHERE purpose='interrupted_hold_estimate' ORDER BY created_at LIMIT 1)`,
);
step(
  "after the hold lapses the next reply is admitted and exactly one estimate is recorded: the whole hold less its known costs, labelled and dated with the hold",
  after.end?.state === "delivered" &&
    afterLapse.estimates === 1 &&
    hold &&
    BigInt(hold.estimate) + BigInt(hold.known) === BigInt(hold.amount) &&
    hold.labelled === true,
  hold
    ? `${after.end?.state}; hold ${hold.state} ${hold.amount}, known ${hold.known}, estimate ${hold.estimate}`
    : `${after.end?.state}; no estimate row`,
);
step(
  "the unknown rows stay unknown for reconciliation",
  afterLapse.unknown >= afterOne.unknown,
  `${afterLapse.unknown} unknown row(s) (the lapsed hold adds its expiry marker)`,
);
await ask2("Repeat admission: why does my glaze crawl?");
step(
  "repeated admissions add no second estimate",
  (await ledger()).estimates === 1,
  `${(await ledger()).estimates} estimate(s)`,
);
const [unresolved] = await sql(
  "SELECT count(*)::int AS n FROM creator.ai_usage WHERE creator_id=$1 AND cost_micros IS NULL",
  [MAYA_CREATOR_ID],
);
step(
  "the unresolved cost is still visible to reconciliation (escalation input)",
  unresolved.n > 0,
  `${unresolved.n} row(s) with no cost`,
);

// Interrupt and lapse until today's estimates leave no room for another hold.
let refused = null;
for (let i = 2; i <= 6 && !refused; i++) {
  await interrupt(`Interrupted ${i}`);
  await lapse();
  const probe = await ask2(`Budget probe ${i}: why does my glaze crawl?`);
  if (probe.end?.state !== "delivered") refused = { i, end: probe.end };
}
const totals = await ledger();
// A refusal rolls back its own admission bookkeeping (the lapsed hold's
// settlement and estimate), so count lapsed holds still awaiting their estimate.
const [today] = await sql(
  `SELECT coalesce((SELECT sum(cost_micros) FROM creator.ai_usage WHERE creator_id=$1 AND category IN('reply','guardrail','memory','provider_unknown')
     AND created_at>=date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'),0)::bigint AS spent,
   coalesce((SELECT sum(h.amount_micros-coalesce((SELECT sum(k.cost_micros) FROM creator.ai_usage k WHERE k.creator_hold_id=h.id AND k.cost_micros IS NOT NULL),0))
     FROM creator.ai_cost_hold h WHERE h.creator_id=$1 AND h.state='held' AND h.expires_at<=clock_timestamp()
      AND EXISTS(SELECT FROM creator.ai_usage u WHERE u.creator_hold_id=h.id AND u.cost_micros IS NULL)),0)::bigint AS pending,
   (SELECT max(amount_micros) FROM creator.ai_cost_hold WHERE creator_id=$1)::bigint AS hold`,
  [MAYA_CREATOR_ID],
);
step(
  "once estimates fill the daily cap, a reply is refused cleanly as a budget limit",
  refused &&
    refused.end?.state === "failed" &&
    BigInt(today.spent) + BigInt(today.pending) + BigInt(today.hold) >
      BigInt(cap),
  refused
    ? `refused after ${refused.i} interruptions: spent today ${today.spent} + lapsed holds awaiting their estimate ${today.pending} + a new hold ${today.hold} > cap ${cap}`
    : "never refused",
);
step(
  "one estimate per interrupted hold",
  totals.estimates === totals.estimated_holds,
  `${totals.estimates} estimate(s), ${totals.estimated_holds} hold(s)`,
);

// Fake clock: everything recorded so far happened yesterday. Usage time is
// immutable by trigger, so this one maintenance statement runs with triggers
// off for this session only (lane 3's own disposable database).
await sql(
  `DO $$ BEGIN
     SET LOCAL session_replication_role=replica;
     UPDATE creator.ai_usage SET created_at=created_at-interval '1 day' WHERE creator_id='${MAYA_CREATOR_ID}';
     UPDATE creator.ai_cost_hold SET created_at=created_at-interval '1 day', expires_at=least(expires_at, clock_timestamp()-interval '1 second') WHERE creator_id='${MAYA_CREATOR_ID}';
   END $$`,
);
const tomorrow = await ask2("The next day: why does my glaze crawl?");
step(
  "the next day the budget is free again",
  tomorrow.end?.state === "delivered",
  `${tomorrow.end?.state}/${tomorrow.end?.delivery}`,
);
await closeDb();
finish();
