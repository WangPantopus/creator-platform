// Lane 4's stack: the one-command local stack (infra/local/stack.mjs, lane 4
// ports) with the fake card processor at the outer edge. It starts
// fake-stripe.mjs on 127.0.0.1:56444, then runs the stack command with the
// backend's Stripe settings pointed at it through stripe-edge.mjs. The keys are
// sandbox-shaped placeholders that the fake ignores; no real key exists here.
//   node tests/scenarios/lane-4/stack.mjs up [stack options]     (also: status, stop, down, env, logs)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = join(here, "../../..");
const FAKE_PORT = 56444;
// The pinned API version the backend requires is the installed SDK's own.
const { API_VERSION } = createRequire(join(root, "apps/backend/package.json"))(
  "stripe",
);
const dir = join(tmpdir(), "qelvora-lane4-scenarios");
const [command = "up", ...rest] = process.argv.slice(2);
mkdirSync(dir, { recursive: true, mode: 0o700 });

const answers = async () => {
  try {
    return (
      await fetch(`http://127.0.0.1:${FAKE_PORT}/__state`, {
        signal: AbortSignal.timeout(1000),
      })
    ).ok;
  } catch {
    return false;
  }
};
async function startFake() {
  if (await answers())
    return console.log(
      `  fake processor already answering on 127.0.0.1:${FAKE_PORT}`,
    );
  const log = openSync(join(dir, "fake-stripe.log"), "a");
  const child = spawn(
    process.execPath,
    [join(here, "fake-stripe.mjs"), String(FAKE_PORT)],
    { detached: true, stdio: ["ignore", log, log] },
  );
  child.unref();
  closeSync(log);
  writeFileSync(join(dir, "fake-stripe.pid"), String(child.pid));
  for (let i = 0; i < 50 && !(await answers()); i++)
    await new Promise((r) => setTimeout(r, 100));
  if (!(await answers()))
    throw new Error(
      "The fake processor did not start; see fake-stripe.log in the lane 4 scenario directory.",
    );
  console.log(
    `  fake processor started on 127.0.0.1:${FAKE_PORT} (pid ${child.pid})`,
  );
}
function stopFake() {
  try {
    const pid = Number(readFileSync(join(dir, "fake-stripe.pid"), "utf8"));
    process.kill(pid, "SIGTERM");
    console.log(`  fake processor stopped (pid ${pid})`);
  } catch {
    /* not running */
  }
  rmSync(join(dir, "fake-stripe.pid"), { force: true });
}

const settings = [
  "COMMERCE_RECOVERY_ENABLED=false",
  "STRIPE_SECRET_KEY=sk_test_lane4_fake_edge",
  "STRIPE_PUBLISHABLE_KEY=pk_test_lane4_fake_edge",
  `STRIPE_API_VERSION=${API_VERSION}`,
  "STRIPE_COLLECTION_ACCOUNT=platform",
  `QELVORA_FAKE_STRIPE_URL=http://127.0.0.1:${FAKE_PORT}`,
  `NODE_OPTIONS=--import=${join(here, "stripe-edge.mjs")}`,
].flatMap((pair) => ["--env", pair]);

if (["stop", "down", "reset"].includes(command)) stopFake();
// A rebuilt database starts with a processor that has never seen it.
if (["down", "reset"].includes(command))
  rmSync(join(dir, `fake-stripe-${FAKE_PORT}.json`), { force: true });
if (["up", "reset"].includes(command)) await startFake();
const args = [
  join(root, "infra/local/stack.mjs"),
  command,
  "--lane",
  "4",
  ...rest,
  ...(["up", "reset"].includes(command) ? settings : []),
];
const code = await new Promise((done) =>
  spawn(process.execPath, args, { stdio: "inherit" }).on("close", (c) =>
    done(c ?? 1),
  ),
);
if (command === "status")
  console.log(
    `  fake      ${(await answers()) ? "ok     " : "DOWN   "} 127.0.0.1:${FAKE_PORT}`,
  );
process.exit(code);
