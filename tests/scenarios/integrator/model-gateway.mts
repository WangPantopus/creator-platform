/**
 * Scenario run for the capped model gateway (infra/local/model-gateway.mjs)
 * against a recording fake upstream. No key and no network needed. From the
 * repository root: node --import tsx tests/scenarios/integrator/model-gateway.mts
 * (or: cd apps/backend && pnpm exec tsx ../../tests/scenarios/integrator/model-gateway.mts)
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

const GATEWAY_KEY = "sk-ant-gateway-test-key";
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

// ------------------------------------------------------------ fake upstream
type Seen = { headers: IncomingHttpHeaders; body: Record<string, unknown> };
const seen: Seen[] = [];
let upstreamMode: "ok" | "stream" | "hold" | "overloaded" = "ok";
const usage = {
  input_tokens: 1000,
  cache_read_input_tokens: 2000,
  cache_creation_input_tokens: 500,
  output_tokens: 200,
};
const frame = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const streamFrames = [
  frame("message_start", {
    message: {
      id: "m",
      role: "assistant",
      content: [],
      usage: { ...usage, output_tokens: 1 },
    },
  }),
  frame("content_block_start", {
    index: 0,
    content_block: { type: "text", text: "" },
  }),
  frame("content_block_delta", {
    index: 0,
    delta: { type: "text_delta", text: "Hello there" },
  }),
  frame("content_block_stop", { index: 0 }),
  frame("message_delta", {
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 200 },
  }),
  frame("message_stop", {}),
];
const upstream: Server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  seen.push({ headers: req.headers, body });
  if (upstreamMode === "overloaded") {
    res.writeHead(529, {
      "content-type": "application/json",
      "request-id": "req_x",
    });
    return res.end(
      '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
    );
  }
  if (body.stream) {
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (upstreamMode === "hold") {
      res.write(streamFrames[0]!);
      res.write(streamFrames[1]!);
      res.write(streamFrames[2]!);
      return; // never finishes: the client aborts
    }
    for (const text of streamFrames) res.write(text);
    return res.end();
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      id: "m",
      type: "message",
      content: [{ type: "text", text: "{}" }],
      stop_reason: "end_turn",
      usage,
    }),
  );
});
await new Promise<void>((done) =>
  upstream.listen(0, "127.0.0.1", () => done()),
);
const upstreamPort = (upstream.address() as AddressInfo).port;

// ------------------------------------------------------------------ gateway
const gatewayPort = 56498;
const base = `http://127.0.0.1:${gatewayPort}`;
let child: ChildProcess;
let output = "";
async function startGateway(budgetUsd: string, reset: boolean) {
  child = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../../../infra/local/model-gateway.mjs", import.meta.url),
      ),
      "--port",
      String(gatewayPort),
      "--budget-usd",
      budgetUsd,
      "--upstream",
      `http://127.0.0.1:${upstreamPort}`,
      ...(reset ? ["--reset-ledger"] : []),
    ],
    { env: { ...process.env, ANTHROPIC_API_KEY: GATEWAY_KEY } },
  );
  child.stdout?.on("data", (chunk) => (output += String(chunk)));
  child.stderr?.on("data", (chunk) => (output += String(chunk)));
  for (let i = 0; i < 100 && !output.includes("Model gateway on"); i++)
    await sleep(50);
  assert.ok(
    output.includes("Model gateway on"),
    `gateway did not start: ${output.slice(0, 300)}`,
  );
}
const stopGateway = () =>
  new Promise<void>((done) => {
    child.once("exit", () => done());
    child.kill("SIGTERM");
  });
const stats = async () =>
  (await fetch(`${base}/__stats`)).json() as Promise<Record<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
const message = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    model: "claude-sonnet-5-5",
    max_tokens: 100,
    messages: [{ role: "user", content: "hi" }],
    ...extra,
  });
const post = (
  path: string,
  body: string,
  headers: Record<string, string> = {},
) =>
  fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });

const results: { id: string; ok: boolean; note: string }[] = [];
async function scenario(id: string, title: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ id, ok: true, note: "" });
  } catch (error) {
    results.push({ id, ok: false, note: String(error).split("\n")[0] ?? "" });
  }
  const last = results.at(-1)!;
  console.log(
    `${last.ok ? "PASS" : "FAIL"} ${id} ${title}${last.note ? ` :: ${last.note}` : ""}`,
  );
}

await startGateway("0.01", true);

await scenario(
  "G1",
  "forwards with its own key only, counts per lane",
  async () => {
    const response = await post("/lane/3/v1/messages", message(), {
      "x-api-key": "client-supplied-key",
      authorization: "Bearer client-token",
      "anthropic-beta": "fast-mode-2026-02-01",
    });
    assert.equal(response.status, 200);
    const forwarded = seen.at(-1)!;
    assert.equal(forwarded.headers["x-api-key"], GATEWAY_KEY);
    assert.equal(forwarded.headers.authorization, undefined);
    assert.equal(forwarded.headers["anthropic-beta"], undefined);
    assert.equal(forwarded.headers["anthropic-version"], "2023-06-01");
    const s = await stats();
    assert.equal(s.byLane["3"].calls, 1);
    assert.equal(s.spentMicros, 5650);
  },
);

await scenario("G2", "refuses what it must not forward", async () => {
  const before = seen.length;
  const cases: [string, string, number][] = [
    ["/v1/messages", message({ model: "claude-opus-5-5" }), 403],
    ["/v1/messages", message({ tools: [{ name: "x" }] }), 400],
    ["/v1/messages", message({ betas: ["x"] }), 400],
    ["/v1/messages", message({ max_tokens: 9000 }), 400],
    ["/v1/messages", message({ stream: "yes" }), 400],
    ["/v1/messages", "not json", 400],
    ["/v1/complete", message(), 404],
    ["/lane/Bad Lane/v1/messages", message(), 404],
  ];
  for (const [path, body, status] of cases)
    assert.equal(
      (await post(path, body)).status,
      status,
      `${path} ${body.slice(0, 40)}`,
    );
  assert.equal((await fetch(`${base}/v1/messages`)).status, 404);
  assert.equal(seen.length, before, "nothing may reach the upstream");
});

await scenario(
  "G3",
  "streams through unchanged and prices the receipt",
  async () => {
    upstreamMode = "stream";
    const response = await post(
      "/lane/5/v1/messages",
      message({ stream: true }),
    );
    assert.equal(response.status, 200);
    assert.equal(await response.text(), streamFrames.join(""));
    await sleep(50);
    const s = await stats();
    assert.equal(s.byLane["5"].micros, 5650);
    assert.equal(s.spentMicros, 11300);
    upstreamMode = "ok";
  },
);

await scenario(
  "G4",
  "stops at the budget (reserves the worst case first)",
  async () => {
    const before = seen.length;
    const refused = await post(
      "/lane/3/v1/messages",
      message({ max_tokens: 4000 }),
    );
    assert.equal(refused.status, 402);
    assert.match(await refused.text(), /budget/i);
    assert.equal(seen.length, before);
    const s = await stats();
    assert.equal(s.inflightMicros, 0);
  },
);

await scenario(
  "G5",
  "a client that leaves mid-stream is charged, not forgiven",
  async () => {
    await stopGateway();
    output = "";
    await startGateway("1", true);
    upstreamMode = "hold";
    const controller = new AbortController();
    const response = await fetch(`${base}/lane/7/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: message({ stream: true }),
      signal: controller.signal,
    });
    const reader = response.body!.getReader();
    await reader.read();
    controller.abort();
    await sleep(300);
    const s = await stats();
    assert.equal(s.inflightMicros, 0);
    assert.ok(
      s.byLane["7"].micros > 0,
      "an abandoned stream must cost something",
    );
    upstreamMode = "ok";
  },
);

await scenario("G6", "upstream errors pass through at no cost", async () => {
  const before = (await stats()).spentMicros;
  upstreamMode = "overloaded";
  const response = await post("/lane/2/v1/messages", message());
  assert.equal(response.status, 529);
  assert.equal(response.headers.get("request-id"), "req_x");
  assert.match(await response.text(), /overloaded_error/);
  assert.equal((await stats()).spentMicros, before);
  upstreamMode = "ok";
});

await scenario(
  "G7",
  "only loopback callers with the right Host and no Origin",
  async () => {
    const status = (headers: Record<string, string>) =>
      new Promise<number>((done, fail) => {
        const req = httpRequest(
          {
            host: "127.0.0.1",
            port: gatewayPort,
            path: "/__stats",
            method: "GET",
            headers,
          },
          (res) => {
            res.resume();
            done(res.statusCode ?? 0);
          },
        );
        req.on("error", fail);
        req.end();
      });
    assert.equal(await status({}), 200);
    assert.equal(await status({ host: "evil.example" }), 403);
    assert.equal(await status({ origin: "http://evil.example" }), 403);
  },
);

await scenario("G8", "pause stops every lane; resume restores", async () => {
  const set = (paused: boolean) =>
    fetch(`${base}/__control`, {
      method: "POST",
      body: JSON.stringify({ paused }),
    });
  assert.equal((await set(true)).status, 200);
  assert.equal((await post("/lane/3/v1/messages", message())).status, 503);
  assert.equal((await set(false)).status, 200);
  assert.equal((await post("/lane/3/v1/messages", message())).status, 200);
  assert.equal(
    (await fetch(`${base}/__control`, { method: "POST", body: "{}" })).status,
    400,
  );
});

await scenario(
  "G9",
  "the spend survives a restart and the key never appears",
  async () => {
    const spent = (await stats()).spentMicros;
    assert.ok(spent > 0);
    await stopGateway();
    output = "";
    await startGateway("1", false);
    assert.equal((await stats()).spentMicros, spent);
    const everything = output + JSON.stringify(await stats());
    assert.equal(everything.includes(GATEWAY_KEY), false);
    assert.equal(everything.includes("client-supplied-key"), false);
  },
);

await stopGateway();
upstream.close();
const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} scenarios passed`,
);
process.exit(failed.length ? 1 : 0);
