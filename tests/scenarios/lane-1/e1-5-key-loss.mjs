#!/usr/bin/env node
// E1.5, losing a passkey (founder, 2026-10-15): a lost device retires its key
// and past signatures stay valid; a compromised device revokes every key and
// every past signature. Maya (the development creator) on two virtual
// devices; ops approvals go through the trust API as the development ops
// supervisor (the console is WP 1.6).
//   node tests/scenarios/lane-1/e1-5-key-loss.mjs
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const API = process.env.QELVORA_API_URL ?? "http://127.0.0.1:56411";
const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const MAYA = "20000000-0000-4000-8000-000000000001";
const ACCOUNT = "10000000-0000-4000-8000-000000000003";
const SESSION = `qelvora_session_${new URL(WEB).port}`;
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
const code = (r) => `${r.status} ${r.json?.error?.code ?? ""}`.trim();
const status = async (id) =>
  (await call("GET", `/v1/identity/signed-acts/${id}`)).json?.status;
const profile = () =>
  sql(
    `SELECT verification||','||recovery_required||','||(recovery_started_at IS NOT NULL) FROM creator.creator_profile WHERE id='${MAYA}'`,
  );
const activeKeys = () =>
  Number(
    sql(
      `SELECT count(*) FROM creator.passkey_credential WHERE account_id='${ACCOUNT}' AND revoked_at IS NULL AND retired_at IS NULL`,
    ),
  );

async function approveFreshProof(token) {
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
  const begun = await call("POST", "/v1/identity/continue", null, {
    returnTo: "/home",
  });
  const ops = (
    await call("POST", "/v1/identity/complete", null, {
      continuationId: begun.json.continuationId,
      code: "10000000-0000-4000-8000-000000000004",
    })
  ).json.token;
  for (const found of (
    (await call("GET", "/v1/trust/cases?queue=verification", ops)).json
      ?.items ?? []
  ).filter((item) => item.state === "open")) {
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
  for (
    let i = 0;
    i < 30 &&
    sql(
      `SELECT state FROM creator.creator_proof WHERE id='${proof.json?.id}'`,
    ) !== "approved";
    i += 1
  )
    await new Promise((r) => setTimeout(r, 2000));
}
const browser = await chromium.launch({ channel: "chrome", headless: true });
/** A device: its own browser profile, virtual authenticator and Maya session. */
async function device() {
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
    await page
      .waitForURL("**/studio/setup", { timeout: 20_000 })
      .catch(() => {});
  }
  return {
    page,
    token: (await context.cookies(WEB)).find((c) => c.name === SESSION)?.value,
  };
}
async function registerKey(page) {
  await page.goto(`${WEB}/studio/setup`);
  await page.waitForLoadState("networkidle");
  await page
    .getByRole("button", { name: "Register a signing passkey" })
    .click();
  await page
    .getByText("Passkey registered")
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
}
async function publishNote(page, text) {
  await page.goto(`${WEB}/studio/${MAYA}/compose`);
  await page.waitForLoadState("networkidle");
  await page.locator("#note-text").fill(text);
  await page.getByRole("button", { name: "Review and sign" }).click();
  await page.getByRole("button", { name: "Sign with your passkey" }).click();
  await page
    .locator("dialog[open], [role=dialog]")
    .first()
    .waitFor({ state: "detached", timeout: 30_000 })
    .catch(() => {});
  return sql(
    `SELECT sa.id FROM creator.signed_act sa JOIN creator.signed_verification sv ON sv.id=sa.id WHERE sa.account_id='${ACCOUNT}' ORDER BY sa.verified_at DESC LIMIT 1`,
  );
}

// Device 1: a working key and a published Note (a past act).
const one = await device();
if (
  !profile().startsWith("verified,false,false") ||
  sql(
    `SELECT count(*) FROM creator.creator_proof WHERE creator_id='${MAYA}' AND state='approved'`,
  ) === "0"
)
  await approveFreshProof(one.token);
await registerKey(one.page);
const pastAct = await publishNote(
  one.page,
  `Glaze test before the loss ${Date.now()}`,
);
step(
  "device 1 signs and publishes a Note",
  Boolean(pastAct) && (await status(pastAct)) === "valid",
  pastAct,
);

