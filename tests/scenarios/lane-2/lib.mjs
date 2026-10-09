// Shared helpers for the lane 2 scenario scripts: a tiny JSON client for a
// running local stack and the development sign-in. Plain Node, no framework.
import { randomUUID } from "node:crypto";

/** The development identity's fixed synthetic accounts (see the identity
 * capabilities endpoint). Actor three is the creator Maya in the stack seed. */
export const ACTORS = {
  fanOne: "10000000-0000-4000-8000-000000000001",
  fanTwo: "10000000-0000-4000-8000-000000000002",
  maya: "10000000-0000-4000-8000-000000000003",
};
export const MAYA_CREATOR_ID = "20000000-0000-4000-8000-000000000001";

export async function call(base, method, path, options = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 20000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: callers that care read `text`.
  }
  return { status: response.status, json, text, ms: 0 };
}

/** Sign in as a development account through the real identity endpoints. */
export async function signIn(base, accountId, returnTo = "/home") {
  const begun = await call(base, "POST", "/v1/identity/continue", {
    body: { returnTo },
  });
  if (begun.status !== 200)
    throw new Error(`sign-in could not begin (${begun.status} ${begun.text})`);
  const done = await call(base, "POST", "/v1/identity/complete", {
    body: { continuationId: begun.json.continuationId, code: accountId },
  });
  if (done.status !== 200)
    throw new Error(`sign-in was refused (${done.status} ${done.text})`);
  return { token: done.json.token, session: done.json.session };
}

export const key = (prefix = "lane2") => `${prefix}-${randomUUID()}`;

/** One line per step; the script exits non-zero if any step failed. */
export function reporter() {
  let failed = 0;
  return {
    step(name, ok, detail = "") {
      if (!ok) failed += 1;
      process.stdout.write(
        `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}\n`,
      );
      return ok;
    },
    /** Reported like a step, but a failure is a WARN and never fails the run. */
    advise(name, ok, detail = "") {
      process.stdout.write(
        `${ok ? "PASS" : "WARN"}  ${name}${detail ? `  (${detail})` : ""}\n`,
      );
      return ok;
    },
    finish() {
      process.stdout.write(
        failed ? `\n${failed} step(s) failed\n` : "\nall steps passed\n",
      );
      process.exit(failed ? 1 : 0);
    },
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
