// E3A.3: the generation worker wakes when a fan message is accepted instead of
// finding it on its next 1 s poll. Fans send through the real API and watch the
// real WebSocket; SQL reads the state behind the screen (when the worker claimed
// each answer, how many answers each message got). Fakes: the development
// identity and the stack's model fake, at the outer edge.
//   node tests/scenarios/lane-3/e3a3-wake.mjs [--cases latency,idle,listener,shutdown,restart,two,burst]
//     [--messages 8] [--burst 30] [--delay 300]
// "restart" kills lane 3's own backend (by its recorded pid, only if it listens on
// lane 3's API port) and restarts the stack; "two" starts a second backend on
// port 56437 with the stack's own settings file and stops it afterwards.
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { closeSync, openSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ACTORS,
  API,
  DB_NAME,
  MODEL,
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

const { step, finish } = reporter();
const cases = flag(
  "--cases",
  "latency,idle,listener,shutdown,restart,two,burst",
).split(",");
const messages = Number(flag("--messages", "8"));
const burst = Number(flag("--burst", "30"));
const delayMs = Number(flag("--delay", "300"));
const root = new URL("../../..", import.meta.url).pathname;
const stackDir = join(tmpdir(), "qelvora-stack", "lane3");
const SECOND_PORT = 56437;
const FANS = [
  ACTORS.fanOne,
  ACTORS.fanTwo,
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
];
const ENDS = ["delivered", "interrupted"];

const setModel = (body) => call(MODEL, "POST", "/__control", { body });
await setModel({ mode: "ok", delayMs });
step(
  "Maya's AI is live",
  true,
  await ensureMaya(Number(flag("--cap", "20000000"))),
);

const opened = new Map();
async function fan(i) {
  if (opened.has(i)) return opened.get(i);
  const f = await openFan(FANS[i], `lane3fan${i + 1}`);
  f.watch = watchFrames(f.token, f.fan.id);
  await f.watch.ready;
  f.sent = 1000 + Math.floor(Math.random() * 1e6);
  opened.set(i, f);
  return f;
}

/** When the worker claimed this answer: the claim sets lease_until to its own
 * clock plus 60 s, so the first lease seen gives the claim time exactly. */
async function claimedAfter(generationId, ms = 120_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const [row] = await sql(
      "SELECT state, round(extract(epoch FROM (lease_until - interval '60 seconds' - accepted_at))*1000)::int AS ms FROM creator.generation WHERE id=$1",
      [generationId],
    );
    if (row?.ms != null) return row.ms;
    if (row && !["queued", "generating"].includes(row.state)) return null;
    await sleep(20);
  }
  return null;
}

async function send(f, text, api = API) {
  const started = performance.now();
  const sent = await call(api, "POST", `${f.thread}/messages`, {
    token: f.token,
    body: { idempotencyKey: key("e3a3"), text, clientSequence: ++f.sent },
  });
  return { started, sent, ack: performance.now() - started };
}

async function answer(f, sentAt, generationId, ms = 300_000) {
  const first = await f.watch.until(
    (x) =>
      x.generationId === generationId &&
      x.authorKind === "ai" &&
      (x.kind === "sentence" || ENDS.includes(x.kind)),
    ms,
  );
  const end = await f.watch.until(
    (x) => x.generationId === generationId && ENDS.includes(x.kind),
    ms,
  );
  return {
    first: first?.kind === "sentence" ? first.at - sentAt : null,
    done: end ? end.at - sentAt : null,
    end: end?.kind ?? "none",
  };
}

/** Exactly one answer: one delivered generation, one AI message, one
 * "delivered" frame, and AI sentences without a repeated sequence. */
async function oneAnswer(f, generationId) {
  const [g] = await sql(
    "SELECT g.state, (SELECT count(*)::int FROM creator.message m WHERE m.id=g.ai_message_id) AS ai, (SELECT count(*)::int FROM creator.generation x WHERE x.fan_message_id=g.fan_message_id) AS generations FROM creator.generation g WHERE g.id=$1",
    [generationId],
  );
  const frames = f.watch.frames.filter((x) => x.generationId === generationId);
  const delivered = frames.filter((x) => x.kind === "delivered").length;
  const sentences = frames.filter((x) => x.kind === "sentence");
  const unique = new Set(sentences.map((x) => x.sequence)).size;
  return {
    ok:
      g?.state === "delivered" &&
      g.ai === 1 &&
      g.generations === 1 &&
      delivered === 1 &&
      unique === sentences.length,
    detail: `${g?.state}, ${g?.generations} generation(s), ${delivered} delivered frame(s), ${sentences.length} sentence frame(s)`,
  };
}

