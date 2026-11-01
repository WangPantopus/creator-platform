// A5 / E3A.6: the model's safety check leaves the path before acknowledgment.
// A fan's message is acknowledged after the synchronous check; the worker's
// classifier answers a crisis first. A message that will not be answered (a
// reply already running, a human takeover) still gets the model's check before
// the refusal (INV-19). Measured: the acknowledgment time of ordinary messages,
// and for a crisis only the model recognises: what the fan receives, in which
// order, and whether the fan's allowance is consumed.
//
// The model fake's classifier flags exactly the words the synchronous check
// flags, so this scenario runs a scripted model edge (lane 3's port 56438, an
// outer-edge fake) whose classifier answers "crisis" for one hidden phrase and
// forwards everything else to the stack's fake.
//   sh tests/scenarios/lane-3/fresh-stack.sh --env QELVORA_FAKE_MODEL_URL=http://127.0.0.1:56438
//   node tests/scenarios/lane-3/a5-ack-safety.mjs [--messages 8] [--out run.json]
import { createServer, request } from "node:http";
import { writeFileSync } from "node:fs";
import {
  API,
  MODEL,
  ACTORS,
  call,
  closeDb,
  ensureMaya,
  flag,
  key,
  openFan,
  percentile,
  reporter,
  signIn,
  sleep,
  sql,
  watchFrames,
} from "./lib.mjs";

const EDGE_PORT = Number(flag("--edge-port", "56438"));
const messages = Number(flag("--messages", "8"));
const { step, finish } = reporter();
const CRISIS =
  "I’m an AI. If you’re in immediate danger, contact local emergency services now. In the U.S. or Canada, call or text 988. You can also reach out to someone you trust nearby.";
// Not matched by the synchronous check; only the scripted model calls it a crisis.
const HIDDEN = "I don't see any point in going on anymore";

const edge = createServer((req, res) => {
  const parts = [];
  req.on("data", (c) => parts.push(c));
  req.on("end", () => {
    const raw = Buffer.concat(parts);
    let body = null;
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {
      // Forwarded unchanged.
    }
    const fields = Object.keys(body?.text?.format?.schema?.properties ?? {});
    const input = JSON.stringify(body?.input ?? "");
    if (
      req.url.startsWith("/v1/responses") &&
      fields.includes("crisis") &&
      fields.includes("social") &&
      input.includes(HIDDEN)
    ) {
      const text = JSON.stringify({
        allowed: true,
        crisis: true,
        sensitive: true,
        social: false,
        category: "crisis",
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "resp_a5",
          object: "response",
          model: body.model,
          status: "completed",
          output: [
            {
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text }],
            },
          ],
          usage: {
            input_tokens: 50,
            output_tokens: 20,
            total_tokens: 70,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
          },
        }),
      );
      return;
    }
    const target = new URL(MODEL);
    const upstream = request(
      {
        host: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    upstream.end(raw);
  });
});
await new Promise((resolve, reject) => {
  edge.once("error", reject);
  edge.listen(EDGE_PORT, "127.0.0.1", resolve);
});

await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 300 } });
step("Maya's AI is live", true, await ensureMaya(20_000_000));

