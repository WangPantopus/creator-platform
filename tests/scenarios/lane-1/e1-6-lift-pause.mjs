#!/usr/bin/env node
// WP 1.6, P2 (founder, 2026-10-16): a supervisor lifts a pause from its case,
// with a reason both parties receive. Maya (the development creator) is
// paused through a fan's pause request; her pause action never finishes on a
// development stack (G1: open paid requests, lane 4), which is the case a lift
// must handle. The lift is done once in the console (Chrome) and once through
// the API in a race. Reviewers who are not the seeded ones are Apple accounts
// given a role with a database row (stand-in for the O2 command, #472).
// Fakes: Apple, the development identity. It pauses and lifts Maya twice, so
// run it on a fresh stack.
// Needs the lane stack with sign-in on, the web app, the fake provider and the
// pending `pending-lift-pause.sql` applied (pins regenerated locally):
//   node tests/scenarios/lane-1/e1-6-lift-pause.mjs
// Before the migration is registered (a fresh stack without it), a lift is
// refused plainly and changes nothing:
//   node tests/scenarios/lane-1/e1-6-lift-pause.mjs --before-registration
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import {
  call,
  confirmAge,
  describe,
  one,
  person,
  reporter,
  sql,
  sleep,
  webSignIn,
  yearsAgo,
} from "./sign-in-lib.mjs";

const WEB = process.env.QELVORA_WEB_URL ?? "http://localhost:56412";
const MAYA = "20000000-0000-4000-8000-000000000001";
const { step, finish } = reporter();
const dev = (n) => `10000000-0000-4000-8000-00000000000${n}`;
const key = (label) => `${label}-${randomUUID()}`;
async function development(n) {
  const begun = await call("POST", "/v1/identity/continue", {
    body: { returnTo: "/home" },
  });
  return (
    await call("POST", "/v1/identity/complete", {
      body: { continuationId: begun.json.continuationId, code: dev(n) },
    })
  ).json.token;
}
async function appleWithRole(label, supervisor) {
  const first = await webSignIn("apple", person(label));
  const done =
    first.json?.status === "age_required"
      ? await confirmAge(first, yearsAgo(38))
      : first;
  const token = done.json?.completion?.token;
  const accountId = (await call("GET", "/v1/identity/session", { token })).json
    ?.accountId;
  sql(
    `INSERT INTO creator_trust.ops_member(account_id,queues,supervisor,expires_at) VALUES('${accountId}',ARRAY['pauses'],${supervisor},now()+interval '1 day')`,
  );
  return token;
}
const open = (token, id) =>
  call("POST", `/v1/trust/cases/${id}/access`, {
    token,
    body: { purpose: "Review this pause before lifting it.", minutes: 15 },
  });
const version = (id) =>
  Number(one(`SELECT version FROM creator_trust.safety_case WHERE id='${id}'`));
const lift = (token, id, v = version(id), idempotencyKey = key("lift")) =>
  call("POST", `/v1/trust/cases/${id}/lift-pause`, {
    token,
    body: {
      version: v,
      reason: "The reviewed AI replies are within policy.",
      idempotencyKey,
    },
  });
const state = (id) =>
  sql(
    `SELECT c.state,c.outcome,(SELECT count(*) FROM creator_trust.restriction r WHERE r.case_id=c.id AND r.revoked_at IS NULL),
     (SELECT string_agg(e.type||'='||e.state,',' ORDER BY e.created_at) FROM creator_trust.effect e WHERE e.case_id=c.id)
     FROM creator_trust.safety_case c WHERE c.id='${id}'`,
  )[0] ?? [];

const [fan, maya, supervisor] = await Promise.all([1, 3, 4].map(development));
const session = (await call("GET", "/v1/identity/session", { token: fan }))
  .json;
let fanId = session?.fan?.id;
if (!fanId)
  fanId = (
    await call("POST", "/v1/identity/fan-profile", {
      token: fan,
      body: { handle: `pausefan${Date.now() % 1e6}`, intro: "" },
    })
  ).json?.id;