const workerStats = async () =>
  (
    await stats(
      `SELECT coalesce(sum(s.calls),0)::int AS calls, coalesce(sum(s.total_exec_time),0)::float AS ms,
        coalesce(sum(s.calls) FILTER (WHERE s.query = 'SELECT id FROM creator.pending_generation_tasks($1) AS id'),0)::int AS passes
       FROM pg_stat_statements s JOIN pg_roles r ON r.oid=s.userid JOIN pg_database d ON d.oid=s.dbid
       WHERE d.datname=$1 AND r.rolname='creator_generation_worker'`,
      [DB_NAME],
    )
  )[0];
const listeners = async () =>
  (
    await sql(
      "SELECT pid FROM pg_stat_activity WHERE usename='creator_generation_worker' AND query ILIKE 'LISTEN creator_generation_queued%'",
    )
  ).map((r) => r.pid);

if (cases.includes("shutdown")) {
  const require = createRequire(
    new URL("../../../apps/backend/package.json", import.meta.url),
  );
  const { tsImport } = require("tsx/esm/api");
  const { GenerationWake } = await tsImport(
    "../../../apps/backend/src/workers/generation-wake.ts",
    import.meta.url,
  );
  // A slow network edge accepts the PostgreSQL socket but holds its handshake.
  // Closing the actual listener must drain that in-progress connection too.
  const edge = net.createServer();
  edge.listen(0, "127.0.0.1");
  await once(edge, "listening");
  const accepted = once(edge, "connection");
  let woke = 0;
  const wake = new GenerationWake(
    `postgresql://scenario:scenario@127.0.0.1:${edge.address().port}/scenario`,
    () => woke++,
  );
  let socket;
  try {
    wake.start();
    [socket] = await accepted;
    socket.resume();
    const ended = once(socket, "close").then(() => true);
    const started = performance.now();
    await wake.close();
    const drained = await Promise.race([ended, sleep(250).then(() => false)]);
    await wake.close();
    step(
      "shutdown: closing during a PostgreSQL handshake drains the socket",
      drained && woke === 0 && !wake.listening,
      `socket closed ${drained}, wakeups ${woke}, elapsed ${Math.round(performance.now() - started)} ms`,
    );
  } finally {
    socket?.destroy();
    await wake.close();
    await new Promise((resolve) => edge.close(resolve));
  }
}

if (cases.includes("latency")) {
  const f = await fan(0);
  const rows = [];
  for (let i = 0; i < messages; i++) {
    const { started, sent, ack } = await send(
      f,
      `Wake ${i + 1}: how long should a test tile dry before glazing?`,
    );
    if (sent.status !== 200) {
      rows.push({ error: `send ${sent.status} ${sent.json?.error?.code}` });
      continue;
    }
    const g = sent.json.generationId;
    const claim = await claimedAfter(g);
    rows.push({ ack, claim, ...(await answer(f, started, g)) });
  }
  const ok = rows.filter((r) => r.end === "delivered");
  const fmt = (values) =>
    `p50 ${percentile(values, 50)?.toFixed(0)} / p95 ${percentile(values, 95)?.toFixed(0)} ms`;
  step(
    `latency: ${messages} messages from one fan, all delivered`,
    ok.length === messages,
    `accept to claim ${fmt(ok.map((r) => r.claim))} (each: ${ok.map((r) => r.claim).join(", ")}); ack ${fmt(ok.map((r) => r.ack))}; first sentence ${fmt(ok.map((r) => r.first))}; delivered ${fmt(ok.map((r) => r.done))}`,
  );
}

if (cases.includes("idle")) {
  await stats("SELECT pg_stat_statements_reset()");
  await sleep(30_000);
  const s = await workerStats();
  step(
    "idle: worker load over 30 s with no messages",
    true,
    `${(s.calls / 30).toFixed(1)} worker statements a second, ${(s.ms / 30).toFixed(1)} ms of database time a second, ${s.passes} passes`,
  );
}

