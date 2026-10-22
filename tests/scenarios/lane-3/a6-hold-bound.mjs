// A6: the cost hold is a strict upper bound computed from what this pipeline
// can send for this creator, so a normal daily cap admits replies and no reply
// ever costs more than its hold. Maya publishes with a $5 cap (the stack's own
// seed value); fans ask short and 2,000-character questions. Behind the screen:
// each reply's hold, and the sum of its recorded provider costs.
//   node tests/scenarios/lane-3/a6-hold-bound.mjs [--cap 5000000]
import { createRequire } from "node:module";
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
// Exercise the actual pricing and receipt paths at fractional-micro prices.
// A generous token envelope must still cover each independently rounded bill.
const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const { tsImport } = require("tsx/esm/api");
const { CALL_OVERHEAD_TOKENS, priceBoundedCalls } = await tsImport(
  "../../../apps/backend/src/modules/agent/model.ts",
  import.meta.url,
);
const { responseUsage } = await tsImport(
  "../../../apps/backend/src/modules/agent/response-usage.ts",
  import.meta.url,
);
const models = {
  smallModel: "small",
  largeModel: "large",
  embeddingModel: "embedding",
};
const rate = {
  inputMicrosPerMillion: 1,
  outputMicrosPerMillion: 1,
  cachedInputMicrosPerMillion: 2,
  cacheWriteMicrosPerMillion: 3,
};
const rates = Object.fromEntries(
  Object.values(models).map((model) => [model, rate]),
);
const boundedCalls = Array.from({ length: 21 }, (_, index) => ({
  route: ["small", "large", "either", "embedding"][index % 4],
  inputTokens: 1,
}));
const roundedHold = priceBoundedCalls(models, rates, boundedCalls, 1);
for (const kind of ["fresh", "cached", "cache-write"]) {
  const receipts = boundedCalls.map((call) => {
    const tokens = call.inputTokens + CALL_OVERHEAD_TOKENS;
    return responseUsage(
      {
        input_tokens: tokens,
        output_tokens: call.route === "embedding" ? 0 : 1,
        input_tokens_details: {
          cached_tokens: kind === "cached" ? tokens : 0,
          cache_write_tokens: kind === "cache-write" ? tokens : 0,
        },
      },
      call.route === "either" ? "large" : call.route,
      rate,
    );
  });
  const billed = receipts.reduce((sum, receipt) => sum + receipt.costMicros, 0);
  step(
    `${kind} pricing: the hold covers all 21 individually rounded receipts`,
    receipts.every((receipt) => receipt.costMicros === 1) &&
      roundedHold >= billed,
    `hold ${roundedHold}, separately billed ${billed} micros (one final rounding would reserve only 1)`,
  );
}
const cap = Number(flag("--cap", "5000000"));
step("Maya's AI is live", true, await ensureMaya(cap));
await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 300 } });
const fan = await openFan(ACTORS.fanOne, "lane3fan1");
const short = "How should I glaze a test tile so it does not crawl?";
const questions = [
  short,
  short.padEnd(2000, "."),
  short,
  short.padEnd(2000, "."),
  short,
];
let worst = 0;
for (const [i, text] of questions.entries()) {
  const sent = await call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: {
      idempotencyKey: key("hold"),
      text,
      clientSequence: Date.now() % 1e6,
    },
  });
  let row;
  for (let w = 0; w < 240 && sent.json?.generationId; w++) {
    [row] = await sql("SELECT state FROM creator.generation WHERE id=$1", [
      sent.json.generationId,
    ]);
    if (row && !["queued", "generating"].includes(row.state)) break;
    await sleep(500);
  }
  const [hold] = await sql(
    `SELECT h.amount_micros::bigint AS hold,
       coalesce((SELECT sum(u.cost_micros) FROM creator.ai_usage u WHERE u.creator_hold_id=h.id),0)::bigint AS spent,
       (SELECT count(*) FROM creator.ai_usage u WHERE u.creator_hold_id=h.id)::int AS calls,
       (SELECT count(*) FROM creator.ai_usage u WHERE u.creator_hold_id=h.id AND u.cost_micros IS NULL)::int AS unknown
     FROM creator.ai_generation_attempt a JOIN creator.ai_cost_hold h ON h.id=a.creator_hold_id
     WHERE a.generation_id=$1`,
    [sent.json?.generationId],
  );
  worst = Math.max(worst, hold ? Number(hold.spent) / Number(hold.hold) : 0);
  step(
    `reply ${i + 1} (${text.length} characters): admitted under the $${cap / 1e6} cap, delivered, and cost no more than its hold`,
    sent.status === 200 &&
      row?.state === "delivered" &&
      hold &&
      hold.unknown === 0 &&
      BigInt(hold.spent) <= BigInt(hold.hold) &&
      BigInt(hold.hold) <= BigInt(cap),
    hold
      ? `${row?.state}; hold ${hold.hold}, spent ${hold.spent} over ${hold.calls} calls`
      : `send ${sent.status} ${sent.json?.error?.code ?? ""}, ${row?.state ?? "no generation"}, no hold`,
  );
}
process.stdout.write(
  `  largest spend as a share of its hold: ${(worst * 100).toFixed(2)}%\n`,
);
const [budget] = await sql(
  "SELECT coalesce(sum(cost_micros),0)::bigint AS spent FROM creator.ai_usage WHERE creator_id=$1 AND category IN('reply','guardrail','memory','provider_unknown')",
  [MAYA_CREATOR_ID],
);
step(
  "today's spend stays inside the cap",
  BigInt(budget.spent) <= BigInt(cap),
  `spent ${budget.spent} of ${cap}`,
);
await closeDb();
finish();
