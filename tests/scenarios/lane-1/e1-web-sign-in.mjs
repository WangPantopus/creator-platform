#!/usr/bin/env node
// E1.1, E1.2 and E1.3 in a real browser (system Chrome through Playwright, a
// throwaway profile): the web sign-in with the fake Apple and Google, the age
// screen, the adults-only page, a forced callback, cross-origin posts and the
// rate-limit message. Needs the stack with the web app and QELVORA_SIGN_IN.
//   node tests/scenarios/lane-1/e1-web-sign-in.mjs
import { chromium } from "@playwright/test";
import {
  call,
  one,
  person,
  reporter,
  sha256,
  yearsAgo,
} from "./sign-in-lib.mjs";

const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const SESSION = `qelvora_session_${new URL(WEB).port}`;
const AGE = `qelvora_age_${new URL(WEB).port}`;
const { step, note, finish } = reporter();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const fresh = () => browser.newContext({ locale: "en-US" });
const cookie = async (context, name) =>
  (await context.cookies(WEB)).find((c) => c.name === name);

/** From a creator link to the provider's page, as a person who chose `sub`. */
async function signIn(page, provider, sub, returnTo = "/creators/maya") {
  await page.goto(
    `${WEB}/auth/continue?returnTo=${encodeURIComponent(returnTo)}`,
  );
  await page
    .getByRole("link", {
      name:
        provider === "apple" ? "Continue with Apple" : "Continue with Google",
    })
    .click();
  await page.getByLabel("Test person").fill(sub);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
}
async function answerAge(page, date) {
  await page.locator("#birth-date").fill(date);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForLoadState("networkidle");
}

// The sign-in page offers both providers, in the approved words.
const first = await fresh();
const page = await first.newPage();
await page.goto(`${WEB}/auth/continue?returnTo=%2Fcreators%2Fmaya`);
const labels = await page.getByRole("link").allInnerTexts();
step(
  "the sign-in page offers Apple, then Google",
  labels.indexOf("Continue with Apple") >= 0 &&
    labels.indexOf("Continue with Apple") <
      labels.indexOf("Continue with Google"),
  labels.join(" | "),
);

// Google: provider, age screen, then the destination's onboarding.
const googleSub = person("web-google");
await signIn(page, "google", googleSub);
step(
  "a new person reaches the age screen",
  new URL(page.url()).pathname === "/auth/age" &&
    (await page
      .getByRole("heading", { name: "Your date of birth" })
      .isVisible()),
  page.url(),
);
const ageText = await page.locator("main").innerText();
step(
  "the age screen does not say what age is needed",
  !/18|eighteen|adult/iu.test(ageText) &&
    ageText.includes(
      "We keep only whether you can use the app, never the date.",
    ),
);
step(
  "no session exists before the age step",
  !(await cookie(first, SESSION)) && Boolean(await cookie(first, AGE)),
);
await answerAge(page, yearsAgo(30));
const session = await cookie(first, SESSION);
step(
  "an adult lands on onboarding with their destination kept",
  new URL(page.url()).pathname === "/onboarding/handle" &&
    new URL(page.url()).searchParams.get("returnTo") === "/creators/maya",
  page.url(),
);
step(
  "the session cookie is httpOnly and SameSite=Lax",
  session?.httpOnly === true &&
    session?.sameSite === "Lax" &&
    !(await cookie(first, AGE)),
);
step(
  "it is a Qelvora session in the database",
  one(
    `SELECT mode FROM creator.identity_session WHERE token_hash='${sha256(session?.value ?? "")}'`,
  ) === "qelvora",
);
const me = await call("GET", "/v1/identity/session", { token: session?.value });
step(
  "the backend knows the session's account",
  me.status === 200 && me.json.mode === "qelvora",
);
await first.close();

// Apple: the cross-site form post must still complete in the starting browser.
const appleContext = await fresh();
const applePage = await appleContext.newPage();
await signIn(applePage, "apple", person("web-apple"));
step(
  "Apple's form post comes back to the age screen",
  new URL(applePage.url()).pathname === "/auth/age",
  applePage.url(),
);
await answerAge(applePage, yearsAgo(22));
step(
  "and an adult is signed in",
  Boolean(await cookie(appleContext, SESSION)) &&
    new URL(applePage.url()).pathname === "/onboarding/handle",
);
await appleContext.close();

