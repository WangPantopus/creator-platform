#!/usr/bin/env node
// Fake of the model provider's HTTP API (OpenAI Responses and Embeddings, and
// Claude Messages), for the local development stack only.
//
// It sits at the outer edge: the backend sends the same requests it would send
// to the provider (redirected here by preload.mjs) and gets schema-valid,
// deterministic answers. It is permissive on purpose: every guard and judge
// call approves, so a published development AI can be exercised end to end.
// It proves plumbing, not model quality or guard strictness; a scenario about
// the guard needs the real provider. Nothing here is a provider approval.
//
// Control (for failure scenarios), all on the same port:
//   POST /__control  {"mode":"ok|error500|error429|hang|garbage","delayMs":0}
//   GET  /__stats    counts per purpose and per API path, the current mode, recent requests
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const port = Number(process.argv[2] ?? process.env.FAKE_MODEL_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("usage: model.mjs <port>");

const state = { mode: "ok", delayMs: 0, counts: {}, paths: {}, recent: [] };
const record = (purpose, detail = {}) => {
  state.counts[purpose] = (state.counts[purpose] ?? 0) + 1;
  state.recent.push({ at: new Date().toISOString(), purpose, ...detail });
  if (state.recent.length > 50) state.recent.shift();
};

const REPLY = [
  "I'm this creator's AI, not the creator, so I can't speak for them or promise anything personal.",
  "I can help with what they have shared, and I'll say when I don't have an answer.",
];
const CRISIS = /suicid|kill myself|end my life|self[- ]?harm|hurt myself/iu;

/** Words hashed into a fixed-size vector, so equal words attract each other. */
function embed(text, dimensions = 64) {
  const vector = new Array(dimensions).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    const digest = createHash("sha256").update(word).digest();
    vector[digest[0] % dimensions] += digest[1] % 2 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0)) || 1;
  return vector.map((x) => Number((x / norm).toFixed(6)));
}

const tokens = (text) => Math.max(1, Math.ceil(String(text).length / 4));
const usageFor = (input, output) => ({
  input_tokens: tokens(input),
  output_tokens: tokens(output),
  total_tokens: tokens(input) + tokens(output),
  input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
  output_tokens_details: { reasoning_tokens: 0 },
});

/** A minimal instance of any JSON schema, for calls this fake has no purpose for. */
function synthesize(schema) {
  if (!schema || typeof schema !== "object") return null;
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  const type = Array.isArray(schema.type)
    ? (schema.type.find((t) => t !== "null") ?? "null")
    : schema.type;
  if (type === "object") {
    const out = {};
    for (const [key, value] of Object.entries(schema.properties ?? {}))
      out[key] = synthesize(value);
    return out;
  }
  if (type === "array") {
    const count = schema.minItems ?? 0;
    return Array.from({ length: count }, () => synthesize(schema.items));
  }
  if (type === "boolean") return false;
  if (type === "integer" || type === "number") return schema.minimum ?? 0;
  if (type === "string")
    return schema.format === "uuid"
      ? "00000000-0000-4000-8000-000000000000"
      : "ok";
  return null;
}

const keys = (schema) => Object.keys(schema?.properties ?? {});

/** The object the real provider would have returned for this schema. */
function answer(schema, contextText) {
  let context = {};
  try {
    context = JSON.parse(contextText);
  } catch {
    // Context that is not JSON still gets a valid, harmless answer.
  }
  const names = keys(schema);
  if (names.includes("crisis") && names.includes("social")) {
    record("input_verdict");
    return {
      allowed: true,
      crisis: CRISIS.test(String(context.message ?? "")),
      sensitive: false,
      social: false,
      category: "general",
    };
  }
  if (names.includes("segments") && names.includes("requiresEvidence")) {
    record("output_verdict");
    const text = String(context.sentence?.text ?? "ok");
    return {
      segments: [
        {
          text,
          kind: "non_factual",
          evidence: [],
          assessment:
            "Development fake: treated as non-factual (no evidence is checked).",
          relation: "non_factual",
        },
      ],
      allowed: true,
      category: "none",
      requiresEvidence: false,
      supported: true,
    };
  }
  if (names.includes("passed") && names.includes("reason")) {
    record("judge");
    const blocked = context.deliveryGuardrailBlocked === true;
    return {
      passed: !blocked,
      reason: blocked
        ? "Development fake judge: the delivery guard withheld output."
        : "Development fake judge: the recorded answer is accepted.",
      // Scores are recorded but never decide a result.
      usefulness: 1,
      style: 1,
    };
  }
  if (names.includes("sentences") && names.includes("refusalCode")) {
    record("reply");
    return {
      sentences: REPLY.map((text) => ({ text, citations: [] })),
      refusalCode: null,
      handoffReason: null,
    };
  }
  record("other_structured", { fields: names.slice(0, 8) });
  return synthesize(schema);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 4_000_000) reject(new Error("body too large"));
      else chunks.push(chunk);
    });
    request.on("end", () =>
      resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")),
    );
    request.on("error", reject);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function handleResponses(body, response) {
  const schema = body.text?.format?.schema;
  const contextText = Array.isArray(body.input)
    ? body.input.map((item) => item.content ?? "").join("\n\n")
    : String(body.input ?? "");
  const object = answer(schema, contextText);
  const text = JSON.stringify(object);
  const usage = usageFor(`${body.instructions ?? ""}${contextText}`, text);
  const meta = { id: "resp_fake", object: "response", model: body.model };
  if (!body.stream) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
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
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
  });
  const send = (event) => response.write(`data: ${JSON.stringify(event)}\n\n`);
  send({
    type: "response.created",
    response: { ...meta, status: "in_progress" },
  });
  for (let at = 0; at < text.length; at += 48) {
    if (state.delayMs) await sleep(Math.min(state.delayMs, 2000));
    send({
      type: "response.output_text.delta",
      delta: text.slice(at, at + 48),
    });
  }
  send({
    type: "response.completed",
    response: { ...meta, status: "completed", usage },
  });
  response.end();
}

