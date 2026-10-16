#!/usr/bin/env node
// E1.5 end to end for a creator who signs in with Apple (option D), in a real
// browser: the web sign-in and age step, a creator profile, proof approved by
// the development ops supervisor through the trust API (standing in for the
// console), a passkey on a virtual authenticator, a Note signed and published
// in the studio, and its public verification page. Edges:
//   - a fan without a membership does not see the members-only Note;
//   - another Apple account cannot sign for this creator;
//   - the same signed publication sent again publishes once;
//   - after "sign out everywhere" the old session cannot publish a signature
//     it made; the creator's next session can, inside the five minutes (a
//     signature belongs to the passkey, not to a session);
//   - with STACK_UP_ARGS (the JSON list of `stack up` options), a signature
//     made before a backend restart still publishes inside its five minutes;
//   - a session older than five minutes signs in with Apple again, in place,
//     before a passkey change (the session's age is moved back in the lane's
//     own database: the clock is the faked edge).
// Fakes: Apple (fake-provider.mjs), the development ops supervisor, the
// virtual authenticator.
//   node tests/scenarios/lane-1/e1-5-apple-creator.mjs
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import {
  call,
  describe,
  one,
  person,
  reporter,
  sha256,
  sleep,
  sql,
  webSignIn,
  confirmAge,
  yearsAgo,
} from "./sign-in-lib.mjs";

