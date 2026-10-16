// E3A.5: exactly one answer when the worker dies. The generation worker runs
// inside lane 3's backend process; this kills that process (SIGKILL, by its
// recorded pid and only if it listens on lane 3's API port) at one point of an
// answer, restarts the stack, and checks the state behind the screen: one AI
// message for the fan's message, its sentences contiguous with no duplicate, an
// honest terminal state, and the same idempotency key returning the same message.
//   node tests/scenarios/lane-3/e3a5-restart.mjs --at admitted|guard|sentence [--after-lapse] [--stack "--provider anthropic ..."]
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
const at = flag("--at", "admitted");
const stackOptions = flag(
  "--stack",
  "--provider anthropic --env W2_SMALL_MODEL=claude-sonnet-5-5",
).split(" ");
const stats = async () =>
  (await call(MODEL, "GET", "/__stats")).json?.counts ?? {};
step(
  "Maya's AI is live",
  true,
  await ensureMaya(Number(flag("--cap", "20000000"))),
);
// Slow model edge so each kill point is reachable: 1.5 s per call and per streamed chunk.
await call(MODEL, "POST", "/__control", {
  body: { mode: "ok", delayMs: 1500 },
});
const fan = await openFan(ACTORS.fanOne, "lane3fan1");
const body = {
  idempotencyKey: key("e3a5"),
  text: `Restart at ${at}: why does my glaze crawl?`,
  clientSequence: Date.now() % 1e6,
};
const before = await stats();
const sent = await call(API, "POST", `${fan.thread}/messages`, {
  token: fan.token,
  body,
});
const g = sent.json?.generationId;
step(
  "message acknowledged",
  sent.status === 200 && Boolean(g),
  `status ${sent.status}`,
);

const reached = {
  admitted: async () =>
    (
      await sql(
        "SELECT count(*)::int AS n FROM creator.ai_generation_attempt WHERE generation_id=$1",
        [g],
      )
    )[0].n > 0,
  guard: async () =>
    ((await stats()).output_verdict ?? 0) > (before.output_verdict ?? 0),
  sentence: async () =>
    (
      await sql(
        "SELECT count(*)::int AS n FROM creator.event WHERE type='sentence' AND payload->>'generationId'=$1",
        [g],
      )
    )[0].n > 0,
}[at];
let hit = false;
for (let w = 0; w < 1200 && !hit; w++) {
  hit = await reached();
  if (!hit) await sleep(25);
}
const pids = JSON.parse(
  readFileSync(join(tmpdir(), "qelvora-stack", "lane3", "pids.json"), "utf8"),
);
const listening = execFileSync("lsof", [
  "-nP",
  "-t",
  "-iTCP:56431",
  "-sTCP:LISTEN",
])
  .toString()
  .trim()
  .split("\n")
  .map(Number);
const pid = pids.backend?.pid;
if (
  !step(
    `kill point "${at}" reached and the backend is lane 3's`,
    hit && listening.includes(pid),
    `pid ${pid}`,
  )
)
  finish();
process.kill(pid, "SIGKILL");
const [mid] = await sql(
  "SELECT g.state, g.last_sequence AS seq FROM creator.generation g WHERE g.id=$1",
  [g],
);
step(
  "backend killed mid-answer",
  true,
  `generation ${mid.state}, ${mid.seq} sentence(s) stored`,
);
await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 300 } });
execFileSync(
  process.execPath,
  [
    "infra/local/stack.mjs",
    "up",
    "--lane",
    "3",
    "--no-web",
    "--no-ai",
    "--no-smoke",
    ...stackOptions,
  ],
  { stdio: "ignore", cwd: new URL("../../..", import.meta.url).pathname },
);
step(
  "stack restarted",
  (await call(API, "GET", "/health/live")).status === 200,
);

