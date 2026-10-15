// E4.6 3-D Secure and the processor's notifications: a fan who finishes
// 3-D Secure is held when the notification arrives, with no tap or poll;
// abandoned 3-D Secure ends released; a notification that arrives before we
// know the payment waits and is applied once; a replayed or duplicate event is
// recorded once; an out-of-order event cannot undo the current state; a bad
// signature, a stale one, or another account's event is refused and not
// recorded; an unknown event type is acknowledged and ignored. Notifications
// are signed here the way Stripe signs them (with the stack's placeholder
// secret). Fakes: card processor, development identity, software passkey; the
// inbox login is created by hand in this stack's own database
// (schema-provider-inbox-worker.sql, proposed for registration).
//   node tests/scenarios/lane-4/e4-6-webhooks.mjs
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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
  stripe,
  submit,
} from "./lib.mjs";
import {
  WEBHOOK_SECRET,
  WEBHOOK_URL,
  startScheduler,
  stopScheduler,
} from "./scheduler.mjs";

const maya = await asCreator(ACCOUNT.maya, CREATOR.maya);
const fan = await asFan(ACCOUNT.fanTwo);
await setLimit(fan, 1_000_000);
const mode = (await offer(maya, { weeklyLimit: 10 })).body;
// Stand-in for the proposed migration (schema-provider-inbox-worker.sql, in
// its own pull request) in this stack's own database: the non-owner login that
// may claim notifications. Its password lives only in the scenario directory.
const loginFile = join(tmpdir(), "qelvora-lane4-scenarios", "inbox-login");
if (!existsSync(loginFile))
  writeFileSync(loginFile, randomBytes(18).toString("base64url"), {
    mode: 0o600,
  });
