// Starts and stops the lane 4 trust host (trust-host.mts) on 127.0.0.1:56447,
// with the lane 4 backend's own settings file, and asks it for a departure
// settlement directly on 127.0.0.1:56448.
//   node tests/scenarios/lane-4/trust-host-control.mjs start | stop | status
import { spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const dir = join(tmpdir(), "qelvora-lane4-scenarios");
const settings = join(tmpdir(), "qelvora-stack", "lane4", "backend.env");
const pidFile = join(dir, "trust-host.pid");
const log = join(dir, "trust-host.log");

const pid = () => {
  try {
    const value = Number(readFileSync(pidFile, "utf8"));
    process.kill(value, 0);
    return value;
  } catch {
    return null;
  }
};

export async function startTrustHost() {
  if (pid()) return pid();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const from = existsSync(log) ? statSync(log).size : 0;
  const out = openSync(log, "a");
  const child = spawn(
    process.execPath,
    [
      `--env-file=${settings}`,
      "--import",
      "tsx",
      "tests/scenarios/lane-4/trust-host.mts",
    ],
    {
      cwd: root,
      detached: true,
      stdio: ["ignore", out, out],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        PORT: "56447",
      },
    },
  );
  child.unref();
  closeSync(out);
  writeFileSync(pidFile, String(child.pid));
  for (let i = 0; i < 300; i++) {
    if (readFileSync(log, "utf8").slice(from).includes("trust host listening"))
      return child.pid;
    if (!pid()) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the trust host did not start; see ${log}`);
}

export async function stopTrustHost() {
  const running = pid();
  if (!running) return false;
  process.kill(running, "SIGTERM");
  for (let i = 0; i < 100 && pid(); i++)
    await new Promise((r) => setTimeout(r, 100));
  rmSync(pidFile, { force: true });
  return true;
}

/** The host's settlement answers for this case, as its log recorded them. */
export function settlements(caseId) {
  if (!existsSync(log)) return [];
  return readFileSync(log, "utf8")
    .split("\n")
    .filter((line) => line.startsWith('{"event":"settle_departure'))
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.caseId === caseId);
}

/** Stops the stack's own backend, so that only this host's trust worker
 * claims effects. A stack reset (or `stack.mjs up`) starts it again. */
export async function stopStackBackend() {
  const pids = JSON.parse(
    readFileSync(join(tmpdir(), "qelvora-stack", "lane4", "pids.json"), "utf8"),
  );
  const backend = pids.backend?.pid;
  if (!backend) return false;
  try {
    process.kill(backend, "SIGTERM");
  } catch {
    return false;
  }
  for (let i = 0; i < 100; i++) {
    try {
      process.kill(backend, 0);
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return true;
}

/** The same call the trust worker makes, asked again directly. */
export async function askDeparture(input) {
  const answer = await fetch("http://127.0.0.1:56448/departure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return { status: answer.status, body: await answer.json() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command = "status"] = process.argv.slice(2);
  if (command === "start")
    console.log(`trust host running (pid ${await startTrustHost()})`);
  else if (command === "stop")
    console.log(
      (await stopTrustHost())
        ? "trust host stopped"
        : "trust host was not running",
    );
  else
    console.log(
      pid() ? `trust host running (pid ${pid()})` : "trust host not running",
    );
  process.exit(0);
}
