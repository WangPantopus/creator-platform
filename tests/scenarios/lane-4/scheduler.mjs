// Starts, stops or kills the commerce scheduler beside the lane 4 stack's
// backend (apps/backend/src/modules/payments/recovery-host.ts), with the
// backend's own settings file, so scenarios can leave requests alone and watch
// the system finish them, and can kill and restart the scheduler mid-flight.
//   node tests/scenarios/lane-4/scheduler.mjs start [interval ms] | stop | kill | status
import { spawn } from "node:child_process";
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

const backend = fileURLToPath(
  new URL("../../../apps/backend/", import.meta.url),
);
const dir = join(tmpdir(), "qelvora-lane4-scenarios");
const settings = join(tmpdir(), "qelvora-stack", "lane4", "backend.env");
const pidFile = join(dir, "scheduler.pid");
const log = join(dir, "scheduler.log");

const pid = () => {
  try {
    const value = Number(readFileSync(pidFile, "utf8"));
    process.kill(value, 0);
    return value;
  } catch {
    return null;
  }
};
export const schedulerRunning = () => pid() !== null;

export async function startScheduler(intervalMs = 2000) {
  if (pid()) return pid();
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const out = openSync(log, "a");
  const child = spawn(
    process.execPath,
    [
      `--env-file=${settings}`,
      "--import",
      "tsx",
      "src/modules/payments/recovery-host.ts",
    ],
    {
      cwd: backend,
      detached: true,
      stdio: ["ignore", out, out],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        COMMERCE_RECOVERY_INTERVAL_MS: String(intervalMs),
      },
    },
  );
  child.unref();
  closeSync(out);
  writeFileSync(pidFile, String(child.pid));
  for (let i = 0; i < 100; i++) {
    if (readFileSync(log, "utf8").includes(`pass every ${intervalMs} ms`))
      return child.pid;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the scheduler did not start; see ${log}`);
}

/** SIGTERM lets a running pass finish; SIGKILL is a crash. */
export async function stopScheduler(signal = "SIGTERM") {
  const running = pid();
  if (!running) return false;
  process.kill(running, signal);
  for (let i = 0; i < 100 && pid(); i++)
    await new Promise((r) => setTimeout(r, 100));
  rmSync(pidFile, { force: true });
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command = "status", interval] = process.argv.slice(2);
  if (command === "start")
    console.log(
      `scheduler running (pid ${await startScheduler(Number(interval ?? 2000))})`,
    );
  else if (command === "stop")
    console.log(
      (await stopScheduler())
        ? "scheduler stopped"
        : "scheduler was not running",
    );
  else if (command === "kill")
    console.log(
      (await stopScheduler("SIGKILL"))
        ? "scheduler killed"
        : "scheduler was not running",
    );
  else
    console.log(
      schedulerRunning()
        ? `scheduler running (pid ${pid()})`
        : "scheduler not running",
    );
}