const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const SESSION = `qelvora_session_${new URL(WEB).port}`;
const { step, skip, finish } = reporter();
const key = (label) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const quote = (value) => `'${String(value).replace(/'/gu, "''")}'`;

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
// The studio's own requests, so the edges below replay exactly what it sends.
const sent = { begin: [], publish: [] };
page.on("request", (request) => {
  const url = request.url();
  if (url.includes("/signed-acts/begin"))
    sent.begin.push({ url, body: request.postData() });
  if (/\/publish$/u.test(new URL(url).pathname))
    sent.publish.push({ url, body: request.postData() });
});
async function apple(sub) {
  await page.getByLabel("Test person").fill(sub);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
}
async function handleStep() {
  // The navigation config asks a person without a fan handle to pick one first.
  if (new URL(page.url()).pathname === "/onboarding/handle") {
    await page.locator("#handle").fill(`fan${Date.now() % 1e8}`);
    await page.locator("button.handle-continue").click();
    await page
      .waitForURL("**/studio/setup", { timeout: 20_000 })
      .catch(() => {});
  }
}
// The web app's proxy paths, as the backend serves them.
const apiPath = (url) =>
  new URL(url).pathname
    .replace(/^\/api\/platform\//u, "/v1/")
    .replace(/^\/api\//u, "/v1/");
const token = async () =>
  (await context.cookies(WEB)).find((c) => c.name === SESSION)?.value;

// Sign in with Apple on the web, answer the age step, become a creator.
const sub = person("apple-creator");
await page.goto(`${WEB}/auth/continue?returnTo=%2Fstudio%2Fsetup`);
await page.getByRole("link", { name: "Continue with Apple" }).first().click();
await apple(sub);
await page.locator("#birth-date").fill(yearsAgo(31));
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForLoadState("networkidle");
await handleStep();
let creatorToken = await token();
const session = await call("GET", "/v1/identity/session", {
  token: creatorToken,
});
const account = session.json?.accountId;
step(
  "the creator signs in with Apple, passes the age step and reaches the studio setup",
  Boolean(creatorToken) &&
    session.json?.mode === "qelvora" &&
    new URL(page.url()).pathname === "/studio/setup" &&
    one(
      `SELECT provider FROM creator.account_identity WHERE account_id=${quote(account)}`,
    ) === "apple",
  `${describe(session)} ${page.url()}`,
);
const displayName = `Apple Kiln ${Date.now() % 1e5}`;
const creator = await call("POST", "/v1/identity/creator-profile", {
  token: creatorToken,
  body: { handle: `ak${Date.now() % 1e8}`, displayName },
});
const creatorId = creator.json?.id;
const proof = await call("POST", `/v1/identity/${creatorId}/proof`, {
  token: creatorToken,
  body: {
    platform: "instagram",
    accountUrl: "https://instagram.com/apple_kiln",
  },
});
const submitted = await call(
  "POST",
  `/v1/identity/proof/${proof.json?.id}/submit`,
  {
    token: creatorToken,
    body: { postUrl: `https://instagram.com/p/${proof.json?.code ?? "x"}` },
  },
);
const report = await call("POST", "/v1/trust/reports", {
  token: creatorToken,
  body: {
    kind: "verification",
    creatorId,
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
const open = (
  (await call("GET", "/v1/trust/cases?queue=verification", { token: ops })).json
    ?.items ?? []
).filter((item) => item.state === "open");
for (const found of open) {
  await call("POST", `/v1/trust/cases/${found.id}/access`, {
    token: ops,
    body: { purpose: "Review the submitted creator proof.", minutes: 15 },
  });
  const detail = await call("GET", `/v1/trust/cases/${found.id}`, {
    token: ops,
  });
  await call("POST", `/v1/trust/cases/${found.id}/decisions`, {
    token: ops,
    body: {
      version: detail.json?.version,
      resolution: "verify_creator",
      reason: "Proof post matches the account.",
      idempotencyKey: key("decide"),
    },
  });
}
let verification;
for (let waited = 0; waited < 90 && verification !== "verified"; waited += 3) {
  verification = one(
    `SELECT verification FROM creator.creator_profile WHERE id=${quote(creatorId)}`,
  );
  if (verification !== "verified") await sleep(3000);
}
step(
  "ops approves and the creator becomes verified",
  verification === "verified",
  `${open.length} open cases, ${verification}`,
);

// A passkey on this device, from the setup page.
const keys = () =>
  Number(
    one(
      `SELECT count(*) FROM creator.passkey_credential WHERE account_id=${quote(account)} AND revoked_at IS NULL`,
    ),
  );
await page.goto(`${WEB}/studio/setup`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Register a signing passkey" }).click();
await page
  .getByText("Passkey registered")
  .waitFor({ timeout: 20_000 })
  .catch(() => {});
step("a signing passkey is registered", keys() === 1, `${keys()} keys`);

// Sign and publish a Note in the studio.
const acts = () =>
  sql(
    `SELECT sa.id,(SELECT count(*) FROM creator.signed_publication p WHERE p.signed_act_id=sa.id) FROM creator.signed_act sa WHERE sa.account_id=${quote(account)} ORDER BY sa.verified_at DESC`,
  );
async function signNote(text, { cutPublish = false } = {}) {
  await page.goto(`${WEB}/studio/${creatorId}/compose`);
  await page.waitForLoadState("networkidle");
  await page.locator("#note-text").fill(text);
  await page.getByRole("button", { name: "Review and sign" }).click();
  if (cutPublish)
    await page.route("**/publish", (route) => route.abort("connectionreset"));
  await page.getByRole("button", { name: "Sign with your passkey" }).click();
  if (cutPublish)
    await page
      .getByText("The publication response is pending")
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
  else
    await page
      .locator("dialog[open], [role=dialog]")
      .first()
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => {});
  if (cutPublish) await page.unroute("**/publish");
  return acts()[0]?.[0];
}
const noteText = `First firing of the season ${Date.now()}`;
const act = await signNote(noteText);
const [, publications] = acts().find(([id]) => id === act) ?? [];
const published = sql(
  `SELECT a.act_type,v.key_revoked,v.creator_revoked,p.withdrawn_at IS NULL FROM creator.signed_act a JOIN creator.signed_verification v ON v.id=a.id JOIN creator.signed_publication p ON p.signed_act_id=a.id WHERE a.id=${quote(act)}`,
)[0];
step(
  "the Note is signed with the passkey and published once",
  Boolean(act) && publications === "1" && published?.[1] === "f",
  `${act} ${published?.join(",")}`,
);
const status = await call("GET", `/v1/identity/signed-acts/${act}`);
step(
  "its signature reads valid through the API",
  status.json?.status === "valid",
  describe(status),
);
const visitor = await browser.newContext({ locale: "en-US" });
const verifyPage = await visitor.newPage();
await verifyPage.goto(`${WEB}/verify/${act}`);
await verifyPage.waitForLoadState("networkidle");
const verifyText = await verifyPage.locator("main").innerText();
step(
  "the public verification page shows a valid Note signature by this creator",
  verifyText.includes("Valid when checked") &&
    verifyText.includes("Note · one-to-many") &&
    verifyText.includes(displayName),
  verifyText.replace(/\s+/gu, " ").slice(0, 200),
);

// A fan, also signed in with Apple, reads the Note.
const fanSub = person("apple-fan");
const fanFirst = await webSignIn("apple", fanSub);
const fanDone =
  fanFirst.json?.status === "age_required"
    ? await confirmAge(fanFirst, yearsAgo(26))
    : fanFirst;
const fanToken = fanDone.json?.completion?.token;
const fanProfile = await call("POST", "/v1/identity/fan-profile", {
  token: fanToken,
  body: { handle: `af${Date.now() % 1e8}`, intro: "" },
});
const feed = await call("GET", `/v1/content/${creatorId}`, {
  token: fanToken,
});
const audience = one(
  `SELECT string_agg(DISTINCT audience->>'kind',',') FROM creator.content_index WHERE creator_id=${quote(creatorId)} AND state='published'`,
);
step(
  "a fan who signs in with Apple but holds no membership does not see the members-only Note",
  fanProfile.status === 200 &&
    feed.status === 200 &&
    audience === "members" &&
    !JSON.stringify(feed.json).includes(noteText),
  `audience ${audience}, fan profile ${describe(fanProfile)}, feed ${describe(feed)} with ${feed.json?.items?.length} items`,
);
skip(
  "a follower reads a Note for followers",
  "following needs the creator's public page, published through the AI publication worker that development stacks do not run, and growth (lanes 3 and 5)",
);

// Wrong person: the fan replays the creator's signing request. Its refusal
// code shows the route and body were real (a wrong path answers 404).
const begin = sent.begin.at(-1);
const stolen = begin
  ? await call("POST", apiPath(begin.url), {
      token: fanToken,
      body: JSON.parse(begin.body ?? "{}"),
    })
  : undefined;
step(
  "another Apple account cannot start a signature for this creator",
  stolen?.status === 403 &&
    stolen.json?.error?.code === "creator_role_required",
  begin ? `${describe(stolen)} at ${apiPath(begin.url)}` : "no request seen",
);

// Repeat: the same signed publication sent again publishes once.
const publish = sent.publish.at(-1);
const publishPath = publish ? apiPath(publish.url) : undefined;
const again = publish
  ? await call("POST", publishPath, {
      token: creatorToken,
      body: JSON.parse(publish.body ?? "{}"),
    })
  : undefined;
step(
  "sending the same signed publication again publishes nothing new",
  again &&
    one(
      `SELECT count(*) FROM creator.signed_publication WHERE signed_act_id=${quote(act)}`,
    ) === "1",
  again ? `${describe(again)} at ${publishPath}` : "no request seen",
);

// Sign out everywhere between signing and publishing.
const beforeSignOut = await signNote(`Kiln log ${Date.now()}`, {
  cutPublish: true,
});
const cut = sent.publish.at(-1);
const cutPath = cut ? apiPath(cut.url) : undefined;
const signOut = await call("POST", "/v1/identity/revoke-sessions", {
  token: creatorToken,
  body: {},
});
const oldSession = cut
  ? await call("POST", cutPath, {
      token: creatorToken,
      body: JSON.parse(cut.body ?? "{}"),
    })
  : undefined;
const publicationsOf = (id) =>
  one(
    `SELECT count(*) FROM creator.signed_publication WHERE signed_act_id=${quote(id)}`,
  );
step(
  "after sign out everywhere the old session cannot publish its signature",
  signOut.status < 300 &&
    oldSession?.status === 401 &&
    publicationsOf(beforeSignOut) === "0",
  `sign-out ${describe(signOut)}, publish ${oldSession ? describe(oldSession) : "not sent"}`,
);
await page.goto(`${WEB}/auth/continue?returnTo=%2Fstudio%2Fsetup`);
await page.getByRole("link", { name: "Continue with Apple" }).first().click();
await apple(sub);
await handleStep();
creatorToken = await token();
const nextSession = cut
  ? await call("POST", cutPath, {
      token: creatorToken,
      body: JSON.parse(cut.body ?? "{}"),
    })
  : undefined;
step(
  "the creator's next Apple session can publish it, inside the five minutes",
  Boolean(creatorToken) &&
    nextSession?.status < 300 &&
    publicationsOf(beforeSignOut) === "1",
  nextSession ? describe(nextSession) : "not sent",
);

// A restart between signing and publishing, inside the five minutes.
if (process.env.STACK_UP_ARGS) {
  const beforeRestart = await signNote(`Glaze notes ${Date.now()}`, {
    cutPublish: true,
  });
  const held = sent.publish.at(-1);
  execFileSync(
    "node",
    [
      "infra/local/stack.mjs",
      "stop",
      "--lane",
      process.env.QELVORA_LANE ?? "1",
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "node",
    ["infra/local/stack.mjs", "up", ...JSON.parse(process.env.STACK_UP_ARGS)],
    { stdio: "ignore" },
  );
  const after = await call("POST", apiPath(held.url), {
    token: creatorToken,
    body: JSON.parse(held.body ?? "{}"),
  });
  step(
    "a signature made before a backend restart publishes after it",
    after.status < 300 && publicationsOf(beforeRestart) === "1",
    describe(after),
  );
} else
  skip(
    "a signature made before a backend restart publishes after it",
    "set STACK_UP_ARGS to restart the stack",
  );

// A session older than five minutes signs in with Apple again before a
// second passkey (on a second device: WebAuthn refuses a second credential
// on the same authenticator).
sql(
  `UPDATE creator.identity_session SET created_at=now()-interval '10 minutes' WHERE token_hash=${quote(sha256(creatorToken))}`,
);
await cdp.send("WebAuthn.removeVirtualAuthenticator", {
  authenticatorId: first.authenticatorId,
});
await device();
await page.goto(`${WEB}/studio/setup`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Register a signing passkey" }).click();
const again5 = page.getByRole("link", { name: "Continue with Apple" });
await again5.waitFor({ timeout: 15_000 }).catch(() => {});
const offered = await again5.isVisible();
if (offered) {
  await again5.click();
  await apple(sub);
  await handleStep();
}
step(
  "an older session is offered Apple again in place and returns to the setup page",
  offered && new URL(page.url()).pathname === "/studio/setup",
  page.url(),
);
await page.getByRole("button", { name: "Register a signing passkey" }).click();
await page
  .getByText("Passkey registered")
  .waitFor({ timeout: 20_000 })
  .catch(() => {});
step(
  "after the fresh Apple sign-in a second passkey is registered",
  keys() === 2,
  `${keys()} keys`,
);
await browser.close();
finish();
