#!/usr/bin/env node
// WP 1.5, the shared signing panel: a signed reply that the owner refuses
// (signed_act_required: here the passkey is revoked while the publish request
// is in flight) must return the panel to "ready to sign", not freeze it as
// "unknown". Maya, the development creator, replies to development fan one's
// thread in the Studio, on a virtual authenticator.
//   node tests/scenarios/lane-1/e1-5-refused-publish.mjs [--expect-freeze]
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const API = process.env.QELVORA_API_URL ?? "http://127.0.0.1:56411";
const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const MAYA = "20000000-0000-4000-8000-000000000001";
const MAYA_ACCOUNT = "10000000-0000-4000-8000-000000000003";
const SESSION = `qelvora_session_${new URL(WEB).port}`;
const expectFreeze = process.argv.includes("--expect-freeze");
// --lost: the answer is lost instead (the request is cut); the reply may have
// been sent, so the panel must stay "unknown" with or without the fix.
const lost = process.argv.includes("--lost");
let failures = 0;
const step = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
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
const fanId = sql(
  `SELECT id FROM creator.fan_profile WHERE account_id='10000000-0000-4000-8000-000000000001'`,
);
if (
  !fanId ||
  sql(
    `SELECT count(*) FROM creator.thread WHERE creator_id='${MAYA}' AND fan_id='${fanId}'`,
  ) !== "1"
)
  throw new Error(
    "Development fan one needs a thread with Maya (run `stack smoke` first).",
  );

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
const token = (await context.cookies(WEB)).find(
  (c) => c.name === SESSION,
)?.value;
await page.getByRole("button", { name: "Register a signing passkey" }).click();
await page
  .getByText("Passkey registered")
  .waitFor({ timeout: 20_000 })
  .catch(() => {});
const credential = sql(
  `SELECT id FROM creator.passkey_credential WHERE account_id='${MAYA_ACCOUNT}' AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`,
);
step("Maya registers a passkey on this device", Boolean(credential));

await page.goto(`${WEB}/studio/${MAYA}/threads/${fanId}`);
await page.waitForLoadState("networkidle");
const takeover = page.getByRole("button", { name: "Take over" });
if (await takeover.isEnabled().catch(() => false)) {
  await takeover.click();
  await page.waitForLoadState("networkidle");
}
const reply = `A personal note from the kiln ${Date.now()}`;
await page.getByLabel("Your words").fill(reply);
await page.getByRole("button", { name: "Review signed reply" }).click();
const sign = page.getByRole("button", { name: "Sign with your passkey" });
await sign.waitFor({ timeout: 20_000 });

// While the publish request is in flight, the passkey that signed is revoked.
if (lost)
  await page.route("**/threads/*/send-draft", (route) =>
    route.abort("connectionreset"),
  );
else
  await page.route("**/threads/*/send-draft", async (route) => {
    await fetch(new URL("/v1/identity/passkeys/revoke", API), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ credentialId: credential }),
    });
    await route.continue();
  });
await sign.click();
await page.waitForTimeout(6000);
const panel = await page
  .locator(".signed-act-review")
  .innerText()
  .catch(() => "");
const published = sql(
  `SELECT count(*) FROM creator.message m JOIN creator.thread t ON t.id=m.thread_id WHERE t.creator_id='${MAYA}' AND t.fan_id='${fanId}' AND m.text='${reply}'`,
);
step(
  lost
    ? "the cut request reached nothing and nothing reached the fan"
    : "the owner refused it and nothing reached the fan",
  published === "0",
  `${published} messages`,
);
if (lost) {
  step(
    "a lost answer stays unknown: check the status before signing again",
    panel.includes("Check publication status") &&
      panel.includes("Publication could not be confirmed."),
    panel.replaceAll("\n", " | ").slice(-220),
  );
} else if (expectFreeze) {
  step(
    "before the fix: the panel freezes, disabled, as unknown",
    panel.includes("Check publication status") &&
      !(await page
        .getByRole("button", { name: "Check publication status" })
        .isEnabled()),
    panel.replaceAll("\n", " | ").slice(-220),
  );
} else {
  step(
    "the panel says nothing was published and is ready to sign again",
    panel.includes("Signing could not complete. No publication was started.") &&
      (await sign.isEnabled()),
    panel.replaceAll("\n", " | ").slice(-220),
  );
}
await browser.close();
console.log(failures ? `${failures} failed` : "all steps passed");
process.exit(failures ? 1 : 0);
