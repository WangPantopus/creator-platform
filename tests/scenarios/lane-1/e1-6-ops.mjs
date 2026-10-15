#!/usr/bin/env node
// E1.6: ops reviewers work the trust queues through the real API, with the
// development identity's reviewers (supervisor 4, support 5, who is also the
// creator Devon, verification 6). Refusals first. The pause runs last and
// leaves Maya paused: reset the stack afterwards (`stack.mjs reset --lane 1`).
//   node tests/scenarios/lane-1/e1-6-ops.mjs [--with-pause]
import { execFileSync } from "node:child_process";

const API = process.env.QELVORA_API_URL ?? "http://127.0.0.1:56411";
const MAYA = "20000000-0000-4000-8000-000000000001";
const withPause = process.argv.includes("--with-pause");
let failures = 0;
let skipped = 0;
const step = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`,
  );
};
const skip = (name, reason) => {
  skipped += 1;
  console.log(`NOT RUN  ${name}  (${reason})`);
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
const key = (l) =>
  `${l}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
const code = (r) =>
  `${r.status} ${r.json?.error?.code ?? r.json?.state ?? ""}`.trim();
async function dev(n) {
  const begun = await call("POST", "/v1/identity/continue", null, {
    returnTo: "/home",
  });
  return (
    await call("POST", "/v1/identity/complete", null, {
      continuationId: begun.json.continuationId,
      code: `10000000-0000-4000-8000-00000000000${n}`,
    })
  ).json.token;
}
const [fan, maya, ops, support, verifier] = await Promise.all(
  [1, 3, 4, 5, 6].map(dev),
);
// Reports are limited to 20 an hour per reporter (crisis is exempt): run this
// on a fresh stack, or an hour apart.
const report = async (token, body) => {
  const filed = await call("POST", "/v1/trust/reports", token, {
    idempotencyKey: key("report"),
    ...body,
  });
  if (filed.status !== 201)
    console.log(
      `      report ${body.kind} refused: ${filed.status} ${filed.json?.error?.code}`,
    );
  return filed;
};
const open = (token, id) =>
  call("POST", `/v1/trust/cases/${id}/access`, token, {
    purpose: "Review this report as assigned.",
    minutes: 15,
  });
const decide = (
  token,
  id,
  version,
  resolution,
  idempotencyKey = key("decide"),
) =>
  call("POST", `/v1/trust/cases/${id}/decisions`, token, {
    version,
    resolution,
    reason: "Decided after reviewing the case.",
    idempotencyKey,
  });
