// Helpers for lane 6's E6.9 scenarios (no polling) against the lane 6 stack
// (`node infra/local/stack.mjs up --lane 6 --provider anthropic --growth`): the real
// web app in Chrome, the real backend and PostgreSQL. Fakes, named where used: the
// development identity, the model fake, and team rows standing in for an accepted
// invitation (lane 1).
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const pg = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("pg");
const { chromium } = createRequire(
  new URL("../../../package.json", import.meta.url),
)("@playwright/test");

export const WEB = process.env.LANE6_WEB ?? "http://localhost:56462";
export const API = process.env.LANE6_API ?? "http://127.0.0.1:56461";
const DB =
  process.env.LANE6_DB ??
  "postgresql://postgres:foundation-test-only@127.0.0.1:56460/creator_stack";
export const MAYA = "20000000-0000-4000-8000-000000000001";
export const account = (n) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const run = randomUUID().slice(0, 6);

let pool;
export const sql = async (text, values) =>
  (
    await (pool ??= new pg.Pool({ connectionString: DB, max: 2 })).query(
      text,
      values,
    )
  ).rows;

/** A slow database stand-in: holds an exclusive lock on `table` for `ms`;
 * resolves when the lock is released. */
export async function lockFor(table, ms) {
  const client = await (pool ??= new pg.Pool({
    connectionString: DB,
    max: 2,
  })).connect();
  await client.query("BEGIN");
  await client.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
  await new Promise((resolve) => setTimeout(resolve, ms));
  await client.query("ROLLBACK");
  client.release();
}
const results = [];
/** One named step: prints PASS or FAIL with what was observed, and keeps going. */
export async function step(id, what, check) {
  try {
    const observed = await check();
    results.push(true);
    console.log(`PASS ${id} ${what}${observed ? ` :: ${observed}` : ""}`);
  } catch (error) {
    results.push(false);
    console.log(`FAIL ${id} ${what} :: ${error.message.split("\n")[0]}`);
  }
}
export function expect(condition, message) {
  if (!condition) throw new Error(message);
}
export async function finish(browser) {
  await browser?.close();
  await pool?.end();
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} steps passed`);
  process.exit(failed ? 1 : 0);
}

/** A development account's API session through the real continue/complete round trip. */
export async function apiSession(n) {
  const post = (path, body) =>
    fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  const started = await post("/v1/identity/continue", { returnTo: "/home" });
  const done = await post("/v1/identity/complete", {
    continuationId: started.continuationId,
    code: account(n),
  });
  return done.token;
}
export async function api(method, path, token, body) {
  const r = await fetch(API + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

export const launch = () =>
  chromium.launch({ channel: "chrome", headless: true });
/** A phone-width browser context. */
export async function phone(browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  return { context, page, cdp: await context.newCDPSession(page) };
}
/** Sign in with a development account in the browser and open `path`. */
export async function signIn(page, n, path) {
  await page.goto(`${WEB}/auth/continue?returnTo=${encodeURIComponent(path)}`);
  await page.getByText("Continue with Pantopus").first().click();
  await page
    .getByRole("button", {
      name: `Development actor ${["one", "two", "three"][n - 1]}`,
      exact: true,
    })
    .click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), {
    timeout: 60_000,
  });
  if (new URL(page.url()).pathname === "/onboarding/handle") {
    await page.locator("#handle").fill(`lane6${n}${run}`);
    await page.locator("button.handle-continue").click();
    await page.waitForURL((u) => u.pathname !== "/onboarding/handle");
  }
  if (new URL(page.url()).pathname !== path) await page.goto(WEB + path);
}
/** Stand-in for an accepted team invitation (lane 1), or its removal. */
export async function team(n, roles) {
  await sql(
    roles
      ? "INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES($1,$2,$3) ON CONFLICT (creator_id,account_id) DO UPDATE SET roles=$3,revoked_at=NULL"
      : "UPDATE creator.team_membership SET revoked_at=now() WHERE creator_id=$1 AND account_id=$2",
    roles ? [MAYA, account(n), roles] : [MAYA, account(n)],
  );
}
/** Every /api/ request the page starts, with the time it started. */
export function requestLog(page) {
  const log = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith("/api/"))
      log.push({ at: Date.now(), path: url.pathname + url.search });
  });
  return log;
}
/** Requests started in [from, to), grouped by path without the query. */
export function count(log, from, to = Date.now()) {
  const within = log.filter((r) => r.at >= from && r.at < to);
  const byPath = {};
  for (const r of within) {
    const path = r.path.split("?")[0].replace(/[a-f0-9-]{36}/gu, ":id");
    byPath[path] = (byPath[path] ?? 0) + 1;
  }
  return { total: within.length, byPath };
}
/** The seeded fan (development actor one) with a conversation with Maya; `say`
 * sends a message through the real API. */
export async function stackFan() {
  const [row] = await sql(
    "SELECT f.id,f.handle FROM creator.fan_profile f WHERE f.account_id=$1",
    [account(1)],
  );
  const token = await apiSession(1);
  const say = async (text) => {
    const r = await api(
      "POST",
      `/v1/conversations/${MAYA}/${row.id}/messages`,
      token,
      {
        idempotencyKey: randomUUID(),
        text,
        clientSequence: Date.now() % 1e6,
      },
    );
    expect(
      r.status === 200,
      `fan message ${r.status} ${JSON.stringify(r.json)}`,
    );
  };
  // Pausing the backend during an AI reply stops lane 3's generation worker and
  // the host with it (a ticket), so a pause waits until no reply is in flight.
  const quiet = async () => {
    for (let waited = 0; waited < 120; waited++) {
      const r = await api("GET", `/v1/conversations/${MAYA}/${row.id}`, token);
      if (
        !(r.json?.messages ?? []).some(
          (m) =>
            m.authorKind === "ai" &&
            ["queued", "generating"].includes(m.deliveryState),
        )
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("an AI reply was still in flight after 120 s");
  };
  return { ...row, say, quiet };
}
/** Studio is hidden ("Reconnect to Studio") or not drawn at all. */
export const hidden = (page) =>
  page.evaluate(
    () =>
      Boolean(document.querySelector(".w5-studio[hidden]")) ||
      !document.querySelector(".w5-studio"),
  );
/** Milliseconds until `check` holds, sampled every 100 ms, or a failure. */
export async function until(page, check, limit, what) {
  const from = Date.now();
  while (Date.now() - from < limit) {
    if (await check()) return Date.now() - from;
    await page.waitForTimeout(100);
  }
  throw new Error(`${what} not within ${limit} ms`);
}
