#!/usr/bin/env node
// WP 1.6, O1 (founder, 2026-10-16): a supervisor sees every reviewer's case
// access records in the queues they supervise, with who made each one; a
// reviewer still sees only their own. The development reviewers (supervisor
// 4 in every queue, support reviewer 5, verification reviewer 6) open a
// support case and a verification case; a supervisor limited to support is an
// Apple account given that role with a database row (stand-in for the O2
// command, #472). Fakes: Apple, the development identity and privacy proof.
// Needs the lane stack with sign-in on, the web app, the fake provider and the
// pending `pending-supervisor-audits.sql` applied (pins regenerated locally):
//   node tests/scenarios/lane-1/e1-6-supervisor-audits.mjs
import { randomUUID } from "node:crypto";
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
const dev = (n) => `10000000-0000-4000-8000-00000000000${n}`;
const key = (label) => `${label}-${randomUUID()}`;
async function development(n) {
  const begun = await call("POST", "/v1/identity/continue", {
    body: { returnTo: "/ops" },
  });
  return (
    await call("POST", "/v1/identity/complete", {
      body: { continuationId: begun.json.continuationId, code: dev(n) },
    })
  ).json.token;
}
async function apple(label) {
  const first = await webSignIn("apple", person(label));
  const done =
    first.json?.status === "age_required"
      ? await confirmAge(first, yearsAgo(41))
      : first;
  const token = done.json?.completion?.token;
  const accountId = (await call("GET", "/v1/identity/session", { token })).json
    ?.accountId;
  return { token, accountId };
}
const open = (token, id) =>
  call("POST", `/v1/trust/cases/${id}/access`, {
    token,
    body: { purpose: "Review this case for the audit check.", minutes: 15 },
  });
const audits = (token) => call("GET", "/v1/trust/operations/audits", { token });
const has = (r, caseId, reviewer) =>
  (r.json?.items ?? []).some(
    (item) => item.case_id === caseId && item.reviewer === reviewer,
  );

const [supervisor, support, verification] = await Promise.all(
  [4, 5, 6].map(development),
);
// A support case, opened by reviewer 5.
const fan = await apple("audit-fan");
const supportCase = await call("POST", "/v1/trust/reports", {
  token: fan.token,
  body: {
    kind: "support",
    reason: "My last payment shows twice on my statement.",
    idempotencyKey: key("support"),
  },
});
// A verification case, opened by reviewer 6.
const creator = await apple("audit-creator");
const profile = await call("POST", "/v1/identity/creator-profile", {
  token: creator.token,
  body: { handle: `ac${Date.now() % 1e8}`, displayName: "Audit Kiln" },
});
const proof = await call("POST", `/v1/identity/${profile.json?.id}/proof`, {
  token: creator.token,
  body: {
    platform: "instagram",
    accountUrl: "https://instagram.com/audit_kiln",
  },
});
await call("POST", `/v1/identity/proof/${proof.json?.id}/submit`, {
  token: creator.token,
  body: { postUrl: `https://instagram.com/p/${proof.json?.code ?? "x"}` },
});
const verificationCase = await call("POST", "/v1/trust/reports", {
  token: creator.token,
  body: {
    kind: "verification",
    creatorId: profile.json?.id,
    reason: "Please review my creator proof.",
    idempotencyKey: key("verify"),
  },
});
const [S, V] = [supportCase.json?.id, verificationCase.json?.id];
const opened = [await open(support, S), await open(verification, V)];
step(
  "reviewer 5 opens a support case and reviewer 6 a verification case",
  Boolean(S && V) && opened.every((r) => r.status < 300),
  [supportCase, verificationCase, ...opened].map(describe).join(", "),
);

const all = await audits(supervisor);
const mineMarked = (all.json?.items ?? []).every(
  (item) => item.mine === (item.reviewer === dev(4)),
);
step(
  "the supervisor sees both reviewers' records, each with its reviewer",
  all.json?.scope === "supervisor" &&
    has(all, S, dev(5)) &&
    has(all, V, dev(6)) &&
    mineMarked,
  `${describe(all)}, scope ${all.json?.scope}, ${all.json?.items?.length} records`,
);
const own = await audits(support);
step(
  "reviewer 5 still sees only their own records",
  own.json?.scope === "own" &&
    has(own, S, dev(5)) &&
    !has(own, V, dev(6)) &&
    (own.json?.items ?? []).every((item) => item.mine),
  `${own.json?.items?.length} records`,
);

// A supervisor of support only (wrong queue for V).
const limited = await apple("support-supervisor");
sql(
  `INSERT INTO creator_trust.ops_member(account_id,queues,supervisor,expires_at) VALUES('${limited.accountId}',ARRAY['support'],true,now()+interval '1 day')`,
);
const limitedView = await audits(limited.token);
step(
  "a supervisor of support sees reviewer 5's support record, not the verification one",
  limitedView.json?.scope === "supervisor" &&
    has(limitedView, S, dev(5)) &&
    !has(limitedView, V, dev(6)),
  `${limitedView.json?.items?.length} records`,
);
sql(
  `UPDATE creator_trust.ops_member SET revoked_at=now() WHERE account_id='${limited.accountId}'`,
);
const revoked = await audits(limited.token);
const fanView = await audits(fan.token);
step(
  "a removed supervisor and a fan are refused",
  revoked.status === 403 && fanView.status === 403,
  `${describe(revoked)}, ${describe(fanView)}`,
);

// The console page, for the supervisor and for reviewer 5.
const browser = await chromium.launch({ channel: "chrome", headless: true });
async function consoleText(label) {
  const page = await (await browser.newContext({ locale: "en-US" })).newPage();
  await page.goto(`${WEB}/auth/continue?returnTo=%2Fops`);
  await page.getByRole("link", { name: "Continue with Pantopus" }).click();
  await page.getByRole("button", { name: label }).click();
  await page.waitForLoadState("networkidle");
  await page.goto(`${WEB}/ops/audits`);
  await page.waitForLoadState("networkidle");
  await page
    .getByText("records.", { exact: false })
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await page.waitForTimeout(1500);
  // Labels are styled in capitals; compare without case.
  return (await page.locator("main").innerText())
    .replace(/\s+/gu, " ")
    .toLowerCase();
}
const supervisorPage = await consoleText("Development Ops supervisor");
step(
  "the supervisor's page: “Every reviewer's latest 100 …” and who made each record",
  supervisorPage.includes(
    "every reviewer's latest 100 case access and action records.",
  ) &&
    supervisorPage.includes(`by reviewer ${dev(5)}`) &&
    supervisorPage.includes(`by reviewer ${dev(6)}`),
  supervisorPage.slice(0, 400),
);
const reviewerPage = await consoleText("Development support reviewer");
step(
  "reviewer 5's page: “Your latest 100 …”, only their own",
  reviewerPage.includes("your latest 100 case access and action records.") &&
    reviewerPage.includes("by you") &&
    !reviewerPage.includes("by reviewer"),
  reviewerPage.slice(0, 400),
);
await browser.close();
finish();
