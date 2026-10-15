#!/usr/bin/env node
// E1.6 in the console (system Chrome through Playwright): the development ops
// supervisor finds a fan's report in the queue, opens it with a reason,
// resolves it, and the fan is notified. The report itself is filed through
// the API (the report button belongs to the thread screens).
//   node tests/scenarios/lane-1/e1-6-console.mjs
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";

const API = process.env.QELVORA_API_URL ?? "http://127.0.0.1:56411";
const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const MAYA = "20000000-0000-4000-8000-000000000001";
let failures = 0;
const step = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
};
const sql = (q) =>
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
      q,
    ],
    { encoding: "utf8" },
  ).trim();
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
const begun = await call("POST", "/v1/identity/continue", null, {
  returnTo: "/home",
});
const fan = (
  await call("POST", "/v1/identity/complete", null, {
    continuationId: begun.json.continuationId,
    code: "10000000-0000-4000-8000-000000000001",
  })
).json.token;
const text = `The AI called my kiln work sloppy ${Date.now() % 1e6}`;
const filed = await call("POST", "/v1/trust/reports", fan, {
  kind: "abuse",
  creatorId: MAYA,
  reason: text,
  idempotencyKey: `console-${Date.now()}`,
});
step("a fan's report is filed", filed.status === 201, String(filed.status));

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ locale: "en-US" })).newPage();
await page.goto(`${WEB}/auth/continue?returnTo=%2Fops`);
await page.getByRole("link", { name: "Continue with Pantopus" }).click();
await page.getByRole("button", { name: "Development Ops supervisor" }).click();
await page.waitForLoadState("networkidle");
const queue = await page.locator("main").innerText();
step(
  "the queue lists the case by number, without the report's words",
  queue.includes(String(filed.json.number)) && !queue.includes(text),
  `case ${filed.json.number}`,
);
await page.goto(`${WEB}/ops/cases/${filed.json.id}`);
await page.waitForLoadState("networkidle");
step(
  "the case page asks for a reason before showing anything",
  !(await page.locator("main").innerText()).includes(text) &&
    (await page.getByLabel("Purpose of access").isVisible()),
);
await page
  .getByLabel("Purpose of access")
  .fill("Reviewing a reported AI reply about kiln work.");
await page.getByRole("button", { name: "Open case for 15 minutes" }).click();
await page
  .getByText(text)
  .waitFor({ timeout: 15_000 })
  .catch(() => {});
step(
  "once opened, the report is shown",
  (await page.locator("main").innerText()).includes(text),
);
step(
  "and the opening and the evidence read are logged with the reason",
  sql(
    `SELECT string_agg(action, ',' ORDER BY action) FROM creator_trust.access_audit WHERE case_id='${filed.json.id}' AND purpose='Reviewing a reported AI reply about kiln work.' AND actor_account_id='10000000-0000-4000-8000-000000000004'`,
  ) === "case_open,evidence_read",
);
await page.getByText("Close case", { exact: true }).first().click();
await page
  .getByLabel("Reason sent to both")
  .fill("We reviewed the reply and closed this report.");
await page.getByRole("button", { name: "Resolve and notify both" }).click();
step(
  "a confirmation shows the reason before anything is recorded",
  (await page
    .getByRole("heading", { name: "Record this decision?" })
    .isVisible()) &&
    sql(
      `SELECT state FROM creator_trust.safety_case WHERE id='${filed.json.id}'`,
    ) === "open",
);
await page.getByRole("button", { name: "Record and notify" }).click();
await page.waitForTimeout(3000);
const row = sql(
  `SELECT state||','||outcome||','||decision_account_id FROM creator_trust.safety_case WHERE id='${filed.json.id}'`,
);
step(
  "the case is resolved and attributed to the supervisor",
  row === "resolved,close,10000000-0000-4000-8000-000000000004",
  row,
);
const inbox = await call("GET", "/v1/trust/inbox", fan);
step(
  "the fan is notified",
  JSON.stringify(inbox.json).includes(filed.json.id),
  String(inbox.status),
);
await browser.close();
console.log(failures ? `${failures} failed` : "all steps passed");
process.exit(failures ? 1 : 0);
