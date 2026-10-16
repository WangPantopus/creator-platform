// E3B.3 citations scenario: a fan gets cited answers from Maya's AI and opens
// each citation through the real API; the opened passage must be the exact
// span of Maya's source (CRLF line ends, a markdown table, and an emoji run cut
// at a chunk boundary). Then every source is rebuilt at the same revision the
// way an embedding provider change does it (the stack restarted with another
// embedding model, Maya retries each source, the stack restarted back, Maya
// retries again and brings version 1 back): the old citations must still open
// the same span. Another fan cannot open them, and a revoked source hides them.
//
// The model fake never cites, so this scenario runs its own scripted model edge
// (lane 3's port 56438, an outer-edge fake): for a case message it proposes one
// sentence citing the evidence passage that holds the case's marker, and
// forwards everything else to the stack's fake. Fakes: development identity,
// model fake, this edge. The scenario restarts lane 3's own stack itself.
//
//   sh tests/scenarios/lane-3/fresh-stack.sh --env QELVORA_FAKE_MODEL_URL=http://127.0.0.1:56438
//   node tests/scenarios/lane-3/e3b3-citations.mjs [--out run.json]
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer, request } from "node:http";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  API,
  MODEL,
  ACTORS,
  MAYA_CREATOR_ID,
  call,
  flag,
  key,
  reporter,
  signIn,
  sleep,
} from "./lib.mjs";

const EDGE_PORT = Number(flag("--edge-port", "56438"));
const DB =
  process.env.QELVORA_STACK_DATABASE_URL ??
  "postgresql://postgres:foundation-test-only@127.0.0.1:56430/creator_stack";
const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const { step, finish } = reporter();
const pg = createRequire(
  new URL("../../../apps/backend/package.json", import.meta.url),
)("pg");
/** One connection per read: the stack restarts its database during the run. */
async function sql(text, values) {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    return (await client.query(text, values)).rows;
  } finally {
    await client.end();
  }
}

// ------------------------------------------------------------------ Maya's sources
// SourceCreate trims the text; offsets index the trimmed text in UTF-16 units.
const TABLE =
  "Glaze table for cone 6 mugs, marker TABLECRLF:\r\n\r\n| Glaze | Dip |\r\n| --- | --- |\r\n| Kiln Club White | 3 s |\r\n| Ember Celadon | 2 s |\r\n\r\nStir both through a sieve before every glazing day.";
// 15 characters before the run put each emoji's first half at an odd index, so
// a cut at 1,600 lands inside an emoji and the next chunk (from 1,400) too.
const EMOJI = `Fire log notes:${"🔥".repeat(900)} marker EMOJIRUN, end of the firing log.`;
const PLAIN =
  "Trim a bowl at leather hard with a sharp loop tool, marker PLAINTRIM, and stop when the foot ring is as thick as the wall.";
const SOURCES = [
  { name: "table", title: "Glaze table", text: TABLE },
  { name: "emoji", title: "Firing log", text: EMOJI },
  { name: "plain", title: "Trimming", text: PLAIN },
];
const CASES = [
  { marker: "TABLECRLF", source: "table" },
  { marker: "Fire log notes", source: "emoji" },
  { marker: "EMOJIRUN", source: "emoji" },
  { marker: "PLAINTRIM", source: "plain" },
];
for (const c of CASES)
  c.message = `Citation case ${c.marker}: what do the notes say?`;
const byMessage = new Map(CASES.map((c) => [c.message, c]));