const settle = async (caseId) => {
  for (let i = 0; i < 20; i += 1) {
    const state = sql(
      `SELECT state FROM creator_trust.safety_case WHERE id='${caseId}'`,
    );
    if (state !== "action_pending") return state;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return sql(
    `SELECT state||':'||coalesce((SELECT string_agg(type||'='||state||':'||coalesce(error_code,''),',') FROM creator_trust.effect WHERE case_id='${caseId}'),'') FROM creator_trust.safety_case WHERE id='${caseId}'`,
  );
};

// Wrong people are refused, the same way each time.
for (const [who, token, queue] of [
  ["a fan", fan, "safety"],
  ["a creator", maya, "safety"],
  ["the verification reviewer", verifier, "safety"],
  ["the support reviewer", support, "verification"],
])
  step(
    `${who} cannot list the ${queue} queue`,
    code(await call("GET", `/v1/trust/cases?queue=${queue}`, token)) ===
      "403 ops_role_required",
  );

// A safety case: listed without its text, opened with a reason, decided and logged.
const abuse = await report(fan, {
  kind: "abuse",
  creatorId: MAYA,
  reason: "The AI mocked my glaze test.",
});
step(
  "a fan's abuse report lands in the safety queue",
  abuse.status === 201 && abuse.json.queue === "safety",
  code(abuse),
);
const listed = (
  await call("GET", "/v1/trust/cases?queue=safety", support)
).json?.items?.find((item) => item.id === abuse.json.id);
step(
  "the list shows the case without the report's text",
  Boolean(listed) && !JSON.stringify(listed).includes("glaze"),
);
step(
  "the case cannot be read before it is opened with a reason",
  code(await call("GET", `/v1/trust/cases/${abuse.json.id}`, support)) ===
    "403 case_access_required",
);
step(
  "opening it records the reason",
  (await open(support, abuse.json.id)).status === 200 &&
    sql(
      `SELECT count(*) FROM creator_trust.access_audit WHERE case_id='${abuse.json.id}' AND action='case_open' AND purpose='Review this report as assigned.'`,
    ) === "1",
);
const closed = await decide(support, abuse.json.id, 1, "close");
step(
  "the decision is made and attributed",
  closed.status === 200 &&
    sql(
      `SELECT decision_account_id FROM creator_trust.safety_case WHERE id='${abuse.json.id}'`,
    ) === "10000000-0000-4000-8000-000000000005",
  code(closed),
);
const audits = await call("GET", "/v1/trust/operations/audits", support);
step(
  "the reviewer's own audit log shows the access",
  audits.status === 200 && JSON.stringify(audits.json).includes(abuse.json.id),
  code(audits),
);
step(
  "the access is attributed to that reviewer",
  sql(
    `SELECT count(*) FROM creator_trust.access_audit WHERE case_id='${abuse.json.id}' AND actor_account_id='10000000-0000-4000-8000-000000000005'`,
  ) !== "0",
);
const history = await call("GET", "/v1/trust/access-history", fan);
step(
  "the fan sees that their report was opened",
  history.status === 200 &&
    JSON.stringify(history.json).includes(abuse.json.id),
  code(history),
);

// Two reviewers decide one case at once: one wins, the other gets a conflict.
const contested = await report(fan, {
  kind: "abuse",
  creatorId: MAYA,
  reason: "Second report about the same reply.",
});
await Promise.all([
  open(ops, contested.json.id),
  open(support, contested.json.id),
]);
const both = await Promise.all([
  decide(ops, contested.json.id, 1, "close"),
  decide(support, contested.json.id, 1, "uphold"),
]);
step(
  "two reviewers at once: one decision wins, the other is refused",
  both.filter((r) => r.status === 200).length === 1 &&
    both.some((r) => r.status === 409),
  both.map(code).join(", "),
);
step(
  "and exactly one decision is recorded",
  sql(
    `SELECT count(*) FROM creator_trust.case_event WHERE case_id='${contested.json.id}' AND type LIKE 'decision%'`,
  ) <= "1" &&
    sql(
      `SELECT count(DISTINCT decision_account_id) FROM creator_trust.safety_case WHERE id='${contested.json.id}'`,
    ) === "1",
);

// A repeated decision with the same key is one decision.
const repeat = await report(fan, {
  kind: "abuse",
  creatorId: MAYA,
  reason: "Third report, for the retry.",
});
await open(support, repeat.json.id);
const once = key("same");
const first = await decide(support, repeat.json.id, 1, "close", once);
const second = await decide(support, repeat.json.id, 1, "close", once);
step(
  "a retried decision returns the same result",
  first.status === 200 &&
    second.status === 200 &&
    second.json?.version === first.json?.version,
  `${code(first)}, ${code(second)}`,
);

// Crisis is urgent, whatever the fan has paid for (INV-19); disputes have their own queue.
const crisis = await report(fan, {
  kind: "crisis",
  creatorId: MAYA,
  reason: "I am not safe tonight and need help.",
});
step(
  "a crisis report is urgent in the safety queue",
  crisis.status === 201 &&
    crisis.json.state === "urgent" &&
    crisis.json.queue === "safety",
  code(crisis),
);
const dispute = await report(fan, {
  kind: "dispute",
  creatorId: MAYA,
  reason: "The reply I paid for never came.",
});
await open(support, dispute.json.id);
step(
  "a refund needs a request record",
  code(await decide(support, dispute.json.id, 1, "full_refund")) ===
    "409 refund_unavailable",
);
step(
  "a dispute is decided in the disputes queue",
  dispute.json.queue === "disputes" &&
    (await decide(support, dispute.json.id, 1, "uphold")).status === 200,
);

// Verification: reject, then approve, through the effect that changes the proof.
async function verification(resolution) {
  const proof = await call("POST", `/v1/identity/${MAYA}/proof`, maya, {
    platform: "instagram",
    accountUrl: "https://instagram.com/maya_kiln",
  });
  await call("POST", `/v1/identity/proof/${proof.json?.id}/submit`, maya, {
    postUrl: `https://instagram.com/p/${proof.json?.code}`,
  });
  const filed = await report(maya, {
    kind: "verification",
    creatorId: MAYA,
    reason: "Please review my creator proof.",
  });
  await open(verifier, filed.json.id);
  const alone = await decide(verifier, filed.json.id, 1, resolution);
  await open(ops, filed.json.id);
  const decided = await decide(ops, filed.json.id, 1, resolution);
  return {
    proof: proof.json?.id,
    alone,
    decided,
    state: await settle(filed.json.id),
  };
}
const rejected = await verification("reject_verification");
step(
  "the verification reviewer cannot decide alone",
  code(rejected.alone) === "403 supervisor_required",
  code(rejected.alone),
);
step(
  "a creator's proof can be rejected",
  rejected.decided.status === 200 &&
    rejected.state === "resolved" &&
    sql(
      `SELECT state FROM creator.creator_proof WHERE id='${rejected.proof}'`,
    ) === "rejected",
  `${code(rejected.decided)}, ${rejected.state}`,
);
const approved = await verification("verify_creator");
step(
  "and approved",
  approved.decided.status === 200 &&
    approved.state === "resolved" &&
    sql(
      `SELECT state FROM creator.creator_proof WHERE id='${approved.proof}'`,
    ) === "approved" &&
    sql(
      `SELECT verification FROM creator.creator_profile WHERE id='${MAYA}'`,
    ) === "verified",
  `${code(approved.decided)}, ${approved.state}`,
);

// No reviewer handles a case about their own account.
const own = await report(support, {
  kind: "support",
  reason: "Please waive my own payout fee as a favor.",
});
step(
  "a reviewer cannot open their own case",
  code(await open(support, own.json.id)) ===
    "403 independent_reviewer_required",
);
step(
  "another reviewer can",
  (await open(ops, own.json.id)).status === 200 &&
    (await decide(ops, own.json.id, 1, "close")).status === 200,
);

// Pause: immediate denial, then the case should resolve and be liftable.
if (withPause) {
  const pause = await report(fan, {
    kind: "pause",
    creatorId: MAYA,
    reason: "Please pause this AI while it is reviewed.",
  });
  await open(ops, pause.json.id);
  const paused = await decide(ops, pause.json.id, 1, "pause_creator");
  const thread = sql(
    `SELECT t.id FROM creator.thread t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE t.creator_id='${MAYA}' AND f.account_id='10000000-0000-4000-8000-000000000001'`,
  );
  const fanId = sql(
    `SELECT id FROM creator.fan_profile WHERE account_id='10000000-0000-4000-8000-000000000001'`,
  );
  step(
    "a pause denies the creator's conversations at once",
    paused.status === 200 &&
      Boolean(thread) &&
      code(
        await call("GET", `/v1/conversations/${MAYA}/${fanId}`, fan),
      ).startsWith("403"),
  );
  const state = await settle(pause.json.id);
  step("the pause case resolves", state === "resolved", state);
  skip("unpause", "no resolution or endpoint lifts a pause");
} else
  skip(
    "pause and unpause",
    "pass --with-pause; it leaves Maya paused until a reset",
  );
console.log(`${failures} failed, ${skipped} not run`);
process.exit(failures || skipped ? 1 : 0);
