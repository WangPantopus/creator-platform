// Helpers for lane 6's E6.2 scenarios (Today and a Note) against the lane 6 stack
// (`node infra/local/stack.mjs up --lane 6`): the real web app in Chrome, the real
// backend and PostgreSQL. Fakes, each named where it is used: the development
// identity, a virtual passkey authenticator (the creator's signing device) and
// membership rows standing in for a completed purchase (lane 4).
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
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
/** A known limit, observed and printed; it is neither a pass nor a failure. */
export async function note(id, what, observe) {
  console.log(`NOTE ${id} ${what} :: ${await observe()}`);
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

/** A development account's session through the real continue/complete round trip. */
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
/** A phone-width context with a virtual passkey device (user verification on). */
export async function phone(browser, { night = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: night ? "dark" : "light",
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  return { context, page, cdp, authenticatorId };
}
/** Stand-in for lane 1's verification review: the seeded creator gets the
 * approved external proof a signing passkey requires. */
export async function approvedProof(creatorId = MAYA) {
  await sql(
    `INSERT INTO creator.creator_proof(account_id,creator_id,code,platform,account_url,post_url,state,expires_at,submitted_at,reviewed_at,reason)
     SELECT account_id,id,'lane6-standin','instagram','https://instagram.com/lane6','https://instagram.com/p/lane6','approved',now()+interval '1 day',now()-interval '1 hour',now(),'Stand-in for the lane 1 review'
     FROM creator.creator_profile p WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM creator.creator_proof WHERE creator_id=p.id AND state='approved')`,
    [creatorId],
  );
}
/** Register a signing passkey on this page's virtual device through the real
 * setup page (lane 1), right after a fresh sign-in. */
export async function registerPasskey(page) {
  await page.goto(`${WEB}/studio/setup`);
  const register = page.getByRole("button", {
    name: "Register a signing passkey",
  });
  await register.waitFor();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent === "Register a signing passkey" && !b.disabled,
      ),
    null,
    { timeout: 30_000 },
  );
  await register.click();
  await page.getByText("Passkey registered").waitFor({ timeout: 30_000 });
}
/** Sign in with a development account in the browser and open `path`. A person
 * without a fan handle picks one first, as the navigation config asks. */
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

/** A fan with a profile, created through the real API on first use. */
export async function fan(n) {
  const token = await apiSession(n);
  let [row] = await sql(
    "SELECT id,handle FROM creator.fan_profile WHERE account_id=$1",
    [account(n)],
  );
  if (!row) {
    const made = await api("POST", "/v1/identity/fan-profile", token, {
      handle: `fan${n}${run}`,
      intro: "",
    });
    row = made.json;
  }
  return { n, token, id: row.id, handle: row.handle };
}
/** Stand-in for a tier made in Offers (lane 4). */
export async function tier(name) {
  const [row] = await sql(
    "INSERT INTO creator.commerce_tier(creator_id,name,capabilities,ai_allowance,state) VALUES($1,$2,ARRAY['ai_message'],100,'active') RETURNING id",
    [MAYA, `${name} ${run}`],
  );
  return row.id;
}
/** Stand-in for a completed membership purchase (lane 4): the grant and the
 * membership row exactly as the audience checks read them. */
export async function member(
  fanId,
  tierId,
  state = "active",
  ends = "30 days",
  grantEnds = ends,
) {
  const [grant] = await sql(
    `INSERT INTO creator.access_grant(creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance)
     VALUES($1,$2,ARRAY['ai_message'],'membership','active',now()-interval '2 days',now()+$3::interval,100) RETURNING id`,
    [MAYA, fanId, grantEnds],
  );
  const [row] = await sql(
    `INSERT INTO creator.commerce_membership(creator_id,fan_id,tier_id,provider,provider_ref,state,period_start,period_end,grace_end,purchased_at,grant_id)
     VALUES($1,$2,$3,'stripe',$4,$5,now()-interval '2 days',now()+$6::interval,CASE WHEN $5='grace' THEN now()+interval '3 days' END,now()-interval '2 days',$7) RETURNING id`,
    [MAYA, fanId, tierId, `lane6-${randomUUID()}`, state, ends, grant.id],
  );
  return { membership: row.id, grant: grant.id };
}
/** The membership ends now (stand-in for lane 4's expiry). */
export async function leave({ membership, grant }) {
  await sql(
    "UPDATE creator.commerce_membership SET state='cancelled',period_start=now()-interval '2 days',period_end=now()-interval '1 second' WHERE id=$1",
    [membership],
  );
  await sql(
    "UPDATE creator.access_grant SET state='expired',valid_from=now()-interval '2 days',valid_until=now()-interval '1 second' WHERE id=$1",
    [grant],
  );
}
/** Stand-in for lane 4 ending memberships now: one fan's, or everyone's. */
export async function endMemberships(fanId = null) {
  await sql(
    "UPDATE creator.commerce_membership SET state='cancelled',period_end=greatest(period_start+interval '1 second',now()-interval '1 second') WHERE creator_id=$1 AND ($2::uuid IS NULL OR fan_id=$2)",
    [MAYA, fanId],
  );
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
/** Every Note in a fan's thread (contract C4), following older pages. */
export async function presence(token) {
  const items = [];
  let before = "";
  for (let page = 0; page < 10; page++) {
    const r = await api(
      "GET",
      `/v1/content/${MAYA}/presence?limit=50${before ? `&before=${encodeURIComponent(before)}` : ""}`,
      token,
    );
    if (r.status !== 200) return { status: r.status, items };
    items.push(...r.json.items);
    if (!r.json.nextBefore) break;
    before = r.json.nextBefore;
  }
  return { status: 200, items };
}
/** A second tab in the same browser, with the same passkey on its own virtual
 * device (each tab's DevTools session holds its own authenticator). */
export async function secondTab(context, first) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  const { credentials } = await first.cdp.send("WebAuthn.getCredentials", {
    authenticatorId: first.authenticatorId,
  });
  for (const credential of credentials)
    await cdp.send("WebAuthn.addCredential", { authenticatorId, credential });
  return { page, cdp, authenticatorId };
}
