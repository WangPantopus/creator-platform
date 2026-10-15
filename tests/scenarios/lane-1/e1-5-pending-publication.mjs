#!/usr/bin/env node
// E1.5 and WP 1.5: a signed Note whose publication answer is lost, retried
// after the five-minute signature window, must not leave the composer stuck.
// Maya (the development creator) signs in, has proof approved by the
// development ops supervisor through the trust API, registers a passkey on a
// virtual authenticator, signs a Note whose publish request is cut, then
// retries after the window (moved back in the lane's own database).
//   node tests/scenarios/lane-1/e1-5-pending-publication.mjs [--probe]
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const API = process.env.QELVORA_API_URL ?? "http://127.0.0.1:56411";
const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const MAYA = "20000000-0000-4000-8000-000000000001";
const SESSION = `qelvora_session_${new URL(WEB).port}`;
const probe = process.argv.includes("--probe");
let failures = 0;
const note = (text) => console.log(`      ${text}`);
const step = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
  return ok;
};
const sql = (query) =>
  execFileSync(
    "docker",
    [
      "exec",
      "qelvora-lane1-postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "creator_stack",
      "-At",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
const key = (label) =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
async function call(method, path, token, body) {
  const response = await fetch(new URL(path, API), {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    json: await response.json().catch(() => null),
  };
}
async function developmentToken(actor) {
  const begun = await call("POST", "/v1/identity/continue", null, {
    returnTo: "/home",
  });
  return (
    await call("POST", "/v1/identity/complete", null, {
      continuationId: begun.json.continuationId,
      code: actor,
    })
  ).json.token;
}

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

// Maya signs in through the development chooser.
await page.goto(`${WEB}/auth/continue?returnTo=%2Fstudio%2Fsetup`);
await page.getByRole("link", { name: "Continue with Pantopus" }).click();
await page.getByRole("button", { name: "Development actor three" }).click();
await page.waitForLoadState("networkidle");
const token = (await context.cookies(WEB)).find(
  (c) => c.name === SESSION,
)?.value;
step("Maya is signed in", Boolean(token), page.url());
// The navigation config sends a person without a fan handle through that step.
if (new URL(page.url()).pathname === "/onboarding/handle") {
  await page.locator("#handle").fill(`mayafan${Date.now() % 1e6}`);
  await page.locator("button.handle-continue").click();
  await page.waitForURL("**/studio/setup", { timeout: 20_000 }).catch(() => {});
}

// Proof, a verification case, and ops approval, unless a passkey exists already.
const keys = () =>
  Number(
    sql(
      `SELECT count(*) FROM creator.passkey_credential WHERE account_id='10000000-0000-4000-8000-000000000003' AND revoked_at IS NULL`,
    ),
  );
const approved = () =>
  Number(
    sql(
      `SELECT count(*) FROM creator.creator_proof WHERE creator_id='${MAYA}' AND state='approved'`,
    ),
  );
const runStarted = sql("SELECT now()");
if (approved() === 0) {
  const proof = await call("POST", `/v1/identity/${MAYA}/proof`, token, {
    platform: "instagram",
    accountUrl: "https://instagram.com/maya_kiln",
  });
  await call("POST", `/v1/identity/proof/${proof.json?.id}/submit`, token, {
    postUrl: `https://instagram.com/p/${proof.json?.code}`,
  });
  await call("POST", "/v1/trust/reports", token, {
    kind: "verification",
    creatorId: MAYA,
    reason: "Please review my creator proof.",
    idempotencyKey: key("verify"),
  });
  const ops = await developmentToken("10000000-0000-4000-8000-000000000004");
  // Case summaries carry no creator id; approve every open verification case.
  const open = (
    (await call("GET", "/v1/trust/cases?queue=verification", ops)).json
      ?.items ?? []
  ).filter((item) => item.state === "open");
  for (const found of open) {
    await call("POST", `/v1/trust/cases/${found.id}/access`, ops, {
      purpose: "Review the submitted creator proof.",
      minutes: 15,
    });
    const detail = await call("GET", `/v1/trust/cases/${found.id}`, ops);
    await call("POST", `/v1/trust/cases/${found.id}/decisions`, ops, {
      version: detail.json?.version,
      resolution: "verify_creator",
      reason: "Proof post matches the account.",
      idempotencyKey: key("decide"),
    });
  }
  for (let i = 0; i < 30 && approved() === 0; i += 1)
    await new Promise((r) => setTimeout(r, 2000));
}
// This run's virtual authenticator needs its own passkey.
await page.goto(`${WEB}/studio/setup`);
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Register a signing passkey" }).click();
await page
  .getByText("Passkey registered")
  .waitFor({ timeout: 20_000 })
  .catch(() => {});
step(
  "Maya registers a signing passkey on this device",
  Number(
    sql(
      `SELECT count(*) FROM creator.passkey_credential WHERE account_id='10000000-0000-4000-8000-000000000003' AND created_at>='${runStarted}'`,
    ),
  ) === 1,
  `${keys()} keys`,
);

const expectRecovery = process.argv.includes("--expect-recovery");
const waitSeconds =
  Number(process.argv[process.argv.indexOf("--wait") + 1] || 0) || 310;

// Sign a Note; its publish answer is lost (the request is cut in the browser).
await page.goto(`${WEB}/studio/${MAYA}/compose`);
await page.waitForLoadState("networkidle");
if (probe) {
  console.log(await page.locator("main").innerText());
  for (const role of ["button", "textbox", "link"])
    console.log(
      role,
      JSON.stringify(await page.getByRole(role).allInnerTexts()),
    );
  await browser.close();
  process.exit(0);
}
const text = `Kiln day notes ${Date.now()}`;
await page.locator("#note-text").fill(text);
await page.getByRole("button", { name: "Review and sign" }).click();
const sign = page.getByRole("button", { name: "Sign with your passkey" });
await sign.waitFor({ timeout: 20_000 });
if (process.argv.includes("--debug")) {
  page.on("console", (m) =>
    console.log("console:", m.type(), m.text().slice(0, 200)),
  );
  console.log("enabled:", await sign.isEnabled());
  console.log(
    (
      await page
        .locator("[role=dialog], dialog")
        .first()
        .innerText()
        .catch(() => "no dialog")
    ).slice(0, 800),
  );
  await sign.click();
  await page.waitForTimeout(8000);
  console.log(
    (
      await page
        .locator("[role=dialog], dialog")
        .first()
        .innerText()
        .catch(() => "no dialog")
    ).slice(0, 800),
  );
  await browser.close();
  process.exit(0);
}
await page.route("**/api/content/**/publish", (route) =>
  route.abort("connectionreset"),
);
await sign.click();
const pending = page.getByText("The publication response is pending");
await pending.waitFor({ timeout: 30_000 }).catch(() => {});
step(
  "a lost publish answer leaves a pending publication",
  await pending.isVisible(),
);
const signedAct = sql(
  `SELECT id FROM creator.signed_act WHERE account_id='10000000-0000-4000-8000-000000000003' ORDER BY verified_at DESC LIMIT 1`,
);
step(
  "nothing was published",
  sql(
    `SELECT count(*) FROM creator.signed_publication WHERE signed_act_id='${signedAct}'`,
  ) === "0",
);
await page.unroute("**/api/content/**/publish");

// Past the five-minute signature window, on the real clock.
console.log(`      waiting ${waitSeconds} s for the signature window to pass`);
await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
await page.reload();
await page.waitForLoadState("networkidle");
await page.getByRole("button", { name: "Retry same publication" }).click();
await page.waitForLoadState("networkidle");
await page.waitForTimeout(2000);
const stillPending = await pending.isVisible();
const canSign = await sign.isVisible();
note(
  `after the refused retry: pending ${stillPending}, sign again offered ${canSign}`,
);
step(
  "the late retry is refused and nothing is published",
  sql(
    `SELECT count(*) FROM creator.signed_publication WHERE signed_act_id='${signedAct}'`,
  ) === "0",
);
if (!expectRecovery) {
  step(
    "today the composer stays stuck: still pending, no way to sign again (the defect)",
    stillPending && !canSign,
  );
} else {
  step(
    "the pending publication is cleared and signing is offered again",
    !stillPending && canSign,
  );
  await sign.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);
  const published = sql(
    `SELECT count(*) FROM creator.signed_publication p JOIN creator.signed_act a ON a.id=p.signed_act_id WHERE a.account_id='10000000-0000-4000-8000-000000000003' AND a.verified_at>now()-interval '2 minutes'`,
  );
  step(
    "a fresh signature publishes the Note",
    published === "1",
    `${published} publication`,
  );
}
await browser.close();
console.log(failures ? `${failures} failed` : "all steps passed");
process.exit(failures ? 1 : 0);
