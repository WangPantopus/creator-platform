// A1 measurement harness (E3A.1, and the E3A.2 transcript): fans send messages
// to Maya's AI through the real API; each answer is timed from the fan's send to
// the acknowledgment, the first AI sentence frame and the delivered frame on the
// real WebSocket; the database's own statistics count the statements per answer.
// No product behavior is changed. Fakes: development identity, model fake.
//   node tests/scenarios/lane-3/a1-measure.mjs [--messages 20] [--fans 1] [--delay 300]
//     [--chars N] [--cap 20000000] [--out run.json] [--compare before.json] [--detail]
import { writeFileSync, readFileSync } from "node:fs";
import { loadavg } from "node:os";
import {
  API,
  MODEL,
  ACTORS,
  DB_NAME,
  call,
  closeDb,
  ensureMaya,
  flag,
  key,
  openFan,
  percentile,
  reporter,
  sleep,
  sql,
  stats,
  watchFrames,
} from "./lib.mjs";

const messages = Number(flag("--messages", "20"));
const fanCount = Number(flag("--fans", "1"));
const delayMs = Number(flag("--delay", "300"));
const chars = Number(flag("--chars", "0"));
const { step, finish } = reporter();
const FANS = [
  ACTORS.fanOne,
  ACTORS.fanTwo,
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
];
const GENERIC = new Set([
  "creator_generation_worker",
  "creator_generation_authority",
  "creator_owner",
  "creator_runtime",
]);

const classify = (query) => {
  if (/^\s*BEGIN/iu.test(query)) return "transaction begin";
  if (/^\s*(COMMIT|ROLLBACK|SAVEPOINT|RELEASE)/iu.test(query))
    return "transaction control";
  if (query.includes("consumer_proofs AS")) return "W1 catalogue";
  if (query.includes("generation_scope_matches($1,$2) AS allowed"))
    return "W1 scope match";
  if (
    /pg_proc|pg_roles|pg_class|pg_namespace|has_function_privilege|has_table_privilege|pg_get_functiondef|aclexplode|pg_trigger|schema_migration/u.test(
      query,
    )
  ) {
    const owner = [...query.matchAll(/'(creator_[a-z0-9_]+)'/gu)]
      .map((m) => m[1])
      .find((r) => !GENERIC.has(r));
    return `consumer catalogue${owner ? ` (${owner})` : ""}`;
  }
  return "business";
};
async function resetStats() {
  await stats("SELECT pg_stat_statements_reset()");
  await sql("SELECT pg_stat_reset()");
}
async function readStats() {
  const rows = await stats(
    `SELECT r.rolname AS role, s.query, s.calls::int AS calls, s.total_exec_time AS ms FROM pg_stat_statements s
     JOIN pg_roles r ON r.oid=s.userid JOIN pg_database d ON d.oid=s.dbid WHERE d.datname=$1`,
    [DB_NAME],
  );
  const fns = await sql(
    "SELECT funcname, calls::int AS calls FROM pg_stat_user_functions WHERE funcname IN ('generation_scope_matches','generation_task_proof')",
  );
  const out = {
    worker: {},
    top: {},
    api: 0,
    apiMs: 0,
    functions: Object.fromEntries(fns.map((f) => [f.funcname, f.calls])),
  };
  for (const row of rows) {
    if (row.role === "creator_generation_worker") {
      const text = row.query.replace(/\s+/gu, " ").slice(0, 90);
      out.top[text] = (out.top[text] ?? 0) + row.calls;
      const c = (out.worker[classify(row.query)] ??= { calls: 0, ms: 0 });
      c.calls += row.calls;
      c.ms += row.ms;
    } else if (row.role === "creator_runtime") {
      out.api += row.calls;
      out.apiMs += row.ms;
    }
  }
  return out;
}
const sum = (worker, match) =>
  Object.entries(worker)
    .filter(([k]) => match(k))
    .reduce((n, [, v]) => n + v.calls, 0);

if (
  !step(
    "backend is live",
    (await call(API, "GET", "/health/live").catch(() => ({}))).status === 200,
  )
)
  finish();
const control = await call(MODEL, "POST", "/__control", {
  body: { mode: "ok", delayMs },
});
step(
  "model fake set to a realistic delay",
  control.status === 200,
  `${delayMs} ms per call and per streamed chunk`,
);
step(
  "Maya's AI is live",
  true,
  await ensureMaya(Number(flag("--cap", "20000000"))),
);
try {
  await stats("SELECT 1 FROM pg_stat_statements LIMIT 1");
} catch {
  step(
    "statement statistics available",
    false,
    "enable pg_stat_statements on your own stack database (see the lane 3 status file)",
  );
  finish();
}

