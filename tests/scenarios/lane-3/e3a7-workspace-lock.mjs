// E3A.7 (lock collision on one workspace, lane 3 finding 15): answers for one
// creator must not fail because something else holds the creator's AI
// workspace row for a moment. Fans send through the real API and watch the real
// WebSocket; SQL reads each answer's state, and lane 3's own database container
// log counts the row-lock refusals. Fakes: the development identity and the
// model fake.
//   node tests/scenarios/lane-3/e3a7-workspace-lock.mjs [--cases studio,two]
// "studio": Maya's Studio reads her AI state every 150 ms while three fans ask
//   three questions each (every Studio read locks the workspace row).
// "two": a second backend on port 56437 with the stack's own settings file (so a
//   second generation worker), five fans, two rounds through both APIs.
import { spawn, spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  signIn,
  sleep,
  sql,
  watchFrames,
} from "./lib.mjs";

const { step, finish } = reporter();
const cases = flag("--cases", "studio,two").split(",");
const root = new URL("../../..", import.meta.url).pathname;
const stackDir = join(tmpdir(), "qelvora-stack", "lane3");
const SECOND = "http://127.0.0.1:56437";
const FANS = [
  ACTORS.fanOne,
  ACTORS.fanTwo,
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005",
  "10000000-0000-4000-8000-000000000006",
];
const ENDS = ["delivered", "interrupted"];

await call(MODEL, "POST", "/__control", {
  body: { mode: "ok", delayMs: 300 },
});
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
  opened.set(i, f);
  return f;
}
/** One message, its answer, and what the database says about it. */
async function ask(f, text, api = API) {
  const started = performance.now();
  const sent = await call(api, "POST", `${f.thread}/messages`, {
    token: f.token,
    body: {
      idempotencyKey: key("e3a7"),
      text,
      clientSequence: Date.now() % 1e6,
    },
  });
  const g = sent.json?.generationId;
  if (!g) return { ok: false, detail: `send ${sent.status}` };
  await f.watch.until(
    (x) => x.at >= started && x.generationId === g && ENDS.includes(x.kind),
    240_000,
  );
  for (let w = 0; w < 120; w++) {
    const [row] = await sql(
      "SELECT state FROM creator.generation WHERE id=$1",
      [g],
    );
    if (!["queued", "generating"].includes(row?.state)) break;
    await sleep(1000);
  }
  const [r] = await sql(
    "SELECT g.state, (SELECT count(*)::int FROM creator.generation x WHERE x.fan_message_id=g.fan_message_id) AS answers FROM creator.generation g WHERE g.id=$1",
    [g],
  );
  return {
    ok: r?.state === "delivered" && r.answers === 1,
    detail: `${r?.state}/${r?.answers}`,
  };
}
/** Row-lock refusals on the workspace row in lane 3's own database log. */
const workspaceRefusals = (since) => {
  // PostgreSQL logs to stderr, which `docker logs` passes through as stderr.
  const out = spawnSync(
    "docker",
    ["logs", "--since", since, "qelvora-lane3-postgres"],
    { encoding: "utf8" },
  );
  return `${out.stdout}${out.stderr}`
    .split("\n")
    .filter((l) =>
      l.includes('could not obtain lock on row in relation "ai_workspace"'),
    ).length;
};
const summary = (results) =>
  Object.entries(
    results.reduce(
      (m, r) => ({ ...m, [r.detail]: (m[r.detail] ?? 0) + 1 }),
      {},
    ),
  )
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");

if (cases.includes("studio")) {
  const since = new Date().toISOString();
  const { token } = await signIn(API, ACTORS.maya, "/studio/ai");
  let reads = 0;
  let studioOn = true;
  const studio = (async () => {
    while (studioOn) {
      const r = await call(API, "GET", `/v1/agent/${MAYA_CREATOR_ID}/state`, {
        token,
      });
      if (r.status === 200) reads++;
      await sleep(150);
    }
  })();
  const fans = await Promise.all([0, 1, 2].map(fan));
  const results = (
    await Promise.all(
      fans.map(async (f, i) => {
        const out = [];
        for (let m = 0; m < 3; m++)
          out.push(await ask(f, `Studio busy ${i + 1}.${m + 1}: kiln wash?`));
        return out;
      }),
    )
  ).flat();
  studioOn = false;
  await studio;
  step(
    `studio: 9 answers while Studio reads every 150 ms (${reads} reads), each answered once`,
    results.every((r) => r.ok),
    `${results.filter((r) => r.ok).length}/9 (${summary(results)}); workspace row-lock refusals ${workspaceRefusals(since)}`,
  );
}

if (cases.includes("two")) {
  const since = new Date().toISOString();
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
        PORT: "56437",
      },
      stdio: ["ignore", log, log],
    },
  );
  closeSync(log);
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
    `pid ${second.pid}`,
  );
  const fans = await Promise.all([0, 1, 2, 3, 4].map(fan));
  const results = [];
  for (let r = 0; r < 2; r++)
    results.push(
      ...(await Promise.all(
        fans.map((f, i) =>
          ask(
            f,
            `Two workers ${r + 1}.${i + 1}: cone pack?`,
            i % 2 ? SECOND : API,
          ),
        ),
      )),
    );
  step(
    `two: ${results.length} messages from 5 fans through both APIs, each answered once`,
    results.every((r) => r.ok),
    `${results.filter((r) => r.ok).length}/${results.length} (${summary(results)}); workspace row-lock refusals ${workspaceRefusals(since)}`,
  );
  second.kill("SIGTERM");
  for (let w = 0; w < 30 && second.exitCode === null; w++) await sleep(1000);
  if (second.exitCode === null) second.kill("SIGKILL");
  step(
    "two: the second backend stopped",
    second.exitCode !== null || second.signalCode !== null,
  );
}

for (const f of opened.values()) f.watch.close();
await closeDb();
finish();