/** Send and follow one message to its end; report what the fan saw, in order. */
async function exchange(fan, text) {
  const started = performance.now();
  const sent = await call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: { idempotencyKey: key("a5"), text, clientSequence: ++fan.sent },
  });
  const ack = performance.now() - started;
  if (sent.status !== 200)
    return { ack, status: sent.status, code: sent.json?.error?.code };
  const g = sent.json.generationId;
  const ai = [];
  if (g) {
    const end = await fan.watch.until(
      (f) =>
        f.generationId === g && ["delivered", "interrupted"].includes(f.kind),
      120_000,
    );
    ai.push(
      ...fan.watch.frames
        .filter((f) => f.generationId === g && f.kind === "sentence")
        .map((f) => ({ text: f.text, at: f.at - started })),
    );
    const [reservation] = await sql(
      "SELECT state FROM creator.commerce_allowance_reservation WHERE key=$1",
      [`generation:${g}`],
    );
    return {
      ack,
      status: 200,
      generation: true,
      end: end?.kind ?? "none",
      ai,
      reservation: reservation?.state ?? "none",
    };
  }
  // Answered at acknowledgment: the platform safety response, no generation.
  await sleep(500);
  const page = (await call(API, "GET", fan.thread, { token: fan.token })).json;
  const sorted = [...(page?.messages ?? [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  const at = sorted.findLastIndex(
    (m) => m.authorKind === "fan" && m.text === text,
  );
  const after = sorted.slice(at + 1).filter((m) => m.authorKind === "ai");
  return {
    ack,
    status: 200,
    generation: false,
    ai: after.map((m) => ({ text: m.text, at: ack })),
    reservation: "none (no generation)",
  };
}
const open = async (account, handle) => {
  const fan = await openFan(account, handle);
  fan.watch = watchFrames(fan.token, fan.fan.id);
  await fan.watch.ready;
  fan.sent = 0;
  return fan;
};

// 1. Acknowledgment time of ordinary messages.
const fan = await open(ACTORS.fanOne, "a5fan");
const acks = [];
for (let i = 0; i < messages; i++) {
  const r = await exchange(
    fan,
    `Ordinary question ${i + 1}: how long should glaze dry?`,
  );
  acks.push(r.ack);
  if (r.status !== 200 || r.end !== "delivered")
    step(`ordinary message ${i + 1}`, false, JSON.stringify(r));
}
step(
  "ordinary messages acknowledged",
  acks.length === messages,
  `ack p50 ${Math.round(percentile(acks, 50))} ms, p95 ${Math.round(percentile(acks, 95))} ms over ${acks.length}`,
);

// 2. A crisis only the model recognises, from a fan the AI will answer.
const hidden = await exchange(fan, HIDDEN);
step(
  "a crisis only the model recognises gets the fixed safety response first and alone",
  hidden.status === 200 &&
    hidden.ai.length === 1 &&
    hidden.ai[0].text === CRISIS,
  `${hidden.generation ? "through the worker" : "at acknowledgment"}; ack ${Math.round(hidden.ack)} ms; AI text ${hidden.ai.map((a) => `${JSON.stringify(a.text.slice(0, 40))} at ${Math.round(a.at)} ms`).join(", ")}; reservation ${hidden.reservation}`,
);
step(
  "the safety response does not use the fan's allowance",
  ["released", "none (no generation)"].includes(hidden.reservation),
  `reservation ${hidden.reservation}`,
);

// 3. The same message when a reply is already running: refused, but safe.
const busy = await open(ACTORS.fanTwo, "a5busy");
const first = call(API, "POST", `${busy.thread}/messages`, {
  token: busy.token,
  body: {
    idempotencyKey: key("a5"),
    text: "Ordinary question while busy",
    clientSequence: ++busy.sent,
  },
});
await first;
const refused = await exchange(busy, HIDDEN);
step(
  "a reply in progress: the refused message still gets the safety response (INV-19)",
  refused.status === 200 && refused.ai.some((a) => a.text === CRISIS),
  JSON.stringify({
    status: refused.status,
    code: refused.code,
    generation: refused.generation,
    ai: refused.ai?.map((a) => a.text.slice(0, 30)),
  }),
);

// 4. During a human takeover the AI does not answer; the safety response still does.
const maya = await signIn(API, ACTORS.maya, "/studio");
const taken = await call(API, "POST", `${busy.thread}/takeover`, {
  token: maya.token,
  body: { idempotencyKey: key("takeover") },
});
await sleep(1000);
const during = await exchange(busy, `${HIDDEN}, really`);
step(
  "during a takeover the fan still gets the safety response (INV-19)",
  taken.status === 200 &&
    during.status === 200 &&
    during.ai.some((a) => a.text === CRISIS),
  JSON.stringify({
    takeover: taken.status,
    status: during.status,
    code: during.code,
    ai: during.ai?.map((a) => a.text.slice(0, 30)),
  }),
);
await call(API, "POST", `${busy.thread}/handback`, {
  token: maya.token,
  body: { idempotencyKey: key("handback") },
});

// 5. The synchronous check still answers at acknowledgment.
const regex = await exchange(fan, "I want to end my life tonight");
step(
  "a crisis the synchronous check recognises is answered at acknowledgment",
  regex.status === 200 && !regex.generation && regex.ai[0]?.text === CRISIS,
  `ack ${Math.round(regex.ack)} ms; ${regex.generation ? "through the worker" : "no generation"}`,
);

const out = flag("--out");
if (out)
  writeFileSync(
    out,
    JSON.stringify(
      { when: new Date().toISOString(), acks, hidden, refused, during, regex },
      null,
      2,
    ),
  );
for (const f of [fan, busy]) f.watch.close();
edge.close();
await closeDb();
finish();