await resetStats();
await sleep(10_000);
const idle = await readStats();
const idleRate =
  Object.values(idle.worker).reduce((n, v) => n + v.calls, 0) / 10;
step(
  "idle worker measured",
  true,
  `${idleRate.toFixed(0)} worker statements per second, ${(Object.values(idle.worker).reduce((n, v) => n + v.ms, 0) / 10).toFixed(0)} ms of database time per second`,
);

const fans = [];
for (let i = 0; i < fanCount; i++) {
  const fan = await openFan(FANS[i], `lane3fan${i + 1}`);
  fan.start = Math.max(
    0,
    ...(
      (await call(API, "GET", fan.thread, { token: fan.token })).json
        ?.messages ?? []
    ).map((m) => m.sequence),
  );
  fan.watch = watchFrames(fan.token, fan.fan.id);
  await fan.watch.ready;
  fans.push(fan);
}
step(
  "fans signed in and subscribed",
  fans.length === fanCount,
  `${fanCount} fan(s)`,
);

let maxXactMs = 0;
const sampler = setInterval(async () => {
  try {
    const [row] = await sql(
      "SELECT coalesce(max(extract(epoch FROM clock_timestamp()-xact_start)*1000),0)::int AS ms FROM pg_stat_activity WHERE usename='creator_generation_worker' AND xact_start IS NOT NULL",
    );
    maxXactMs = Math.max(maxXactMs, row.ms);
  } catch {
    // A missed sample only lowers the observed maximum; the answer is unaffected.
  }
}, 100);

const answers = [];
const rounds = [];
for (let i = 0; i < messages; i++) {
  await resetStats();
  maxXactMs = 0;
  const short = `Question ${i + 1}: how should I glaze a test tile so it does not crawl?`;
  // --chars N pads the question to exactly N characters (the reply path accepts at most 2,000).
  const text = chars ? short.padEnd(chars, ".") : short;
  const results = await Promise.all(
    fans.map(async (fan) => {
      const started = performance.now();
      const sent = await call(API, "POST", `${fan.thread}/messages`, {
        token: fan.token,
        body: { idempotencyKey: key("a1"), text, clientSequence: i + 1 },
      });
      const ack = performance.now() - started;
      if (sent.status !== 200)
        return {
          ack,
          error: `send ${sent.status} ${sent.json?.error?.code ?? ""}`,
        };
      const g = sent.json.generationId;
      const ends = ["delivered", "interrupted"];
      const first = await fan.watch.until(
        (f) =>
          f.generationId === g &&
          f.authorKind === "ai" &&
          (f.kind === "sentence" || ends.includes(f.kind)),
        120_000,
      );
      const end = await fan.watch.until(
        (f) => f.generationId === g && ends.includes(f.kind),
        120_000,
      );
      return {
        ack,
        first: first?.kind === "sentence" ? first.at - started : null,
        done: end ? end.at - started : null,
        end: end?.kind ?? "none",
      };
    }),
  );
  const counted = await readStats();
  rounds.push({ ...counted, maxXactMs });
  answers.push(...results);
  step(
    `message ${i + 1}`,
    results.every((x) => x.end === "delivered"),
    results
      .map(
        (x) =>
          x.error ??
          `ack ${x.ack.toFixed(0)} ms, first ${x.first?.toFixed(0) ?? "-"} ms, ${x.end} ${x.done?.toFixed(0) ?? "-"} ms`,
      )
      .join("; ") +
      `; worker ${Object.values(counted.worker).reduce((n, v) => n + v.calls, 0)} statements, longest worker transaction ${maxXactMs} ms`,
  );
}
clearInterval(sampler);

const transcript = [];
for (const fan of fans) {
  fan.watch.close();
  const timeline = (await call(API, "GET", fan.thread, { token: fan.token }))
    .json;
  const cited = new Map(
    (
      await sql(
        "SELECT id::text, coalesce(cardinality(citations),0) AS n FROM creator.message WHERE thread_id=$1",
        [timeline.threadId],
      )
    ).map((r) => [r.id, r.n]),
  );
  for (const m of (timeline?.messages ?? [])
    .filter((x) => x.sequence > fan.start)
    .sort((a, b) => a.sequence - b.sequence))
    transcript.push({
      fan: fans.indexOf(fan),
      authorKind: m.authorKind,
      deliveryState: m.deliveryState,
      text: m.text,
      citations: cited.get(m.id) ?? null,
    });
}
const per = (pick) =>
  rounds.map(pick).reduce((a, b) => a + b, 0) / (answers.length || 1);
