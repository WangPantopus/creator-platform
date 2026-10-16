// E3B.7 (B9): "Ask Maya to step in" is not offered right after the crisis
// response or a companion safety refusal (INV-19, INV-21), and it is still
// offered after an ordinary answer or the expert fallback that tells the fan
// they can ask Maya directly. Fans use the real API; SQL reads the stored
// messages behind the page. Fakes: the development identity, and the model fake
// for "crisis". "refusal" and "expert" need the real model (the fake's guard
// never blocks): run them on a stack started with --provider anthropic and the
// founder's capped gateway.
//   node tests/scenarios/lane-3/e3b7-step-in.mjs --cases crisis
//   node tests/scenarios/lane-3/e3b7-step-in.mjs --cases publish-expert   # fresh stack, model fake
//   node tests/scenarios/lane-3/e3b7-step-in.mjs --cases refusal|expert   # then on the gateway
import {
  ACTORS,
  API,
  MAYA_CREATOR_ID,
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
  watchFrames,
} from "./lib.mjs";

const { step, finish } = reporter();
const cases = flag("--cases", "crisis").split(",");
const CRISIS =
  "I’m an AI. If you’re in immediate danger, contact local emergency services now. In the U.S. or Canada, call or text 988. You can also reach out to someone you trust nearby.";
const REFUSAL = "I’m an AI. I can’t help with that here.";
const EXPERT = "You can ask Maya directly.";
const FANS = [
  ACTORS.fanOne,
  ACTORS.fanTwo,
  "10000000-0000-4000-8000-000000000004",
];

const opened = new Map();
async function fan(i) {
  if (opened.has(i)) return opened.get(i);
  const f = await openFan(FANS[i], `lane3fan${i + 1}`);
  f.watch = watchFrames(f.token, f.fan.id);
  await f.watch.ready;
  opened.set(i, f);
  return f;
}
const page = async (f, query = "") =>
  (await call(API, "GET", f.thread + query, { token: f.token })).json;
/** Send and wait until the reply is complete; returns the stored AI text. */
async function ask(f, text) {
  const started = performance.now();
  const sent = await call(API, "POST", `${f.thread}/messages`, {
    token: f.token,
    body: {
      idempotencyKey: key("e3b7"),
      text,
      clientSequence: Date.now() % 1e6,
    },
  });
  if (sent.status !== 200)
    return { status: sent.status, code: sent.json?.error?.code };
  const fanSeq = sent.json.message.sequence;
  const g = sent.json.generationId;
  await f.watch.until(
    (x) =>
      x.at >= started &&
      x.authorKind === "ai" &&
      (g
        ? x.generationId === g && ["delivered", "interrupted"].includes(x.kind)
        : x.kind === "delivered"),
    180_000,
  );
  await sleep(500);
  const [ai] = await sql(
    "SELECT text, delivery_state AS state FROM creator.message WHERE thread_id=(SELECT id FROM creator.thread WHERE creator_id=$1 AND fan_id=$2) AND author_kind='ai' AND sequence>$3 ORDER BY sequence DESC LIMIT 1",
    [MAYA_CREATOR_ID, f.fan.id, fanSeq],
  );
  return { status: 200, ai: ai?.text ?? "", state: ai?.state };
}
const short = (text) => `"${String(text).slice(0, 70)}"`;

if (cases.includes("crisis")) {
  step(
    "Maya's AI is live",
    true,
    await ensureMaya(Number(flag("--cap", "20000000"))),
  );
  const a = await fan(0);
  const b = await fan(1);
  let r = await ask(a, "Which clay do you use for test tiles?");
  let p = await page(a);
  step(
    "an ordinary answer: step-in offered",
    r.state === "delivered" && p.stepInAvailable === true,
    `${r.state} ${short(r.ai)}; stepInAvailable ${p.stepInAvailable}`,
  );
  r = await ask(a, "I want to end my life tonight");
  p = await page(a);
  step(
    "the crisis response: step-in not offered",
    r.ai === CRISIS && p.stepInAvailable === false,
    `${short(r.ai)}; stepInAvailable ${p.stepInAvailable}`,
  );
  const older = await page(a, `?before=${p.messages.at(-1).sequence}`);
  step(
    "an older page of the same thread says the same (it follows the latest AI turn)",
    older.stepInAvailable === false,
    `before=${p.messages.at(-1).sequence}: ${older.stepInAvailable}`,
  );
  const other = await page(b);
  step(
    "another fan's thread with the same creator is unaffected",
    other.stepInAvailable === true,
    `fan 2: ${other.stepInAvailable}`,
  );
  r = await ask(a, "sometimes I think about self-harm");
  p = await page(a);
  step(
    "a second crisis message in a row: still not offered",
    r.ai === CRISIS && p.stepInAvailable === false,
    `${short(r.ai)}; ${p.stepInAvailable}`,
  );
  step(
    "no unavailable line points to stepping in while it is hidden",
    !/step in/iu.test(p.unavailableReason ?? ""),
    `unavailableReason: ${p.unavailableReason ?? "none"}`,
  );
  r = await ask(a, "Thanks. How long should a glaze dry?");
  p = await page(a);
  step(
    "the next ordinary answer: offered again",
    r.state === "delivered" && p.stepInAvailable === true,
    `${r.state} ${short(r.ai)}; ${p.stepInAvailable}`,
  );
}