// ------------------------------------------------------------------ scripted edge
const tokens = (text) => Math.max(1, Math.ceil(String(text).length / 4));
function respond(res, body, object) {
  const text = JSON.stringify(object);
  const usage = {
    input_tokens: tokens(JSON.stringify(body.input ?? "")),
    output_tokens: tokens(text),
    total_tokens: tokens(JSON.stringify(body.input ?? "")) + tokens(text),
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  };
  const meta = { id: "resp_e3b3", object: "response", model: body.model };
  if (!body.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ...meta,
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }],
          },
        ],
        usage,
      }),
    );
    return;
  }
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
  });
  const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  send({
    type: "response.created",
    response: { ...meta, status: "in_progress" },
  });
  for (let at = 0; at < text.length; at += 48)
    send({
      type: "response.output_text.delta",
      delta: text.slice(at, at + 48),
    });
  send({
    type: "response.completed",
    response: { ...meta, status: "completed", usage },
  });
  res.end();
}
function slotsOf(body) {
  const content = Array.isArray(body.input)
    ? body.input.map((i) => i.content ?? "").join("\n\n")
    : String(body.input ?? "");
  const slots = {};
  for (const piece of content.split("\n\n"))
    try {
      const value = JSON.parse(piece);
      if (value && typeof value === "object" && !Array.isArray(value))
        Object.assign(slots, value);
    } catch {
      // The compiled prefix is not JSON.
    }
  return slots;
}
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
    if (
      req.url.startsWith("/v1/responses") &&
      fields.includes("sentences") &&
      fields.includes("refusalCode")
    ) {
      const slots = slotsOf(body);
      const c = byMessage.get(slots.slot8?.message);
      if (c) {
        const passage = (slots.slot4?.untrustedEvidence ?? []).find((p) =>
          p.text.includes(c.marker),
        );
        return respond(res, body, {
          sentences: [
            {
              text: "Here is the passage from Maya's notes on that.",
              citations: passage ? [passage.id] : [],
            },
          ],
          refusalCode: null,
          handoffReason: null,
        });
      }
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

// ------------------------------------------------------------------ helpers
const ROUTE = ["--env", `QELVORA_FAKE_MODEL_URL=http://127.0.0.1:${EDGE_PORT}`];
/** The stack's own OpenAI rates (infra/local/stack.mjs) plus a second embedding model. */
const RATES_WITH_LARGE = JSON.stringify({
  "gpt-4o-mini": {
    inputMicrosPerMillion: 150000,
    outputMicrosPerMillion: 600000,
    cachedInputMicrosPerMillion: 75000,
    cacheWriteMicrosPerMillion: 150000,
  },
  "gpt-4o": {
    inputMicrosPerMillion: 2500000,
    outputMicrosPerMillion: 10000000,
    cachedInputMicrosPerMillion: 1250000,
    cacheWriteMicrosPerMillion: 2500000,
  },
  "text-embedding-3-small": {
    inputMicrosPerMillion: 20000,
    outputMicrosPerMillion: 0,
  },
  "text-embedding-3-large": {
    inputMicrosPerMillion: 130000,
    outputMicrosPerMillion: 0,
  },
});
function restart(extra = []) {
  const stack = (args) =>
    execFileSync(process.execPath, ["infra/local/stack.mjs", ...args], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    }).toString();
  stack(["stop", "--lane", "3"]);
  const out = stack([
    "up",
    "--lane",
    "3",
    "--no-web",
    "--no-ai",
    "--no-smoke",
    ...ROUTE,
    ...extra,
  ]);
  if (!/READY/u.test(out))
    throw new Error(`stack did not come back: ${out.slice(-300)}`);
}
let maya;
const asMaya = (method, path, body) =>
  call(API, method, `/v1/agent/${MAYA_CREATOR_ID}${path}`, {
    token: maya.token,
    body,
    headers: { "Idempotency-Key": key("e3b3-maya") },
  });
const signInMaya = async () => {
  maya = await signIn(API, ACTORS.maya, "/studio/ai");
};
const sourceRows = () =>
  sql(
    "SELECT id::text, title, state, index_state, revision FROM creator.ai_source WHERE creator_id=$1",
    [MAYA_CREATOR_ID],
  );
async function waitSources(states, seconds = 120) {
  let rows = [];
  for (let waited = 0; waited < seconds; waited += 2) {
    rows = (await sourceRows()).filter((r) =>
      SOURCES.some((s) => s.title === r.title),
    );
    if (rows.length === SOURCES.length && rows.every((r) => states(r)))
      return rows;
    await sleep(2000);
  }
  return rows;
}
async function fanThread(account, handle) {
  const { token, session } = await signIn(API, account);
  let fan = session.fan;
  if (!fan)
    fan = (
      await call(API, "POST", "/v1/identity/fan-profile", {
        token,
        body: { handle, intro: "" },
      })
    ).json;
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
  if (begun.status !== 200)
    throw new Error(`begin ${begun.status} ${begun.text.slice(0, 160)}`);
  return {
    token,
    fan,
    thread: `/v1/conversations/${MAYA_CREATOR_ID}/${fan.id}`,
    sent: 0,
  };
}
async function ask(fan, text) {
  const sent = await call(API, "POST", `${fan.thread}/messages`, {
    token: fan.token,
    body: { idempotencyKey: key("e3b3"), text, clientSequence: ++fan.sent },
  });
  if (sent.status !== 200)
    return { error: `send ${sent.status} ${sent.text.slice(0, 160)}` };
  for (let waited = 0; waited < 120; waited += 1) {
    const page = (await call(API, "GET", fan.thread, { token: fan.token }))
      .json;
    const messages = [...(page?.messages ?? [])].sort(
      (a, b) => a.sequence - b.sequence,
    );
    const at = messages.findLastIndex(
      (m) => m.authorKind === "fan" && m.text === text,
    );
    const after = messages.slice(at + 1).filter((m) => m.authorKind === "ai");
    if (
      at >= 0 &&
      after.length &&
      after.every((m) => ["delivered", "interrupted"].includes(m.deliveryState))
    )
      return {
        state: after.map((m) => m.deliveryState).join(","),
        citations: [...new Set(after.flatMap((m) => m.citations ?? []))],
      };
    await sleep(1000);
  }
  return { error: "no answer within 120 s" };
}
const open = (fan, id) =>
  call(API, "GET", `${fan.thread}/citations/${id}`, { token: fan.token });
