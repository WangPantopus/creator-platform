#!/usr/bin/env node
// E1.8 edges for lane 1's deletion domains (identity and media):
//   T  a fan deletes one conversation: identity and media finish, the account
//      keeps its profile and sessions;
//   M  a fan who holds media deletes the account: media refuses (fixture row,
//      because no product path creates media while media is frozen);
//   C  a creator deletes the account: identity and media refuse at once.
// Uses development fans 2 (T, then M) and 1 (C); run on a fresh stack.
//   node tests/scenarios/lane-1/e1-8-edges.mjs
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

const { step, note, finish } = reporter();
const tasks = (id) =>
  sql(
    `SELECT domain,state,coalesce(error_code,'') FROM creator_trust.privacy_task WHERE job_id='${id}' ORDER BY domain`,
  );
const task = (rows, domain) => rows.find(([d]) => d === domain) ?? [];
async function settle(id, domains, seconds = 90) {
  for (let waited = 0; waited < seconds; waited += 3) {
    const rows = tasks(id);
    if (
      domains.every(
        (d) => !["pending", "running", "retry"].includes(task(rows, d)[1]),
      )
    )
      return rows;
    await sleep(3000);
  }
  return tasks(id);
}
const request = (token, body) =>
  call("POST", "/v1/trust/privacy/jobs", {
    token,
    body: {
      proof: "LOCAL DEVELOPMENT",
      idempotencyKey: key(body.kind),
      ...body,
    },
  });
async function fanWithThread(n, label) {
  const signed = await signIn(n);
  const fan =
    signed.session.fan ??
    (
      await call("POST", "/v1/identity/fan-profile", {
        token: signed.token,
        body: { handle: `${label}${Date.now() % 1e6}`, intro: "Edge case fan" },
      })
    ).json;
  const providers = (
    await call("GET", "/v1/conversations/capabilities", { token: signed.token })
  ).json;
  const begun = await call("POST", "/v1/conversations/begin", {
    token: signed.token,
    body: {
      creatorId: MAYA,
      policyVersion: providers.providers.version,
      accessNoticeAccepted: true,
      idempotencyKey: key("begin"),
    },
  });
  return {
    ...signed,
    fan,
    threadId:
      begun.json?.threadId ??
      sql(
        `SELECT id FROM creator.thread WHERE creator_id='${MAYA}' AND fan_id='${fan.id}'`,
      )[0]?.[0],
  };
}

// T: one conversation.
const two = await fanWithThread(2, "edgefan");
const before = sql(
  `SELECT handle,intro FROM creator.fan_profile WHERE id='${two.fan.id}'`,
)[0];
const thread = await request(two.token, {
  kind: "delete",
  scope: "thread",
  creatorId: MAYA,
  threadId: two.threadId,
});
step("T thread deletion accepted", thread.status === 202, describe(thread));
const threadTasks = await settle(thread.json.id, [
  "identity",
  "media",
  "growth",
]);
note(
  `thread tasks: ${threadTasks.map((r) => r.filter(Boolean).join(":")).join("  ")}`,
);
step(
  "T identity finishes for one conversation",
  task(threadTasks, "identity")[1] === "complete",
  task(threadTasks, "identity").join(":"),
);
step(
  "T media finishes for one conversation",
  task(threadTasks, "media")[1] === "complete",
  task(threadTasks, "media").join(":"),
);
step(
  "T growth's missing adapter shows as blocked with its own code",
  task(threadTasks, "growth")[1] === "blocked" &&
    task(threadTasks, "growth")[2] === "growth_scope_adapter_required",
  task(threadTasks, "growth").join(":"),
);
const after = sql(
  `SELECT handle,intro FROM creator.fan_profile WHERE id='${two.fan.id}'`,
)[0];
step(
  "T the profile is untouched",
  after?.join() === before?.join(),
  after?.join(),
);
const still = await call("GET", "/v1/identity/session", { token: two.token });
step("T the fan is still signed in", still.status === 200, describe(still));
const read = await call("GET", `/v1/conversations/${MAYA}/${two.fan.id}`, {
  token: two.token,
});
step(
  "T that conversation is closed to them at once",
  read.status >= 400,
  describe(read),
);

// M: held media blocks media erasure; identity keeps waiting.
sql(
  `INSERT INTO creator.call_offer(id,creator_id,fan_id,thread_id,commitment_id,creator_time_zone,fan_time_zone,expires_at,authorization_version) VALUES(gen_random_uuid(),'${MAYA}','${two.fan.id}','${two.threadId}',gen_random_uuid(),'UTC','UTC',now()+interval '1 day',1) RETURNING id`,
);
const held = await request(two.token, { kind: "delete", scope: "account" });
step("M account deletion accepted", held.status === 202, describe(held));
const heldTasks = await settle(held.json.id, ["media"]);
step(
  "M media refuses while media is held",
  task(heldTasks, "media")[1] === "blocked" &&
    task(heldTasks, "media")[2] === "media_retention_unconfigured",
  task(heldTasks, "media").join(":"),
);
step(
  "M identity waits rather than erasing",
  task(heldTasks, "identity")[2] === "identity_erasure_waiting",
  task(heldTasks, "identity").join(":"),
);
const kept = sql(
  `SELECT handle LIKE 'deleted-%' FROM creator.fan_profile WHERE id='${two.fan.id}'`,
)[0]?.[0];
step("M the profile is not redacted early", kept === "f", `redacted ${kept}`);

// C: a creator account.
const one = await signIn(1);
const creator = await call("POST", "/v1/identity/creator-profile", {
  token: one.token,
  body: {
    handle: `edgecreator${Date.now() % 1e6}`,
    displayName: "Edge Creator",
  },
});
step("C creator profile created", creator.status === 200, describe(creator));
const closing = await request(one.token, { kind: "delete", scope: "account" });
step(
  "C creator account deletion accepted",
  closing.status === 202,
  describe(closing),
);
const creatorTasks = await settle(closing.json.id, ["identity", "media"]);
step(
  "C identity refuses at once",
  task(creatorTasks, "identity")[1] === "blocked" &&
    task(creatorTasks, "identity")[2] === "identity_retention_unconfigured",
  task(creatorTasks, "identity").join(":"),
);
step(
  "C media refuses at once",
  task(creatorTasks, "media")[1] === "blocked" &&
    task(creatorTasks, "media")[2] === "media_retention_unconfigured",
  task(creatorTasks, "media").join(":"),
);
const profile = sql(
  `SELECT count(*) FROM creator.creator_profile WHERE account_id='${one.session.accountId}'`,
)[0]?.[0];
step(
  "C the creator profile is untouched",
  profile === "1",
  `${profile} profile`,
);
finish();
