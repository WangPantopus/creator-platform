// The real lane 7 stack's API and database for the stack-*.mjs scenarios.
// LANE7_STACK_API names a stack's API (its first port + 1), and
// LANE7_STACK_POSTGRES its database container. Development identities are
// synthetic; no access token is printed, put in a fixture or written to disk.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { sleep } from "./lib.mjs";

export const api = process.env.LANE7_STACK_API ?? "http://127.0.0.1:56471";
export const creator = "20000000-0000-4000-8000-000000000001";
export const devon = "20000000-0000-4000-8000-000000000002";
// The stack's own database, as postgres: psql variables, never interpolation.
export function psql(input, variables = {}) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      process.env.LANE7_STACK_POSTGRES ?? "qelvora-lane7-postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "creator_stack",
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      ...Object.entries(variables).flatMap(([name, value]) => [
        "-v",
        `${name}=${value}`,
      ]),
    ],
    { encoding: "utf8", input },
  ).trim();
}
export async function request(method, path, token, body, headers = {}) {
  // A kept-alive socket the server closed while the app was being driven fails
  // the next fetch ("other side closed"); a read is safe to send again once.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(api + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(30000),
      });
      return { status: response.status, body: await response.json() };
    } catch (error) {
      if (method !== "GET" || attempt > 0 || !(error instanceof TypeError))
        throw error;
    }
  }
}
export async function signIn(number) {
  const begun = await request("POST", "/v1/identity/continue", null, {
    returnTo: "/home",
  });
  assert.equal(begun.status, 200);
  const result = await request("POST", "/v1/identity/complete", null, {
    continuationId: begun.body.continuationId,
    code: `10000000-0000-4000-8000-00000000000${number}`,
  });
  assert.equal(result.status, 200);
  return result.body;
}
// The stack publishes Maya's AI only. Devon's and Priya's go through the same
// Studio steps as lane 2's seed-maya.mjs, as their owners, once per stack.
export async function publishAI(number, creatorId, name) {
  const owner = await signIn(number);
  const agent = `/v1/agent/${creatorId}`;
  const state = async () => {
    const read = await request("GET", `${agent}/state`, owner.token);
    assert.equal(read.status, 200);
    return read.body;
  };
  const send = async (method, path, body, status = 200) => {
    const reply = await request(method, agent + path, owner.token, body, {
      "Idempotency-Key": `lane7-${name.toLowerCase()}-${randomUUID()}`,
    });
    assert.equal(reply.status, status, `${name}'s ${path}: ${reply.status}`);
  };
  let current = await state();
  if (current.liveVersion && !current.paused) return;
  assert.ok(!current.liveVersion, `Do not replace or resume ${name}'s AI`);
  await send("PUT", "/draft", {
    expectedRevision: current.revision,
    configuration: {
      mode: "companion",
      tone: "As written",
      styleCard: "",
      examples: [],
      rules: ["Always say you are the creator's AI, never the creator."],
      neverReveal: ["home address"],
      handoff: `Offer to ask ${name} to step in when a question needs them.`,
      dailyCostCapMicros: 5_000_000,
      sessionNudgeMinutes: 90,
      usefulnessCriteria: "Helpful, specific and honest about being an AI.",
      styleCriteria: "Warm, plain and short.",
    },
  });
  await send("POST", "/license", {
    proofReference: `development-synthetic:${creatorId}`,
    counselVersion: "development-synthetic-unreviewed",
    permittedUses: ["text_ai"],
    termEndsAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
  });
  current = await state();
  await send(
    "POST",
    "/evaluations",
    { expectedRevision: current.revision },
    202,
  );
  const until = Date.now() + 120000;
  while (!current.evaluation || current.evaluation.state === "running") {
    assert.ok(Date.now() < until, `${name}'s evaluation must finish`);
    await sleep(2000);
    current = await state();
  }
  assert.equal(current.evaluation.state, "passed");
  await send("POST", "/publish", {
    expectedRevision: current.revision,
    evaluationId: current.evaluation.id,
    changes: "Lane 7 development publish",
  });
  current = await state();
  assert.ok(
    current.liveVersion && !current.paused,
    `${name}'s AI must be live`,
  );
  console.log(`PASS real API: ${name}'s AI published through the Studio API`);
}
// Priya, development actor six, makes her profile through the identity API.
// Its verification is a row, a stand-in for lane 1's review, as in lane 5's
// seedCreator. Once per stack.
export async function preparePriya() {
  const owner = await signIn(6);
  let id = owner.session.creator?.id;
  if (!id) {
    const made = await request(
      "POST",
      "/v1/identity/creator-profile",
      owner.token,
      { handle: "priya", displayName: "Priya" },
    );
    assert.equal(made.status, 200, `Priya's profile: ${made.status}`);
    id = made.body.id;
  }
  assert.match(id, /^[0-9a-f-]{36}$/u);
  psql(
    "UPDATE creator.creator_profile SET verification='verified' WHERE id=:'id'::uuid AND account_id=:'account'::uuid;",
    { id, account: "10000000-0000-4000-8000-000000000006" },
  );
  await publishAI(6, id, "Priya");
  return id;
}
