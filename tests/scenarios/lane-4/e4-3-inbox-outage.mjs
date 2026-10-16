// E4.3 with the processor's notifications unavailable: the scheduler's login to
// the provider inbox stops working (a new password and its connections closed,
// the way a credential rotation does it; the local stack does it to every login
// on `up`). The scheduler must stay up, a request nobody decides must still
// expire at its deadline and be released once with no tap, because the due
// scan never depends on notifications, and every pass must say why it failed by
// its codes, never its message. Once the login works again, a notification is
// claimed and finished. The deadline and the login's password are changed in
// this stack's own database.
// Fakes: card processor, development identity, software passkey.
//   node tests/scenarios/lane-4/e4-3-inbox-outage.mjs
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  packetRow,
  setLimit,
  sleep,
  sql,
  step,
  submit,
} from "./lib.mjs";
import {
  WEBHOOK_SECRET,
  WEBHOOK_URL,
  ensureInboxLogin,
  schedulerRunning,
  startScheduler,
  stopScheduler,
} from "./scheduler.mjs";

const log = join(tmpdir(), "qelvora-lane4-scenarios", "scheduler.log");
const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (
  await offer(maya, { weeklyLimit: 3, title: "Written reply (inbox outage)" })
).body;
const slot = async () =>
  (
    await sql(
      "SELECT reserved,used FROM creator.commerce_capacity WHERE mode_id=$1",
      [mode.id],
    )
  )[0];
async function until(what, check, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) throw new Error(`${what}: not within ${ms / 1000} s`);
    await sleep(500);
  }
}
const failures = (from) =>
  readFileSync(log, "utf8")
    .slice(from)
    .split("\n")
    .filter((line) => line.includes("commerce_recovery_pass_failed"));

// The scheduler starts with a working login, then the login stops working.
// The login is made here too, so a fresh scenario directory needs no other
// scenario to have run first.
await stopScheduler();
await ensureInboxLogin();
await startScheduler(500);
await sleep(1500);
const from = statSync(log).size;
await sql(
  `ALTER ROLE creator_commerce_inbox PASSWORD '${randomBytes(18).toString("base64url")}'`,
);
await sql(
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename='creator_commerce_inbox'",
);

let id;
await step(
  "E4.3-9",
  "the scheduler stays up when its inbox connections are closed under it",
  async () => {
    await sleep(3000);
    expect(schedulerRunning(), "the scheduler process is gone");
    return "still running 3 s later";
  },
);
await step(
  "E4.3-10",
  "with the inbox login refused, a request left alone still expires at its deadline and is released once",
  async () => {
    id = (await submit(fan, mode)).body.packet.id;
    await sql(
      "UPDATE creator.commerce_packet SET decision_at=now()+interval '2 seconds' WHERE id=$1",
      [id],
    );
    await until(
      "the expiry",
      async () => (await packetRow(id)).state === "expired",
    );
    const p = await packetRow(id);
    const rows = (await ledger(id))
      .map((r) => `${r.kind}:${r.amount}`)
      .join(" ");
    const intents = await intentsFor(id);
    const s = await slot();
    expect(
      p.payment_state === "released" &&
        rows === "hold:5000 release:5000" &&
        intents.length === 1 &&
        intents[0].status === "canceled" &&
        s.reserved === 0,
      `${p.state}/${p.payment_state}; ${rows}; ${intents.map((i) => i.status)}; ${s.reserved} reserved`,
    );
    return `expired/released with no tap; ledger ${rows}; the processor canceled the hold; the slot is free`;
  },
);
await step(
  "E4.3-11",
  "every failed pass says why by its codes, never its message",
  async () => {
    const lines = failures(from);
    const parsed = lines.map((line) => JSON.parse(line));
    const codes = [
      ...new Set(parsed.map((p) => `${p.code ?? "none"}/${p.cause ?? "none"}`)),
    ];
    expect(
      parsed.length > 0 &&
        parsed.every(
          (p) => p.code === "notifications_unavailable" && p.cause === "28P01",
        ) &&
        !lines.some((line) => /password|creator_commerce_inbox/iu.test(line)),
      `${parsed.length} failures, codes ${codes.join(", ")}`,
    );
    return `${parsed.length} failed passes, all ${codes.join(", ")}; no message or login name in the log`;
  },
);
await step(
  "E4.3-12",
  "once the login works again, a notification is claimed and finished",
  async () => {
    await ensureInboxLogin();
    // A pass already under way with the old password may still fail once.
    await sleep(1500);
    const before = failures(from).length;
    const p = await packetRow(id);
    const note = {
      id: `evt_${randomBytes(10).toString("hex")}`,
      object: "event",
      type: "payment_intent.canceled",
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: p.intent_ref, object: "payment_intent" } },
    };
    const payload = JSON.stringify(note);
    const at = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", WEBHOOK_SECRET)
      .update(`${at}.${payload}`)
      .digest("hex");
    const answer = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${at},v1=${signature}`,
      },
      body: payload,
    });
    const row = await until(
      "the notification",
      async () =>
        (
          await sql(
            "SELECT state,attempt,error_code FROM creator.commerce_provider_inbox WHERE event_id=$1 AND state='done'",
            [note.id],
          )
        )[0],
    );
    await sleep(2000);
    const after = failures(from).length;
    expect(
      answer.status === 204 &&
        row.attempt === 1 &&
        after === before &&
        (await packetRow(id)).state === "expired",
      `${answer.status}; ${JSON.stringify(row)}; failures ${before}->${after}`,
    );
    return `204; claimed and done on attempt ${row.attempt}; no failed pass since; the request is still expired`;
  },
);
await stopScheduler();
await finish();