const capabilities = (
  await call("GET", "/v1/conversations/capabilities", { token: fan })
).json;
await call("POST", "/v1/conversations/begin", {
  token: fan,
  body: {
    creatorId: MAYA,
    policyVersion: capabilities?.providers?.version,
    accessNoticeAccepted: true,
    idempotencyKey: key("begin"),
  },
});
const thread = () =>
  call("GET", `/v1/conversations/${MAYA}/${fanId}`, { token: fan });
const before = await thread();

async function pauseMaya() {
  const filed = await call("POST", "/v1/trust/reports", {
    token: fan,
    body: {
      kind: "pause",
      creatorId: MAYA,
      reason: "Please pause this AI while it is reviewed.",
      idempotencyKey: key("pause"),
    },
  });
  const id = filed.json?.id;
  await open(supervisor, id);
  const decided = await call("POST", `/v1/trust/cases/${id}/decisions`, {
    token: supervisor,
    body: {
      version: version(id),
      resolution: "pause_creator",
      reason: "Paused while the AI's replies are reviewed.",
      idempotencyKey: key("decide"),
    },
  });
  return { id, filed, decided };
}
const first = await pauseMaya();
await sleep(6000);
const paused = await thread();
const pausedState = state(first.id);
step(
  "a pause closes the fan's conversation; its action does not finish (G1)",
  before.status === 200 &&
    first.decided.status === 200 &&
    paused.status === 403 &&
    pausedState[0] === "action_pending" &&
    pausedState[2] === "1",
  `${describe(before)} then ${describe(paused)}; case ${pausedState.join(" ")}`,
);

if (process.argv.includes("--before-registration")) {
  await open(supervisor, first.id);
  const early = await lift(supervisor, first.id);
  const after = state(first.id);
  step(
    "before registration a lift is refused plainly and changes nothing",
    early.status === 503 &&
      early.json?.error?.code === "pause_lift_unavailable" &&
      after[1] === "pause_creator" &&
      after[2] === "1" &&
      (await thread()).status === 403,
    `${describe(early)}; case ${after.join(" ")}`,
  );
  finish();
}

// Refusals, each leaving the pause in place.
const reviewer = await appleWithRole("pause-reviewer", false);
await open(reviewer, first.id);
const notSupervisor = await lift(reviewer, first.id);
const otherSupervisor = await appleWithRole("pause-supervisor", true);
const noLease = await lift(otherSupervisor, first.id);
await open(supervisor, first.id);
const stale = await lift(supervisor, first.id, version(first.id) - 1);
const supportCase = await call("POST", "/v1/trust/reports", {
  token: fan,
  body: {
    kind: "support",
    reason: "I would like a copy of my receipts.",
    idempotencyKey: key("support"),
  },
});
await open(supervisor, supportCase.json?.id);
const notPause = await lift(supervisor, supportCase.json?.id);
const fan403 = await lift(fan, first.id);
step(
  "refused: a non-supervisor, a supervisor without the case open, a stale version, a case that is not a pause, a fan",
  notSupervisor.json?.error?.code === "supervisor_required" &&
    // Without its lease the case cannot even be read.
    ["case_access_required", "case_unavailable"].includes(
      noLease.json?.error?.code,
    ) &&
    stale.json?.error?.code === "stale_case" &&
    notPause.json?.error?.code === "pause_not_found" &&
    fan403.status >= 400 &&
    state(first.id)[2] === "1",
  [notSupervisor, noLease, stale, notPause, fan403].map(describe).join(", "),
);

