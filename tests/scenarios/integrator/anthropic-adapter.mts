/**
 * Scenario run for the Anthropic model adapter against fake provider servers
 * (the outer edge). Run from the repository root:
 *   (cd apps/backend && pnpm exec tsx ../../tests/scenarios/integrator/anthropic-adapter.ts)
 * Prints one line per scenario and exits non-zero when any fails.
 */
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { AnthropicMessagesModel } from "../../../apps/backend/src/modules/agent/anthropic-model.ts";
import {
  InputVerdict,
  ReplySchema,
  modelFromEnvironment,
} from "../../../apps/backend/src/modules/agent/model.ts";
import { ProviderResponseError } from "../../../apps/backend/src/modules/agent/response-usage.ts";

const rates = {
  "claude-haiku-5-5": {
    inputMicrosPerMillion: 100_000,
    outputMicrosPerMillion: 500_000,
    cachedInputMicrosPerMillion: 10_000,
    cacheWriteMicrosPerMillion: 125_000,
  },
  "claude-sonnet-5-5": {
    inputMicrosPerMillion: 2_000_000,
    outputMicrosPerMillion: 10_000_000,
    cachedInputMicrosPerMillion: 200_000,
    cacheWriteMicrosPerMillion: 2_500_000,
  },
  "text-embedding-3-small": {
    inputMicrosPerMillion: 20_000,
    outputMicrosPerMillion: 0,
  },
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (value: unknown, ...path: (string | number)[]) =>
  path.reduce<unknown>(
    (node, key) =>
      (node as Record<string | number, unknown> | undefined)?.[key],
    value,
  );

type Recorded = {
  url: string | undefined;
  headers: IncomingMessage["headers"];
  body: unknown;
};
type Handler = (res: ServerResponse, body: unknown) => Promise<void> | void;
function fakeServer(onRequest: (record: Recorded) => Promise<Handler>) {
  let open = 0;
  const server: Server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
    open++;
    res.on("close", () => open--);
    const handler = await onRequest({
      url: req.url,
      headers: req.headers,
      body,
    });
    await handler(res, body);
  });
  return {
    server,
    openCount: () => open,
    start: () =>
      new Promise<string>((resolve) =>
        server.listen(0, "127.0.0.1", () =>
          resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
        ),
      ),
  };
}

const frame = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const sentence = (text: string) => ({ text, citations: [] });
const replyJson = (
  sentences: unknown[],
  extra: Record<string, unknown> = { refusalCode: null, handoffReason: null },
) => JSON.stringify({ sentences, ...extra });
function messageFrames(options: {
  json: string;
  stop?: string | null;
  usage?: Record<string, unknown>;
  thinking?: boolean;
  split?: number;
  end?: boolean;
}) {
  const frames = [
    frame("message_start", {
      message: {
        id: "msg_1",
        role: "assistant",
        content: [],
        usage: {
          input_tokens: 100,
          cache_creation_input_tokens: 500,
          cache_read_input_tokens: 2000,
          output_tokens: 1,
          ...options.usage,
        },
      },
    }),
    frame("ping", {}),
  ];
  let index = 0;
  if (options.thinking ?? true) {
    frames.push(
      frame("content_block_start", {
        index: 0,
        content_block: { type: "thinking", thinking: "", signature: "" },
      }),
      frame("content_block_delta", {
        index: 0,
        delta: { type: "thinking_delta", thinking: "hidden reasoning" },
      }),
      frame("content_block_stop", { index: 0 }),
    );
    index = 1;
  }
  frames.push(
    frame("content_block_start", {
      index,
      content_block: { type: "text", text: "" },
    }),
  );
  const split = options.split ?? 9;
  for (let i = 0; i < options.json.length; i += split)
    frames.push(
      frame("content_block_delta", {
        index,
        delta: { type: "text_delta", text: options.json.slice(i, i + split) },
      }),
    );
  frames.push(frame("content_block_stop", { index }));
  if (options.end !== false)
    frames.push(
      frame("message_delta", {
        delta: { stop_reason: options.stop ?? "end_turn" },
        usage: { output_tokens: 120 },
      }),
      frame("message_stop", {}),
    );
  return frames;
}
async function streamFrames(res: ServerResponse, frames: string[], gap = 1) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const text of frames) {
    // Cut frames at odd boundaries so the client must reassemble them.
    for (let i = 0; i < text.length; i += 23) res.write(text.slice(i, i + 23));
    await sleep(gap);
  }
  res.end();
}
const messageBody = (content: unknown, stop = "end_turn") => ({
  id: "msg_2",
  content,
  stop_reason: stop,
  usage: {
    input_tokens: 10,
    output_tokens: 20,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  },
});

