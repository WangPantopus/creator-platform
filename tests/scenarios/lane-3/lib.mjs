// Shared helpers for the lane 3 scenario scripts, against a running local stack
// (`node infra/local/stack.mjs up --lane 3`). Plain Node: real HTTP and the
// real WebSocket for what a person does, SQL only to read the state behind the
// screen and the database's own statement statistics. Fakes: the development
// identity and the stack's model fake, both at the outer edge.
import { createRequire } from "node:module";
import {
  ACTORS,
  MAYA_CREATOR_ID,
  call,
  key,
  reporter,
  signIn,
  sleep,
} from "../lane-2/lib.mjs";

export { ACTORS, MAYA_CREATOR_ID, call, key, reporter, signIn, sleep };
const require = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
);
const pg = require("pg");

export const flag = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
export const API = flag(
  "--api",
  process.env.QELVORA_API_URL ?? "http://127.0.0.1:56431",
);
export const MODEL = flag(
  "--model",
  process.env.QELVORA_FAKE_MODEL_URL ?? "http://127.0.0.1:56433",
);
// The stack's documented loopback-only test constant, never a real secret.
const ADMIN = flag(
  "--db",
  process.env.QELVORA_STACK_DATABASE_URL ??
    "postgresql://postgres:foundation-test-only@127.0.0.1:56430/creator_stack",
);
export const DB_NAME = new URL(ADMIN).pathname.slice(1);
const pools = new Map();
const pool = (database) => {
  const url = new URL(ADMIN);
  if (database) url.pathname = `/${database}`;
  if (!pools.has(url.href))
    pools.set(url.href, new pg.Pool({ connectionString: url.href, max: 2 }));
  return pools.get(url.href);
};
/** Read the product database (state behind the screen). */
export const sql = async (text, values) =>
  (await pool().query(text, values)).rows;
/** Statement statistics live in the `postgres` database, outside the product catalogue. */
export const stats = async (text, values) =>
  (await pool("postgres").query(text, values)).rows;
export const closeDb = () =>
  Promise.all([...pools.values()].map((p) => p.end()));

/** Fan account with a profile and an open conversation with Maya. */
export async function openFan(accountId, handle) {
  const { token, session } = await signIn(API, accountId);
  let fan = session.fan;
  if (!fan) {
    const saved = await call(API, "POST", "/v1/identity/fan-profile", {
      token,
      body: { handle, intro: "" },
    });
    if (saved.status !== 200)
      throw new Error(
        `fan profile refused: ${saved.status} ${saved.text.slice(0, 160)}`,
      );
    fan = saved.json;
  }
  const caps = (
    await call(API, "GET", "/v1/conversations/capabilities", { token })
  ).json;
  const begun = await call(API, "POST", "/v1/conversations/begin", {
    token,
    body: {
      creatorId: MAYA_CREATOR_ID,
      policyVersion: caps.providers.version,
      accessNoticeAccepted: true,
      idempotencyKey: key("begin"),
    },
  });
  if (begun.status !== 200 || !begun.json?.canSend)
    throw new Error(
      `conversation refused: ${begun.status} ${begun.text.slice(0, 160)}`,
    );
  return {
    token,
    fan,
    thread: `/v1/conversations/${MAYA_CREATOR_ID}/${fan.id}`,
  };
}

/** Subscribe to the thread's frames over the real WebSocket, timestamping each.
 * Like a real client it reconnects from its last cursor when the server closes
 * the socket (for example 1013 at the gateway's authority deadline). */