let state;
// Recovery finishes an orphaned answer after its 60 s lease; allow four minutes.
for (let w = 0; w < 240; w++) {
  [state] = await sql(
    "SELECT g.state, g.last_sequence AS seq, m.delivery_state AS delivery, m.text FROM creator.generation g JOIN creator.message m ON m.id=g.ai_message_id WHERE g.id=$1",
    [g],
  );
  if (
    !["queued", "generating"].includes(state.state) &&
    state.delivery !== "generating"
  )
    break;
  await sleep(1000);
}
const terminal = !["queued", "generating"].includes(state.state);
if (!terminal)
  // The worker's own pass reports: operational codes only, no content.
  process.stdout.write(
    execFileSync(
      process.execPath,
      ["infra/local/stack.mjs", "logs", "backend", "--lane", "3", "-n", "400"],
      { cwd: new URL("../../..", import.meta.url).pathname },
    )
      .toString()
      .split("\n")
      .filter((line) => line.includes("generation_pass"))
      .slice(-4)
      .map((line) => `  ${line}\n`)
      .join(""),
  );
step(
  "the answer reached a terminal state after restart",
  !["queued", "generating"].includes(state.state),
  `${state.state}/${state.delivery}, ${state.seq} sentence(s)`,
);
const ai = await sql(
  "SELECT count(*)::int AS n FROM creator.generation WHERE fan_message_id=(SELECT fan_message_id FROM creator.generation WHERE id=$1)",
  [g],
);
step(
  "exactly one answer for the fan's message",
  ai[0].n === 1,
  `${ai[0].n} generation(s)`,
);
const events = await sql(
  "SELECT (payload->>'sequence')::int AS seq, payload->>'text' AS text FROM creator.event WHERE type='sentence' AND payload->>'generationId'=$1 ORDER BY cursor",
  [g],
);
const seqs = events.map((e) => e.seq);
step(
  "sentences contiguous, no duplicate",
  seqs.every((s, i) => s === i + 1) && seqs.length === state.seq,
  `sequences [${seqs.join(",")}]`,
);
step(
  "stored text is exactly the delivered sentences",
  events.map((e) => e.text).join("") === state.text,
  `${state.text.length} characters`,
);
const again = await call(API, "POST", `${fan.thread}/messages`, {
  token: fan.token,
  body,
});
step(
  "the same key returns the same message, no second answer",
  again.status === 200 &&
    again.json?.message?.id === sent.json.message.id &&
    again.json?.generationId === g,
  `status ${again.status}`,
);
const left = await sql(
  "SELECT count(*)::int AS n FROM creator.ai_usage WHERE cost_micros IS NULL",
);
step(
  "no uncertain provider cost left behind",
  left[0].n === 0,
  `${left[0].n} row(s)`,
);
if (process.argv.includes("--after-lapse")) {
  // A6: once the crashed attempt's 5 minute hold has passed (fake clock, lane
  // 3's own database), the creator's next reply is admitted, not locked.
  await sql(
    "UPDATE creator.ai_cost_hold SET expires_at=clock_timestamp()-interval '1 second' WHERE state='held'",
  );
  const next = await call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: {
      idempotencyKey: key("e3a5-next"),
      text: "After the crash: why does my glaze crawl?",
      clientSequence: Date.now() % 1e6,
    },
  });
  let row;
  for (let w = 0; w < 120; w++) {
    [row] = await sql(
      "SELECT g.state FROM creator.generation g WHERE g.id=$1",
      [next.json?.generationId],
    );
    if (row && !["queued", "generating"].includes(row.state)) break;
    await sleep(1000);
  }
  const [estimate] = await sql(
    "SELECT count(*)::int AS n FROM creator.ai_usage WHERE purpose='interrupted_hold_estimate'",
  );
  step(
    "after the crashed attempt's hold lapses, the next reply is delivered and its cost is estimated",
    next.status === 200 && row?.state === "delivered" && estimate.n === 1,
    `send ${next.status}, ${row?.state}, ${estimate.n} estimate(s)`,
  );
}
await closeDb();
finish();
