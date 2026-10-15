// E4.2 decline: Maya declines, or lets her AI answer, and the hold is
// released with nothing ever captured; a decline after the decision deadline
// still releases (never refused); and the fan reads a released, free outcome.
// The processor's record is checked for every request: no capture call, ever.
// Deadlines are moved by editing them in this stack's own database.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-2-decline.mjs
import {
  ACCOUNT,
  CREATOR,
  asCreator,
  asFan,
  decide,
  expect,
  finish,
  intentsFor,
  ledger,
  offer,
  packet,
  packetRow,
  setLimit,
  sql,
  step,
  stripeState,
  submit,
} from "./lib.mjs";
import { startScheduler, stopScheduler } from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 5 })).body;
const slots = async () =>
  (
    await sql(
      "SELECT reserved,used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0];
/** Released exactly once, never captured, and the fan sees it. */
async function releasedFree(id, reason) {
  const p = await packetRow(id);
  const rows = (await ledger(id)).map((r) => `${r.kind}:${r.amount}`).join(" ");
  const [intent] = await intentsFor(id);
  const captures = (await stripeState()).calls.filter(
    (c) => c.op === "capture" && c.ref === intent.id,
  ).length;
  const seen = (await packet(fan, id)).body.packet;
  expect(
    p.state === "declined" &&
      p.payment_state === "released" &&
      p.reason === reason,
    `${p.state}/${p.payment_state} reason ${p.reason}`,
  );
  expect(
    rows === "hold:5000 release:5000" &&
      intent.status === "canceled" &&
      intent.amount_received === 0 &&
      captures === 0,
    `${rows} ${intent.status} ${captures} capture calls`,
  );
  expect(
    seen.state === "declined" && seen.payment_state === "released",
    `fan sees ${seen.state}/${seen.payment_state}`,
  );
  return `declined/released (${reason}); ledger ${rows}; processor canceled, 0 capture calls; the fan reads declined/released`;
}

await step(
  "E4.2-1",
  "Maya declines: the hold is released at once, nothing captured, the slot freed",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    const done = await decide(maya, id, { action: "decline" });
    expect(done.status === 200, `${done.status} ${done.code}`);
    const free = await slots();
    expect(free.reserved === 0 && free.used === 0, JSON.stringify(free));
    return `${await releasedFree(id, "decline")}; slot free`;
  },
);
await step(
  "E4.2-2",
  "a decline after the decision deadline still releases (never refused)",
  async () => {
    // The scheduler is stopped for this step, so the late decline itself is what releases.
    const was = await stopScheduler();
    try {
      const id = (await submit(fan, mode)).body.packet.id;
      await sql(
        "UPDATE creator.commerce_packet SET decision_at=now()-interval '1 second' WHERE id=$1",
        [id],
      );
      const done = await decide(maya, id, { action: "decline" });
      expect(done.status === 200, `${done.status} ${done.code}`);
      return releasedFree(id, "decline");
    } finally {
      if (was) await startScheduler(2000);
    }
  },
);
await step(
  "E4.2-3",
  '"Let AI answer" releases the hold too, and records why',
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    const done = await decide(maya, id, { action: "ai_answer" });
    expect(done.status === 200, `${done.status} ${done.code}`);
    return releasedFree(id, "ai_answer");
  },
);
await step(
  "E4.2-4",
  "a decision on a declined request is refused and releases nothing twice",
  async () => {
    const id = (await submit(fan, mode)).body.packet.id;
    await decide(maya, id, { action: "decline" });
    const again = await decide(maya, id, { action: "decline" });
    const [intent] = await intentsFor(id);
    const cancels = (await stripeState()).calls.filter(
      (c) => c.op === "cancel" && c.ref === intent.id && !c.replayed,
    ).length;
    expect(
      again.status === 403 && cancels === 1,
      `${again.status} ${again.code}, ${cancels} cancels`,
    );
    return `${again.status} ${again.code}; 1 cancel at the processor`;
  },
);
await finish();