export function watchFrames(token, fanId) {
  const frames = [];
  const closes = [];
  const waiters = new Set();
  let cursor = 0;
  let stopped = false;
  let socket;
  const connect = () =>
    new Promise((resolve, reject) => {
      socket = new WebSocket(API.replace(/^http/u, "ws") + "/v1/realtime", [
        "pantopus-session",
        token,
      ]);
      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            kind: "subscribe",
            creatorId: MAYA_CREATOR_ID,
            fanId,
            cursor,
          }),
        );
        resolve();
      };
      socket.onerror = () => reject(new Error("realtime connection failed"));
      socket.onmessage = (event) => {
        const frame = {
          at: performance.now(),
          ...JSON.parse(String(event.data)),
        };
        if (frame.cursor <= cursor) return; // a replayed frame after reconnecting
        cursor = frame.cursor;
        frames.push(frame);
        for (const check of waiters) check();
      };
      socket.onclose = (event) => {
        if (stopped) return;
        closes.push({ at: performance.now(), code: event.code });
        setTimeout(
          () =>
            connect().catch(() =>
              closes.push({ at: performance.now(), code: "reconnect_failed" }),
            ),
          250,
        );
      };
    });
  const ready = connect();
  /** Resolve with the first frame matching `match`, or null after `ms`. */
  const until = (match, ms) =>
    new Promise((resolve) => {
      const check = () => {
        const found = frames.find(match);
        if (found) done(found);
      };
      const done = (value) => {
        waiters.delete(check);
        clearTimeout(timer);
        resolve(value);
      };
      const timer = setTimeout(() => done(null), ms);
      waiters.add(check);
      check();
    });
  return {
    ready,
    frames,
    closes,
    until,
    close: () => {
      stopped = true;
      socket.close();
    },
  };
}

/** Publish Maya's AI through the real Studio API (as Maya) when it is not live.
 * The stack's own seed uses a $5 daily cap, which the Claude adapter's cost
 * hold exceeds (lane 3 finding), so this takes the cap as a fixture choice. */
export async function ensureMaya(capMicros) {
  const agent = `/v1/agent/${MAYA_CREATOR_ID}`;
  const { token } = await signIn(API, ACTORS.maya, "/studio/ai");
  const read = async () =>
    (await call(API, "GET", `${agent}/state`, { token })).json;
  const send = (method, path, body) =>
    call(API, method, agent + path, {
      token,
      body,
      headers: { "Idempotency-Key": key("lane3-maya") },
    });
  let state = await read();
  if (state.liveVersion && !state.paused)
    return `already live (cap ${state.liveVersion.configuration?.dailyCostCapMicros ?? "?"})`;
  const configuration = {
    mode: "companion",
    tone: "As written",
    styleCard: "",
    examples: [],
    rules: ["Always say you are the creator's AI, never the creator."],
    neverReveal: ["home address"],
    handoff: "Offer to ask Maya to step in when a question needs her.",
    dailyCostCapMicros: capMicros,
    sessionNudgeMinutes: 90,
    usefulnessCriteria: "Helpful, specific and honest about being an AI.",
    styleCriteria: "Warm, plain and short.",
  };
  const must = (reply, status, what) => {
    if (reply.status !== status)
      throw new Error(`${what}: ${reply.status} ${reply.text.slice(0, 200)}`);
  };
  must(
    await send("PUT", "/draft", {
      expectedRevision: state.revision,
      configuration,
    }),
    200,
    "draft",
  );
  must(
    await send("POST", "/license", {
      proofReference: `development-synthetic:${MAYA_CREATOR_ID}`,
      counselVersion: "development-synthetic-unreviewed",
      permittedUses: ["text_ai"],
      termEndsAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
    }),
    200,
    "license",
  );
  state = await read();
  must(
    await send("POST", "/evaluations", { expectedRevision: state.revision }),
    202,
    "evaluation",
  );
  let evaluation;
  for (
    let waited = 0;
    waited < 120 && (!evaluation || evaluation.state === "running");
    waited += 2
  ) {
    await sleep(2000);
    evaluation = (await read()).evaluation;
  }
  if (evaluation?.state !== "passed")
    throw new Error(`evaluation ${evaluation?.state}`);
  state = await read();
  must(
    await send("POST", "/publish", {
      expectedRevision: state.revision,
      evaluationId: evaluation.id,
      changes: "Lane 3 measurement publish",
    }),
    200,
    "publish",
  );
  return `published with daily cap ${capMicros}`;
}

/** p-th percentile (nearest rank) of a list of numbers. */
export const percentile = (values, p) => {
  const sorted = values.filter((v) => v != null).sort((a, b) => a - b);
  return sorted.length
    ? sorted[
        Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
      ]
    : null;
};
