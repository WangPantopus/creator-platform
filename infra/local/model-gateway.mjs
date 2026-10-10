#!/usr/bin/env node
// A capped, allow-listed gateway to the real Claude API, for local development.
//
// Why it exists: several sessions need the real model to test and develop, and
// none of them should hold the API key or be able to spend without limit. The
// key lives only in THIS process (passed in the environment at start, never
// written anywhere, never logged). Everything else sends its Claude calls here
// (the stack's preload redirects api.anthropic.com to this gateway), and the
// gateway:
//   - listens on loopback only, refuses browser-origin and foreign Host requests;
//   - forwards only POST /v1/messages for the allow-listed models, with the key
//     added here, no client headers except the API version, no tools or betas,
//     and max_tokens capped, so a request cannot be turned into something dearer;
//   - keeps a dollar budget (reserves the worst case before forwarding, settles
//     from the response's usage) that survives restarts, and stops at the cap;
//   - counts calls and cost per lane (from /lane/<id>/ in the path) and per model.
//
//   ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s qelvora-anthropic-key -w)" \
//     node infra/local/model-gateway.mjs --budget-usd 20
//
//   GET  /__stats                      spend, remaining, per lane and model, recent calls
//   POST /__control {"paused":true}    stop every lane at once (false resumes)
// Stop it with Ctrl-C: the key goes with the process.
import { createServer } from "node:http";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Micro-dollars per million tokens (Anthropic's published first-party rates). */
const RATES = {
  "claude-sonnet-5-5": {
    input: 2_000_000,
    output: 10_000_000,
    read: 200_000,
    write: 2_500_000,
  },
  "claude-haiku-5-5": {
    input: 100_000,
    output: 500_000,
    read: 10_000,
    write: 125_000,
    // Prompts over 100K tokens are billed on the higher rate card.
    long: { input: 500_000, output: 2_500_000, read: 50_000, write: 625_000 },
  },
};
const MAX_TOKENS = 8000;
const MAX_BODY = 600_000;
const FORBIDDEN = ["tools", "tool_choice", "mcp_servers", "container", "betas"];
const ROUTE = /^\/(?:lane\/([a-z0-9-]{1,16})\/)?v1\/messages$/u;

function args(argv) {
  const out = {
    port: 56499,
    budgetUsd: 10,
    upstream: "https://api.anthropic.com",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[(i += 1)];
      if (next === undefined) throw new Error(`${arg} needs a value.`);
      return next;
    };
    if (arg === "--port") out.port = Number(value());
    else if (arg === "--budget-usd") out.budgetUsd = Number(value());
    else if (arg === "--upstream") out.upstream = value();
    else if (arg === "--reset-ledger") out.reset = true;
    else throw new Error(`Unknown option ${arg}.`);
  }
  if (!Number.isInteger(out.port) || out.port < 1024 || out.port > 65535)
    throw new Error("--port must be between 1024 and 65535.");
  if (!(out.budgetUsd > 0 && out.budgetUsd <= 1000))
    throw new Error("--budget-usd must be above 0 and at most 1000.");
  const upstream = new URL(out.upstream);
  const loopback = ["127.0.0.1", "localhost"].includes(upstream.hostname);
  // Only the real API, or a loopback fake used for testing the gateway itself.
  if (out.upstream !== "https://api.anthropic.com" && !loopback)
    throw new Error("--upstream must be loopback (it exists for testing).");
  out.upstream = upstream.origin;
  out.testing = loopback;
  return out;
}

const config = args(process.argv.slice(2));
const apiKey =
  process.env.ANTHROPIC_API_KEY ?? (config.testing ? "test-key" : "");
if (!apiKey) {
  process.stderr.write(
    "ANTHROPIC_API_KEY is not set. Start the gateway with the key passed from the Keychain; see docs/operations/anthropic-provider.md.\n",
  );
  process.exit(2);
}
delete process.env.ANTHROPIC_API_KEY;

// ------------------------------------------------------------------- ledger
const dir = join(realpathSync(tmpdir()), "qelvora-stack", "gateway");
mkdirSync(dir, { recursive: true, mode: 0o700 });
const ledgerFile = join(
  dir,
  config.testing ? `ledger-test-${config.port}.json` : "ledger.json",
);
if (config.reset) rmSync(ledgerFile, { force: true });
let ledger = {
  since: new Date().toISOString(),
  spent: 0,
  calls: 0,
  byLane: {},
  byModel: {},
};
try {
  ledger = { ...ledger, ...JSON.parse(readFileSync(ledgerFile, "utf8")) };
} catch {
  // A new ledger.
}
const budget = Math.round(config.budgetUsd * 1_000_000);
let inflight = 0;
let paused = false;
const recent = [];
function flush() {
  const next = `${ledgerFile}.next`;
  writeFileSync(next, JSON.stringify(ledger), { mode: 0o600 });
  renameSync(next, ledgerFile);
}
const usd = (micros) => `$${(micros / 1_000_000).toFixed(4)}`;