if (cases.includes("listener")) {
  const before = await listeners();
  if (!before.length)
    step(
      "listener: no wakeup session (code without wakeups)",
      true,
      "not applicable",
    );
  else {
    // The wakeup session is gone at the moment the message is accepted, so its
    // notification is lost; the answer must still come (poll or reconnect wake).
    await sql("SELECT pg_terminate_backend(pid) FROM unnest($1::int[]) pid", [
      before,
    ]);
    const f = await fan(1);
    const { started, sent } = await send(
      f,
      "While nobody listens: what cone is a mid-fire glaze?",
    );
    const g = sent.json?.generationId;
    const claim = g ? await claimedAfter(g) : null;
    const result = g ? await answer(f, started, g) : { end: "none" };
    const after = await listeners();
    const one = g ? await oneAnswer(f, g) : { ok: false, detail: "no send" };
    step(
      "listener: the wakeup session is killed just before a send; the answer still arrives and the session comes back",
      sent.status === 200 &&
        result.end === "delivered" &&
        one.ok &&
        after.length === 1 &&
        !before.includes(after[0]),
      `claimed ${claim} ms after accept; ${result.end}; ${one.detail}; listening sessions before ${before.length}, after ${after.length} (new pid ${after[0] !== before[0]})`,
    );
  }
}

if (cases.includes("restart")) {
  // The worker is serial: while it answers fan 1, fan 2's message waits
  // accepted but unclaimed. The worker then dies (the whole backend, since the
  // development host runs it in-process) and fan 2's answer must arrive after
  // the restart. The kill lands between provider calls, so no cost is left
  // uncertain (lane 3 finding 3 on main) and before fan 1's first sentence
  // (finding 9).
  // Instant provider calls: an answer is then mostly database work between
  // calls, so a moment with no call in flight is easy to catch.
  await setModel({ mode: "ok", delayMs: 0 });
  const f1 = await fan(2);
  const f2 = await fan(3);
  const a = await send(f1, "Busy worker: why do glazes crawl?");
  const g1 = a.sent.json?.generationId;
  await claimedAfter(g1);
  const b = await send(f2, "Queued behind it: do you sell test tiles?");
  const g2 = b.sent.json?.generationId;
  let killed = false;
  for (let w = 0; w < 4000 && !killed; w++) {
    const [s] = await sql(
      "SELECT (SELECT count(*)::int FROM creator.ai_usage WHERE generation_id=$1 AND provider_state='admitted') AS admitted, (SELECT last_sequence FROM creator.generation WHERE id=$1) AS seq, (SELECT state FROM creator.generation WHERE id=$2) AS queued",
      [g1, g2],
    );
    if (s.seq > 0 || s.queued !== "queued") break;
    if (s.admitted === 0) {
      const pids = JSON.parse(
        readFileSync(join(stackDir, "pids.json"), "utf8"),
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
      if (!listening.includes(pids.backend?.pid)) break;
      process.kill(pids.backend.pid, "SIGKILL");
      killed = true;
    } else await sleep(2);
  }
  const [at] = await sql(
    "SELECT (SELECT count(*)::int FROM creator.ai_usage WHERE generation_id=$1 AND provider_state='admitted') AS admitted, (SELECT state FROM creator.generation WHERE id=$2) AS queued, (SELECT lease_until IS NULL FROM creator.generation WHERE id=$2) AS unclaimed",
    [g1, g2],
  );
  const clean = killed && at.admitted === 0 && at.queued === "queued";
  step(
    "restart: the backend dies while fan 2's message is accepted but unclaimed",
    clean && at.unclaimed,
    `killed ${killed}; fan 2's answer ${at.queued}, unclaimed ${at.unclaimed}; fan 1's admitted provider calls at the kill: ${at.admitted}`,
  );
  if (clean) {
    const restarted = performance.now();
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
      ],
      { stdio: "ignore", cwd: root },
    );
    const up = performance.now() - restarted;
    // The fans' sockets reconnect from their cursors.
    const claim = await claimedAfter(g2, 300_000);
    const [g] = await sql(
      "SELECT state, round(extract(epoch FROM (clock_timestamp()-accepted_at)))::int AS age FROM creator.generation WHERE id=$1",
      [g2],
    );
    let state = g?.state;
    for (let w = 0; w < 300 && state !== "delivered"; w++) {
      await sleep(1000);
      [{ state }] = await sql(
        "SELECT state FROM creator.generation WHERE id=$1",
        [g2],
      );
    }
    const one = await oneAnswer(f2, g2);
    step(
      "restart: fan 2's answer arrives after the restart, exactly once",
      state === "delivered" && one.ok,
      `stack back in ${(up / 1000).toFixed(0)} s; claimed ${claim} ms after accept; ${one.detail}`,
    );
    let first;
    for (let w = 0; w < 120; w++) {
      [first] = await sql(
        "SELECT state, failure_code FROM creator.generation WHERE id=$1",
        [g1],
      );
      if (!["queued", "generating"].includes(first.state)) break;
      await sleep(1000);
    }
    step(
      "restart: fan 1's interrupted answer ends (recovery after its lease)",
      !["queued", "generating"].includes(first.state),
      `${first.state} ${first.failure_code ?? ""}`,
    );
  }
  await setModel({ mode: "ok", delayMs });
}