const records: Recorded[] = [];
let next: Handler = () => undefined;
const anthropic = fakeServer(async (record) => {
  records.push(record);
  return next;
});
const embeddings = fakeServer(async () => (res, body) => {
  const inputs = (body as { input: string[] }).input;
  const ragged = inputs.some((text) => text === "ragged");
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      data: inputs.map((_text, index) => ({
        index,
        embedding: Array.from({ length: ragged && index ? 17 : 16 }, () => 0.5),
      })),
      usage: { total_tokens: 12 },
    }),
  );
});

const anthropicUrl = await anthropic.start();
const openaiUrl = await embeddings.start();
const configuration = {
  apiKey: "sk-ant-fake-key-for-scenarios",
  embeddingApiKey: "sk-fake-openai-key",
  smallModel: "claude-haiku-5-5",
  largeModel: "claude-sonnet-5-5",
  embeddingModel: "text-embedding-3-small",
  policyReference: "scenario-policy",
  rates,
  endpoints: { anthropic: anthropicUrl, openai: openaiUrl },
};
const model = new AnthropicMessagesModel(configuration);
const signal = new AbortController().signal;
async function collect(
  source: AsyncIterable<unknown>,
  stamp?: (item: unknown) => void,
) {
  const items: unknown[] = [];
  for await (const item of source) {
    stamp?.(item);
    items.push(item);
  }
  return items;
}
async function failure(run: Promise<unknown>) {
  try {
    await run;
  } catch (error) {
    return error as Error & { code?: string; usage?: unknown; cause?: unknown };
  }
  throw new Error("expected a failure");
}

const results: { id: string; title: string; ok: boolean; note: string }[] = [];
async function scenario(id: string, title: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ id, title, ok: true, note: "" });
  } catch (error) {
    results.push({
      id,
      title,
      ok: false,
      note: String(error).split("\n")[0] ?? "",
    });
  }
  const last = results.at(-1)!;
  console.log(
    `${last.ok ? "PASS" : "FAIL"} ${id} ${title}${last.note ? ` :: ${last.note}` : ""}`,
  );
}

await scenario(
  "A1",
  "reply streams sentences before the receipt, usage priced",
  async () => {
    const json = replyJson([
      sentence("First sentence."),
      sentence("Second one."),
    ]);
    next = (res) => streamFrames(res, messageFrames({ json }));
    const started = records.length;
    const order: string[] = [];
    const items = await collect(
      model.reply("You are the creator's AI.", ["Fan: hello"], "large", signal),
      (item) =>
        order.push("sentence" in (item as object) ? "sentence" : "usage"),
    );
    assert.deepEqual(order, ["sentence", "sentence", "usage"]);
    const usage = (items[2] as { usage: Record<string, unknown> }).usage;
    assert.equal(usage.provider, "Anthropic");
    assert.equal(usage.inputTokens, 2600);
    assert.equal(usage.cachedInputTokens, 2000);
    assert.equal(usage.cacheWriteInputTokens, 500);
    assert.equal(usage.outputTokens, 120);
    assert.equal(usage.costMicros, 3050);
    const request = records[started]!;
    assert.equal(request.url, "/v1/messages");
    assert.equal(request.headers["x-api-key"], configuration.apiKey);
    assert.equal(request.headers["anthropic-version"], "2023-06-01");
    assert.equal(at(request.body, "model"), "claude-sonnet-5-5");
    assert.equal(at(request.body, "stream"), true);
    assert.equal(
      at(request.body, "system", 0, "cache_control", "type"),
      "ephemeral",
    );
    assert.equal(at(request.body, "output_config", "effort"), "low");
    assert.equal(
      at(request.body, "output_config", "format", "type"),
      "json_schema",
    );
    const messages = at(request.body, "messages") as { role: string }[];
    assert.equal(messages.at(-1)?.role, "user");
    for (const forbidden of [
      "temperature",
      "top_p",
      "top_k",
      "thinking",
      "tool_choice",
    ])
      assert.equal(forbidden in (request.body as object), false, forbidden);
  },
);

await scenario(
  "A2",
  "wire schema drops unsupported keywords, keeps limits as hints",
  async () => {
    const schema = JSON.stringify(
      at(records.at(-1)!.body, "output_config", "format", "schema"),
    );
    for (const keyword of [
      "minLength",
      "maxLength",
      "maxItems",
      "pattern",
      "$schema",
      "minimum",
    ])
      assert.equal(schema.includes(`"${keyword}"`), false, keyword);
    assert.match(schema, /additionalProperties/);
    assert.match(schema, /maxItems 12/);
    assert.match(schema, /maxLength 1200/);
    assert.match(schema, /"format":"uuid"/);
  },
);

await scenario("A3", "small route uses the small model", async () => {
  next = (res) =>
    streamFrames(res, messageFrames({ json: replyJson([sentence("Hi.")]) }));
  await collect(model.reply("x", ["y"], "small", signal));
  assert.equal(at(records.at(-1)!.body, "model"), "claude-haiku-5-5");
});

