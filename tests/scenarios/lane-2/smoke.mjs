// Smoke check for a running local stack (the seed of every lane's checks).
// A fan signs in with the development identity, starts a conversation with the
// fictional creator Maya, sends a message and must see the acknowledgment; then
// the AI's first sentence should arrive (the generation worker and the model
// fake are healthy). Prints one line per step; exits non-zero if a required step
// fails. The two reply steps only WARN unless --require-reply is given.
//   node tests/scenarios/lane-2/smoke.mjs [--api URL] [--web URL] [--ack-only] [--require-reply]
import { cpus, loadavg } from "node:os";
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
const api = flag(
  "--api",
  process.env.QELVORA_API_URL ?? "http://127.0.0.1:56421",
);
const web = flag("--web", "");
const waitForReply = !process.argv.includes("--ack-only");
const { step, advise, finish } = reporter();
// The reply depends on the machine's load (see the note below), so by default a
// missing reply is a WARN; --require-reply makes it a failure.
const reply = process.argv.includes("--require-reply") ? step : advise;
const stop = (detail) => {
  process.stdout.write(`  stopped: ${detail}\n`);
  finish();
};

const live = await call(api, "GET", "/health/live").catch(() => null);
if (
  !step(
    "backend is live",
    live?.status === 200,
    live ? `status ${live.status}` : "no answer",
  )
)
  stop(
    "the backend is not reachable; run `stack status` and `stack logs backend`",
  );

const caps = await call(api, "GET", "/v1/identity/capabilities");
step(
  "development sign-in is offered",
  caps.json?.signInAvailable === true && caps.json?.mode === "development",
  `mode ${caps.json?.mode}`,
);

if (web) {
  const page = await call(web, "GET", "/status", { timeoutMs: 60000 });
  step("web app answers", page.status === 200, `GET /status ${page.status}`);
}

const { token, session } = await signIn(api, ACTORS.fanOne);
step(
  "fan signed in",
  Boolean(token),
  `account ${session.accountId.slice(0, 8)}…`,
);

let fan = session.fan;
if (!fan) {
  const saved = await call(api, "POST", "/v1/identity/fan-profile", {
    token,
    body: { handle: "stackfan", intro: "" },
  });
  fan = saved.json;
  step("fan profile created", saved.status === 200, `status ${saved.status}`);
} else step("fan profile exists", true, `@${fan.handle}`);

const providers = (
  await call(api, "GET", "/v1/conversations/capabilities", { token })
).json;
step(
  "conversations are available",
  providers?.generationAvailable === true,
  "generationAvailable",
);

const begun = await call(api, "POST", "/v1/conversations/begin", {
  token,
  body: {
    creatorId: MAYA_CREATOR_ID,
    policyVersion: providers.providers.version,
    accessNoticeAccepted: true,
    idempotencyKey: key("begin"),
  },
});
if (
  !step(
    "conversation with Maya opened",
    begun.status === 200 && begun.json?.canSend === true,
    `status ${begun.status}`,
  )
)
  stop(
    begun.text.slice(0, 200) +
      " (is Maya's AI published? run `stack up` again)",
  );

const thread = `/v1/conversations/${MAYA_CREATOR_ID}/${fan.id}`;
// One reply at a time per conversation: let an earlier run's reply settle first.
const inFlight = async () =>
  ((await call(api, "GET", thread, { token })).json?.messages ?? []).some(
    (m) =>
      m.authorKind === "ai" &&
      ["queued", "generating"].includes(m.deliveryState),
  );
if (await inFlight()) {
  process.stdout.write(
    "  waiting for the previous reply to finish (one reply at a time)\n",
  );
  for (let waited = 0; waited < 180 && (await inFlight()); waited += 1)
    await sleep(1000);
  step("the previous reply settled", !(await inFlight()), "up to 180 s");
}
const text = `Smoke check ${new Date().toISOString()}`;
const body = {
  idempotencyKey: key("smoke"),
  text,
  clientSequence: Date.now() % 1_000_000,
};
const started = performance.now();
const sent = await call(api, "POST", `${thread}/messages`, { token, body });
const ackMs = Math.round(performance.now() - started);
const accepted =
  sent.status === 200 &&
  sent.json?.message?.authorKind === "fan" &&
  sent.json?.message?.deliveryState === "accepted" &&
  sent.json?.message?.text === text &&
  Boolean(sent.json?.generationId);
if (
  !step("message acknowledged", accepted, `${ackMs} ms, status ${sent.status}`)
)
  stop(sent.text.slice(0, 240));

const again = await call(api, "POST", `${thread}/messages`, { token, body });
step(
  "the same key and message return the same acknowledgment",
  again.status === 200 && again.json?.message?.id === sent.json.message.id,
  `status ${again.status}`,
);
const changed = await call(api, "POST", `${thread}/messages`, {
  token,
  body: { ...body, text: `${text} (edited)` },
});
step(
  "the same key with a different message is refused, not accepted twice",
  changed.status >= 400 && changed.status < 500,
  `status ${changed.status} ${changed.json?.error?.code ?? ""}`,
);

const signedOut = await call(api, "GET", thread);
step(
  "a signed-out visitor cannot read the thread",
  signedOut.status === 401,
  `status ${signedOut.status} ${signedOut.json?.error?.code ?? ""}`,
);
const other = await signIn(api, ACTORS.fanTwo);
const intruder = await call(api, "GET", thread, { token: other.token });
step(
  "another fan cannot read it either",
  intruder.status >= 400 && intruder.status < 500,
  `status ${intruder.status} ${intruder.json?.error?.code ?? ""}`,
);

if (waitForReply) {
  // Every read of the thread can contend with the generation worker's own row
  // locks, so ask gently: one read every 4 seconds.
  const POLL_MS = 4000;
  const seconds = (since) => Math.round((Date.now() - since) / 1000);
  const readAi = async (match) =>
    ((await call(api, "GET", thread, { token })).json?.messages ?? []).find(
      match,
    );
  let ai = null;
  let since = Date.now();
  while (seconds(since) < 120 && !ai?.text && ai?.deliveryState !== "failed") {
    await sleep(POLL_MS);
    ai = await readAi(
      (m) => m.authorKind === "ai" && m.sequence > sent.json.message.sequence,
    );
  }
  const load = loadavg()[0];
  const busy =
    load > cpus().length
      ? `, host load ${load.toFixed(0)} on ${cpus().length} CPUs`
      : "";
  reply(
    "the AI's first sentence arrived",
    Boolean(ai?.text),
    ai?.text
      ? `after ${seconds(since)} s: "${ai.text.slice(0, 40)}…"`
      : `reply ${ai?.deliveryState ?? "never started"} after ${seconds(since)} s${busy}`,
  );
  if (!ai?.text)
    process.stdout.write(
      "  note: a generation transaction re-checks the database catalogue about 60 times inside a fixed 5 second window,\n" +
        "  so a reply can fail on a busy Mac; the acknowledgment above is unaffected. `reset` clears a failed reply; --require-reply makes this fatal. (lane 2 status file, ticket to lane 3)\n",
    );
  since = Date.now();
  while (
    ai?.text &&
    seconds(since) < 120 &&
    !["delivered", "failed", "interrupted"].includes(ai.deliveryState)
  ) {
    await sleep(POLL_MS);
    ai = (await readAi((m) => m.id === ai.id)) ?? ai;
  }
  if (ai?.text)
    reply(
      "the reply finished",
      ai.deliveryState === "delivered",
      `${ai.deliveryState} after a further ${seconds(since)} s`,
    );
}
finish();