// The supervisor lifts it in the console.
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ locale: "en-US" })).newPage();
await page.goto(`${WEB}/auth/continue?returnTo=%2Fops`);
await page.getByRole("link", { name: "Continue with Pantopus" }).click();
await page.getByRole("button", { name: "Development Ops supervisor" }).click();
await page.waitForLoadState("networkidle");
await page.goto(`${WEB}/ops/cases/${first.id}`);
await page.waitForLoadState("networkidle");
const purpose = page.locator("textarea").first();
if (
  await page
    .getByRole("button", { name: "Open case for 15 minutes" })
    .isVisible()
) {
  await purpose.fill("Review this pause before lifting it.");
  await page.getByRole("button", { name: "Open case for 15 minutes" }).click();
  await page.waitForLoadState("networkidle");
}
const liftForm = page.getByLabel("Lift pause · supervisor");
await liftForm.waitFor({ timeout: 15_000 }).catch(() => {});
const offered = await liftForm.isVisible();
if (offered) {
  await liftForm.fill("The reviewed AI replies are within policy.");
  await page.getByRole("button", { name: "Lift pause" }).click();
  await page.getByRole("button", { name: "Lift and notify" }).click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
}
await sleep(4000);
const lifted = state(first.id);
const reopened = await thread();
step(
  "the console offers the lift, and lifting reopens the conversation at once",
  offered &&
    lifted[2] === "0" &&
    reopened.status === 200 &&
    !(await liftForm.isVisible()),
  `case ${lifted.join(" ")}; thread ${describe(reopened)}`,
);
step(
  "the unfinished pause action is cancelled and a resume waits for lane 3",
  lifted[0] === "action_pending" &&
    lifted[1] === "lift_pause" &&
    /agent\.pause=cancelled/u.test(lifted[3] ?? "") &&
    /agent\.resume=(pending|blocked)/u.test(lifted[3] ?? ""),
  lifted[3],
);
const inbox = async (token) =>
  ((await call("GET", "/v1/trust/inbox", { token })).json?.items ?? []).some(
    (item) =>
      item.case_id === first.id &&
      item.type === "pause_lifted" &&
      item.reason === "The reviewed AI replies are within policy.",
  );
const [fanTold, creatorTold] = [await inbox(fan), await inbox(maya)];
step(
  "both parties, the reporter and the creator, receive the reason in their trust inbox",
  fanTold && creatorTold,
  `reporter ${fanTold}, creator ${creatorTold}`,
);
const timeline = sql(
  `SELECT (SELECT count(*) FROM creator_trust.case_event WHERE case_id='${first.id}' AND type='pause_lifted'),(SELECT count(*) FROM creator_trust.access_audit WHERE case_id='${first.id}' AND action='pause_lift' AND actor_account_id='${dev(4)}')`,
)[0];
step(
  "the lift is in the case timeline and the supervisor's access record",
  timeline?.join(",") === "1,1",
  timeline?.join(","),
);
const later = await (async () => {
  await sleep(8000);
  return state(first.id);
})();
step(
  "the cancelled pause action never runs again",
  /agent\.pause=cancelled/u.test(later[3] ?? "") && later[2] === "0",
  later[3],
);
const again = await lift(supervisor, first.id);
step(
  "lifting again is refused",
  again.status === 409 &&
    ["pause_already_lifted", "stale_case", "pause_not_found"].includes(
      again.json?.error?.code,
    ),
  describe(again),
);

// A second pause, lifted by two supervisors at once.
const second = await pauseMaya();
await sleep(4000);
await Promise.all([
  open(supervisor, second.id),
  open(otherSupervisor, second.id),
]);
const v = version(second.id);
const sameKey = key("race");
const race = await Promise.all([
  lift(supervisor, second.id, v, sameKey),
  lift(otherSupervisor, second.id, v),
]);
const repeat = await lift(supervisor, second.id, v, sameKey);
const raced = state(second.id);
step(
  "two supervisors lift at once: one lift, one refusal; the same key repeats its result",
  race.filter((r) => r.status === 200).length === 1 &&
    race.some((r) => r.status === 409) &&
    raced[2] === "0" &&
    (raced[3] ?? "").split(",").filter((e) => e.startsWith("agent.resume"))
      .length === 1 &&
    (race[0].status !== 200 || repeat.json?.version === race[0].json?.version),
  `${race.map(describe).join(", ")}; repeat ${describe(repeat)}; ${raced[3]}`,
);
await browser.close();
finish();
