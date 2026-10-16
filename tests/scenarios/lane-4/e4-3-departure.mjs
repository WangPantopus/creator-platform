// E4.3 with no tap, when ops pauses a creator (lane 1's G1, decision P1 as
// proposed): the supervisor pauses Maya through lane 1's real ops decision.
// On the stock backend alone the pause cannot finish (commerce's settlement is
// not composed there). With it composed (the trust host, the wiring proposed
// for server.ts), every request Maya has not accepted ends with its hold
// released and nothing charged; a hold still being placed is waited for, not
// abandoned; the accepted request keeps its deadline, and is refunded once when
// it passes; the pause case resolves; asking again changes nothing.
// In this stack's own database: one request's 3-D Secure window and the
// accepted request's deadline are moved. After the stock backend has shown that
// it cannot finish the pause, it is stopped, so that only the trust host's
// worker claims the effect. Maya stays paused afterwards (there is no unpause
// yet): reset the stack after this scenario, which also starts the backend.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-3-departure.mjs
import {
  ACCOUNT,
  CREATOR,
  accept,
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
  signIn,
  sleep,
  sql,
  step,
  submit,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";
import {
  askDeparture,
  settlements,
  startTrustHost,
  stopStackBackend,
  stopTrustHost,
} from "./trust-host-control.mjs";

await stopTrustHost();
await stopScheduler();
const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const two = await asFan(ACCOUNT.fanTwo);
const three = await asFan(ACCOUNT.fanThree);
for (const fan of [two, three]) await setLimit(fan, 1_000_000);
const mode = (
  await offer(maya, { weeklyLimit: 6, title: "Written reply (departure)" })
).body;
const slot = async () =>
  (
    await sql(
      "SELECT coalesce(sum(reserved),0)::int AS reserved,coalesce(sum(used),0)::int AS used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0];
async function until(what, check, ms = 240000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(1000);
  }
}
const pauseCase = async (id) =>
  (
    await sql(
      `SELECT c.state,(SELECT string_agg(e.type||'='||e.state||':'||coalesce(e.error_code,''),',') FROM creator_trust.effect e WHERE e.case_id=c.id) AS effects
       FROM creator_trust.safety_case c WHERE c.id=$1`,
      [id],
    )
  )[0];

// Four requests to Maya: two held, one accepted, one whose hold is still
// being placed (3-D Secure not finished).
const held = [
  (await submit(two, mode)).body.packet.id,
  (await submit(three, mode)).body.packet.id,
];
const accepted = (await submit(two, mode)).body.packet.id;
expect((await accept(maya, accepted)).status === 200, "accept");
const placing = (
  await submit(three, mode, { paymentMethodId: "pm_cardAuthRequired" })
).body.packet.id;
const dueBefore = (
  await sql(
    "SELECT due_at FROM creator.commerce_commitment WHERE packet_id=$1",
    [accepted],
  )
)[0].due_at;
const reporter = await signIn(ACCOUNT.fanOne);
const supervisor = await signIn(ACCOUNT.team);
let caseId;

await step(
  "E4.3-17",
  "the supervisor pauses Maya; on the stock backend alone the pause cannot finish, and her requests stay held",
  async () => {
    const filed = await http("POST", "/v1/trust/reports", reporter.token, {
      kind: "pause",
      creatorId: CREATOR.maya,
      reason: "Please pause this AI while it is reviewed.",
      idempotencyKey: key("report"),
    });
    caseId = filed.body?.id;
    const opened = await http(
      "POST",
      `/v1/trust/cases/${caseId}/access`,
      supervisor.token,
      { purpose: "Review this report as assigned.", minutes: 15 },
    );
    const paused = await http(
      "POST",
      `/v1/trust/cases/${caseId}/decisions`,
      supervisor.token,
      {
        version: 1,
        resolution: "pause_creator",
        reason: "Paused while the report is reviewed.",
        idempotencyKey: key("decide"),
      },
    );
    const stuck = await until(
      "the stock worker's attempt",
      async () => {
        const c = await pauseCase(caseId);
        return c?.effects?.includes("=retry:") ? c : null;
      },
      60000,
    );
    const states = await Promise.all(
      held.map(async (id) => (await packetRow(id)).state),
    );
    expect(
      filed.status === 201 &&
        opened.status === 200 &&
        paused.status === 200 &&
        stuck.state === "action_pending" &&
        states.every((s) => s === "submitted"),
      `${filed.status} ${opened.status} ${paused.status} ${JSON.stringify(stuck)} ${states}`,
    );
    return `${stuck.state} (${stuck.effects}); both held requests still submitted`;
  },
);
await step(
  "E4.3-18",
  "with the settlement composed: the requests Maya has not accepted end released, nothing charged; the one still being placed is waited for",
  async () => {
    await stopStackBackend();
    await startTrustHost();
    for (const id of held)
      await until(
        "the release",
        async () => (await packetRow(id)).state === "expired",
      );
    const rows = await Promise.all(
      held.map(async (id) =>
        (await ledger(id)).map((r) => `${r.kind}:${r.amount}`).join(" "),
      ),
    );
    const intents = (
      await Promise.all(held.map((id) => intentsFor(id)))
    ).flat();
    const waiting = await until("the waiting answer", async () =>
      settlements(caseId).find((answer) => !answer.complete),
    );
    const c = await pauseCase(caseId);
    expect(
      rows.every((r) => r === "hold:5000 release:5000") &&
        intents.every((i) => i.status === "canceled" && !i.amount_received) &&
        (await packetRow(placing)).state === "submitting" &&
        waiting.receipt.waiting >= 1 &&
        c.state === "action_pending",
      `${rows} ${intents.map((i) => i.status)} ${(await packetRow(placing)).state} ${JSON.stringify(waiting)} ${c.state}`,
    );
    return `both expired, ledger hold+release, the processor canceled both; the 3-D Secure one still placing, so the settlement answered ${JSON.stringify(waiting.receipt)} and the case waits (${c.state})`;
  },
);
await step(
  "E4.3-19",
  "once that hold settles, the next attempt completes the pause case; the accepted request keeps its deadline",
  async () => {
    // Its 3-D Secure window runs out now; the scheduler ends it.
    await sql(
      "UPDATE creator.commerce_packet SET auth_pending_until=now() WHERE id=$1",
      [placing],
    );
    await startScheduler(500);
    await until(
      "the placing request ended",
      async () =>
        !["submitting", "releasing"].includes((await packetRow(placing)).state),
    );
    const resolved = await until("the resolution", async () => {
      const c = await pauseCase(caseId);
      return c?.state === "resolved" ? c : null;
    });
    const receipt = (
      await sql(
        "SELECT receipt FROM creator_trust.effect WHERE case_id=$1 AND type='agent.pause'",
        [caseId],
      )
    )[0]?.receipt;
    const commitment = (
      await sql(
        "SELECT state,due_at FROM creator.commerce_commitment WHERE packet_id=$1",
        [accepted],
      )
    )[0];
    // Every accepted request Maya still owes keeps its deadline: this
    // scenario's, and any an earlier scenario left on the stack.
    const owed = (
      await sql(
        "SELECT count(*)::int AS n FROM creator.commerce_packet p JOIN creator.commerce_commitment c ON c.packet_id=p.id WHERE p.creator_id=$1 AND p.state='accepted' AND c.state IN ('due','in_progress')",
        [CREATOR.maya],
      )
    )[0].n;
    expect(
      receipt?.settlement?.waiting === 0 &&
        receipt.settlement.accepted === owed &&
        owed >= 1 &&
        commitment.state === "due" &&
        commitment.due_at.getTime() === dueBefore.getTime() &&
        (await packetRow(accepted)).state === "accepted",
      `${JSON.stringify(receipt?.settlement)} ${JSON.stringify(commitment)}`,
    );
    return `${resolved.state}; settlement ${JSON.stringify(receipt.settlement)} (${owed} accepted request(s) Maya still owes); the placing request ended ${(await packetRow(placing)).state}; the accepted one still due at the same time`;
  },
);
await step(
  "E4.3-20",
  "asking again changes nothing; a case without a creator is refused",
  async () => {
    const before = await sql(
      "SELECT count(*)::int AS n FROM creator.commerce_ledger WHERE packet_id=ANY($1::uuid[])",
      [[...held, accepted, placing]],
    );
    const again = await askDeparture({
      effectId: "30000000-0000-4000-8000-000000000001",
      caseId,
      actorAccountId: ACCOUNT.team,
      creatorId: CREATOR.maya,
      requestId: null,
      reason: "again",
      idempotencyKey: key("again"),
    });
    const after = await sql(
      "SELECT count(*)::int AS n FROM creator.commerce_ledger WHERE packet_id=ANY($1::uuid[])",
      [[...held, accepted, placing]],
    );
    const without = await askDeparture({
      effectId: "30000000-0000-4000-8000-000000000002",
      caseId,
      actorAccountId: ACCOUNT.team,
      creatorId: null,
      requestId: null,
      reason: "no creator",
      idempotencyKey: key("none"),
    });
    expect(
      again.status === 200 &&
        again.body.complete === true &&
        again.body.receipt.released === 0 &&
        before[0].n === after[0].n &&
        without.status === 503 &&
        without.body.error.code === "creator_evidence_required",
      `${again.status} ${JSON.stringify(again.body)}; ledger ${before[0].n}->${after[0].n}; ${without.status} ${JSON.stringify(without.body)}`,
    );
    return `again: ${JSON.stringify(again.body.receipt)}, no new ledger row; without a creator: ${without.body.error.code}`;
  },
);
await step(
  "E4.3-21",
  "the accepted request's deadline passes undelivered (Maya is paused): refunded once, the existing rule",
  async () => {
    await sql(
      "UPDATE creator.commerce_commitment SET due_at=now()-interval '1 second' WHERE packet_id=$1",
      [accepted],
    );
    await until(
      "the refund",
      async () => (await packetRow(accepted)).payment_state === "refunded",
    );
    const rows = (await ledger(accepted)).map((r) => r.kind).join(" ");
    const s = await slot();
    expect(
      rows === "hold capture refund" && s.reserved === 0,
      `${rows} ${JSON.stringify(s)}`,
    );
    return `refunded once (ledger ${rows}); capacity reserved ${s.reserved}`;
  },
);
await stopScheduler();
await stopTrustHost();
await finish();
