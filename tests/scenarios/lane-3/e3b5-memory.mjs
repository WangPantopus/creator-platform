// E3B.5 memory scenario (B5, server side): after an ordinary answer is
// delivered, the generation worker proposes what the fan said that is worth
// remembering; nothing is memory until the fan says yes. Cases: the answer
// arrives before the proposal; yes makes it memory and the next answer's
// context carries it; no stores nothing and an exclusion that removes only the
// key it names; a sensitive fact needs its own consent (INV-23); edit takes
// effect at once; duplicates; off the record writes nothing (Q13); a crisis
// answer writes nothing.
//
// The model fake extracts nothing, so a scripted model edge (lane 3's port
// 56438, an outer-edge fake) answers the extraction and sensitivity calls for
// the case messages, and records every reply request so the scenario can see
// the memory slot of the next answer's context. Everything else goes to the
// stack's fake. Needs the memory proposal writer registered on the stack (see
// the lane 3 status, B5).
//   node tests/scenarios/lane-3/e3b5-memory.mjs [--out run.json]
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
  reporter,
  sleep,
  sql,
  watchFrames,
} from "./lib.mjs";

const EDGE_PORT = Number(flag("--edge-port", "56438"));
const { step, advise, finish } = reporter();

// What the scripted extractor finds in each case message.
const FACTS = {
  "I fire my glazes at cone 6 in an electric kiln.": [
    {
      kind: "fact",
      text: "Fires glazes at cone 6 in an electric kiln.",
      semanticKey: "firing temperature",
      sensitiveCategory: null,
    },
  ],
  "I'm testing a new celadon next week, I'll tell you how it goes.": [
    {
      kind: "open_loop",
      text: "Testing a new celadon next week.",
      semanticKey: "celadon test",
      sensitiveCategory: null,
    },
  ],
  "My studio is in my garage, it gets cold in winter.": [
    {
      kind: "fact",
      text: "Works in a garage studio that gets cold in winter.",
      semanticKey: "studio location",
      sensitiveCategory: null,
    },
  ],
  "Again: my studio is in my garage.": [
    {
      kind: "fact",
      text: "Works in a garage studio.",
      semanticKey: "studio location",
      sensitiveCategory: null,
    },
  ],
  "I sell my mugs at a weekend market.": [
    {
      kind: "fact",
      text: "Sells mugs at a weekend market.",
      semanticKey: "selling",
      sensitiveCategory: null,
    },
  ],
  "I mostly throw mugs and small bowls.": [
    {
      kind: "fact",
      text: "Mostly throws mugs and small bowls.",
      semanticKey: "usual forms",
      sensitiveCategory: null,
    },
  ],
  "I was diagnosed with diabetes last year, so I take breaks.": [
    {
      kind: "fact",
      text: "Has diabetes and takes breaks.",
      semanticKey: "health condition",
      sensitiveCategory: "health",
    },
  ],
  "Off the record: I use a kick wheel.": [
    {
      kind: "fact",
      text: "Uses a kick wheel.",
      semanticKey: "wheel type",
      sensitiveCategory: null,
    },
  ],
};
const replies = [];
const textOf = (body) => JSON.stringify(body?.input ?? "");
function json(res, body, object) {
  const text = JSON.stringify(object);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "resp_e3b5",
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
        input_tokens: 60,
        output_tokens: 30,
        total_tokens: 90,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      },
    }),
  );
}
const extractions = [];
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
    if (req.url.startsWith("/v1/responses") && body) {
      const input = textOf(body);
      if (fields.length === 1 && fields[0] === "items") {
        const found = Object.entries(FACTS).find(([message]) =>
          input.includes(JSON.stringify(`fan: ${message}`).slice(1, -1)),
        );
        extractions.push({ at: Date.now(), message: found?.[0] ?? null });
        return json(res, body, { items: found?.[1] ?? [] });
      }
      if (fields.includes("category") && fields.includes("uncertain")) {
        const sensitive = /diabetes/u.test(input);
        return json(res, body, {
          category: sensitive ? "health" : null,
          uncertain: false,
        });
      }
      if (input.includes("slot6")) replies.push({ at: Date.now(), input });
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

await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 100 } });
step("Maya's AI is live", true, await ensureMaya(20_000_000));
const fan = await openFan(ACTORS.fanOne, "e3b5fan");
fan.watch = watchFrames(fan.token, fan.fan.id);
await fan.watch.ready;
fan.sent = 0;

