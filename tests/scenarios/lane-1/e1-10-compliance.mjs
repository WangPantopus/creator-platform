#!/usr/bin/env node
// E1.10: compliance content. Crisis resources by region (the pilot list in
// modules/trust/crisis-resources.ts) through the API and on the crisis page;
// the consent screen naming the processors before a first message; and three
// fields of the data-safety source document (docs/lanes/status/
// lane-1-data-safety.md) checked against the database. The under-18 policy
// page is checked by e1-2-under-18-data.mjs (#481). Fakes: Apple
// (fake-provider.mjs), the development identity, the model.
// Needs the lane stack with sign-in on, the web app, growth (`--growth`: the
// creator's chat page reads their public page) and the fake provider:
//   node tests/scenarios/lane-1/e1-10-compliance.mjs
import { chromium } from "@playwright/test";
import {
  call,
  confirmAge,
  describe,
  person,
  reporter,
  sql,
  webSignIn,
  yearsAgo,
} from "./sign-in-lib.mjs";

const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const { step, finish } = reporter();

// Crisis resources.
const help = await call("GET", "/v1/trust/help");
const resources = help.json?.resources ?? [];
step(
  "the help API lists crisis resources by region, each with an HTTPS link",
  help.status === 200 &&
    resources.length === 6 &&
    resources.every((r) => r.url.startsWith("https://")) &&
    resources.some(
      (r) => r.region === "United States" && /988/u.test(r.phone),
    ) &&
    resources.some((r) => r.name === "Samaritans" && r.phone === "116 123"),
  `${describe(help)}, ${resources.map((r) => r.region).join(" · ")}`,
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const visitor = await (await browser.newContext({ locale: "en-US" })).newPage();
await visitor.goto(`${WEB}/trust/crisis`);
await visitor.waitForLoadState("networkidle");
await visitor
  .getByRole("link", { name: "988 Suicide & Crisis Lifeline" })
  .waitFor({ timeout: 15_000 })
  .catch(() => {});
const crisisLinks = await visitor.getByRole("link").allInnerTexts();
step(
  "the crisis page shows them, signed out",
  ["988 Suicide & Crisis Lifeline", "Samaritans", "Find A Helpline"].every(
    (name) => crisisLinks.includes(name),
  ),
  crisisLinks.filter((t) => !/trust|help/iu.test(t)).join(" · "),
);

// The consent screen names the processors before a first message.
const fan = await (await browser.newContext({ locale: "en-US" })).newPage();
await fan.goto(`${WEB}/auth/continue?returnTo=%2Fcreators%2Fmaya%2Fchat`);
await fan.getByRole("link", { name: "Continue with Pantopus" }).click();
await fan.getByRole("button", { name: "Development actor two" }).click();
await fan.waitForLoadState("networkidle");
if (new URL(fan.url()).pathname === "/onboarding/handle") {
  await fan.locator("#handle").fill(`consentfan${Date.now() % 1e6}`);
  await fan.locator("button.handle-continue").click();
  await fan.waitForLoadState("networkidle");
}
await fan.goto(`${WEB}/creators/maya/chat`);
await fan.waitForLoadState("networkidle");
await fan
  .getByText("AI is powered by", { exact: false })
  .waitFor({ timeout: 20_000 })
  .catch(() => {});
const consent = (await fan.locator("main").innerText()).replace(/\s+/gu, " ");
const termLinks = await fan.getByRole("link").allInnerTexts();
const capabilities = (
  await call("GET", "/v1/conversations/capabilities", {
    token: (await fan.context().cookies(WEB)).find((c) =>
      c.name.startsWith("qelvora_session"),
    )?.value,
  })
).json?.providers?.providers;
const named = (capabilities ?? []).map((p) => p.name);
step(
  "before a first message, the consent screen names every processor with its terms",
  named.length > 0 &&
    consent.includes(`AI is powered by ${named.join(", ")}.`) &&
    named.every((name) => termLinks.includes(`${name} processing terms`)),
  consent.match(/Before your first message[^.]*\./u)?.[0] ?? fan.url(),
);
await browser.close();

// The data-safety document, spot-checked against the database.
const apple = await webSignIn("apple", person("datasafety"), {
  claims: { email: `${person("datasafety")}@privaterelay.example` },
});
await confirmAge(apple, yearsAgo(33));
const birth = sql(
  "SELECT table_schema||'.'||table_name||'.'||column_name FROM information_schema.columns WHERE table_schema IN('creator','growth','creator_trust') AND column_name ~* '(birth|dob)'",
);
const ageColumns = sql(
  "SELECT string_agg(column_name,',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='creator' AND table_name='age_signal'",
)[0]?.[0];
step(
  "field 1: no date of birth anywhere; an age record holds only the result",
  birth.length === 0 &&
    ageColumns === "id,account_id,source,result,copy_version,recorded_at",
  `birth columns ${birth.length}; age_signal: ${ageColumns}`,
);
const emails = sql(
  "SELECT count(*),count(*) FILTER (WHERE email_cipher LIKE '%@%') FROM creator.account_identity WHERE email_cipher IS NOT NULL",
)[0];
step(
  "field 2: the sign-in email exists only encrypted",
  Number(emails?.[0]) > 0 && emails?.[1] === "0",
  `${emails?.[0]} stored, ${emails?.[1]} readable`,
);
const sessions = sql(
  "SELECT count(*),count(*) FILTER (WHERE token_hash !~ '^[0-9a-f]{64}$'),(SELECT count(*) FROM information_schema.columns WHERE table_schema='creator' AND table_name='identity_session' AND column_name ~* 'token' AND column_name<>'token_hash') FROM creator.identity_session",
)[0];
step(
  "field 3: session tokens exist only as hashes, with no plain-token column",
  Number(sessions?.[0]) > 0 && sessions?.[1] === "0" && sessions?.[2] === "0",
  `${sessions?.[0]} sessions, ${sessions?.[1]} not hashes, ${sessions?.[2]} other token columns`,
);
finish();