// ---------------------------------------------------------------- accounting
function rateFor(model, promptTokens) {
  const rate = RATES[model];
  return rate.long && promptTokens > 100_000 ? rate.long : rate;
}
/** Cost in micro-dollars from a usage object. */
function cost(model, usage) {
  const read = usage.cache_read_input_tokens ?? 0;
  const write = usage.cache_creation_input_tokens ?? 0;
  const input = usage.input_tokens ?? 0;
  const rate = rateFor(model, input + read + write);
  return Math.ceil(
    (input * rate.input +
      read * rate.read +
      write * rate.write +
      (usage.output_tokens ?? 0) * rate.output) /
      1_000_000,
  );
}
function settle({ lane, model, status, reserved, charge, usage, started }) {
  inflight -= reserved;
  ledger.spent += charge;
  ledger.calls += 1;
  const l = (ledger.byLane[lane] ??= { calls: 0, micros: 0 });
  l.calls += 1;
  l.micros += charge;
  const m = (ledger.byModel[model] ??= {
    calls: 0,
    micros: 0,
    inputTokens: 0,
    outputTokens: 0,
  });
  m.calls += 1;
  m.micros += charge;
  m.inputTokens +=
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);
  m.outputTokens += usage.output_tokens ?? 0;
  flush();
  const entry = {
    at: new Date().toISOString(),
    lane,
    model,
    status,
    inputTokens: usage.input_tokens ?? null,
    cachedTokens: usage.cache_read_input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    costMicros: charge,
    ms: Date.now() - started,
  };
  recent.push(entry);
  if (recent.length > 30) recent.shift();
  process.stdout.write(
    `${entry.at.slice(11, 19)} lane=${lane} ${model} ${status} in=${entry.inputTokens} cached=${entry.cachedTokens} out=${entry.outputTokens} cost=${usd(charge)} total=${usd(ledger.spent)} of ${usd(budget)}\n`,
  );
}

// ------------------------------------------------------------------ handling
const send = (res, status, type, message) => {
  if (res.headersSent) return res.end();
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ type: "error", error: { type, message } }));
};
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
const hostOk = (req) =>
  [`127.0.0.1:${config.port}`, `localhost:${config.port}`].includes(
    req.headers.host ?? "",
  ) && req.headers.origin === undefined;