await scenario("A4", "refusal keeps usage and is not delivered", async () => {
  next = (res) =>
    streamFrames(res, messageFrames({ json: "", stop: "refusal" }));
  const error = await failure(
    collect(model.reply("x", ["y"], "large", signal)),
  );
  assert.ok(error instanceof ProviderResponseError);
  assert.equal(error.code, "provider_refused");
  assert.equal((error.usage as { outputTokens: number }).outputTokens, 120);
});

await scenario(
  "A5",
  "max_tokens and invalid final reply keep usage",
  async () => {
    const json = replyJson([sentence("Cut off")]);
    next = (res) =>
      streamFrames(res, messageFrames({ json, stop: "max_tokens" }));
    const cut = await failure(
      collect(model.reply("x", ["y"], "large", signal)),
    );
    assert.ok(cut instanceof ProviderResponseError);
    assert.equal(cut.code, "provider_incomplete");
    // Strict final validation: refusalCode and handoffReason are required.
    const strict = JSON.stringify({ sentences: [sentence("Hello.")] });
    next = (res) => streamFrames(res, messageFrames({ json: strict }));
    const invalid = await failure(
      collect(model.reply("x", ["y"], "large", signal)),
    );
    assert.ok(invalid instanceof ProviderResponseError);
    assert.equal(invalid.code, "provider_output_invalid");
  },
);

await scenario(
  "A6",
  "HTTP failures map to busy or failed without usage",
  async () => {
    for (const [status, code] of [
      [429, "provider_busy"],
      [529, "provider_busy"],
      [500, "provider_failed"],
      [401, "provider_failed"],
      [400, "provider_failed"],
    ] as const) {
      next = (res) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            type: "error",
            error: { type: "x", message: "SECRET-BODY" },
          }),
        );
      };
      const error = await failure(
        collect(model.reply("x", ["y"], "large", signal)),
      );
      assert.equal(error.code, code, String(status));
      assert.equal(
        (error.cause as { upstreamStatus: number }).upstreamStatus,
        status,
      );
      assert.equal(error.message.includes("SECRET-BODY"), false);
      assert.equal(error instanceof ProviderResponseError, false);
    }
  },
);

await scenario(
  "A7",
  "mid-stream overloaded error, early close, caller abort",
  async () => {
    const json = replyJson([sentence("Start.")]);
    const partial = messageFrames({ json, end: false });
    next = (res) =>
      streamFrames(res, [
        ...partial,
        frame("error", {
          error: { type: "overloaded_error", message: "Overloaded" },
        }),
      ]);
    const overloaded = await failure(
      collect(model.reply("x", ["y"], "large", signal)),
    );
    assert.equal(overloaded.code, "provider_busy");
    next = (res) => streamFrames(res, partial);
    const early = await failure(
      collect(model.reply("x", ["y"], "large", signal)),
    );
    assert.equal(early.code, "provider_incomplete");
    const controller = new AbortController();
    next = (res) => streamFrames(res, messageFrames({ json, split: 2 }), 20);
    const cancelled = failure(
      collect(model.reply("x", ["y"], "large", controller.signal), (item) => {
        if ("sentence" in (item as object)) controller.abort();
      }),
    );
    assert.equal((await cancelled).code, "generation_cancelled");
  },
);

await scenario(
  "A8",
  "structured: valid, constraint breach, refusal",
  async () => {
    next = (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          messageBody([
            { type: "thinking", thinking: "", signature: "s" },
            {
              type: "text",
              text: JSON.stringify({
                allowed: true,
                crisis: false,
                sensitive: false,
                social: false,
                category: "ok",
              }),
            },
          ]),
        ),
      );
    };
    const ok = await model.structured(
      "classify",
      ["msg"],
      InputVerdict,
      "small",
      signal,
    );
    assert.equal(ok.value.allowed, true);
    assert.equal(ok.usage.provider, "Anthropic");
    assert.equal("stream" in (records.at(-1)!.body as object), false);
    next = (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          messageBody([
            {
              type: "text",
              text: replyJson([sentence("x".repeat(1300))]),
            },
          ]),
        ),
      );
    };
    const breach = await failure(
      model.structured("write", ["ctx"], ReplySchema, "large", signal),
    );
    assert.ok(breach instanceof ProviderResponseError);
    assert.equal(breach.code, "provider_output_invalid");
    next = (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(messageBody([], "refusal")));
    };
    const refused = await failure(
      model.structured("write", ["ctx"], InputVerdict, "small", signal),
    );
    assert.equal(refused.code, "provider_refused");
  },
);

