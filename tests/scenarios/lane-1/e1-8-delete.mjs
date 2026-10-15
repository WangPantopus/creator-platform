#!/usr/bin/env node
// E1.8: a fan exports, then deletes their account in the product. Checks the
// immediate denial on every device, the repeat, each domain's task and the
// state behind it. Needs an unused development fan (a deleted one stays
// closed), so run it on a fresh stack: `node infra/local/stack.mjs reset --lane 1`.
//   node tests/scenarios/lane-1/e1-8-delete.mjs [actor 1..6, default 6] [--wait 180]
import {
  MAYA,
  call,
  describe,
  key,
  reporter,
  signIn,
  sleep,
  sql,
} from "./lib.mjs";

const n = Number(process.argv[2] ?? 6);
const at = process.argv.indexOf("--wait");
const waitSeconds = at > 0 ? Number(process.argv[at + 1]) : 180;
const { step, skip, note, finish } = reporter();
const LANE_ONE = ["identity", "media"];

// Setup: two devices, a profile, a conversation with Maya and one message.
const one = await signIn(n);
const two = await signIn(n);
const account = one.session.accountId;
step(
  "setup: two devices signed in",
  one.token !== two.token && two.session.accountId === account,
);
let fan = one.session.fan;
if (!fan)
  fan = (
    await call("POST", "/v1/identity/fan-profile", {
      token: one.token,
      body: {
        handle: `e18fan${Date.now() % 1e6}`,
        intro: "I throw pots on weekends",
      },
    })
  ).json;
const providers = (
  await call("GET", "/v1/conversations/capabilities", { token: one.token })
).json;
const begun = await call("POST", "/v1/conversations/begin", {
  token: one.token,
  body: {
    creatorId: MAYA,
    policyVersion: providers.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: key("begin"),
  },
});
const thread = `/v1/conversations/${MAYA}/${fan.id}`;
const sent = await call("POST", `${thread}/messages`, {
  token: one.token,
  body: {
    idempotencyKey: key("m"),
    text: "E1.8 message that must not survive deletion",
    clientSequence: Date.now() % 1e6,
  },
});
step(
  "setup: profile, conversation and a message",
  Boolean(fan?.id) && begun.status === 200 && sent.status === 200,
  `${describe(begun)}, ${describe(sent)}`,
);

async function settle(jobId) {
  for (let waited = 0; waited <= waitSeconds; waited += 5) {
    const tasks = sql(
      `SELECT domain,state,coalesce(error_code,'') FROM creator_trust.privacy_task WHERE job_id='${jobId}' ORDER BY domain`,
    );
    if (
      tasks.every(
        ([, state]) => !["pending", "running", "leased"].includes(state),
      ) &&
      waited >= 30
    )
      return tasks;
    await sleep(5000);
  }
  return sql(
    `SELECT domain,state,coalesce(error_code,'') FROM creator_trust.privacy_task WHERE job_id='${jobId}' ORDER BY domain`,
  );
}
const show = (tasks) =>
  tasks.map(([d, s, c]) => `${d}:${s}${c ? `:${c}` : ""}`).join("  ");

// Export before deletion: complete, and only this person's records.
const exported = await call("POST", "/v1/trust/privacy/jobs", {
  token: one.token,
  body: {
    kind: "export",
    scope: "account",
    proof: "LOCAL DEVELOPMENT",
    idempotencyKey: key("export"),
  },
});
step("export accepted", exported.status === 202, describe(exported));
const exportTasks = await settle(exported.json.id);
note(`export tasks: ${show(exportTasks)}`);
step(
  "export: lane 1 domains complete",
  LANE_ONE.every((d) =>
    exportTasks.some(([dd, s]) => dd === d && s === "complete"),
  ),
);
const exportJob = sql(
  `SELECT state FROM creator_trust.privacy_job WHERE id='${exported.json.id}'`,
)[0]?.[0];
step(
  "export: the whole job completes",
  exportJob === "complete",
  `job ${exportJob}`,
);

