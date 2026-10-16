#!/usr/bin/env node
// E1.9: authorship cannot be forged (INV-01). A fan session asking to post as
// the creator, the team, the system or any human_* state is refused, and the
// server alone sets who wrote each message. Development accounts: fan 1 (in a
// conversation with Maya), fan 2, Maya (creator, 3) and account 4 (Maya's
// team, triage). Checks the rows behind every answer. Fakes: the development
// identity and the model. It takes over and hands back Maya's thread with
// fan 1, so run it on a fresh stack.
//   node tests/scenarios/lane-1/e1-9-authorship.mjs
import { randomUUID } from "node:crypto";
import { call, describe, one, reporter, sleep, sql } from "./sign-in-lib.mjs";

const MAYA = "20000000-0000-4000-8000-000000000001";
const dev = (n) => `10000000-0000-4000-8000-00000000000${n}`;
const key = (label) => `${label}-${randomUUID()}`;
const { step, skip, finish } = reporter();
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
const code = (r) => r.json?.error?.code;
const [fan, otherFan, maya, team] = await Promise.all(
  [1, 2, 3, 4].map(development),
);
let fanId = (await call("GET", "/v1/identity/session", { token: fan })).json
  ?.fan?.id;
if (!fanId)
  fanId = (
    await call("POST", "/v1/identity/fan-profile", {
      token: fan,
      body: { handle: `authfan${Date.now() % 1e6}`, intro: "" },
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
const root = `/v1/conversations/${MAYA}/${fanId}`;
const rows = () =>
  sql(
    `SELECT m.author_kind,coalesce(m.author_account_id::text,'-'),m.signed_act_id IS NOT NULL,m.text FROM creator.message m JOIN creator.thread t ON t.id=m.thread_id WHERE t.creator_id='${MAYA}' AND t.fan_id='${fanId}' ORDER BY m.created_at`,
  );
const count = () => rows().length;

// The fan's own message is the fan's.
const plain = `E1.9 plain message ${Date.now()}`;
const sent = await call("POST", `${root}/messages`, {
  token: fan,
  body: { text: plain, idempotencyKey: key("m"), clientSequence: 1 },
});
const own = rows().find((row) => row[3] === plain);
step(
  "a fan's message is stored as the fan's, by the fan's account",
  sent.status === 200 && own?.[0] === "fan" && own?.[1] === dev(1),
  `${describe(sent)}; ${own?.slice(0, 3).join(",")}`,
);

// Asking for another author in the body is refused, and nothing is stored.
const before = count();
const forged = [];
for (const extra of [
  { authorKind: "human_creator" },
  { authorKind: "team" },
  { authorKind: "system" },
  { author: "creator" },
  { role: "human_broadcast" },
  { signedActId: randomUUID() },
]) {
  const r = await call("POST", `${root}/messages`, {
    token: fan,
    body: {
      text: `forged ${JSON.stringify(extra)}`,
      idempotencyKey: key("forged"),
      clientSequence: 2,
      ...extra,
    },
  });
  forged.push(
    `${Object.keys(extra)[0]}=${Object.values(extra)[0]}: ${describe(r)}`,
  );
}
step(
  "a fan's message naming another author, role or signature is refused and not stored",
  forged.every((line) => line.endsWith("400 invalid_request")) &&
    count() === before,
  forged.join("; "),
);

// The fan cannot use the creator's or the team's routes, nor another fan's thread.
const asCreator = await call("POST", `${root}/human-replies`, {
  token: fan,
  body: {
    text: "I am Maya",
    signedActId: randomUUID(),
    idempotencyKey: key("h"),
  },
});
const asTeam = await call("POST", `${root}/team-replies`, {
  token: fan,
  body: { text: "I am Maya's team", idempotencyKey: key("t") },
});
const takeover = await call("POST", `${root}/takeover`, {
  token: fan,
  body: { idempotencyKey: key("takeover") },
});
const intoOther = await call("POST", `${root}/messages`, {
  token: otherFan,
  body: { text: "Not my thread", idempotencyKey: key("x"), clientSequence: 1 },
});
// (A fan starting the creator's signature is refused with
// creator_role_required: E1.5, e1-5-apple-creator.mjs. On a development stack
// a thread reply has no signed-subject policy, so it cannot be asked here.)
step(
  "a fan is refused as the creator, as the team, for takeover and in another fan's thread",
  code(asCreator) === "creator_required" &&
    code(asTeam) === "team_required" &&
    code(takeover) === "creator_required" &&
    intoOther.status === 403 &&
    count() === before,
  [asCreator, asTeam, takeover, intoOther]
    .map((r) => `${r.status} ${code(r)}`)
    .join(", "),
);

// The AI's reply is the AI's; wait for it so the team can reply.
for (let i = 0; i < 30 && !rows().some((row) => row[0] === "ai"); i += 1)
  await sleep(2000);
const ai = rows().find((row) => row[0] === "ai");
step(
  "the AI's reply is stored as the AI's, with no account behind it",
  ai?.[0] === "ai" && ai?.[1] === "-",
  ai?.slice(0, 3).join(","),
);

// The team writes only as the team, never as the creator.
const teamText = `Maya's team here ${Date.now()}`;
let teamReply;
for (let i = 0; i < 10; i += 1) {
  teamReply = await call("POST", `${root}/team-replies`, {
    token: team,
    body: { text: teamText, idempotencyKey: key("team") },
  });
  if (code(teamReply) !== "reply_in_progress") break;
  await sleep(2000);
}
const teamAsCreator = await call("POST", `${root}/human-replies`, {
  token: team,
  body: {
    text: "As Maya",
    signedActId: randomUUID(),
    idempotencyKey: key("th"),
  },
});
step(
  "the team cannot reply as the creator",
  code(teamAsCreator) === "creator_required" &&
    !rows().some((row) => row[0] === "human_creator"),
  describe(teamAsCreator),
);
if (teamReply.status === 200) {
  const teamRow = rows().find((row) => row[3] === teamText);
  step(
    "a team reply is stored as the team's, by the team member",
    teamRow?.[0] === "team" && teamRow?.[1] === dev(4),
    teamRow?.slice(0, 3).join(","),
  );
} else
  skip(
    "a team reply is stored as the team's, by the team member",
    `team replies are not composed on a development stack (${describe(teamReply)})`,
  );

// The creator's own voice needs the takeover and a signature over the exact text.
const noTakeover = await call("POST", `${root}/human-replies`, {
  token: maya,
  body: { text: "Hello", signedActId: randomUUID(), idempotencyKey: key("n") },
});
const took = await call("POST", `${root}/takeover`, {
  token: maya,
  body: { idempotencyKey: key("takeover") },
});
const unsigned = await call("POST", `${root}/human-replies`, {
  token: maya,
  body: { text: "Hello", signedActId: randomUUID(), idempotencyKey: key("u") },
});
await call("POST", `${root}/handback`, {
  token: maya,
  body: { idempotencyKey: key("handback") },
});
step(
  "the creator needs the takeover, then a real signature; without one nothing is stored",
  code(noTakeover) === "takeover_required" &&
    took.status === 200 &&
    code(unsigned) === "signed_act_required" &&
    !rows().some((row) => row[0] === "human_creator"),
  `${describe(noTakeover)}, takeover ${describe(took)}, unsigned ${describe(unsigned)}`,
);

// Behind the API: the database refuses a creator-voiced message with no signature.
const direct = await (async () => {
  try {
    sql(
      `BEGIN; INSERT INTO creator.message(thread_id,creator_id,fan_id,author_kind,text,delivery_state,control_epoch,sequence) SELECT t.id,t.creator_id,t.fan_id,'human_creator','forged in the database','delivered',t.control_epoch,999 FROM creator.thread t WHERE t.creator_id='${MAYA}' AND t.fan_id='${fanId}'; ROLLBACK;`,
    );
    return "accepted";
  } catch (error) {
    return String(error.stderr ?? error.message).split("\n")[0];
  }
})();
step(
  "the database itself refuses a creator-voiced message without a signature",
  /A named act requires an exact creator-signed assertion/u.test(direct) &&
    one(
      `SELECT count(*) FROM creator.message WHERE text='forged in the database'`,
    ) === "0",
  direct,
);

// What the fan reads: each message with the author the server set.
const thread = await call("GET", root, { token: fan });
const shown = (thread.json?.messages ?? thread.json?.items ?? []).map(
  (m) => m.authorKind ?? m.author_kind,
);
step(
  "the fan reads every message with the server's author: theirs, the AI's and the system's takeover notices, nothing forged",
  thread.status === 200 &&
    ["fan", "ai"].every((kind) => shown.includes(kind)) &&
    shown.every((kind) => ["fan", "ai", "system", "team"].includes(kind)),
  `${describe(thread)} ${[...new Set(shown)].join(",")}`,
);
finish();
