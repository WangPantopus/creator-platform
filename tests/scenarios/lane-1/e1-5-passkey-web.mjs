#!/usr/bin/env node
// E1.5 (registration part) in a real browser: a Qelvora-signed-in creator is
// verified through the trust case flow (the development ops supervisor decides
// through the API, standing in for the ops console of WP 1.6), registers a
// passkey on a virtual authenticator, and, once the session is older than five
// minutes, signs in again with Google from the setup page before a second one.
//   node tests/scenarios/lane-1/e1-5-passkey-web.mjs
import { chromium } from "@playwright/test";
import {
  API,
  call,
  describe,
  one,
  person,
  reporter,
  sleep,
  sql,
  yearsAgo,
} from "./sign-in-lib.mjs";

const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const SESSION = `qelvora_session_${new URL(WEB).port}`;
const { step, note, finish } = reporter();
const key = (label) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ locale: "en-US" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
const device = () =>
  cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
const first = await device();
async function googleSignIn(sub, url) {
  await page.goto(url);
  await page
    .getByRole("link", { name: "Continue with Google" })
    .first()
    .click();
  await page.getByLabel("Test person").fill(sub);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
}

// A new adult signs in on the web, then becomes a creator with submitted proof.
const sub = person("creator");
await googleSignIn(sub, `${WEB}/auth/continue?returnTo=%2Fstudio%2Fsetup`);
await page.locator("#birth-date").fill(yearsAgo(34));
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForLoadState("networkidle");
const token = (await context.cookies(WEB)).find(
  (c) => c.name === SESSION,
)?.value;
step("the creator is signed in on the web", Boolean(token), page.url());
const creator = await call("POST", "/v1/identity/creator-profile", {
  token,
  body: { handle: `qc${Date.now() % 1e8}`, displayName: "Scenario Creator" },
});
const proof = await call("POST", `/v1/identity/${creator.json?.id}/proof`, {
  token,
  body: {
    platform: "instagram",
    accountUrl: "https://instagram.com/scenario_creator",
  },
});
const submitted = await call(
  "POST",
  `/v1/identity/proof/${proof.json?.id}/submit`,
  {
    token,
    body: { postUrl: `https://instagram.com/p/${proof.json?.code ?? "x"}` },
  },
);
const report = await call("POST", "/v1/trust/reports", {
  token,
  body: {
    kind: "verification",
    creatorId: creator.json?.id,
    reason: "Please review my creator proof.",
    idempotencyKey: key("verify"),
  },
});
step(
  "creator profile, proof and verification request are accepted",
  creator.status === 200 &&
    submitted.json?.state === "pending" &&
    report.status < 300,
  [creator, proof, submitted, report].map(describe).join(", "),
);

// The development ops supervisor approves through the trust API.
const begun = await call("POST", "/v1/identity/continue", {
  body: { returnTo: "/ops" },
});
const ops = (
  await call("POST", "/v1/identity/complete", {
    body: {
      continuationId: begun.json.continuationId,
      code: "10000000-0000-4000-8000-000000000004",
    },
  })
).json.token;
const cases =
  (await call("GET", "/v1/trust/cases?queue=verification", { token: ops })).json
    ?.items ?? [];
const found =
  cases.find((item) => JSON.stringify(item).includes(creator.json?.id)) ??
  cases[0];
const access = await call("POST", `/v1/trust/cases/${found?.id}/access`, {
  token: ops,
  body: { purpose: "Review the submitted creator proof.", minutes: 15 },
});
const detail = await call("GET", `/v1/trust/cases/${found?.id}`, {
  token: ops,
});
const decision = await call("POST", `/v1/trust/cases/${found?.id}/decisions`, {
  token: ops,
  body: {
    version: detail.json?.version ?? found?.version,
    resolution: "verify_creator",
    reason: "Proof post matches the account.",
    idempotencyKey: key("decide"),
  },
});
step(
  "ops approves the verification case",
  decision.status < 300,
  `${describe(access)}, ${describe(detail)}, ${describe(decision)}`,
);
let verification;
for (let waited = 0; waited < 90 && verification !== "verified"; waited += 3) {
  verification = one(
    `SELECT verification FROM creator.creator_profile WHERE id='${creator.json?.id}'`,
  );
  if (verification !== "verified") await sleep(3000);
}
step("the creator becomes verified", verification === "verified", verification);

// Register a passkey on the virtual authenticator, in the setup page.
await page.goto(`${WEB}/studio/setup`);
await page.waitForLoadState("networkidle");
const register = page.getByRole("button", {
  name: "Register a signing passkey",
});
await register.click();
await page
  .getByText("Passkey registered")
  .waitFor({ timeout: 20_000 })
  .catch(() => {});
const credentials = () =>
  Number(
    one(
      `SELECT count(*) FROM creator.passkey_credential WHERE account_id=(SELECT account_id FROM creator.creator_profile WHERE id='${creator.json?.id}') AND revoked_at IS NULL`,
    ),
  );
step(
  "a passkey is registered from a fresh sign-in",
  credentials() === 1,
  `${credentials()} credentials`,
);

// An older session must sign in again first; the page offers it in place.
sql(
  `UPDATE creator.identity_session SET created_at=now()-interval '10 minutes' WHERE token_hash=encode(sha256('${token}'::bytea),'hex')`,
);
await page.reload();
await page.waitForLoadState("networkidle");
await register.click();
const google = page.getByRole("link", { name: "Continue with Google" });
await google.waitFor({ timeout: 15_000 }).catch(() => {});
step(
  "a session older than five minutes is asked to sign in again, in place",
  await google.isVisible(),
  await page
    .locator("[role=alert]")
    .innerText()
    .catch(() => ""),
);
await google.click();
await page.getByLabel("Test person").fill(sub);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForLoadState("networkidle");
// The navigation config asks a person without a fan handle to pick one before
// /studio/setup (it is not exempt); a person would do so here.
if (new URL(page.url()).pathname === "/onboarding/handle") {
  note(
    "asked for a fan handle on the way back (navigation config, not this change)",
  );
  await page.locator("#handle").fill(`fan${Date.now() % 1e8}`);
  await page.locator("button.handle-continue").click();
  await page.waitForURL("**/studio/setup", { timeout: 20_000 }).catch(() => {});
}
step(
  "the fresh sign-in returns to the setup page",
  new URL(page.url()).pathname === "/studio/setup",
  page.url(),
);
// A second passkey lives on a second device: the first one already holds an
// excluded credential, and WebAuthn rightly refuses to register it twice.
await cdp.send("WebAuthn.removeVirtualAuthenticator", {
  authenticatorId: first.authenticatorId,
});
await device();
await page.getByRole("button", { name: "Register a signing passkey" }).click();
await page
  .getByText("Passkey registered")
  .waitFor({ timeout: 20_000 })
  .catch(() => {});
step(
  "a second passkey, on a second device, is registered after it",
  credentials() === 2,
  `${credentials()} credentials ${await page
    .locator("[role=alert]")
    .innerText()
    .catch(() => "")}`,
);
note(`backend ${API}, web ${WEB}`);
await browser.close();
finish();
