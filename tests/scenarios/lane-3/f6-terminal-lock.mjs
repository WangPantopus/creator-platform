// Lane 3 finding 6: the API's thread reads hold a share lock on the thread row
// that the worker's FOR UPDATE NOWAIT refuses. Opening a generation stage
// retries that refusal; the settlement (the terminal step after the last
// sentence) did not, so a refused completion waited for lease recovery (about
// 60 s) and ended a fully streamed answer "interrupted".
// A real PostgreSQL session here plays a busy reader: it queues behind every
// worker transaction, as the gateway's frame read does after each commit, and
// holds its share lock on the thread row for --short ms (inside the retry
// window) or --long ms (beyond it). The fan's answer is read on the real
// WebSocket and in the database.
// Fakes: development identity, the stack's model fake.
//   node tests/scenarios/lane-3/f6-terminal-lock.mjs [--cases baseline,short,long,takeover]
//     [--short 300] [--long 1500] [--repeat 3] [--delay 300]
import { spawnSync } from "node:child_process";
import {
  API,
  MODEL,
  ACTORS,
  MAYA_CREATOR_ID,
  call,
  closeDb,
  connect,
  ensureMaya,
  flag,
  key,
  openFan,
  reporter,
  signIn,
  sleep,
  sql,
  watchFrames,
} from "./lib.mjs";

const { step, finish } = reporter();
const cases = flag("--cases", "baseline,short,long,takeover").split(",");
const shortMs = Number(flag("--short", "300"));
const longMs = Number(flag("--long", "1500"));
const repeat = Number(flag("--repeat", "3"));
await call(MODEL, "POST", "/__control", {
  body: { mode: "ok", delayMs: Number(flag("--delay", "300")) },
});
step(
  "Maya's AI is live",
  true,
  await ensureMaya(Number(flag("--cap", "20000000"))),
);
const maya = (await signIn(API, ACTORS.maya, "/studio/ai")).token;
const fan = await openFan(ACTORS.fanOne, "lane3fan1");
fan.watch = watchFrames(fan.token, fan.fan.id);
await fan.watch.ready;
const [{ id: threadId }] = await sql(
  "SELECT id::text FROM creator.thread WHERE creator_id=$1 AND fan_id=$2",
  [MAYA_CREATOR_ID, fan.fan.id],
);

/** Queue behind each new worker transaction, then hold the thread row's share
 * lock for `holdMs`. A transaction with an id holds or will take row locks. */
function busyReader(holdMs) {
  let stopped = false;
  let holds = 0;
  const seen = new Set();
  const done = (async () => {
    const reader = await connect();
    try {
      while (!stopped) {
        const fresh = (
          await sql(
            "SELECT backend_xid::text AS xid FROM pg_stat_activity WHERE usename='creator_generation_worker' AND backend_xid IS NOT NULL",
          )
        ).find((row) => !seen.has(row.xid));
        if (!fresh) {
          await sleep(5);
          continue;
        }
        seen.add(fresh.xid);
        try {
          await reader.query("BEGIN");
          await reader.query("SET LOCAL lock_timeout = '10s'");
          await reader.query(
            "SELECT 1 FROM creator.thread WHERE id=$1 FOR SHARE",
            [threadId],
          );
          holds++;
          await sleep(holdMs);
          await reader.query("COMMIT");
        } catch {
          await reader.query("ROLLBACK").catch(() => {});
        }
      }
    } finally {
      await reader.end();
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      await done;
      return holds;
    },
  };
}

/** Database log lines since `since` where a worker statement was refused the
 * thread row, by the statement that was refused. */
function refusals(since) {
  // PostgreSQL logs to the container's stderr.
  const { stdout, stderr } = spawnSync(
    "docker",
    ["logs", "--since", since, "qelvora-lane3-postgres"],
    { encoding: "utf8", maxBuffer: 1 << 26 },
  );
  const log = stdout + stderr;
  const lines = log.split("\n");
  const counts = { terminal: 0, stage: 0 };
  lines.forEach((line, at) => {
    if (!line.includes('could not obtain lock on row in relation "thread"'))
      return;
    // The context runs to the refused statement's own STATEMENT line.
    const end = lines.findIndex((l, i) => i > at && l.includes("STATEMENT:"));
    const context = lines.slice(at + 1, end < 0 ? at + 8 : end + 1).join(" ");
    if (context.includes("generation_terminal")) counts.terminal++;
    else counts.stage++;
  });
  return counts;
}

let sequence = 0;
async function ask(text) {
  const started = performance.now();
  const sent = await call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: { idempotencyKey: key("f6"), text, clientSequence: ++sequence },
  });
  if (sent.status !== 200)
    return { error: `send ${sent.status} ${sent.json?.error?.code ?? ""}` };
  const generationId = sent.json.generationId;
  const end = await fan.watch.until(
    (f) =>
      f.generationId === generationId &&
      ["delivered", "interrupted"].includes(f.kind),
    120_000,
  );
  const [row] = await sql(
    "SELECT g.state, m.delivery_state, (SELECT count(*)::int FROM creator.generation x WHERE x.fan_message_id=g.fan_message_id) AS answers FROM creator.generation g JOIN creator.message m ON m.id=g.ai_message_id WHERE g.id=$1",
    [generationId],
  );
  const sentences = fan.watch.frames.filter(
    (f) => f.generationId === generationId && f.kind === "sentence",
  ).length;
  return {
    generationId,
    end: end?.kind ?? "none",
    ms: end ? Math.round(end.at - started) : null,
    state: row?.state,
    delivery: row?.delivery_state,
    answers: row?.answers,
    sentences,
  };
}

