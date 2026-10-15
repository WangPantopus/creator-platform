// A6: a provider error before any response body (429, 500) is a known zero
// cost, not an unknown one, so it never locks the creator's AI. The model fake
// (outer edge) answers with an error during a reply, then during the
// acknowledgment's safety check; afterwards the next reply must be delivered.
// Behind the screen: the failed calls' usage rows carry a zero cost, none is
// unknown, and the fan's allowance outcome for the failed reply is reported.
//   node tests/scenarios/lane-3/a6-provider-errors.mjs
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
  sleep,
  sql,
} from "./lib.mjs";

const { step, finish } = reporter();
step(
  "Maya's AI is live",
  true,
  await ensureMaya(Number(flag("--cap", "20000000"))),
);
const mode = (m) =>
  call(MODEL, "POST", "/__control", { body: { mode: m, delayMs: 300 } });
await mode("ok");
const fan = await openFan(ACTORS.fanOne, "lane3fan1");
const ask = (text) =>
  call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: {
      idempotencyKey: key("a6e"),
      text,
      clientSequence: Date.now() % 1e6,
    },
  });
const settle = async (g) => {
  for (let w = 0; w < 160 && g; w++) {
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
const unknown = async () =>
  (
    await sql(
      "SELECT count(*)::int AS n FROM creator.ai_usage WHERE creator_id=$1 AND cost_micros IS NULL",
      [MAYA_CREATOR_ID],
    )
  )[0].n;

for (const failure of ["error429", "error500"]) {
  const sent = await ask(
    `Provider ${failure} during the reply: why does my glaze crawl?`,
  );
  await mode(failure);
  const end = await settle(sent.json?.generationId);
  await mode("ok");
  const rows = await sql(
    "SELECT category, provider, cost_micros::bigint AS cost FROM creator.ai_usage WHERE generation_id=$1 ORDER BY call_ordinal",
    [sent.json?.generationId],
  );
  const [allowance] = await sql(
    "SELECT state, settled_units AS settled FROM creator.commerce_allowance_reservation WHERE key='generation:'||$1",
    [sent.json?.generationId],
  );
  step(
    `${failure} during a reply: the answer fails honestly and the failed call costs a known zero`,
    end?.state === "failed" &&
      rows.length > 0 &&
      rows.every((r) => r.cost !== null) &&
      (await unknown()) === 0,
    `${end?.state}; calls [${rows.map((r) => `${r.category}:${r.cost ?? "unknown"}`).join(", ")}]; fan allowance ${allowance?.state}/${allowance?.settled ?? "unsettled"}`,
  );
  const next = await ask(`After ${failure}: why does my glaze crawl?`);
  const nextEnd = await settle(next.json?.generationId);
  step(
    `after ${failure} the next reply is delivered (not locked)`,
    nextEnd?.state === "delivered",
    `${nextEnd?.state}/${nextEnd?.delivery}`,
  );
}

// The acknowledgment's own safety check meets the error.
const since = (await sql("SELECT clock_timestamp() AS t"))[0].t;
await mode("error500");
const acked = await ask(
  "Provider error during the acknowledgment: why does my glaze crawl?",
);
await mode("ok");
await settle(acked.json?.generationId);
const ackRows = await sql(
  "SELECT category, cost_micros::bigint AS cost FROM creator.ai_usage WHERE creator_id=$1 AND generation_id IS NULL AND created_at>=$2",
  [MAYA_CREATOR_ID, since],
);
step(
  "an error during the acknowledgment's safety check records a known zero, not an unknown cost",
  ackRows.every((r) => r.cost !== null) && (await unknown()) === 0,
  `send ${acked.status} ${acked.json?.error?.code ?? ""}; acknowledgment calls [${ackRows.map((r) => `${r.category}:${r.cost ?? "unknown"}`).join(", ")}]`,
);
const last = await ask(
  "After the acknowledgment error: why does my glaze crawl?",
);
const lastEnd = await settle(last.json?.generationId);
step(
  "then the next reply is delivered",
  lastEnd?.state === "delivered",
  `${lastEnd?.state}/${lastEnd?.delivery}`,
);
await closeDb();
finish();