async function say(text) {
  const sent = await call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: { idempotencyKey: key("e3b5"), text, clientSequence: ++fan.sent },
  });
  if (sent.status !== 200)
    return { error: `send ${sent.status} ${sent.text.slice(0, 160)}` };
  const g = sent.json.generationId;
  const end = g
    ? await fan.watch.until(
        (f) =>
          f.generationId === g && ["delivered", "interrupted"].includes(f.kind),
        120_000,
      )
    : null;
  const lastSentence = g
    ? fan.watch.frames
        .filter((f) => f.generationId === g && f.kind === "sentence")
        .at(-1)
    : null;
  for (let waited = 0; waited < 30; waited++) {
    const [row] = g
      ? await sql("SELECT state FROM creator.generation WHERE id=$1", [g])
      : [{ state: "none" }];
    if (["delivered", "interrupted", "failed", "none"].includes(row?.state))
      break;
    await sleep(500);
  }
  return {
    g,
    end: end?.kind ?? (g ? "none" : "safety"),
    lastSentenceAt: lastSentence?.at ?? null,
  };
}
const memories = () =>
  sql(
    "SELECT id::text, kind, text, semantic_key, state, sensitive_category, consent_id IS NOT NULL AS consented, created_at FROM creator.memory WHERE fan_id=$1 ORDER BY created_at",
    [fan.fan.id],
  );
const memoryList = async () =>
  (await call(API, "GET", `${fan.thread}/memory`, { token: fan.token })).json;
const revision = async () =>
  (await call(API, "GET", fan.thread, { token: fan.token })).json.revision;
const decide = async (id, action, text) =>
  call(API, "POST", `${fan.thread}/memory/${id}`, {
    token: fan.token,
    body: {
      expectedRevision: await revision(),
      action,
      ...(text ? { text } : {}),
    },
  });

// 1. A memorable message: the answer first, then a proposal.
const t0 = Date.now();
const first = await say("I fire my glazes at cone 6 in an electric kiln.");
let rows = await memories();
const proposal = rows.find((r) => r.semantic_key === "firing temperature");
step(
  "the answer is delivered, then the worker proposes what to remember",
  first.end === "delivered" && proposal?.state === "proposed",
  `${first.end}; memory rows ${JSON.stringify(rows.map((r) => [r.semantic_key, r.state]))}`,
);
step(
  "nothing is memory until the fan says yes",
  !rows.some((r) => r.state === "remembered"),
  `${rows.length} proposed`,
);
const listed = await memoryList();
step(
  "the fan's memory view lists the proposal",
  JSON.stringify(listed ?? {}).includes("Fires glazes at cone 6"),
  JSON.stringify(listed ?? {}).slice(0, 200),
);

// 2. Yes: it becomes memory, and the next answer's context carries it.
const yes = await decide(proposal?.id, "accept");
rows = await memories();
step(
  "yes makes it memory",
  yes.status === 200 &&
    rows.find((r) => r.id === proposal?.id)?.state === "remembered",
  `${yes.status} ${yes.text.slice(0, 120)}`,
);
const mark = replies.length;
await say("I'm testing a new celadon next week, I'll tell you how it goes.");
const context = replies
  .slice(mark)
  .map((r) => r.input)
  .join("");
step(
  "the next answer's context carries the accepted memory (and only it)",
  context.includes("Fires glazes at cone 6") &&
    !context.includes("Testing a new celadon"),
  `${replies.length - mark} reply calls seen`,
);
rows = await memories();
const loop = rows.find((r) => r.semantic_key === "celadon test");
step(
  "an open loop is proposed as an open loop",
  loop?.kind === "open_loop" && loop.state === "proposed",
  JSON.stringify(loop ?? null),
);
const loopYes = await decide(loop?.id, "accept");
const back = replies.length;
await say("Hi again, what should I glaze today?");
step(
  "on return the AI's context carries the open loop to follow up",
  loopYes.status === 200 &&
    replies.slice(back).some((r) => r.input.includes("Testing a new celadon")),
  `${replies.length - back} reply calls seen`,
);

// 3. An edit takes effect at once: the old text leaves the next answer, and
// the edited text (free text that may be sensitive) is memory once accepted.
await say("I mostly throw mugs and small bowls.");
rows = await memories();
const forms = rows.find((r) => r.semantic_key === "usual forms");
await decide(forms?.id, "accept");
const edited = await decide(forms?.id, "edit", "Mostly throws mugs.");
const afterEdit = replies.length;
await say("Thanks!");
const editContext = replies
  .slice(afterEdit)
  .map((r) => r.input)
  .join("");