/** Claude Messages: same answers as the Responses route, in Claude's shapes. */
async function handleMessages(body, response) {
  const schema = body.output_config?.format?.schema;
  const textOf = (content) =>
    typeof content === "string"
      ? content
      : (content ?? []).map((block) => block.text ?? "").join("");
  const contextText = (body.messages ?? [])
    .map((message) => textOf(message.content))
    .join("\n\n");
  const instructions = textOf(body.system);
  const text = JSON.stringify(answer(schema, contextText));
  const usage = {
    input_tokens: tokens(`${instructions}${contextText}`),
    output_tokens: tokens(text),
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
  const meta = {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: body.model,
  };
  if (!body.stream) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ...meta,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage,
      }),
    );
    return;
  }
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
  });
  const send = (type, data) =>
    response.write(
      `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`,
    );
  send("message_start", {
    message: {
      ...meta,
      content: [],
      stop_reason: null,
      usage: { ...usage, output_tokens: 1 },
    },
  });
  send("content_block_start", {
    index: 0,
    content_block: { type: "text", text: "" },
  });
  for (let at = 0; at < text.length; at += 48) {
    if (state.delayMs) await sleep(Math.min(state.delayMs, 2000));
    send("content_block_delta", {
      index: 0,
      delta: { type: "text_delta", text: text.slice(at, at + 48) },
    });
  }
  send("content_block_stop", { index: 0 });
  send("message_delta", {
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: usage.output_tokens },
  });
  send("message_stop", {});
  response.end();
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://fake");
    if (url.pathname === "/__stats" && request.method === "GET") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(state));
      return;
    }
    if (url.pathname === "/__control" && request.method === "POST") {
      const body = await readBody(request);
      if (
        !["ok", "error500", "error429", "hang", "garbage"].includes(body.mode)
      ) {
        response.writeHead(400).end("unknown mode");
        return;
      }
      state.mode = body.mode;
      state.delayMs = Number(body.delayMs ?? 0) || 0;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ mode: state.mode, delayMs: state.delayMs }),
      );
      return;
    }
    if (request.method !== "POST" || !url.pathname.startsWith("/v1/")) {
      response.writeHead(404).end("not found");
      return;
    }
    const body = await readBody(request);
    state.paths[url.pathname] = (state.paths[url.pathname] ?? 0) + 1;
    if (state.mode === "hang") return; // never answers; the caller times out
    if (state.mode === "error500" || state.mode === "error429") {
      record("injected_failure", { mode: state.mode });
      response.writeHead(state.mode === "error429" ? 429 : 500).end("injected");
      return;
    }
    if (state.mode === "garbage") {
      record("injected_failure", { mode: state.mode });
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"status":"completed","output":"not what was promised"}');
      return;
    }
    if (state.delayMs && !body.stream) await sleep(state.delayMs);
    if (url.pathname === "/v1/embeddings") {
      record("embedding");
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      const data = inputs.map((text, index) => ({
        object: "embedding",
        index,
        embedding: embed(String(text)),
      }));
      const total = inputs.reduce((sum, text) => sum + tokens(text), 0);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          object: "list",
          data,
          model: body.model,
          usage: { prompt_tokens: total, total_tokens: total },
        }),
      );
      return;
    }
    if (url.pathname === "/v1/responses") {
      await handleResponses(body, response);
      return;
    }
    if (url.pathname === "/v1/messages") {
      await handleMessages(body, response);
      return;
    }
    response.writeHead(404).end("unsupported endpoint");
  } catch {
    if (!response.headersSent) response.writeHead(400);
    response.end("bad request");
  }
});
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(`fake model provider on 127.0.0.1:${port}\n`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
