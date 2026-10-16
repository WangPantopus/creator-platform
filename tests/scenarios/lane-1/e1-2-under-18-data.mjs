#!/usr/bin/env node
// E1.2 and WP 1.9: what is kept when the age step says under 18 (founder's
// default, 2026-10-16). Kept: the age lock (a keyed hash of the provider
// identity) and the under-18 result, never a date. Gone: the email, an Apple
// refresh token (revoked at Apple first; a failed revocation keeps it), every
// grant, and the account (closed). Also the policy page for younger people,
// linked from the under-18 state. Fakes: Apple and Google (fake-provider.mjs).
// Needs the lane stack with sign-in on, the web app and the fake provider:
//   node tests/scenarios/lane-1/e1-2-under-18-data.mjs
import { chromium } from "@playwright/test";
import {
  FAKE,
  call,
  confirmAge,
  describe,
  nativeSignIn,
  one,
  person,
  reporter,
  sql,
  webSignIn,
  yearsAgo,
} from "./sign-in-lib.mjs";

const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const { step, finish } = reporter();
const control = (body) => call("POST", "/__control", { base: FAKE, body });
const fake = async () => (await call("GET", "/__stats", { base: FAKE })).json;
const tokensOf = (stats, sub) =>
  stats.refreshTokens.filter((item) => item.sub === sub);
const accountOf = (first) =>
  one(
    `SELECT account_id FROM creator.sign_in_continuation WHERE id='${first.json?.ageConfirmation?.ageContinuationId}'`,
  );
const kept = (accountId) =>
  sql(
    `SELECT a.state,a.deleted_at IS NOT NULL,
     (SELECT count(*) FROM creator.account_identity i WHERE i.account_id=a.id AND i.email_cipher IS NOT NULL),
     (SELECT count(*) FROM creator.account_identity i WHERE i.account_id=a.id AND i.provider_refresh_cipher IS NOT NULL),
     (SELECT count(*) FROM creator.identity_grant g WHERE g.account_id=a.id AND g.revoked_at IS NULL),
     (SELECT count(*) FROM creator.age_lock l JOIN creator.account_identity i ON i.provider=l.provider AND i.subject_hmac=l.subject_hmac WHERE i.account_id=a.id),
     (SELECT count(*) FROM creator.age_signal s WHERE s.account_id=a.id AND s.result='under_18')
     FROM creator.account a WHERE a.id='${accountId}'`,
  )[0]?.join(",");
const minorDate = yearsAgo(15);

await control({ mode: "ok", googleRefresh: false });

// A 15-year-old signs in with Apple on the web, with an email.
const subA = person("minor-apple");
const firstA = await webSignIn("apple", subA, {
  claims: { email: `${subA}@privaterelay.example` },
});
const accountA = accountOf(firstA);
const ageA = await confirmAge(firstA, minorDate);
const tokensA = tokensOf(await fake(), subA);
step(
  "under 18 with Apple: refused with the adults-only answer",
  ageA.status === 403 &&
    ageA.json?.error?.code === "adult_eligibility_required",
  describe(ageA),
);
step(
  "kept: the lock and the under-18 result; gone: the email, the token (revoked at Apple), grants; the account closed",
  kept(accountA) === "deleted,t,0,0,0,1,1" &&
    tokensA.length === 1 &&
    tokensA.every((item) => item.revoked),
  `${kept(accountA)}; Apple token revoked ${tokensA.map((t) => t.revoked).join(",")}`,
);
const dates = one(
  `SELECT count(*) FROM creator.age_signal s WHERE s.account_id='${accountA}' AND (s::text LIKE '%${minorDate}%')`,
);
step("no date of birth is stored", dates === "0");
const againA = await webSignIn("apple", subA);
step(
  "the same Apple ID is refused at once next time, and no new account is made",
  againA.status === 403 &&
    againA.json?.error?.code === "adult_eligibility_required" &&
    one(
      `SELECT count(*) FROM creator.account_identity i JOIN creator.account a ON a.id=i.account_id WHERE a.id<>'${accountA}' AND i.subject_hmac=(SELECT subject_hmac FROM creator.account_identity WHERE account_id='${accountA}')`,
    ) === "0",
  describe(againA),
);

// An adult date, but the phone's platform signal says under 18 (Google).
const subB = person("minor-signal");
const firstB = await nativeSignIn(subB, {
  claims: { email: `${subB}@example.com` },
});
const accountB = accountOf(firstB);
const ageB = await confirmAge(firstB, yearsAgo(25), {
  source: "google_play_age_signals",
  under18: true,
});
step(
  "a platform signal under 18 wins over an adult date: same answer, same minimal record",
  ageB.status === 403 &&
    ageB.json?.error?.code === "adult_eligibility_required" &&
    kept(accountB) === "deleted,t,0,0,0,1,1",
  `${describe(ageB)}; ${kept(accountB)}`,
);

// Apple is down when the minor answers: the answer stands, the token is kept.
const subC = person("minor-apple-down");
const firstC = await webSignIn("apple", subC, {
  claims: { email: `${subC}@privaterelay.example` },
});
const accountC = accountOf(firstC);
await control({ mode: "down" });
const ageC = await confirmAge(firstC, minorDate);
await control({ mode: "ok" });
step(
  "Apple down: still refused; the email is erased and the account closed, the unrevoked token kept",
  ageC.status === 403 &&
    kept(accountC) === "deleted,t,0,1,0,1,1" &&
    tokensOf(await fake(), subC).every((item) => !item.revoked),
  `${describe(ageC)}; ${kept(accountC)}`,
);

// An adult is unaffected.
const subD = person("adult-apple");
const firstD = await webSignIn("apple", subD, {
  claims: { email: `${subD}@privaterelay.example` },
});
const accountD = accountOf(firstD);
const ageD = await confirmAge(firstD, yearsAgo(30));
step(
  "an adult keeps their account, email and token",
  ageD.json?.status === "signed_in" && kept(accountD) === "active,f,1,1,1,0,0",
  kept(accountD),
);

// The under-18 state links only to the policy for younger people.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ locale: "en-US" })).newPage();
await page.goto(`${WEB}/auth/adults-only`);
await page.waitForLoadState("networkidle");
const links = await page.getByRole("link").allInnerTexts();
await page
  .getByRole("link", { name: "What we keep, and what we don't" })
  .click();
await page.waitForLoadState("networkidle");
const policy = (await page.locator("main").innerText()).replace(/\s+/gu, " ");
step(
  "the under-18 page's only link opens the policy, which says what is kept and what is not",
  links.length === 1 &&
    new URL(page.url()).pathname === "/auth/under-18" &&
    policy.includes("If you're under 18") &&
    policy.includes("we erased the email address") &&
    policy.includes("We keep two things"),
  `${links.join(" · ")} → ${page.url()}`,
);
await browser.close();
finish();