const describe = (r) =>
  r.error ??
  `${r.end} after ${r.ms} ms, generation ${r.state}, message ${r.delivery}, ${r.sentences} sentences`;

if (cases.includes("baseline")) {
  const r = await ask("Baseline: how thick should a glaze coat be?");
  step(
    "no contention: the answer is delivered",
    r.end === "delivered" && r.state === "delivered",
    describe(r),
  );
}

if (cases.includes("short")) {
  // Inside the retry window: every refusal is retried, the answer is delivered
  // in about the same time and once.
  const since = new Date().toISOString();
  const reader = busyReader(shortMs);
  const results = [];
  for (let i = 0; i < repeat; i++)
    results.push(
      await ask(`Short hold ${i + 1}: how do I stop a glaze crawling?`),
    );
  const holds = await reader.stop();
  const refused = refusals(since);
  for (const [i, r] of results.entries())
    step(
      `a ${shortMs} ms reader on every worker transaction: answer ${i + 1} is delivered once`,
      r.end === "delivered" &&
        r.state === "delivered" &&
        r.answers === 1 &&
        r.ms < 30_000,
      describe(r),
    );
  step(
    "the settlement was refused the thread row and retried",
    refused.terminal > 0,
    `${refused.terminal} settlement and ${refused.stage} stage refusals, ${holds} reader holds`,
  );
}

if (cases.includes("long")) {
  // Beyond the retry window: the retries are bounded, nothing waits on the lock,
  // and the unfinished answer is ended by lease recovery as before (failed when
  // no sentence was written, interrupted after one).
  const since = new Date().toISOString();
  const reader = busyReader(longMs);
  const r = await ask("Long hold: what cone should I fire stoneware to?");
  const holds = await reader.stop();
  const refused = refusals(since);
  step(
    `a ${longMs} ms reader on every worker transaction: the answer ends once, by lease recovery`,
    r.end === "interrupted" &&
      ["failed", "interrupted"].includes(r.state) &&
      r.answers === 1 &&
      r.ms < 90_000,
    `${describe(r)}; ${refused.terminal} settlement and ${refused.stage} stage refusals, ${holds} reader holds`,
  );
  const after = await ask("After the long hold: what is a good first glaze?");
  step(
    "after the reader stops, the next answer is delivered",
    after.end === "delivered" && after.state === "delivered",
    describe(after),
  );
}

if (cases.includes("takeover")) {
  // Wrong state: Maya takes over while the settlement is being retried. The
  // retried settlement sees the current thread, never delivers past it.
  const reader = busyReader(shortMs);
  const startedAt = performance.now();
  const asked = ask("Takeover: should I wax the foot ring?");
  const first = await fan.watch.until(
    (f) => f.kind === "sentence" && f.authorKind === "ai" && f.at >= startedAt,
    60_000,
  );
  const took = await call(API, "POST", `${fan.thread}/takeover`, {
    token: maya,
    body: { idempotencyKey: key("takeover") },
  });
  const r = await asked;
  await reader.stop();
  step(
    "a takeover during a contended answer ends it interrupted, not delivered",
    took.status === 200 &&
      first !== null &&
      r.end === "interrupted" &&
      r.state === "interrupted",
    `takeover ${took.status}; ${describe(r)}`,
  );
  const back = await call(API, "POST", `${fan.thread}/handback`, {
    token: maya,
    body: { idempotencyKey: key("handback") },
  });
  const next = await ask("After handback: is a bisque firing needed?");
  step(
    "after handback the next answer is delivered",
    back.status === 200 && next.end === "delivered",
    `handback ${back.status}; ${describe(next)}`,
  );
}

fan.watch.close();
await closeDb();
finish();
