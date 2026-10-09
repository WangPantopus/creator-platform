// Publishes the fictional creator Maya's AI on a running local stack, through
// the real Studio API as Maya (development identity), with the model fake at
// the outer edge. Safe to run again: it stops if her AI is already live.
//   node tests/scenarios/lane-2/seed-maya.mjs [--api http://127.0.0.1:56421]
import {
  ACTORS,
  MAYA_CREATOR_ID,
  call,
  key,
  reporter,
  signIn,
  sleep,
} from "./lib.mjs";

const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const base = flag(
  "--api",
  process.env.QELVORA_API_URL ?? "http://127.0.0.1:56421",
);
const { step, finish } = reporter();
const agent = `/v1/agent/${MAYA_CREATOR_ID}`;

const { token } = await signIn(base, ACTORS.maya, "/studio/ai");
const read = async () =>
  (await call(base, "GET", `${agent}/state`, { token })).json;
const send = (method, path, body) =>
  call(base, method, agent + path, {
    token,
    body,
    headers: { "Idempotency-Key": key("seed-maya") },
  });

let state = await read();
if (state.liveVersion && !state.paused) {
  step(
    "Maya's AI is already live",
    true,
    `version ${state.liveVersion.number ?? "?"}`,
  );
  finish();
}

const configuration = {
  mode: "companion",
  tone: "As written",
  styleCard: "",
  examples: [],
  rules: ["Always say you are the creator's AI, never the creator."],
  neverReveal: ["home address"],
  handoff: "Offer to ask Maya to step in when a question needs her.",
  dailyCostCapMicros: 5_000_000,
  sessionNudgeMinutes: 90,
  usefulnessCriteria: "Helpful, specific and honest about being an AI.",
  styleCriteria: "Warm, plain and short.",
};
let reply = await send("PUT", "/draft", {
  expectedRevision: state.revision,
  configuration,
});
step("draft saved", reply.status === 200, `status ${reply.status}`);

reply = await send("POST", "/license", {
  proofReference: `development-synthetic:${MAYA_CREATOR_ID}`,
  counselVersion: "development-synthetic-unreviewed",
  permittedUses: ["text_ai"],
  termEndsAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
});
step(
  "development license recorded",
  reply.status === 200,
  `status ${reply.status} ${reply.status === 200 ? "" : reply.text.slice(0, 160)}`,
);

state = await read();
reply = await send("POST", "/evaluations", {
  expectedRevision: state.revision,
});
step(
  "evaluation started",
  reply.status === 202,
  `status ${reply.status} ${reply.status === 202 ? "" : reply.text.slice(0, 160)}`,
);

let evaluation = null;
for (let waited = 0; waited < 120; waited += 2) {
  await sleep(2000);
  evaluation = (await read()).evaluation;
  if (evaluation && evaluation.state !== "running") break;
}
step(
  "evaluation passed",
  evaluation?.state === "passed",
  `${evaluation?.state ?? "none"}, ${evaluation?.cases?.length ?? 0} cases`,
);
if (evaluation?.state !== "passed") {
  for (const c of evaluation?.cases ?? [])
    if (c.state !== "pass")
      process.stdout.write(`  case "${c.name}": ${c.reason}\n`);
  finish();
}

state = await read();
reply = await send("POST", "/publish", {
  expectedRevision: state.revision,
  evaluationId: evaluation.id,
  changes: "Initial development publish",
});
step(
  "published",
  reply.status === 200,
  `status ${reply.status} ${reply.status === 200 ? "" : reply.text.slice(0, 200)}`,
);

state = await read();
step(
  "Maya's AI is live",
  Boolean(state.liveVersion) && !state.paused,
  `paused=${state.paused}`,
);
finish();
