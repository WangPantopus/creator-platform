// Lane 4's invariant sweep: a read-only check of the whole money state of the
// lane 4 stack, run after every scenario (lib.mjs finish()) or on its own:
//   node tests/scenarios/lane-4/sweep.mjs        exits 1 when an invariant is broken
// It reads the database in one read-only snapshot and, when it answers, the fake
// processor's record of what was really held, captured and refunded. A
// scenario passes only when its own steps and this sweep both pass.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const pg = require("pg");
const ADMIN_DB =
  process.env.LANE4_ADMIN_DB ??
  "postgresql://postgres:foundation-test-only@127.0.0.1:56440/creator_stack";
const STRIPE = process.env.LANE4_FAKE_STRIPE ?? "http://127.0.0.1:56444";
const LIVE = [
  "submitting",
  "submitted",
  "more_info",
  "offer_pending",
  "accepting",
  "releasing",
];
const TERMINAL = ["draft", "declined", "expired", "withdrawn", "accepted"];
const sum = (rows) => rows.reduce((n, r) => n + r.amount, 0);

export async function sweep() {
  const client = new pg.Client({ connectionString: ADMIN_DB });
  await client.connect();
  const lines = [];
  let checks = 0;
  let failures = 0;
  const check = (id, what, problems, note = "") => {
    checks += 1;
    if (problems.length) failures += 1;
    lines.push(
      `${problems.length ? "FAIL" : "PASS"} ${id} ${what}${note ? ` (${note})` : ""}${problems.length ? ` :: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? ` (+${problems.length - 5} more)` : ""}` : ""}`,
    );
  };
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const q = async (text) => (await client.query(text)).rows;
    const packets =
      await q(`SELECT p.id,p.state,p.payment_state,p.authorization_attempt AS attempt,p.accepted_act_id,p.mode_id,p.capacity_window,p.accepted_at,
      (p.snapshot->>'amount')::float8 AS amount,cp.account_id AS creator_account,
      (SELECT count(*) FROM creator.signed_act sa JOIN creator.signed_act_consumption c ON c.signed_act_id=sa.id
        WHERE sa.id=p.accepted_act_id AND sa.act_type='accept' AND sa.account_id=cp.account_id AND sa.creator_id=p.creator_id AND sa.subject_id=p.thread_id)::int AS consumed_accept
      FROM creator.commerce_packet p JOIN creator.creator_profile cp ON cp.id=p.creator_id`);
    const ledger = await q(
      "SELECT id,packet_id,kind,amount::float8 AS amount,currency,cause,created_at FROM creator.commerce_ledger ORDER BY created_at,id",
    );
    const effects = await q(
      "SELECT packet_id,operation,state,error_code FROM creator.commerce_effect WHERE packet_id IS NOT NULL",
    );
    const capacity = await q(
      "SELECT mode_id,window_start,capacity_limit,used,reserved FROM creator.commerce_capacity",
    );
    const commitments =
      await q(`SELECT c.packet_id,c.state,c.due_at,c.delivered_at,m.author_kind,m.author_account_id,m.created_at AS message_at
      FROM creator.commerce_commitment c LEFT JOIN creator.message m ON m.id=c.delivered_message_id`);
    const [identity] = await q(
      "SELECT (SELECT system_identifier FROM pg_control_system())::text AS cluster,(SELECT oid FROM pg_database WHERE datname=current_database())::text AS db",
    );
    const trigger = await q(
      "SELECT tgenabled FROM pg_trigger WHERE tgname='commerce_ledger_immutable' AND tgrelid='creator.commerce_ledger'::regclass",
    );
    let provider = null;
    try {
      provider = await (
        await fetch(`${STRIPE}/__state`, { signal: AbortSignal.timeout(3000) })
      ).json();
    } catch {
      lines.push(
        "NOTE the fake processor did not answer: provider-side checks not run",
      );
    }
    const byPacket = new Map(
      packets.map((p) => [p.id, { ...p, rows: [], intents: [] }]),
    );
    for (const row of ledger) byPacket.get(row.packet_id)?.rows.push(row);
    for (const intent of provider?.intents ?? [])
      byPacket.get(intent.metadata.packet_id)?.intents.push(intent);
    const inFlight = new Set(
      effects
        .filter((e) => ["pending", "processing", "unknown"].includes(e.state))
        .map((e) => e.packet_id),
    );
    if (inFlight.size)
      lines.push(
        `NOTE ${inFlight.size} request(s) still have money work in flight; their provider comparisons are skipped`,
      );

    const s1 = [],
      s2 = [],
      s3 = [],
      s4 = [],
      s6 = [],
      s8 = [];
    for (const p of byPacket.values()) {
      const attempts = new Map();
      for (const row of p.rows) {
        const m = /:(authorize|capture|release|bank_release):(\d+)$/u.exec(
          row.cause,
        );
        if (!m) continue;
        const a = attempts.get(m[2]) ?? { holds: [], closes: [] };
        (m[1] === "authorize" ? a.holds : a.closes).push(row);
        attempts.set(m[2], a);
      }
      for (const [n, a] of attempts) {
        const live = Number(n) === p.attempt && LIVE.includes(p.state);
        if (!a.holds.length)
          s1.push(
            `${p.id} attempt ${n}: ${a.closes.map((r) => r.kind)} without a hold`,
          );
        else if (a.closes.length > 1)
          s1.push(`${p.id} attempt ${n}: closed ${a.closes.length} times`);
        else if (live && a.closes.length)
          s1.push(`${p.id} attempt ${n}: closed while ${p.state}`);
        else if (!live && !a.closes.length)
          s1.push(`${p.id} attempt ${n}: hold never closed (${p.state})`);
        for (const close of a.closes)
          if (a.holds[0] && close.amount !== a.holds[0].amount)
            s6.push(
              `${p.id}: ${close.kind} ${close.amount} against a hold of ${a.holds[0].amount}`,
            );
      }
      const captured = sum(p.rows.filter((r) => r.kind === "capture"));
      const refunded = sum(p.rows.filter((r) => r.kind === "refund"));
      const open =
        sum(p.rows.filter((r) => r.kind === "hold")) -
        captured -
        sum(p.rows.filter((r) => r.kind === "release"));
      if (captured !== (p.state === "accepted" ? p.amount : 0))
        s2.push(
          `${p.id}: captured ${captured} while ${p.state} at a price of ${p.amount}`,
        );
      if (captured && !(p.accepted_act_id && p.consumed_accept === 1))
        s3.push(
          `${p.id}: ${captured} captured without the creator's consumed signed accept`,
        );
      if (refunded > captured)
        s4.push(`${p.id}: refunded ${refunded} of ${captured}`);
      const expectOpen =
        LIVE.includes(p.state) && attempts.get(String(p.attempt))?.holds.length
          ? p.amount
          : 0;
      if (open !== expectOpen)
        s6.push(
          `${p.id}: ${open} still held in the ledger while ${p.state}, expected ${expectOpen}`,
        );
      if (provider && !inFlight.has(p.id)) {
        const received = p.intents.reduce((n, i) => n + i.amount_received, 0);
        const back = p.intents.reduce((n, i) => n + i.refunded, 0);
        const holds = p.intents.filter(
          (i) => i.status === "requires_capture",
        ).length;
        if (received !== captured)
          s6.push(
            `${p.id}: processor captured ${received}, ledger ${captured}`,
          );
        if (back !== refunded)
          s6.push(`${p.id}: processor refunded ${back}, ledger ${refunded}`);
        if (holds !== (expectOpen ? 1 : 0))
          s6.push(
            `${p.id}: ${holds} live hold(s) at the processor while ${p.state}/${p.payment_state}`,
          );
        if (received && !p.accepted_act_id)
          s3.push(
            `${p.id}: the processor captured ${received} for a request with no accepted act`,
          );
        if (TERMINAL.includes(p.state) && holds)
          s8.push(
            `${p.id}: ${p.state} with ${holds} open hold(s) at the processor`,
          );
        for (const i of p.intents)
          if (i.refunded > i.amount_received)
            s4.push(
              `${i.id}: processor refunded ${i.refunded} of ${i.amount_received}`,
            );
      }
      if (TERMINAL.includes(p.state) && open)
        s8.push(`${p.id}: ${p.state} with ${open} held in the ledger`);
    }
    for (const e of effects)
      if (
        e.operation === "capture" &&
        (e.error_code === "capture_without_acceptance" ||
          (e.state !== "failed" &&
            !["accepting", "accepted"].includes(
              byPacket.get(e.packet_id)?.state,
            )))
      )
        s3.push(
          `${e.packet_id}: a capture request exists for a request nobody accepted (${e.state}${e.error_code ? `/${e.error_code}` : ""})`,
        );
    for (const intent of provider?.intents ?? [])
      if (
        !byPacket.has(intent.metadata.packet_id) &&
        intent.status === "requires_capture"
      )
        s8.push(`${intent.id}: a live hold for no known request`);
    check(
      "S1",
      "every hold ends in exactly one state",
      s1,
      `${ledger.filter((r) => r.kind === "hold").length} holds`,
    );
    check(
      "S2",
      "the captured total equals the price of the accepted requests",
      s2,
      `${sum(ledger.filter((r) => r.kind === "capture"))} captured, ${packets.filter((p) => p.state === "accepted").reduce((n, p) => n + p.amount, 0)} accepted`,
    );
    check("S3", "nothing is captured without an acceptance (INV-16)", s3);
    check(
      "S4",
      "refunds never exceed captures",
      s4,
      `${sum(ledger.filter((r) => r.kind === "refund"))} refunded`,
    );

    // S5: the immutability trigger is live, and every ledger row an earlier sweep saw is unchanged.
    const s5 =
      trigger[0]?.tgenabled === "O"
        ? []
        : ["the commerce_ledger_immutable trigger is missing or disabled"];
    // Keyed by the database's identity: a rebuilt stack starts a new history.
    const dir = join(tmpdir(), "qelvora-lane4-sweep");
    const file = join(dir, `${identity.cluster}-${identity.db}-ledger.json`);
    let seen = {};
    try {
      seen = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      /* the first sweep of this database */
    }
    const now = Object.fromEntries(
      ledger.map((r) => [
        r.id,
        `${r.packet_id}|${r.kind}|${r.amount}|${r.currency}|${r.cause}|${r.created_at.toISOString()}`,
      ]),
    );
    for (const [id, digest] of Object.entries(seen))
      if (now[id] !== digest)
        s5.push(`${id} ${now[id] ? "changed" : "disappeared"}`);
    check(
      "S5",
      "the ledger is append-only",
      s5,
      `${Object.keys(seen).length} rows from earlier sweeps re-checked`,
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ ...seen, ...now }));

    check(
      "S6",
      "held, released and captured amounts reconcile, with the processor too",
      s6,
    );
    const s7 = [];
    const delivered = new Set(
      commitments.filter((c) => c.delivered_at).map((c) => c.packet_id),
    );
    for (const c of capacity) {
      const mine = packets.filter(
        (p) =>
          p.mode_id === c.mode_id &&
          p.capacity_window.getTime() === c.window_start.getTime(),
      );
      const reserved = mine.filter((p) => LIVE.includes(p.state)).length;
      // A request refunded in full because it was not delivered gives its
      // slot back (decision 2).
      const used = mine.filter(
        (p) =>
          p.state === "accepted" &&
          !(p.payment_state === "refunded" && !delivered.has(p.id)),
      ).length;
      if (c.reserved !== reserved || c.used !== used)
        s7.push(
          `mode ${c.mode_id}: reserved ${c.reserved}/used ${c.used}, requests say ${reserved}/${used}`,
        );
      if (c.used + c.reserved > c.capacity_limit)
        s7.push(
          `mode ${c.mode_id}: ${c.used + c.reserved} booked over a limit of ${c.capacity_limit}`,
        );
    }
    check(
      "S7",
      "capacity in use equals open plus accepted, unrefunded requests (INV-10)",
      s7,
      `${capacity.length} capacity rows`,
    );
    check("S8", "no request is closed with an open hold", s8);
    const s9 = [];
    for (const c of commitments) {
      const p = byPacket.get(c.packet_id);
      if (p?.state !== "accepted")
        s9.push(`${c.packet_id}: a commitment on a ${p?.state} request`);
      if (
        c.state === "delivered" &&
        !(
          ["human_creator", "approved_draft"].includes(c.author_kind) &&
          c.author_account_id === p?.creator_account &&
          c.message_at >= p.accepted_at &&
          c.delivered_at <= c.due_at
        )
      )
        s9.push(
          `${c.packet_id}: delivered by ${c.author_kind ?? "nothing"} (INV-09)`,
        );
      if (
        c.state === "refunded" &&
        sum(p?.rows.filter((r) => r.kind === "refund") ?? []) !== p?.amount
      )
        s9.push(`${c.packet_id}: refunded commitment without an exact refund`);
    }
    check(
      "S9",
      "only the creator's own signed reply completes a commitment (INV-09)",
      s9,
      `${commitments.length} commitments`,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    await client.end();
  }
  return { checks, failures, lines };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await sweep();
  for (const line of report.lines) console.log(line);
  console.log(
    `\n${report.checks - report.failures}/${report.checks} invariants hold`,
  );
  process.exit(report.failures ? 1 : 0);
}