if (cases.includes("two")) {
  // A second backend process on the same database: two workers, two wakeup
  // sessions. It reads the stack's own settings file; nothing here opens it.
  const log = openSync(join(stackDir, "backend-second.log"), "a", 0o600);
  const second = spawn(
    process.execPath,
    [
      `--env-file=${join(stackDir, "backend.env")}`,
      "--import",
      join(root, "infra/local/fake-edge/preload.mjs"),
      "--import",
      "tsx",
      "src/server.ts",
    ],
    {
      cwd: join(root, "apps/backend"),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        LANG: process.env.LANG ?? "en_US.UTF-8",
        PORT: String(SECOND_PORT),
      },
      stdio: ["ignore", log, log],
    },
  );
  closeSync(log);
  const SECOND = `http://127.0.0.1:${SECOND_PORT}`;
  let live = false;
  for (let w = 0; w < 120 && !live; w++) {
    live =
      (await call(SECOND, "GET", "/health/live").catch(() => ({}))).status ===
      200;
    if (!live) await sleep(1000);
  }
  step(
    "two: a second backend with its own worker is up",
    live,
    `pid ${second.pid}, ${(await listeners()).length} wakeup sessions`,
  );
  const fans = await Promise.all([0, 1, 2, 3, 4].map(fan));
  const rounds = 2;
  const results = [];
  for (let r = 0; r < rounds; r++) {
    results.push(
      ...(await Promise.all(
        fans.map(async (f, i) => {
          const { started, sent } = await send(
            f,
            `Two workers ${r + 1}.${i + 1}: what is a cone pack?`,
            i % 2 ? SECOND : API,
          );
          const g = sent.json?.generationId;
          if (!g) return { ok: false, detail: `send ${sent.status}` };
          const result = await answer(f, started, g);
          return { ...(await oneAnswer(f, g)), end: result.end };
        }),
      )),
    );
  }
  const passes = readFileSync(join(stackDir, "backend-second.log"), "utf8")
    .split("\n")
    .filter((l) => l.startsWith('{"event":"generation_pass"'))
    .map((l) => JSON.parse(l));
  const secondCompleted = passes.reduce((n, p) => n + p.completed, 0);
  const secondFailures = passes.flatMap((p) => p.failures);
  step(
    `two: ${results.length} messages from 5 fans through both APIs, each answered exactly once`,
    results.every((x) => x.ok),
    `${results.filter((x) => x.ok).length}/${results.length} one answer; second worker completed ${secondCompleted}; its failure codes: ${secondFailures.join(", ") || "none"}`,
  );
  second.kill("SIGTERM");
  for (let w = 0; w < 30 && second.exitCode === null; w++) await sleep(1000);
  if (second.exitCode === null) second.kill("SIGKILL");
  step(
    "two: the second backend stopped",
    second.exitCode !== null || second.signalCode !== null,
    `exit ${second.exitCode ?? second.signalCode}`,
  );
}

if (cases.includes("burst")) {
  // Each fan sends its next message the moment its previous answer is
  // delivered, so the queue never empties while the burst lasts.
  const fans = await Promise.all([0, 1, 2, 3, 4].map(fan));
  const per = Math.ceil(burst / fans.length);
  const started = performance.now();
  const results = (
    await Promise.all(
      fans.map(async (f, i) => {
        const out = [];
        for (let m = 0; m < per && i + m * fans.length < burst; m++) {
          const s = await send(f, `Burst ${m + 1}.${i + 1}: why pinholes?`);
          const g = s.sent.json?.generationId;
          if (!g) {
            out.push({ ok: false, detail: `send ${s.sent.status}` });
            continue;
          }
          const claim = await claimedAfter(g, 900_000);
          await answer(f, s.started, g, 900_000);
          out.push({ ...(await oneAnswer(f, g)), claim });
        }
        return out;
      }),
    )
  ).flat();
  const claims = results.map((x) => x.claim).filter((x) => x != null);
  step(
    `burst: ${results.length} messages, each answered exactly once`,
    results.length === burst && results.every((x) => x.ok),
    `${results.filter((x) => x.ok).length}/${results.length} in ${((performance.now() - started) / 1000).toFixed(0)} s; accept to claim p50 ${percentile(claims, 50)?.toFixed(0)} / max ${Math.max(...claims)} ms (queue wait behind one serial worker)`,
  );
}

for (const f of opened.values()) f.watch.close();
await closeDb();
finish();