// Returning adult: straight through, no age screen.
const back = await fresh();
const backPage = await back.newPage();
await signIn(backPage, "google", googleSub);
step(
  "a returning adult skips the age screen",
  new URL(backPage.url()).pathname !== "/auth/age" &&
    Boolean(await cookie(back, SESSION)),
  backPage.url(),
);
await back.close();

// Under 18: the adults-only page, nothing signed in, and no second try.
const minorSub = person("web-minor");
const minor = await fresh();
const minorPage = await minor.newPage();
await signIn(minorPage, "google", minorSub);
await answerAge(minorPage, yearsAgo(16));
const minorText = await minorPage.locator("main").innerText();
step(
  "under 18 sees the designed page",
  new URL(minorPage.url()).pathname === "/auth/adults-only" &&
    minorText.includes("This app is for adults") &&
    minorText.includes("This app is available to adults aged 18 and over."),
  minorPage.url(),
);
step(
  "with no session and only the under-18 policy link",
  !(await cookie(minor, SESSION)) &&
    (await minorPage.locator("main a").count()) === 1 &&
    (await minorPage.locator("main a").getAttribute("href")) ===
      "/auth/under-18",
);
await minorPage.locator('main a[href="/auth/under-18"]').click();
step(
  "the under-18 policy opens without a session or product links",
  new URL(minorPage.url()).pathname === "/auth/under-18" &&
    !(await cookie(minor, SESSION)) &&
    (await minorPage.locator("main a").count()) === 0,
);
await signIn(minorPage, "google", minorSub);
step(
  "signing in again goes straight to the adults-only page",
  new URL(minorPage.url()).pathname === "/auth/adults-only",
  minorPage.url(),
);
await minor.close();

// A callback forced into another browser is refused there.
const attacker = await fresh();
const attackerPage = await attacker.newPage();
await attackerPage.route("**/api/auth/callback/google**", (route) =>
  route.abort(),
);
const callback = attackerPage.waitForRequest("**/api/auth/callback/google**");
await signIn(attackerPage, "google", person("attacker")).catch(() => {});
const forced = (await callback).url();
const victim = await fresh();
const victimPage = await victim.newPage();
await victimPage.goto(forced);
step(
  "an attacker's callback opened in a victim's browser is refused",
  new URL(victimPage.url()).pathname === "/auth/continue" &&
    (await victimPage.locator("main").innerText()).includes(
      "This sign-in could not be completed. Start again.",
    ) &&
    !(await cookie(victim, SESSION)),
);
await attacker.close();

// Cross-origin posts are refused.
const crossAge = await victim.request.post(`${WEB}/api/auth/age`, {
  headers: { Origin: "https://evil.example" },
  form: { birthDate: "1990-01-01" },
  maxRedirects: 0,
});
step(
  "a cross-origin age post is refused",
  crossAge.status() === 403,
  String(crossAge.status()),
);
const crossComplete = await victim.request.post(`${WEB}/api/auth/complete`, {
  headers: { Origin: "https://evil.example" },
  form: { continuationId: "x", code: "x" },
  maxRedirects: 0,
});
step(
  "a cross-origin completion is refused",
  crossComplete.status() === 403,
  String(crossComplete.status()),
);
await victim.close();

// The start limit, as the person sees it (one address named by the edge).
const busy = await browser.newContext({
  extraHTTPHeaders: { "X-Forwarded-For": `198.51.100.${Date.now() % 250}` },
});
const busyPage = await busy.newPage();
let last;
for (let i = 0; i < 21; i += 1) {
  last = await busyPage
    .goto(`${WEB}/api/auth/start?provider=google&returnTo=%2Fhome`, {
      waitUntil: "commit",
    })
    .catch(() => null);
}
await busyPage.goto(`${WEB}/api/auth/start?provider=google&returnTo=%2Fhome`);
note(`last start answered ${last?.status() ?? "no response"}`);
step(
  "past the limit the page says to wait",
  (await busyPage.locator("main").innerText()).includes(
    "Too many sign-in attempts. Wait a minute and try again.",
  ),
  busyPage.url(),
);
await busy.close();
await browser.close();
finish();