await scenario(
  "A9",
  "embeddings stay on OpenAI; ragged vectors rejected",
  async () => {
    const ok = await model.embed(["a", "b"], signal);
    assert.equal(ok.vectors.length, 2);
    assert.equal(ok.usage.provider, "OpenAI");
    assert.equal(ok.usage.costMicros, 1);
    const bad = await failure(model.embed(["a", "ragged"], signal));
    assert.ok(bad instanceof ProviderResponseError);
    assert.equal(bad.code, "embedding_invalid");
  },
);

await scenario(
  "A10",
  "unknown cache counters keep the cost unknown",
  async () => {
    const json = replyJson([sentence("Hi.")]);
    next = (res) =>
      streamFrames(
        res,
        messageFrames({
          json,
          usage: {
            cache_creation_input_tokens: null,
            cache_read_input_tokens: null,
          },
        }).map((text) =>
          text
            .replace('"cache_creation_input_tokens":null,', "")
            .replace('"cache_read_input_tokens":null,', ""),
        ),
      );
    const items = await collect(model.reply("x", ["y"], "large", signal));
    const usage = (items.at(-1) as { usage: { costMicros: number | null } })
      .usage;
    assert.equal(usage.costMicros, null);
  },
);

await scenario("A11", "ninth concurrent call is refused as busy", async () => {
  const release: (() => void)[] = [];
  next = (res) =>
    new Promise<void>((resolve) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(messageFrames({ json: "", end: false })[0]!);
      release.push(() => {
        res.end();
        resolve();
      });
    });
  const controllers = Array.from({ length: 8 }, () => new AbortController());
  const running = controllers.map((c) =>
    failure(collect(model.reply("x", ["y"], "large", c.signal))),
  );
  for (let i = 0; i < 100 && anthropic.openCount() < 8; i++) await sleep(10);
  assert.equal(anthropic.openCount(), 8);
  const ninth = await failure(
    collect(model.reply("x", ["y"], "large", signal)),
  );
  assert.equal(ninth.code, "provider_busy");
  for (const c of controllers) c.abort();
  for (const done of await Promise.all(running))
    assert.equal(done.code, "generation_cancelled");
  release.forEach((fn) => fn());
});

await scenario(
  "A12",
  "empty context is refused before any request",
  async () => {
    const before = records.length;
    const error = await failure(collect(model.reply("x", [], "large", signal)));
    assert.equal(error.code, "provider_input_invalid");
    assert.equal(records.length, before);
  },
);

await scenario("A13", "fingerprint and pricing", async () => {
  const same = new AnthropicMessagesModel({
    ...configuration,
    apiKey: "other-key",
  });
  assert.equal(same.fingerprint, model.fingerprint);
  for (const changed of [
    { largeModel: "claude-opus-5-5" },
    { effort: "high" as const },
    { policyReference: "other" },
  ])
    assert.notEqual(
      new AnthropicMessagesModel({ ...configuration, ...changed }).fingerprint,
      model.fingerprint,
    );
  assert.equal(model.pricingConfigured, true);
  assert.ok((model.maximumRunCostMicros(1000) ?? 0) > 0);
  const unpriced = new AnthropicMessagesModel({
    ...configuration,
    rates: undefined,
  });
  assert.equal(unpriced.pricingConfigured, false);
  assert.equal(unpriced.maximumRunCostMicros(1000), null);
});

await scenario(
  "A14",
  "environment selects the provider and fails closed",
  async () => {
    const env = {
      W2_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "k",
      OPENAI_API_KEY: "o",
      W2_SMALL_MODEL: "claude-haiku-5-5",
      W2_LARGE_MODEL: "claude-sonnet-5-5",
      W2_EMBEDDING_MODEL: "text-embedding-3-small",
      W2_PROVIDER_POLICY_REFERENCE: "ref",
      W2_MODEL_RATES_JSON: JSON.stringify(rates),
    };
    const built = modelFromEnvironment(env);
    assert.ok(built instanceof AnthropicMessagesModel);
    assert.equal(built.pricingConfigured, true);
    assert.equal(modelFromEnvironment({ ...env, W2_PROVIDER: "other" }), null);
    assert.equal(modelFromEnvironment({ ...env, OPENAI_API_KEY: "" }), null);
    assert.equal(modelFromEnvironment({ ...env, ANTHROPIC_API_KEY: "" }), null);
    assert.equal(
      modelFromEnvironment({ ...env, W2_LARGE_MODEL: "gpt-5" }),
      null,
    );
    assert.throws(() =>
      modelFromEnvironment({ ...env, W2_ANTHROPIC_EFFORT: "max" }),
    );
    assert.equal(modelFromEnvironment({}), null);
  },
);

anthropic.server.close();
embeddings.server.close();
const failed = results.filter((result) => !result.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} scenarios passed`,
);
process.exit(failed.length ? 1 : 0);