step(
  "after an edit the old memory leaves the next answer at once",
  edited.status === 200 &&
    editContext.includes("Fires glazes at cone 6") &&
    !editContext.includes("Mostly throws mugs and small bowls."),
  `${edited.status}`,
);
const reaccepted = await decide(forms?.id, "accept");
const afterAccept = replies.length;
await say("Thanks again!");
step(
  "the edited memory is in the next answer once the fan accepts it",
  reaccepted.status === 200 &&
    replies
      .slice(afterAccept)
      .some((r) => r.input.includes("Mostly throws mugs.")),
  `${reaccepted.status}`,
);

// 4. A sensitive fact needs its own consent (INV-23).
await say("I was diagnosed with diabetes last year, so I take breaks.");
rows = await memories();
const health = rows.find((r) => r.semantic_key === "health condition");
step(
  "a sensitive fact is proposed with its category",
  health?.sensitive_category === "health" && health.state === "proposed",
  JSON.stringify(health ?? null),
);
const consent = await decide(health?.id, "accept");
rows = await memories();
const healthAfter = rows.find((r) => r.id === health?.id);
step(
  "accepting it records its own consent (INV-23)",
  consent.status === 200 &&
    healthAfter?.state === "remembered" &&
    healthAfter.consented,
  `${consent.status}; ${JSON.stringify(healthAfter ?? null)}`,
);

// 5. No: nothing stored, the same key is not proposed again, other keys are.
await say("My studio is in my garage, it gets cold in winter.");
rows = await memories();
const garage = rows.find((r) => r.semantic_key === "studio location");
const no = await decide(garage?.id, "delete");
await say("Again: my studio is in my garage.");
const afterNo = replies.length;
await say("I sell my mugs at a weekend market.");
rows = await memories();
step(
  "no stores nothing, and the same thing is not proposed again",
  no.status === 200 && !rows.some((r) => r.semantic_key === "studio location"),
  JSON.stringify(rows.map((r) => [r.semantic_key, r.state])),
);
step(
  "the exclusion stops only the key it names from being proposed",
  rows.some((r) => r.semantic_key === "selling" && r.state === "proposed"),
  JSON.stringify(rows.map((r) => r.semantic_key)),
);
advise(
  "after a no, the AI still uses the fan's other memories (W3 omits all memory and history once any exclusion exists)",
  replies
    .slice(afterNo)
    .some((r) => r.input.includes("Fires glazes at cone 6")),
  `${replies.length - afterNo} reply calls seen`,
);

// 6. Duplicates write one row.
const counts = await sql(
  "SELECT semantic_key, count(*)::int AS n FROM creator.memory WHERE fan_id=$1 GROUP BY semantic_key HAVING count(*)>1",
  [fan.fan.id],
);
step(
  "no semantic key is stored twice",
  counts.length === 0,
  JSON.stringify(counts),
);

// 7. A crisis answer writes nothing.
const beforeCrisis = (await memories()).length;
const extractionsBefore = extractions.length;
await say("I want to end my life tonight");
step(
  "a crisis answer runs no extraction and writes nothing",
  (await memories()).length === beforeCrisis &&
    extractions.length === extractionsBefore,
  `${extractions.length - extractionsBefore} extraction calls`,
);

// 8. Off the record writes nothing (Q13).
const page = (await call(API, "GET", fan.thread, { token: fan.token })).json;
const otr = await call(API, "POST", `${fan.thread}/preferences`, {
  token: fan.token,
  body: {
    offTheRecord: true,
    introShared: false,
    expectedRevision: page.revision,
  },
});
const beforeOtr = (await memories()).length;
const extractionsOtr = extractions.length;
await say("Off the record: I use a kick wheel.");
step(
  "off the record runs no extraction and writes nothing",
  otr.status === 200 &&
    (await memories()).length === beforeOtr &&
    extractions.length === extractionsOtr,
  `${otr.status}; ${extractions.length - extractionsOtr} extraction calls`,
);

const out = flag("--out");
if (out)
  writeFileSync(
    out,
    JSON.stringify(
      {
        when: new Date().toISOString(),
        t0,
        memories: await memories(),
        extractions,
      },
      null,
      2,
    ),
  );
fan.watch.close();
edge.close();
await closeDb();
finish();
