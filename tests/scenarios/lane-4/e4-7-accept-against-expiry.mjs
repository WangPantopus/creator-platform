// E4.7 accept against expiry: now that the scheduler expires requests on its
// own, a creator's accept and the scheduler's expiry can meet at the deadline.
// Either may win, but exactly one does: captured once and never released, or
// released once and never captured, with the signature unspent when the accept
// loses. Forced both ways with a slow processor, then raced at the deadline.
// Deadlines are moved by editing them in this stack's own database.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-7-accept-against-expiry.mjs
import {
  ACCOUNT,
  CREATOR,
  acceptCommand,
  asCreator,
  asFan,
  decide,
  expect,
  finish,
  intentsFor,
  ledger,
  offer,
  packetRow,
  setLimit,
  signAct,
  sleep,
  sql,
  step,
  stripe,
  submit,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 20 })).body;
const decideBy = (id, ms) =>
  sql(
    "UPDATE creator.commerce_packet SET decision_at=now()+($2*interval '1 millisecond') WHERE id=$1",
    [id, ms],
  );
async function until(what, check, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(250);
  }
}
/** One winner, and the money agrees with it everywhere. */
async function settled(id, signedActId) {
  const p = await until(
    "a final state",
    async () =>
      ["accepted", "expired"].includes((await packetRow(id)).state) &&
      (await packetRow(id)),
  );
  const rows = (await ledger(id)).map((r) => `${r.kind}:${r.amount}`).join(" ");
  const [intent] = await intentsFor(id);
  const spent =
    (
      await sql(
        "SELECT 1 FROM creator.signed_act_consumption WHERE signed_act_id=$1",
        [signedActId],
      )
    ).length === 1;
  if (p.state === "accepted")
    expect(
      rows === "hold:5000 capture:5000" &&
        intent.status === "succeeded" &&
        spent,
      `accepted but ${rows} ${intent.status} spent=${spent}`,
    );
  else
    expect(
      rows === "hold:5000 release:5000" &&
        intent.status === "canceled" &&
        intent.amount_received === 0 &&
        !spent,
      `expired but ${rows} ${intent.status} spent=${spent}`,
    );
  return p.state;
}
async function signedRequest() {
  const p = (await submit(fan, mode)).body.packet;
  const { signedActId } = await signAct(
    maya,
    acceptCommand(await packetRow(p.id)),
  );
  expect(signedActId, "Maya could not sign");
  return { p, signedActId };
}

// A fast scheduler, so its passes meet the accepts.
await stopScheduler();
await startScheduler(500);
await step(
  "E4.7-1",
  "the accept lands first and its capture is slow: the deadline passes, the scheduler leaves it, it is captured once",
  async () => {
    const { p, signedActId } = await signedRequest();
    await stripe({
      fault: { op: "capture", phase: "delay", delayMs: 3000, times: 1 },
    });
    await decideBy(p.id, 1000);
    const accepted = await decide(maya, p.id, {
      action: "reply_myself",
      signedActId,
    });
    expect(accepted.status === 200, `${accepted.status} ${accepted.code}`);
    expect((await settled(p.id, signedActId)) === "accepted", "expired");
    return "accepted, captured once, never released";
  },
);
await step(
  "E4.7-2",
  "the expiry lands first and its release is slow: the accept is refused, the signature stays unspent",
  async () => {
    const { p, signedActId } = await signedRequest();
    await stripe({
      fault: { op: "cancel", phase: "delay", delayMs: 3000, times: 1 },
    });
    await decideBy(p.id, 300);
    await until(
      "the release",
      async () => (await packetRow(p.id)).state === "releasing",
      10000,
    );
    const late = await decide(maya, p.id, {
      action: "reply_myself",
      signedActId,
    });
    expect(late.status === 403, `${late.status} ${late.code}`);
    expect((await settled(p.id, signedActId)) === "expired", "accepted");
    return `accept refused ${late.status} ${late.code}; released once`;
  },
);
await step(
  "E4.7-3",
  "accepts sent around the deadline instant: each request ends with exactly one winner",
  async () => {
    const outcomes = [];
    for (const before of [400, 150, 50, 0, -50]) {
      const { p, signedActId } = await signedRequest();
      await decideBy(p.id, 1500);
      await sleep(1500 - before);
      const answer = await decide(maya, p.id, {
        action: "reply_myself",
        signedActId,
      });
      outcomes.push(
        `${before} ms before: ${await settled(p.id, signedActId)} (${answer.status}${answer.code ? ` ${answer.code}` : ""})`,
      );
    }
    return outcomes.join("; ");
  },
);
await finish();