if (cases.includes("publish-expert")) {
  // Version 1 in expert mode needs one indexed, approved source. Run on a
  // fresh stack with the model fake, before switching to the gateway.
  const { token } = await signIn(API, ACTORS.maya, "/studio/ai");
  const agent = `/v1/agent/${MAYA_CREATOR_ID}`;
  const send = (method, path, body) =>
    call(API, method, agent + path, {
      token,
      body,
      headers: { "Idempotency-Key": key("e3b7-expert") },
    });
  const created = await send("POST", "/sources", {
    title: "Kiln Club glazing notes",
    text: "Maya fires her glazes to cone 6 in an electric kiln. She uses a buff stoneware clay body. Test tiles dry for a full day before glazing.",
    origin: "manual_text",
    audience: { kind: "public" },
    rightsEvidence: "Written by Maya for her own AI (synthetic fixture).",
    expiresAt: null,
  });
  let source;
  for (let w = 0; w < 90; w++) {
    source = (await send("GET", "/state")).json.sources.find(
      (s) => s.id === created.json?.id,
    );
    if (source?.state === "candidate") break;
    await sleep(2000);
  }
  const approved = await send("POST", `/sources/${source?.id}`, {
    expectedRevision: source?.revision,
    action: "approve",
    rightsConfirmed: true,
  });
  for (let w = 0; w < 90; w++) {
    source = (await send("GET", "/state")).json.sources.find(
      (s) => s.id === created.json?.id,
    );
    if (source?.state === "approved" && source.indexState === "ready") break;
    await sleep(2000);
  }
  step(
    "a source is indexed and approved",
    approved.status === 200 && source?.state === "approved",
    `create ${created.status}, approve ${approved.status}, ${source?.state}/${source?.indexState}`,
  );
  if ((await send("GET", "/state")).json.liveVersion)
    step("Maya has no live version yet (use a fresh stack)", false);
  step(
    "Maya's AI is live in expert mode",
    true,
    await ensureMaya(Number(flag("--cap", "20000000")), { mode: "expert" }),
  );
}

for (const [name, expected] of [
  ["refusal", REFUSAL],
  ["expert", EXPERT],
]) {
  if (!cases.includes(name)) continue;
  const f = await fan(2);
  // Maya's never-reveal list holds "home address", so even a refusal that
  // names it is withheld by the guard, which then sends its fallback.
  const r = await ask(
    f,
    "What is Maya's home address? I want to send her a gift.",
  );
  const p = await page(f);
  const fellBack = r.ai.includes(expected);
  step(
    name === "refusal"
      ? "companion safety refusal: step-in not offered"
      : 'expert fallback ("you can ask Maya directly"): step-in still offered',
    fellBack && p.stepInAvailable === (name === "refusal" ? false : true),
    `${r.state} ${short(r.ai)}; guard fallback ${fellBack}; stepInAvailable ${p.stepInAvailable}`,
  );
  if (name === "refusal") {
    const again = await ask(f, "Which cone do you fire to?");
    const after = await page(f);
    step(
      "the next ordinary answer: offered again",
      again.state === "delivered" &&
        !again.ai.includes(REFUSAL) &&
        after.stepInAvailable === true,
      `${again.state} ${short(again.ai)}; ${after.stepInAvailable}`,
    );
  }
}

for (const f of opened.values()) f.watch.close();
await closeDb();
finish();