const ms = (v) => (v == null ? "-" : `${Math.round(v)} ms`);
const summary = {
  when: new Date().toISOString(),
  load: loadavg()[0],
  messages,
  fans: fanCount,
  delayMs,
  chars,
  ack: {
    p50: percentile(
      answers.map((a) => a.ack),
      50,
    ),
    p95: percentile(
      answers.map((a) => a.ack),
      95,
    ),
  },
  first: {
    p50: percentile(
      answers.map((a) => a.first),
      50,
    ),
    p95: percentile(
      answers.map((a) => a.first),
      95,
    ),
  },
  done: {
    p50: percentile(
      answers.map((a) => a.done),
      50,
    ),
    p95: percentile(
      answers.map((a) => a.done),
      95,
    ),
  },
  delivered: answers.filter((a) => a.end === "delivered").length,
  perAnswer: {
    workerStatements: per((r) =>
      Object.values(r.worker).reduce((n, v) => n + v.calls, 0),
    ),
    w1Catalogue: per((r) => sum(r.worker, (k) => k === "W1 catalogue")),
    consumerCatalogue: per((r) =>
      sum(r.worker, (k) => k.startsWith("consumer catalogue")),
    ),
    scopeMatchStatements: per((r) =>
      sum(r.worker, (k) => k === "W1 scope match"),
    ),
    transactions: per((r) => sum(r.worker, (k) => k === "transaction begin")),
    workerDbMs: per((r) =>
      Object.values(r.worker).reduce((n, v) => n + v.ms, 0),
    ),
    scopeMatchesInSql: per((r) => r.functions.generation_scope_matches ?? 0),
    leaseProofsInSql: per((r) => r.functions.generation_task_proof ?? 0),
    apiStatements: per((r) => r.api),
    longestWorkerTransactionMs: Math.max(...rounds.map((r) => r.maxXactMs)),
  },
  idleWorkerStatementsPerSecond: idleRate,
  socketCloses: fans.flatMap((f) => f.watch.closes.map((c) => c.code)),
};
process.stdout.write(
  `\nack p50 ${ms(summary.ack.p50)} p95 ${ms(summary.ack.p95)} | first sentence p50 ${ms(summary.first.p50)} p95 ${ms(summary.first.p95)} | delivered p50 ${ms(summary.done.p50)} p95 ${ms(summary.done.p95)} | ${summary.delivered}/${answers.length} delivered, load ${summary.load.toFixed(1)}, socket closes [${summary.socketCloses.join(",")}]\n`,
);
process.stdout.write(
  `per answer: ${Object.entries(summary.perAnswer)
    .map(([k, v]) => `${k} ${Math.round(v)}`)
    .join(", ")}\n`,
);
if (process.argv.includes("--detail")) {
  for (const field of ["worker", "top"]) {
    const merged = {};
    for (const r of rounds)
      for (const [k, v] of Object.entries(r[field]))
        merged[k] = (merged[k] ?? 0) + (v.calls ?? v);
    for (const [k, v] of Object.entries(merged)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16))
      process.stdout.write(
        `  ${(v / answers.length).toFixed(1).padStart(7)}  ${k}\n`,
      );
  }
}
const out = flag("--out");
if (out) writeFileSync(out, JSON.stringify({ summary, transcript }, null, 2));
const before = flag("--compare");
if (before) {
  const old = JSON.parse(readFileSync(before, "utf8")).transcript;
  const visible = (t) =>
    JSON.stringify(
      t.map(({ fan, authorKind, deliveryState, text, citations }) => [
        fan,
        authorKind,
        deliveryState,
        text,
        citations,
      ]),
    );
  step(
    "E3A.2 same visible text, authorship, citations and order as before",
    visible(old) === visible(transcript),
    `${transcript.length} messages compared`,
  );
}
step(
  "every answer delivered",
  summary.delivered === answers.length,
  `${summary.delivered}/${answers.length}`,
);
await closeDb();
finish();