const exact = (source, passage) =>
  passage &&
  passage.text === source.text.trim().slice(passage.start, passage.end);

// ------------------------------------------------------------------ setup
await signInMaya();
await call(MODEL, "POST", "/__control", { body: { mode: "ok", delayMs: 0 } });
for (const source of SOURCES) {
  const made = await asMaya("POST", "/sources", {
    title: source.title,
    text: source.text,
    origin: "manual_text",
    audience: { kind: "public" },
    rightsEvidence: "Synthetic test material written for this scenario.",
    expiresAt: null,
  });
  source.id = made.json?.id;
  const [row] = await sql(
    "SELECT state,revision FROM creator.ai_source WHERE id=$1",
    [source.id],
  );
  if (row?.state === "candidate")
    await asMaya("POST", `/sources/${source.id}`, {
      expectedRevision: row.revision,
      action: "approve",
      rightsConfirmed: true,
    });
}
const indexed = await waitSources(
  (r) => r.state === "approved" && r.index_state === "ready",
);
step(
  "Maya's three sources are indexed",
  indexed.length === 3 && indexed.every((r) => r.index_state === "ready"),
  indexed.map((r) => `${r.title}: ${r.state}/${r.index_state}`).join(", "),
);
let state = (await asMaya("GET", "/state")).json;
if (!state.liveVersion) {
  const configuration = {
    mode: "expert",
    tone: "As written",
    styleCard: "",
    examples: [],
    rules: ["Always say you are the creator's AI, never the creator."],
    neverReveal: ["home address"],
    handoff: "Offer to ask Maya to step in when a question needs her.",
    dailyCostCapMicros: 20_000_000,
    sessionNudgeMinutes: 90,
    usefulnessCriteria: "Helpful, specific and honest about being an AI.",
    styleCriteria: "Warm, plain and short.",
  };
  await asMaya("PUT", "/draft", {
    expectedRevision: state.revision,
    configuration,
  });
  await asMaya("POST", "/license", {
    proofReference: `development-synthetic:${MAYA_CREATOR_ID}`,
    counselVersion: "development-synthetic-unreviewed",
    permittedUses: ["text_ai"],
    termEndsAt: new Date(Date.now() + 365 * 86400_000).toISOString(),
  });
  state = (await asMaya("GET", "/state")).json;
  await asMaya("POST", "/evaluations", { expectedRevision: state.revision });
  let evaluation;
  for (
    let waited = 0;
    waited < 300 && (!evaluation || evaluation.state === "running");
    waited += 2
  ) {
    await sleep(2000);
    evaluation = (await asMaya("GET", "/state")).json.evaluation;
  }
  state = (await asMaya("GET", "/state")).json;
  await asMaya("POST", "/publish", {
    expectedRevision: state.revision,
    evaluationId: evaluation?.id,
    changes: "E3B.3 citations scenario",
  });
  state = (await asMaya("GET", "/state")).json;
}
const versionId = state.liveVersion?.id;
step("Maya's expert AI is live", Boolean(versionId), `version ${versionId}`);
const chunkRows = await sql(
  "SELECT c.id::text, s.title, c.start_offset, c.end_offset, c.passage FROM creator.ai_chunk c JOIN creator.ai_source s ON s.id=c.source_id WHERE c.creator_id=$1 ORDER BY s.title, c.ordinal",
  [MAYA_CREATOR_ID],
);
const stored = chunkRows.map((c) => {
  const source = SOURCES.find((s) => s.title === c.title);
  return c.passage === source.text.trim().slice(c.start_offset, c.end_offset);
});
step(
  "every stored chunk is the exact slice of its source",
  stored.every(Boolean),
  `${stored.filter(Boolean).length} of ${stored.length} chunks; ${chunkRows.map((c) => `${c.title} ${c.start_offset}-${c.end_offset}`).join(", ")}`,
);

