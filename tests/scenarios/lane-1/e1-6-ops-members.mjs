#!/usr/bin/env node
// WP 1.6, O2 (founder, 2026-10-16): the founder adds, changes and removes ops
// reviewers with the runbook command `modules/trust/ops-members.ts`. A new
// reviewer is a Qelvora account (Apple, through the fake provider). Checks:
// no role before; one queue after being added, and not the others; a change
// ends the open lease; removal refuses the next request; wrong input changes
// nothing; a repeat is an update, not a second reviewer; every change is
// logged with its operator and reason, and the runtime cannot read the log.
// The command runs with the lane database's superuser as a stand-in for the
// migration login. Fakes: Apple, the development privacy proof.
// Needs the lane stack with sign-in on, the fake provider and the pending
// `pending-ops-member-admin.sql` applied (pins regenerated locally):
//   node tests/scenarios/lane-1/e1-6-ops-members.mjs
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  call,
  confirmAge,
  describe,
  one,
  person,
  reporter,
  webSignIn,
  yearsAgo,
} from "./sign-in-lib.mjs";

const { step, finish } = reporter();
const LANE = process.env.QELVORA_LANE ?? "1";
const admin = execFileSync(
  "node",
  ["infra/local/stack.mjs", "env", "--lane", LANE],
  { encoding: "utf8" },
)
  .split("\n")
  .find((line) => line.startsWith("QELVORA_STACK_DATABASE_URL="))
  ?.slice("QELVORA_STACK_DATABASE_URL=".length);
/** The runbook command; { ok, out: [objects], refused }. */
function ops(...args) {
  const run = spawnSync(
    "pnpm",
    [
      "--silent",
      "--filter",
      "@qelvora/backend",
      "exec",
      "tsx",
      "src/modules/trust/ops-members.ts",
      ...args,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_MIGRATION_URL: admin },
    },
  );
  const parse = (text) =>
    text
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line));
  return {
    ok: run.status === 0,
    out: parse(run.stdout),
    refused: parse(run.stderr)[0]?.refused,
  };
}
/** The same command, started without waiting (for the race below). */
const opsLater = (...args) =>
  new Promise((resolve) => {
    const child = spawn(
      "pnpm",
      [
        "--silent",
        "--filter",
        "@qelvora/backend",
        "exec",
        "tsx",
        "src/modules/trust/ops-members.ts",
        ...args,
      ],
      { env: { ...process.env, DATABASE_MIGRATION_URL: admin } },
    );
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("close", (code) =>
      resolve({
        ok: code === 0,
        out: out
          .split("\n")
          .filter((line) => line.startsWith("{"))
          .map((line) => JSON.parse(line)),
      }),
    );
  });
async function apple(label) {
  const first = await webSignIn("apple", person(label));
  const done =
    first.json?.status === "age_required"
      ? await confirmAge(first, yearsAgo(36))
      : first;
  const token = done.json?.completion?.token;
  const accountId = (await call("GET", "/v1/identity/session", { token })).json
    ?.accountId;
  return { token, accountId };
}
const later = (days) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const who = ["--operator", "Founder (scenario)"];
const cases = (token, queue) =>
  call("GET", `/v1/trust/cases?queue=${queue}`, { token });

const BYSTANDER = "10000000-0000-4000-8000-000000000005";
const bystanderRow = () =>
  one(
    `SELECT array_to_string(queues,'+')||','||supervisor||','||expires_at||','||coalesce(revoked_at::text,'-') FROM creator_trust.ops_member WHERE account_id='${BYSTANDER}'`,
  );
const bystanderBefore = bystanderRow();
const reviewer = await apple("reviewer");
const before = await cases(reviewer.token, "support");
step(
  "an Apple account has no ops role at first",
  before.status === 403 && before.json?.error?.code === "ops_role_required",
  describe(before),
);

const added = ops(
  "add",
  "--account",
  reviewer.accountId,
  "--queues",
  "support",
  "--expires",
  later(30),
  ...who,
  "--reason",
  "Pilot support reviewer",
);
const support = await cases(reviewer.token, "support");
const safety = await cases(reviewer.token, "safety");
step(
  "added to support: support opens, safety stays closed",
  added.ok &&
    added.out[0]?.change === "added" &&
    support.status === 200 &&
    safety.status === 403,
  `${JSON.stringify(added.out[0] ?? added.refused)}, support ${describe(support)}, safety ${describe(safety)}`,
);

// A fan's support request, opened by the new reviewer with a reason.
const fan = await apple("support-fan");
const report = await call("POST", "/v1/trust/reports", {
  token: fan.token,
  body: {
    kind: "support",
    reason: "I cannot find my receipt for last week.",
    idempotencyKey: `report-${randomUUID()}`,
  },
});
const caseId = report.json?.id ?? report.json?.caseId;
const opened = await call("POST", `/v1/trust/cases/${caseId}/access`, {
  token: reviewer.token,
  body: { purpose: "Answer the fan's support request.", minutes: 15 },
});
step(
  "the new reviewer opens a support case with a reason",
  report.status < 300 && opened.status < 300,
  `${describe(report)}, ${describe(opened)}`,
);
const lease = () =>
  one(
    `SELECT count(*) FROM creator_trust.case_access WHERE account_id='${reviewer.accountId}' AND expires_at>now()`,
  );
const leaseBefore = lease();