await sql(
  "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_commerce_inbox') THEN CREATE ROLE creator_commerce_inbox LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION; END IF; END $$",
);
await sql(
  `ALTER ROLE creator_commerce_inbox PASSWORD '${readFileSync(loginFile, "utf8").replace(/[^A-Za-z0-9_-]/gu, "")}'`,
);
await sql("GRANT USAGE ON SCHEMA creator TO creator_commerce_inbox");
await sql(
  "GRANT SELECT (provider,event_id,event_type,object_ref,received_at,state,lease_until,attempt), UPDATE (state,lease_until,attempt,error_code) ON creator.commerce_provider_inbox TO creator_commerce_inbox",
);
await stopScheduler();
await startScheduler(2000);
const event = (type, object, extra = {}) => ({
  id: `evt_${randomBytes(10).toString("hex")}`,
  object: "event",
  type,
  livemode: false,
  created: Math.floor(Date.now() / 1000),
  data: { object },
  ...extra,
});
async function notify(
  body,
  { secret = WEBHOOK_SECRET, at = Math.floor(Date.now() / 1000) } = {},
) {
  const payload = JSON.stringify(body);
  const signature = createHmac("sha256", secret)
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
  return { status: answer.status, text: await answer.text() };
}
const inboxRow = async (id) =>
  (
    await sql(
      "SELECT state,attempt,error_code FROM creator.commerce_provider_inbox WHERE event_id=$1",
      [id],
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

let held;
await step(
  "E4.6-1",
  "3-D Secure finished, then the notification: held with no tap or poll",
  async () => {
    const id = (
      await submit(fan, mode, { paymentMethodId: "pm_cardAuthRequired" })
    ).body.packet.id;
    const p = await packetRow(id);
    expect(
      p.state === "submitting" && p.payment_state === "requires_action",
      `${p.state}/${p.payment_state}`,
    );
    await stripe({ authenticate: p.intent_ref, ok: true });
    await sleep(4000);
    expect(
      (await packetRow(id)).payment_state === "requires_action",
      "changed before any notification",
    );
    const note = event("payment_intent.amount_capturable_updated", {
      id: p.intent_ref,
      object: "payment_intent",
    });
    expect((await notify(note)).status === 204, "not accepted");
    await until(
      "the hold",
      async () => (await packetRow(id)).state === "submitted",
    );
    const row = await inboxRow(note.id);
    expect(
      (await ledger(id)).map((r) => r.kind).join() === "hold" &&
        row.state === "done",
      `${row.state}`,
    );
    held = id;
    return `requires_action for 4 s with nobody polling; after the notification submitted/requires_capture; inbox ${row.state}`;
  },
);
await step(
  "E4.6-2",
  "3-D Secure abandoned: the request ends released, no hold booked, slot freed",
  async () => {
    const id = (
      await submit(fan, mode, { paymentMethodId: "pm_cardAuthRequired" })
    ).body.packet.id;
    await sql(
      "UPDATE creator.commerce_packet SET auth_pending_until=now()-interval '1 second' WHERE id=$1",
      [id],
    );
    await until("the release", async () =>
      ["expired", "draft"].includes((await packetRow(id)).state),
    );
    const [intent] = await intentsFor(id);
    const p = await packetRow(id);
    expect(
      intent.status === "canceled" && (await ledger(id)).length === 0,
      `${intent.status} ${JSON.stringify(await ledger(id))}`,
    );
    return `${p.state}/${p.payment_state}; processor canceled; nothing in the ledger`;
  },
);
await step(
  "E4.6-3",
  "the same event delivered twice is recorded and applied once",
  async () => {
    const p = await packetRow(held);
    const note = event("payment_intent.amount_capturable_updated", {
      id: p.intent_ref,
      object: "payment_intent",
    });
    const answers = [await notify(note), await notify(note)];
    await until(
      "processing",
      async () => (await inboxRow(note.id))?.state === "done",
    );
    const rows = await sql(
      "SELECT count(*)::int AS n FROM creator.commerce_provider_inbox WHERE event_id=$1",
      [note.id],
    );
    expect(
      answers.every((a) => a.status === 204) &&
        rows[0].n === 1 &&
        (await inboxRow(note.id)).attempt === 1,
      `${answers.map((a) => a.status)} ${rows[0].n}`,
    );
    return "2 × 204, 1 row, processed once";
  },
);
await step(
  "E4.6-4",
  "an out-of-order event (canceled, for a live hold) changes nothing",
  async () => {
    const p = await packetRow(held);
    const note = event("payment_intent.canceled", {
      id: p.intent_ref,
      object: "payment_intent",
    });
    await notify(note);
    await until(
      "processing",
      async () => (await inboxRow(note.id))?.state === "done",
    );
    const after = await packetRow(held);
    expect(
      after.state === "submitted" &&
        after.payment_state === "requires_capture" &&
        (await intentsFor(held))[0].status === "requires_capture",
      `${after.state}/${after.payment_state}`,
    );
    return "processed against the processor's current truth; still submitted with its hold";
  },
);
await step(
  "E4.6-5",
  "a bad signature, a stale timestamp and another account's event are refused, not recorded",
  async () => {
    const p = await packetRow(held);
    const bad = event("payment_intent.succeeded", {
      id: p.intent_ref,
      object: "payment_intent",
    });
    const stale = event("payment_intent.succeeded", {
      id: p.intent_ref,
      object: "payment_intent",
    });
    const other = event(
      "payment_intent.succeeded",
      { id: p.intent_ref, object: "payment_intent" },
      { account: "acct_someoneelse" },
    );
    const answers = [
      await notify(bad, { secret: "whsec_not_ours" }),
      await notify(stale, { at: Math.floor(Date.now() / 1000) - 600 }),
      await notify(other),
    ];
    const recorded = await sql(
      "SELECT count(*)::int AS n FROM creator.commerce_provider_inbox WHERE event_id=ANY($1)",
      [[bad.id, stale.id, other.id]],
    );
    expect(
      answers[0].status === 400 &&
        answers[1].status === 400 &&
        answers[2].status >= 400 &&
        recorded[0].n === 0,
      `${answers.map((a) => a.status)} ${recorded[0].n}`,
    );
    return `${answers.map((a) => `${a.status} ${JSON.parse(a.text).error.code}`).join(", ")}; nothing recorded`;
  },
);
await step(
  "E4.6-6",
  "an unknown event type is acknowledged and ignored",
  async () => {
    const note = event("customer.created", {
      id: `cus_${randomBytes(6).toString("hex")}`,
      object: "customer",
    });
    const answer = await notify(note);
    await until(
      "the ignore",
      async () => (await inboxRow(note.id))?.state === "done",
    );
    const row = await inboxRow(note.id);
    expect(
      answer.status === 204 && row.error_code === "not_applicable",
      JSON.stringify(row),
    );
    return `204; inbox done/${row.error_code}`;
  },
);
await step(
  "E4.6-7",
  "a notification before we know the payment waits, and is applied once we do",
  async () => {
    await stripe({
      fault: { op: "create", phase: "after", drop: true, times: 2 },
    });
    const id = (await submit(fan, mode)).body.packet.id;
    expect(
      (await packetRow(id)).intent_ref === null,
      "the payment was already known",
    );
    const [intent] = await intentsFor(id);
    const note = event("payment_intent.amount_capturable_updated", {
      id: intent.id,
      object: "payment_intent",
    });
    await notify(note);
    await until(
      "a first try",
      async () =>
        (await inboxRow(note.id))?.attempt >= 1 &&
        (await inboxRow(note.id)).state === "pending",
    );
    // Shorten the waits by editing this stack's own database: the hold's retry, then the notification's.
    await sql(
      "UPDATE creator.commerce_effect SET next_at=now() WHERE packet_id=$1 AND operation='authorize'",
      [id],
    );
    await until(
      "the hold",
      async () => (await packetRow(id)).state === "submitted",
    );
    await sql(
      "UPDATE creator.commerce_provider_inbox SET lease_until=now() WHERE event_id=$1",
      [note.id],
    );
    await until(
      "the notification",
      async () => (await inboxRow(note.id)).state === "done",
    );
    const row = await inboxRow(note.id);
    expect(
      (await intentsFor(id)).length === 1 && (await ledger(id)).length === 1,
      "more than one hold",
    );
    return `unknown at first; notification tried ${row.attempt} times, done once the hold was known; 1 hold`;
  },
);
await step(
  "E4.6-8",
  "a charge's notification is recorded against its payment and applied",
  async () => {
    const p = await packetRow(held);
    const note = event("charge.updated", {
      id: `ch_${randomBytes(6).toString("hex")}`,
      object: "charge",
      payment_intent: p.intent_ref,
    });
    expect((await notify(note)).status === 204, "not accepted");
    await until(
      "processing",
      async () => (await inboxRow(note.id))?.state === "done",
    );
    const [row] = await sql(
      "SELECT object_ref FROM creator.commerce_provider_inbox WHERE event_id=$1",
      [note.id],
    );
    expect(row.object_ref === p.intent_ref, row.object_ref);
    return `recorded as ${row.object_ref.slice(0, 14)}…, the payment; done`;
  },
);
await finish();