// ------------------------------------------------------------------ cite and open
let fan = await fanThread(ACTORS.fanOne, "e3b3fan");
const cited = [];
for (const c of CASES) {
  const answer = await ask(fan, c.message);
  const id = answer.citations?.[0];
  const opened = id ? await open(fan, id) : null;
  const source = SOURCES.find((s) => s.name === c.source);
  cited.push({ ...c, id, before: opened?.json });
  step(
    `cite and open "${c.marker}" (${c.source})`,
    Boolean(id) && opened.status === 200 && exact(source, opened.json),
    answer.error ??
      (id
        ? `${opened.status}; span ${opened.json?.start}-${opened.json?.end}; exact ${exact(source, opened.json)}`
        : `no citation (${answer.state})`),
  );
}
const other = await fanThread(ACTORS.fanTwo, "e3b3other");
const foreign = cited[0]?.id ? await open(other, cited[0].id) : null;
step(
  "another fan cannot open this fan's citation",
  foreign?.status === 403,
  `${foreign?.status} ${foreign?.json?.error?.code ?? ""}`,
);

// ------------------------------------------------------------------ rebuild at the same revision
const revisions = Object.fromEntries(
  (await sourceRows()).map((r) => [r.title, r.revision]),
);
async function rebuild(extra, label) {
  restart(extra);
  await signInMaya();
  const failed = await waitSources((r) => r.state === "failed", 120);
  const retried = [];
  for (const row of failed)
    retried.push(
      (
        await asMaya("POST", `/sources/${row.id}`, {
          expectedRevision: row.revision,
          action: "retry",
        })
      ).status,
    );
  const ready = await waitSources(
    (r) => r.state === "approved" && r.index_state === "ready",
  );
  step(
    `${label}: every source is rebuilt at the same revision`,
    failed.length === 3 &&
      failed.every((r) => r.state === "failed") &&
      retried.every((s) => s === 200) &&
      ready.every(
        (r) => r.index_state === "ready" && r.revision === revisions[r.title],
      ),
    `failed ${failed.filter((r) => r.state === "failed").length}, retried ${retried.join(",")}, ready ${ready.filter((r) => r.index_state === "ready").length}`,
  );
}
await rebuild(
  [
    "--env",
    "W2_EMBEDDING_MODEL=text-embedding-3-large",
    "--env",
    `W2_MODEL_RATES_JSON=${RATES_WITH_LARGE}`,
  ],
  "another embedding model",
);
await rebuild([], "the original embedding model again");
const back = await asMaya("POST", `/versions/${versionId}/rollback`, {});
step(
  "Maya brings version 1 back",
  back.status === 200,
  `${back.status} ${back.text.slice(0, 120)}`,
);
fan = await fanThread(ACTORS.fanOne, "e3b3fan");
const ids = await sql(
  "SELECT count(*)::int AS kept FROM creator.ai_chunk WHERE creator_id=$1 AND id=ANY($2::uuid[])",
  [MAYA_CREATOR_ID, cited.map((c) => c.id).filter(Boolean)],
);
step(
  "the cited chunks keep their identity through the rebuild",
  ids[0].kept === cited.filter((c) => c.id).length,
  `${ids[0].kept} of ${cited.filter((c) => c.id).length} cited chunk ids still exist`,
);
for (const c of cited) {
  if (!c.id) continue;
  const reopened = await open(fan, c.id);
  const source = SOURCES.find((s) => s.name === c.source);
  step(
    `after the rebuild "${c.marker}" opens the same span`,
    reopened.status === 200 &&
      exact(source, reopened.json) &&
      reopened.json.start === c.before?.start &&
      reopened.json.end === c.before?.end,
    `${reopened.status} ${reopened.json?.error?.code ?? ""}${reopened.status === 200 ? ` span ${reopened.json.start}-${reopened.json.end}` : ""}`,
  );
}
const fresh = await ask(fan, CASES[3].message);
const freshOpen = fresh.citations?.[0]
  ? await open(fan, fresh.citations[0])
  : null;
step(
  "a new answer after the rebuild cites and opens",
  freshOpen?.status === 200 && exact(SOURCES[2], freshOpen.json),
  fresh.error ?? `${freshOpen?.status}`,
);

// ------------------------------------------------------------------ revoked source
const table = SOURCES[0];
const [row] = await sql("SELECT revision FROM creator.ai_source WHERE id=$1", [
  table.id,
]);
const revoked = await asMaya("POST", `/sources/${table.id}`, {
  expectedRevision: row.revision,
  action: "revoke",
});
const hidden = cited[0]?.id ? await open(fan, cited[0].id) : null;
step(
  "a revoked source hides its citation",
  revoked.status === 200 && hidden?.status === 403,
  `revoke ${revoked.status}; open ${hidden?.status} ${hidden?.json?.error?.code ?? ""}`,
);

const out = flag("--out");
if (out)
  writeFileSync(
    out,
    JSON.stringify(
      {
        when: new Date().toISOString(),
        cited,
        chunks: chunkRows.map(({ passage, ...c }) => ({
          ...c,
          length: passage.length,
        })),
      },
      null,
      2,
    ),
  );
edge.close();
finish();
