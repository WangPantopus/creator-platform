// A3: catalogue drift inside one held generation transaction. While the worker
// is inside a generation transaction, an extra privilege is granted to a
// reviewed consumer role in lane 3's own disposable database (as a stand-in for
// an unreviewed migration or an operator mistake). The transaction must not
// commit and no AI sentence may be stored after the drift; after the grant is
// revoked, the next answer is delivered again.
//   node tests/scenarios/lane-3/a3-drift.mjs [--role creator_w2_generation_metadata]
import {
  ACTORS,
  API,
  MODEL,
  call,
  closeDb,
  ensureMaya,
  flag,
  key,
  openFan,
  reporter,
  sleep,
  sql,
} from "./lib.mjs";

const { step, finish } = reporter();
const role = flag("--role", "creator_w2_generation_metadata");
step(
  "Maya's AI is live",
  true,
  await ensureMaya(Number(flag("--cap", "20000000"))),
);
await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 300 } });
const fan = await openFan(ACTORS.fanOne, "lane3fan1");
const ask = (text) =>
  call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: {
      idempotencyKey: key("drift"),
      text,
      clientSequence: Date.now() % 1e6,
    },
  });
const finished = async (g) => {
  for (let w = 0; w < 150; w++) {
    const [row] = await sql(
      "SELECT g.state, g.last_sequence AS seq, m.delivery_state AS delivery FROM creator.generation g JOIN creator.message m ON m.id=g.ai_message_id WHERE g.id=$1",
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

const sent = await ask("Drift during an answer: why does my glaze crawl?");
const g = sent.json?.generationId;
step(
  "message acknowledged",
  sent.status === 200 && Boolean(g),
  `status ${sent.status}`,
);
// Wait until the worker is inside a generation transaction that has already read its stage input.
let inside = false;
for (let w = 0; w < 2000 && !inside; w++) {
  const [row] = await sql(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='creator_generation_worker' AND xact_start IS NOT NULL AND query LIKE '%generation_agent_inputs%'",
  );
  inside = row.n > 0;
  if (!inside) await sleep(5);
}
await sql(`GRANT SELECT ON creator.message TO ${role}`);
const [drift] = await sql("SELECT clock_timestamp() AS t");
const [activity] = await sql(
  "SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename='creator_generation_worker' AND xact_start IS NOT NULL AND xact_start<$1",
  [drift.t],
);
step(
  "drift committed while a generation transaction was open",
  inside && activity.n > 0,
  `granted SELECT on creator.message to ${role}`,
);
const end = await finished(g);
const late = await sql(
  "SELECT count(*)::int AS n FROM creator.event WHERE type='sentence' AND payload->>'generationId'=$1 AND created_at>$2",
  [g, drift.t],
);
step(
  "no AI sentence stored after the drift",
  late[0].n === 0,
  `${late[0].n} after, answer ${end?.state}/${end?.delivery}, ${end?.seq ?? "?"} sentence(s)`,
);
step(
  "the answer ended honestly, not delivered under drift",
  end && end.state !== "delivered",
  `${end?.state}`,
);
await sql(`REVOKE SELECT ON creator.message FROM ${role}`);
const left = await sql(
  "SELECT count(*)::int AS n FROM creator.ai_usage WHERE cost_micros IS NULL",
);
if (left[0].n === 0) {
  const next = await ask(
    "After the drift was revoked: why does my glaze crawl?",
  );
  const after = await finished(next.json?.generationId);
  step(
    "after revoking, the next answer is delivered",
    after?.state === "delivered",
    `${after?.state}/${after?.delivery}`,
  );
} else
  step(
    "after revoking, the next answer is delivered",
    false,
    `not run: ${left[0].n} uncertain provider cost row(s) lock the creator (A6)`,
  );
await closeDb();
finish();