const changed = ops(
  "add",
  "--account",
  reviewer.accountId,
  "--queues",
  "support,safety",
  "--supervisor",
  "--expires",
  later(60),
  ...who,
  "--reason",
  "Also safety, as supervisor",
);
const reread = await call("GET", `/v1/trust/cases/${caseId}`, {
  token: reviewer.token,
});
step(
  "a change is an update, not a second reviewer, and ends the open lease",
  changed.ok &&
    changed.out[0]?.change === "updated" &&
    changed.out[0]?.leasesEnded === 1 &&
    leaseBefore === "1" &&
    lease() === "0" &&
    one(
      `SELECT count(*)||','||bool_and(supervisor)||','||array_to_string(queues,'+') FROM creator_trust.ops_member WHERE account_id='${reviewer.accountId}' GROUP BY queues`,
    ) === "1,true,support+safety" &&
    reread.status >= 400,
  `${JSON.stringify(changed.out[0] ?? changed.refused)}, case read after ${describe(reread)}`,
);
const nowSafety = await cases(reviewer.token, "safety");
step(
  "the changed queues apply at once",
  nowSafety.status === 200,
  describe(nowSafety),
);

// Wrong input changes nothing.
const memberRow = () =>
  one(
    `SELECT array_to_string(queues,'+')||','||supervisor||','||expires_at::date FROM creator_trust.ops_member WHERE account_id='${reviewer.accountId}'`,
  );
const logCount = () =>
  one(
    `SELECT count(*) FROM creator_trust.ops_member_change WHERE account_id='${reviewer.accountId}'`,
  );
const [rowBefore, logBefore] = [memberRow(), logCount()];
const wrong = [
  ["a past expiry", ["--queues", "support", "--expires", "2020-01-01"]],
  ["an unknown queue", ["--queues", "billing", "--expires", later(10)]],
  ["more than a year", ["--queues", "support", "--expires", later(400)]],
  ["no reason", ["--queues", "support", "--expires", later(10)], true],
].map(([label, extra, noReason]) => {
  const run = ops(
    "add",
    "--account",
    reviewer.accountId,
    ...extra,
    ...who,
    ...(noReason ? [] : ["--reason", "Wrong on purpose"]),
  );
  return `${label}: ${run.ok ? "accepted" : "refused"}`;
});
const unknown = ops(
  "add",
  "--account",
  randomUUID(),
  "--queues",
  "support",
  "--expires",
  later(10),
  ...who,
  "--reason",
  "Not a Qelvora account",
);
step(
  "wrong input is refused and changes nothing",
  wrong.every((line) => line.endsWith("refused")) &&
    !unknown.ok &&
    /not a Qelvora account/u.test(unknown.refused ?? "") &&
    memberRow() === rowBefore &&
    logCount() === logBefore,
  `${wrong.join("; ")}; unknown account: ${unknown.refused}`,
);

// Removal refuses the next request; a second removal is refused.
const removed = ops(
  "remove",
  "--account",
  reviewer.accountId,
  ...who,
  "--reason",
  "Pilot ended",
);
const afterRemove = await cases(reviewer.token, "support");
const again = ops(
  "remove",
  "--account",
  reviewer.accountId,
  ...who,
  "--reason",
  "Pilot ended",
);
step(
  "removed: the next request is refused; removing again is refused",
  removed.ok &&
    afterRemove.status === 403 &&
    !again.ok &&
    /not an active reviewer/u.test(again.refused ?? ""),
  `${describe(afterRemove)}; again: ${again.refused}`,
);

const log = ops("list", "--changes").out.filter(
  (row) => row.account === reviewer.accountId,
);
step(
  "every change is logged with its operator and reason, newest first",
  log.map((row) => row.change).join(",") === "removed,updated,added" &&
    log.every((row) => row.operator === "Founder (scenario)" && row.reason),
  log.map((row) => `${row.change}: ${row.reason}`).join("; "),
);
const runtimeRead = spawnSync(
  "docker",
  [
    "exec",
    `qelvora-lane${LANE}-postgres`,
    "psql",
    "-U",
    "postgres",
    "-d",
    "creator_stack",
    "-Atc",
    "SET ROLE creator_trust_runtime; SELECT count(*) FROM creator_trust.ops_member_change",
  ],
  { encoding: "utf8" },
);
step(
  "the runtime role cannot read the change log",
  runtimeRead.status !== 0 && /permission denied/u.test(runtimeRead.stderr),
  runtimeRead.stderr.trim().split("\n").at(-1),
);
// Race: two adds for the same new account at once make one reviewer.
const racer = await apple("racer");
const raced = await Promise.all(
  ["support", "safety"].map((queue) =>
    opsLater(
      "add",
      "--account",
      racer.accountId,
      "--queues",
      queue,
      "--expires",
      later(5),
      ...who,
      "--reason",
      `Race for ${queue}`,
    ),
  ),
);
step(
  "two adds at once make one reviewer: one added, one updated",
  raced.every((run) => run.ok) &&
    raced
      .map((run) => run.out[0]?.change)
      .sort()
      .join(",") === "added,updated" &&
    one(
      `SELECT count(*) FROM creator_trust.ops_member WHERE account_id='${racer.accountId}'`,
    ) === "1",
  raced.map((run) => run.out[0]?.change ?? "failed").join(", "),
);
ops("remove", "--account", racer.accountId, ...who, "--reason", "Race done");
step(
  "a bystander reviewer is untouched",
  bystanderRow() === bystanderBefore,
  bystanderBefore,
);
const listed = ops("list").out.find(
  (row) => row.account === reviewer.accountId,
);
step(
  "the list shows the reviewer as inactive",
  listed?.active === false && Boolean(listed?.revokedAt),
  JSON.stringify(listed),
);
finish();
