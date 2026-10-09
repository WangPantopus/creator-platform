// Helpers for scenarios that run the production host (operations/production-server.ts)
// as a real process against the local stack's database.
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sleep } from "./lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const repo = join(here, "../../..");
export const PORT = 56424;
export const fixtures = join(here, "fixtures");
export const release = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo })
  .toString()
  .trim();
export const sessionKey = randomBytes(32).toString("base64");
export const databaseUrl = (
  role,
  password = "foundation-test-only",
  port = 56420,
  database = "creator_stack",
) => `postgresql://${role}:${password}@127.0.0.1:${port}/${database}`;

/** A valid, production-shaped environment; each case changes what it is about. */
export const baseEnv = (extra = {}) => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  NODE_ENV: "production",
  DEPLOYMENT_ENVIRONMENT: "review",
  RELEASE_REVISION: release,
  PORT: String(PORT),
  HOST: "127.0.0.1",
  WEB_ORIGIN: "https://app.example.test",
  PASSKEY_RP_ID: "example.test",
  DATABASE_URL: databaseUrl("creator_runtime"),
  IDENTITY_SESSION_KEY: sessionKey,
  PRODUCTION_ADAPTER_DIR: fixtures,
  PRODUCTION_ADAPTER_MODULE: "e2-2-adapters.mjs",
  ...extra,
});

/** Start the host; `lines` are its JSON log events, `exited` resolves with its exit code. */
export function startHost(env) {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/operations/production-server.ts"],
    {
      cwd: join(repo, "apps/backend"),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const host = {
    child,
    lines: [],
    raw: "",
    pid: child.pid,
    port: Number(env.PORT),
  };
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    host.raw += chunk;
    buffer += chunk;
    for (
      let at;
      (at = buffer.indexOf("\n")) >= 0;
      buffer = buffer.slice(at + 1)
    )
      try {
        host.lines.push(JSON.parse(buffer.slice(0, at)));
      } catch {
        /* not an event line */
      }
  });
  child.stderr.on("data", (chunk) => (host.raw += chunk));
  host.exited = new Promise((resolve) =>
    child.on("close", (code) => resolve(code)),
  );
  return host;
}

export const event = (host, name) =>
  host.lines.find((line) => line.event === name);

/** "live" once /health/live answers, "exited" if the process ends first. */
export async function untilLiveOrExit(host, timeoutMs = 60_000) {
  let exited = false;
  void host.exited.then(() => (exited = true));
  for (const until = Date.now() + timeoutMs; Date.now() < until; ) {
    if (exited) return "exited";
    try {
      const response = await fetch(
        `http://127.0.0.1:${host.port}/health/live`,
        { signal: AbortSignal.timeout(1500) },
      );
      if (response.ok) return "live";
    } catch {
      /* not listening yet */
    }
    await sleep(250);
  }
  return "timeout";
}

export async function get(path, options = {}, port = PORT) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    signal: AbortSignal.timeout(8000),
    ...options,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: response.status, json, text, headers: response.headers };
}

/** SIGTERM the host (a process this script started) and wait for its exit code. */
export async function stopHost(host) {
  if (host.child.exitCode === null) host.child.kill("SIGTERM");
  return Promise.race([host.exited, sleep(30_000).then(() => "stuck")]);
}

export const portInUse = (port = PORT) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => (socket.destroy(), resolve(true)));
    socket.once("error", () => resolve(false));
  });
