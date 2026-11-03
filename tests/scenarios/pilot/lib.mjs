// Helpers for the pilot scenarios against a fresh local stack
// (`node infra/local/stack.mjs up --lane N --base-port P`, then PILOT_BASE_PORT=P):
// the real backend, web app and PostgreSQL. Each scenario names its fakes where
// it uses them.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { call, signIn } from "../lane-2/lib.mjs";

const pg = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("pg");

const base = Number(process.env.PILOT_BASE_PORT ?? 56400);
if (!Number.isSafeInteger(base) || base < 1024 || base > 65526)
  throw new Error("Set PILOT_BASE_PORT to the first of the stack's ten ports.");
export const API = `http://127.0.0.1:${base + 1}`;
export const WEB = `http://localhost:${base + 2}`;
const DB = `postgresql://postgres:foundation-test-only@127.0.0.1:${base}/creator_stack`;
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

/** A development account with a fan profile, created through the real API on
 * first use. */
export async function fan(n) {
  const { token } = await signIn(API, account(n));
  let [row] = await sql(
    "SELECT handle FROM creator.fan_profile WHERE account_id=$1",
    [account(n)],
  );
  if (!row) {
    const made = await call(API, "POST", "/v1/identity/fan-profile", {
      token,
      body: { handle: `pilot${n}${run}`, intro: "" },
    });
    if (made.status !== 200)
      throw new Error(`fan profile refused (${made.status} ${made.text})`);
    row = made.json;
  }
  return { n, account: account(n), token, handle: row.handle };
}
/** Stand-in for a membership made before the pilot turned Team triage off. */
export const legacyMember = (n, roles) =>
  sql(
    "INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES($1,$2,$3) ON CONFLICT (creator_id,account_id) DO UPDATE SET roles=$3,revoked_at=NULL",
    [MAYA, account(n), roles],
  );
/** The member's current roles, sorted, or "none". */
export async function roles(n) {
  const [row] = await sql(
    "SELECT roles FROM creator.team_membership WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL",
    [MAYA, account(n)],
  );
  return row ? [...row.roles].sort().join(",") : "none";
}
