#!/usr/bin/env node
// The sign-in wording approved for option D (founder, 2026-10-15): people
// who sign in with Apple or Google no longer read "Continue with Pantopus"
// when a session ends or needs refreshing. Checks each message a person can
// reach on a development stack, at the API and on the studio setup page.
// Fakes: Apple (fake-provider.mjs), the development identity for Maya, the
// clock (one session's age moved back), and a provider grant withdrawn in the
// lane's own database (Apple's withdrawal notices are not connected yet).
// Needs the lane stack with sign-in on and the web app, fresh (the last step
// starts Maya's signing-key recovery):
//   node tests/scenarios/lane-1/e1-sign-in-wording.mjs
import { chromium } from "@playwright/test";
import {
  call,
  confirmAge,
  describe,
  one,
  person,
  reporter,
  sha256,
  sql,
  webSignIn,
  yearsAgo,
} from "./sign-in-lib.mjs";

const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const SESSION = `qelvora_session_${new URL(WEB).port}`;
const { step, finish } = reporter();
const said = (r, code, message) =>
  r.json?.error?.code === code && r.json?.error?.message === message;
async function apple(label) {
  const first = await webSignIn("apple", person(label));
  const done =
    first.json?.status === "age_required"
      ? await confirmAge(first, yearsAgo(29))
      : first;
  return done.json?.completion?.token;
}

const none = await call("GET", "/v1/identity/session");
step(
  "no session: “Sign in to use this app.”",
  none.status === 401 &&
    said(none, "session_required", "Sign in to use this app."),
  `${describe(none)}: ${none.json?.error?.message}`,
);

const ended = await apple("wording-ended");
await call("POST", "/v1/identity/revoke-sessions", { token: ended, body: {} });
const afterEnd = await call("GET", "/v1/identity/session", { token: ended });
step(
  "an ended Apple session: “Your session ended. Sign in again.”",
  afterEnd.status === 401 &&
    said(afterEnd, "session_expired", "Your session ended. Sign in again."),
  `${describe(afterEnd)}: ${afterEnd.json?.error?.message}`,
);

const withdrawn = await apple("wording-withdrawn");
const account = (
  await call("GET", "/v1/identity/session", { token: withdrawn })
).json?.accountId;
sql(
  `UPDATE creator.identity_grant SET revoked_at=now() WHERE account_id='${account}'`,
);
const afterWithdraw = await call("GET", "/v1/identity/session", {
  token: withdrawn,
});
step(
  "a withdrawn Apple grant: “Your sign-in could not be confirmed. Sign in again.”",
  afterWithdraw.status === 401 &&
    said(
      afterWithdraw,
      "authorization_ended",
      "Your sign-in could not be confirmed. Sign in again.",
    ),
  `${describe(afterWithdraw)}: ${afterWithdraw.json?.error?.message}`,
);

// Maya (the development creator) on the setup page with an older session.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ locale: "en-US" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  },
});
await page.goto(`${WEB}/auth/continue?returnTo=%2Fstudio%2Fsetup`);
await page.getByRole("link", { name: "Continue with Pantopus" }).click();
await page.getByRole("button", { name: "Development actor three" }).click();
await page.waitForLoadState("networkidle");
if (new URL(page.url()).pathname === "/onboarding/handle") {
  await page.locator("#handle").fill(`mayafan${Date.now() % 1e6}`);
  await page.locator("button.handle-continue").click();
  await page.waitForURL("**/studio/setup", { timeout: 20_000 }).catch(() => {});
}
const maya = (await context.cookies(WEB)).find(
  (c) => c.name === SESSION,
)?.value;
sql(
  `UPDATE creator.identity_session SET created_at=now()-interval '10 minutes' WHERE token_hash='${sha256(maya)}'`,
);
const begin = await call("POST", "/v1/identity/passkeys/begin", {
  token: maya,
  body: {},
});
step(
  "an older session changing passkeys: “Sign in again before changing passkeys.”",
  begin.status === 403 &&
    said(
      begin,
      "fresh_identity_required",
      "Sign in again before changing passkeys.",
    ),
  `${describe(begin)}: ${begin.json?.error?.message}`,
);
await page.goto(`${WEB}/studio/setup`);
await page.waitForLoadState("networkidle");
const register = page.getByRole("button", {
  name: "Register a signing passkey",
});
const verified =
  one(
    "SELECT verification FROM creator.creator_profile WHERE id='20000000-0000-4000-8000-000000000001'",
  ) === "verified";
const shown = page
  .getByRole("alert")
  .filter({ hasText: "before changing passkeys" })
  .first();
if (verified) {
  await register.click();
  await shown.waitFor({ timeout: 15_000 }).catch(() => {});
}
const alert = await shown.innerText().catch(() => "");
const pageText = alert
  ? ""
  : (
      await page
        .locator("main")
        .innerText()
        .catch(() => "")
    ).slice(-300);
step(
  "the setup page shows that message, without “Pantopus”",
  verified &&
    alert.includes("Sign in again before changing passkeys.") &&
    !alert.includes("Pantopus"),
  verified
    ? (alert || `no alert; page ends: ${pageText}`)
        .replace(/\s+/gu, " ")
        .slice(0, 300)
    : "Maya is not verified",
);

// The setup page's first step, and the ops console's sign-in link when
// signed out (founder, 2026-10-15, in #461).
const main = (await page.locator("main").innerText()).replace(/\s+/gu, " ");
step(
  "the setup page's first step reads “Sign in”",
  /1 Sign in 2 Prove it’s you/u.test(main),
  main.match(/1 .{0,40}2 Prove/u)?.[0] ?? main.slice(0, 120),
);
const visitor = await (await browser.newContext({ locale: "en-US" })).newPage();
await visitor.goto(`${WEB}/ops`);
await visitor.waitForLoadState("networkidle");
const opsLinks = await visitor.getByRole("link").allInnerTexts();
step(
  "the ops console, signed out, offers “Sign in”",
  opsLinks.includes("Sign in") &&
    !opsLinks.some((text) => text.includes("Pantopus")),
  opsLinks.join(" · ").slice(0, 160),
);

// A fresh sign-in, then signing-key recovery: its notice (this starts Maya's
// recovery, so run on a fresh stack).
await page.goto(`${WEB}/auth/continue?returnTo=%2Fstudio%2Fsetup`);
await page.getByRole("link", { name: "Continue with Pantopus" }).click();
await page.getByRole("button", { name: "Development actor three" }).click();
await page.waitForLoadState("networkidle");
await page.goto(`${WEB}/studio/setup`);
await page.waitForLoadState("networkidle");
await page.getByText("Lost your signing device?").click();
await page.getByRole("button", { name: "Start signing-key recovery" }).click();
const started = page.getByText("Recovery started.", { exact: false }).first();
await started.waitFor({ timeout: 15_000 }).catch(() => {});
const notice = await started.innerText().catch(() => "");
step(
  "recovery: “Recovery started. Sign in again, then submit fresh creator proof.”",
  notice.includes(
    "Recovery started. Sign in again, then submit fresh creator proof.",
  ) && !notice.includes("Pantopus"),
  notice.replace(/\s+/gu, " ").slice(0, 160),
);
await browser.close();
finish();