// Lost: the keys retire; the past act, the verification and the badge stay.
await one.page.goto(`${WEB}/studio/setup`);
await one.page.waitForLoadState("networkidle");
await one.page.getByText("Lost your signing device?").click();
await one.page.getByRole("button", { name: "It's lost or broken" }).click();
await one.page.waitForTimeout(3000);
step(
  "the lost path retires every working key",
  activeKeys() === 0 &&
    sql(
      `SELECT count(*) FROM creator.passkey_credential WHERE account_id='${ACCOUNT}' AND retired_at IS NOT NULL AND revoked_at IS NULL`,
    ) !== "0",
);
step(
  "the past Note stays valid in the database and on the public page",
  sql(
    `SELECT key_revoked OR creator_revoked FROM creator.signed_verification WHERE id='${pastAct}'`,
  ) === "f" && (await status(pastAct)) === "valid",
);
step(
  "Maya stays verified, with no recovery flag readers would see",
  profile() === "verified,false,true",
  profile(),
);
step(
  "the event says lost",
  sql(
    `SELECT count(*) FROM creator.identity_event WHERE account_id='${ACCOUNT}' AND kind='creator_recovery_lost'`,
  ) !== "0",
);
await one.page.goto(`${WEB}/studio/${MAYA}/compose`);
await one.page.waitForLoadState("networkidle");
await one.page.locator("#note-text").fill(`Try after the loss ${Date.now()}`);
await one.page.getByRole("button", { name: "Review and sign" }).click();
const refusedBegin = one.page.waitForResponse("**/signed-acts/begin");
await one.page.getByRole("button", { name: "Sign with your passkey" }).click();
const begin = await refusedBegin;
step(
  "nothing can be signed until a new key exists",
  begin.status() === 403 &&
    (await begin.json()).error?.code === "passkey_required",
  `${begin.status()} ${(await begin.json()).error?.code}`,
);

// Device 2: a fresh sign-in and fresh proof before a new key.
const two = await device();
const early = await call("POST", "/v1/identity/passkeys/begin", two.token, {});
step(
  "a new key first needs fresh proof",
  code(early) === "403 fresh_proof_required",
  code(early),
);
await approveFreshProof(two.token);
await registerKey(two.page);
step(
  "device 2 registers a new key; recovery is complete",
  activeKeys() === 1 && profile() === "verified,false,false",
  profile(),
);
await two.page.goto(`${WEB}/studio/setup`);
await two.page.waitForLoadState("networkidle");
step(
  "with one key, the setup page asks for a second",
  await two.page
    .getByText(
      "Add a second passkey on another device, so losing one does not stop you signing.",
    )
    .isVisible(),
);

// The lost device tries to sign with its retired key: its client is altered
// to ask the authenticator for any key, so the retired one answers.
await one.page.route("**/signed-acts/begin", async (route) => {
  const response = await route.fetch();
  const body = await response.json();
  if (body.publicKey) body.publicKey.allowCredentials = [];
  await route.fulfill({ response, json: body });
});
await one.page.goto(`${WEB}/studio/${MAYA}/compose`);
await one.page.waitForLoadState("networkidle");
await one.page
  .locator("#note-text")
  .fill(`Forged from the lost phone ${Date.now()}`);
await one.page.getByRole("button", { name: "Review and sign" }).click();
const verifyAnswer = one.page.waitForResponse("**/signed-acts/verify");
await one.page.getByRole("button", { name: "Sign with your passkey" }).click();
const forged = await verifyAnswer;
const forgedCode = (await forged.json()).error?.code;
step(
  "the lost device's retired key cannot sign",
  forged.status() === 403 && forgedCode === "creator_passkey_required",
  `${forged.status()} ${forgedCode}`,
);
step(
  "no act was signed with a retired key",
  sql(
    `SELECT count(*) FROM creator.signed_act sa JOIN creator.passkey_credential k ON k.id=sa.credential_id WHERE sa.account_id='${ACCOUNT}' AND k.retired_at IS NOT NULL AND sa.verified_at>k.retired_at`,
  ) === "0",
);
const newAct = await publishNote(
  two.page,
  `First Note on the new phone ${Date.now()}`,
);
step(
  "the new key signs and publishes",
  newAct !== pastAct && (await status(newAct)) === "valid",
);

// Compromised: every key and every past signature is revoked.
await two.page.goto(`${WEB}/studio/setup`);
await two.page.waitForLoadState("networkidle");
await two.page.getByText("Lost your signing device?").click();
await two.page
  .getByRole("button", { name: "Someone else may have it" })
  .click();
await two.page.waitForTimeout(3000);
step(
  "the compromised path revokes every key",
  sql(
    `SELECT count(*) FROM creator.passkey_credential WHERE account_id='${ACCOUNT}' AND revoked_at IS NULL`,
  ) === "0",
);
// Both flags are set; the public page shows the key first ("Signing key revoked").
step(
  "and every past signature shows as revoked",
  (await status(pastAct)) === "key_revoked" &&
    (await status(newAct)) === "key_revoked",
  `${await status(pastAct)}, ${await status(newAct)}`,
);
step(
  "Maya must be verified again",
  profile() === "pending,true,true",
  profile(),
);
// Leave Maya able to register a key again for the other scripts.
await approveFreshProof(two.token);
await browser.close();
console.log(failures ? `${failures} failed` : "all steps passed");
process.exit(failures ? 1 : 0);