// Delete: immediate denial everywhere, one job for a repeat.
const body = {
  kind: "delete",
  scope: "account",
  proof: "LOCAL DEVELOPMENT",
  idempotencyKey: key("delete"),
};
const deleted = await call("POST", "/v1/trust/privacy/jobs", {
  token: one.token,
  body,
});
step(
  "delete accepted with immediate denial",
  deleted.status === 202 && deleted.json?.immediateDeny === true,
  describe(deleted),
);
const repeat = await call("POST", "/v1/trust/privacy/jobs", {
  token: one.token,
  body,
});
step(
  "the same delete again returns the same job",
  repeat.json?.id === deleted.json?.id,
  describe(repeat),
);
for (const [name, device] of [
  ["device 1", one],
  ["device 2", two],
]) {
  const session = await call("GET", "/v1/identity/session", {
    token: device.token,
  });
  const read = await call("GET", thread, { token: device.token });
  step(
    `${name} is refused at once`,
    session.status >= 400 && read.status >= 400,
    `session ${describe(session)}, thread ${describe(read)}`,
  );
}
const again = await call("POST", "/v1/identity/continue", {
  body: { returnTo: "/home" },
});
const back = await call("POST", "/v1/identity/complete", {
  body: { continuationId: again.json?.continuationId, code: account },
});
step(
  "signing in again does not reopen the deleted account",
  back.status >= 400,
  describe(back),
);
const progress = await call(
  "GET",
  `/v1/trust/privacy/jobs/${deleted.json.id}`,
  { token: two.token },
);
step(
  "device 2 still sees the deletion's progress",
  progress.status === 200 && progress.json?.id === deleted.json.id,
  describe(progress),
);

// Each domain's task, then the state behind it. Identity erases last.
const deleteTasks = await settle(deleted.json.id);
note(`delete tasks: ${show(deleteTasks)}`);
const others = deleteTasks.filter(([d]) => d !== "identity");
const identity = deleteTasks.find(([d]) => d === "identity");
step(
  "delete: media task complete",
  deleteTasks.some(([d, s]) => d === "media" && s === "complete"),
);
if (others.every(([, s]) => s === "complete"))
  step(
    "delete: identity erases after the others",
    identity?.[1] === "complete",
    identity?.join(":"),
  );
else
  step(
    "delete: identity waits for the other domains, without a dead letter",
    identity?.[1] === "retry" && identity?.[2] === "identity_erasure_waiting",
    identity?.join(":"),
  );
const job = sql(
  `SELECT state FROM creator_trust.privacy_job WHERE id='${deleted.json.id}'`,
)[0]?.[0];
step("delete: the whole job completes", job === "complete", `job ${job}`);
const [tombstone] = sql(
  `SELECT count(*) FROM creator_trust.tombstone WHERE account_id='${account}' AND scope='account'`,
);
step("an account tombstone exists", Number(tombstone[0]) >= 1);
const [messages] = sql(
  `SELECT count(*) FROM creator.message m JOIN creator.thread t ON t.id=m.thread_id WHERE t.fan_id='${fan.id}' AND t.deleted_at IS NULL`,
);
step(
  "the conversation is gone",
  messages[0] === "0",
  `${messages[0]} live messages remain`,
);
const [profile] = sql(
  `SELECT handle LIKE 'deleted-%', intro='' FROM creator.fan_profile WHERE account_id='${account}'`,
);
const [sessions] = sql(
  `SELECT count(*), count(*) FILTER (WHERE revoked_at IS NULL OR upstream_cipher<>'') FROM creator.identity_session WHERE account_id='${account}'`,
);
if (identity?.[1] === "complete") {
  step(
    "fan handle and intro are gone",
    profile?.[0] === "t" && profile?.[1] === "t",
    profile?.join(","),
  );
  step(
    "every session revoked and its upstream token dropped",
    Number(sessions[0]) >= 2 && sessions[1] === "0",
    `${sessions[0]} sessions, ${sessions[1]} live`,
  );
} else {
  const waitingOn = others
    .filter(([, s]) => s !== "complete")
    .map(([d]) => d)
    .join(", ");
  step(
    "until then the profile and sessions are untouched",
    profile?.[0] === "f" && Number(sessions[1]) >= 1,
    `profile redacted ${profile?.[0]}, ${sessions[1]} live sessions`,
  );
  skip("fan handle and intro are gone", `identity waits for: ${waitingOn}`);
  skip(
    "every session revoked and its upstream token dropped",
    `identity waits for: ${waitingOn}`,
  );
}
const retained = sql(
  `SELECT domain||':'||category FROM creator_trust.retained_record WHERE job_id='${deleted.json.id}' ORDER BY 1`,
);
note(`retained: ${retained.map((r) => r[0]).join(", ") || "none"}`);
finish();
