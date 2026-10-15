// Shared helpers for lane 1 scenarios: HTTP calls against a running stack, the
// development sign-in, one-line step reporting and read-only database checks.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export const LANE = process.env.QELVORA_LANE ?? "1";
export const API =
  process.env.QELVORA_API_URL ?? `http://127.0.0.1:564${LANE}1`;
export const CONTAINER =
  process.env.QELVORA_DB_CONTAINER ?? `qelvora-lane${LANE}-postgres`;
export const MAYA = "20000000-0000-4000-8000-000000000001";
export const actor = (n) => `10000000-0000-4000-8000-00000000000${n}`;
export const key = (label) =>
  `${label}-${randomUUID()}`.replaceAll(/[^A-Za-z0-9_-]/gu, "").slice(0, 120);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function call(method, path, { token, body, headers = {} } = {}) {
  const response = await fetch(new URL(path, API), {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(65_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* keep the text */
  }
  return { status: response.status, json, text, headers: response.headers };
}
export const describe = (r) =>
  `${r.status} ${r.json?.error?.code ?? r.json?.state ?? ""}`.trim();

/** The development identity: the code is the synthetic account id. */
export async function signIn(n) {
  const begun = await call("POST", "/v1/identity/continue", {
    body: { returnTo: "/home" },
  });
  const done = await call("POST", "/v1/identity/complete", {
    body: { continuationId: begun.json?.continuationId, code: actor(n) },
  });
  if (done.status !== 200)
    throw new Error(
      `sign-in for actor ${n} failed: ${done.text.slice(0, 200)}`,
    );
  return done.json;
}

/** Read-only checks of the state behind the screen, in the lane's own container. */
export function sql(query, database = "creator_stack") {
  return execFileSync(
    "docker",
    [
      "exec",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-F",
      "|",
      "-c",
      query,
    ],
    {
      encoding: "utf8",
    },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("|"));
}

export function reporter() {
  let failures = 0;
  let skipped = 0;
  return {
    skip(name, reason) {
      skipped += 1;
      console.log(`NOT RUN  ${name}  (${reason})`);
    },
    step(name, ok, detail = "") {
      if (!ok) failures += 1;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
      );
      return ok;
    },
    note: (text) => console.log(`      ${text}`),
    finish() {
      console.log(`${failures} failed, ${skipped} not run`);
      process.exit(failures || skipped ? 1 : 0);
    },
  };
}
