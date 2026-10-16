// A6: a fan whose connection drops while the acknowledgment's safety check is
// running, or a safety check that times out, must not lock the creator's AI. Fan 1 sends and drops the request
// while the model fake (outer edge, slowed) is answering the safety check; then
// fan 2 asks. Behind the screen: no usage row is left without a cost, fan 1's
// dropped message was not accepted, and fan 2's reply is delivered.
// Since A5 only a message that will be refused gets the model's check before
// acknowledgment, so Maya first takes over fan 1's conversation (and hands it
// back at the end).
//   node tests/scenarios/lane-3/a6-ack-disconnect.mjs
import {
  ACTORS,
  API,
  MAYA_CREATOR_ID,
  MODEL,
  call,
  closeDb,
  ensureMaya,
  flag,
  key,
  openFan,
  reporter,
  signIn,
  sleep,
  sql,
} from "./lib.mjs";

const { step, finish } = reporter();
step(
  "Maya's AI is live",
  true,
  await ensureMaya(Number(flag("--cap", "20000000"))),
);
const fan1 = await openFan(ACTORS.fanOne, "lane3fan1");
const fan2 = await openFan(ACTORS.fanTwo, "lane3fan2");
const maya = (await signIn(API, ACTORS.maya, "/studio/ai")).token;
const took = await call(API, "POST", `${fan1.thread}/takeover`, {
  token: maya,
  body: { idempotencyKey: key("takeover") },
});
step(
  "Maya takes over fan 1's conversation, so fan 1's messages are refused after the model's check",
  took.status === 200,
  `takeover ${took.status}`,
);
const unknown = async () =>
  (
    await sql(
      "SELECT count(*)::int AS n FROM creator.ai_usage WHERE creator_id=$1 AND cost_micros IS NULL",
      [MAYA_CREATOR_ID],
    )
  )[0].n;
const before =
  (await call(MODEL, "GET", "/__stats")).json?.paths?.["/v1/messages"] ?? 0;
// Slow the safety check so the drop lands while it runs (the fake counts the
// request path before its delay).
await call(MODEL, "POST", "/__control", {
  body: { mode: "ok", delayMs: 1500 },
});
const text = `Dropped during the safety check ${Date.now()}`;
const controller = new AbortController();
const sending = fetch(`${API}${fan1.thread}/messages`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: `Bearer ${fan1.token}`,
  },
  body: JSON.stringify({
    idempotencyKey: key("drop"),
    text,
    clientSequence: Date.now() % 1e6,
  }),
  signal: controller.signal,
}).catch((error) => ({ dropped: error.name }));
for (
  let w = 0;
  w < 200 &&
  ((await call(MODEL, "GET", "/__stats")).json?.paths?.["/v1/messages"] ??
    0) === before;
  w++
)
  await sleep(10);
const reached =
  ((await call(MODEL, "GET", "/__stats")).json?.paths?.["/v1/messages"] ?? 0) >
  before;
controller.abort();
const dropped = await sending;
await sleep(4000); // let the server finish whatever it does after the drop
await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 300 } });
const [accepted] = await sql(
  "SELECT count(*)::int AS n FROM creator.message WHERE text=$1",
  [text],
);
const left = await unknown();
const ackRows = await sql(
  "SELECT provider, cost_micros::bigint AS cost FROM creator.ai_usage WHERE creator_id=$1 AND generation_id IS NULL AND category='guardrail' ORDER BY created_at DESC LIMIT 1",
  [MAYA_CREATOR_ID],
);
step(
  "fan 1 dropped the request while the safety check was running",
  reached && dropped?.dropped === "AbortError",
  `safety call reached ${reached}, client ${dropped?.dropped ?? "not dropped"}`,
);
step(
  "the dropped message was not accepted",
  accepted.n === 0,
  `${accepted.n} stored`,
);
step(
  "the safety check's cost is known or bounded, never left unknown",
  left === 0,
  `${left} unknown row(s); last check row ${ackRows[0]?.provider}:${ackRows[0]?.cost ?? "unknown"}`,
);
const sent = await call(API, "POST", `${fan2.thread}/messages`, {
  token: fan2.token,
  body: {
    idempotencyKey: key("fan2"),
    text: "Another fan: why does my glaze crawl?",
    clientSequence: Date.now() % 1e6,
  },
});
let end;
for (let w = 0; w < 300 && sent.json?.generationId; w++) {
  [end] = await sql("SELECT state FROM creator.generation WHERE id=$1", [
    sent.json.generationId,
  ]);
  if (end && !["queued", "generating"].includes(end.state)) break;
  await sleep(500);
}
step(
  "another fan's reply is delivered (the creator is not locked)",
  end?.state === "delivered",
  `send ${sent.status}, ${end?.state}`,
);

// The safety check never answers: the route's 15 s deadline ends it. Its cost
// cannot be known, so it is recorded as that call's own upper bound.
await call(MODEL, "POST", "/__control", { body: { mode: "hang", delayMs: 0 } });
const hung = await call(API, "POST", `${fan1.thread}/messages`, {
  token: fan1.token,
  body: {
    idempotencyKey: key("hang"),
    text: `Safety check times out ${Date.now()}`,
    clientSequence: Date.now() % 1e6,
  },
  timeoutMs: 40_000,
});
await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 300 } });
const [bound] = await sql(
  "SELECT provider, model, cost_micros::bigint AS cost FROM creator.ai_usage WHERE creator_id=$1 AND generation_id IS NULL AND category='guardrail' ORDER BY created_at DESC LIMIT 1",
  [MAYA_CREATOR_ID],
);
step(
  "a safety check that times out records its own upper bound as an estimate",
  hung.status >= 400 &&
    bound?.provider === "estimate" &&
    Number(bound.cost) > 0 &&
    (await unknown()) === 0,
  `send ${hung.status} ${hung.json?.error?.code ?? ""}; row ${bound?.provider}/${bound?.model}:${bound?.cost}`,
);
const again = await call(API, "POST", `${fan2.thread}/messages`, {
  token: fan2.token,
  body: {
    idempotencyKey: key("fan2b"),
    text: "After the timeout: why does my glaze crawl?",
    clientSequence: Date.now() % 1e6,
  },
});
let after;
for (let w = 0; w < 300 && again.json?.generationId; w++) {
  [after] = await sql("SELECT state FROM creator.generation WHERE id=$1", [
    again.json.generationId,
  ]);
  if (after && !["queued", "generating"].includes(after.state)) break;
  await sleep(500);
}
step(
  "then another fan's reply is delivered",
  after?.state === "delivered",
  `send ${again.status}, ${after?.state}`,
);
const back = await call(API, "POST", `${fan1.thread}/handback`, {
  token: maya,
  body: { idempotencyKey: key("handback") },
});
step(
  "Maya hands fan 1's conversation back",
  back.status === 200,
  `handback ${back.status}`,
);
await closeDb();
finish();