async function handle(req, res) {
  if (!hostOk(req))
    return send(res, 403, "permission_error", "Loopback requests only.");
  const url = new URL(req.url ?? "/", "http://gateway");
  if (url.pathname === "/__stats" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(
      JSON.stringify({
        budgetMicros: budget,
        spentMicros: ledger.spent,
        remainingMicros: Math.max(0, budget - ledger.spent - inflight),
        inflightMicros: inflight,
        paused,
        since: ledger.since,
        calls: ledger.calls,
        byLane: ledger.byLane,
        byModel: ledger.byModel,
        recent,
      }),
    );
  }
  if (url.pathname === "/__control" && req.method === "POST") {
    const body = JSON.parse((await readBody(req)) || "{}");
    if (typeof body.paused !== "boolean")
      return send(
        res,
        400,
        "invalid_request_error",
        'Send {"paused":true|false}.',
      );
    paused = body.paused;
    process.stdout.write(
      paused ? "PAUSED: every lane is refused.\n" : "Resumed.\n",
    );
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ paused }));
  }
  const route = ROUTE.exec(url.pathname);
  if (req.method !== "POST" || !route)
    return send(
      res,
      404,
      "not_found_error",
      "Only POST /v1/messages is available.",
    );
  const lane = route[1] ?? "unknown";
  if (paused)
    return send(res, 503, "api_error", "The local model gateway is paused.");
  let text;
  try {
    text = await readBody(req);
  } catch {
    return send(res, 413, "request_too_large", "The request is too large.");
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return send(res, 400, "invalid_request_error", "The body is not JSON.");
  }
  const model = body?.model;
  if (typeof model !== "string" || !Object.hasOwn(RATES, model))
    return send(
      res,
      403,
      "permission_error",
      `Model not allowed here; use ${Object.keys(RATES).join(" or ")}.`,
    );
  if (FORBIDDEN.some((key) => key in body))
    return send(
      res,
      400,
      "invalid_request_error",
      `${FORBIDDEN.join(", ")} are not allowed here.`,
    );
  if (
    !Number.isInteger(body.max_tokens) ||
    body.max_tokens < 1 ||
    body.max_tokens > MAX_TOKENS
  )
    return send(
      res,
      400,
      "invalid_request_error",
      `max_tokens must be 1 to ${MAX_TOKENS}.`,
    );
  if (body.stream !== undefined && typeof body.stream !== "boolean")
    return send(
      res,
      400,
      "invalid_request_error",
      "stream must be true or false.",
    );
  // Reserve the worst case before spending anything.
  const worst = rateFor(model, Buffer.byteLength(text));
  const reserved = Math.ceil(
    (Math.ceil(Buffer.byteLength(text) / 2) * worst.input +
      body.max_tokens * worst.output) /
      1_000_000,
  );
  if (ledger.spent + inflight + reserved > budget)
    return send(
      res,
      402,
      "billing_error",
      `Local model budget reached: ${usd(ledger.spent)} spent of ${usd(budget)}. Ask the founder to raise it.`,
    );
  inflight += reserved;
  const started = Date.now();
  const controller = new AbortController();
  let finished = false;
  const usage = {};
  let seenText = 0;
  res.on("close", () => {
    if (!finished) controller.abort();
  });
  const version = /^\d{4}-\d{2}-\d{2}$/u.test(
    String(req.headers["anthropic-version"]),
  )
    ? String(req.headers["anthropic-version"])
    : "2023-06-01";
  const done = (status, charge) => {
    if (finished) return;
    finished = true;
    settle({ lane, model, status, reserved, charge, usage, started });
  };
  let upstream;
  try {
    upstream = await fetch(`${config.upstream}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": version,
        "content-type": "application/json",
      },
      body: text,
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(120_000),
      ]),
      redirect: "error",
    });
  } catch {
    done(502, 0);
    return send(res, 502, "api_error", "The model API could not be reached.");
  }
  const type = upstream.headers.get("content-type") ?? "application/json";
  const headers = { "content-type": type };
  for (const name of ["request-id", "retry-after", "cache-control"])
    if (upstream.headers.has(name)) headers[name] = upstream.headers.get(name);
  res.writeHead(upstream.status, headers);
  if (!upstream.body) {
    done(upstream.status, 0);
    return res.end();
  }
  const streaming = type.startsWith("text/event-stream");
  let buffer = "";
  let whole = "";
  const scan = (frame) => {
    const data = frame
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("\n");
    if (!data) return;
    try {
      const event = JSON.parse(data);
      const part = event.message?.usage ?? event.usage;
      if (part)
        for (const [k, v] of Object.entries(part))
          if (typeof v === "number") usage[k] = v;
      if (event.delta?.type === "text_delta")
        seenText += event.delta.text?.length ?? 0;
      if (event.type === "message_stop") usage.__complete = true;
    } catch {
      // A frame that is not JSON is passed through untouched.
    }
  };
  try {
    for await (const chunk of upstream.body) {
      res.write(chunk);
      if (streaming) {
        buffer += Buffer.from(chunk).toString("utf8").replace(/\r\n/gu, "\n");
        let at;
        while ((at = buffer.indexOf("\n\n")) >= 0) {
          scan(buffer.slice(0, at));
          buffer = buffer.slice(at + 2);
        }
      } else whole += Buffer.from(chunk).toString("utf8");
    }
    res.end();
  } catch {
    // The client left or the upstream broke: settle below on what was seen.
    res.end();
  }
  if (!streaming) {
    try {
      Object.assign(usage, JSON.parse(whole).usage ?? {});
      usage.__complete = true;
    } catch {
      // No usage to read (an error body).
    }
  }
  if (upstream.status !== 200) return done(upstream.status, 0);
  if (usage.__complete) return done(200, cost(model, usage));
  // Aborted or broken before the end: bill what was seen, estimate the rest.
  const estimate = {
    ...usage,
    output_tokens: Math.max(
      usage.output_tokens ?? 0,
      Math.ceil(seenText / 3) + 500,
    ),
  };
  return done(
    200,
    usage.input_tokens === undefined
      ? reserved
      : Math.min(reserved, cost(model, estimate)),
  );
}

const server = createServer((req, res) => {
  handle(req, res).catch(() => send(res, 500, "api_error", "Gateway error."));
});
server.listen(config.port, "127.0.0.1", () => {
  process.stdout.write(
    `Model gateway on http://127.0.0.1:${config.port} (loopback only).\n` +
      `Budget ${usd(budget)}, spent so far ${usd(ledger.spent)}. Allowed models: ${Object.keys(RATES).join(", ")}.\n` +
      `Stats: curl -s http://127.0.0.1:${config.port}/__stats    Stop: Ctrl-C.\n`,
  );
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
