// Starts, stops or kills the commerce scheduler beside the lane 4 stack's
// backend (apps/backend/src/modules/payments/recovery-host.ts), with the
// backend's own settings file, so scenarios can leave requests alone and watch
// the system finish them, and can kill and restart the scheduler mid-flight.
// It also receives the processor's notifications on 127.0.0.1:56445 (the
// signing secret is a placeholder the scenarios share) and, when this stack has
// the inbox login (inbox-login in the lane 4 scenario directory, made by the
// e4-6 scenario), claims them. The login is put back on every start, because
// the local stack gives every login role a new password on `up`.
//   node tests/scenarios/lane-4/scheduler.mjs start [interval ms] | stop | kill | status
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
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
import { sql } from "./lib.mjs";

const backend = fileURLToPath(
  new URL("../../../apps/backend/", import.meta.url),
);
const dir = join(tmpdir(), "qelvora-lane4-scenarios");
const settings = join(tmpdir(), "qelvora-stack", "lane4", "backend.env");
const pidFile = join(dir, "scheduler.pid");
const log = join(dir, "scheduler.log");
export const WEBHOOK_URL =
  "http://127.0.0.1:56445/v1/commerce/provider-notifications/stripe";
export const WEBHOOK_SECRET = "whsec_lane4_fake_edge";
const loginFile = join(dir, "inbox-login");
const loginSecret = () =>
  readFileSync(loginFile, "utf8").replace(/[^A-Za-z0-9_-]/gu, "");
const inboxLogin = () =>
  existsSync(loginFile)
    ? `postgresql://creator_commerce_inbox:${loginSecret()}@127.0.0.1:56440/creator_stack`
    : undefined;
/**
 * Stand-in for the proposed migration (schema-provider-inbox-worker.sql, in its
 * own pull request) in this stack's own database: the non-owner login that may
 * claim notifications. Its password lives only in the scenario directory.
 */
export async function ensureInboxLogin() {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!existsSync(loginFile))
    writeFileSync(loginFile, randomBytes(18).toString("base64url"), {
      mode: 0o600,
    });
  await sql(
    "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='creator_commerce_inbox') THEN CREATE ROLE creator_commerce_inbox LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION; END IF; END $$",
  );
  await sql(`ALTER ROLE creator_commerce_inbox PASSWORD '${loginSecret()}'`);
  await sql("GRANT USAGE ON SCHEMA creator TO creator_commerce_inbox");
  await sql(
    "GRANT SELECT (provider,event_id,event_type,object_ref,received_at,state,lease_until,attempt), UPDATE (state,lease_until,attempt,error_code) ON creator.commerce_provider_inbox TO creator_commerce_inbox",
  );
}

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
  if (existsSync(loginFile)) await ensureInboxLogin();
  // Only what this start writes counts as its readiness.
  const from = existsSync(log) ? statSync(log).size : 0;
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
        STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
        COMMERCE_WEBHOOK_PORT: "56445",
        ...(inboxLogin() ? { COMMERCE_INBOX_DATABASE_URL: inboxLogin() } : {}),
      },
    },
  );
  child.unref();
  closeSync(out);
  writeFileSync(pidFile, String(child.pid));
  for (let i = 0; i < 100; i++) {
    if (
      readFileSync(log, "utf8")
        .slice(from)
        .includes(`pass every ${intervalMs} ms`)
    )
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
  process.exit(0);
}
