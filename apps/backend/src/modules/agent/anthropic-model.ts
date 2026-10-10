import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import { ReplySchema, type AgentModel } from "./model.js";
import { completedSentences, type StreamProposal } from "./streaming.js";
import {
  ModelRateSchema,
  ProviderResponseError,
  responseUsage,
  type ModelRate,
} from "./response-usage.js";

/**
 * Claude (Messages API) behind the same AgentModel port as the OpenAI adapter.
 *
 * - "small" and "large" routes map to two configured Claude models (for
 *   example claude-haiku-5-5 and claude-sonnet-5-5). No model defaults.
 * - Structured output uses output_config.format; the zod constraints the API
 *   cannot enforce are removed from the wire schema and still enforced here.
 * - Anthropic offers no embedding model, so embeddings stay with OpenAI. Fan
 *   text therefore reaches two processors and the consent policy must name both.
 * - Raw HTTP, like the OpenAI adapter: the repository carries no vendor SDK.
 */
const API_VERSION = "2023-06-01";
const ANTHROPIC_HOST = "https://api.anthropic.com";
const OPENAI_HOST = "https://api.openai.com";
/** Thinking tokens count toward max_tokens, so this leaves room at low effort. */
const MAX_OUTPUT_TOKENS = 4000;
const STREAM_TIMEOUT_MS = 45_000;
const CALL_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT = 8;
const MAX_BODY_CHARS = 2_000_000;

export const AnthropicEffortSchema = z.enum(["low", "medium", "high"]);
export type AnthropicEffort = z.infer<typeof AnthropicEffortSchema>;

export type AnthropicModelConfiguration = {
  apiKey: string;
  smallModel: string;
  largeModel: string;
  embeddingModel: string;
  /** OpenAI key, used for embeddings only. */
  embeddingApiKey: string;
  rates?: Record<string, ModelRate>;
  policyReference: string;
  /** Chat is latency sensitive: low skips most thinking. */
  effort?: AnthropicEffort;
  /** Tests only. Production hosts are fixed. */
  endpoints?: { anthropic?: string; openai?: string };
};

const RawUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  cache_creation_input_tokens: z.number().int().nonnegative().nullish(),
  cache_read_input_tokens: z.number().int().nonnegative().nullish(),
});
type RawUsage = z.infer<typeof RawUsageSchema>;

/** Anthropic reports input_tokens as the uncached remainder only; cache reads
 * and writes are separate counters. Fold them into the OpenAI-shaped total the
 * shared accounting expects (cache counters are subsets of input). A missing
 * counter stays unknown, which keeps the cost unknown rather than guessed. */
export function anthropicUsage(
  raw: unknown,
  model: string,
  rate: ModelRate | undefined,
): Usage {
  const parsed = RawUsageSchema.safeParse(raw);
  const usage = parsed.success ? parsed.data : undefined;
  if (usage?.input_tokens === undefined || usage.output_tokens === undefined)
    throw new DomainError(
      "provider_usage_invalid",
      "The provider did not report token usage.",
      503,
    );
  const known =
    usage.cache_read_input_tokens != null &&
    usage.cache_creation_input_tokens != null;
  const read = usage.cache_read_input_tokens ?? 0;
  const written = usage.cache_creation_input_tokens ?? 0;
  return responseUsage(
    {
      input_tokens: usage.input_tokens + (known ? read + written : 0),
      output_tokens: usage.output_tokens,
      ...(known
        ? {
            input_tokens_details: {
              cached_tokens: read,
              cache_write_tokens: written,
            },
          }
        : {}),
    },
    model,
    rate,
    "Anthropic",
  );
}

/** Structured outputs reject several JSON Schema keywords. Remove them from
 * the wire schema (our zod parse still enforces them) and keep the length
 * limits as a hint in the description so the model can respect them. */
const DROPPED = new Set([
  "$schema",
  "pattern",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
]);
const HINTED = new Set(["maxLength", "maxItems"]);
const SCHEMA_MAPS = new Set(["properties", "$defs", "definitions"]);
function wireSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(wireSchema);
  if (node === null || typeof node !== "object") return node;
  const source = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const hints: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (DROPPED.has(key)) {
      if (HINTED.has(key)) hints.push(`${key} ${String(value)}`);
      continue;
    }
    if (key === "minItems" && value !== 0 && value !== 1) {
      hints.push(`minItems ${String(value)}`);
      continue;
    }
    out[key] = SCHEMA_MAPS.has(key)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).map(
            ([name, child]) => [name, wireSchema(child)],
          ),
        )
      : wireSchema(value);
  }
  if (hints.length)
    out.description = [source.description, `Limits: ${hints.join(", ")}.`]
      .filter(Boolean)
      .join(" ");
  return out;
}
export function anthropicJsonSchema(schema: z.ZodType) {
  return wireSchema(z.toJSONSchema(schema)) as Record<string, unknown>;
}

function unavailable(status: number, type?: string) {
  return new DomainError(
    status === 429 || status === 529 ? "provider_busy" : "provider_failed",
    "The configured model is unavailable. Your draft is safe.",
    503,
    { cause: { upstreamStatus: status, upstreamType: type ?? null } },
  );
}

const EventSchema = z.object({
  type: z.string(),
  index: z.number().int().optional(),
  message: z.object({ usage: RawUsageSchema.optional() }).optional(),
  content_block: z.object({ type: z.string() }).optional(),
  delta: z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      stop_reason: z.string().nullish(),
    })
    .optional(),
  usage: RawUsageSchema.optional(),
  error: z
    .object({ type: z.string(), message: z.string().optional() })
    .optional(),
});
const MessageSchema = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  stop_reason: z.string().nullable(),
  usage: z.unknown(),
});

function mergeUsage(into: RawUsage, part: RawUsage | undefined) {
  if (!part) return;
  for (const [key, value] of Object.entries(part))
    if (value !== undefined && value !== null)
      (into as Record<string, unknown>)[key] = value;
}

/** Embeddings stay on OpenAI (Anthropic has no embedding model). Same checks
 * as the OpenAI adapter: complete, ordered and equal-length vectors. */
class OpenAIEmbeddings {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly rates: Record<string, ModelRate> | undefined,
    private readonly host: string,
  ) {}
  async embed(
    texts: string[],
    signal: AbortSignal,
  ): Promise<{ vectors: number[][]; usage: Usage }> {
    const response = await fetch(`${this.host}/v1/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.model, input: texts }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
      redirect: "error",
    });
    if (!response.ok) throw unavailable(response.status);
    const raw = await response.text();
    if (raw.length > MAX_BODY_CHARS)
      throw new DomainError(
        "provider_output_large",
        "The model response exceeded its limit.",
        503,
      );
    const result = JSON.parse(raw) as Record<string, unknown>;
    const tokenUsage = z
      .object({ total_tokens: z.number().int().nonnegative() })
      .parse(result.usage);
    const rate = this.rates?.[this.model];
    const cost = rate
      ? Math.ceil(
          (tokenUsage.total_tokens * rate.inputMicrosPerMillion) / 1_000_000,
        )
      : null;
    const usage: Usage = {
      provider: "OpenAI",
      model: this.model,
      inputTokens: tokenUsage.total_tokens,
      outputTokens: 0,
      costMicros: cost !== null && Number.isSafeInteger(cost) ? cost : null,
    };
    try {
      const rows = z
        .array(
          z.object({
            index: z.number().int().nonnegative(),
            embedding: z.array(z.number().finite()).min(16).max(4096),
          }),
        )
        .parse(result.data);
      if (rows.length !== texts.length) throw new Error("incomplete");
      const sorted = rows.sort((a, b) => a.index - b.index);
      if (
        sorted.some(
          (row, index) =>
            row.index !== index ||
            row.embedding.length !== sorted[0]?.embedding.length,
        )
      )
        throw new Error("inconsistent");
      return { vectors: sorted.map((row) => row.embedding), usage };
    } catch {
      throw new ProviderResponseError(
        "embedding_invalid",
        "The embedding response is incomplete or inconsistent.",
        usage,
      );
    }
  }
}

export class AnthropicMessagesModel implements AgentModel {
  readonly fingerprint: string;
  readonly embeddingModel: string;
  private readonly embeddings: OpenAIEmbeddings;
  private readonly host: string;
  private active = 0;
  constructor(private readonly configuration: AnthropicModelConfiguration) {
    this.embeddingModel = configuration.embeddingModel;
    this.host = configuration.endpoints?.anthropic ?? ANTHROPIC_HOST;
    this.embeddings = new OpenAIEmbeddings(
      configuration.embeddingApiKey,
      configuration.embeddingModel,
      configuration.rates,
      configuration.endpoints?.openai ?? OPENAI_HOST,
    );
    const {
      apiKey: _apiKey,
      embeddingApiKey: _embeddingApiKey,
      endpoints: _endpoints,
      ...publicConfiguration
    } = configuration;
    void _apiKey;
    void _embeddingApiKey;
    void _endpoints;
    this.fingerprint = contentHash({
      adapter: "anthropic-messages-v1",
      apiVersion: API_VERSION,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      embeddingProvider: "OpenAI",
      tokenizer: { implementation: "utf8-bytes-over-3-estimate" },
      // contentHash signs JSON only: leave out options that are not set.
      ...Object.fromEntries(
        Object.entries(publicConfiguration).filter(
          ([, value]) => value !== undefined,
        ),
      ),
      effort: configuration.effort ?? "low",
    });
  }
  /** Claude has no local tokenizer. This conservative estimate is only the
   * plain-text assembly budget, never a billing receipt. */
  countContextTokens(text: string) {
    return Math.ceil(Buffer.byteLength(text, "utf8") / 3);
  }
  get pricingConfigured() {
    const { smallModel, largeModel, embeddingModel, rates } =
      this.configuration;
    return (
      [smallModel, largeModel, embeddingModel].every((m) =>
        Boolean(rates?.[m]),
      ) &&
      [smallModel, largeModel].every((m) => {
        const rate = rates?.[m];
        return (
          rate?.cachedInputMicrosPerMillion !== undefined &&
          rate.cacheWriteMicrosPerMillion !== undefined
        );
      })
    );
  }
  maximumRunCostMicros(prefixBytes: number) {
    if (!this.pricingConfigured) return null;
    const rates = Object.values(this.configuration.rates!);
    const input = Math.max(
      ...rates.flatMap((r) => [
        r.inputMicrosPerMillion,
        r.cachedInputMicrosPerMillion ?? 0,
        r.cacheWriteMicrosPerMillion ?? 0,
      ]),
    );
    const output = Math.max(...rates.map((r) => r.outputMicrosPerMillion));
    // The same 22-admission envelope as the OpenAI adapter (classification,
    // embedding, reply, sentence guards, memory and exclusion calls); each of
    // the 21 model calls caps output at MAX_OUTPUT_TOKENS, thinking included.
    return Math.ceil(
      ((prefixBytes + 80_000) * 22 * input + 21 * MAX_OUTPUT_TOKENS * output) /
        1_000_000,
    );
  }
  private model(route: "small" | "large") {
    return route === "small"
      ? this.configuration.smallModel
      : this.configuration.largeModel;
  }
  private body(
    route: "small" | "large",
    instructions: string,
    context: string[],
    schema: Record<string, unknown>,
    stream: boolean,
  ) {
    const user = context.join("\n\n");
    if (!instructions.trim() || !user.trim())
      throw new DomainError(
        "provider_input_invalid",
        "The model request was empty.",
        503,
      );
    return JSON.stringify({
      model: this.model(route),
      max_tokens: MAX_OUTPUT_TOKENS,
      ...(stream ? { stream: true } : {}),
      // The instructions are the large, stable prefix: cache them.
      system: [
        {
          type: "text",
          text: instructions,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: user }],
      output_config: {
        effort: this.configuration.effort ?? "low",
        format: { type: "json_schema", schema },
      },
    });
  }
  private post(body: string, signal: AbortSignal, timeoutMs: number) {
    return fetch(`${this.host}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.configuration.apiKey,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
      },
      body,
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      redirect: "error",
    });
  }
  private async limited<T>(signal: AbortSignal, run: () => Promise<T>) {
    if (this.active >= MAX_CONCURRENT)
      throw new DomainError(
        "provider_busy",
        "AI is updating. Try again shortly.",
        503,
      );
    this.active++;
    try {
      return await run();
    } catch (error) {
      if (signal.aborted)
        throw new DomainError(
          "generation_cancelled",
          "Generation was interrupted.",
          409,
        );
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        "provider_timeout",
        "The model did not respond in time. Try again.",
        503,
      );
    } finally {
      this.active--;
    }
  }
  async *reply(
    instructions: string,
    context: string[],
    route: "small" | "large",
    signal: AbortSignal,
  ): AsyncIterable<StreamProposal> {
    if (this.active >= MAX_CONCURRENT)
      throw new DomainError(
        "provider_busy",
        "AI is updating. Try again shortly.",
        503,
      );
    this.active++;
    try {
      yield* this.stream(instructions, context, route, signal);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        signal.aborted ? "generation_cancelled" : "provider_timeout",
        signal.aborted
          ? "Generation was interrupted."
          : "The model stream did not complete. Try again.",
        signal.aborted ? 409 : 503,
      );
    } finally {
      this.active--;
    }
  }
  private async *stream(
    instructions: string,
    context: string[],
    route: "small" | "large",
    signal: AbortSignal,
  ): AsyncIterable<StreamProposal> {
    const model = this.model(route);
    const rate = this.configuration.rates?.[model];
    const response = await this.post(
      this.body(
        route,
        instructions,
        context,
        anthropicJsonSchema(ReplySchema),
        true,
      ),
      signal,
      STREAM_TIMEOUT_MS,
    );
    if (!response.ok || !response.body) throw unavailable(response.status);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let frames = "";
    let raw = "";
    let delivered = 0;
    let completed = false;
    let stopReason: string | null = null;
    const textBlocks = new Set<number>();
    const usageParts: RawUsage = {};
    try {
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        frames += decoder
          .decode(chunk.value, { stream: true })
          .replace(/\r\n/gu, "\n");
        if (frames.length > MAX_BODY_CHARS)
          throw new DomainError(
            "provider_output_large",
            "The model stream exceeded its limit.",
            503,
          );
        let boundary: number;
        while ((boundary = frames.indexOf("\n\n")) >= 0) {
          const frame = frames.slice(0, boundary);
          frames = frames.slice(boundary + 2);
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("\n");
          if (!data) continue;
          let event: z.infer<typeof EventSchema>;
          try {
            event = EventSchema.parse(JSON.parse(data));
          } catch {
            throw new DomainError(
              "provider_incomplete",
              "The model stream could not be read.",
              503,
            );
          }
          if (event.type === "message_start") {
            mergeUsage(usageParts, event.message?.usage);
          } else if (event.type === "content_block_start") {
            if (
              event.content_block?.type === "text" &&
              event.index !== undefined
            )
              textBlocks.add(event.index);
          } else if (event.type === "content_block_delta") {
            // Thinking, signature and any other block types are never text.
            if (
              event.delta?.type === "text_delta" &&
              event.index !== undefined &&
              textBlocks.has(event.index)
            ) {
              raw += event.delta.text ?? "";
              if (raw.length > 100_000)
                throw new DomainError(
                  "provider_output_large",
                  "The reply exceeded its limit.",
                  503,
                );
              const sentences = completedSentences(raw);
              while (delivered < sentences.length)
                yield { sentence: sentences[delivered++]! };
            }
          } else if (event.type === "message_delta") {
            stopReason = event.delta?.stop_reason ?? stopReason;
            mergeUsage(usageParts, event.usage);
          } else if (event.type === "message_stop") {
            let usage: Usage;
            try {
              usage = anthropicUsage(usageParts, model, rate);
            } catch {
              throw new DomainError(
                "provider_incomplete",
                "The model stream ended without usage.",
                503,
              );
            }
            if (stopReason === "refusal")
              throw new ProviderResponseError(
                "provider_refused",
                "The model declined this request.",
                usage,
              );
            if (stopReason !== "end_turn")
              throw new ProviderResponseError(
                "provider_incomplete",
                "The reply did not complete.",
                usage,
              );
            let reply: z.infer<typeof ReplySchema>;
            try {
              reply = ReplySchema.parse(JSON.parse(raw));
            } catch (error) {
              throw new ProviderResponseError(
                error instanceof DomainError
                  ? error.code
                  : "provider_output_invalid",
                "The final reply could not be safely validated.",
                usage,
              );
            }
            // The terminal receipt already arrived: keep its actual usage even
            // if a later sentence is rejected or delivery is cancelled.
            yield { usage };
            while (delivered < reply.sentences.length)
              yield { sentence: reply.sentences[delivered++]! };
            completed = true;
          } else if (event.type === "error") {
            const busy =
              event.error?.type === "overloaded_error" ||
              event.error?.type === "rate_limit_error";
            throw new DomainError(
              busy ? "provider_busy" : "provider_incomplete",
              "The model stream was interrupted.",
              503,
              {
                cause: {
                  upstreamStatus: null,
                  upstreamType: event.error?.type ?? null,
                },
              },
            );
          }
        }
      }
      if (!completed)
        throw new DomainError(
          "provider_incomplete",
          "The model stream ended before completion.",
          503,
        );
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  async embed(texts: string[], signal: AbortSignal) {
    return this.limited(signal, () => this.embeddings.embed(texts, signal));
  }
  async structured<T>(
    instructions: string,
    context: string[],
    schema: z.ZodType<T>,
    route: "small" | "large",
    signal: AbortSignal,
  ) {
    const model = this.model(route);
    const result = await this.limited(signal, async () => {
      const response = await this.post(
        this.body(
          route,
          instructions,
          context,
          anthropicJsonSchema(schema),
          false,
        ),
        signal,
        CALL_TIMEOUT_MS,
      );
      if (!response.ok) throw unavailable(response.status);
      const text = await response.text();
      if (text.length > MAX_BODY_CHARS)
        throw new DomainError(
          "provider_output_large",
          "The model response exceeded its limit.",
          503,
        );
      return JSON.parse(text) as unknown;
    });
    const readable = MessageSchema.safeParse(result);
    if (!readable.success)
      throw new DomainError(
        "provider_output_invalid",
        "The model response could not be read.",
        503,
      );
    const message = readable.data;
    const usage = anthropicUsage(
      message.usage,
      model,
      this.configuration.rates?.[model],
    );
    try {
      if (message.stop_reason === "refusal")
        throw new DomainError(
          "provider_refused",
          "The model declined this request.",
          503,
        );
      if (message.stop_reason !== "end_turn")
        throw new DomainError(
          "provider_incomplete",
          "The model response did not complete.",
          503,
        );
      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      return { value: schema.parse(JSON.parse(text)), usage };
    } catch (error) {
      throw new ProviderResponseError(
        error instanceof DomainError ? error.code : "provider_output_invalid",
        error instanceof DomainError
          ? error.message
          : "The model response could not be safely validated.",
        usage,
      );
    }
  }
}

/** W2_PROVIDER=anthropic. Claude for generation, OpenAI for embeddings only. */
export function anthropicModelFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): AgentModel | null {
  if (
    !env.ANTHROPIC_API_KEY ||
    !env.OPENAI_API_KEY ||
    !env.W2_SMALL_MODEL ||
    !env.W2_LARGE_MODEL ||
    !env.W2_EMBEDDING_MODEL ||
    !env.W2_PROVIDER_POLICY_REFERENCE ||
    ![env.W2_SMALL_MODEL, env.W2_LARGE_MODEL].every((model) =>
      /^claude-[a-z0-9.-]+$/u.test(model),
    )
  )
    return null;
  let rates: AnthropicModelConfiguration["rates"];
  if (env.W2_MODEL_RATES_JSON)
    rates = z
      .record(z.string(), ModelRateSchema)
      .parse(JSON.parse(env.W2_MODEL_RATES_JSON));
  return new AnthropicMessagesModel({
    apiKey: env.ANTHROPIC_API_KEY,
    embeddingApiKey: env.OPENAI_API_KEY,
    smallModel: env.W2_SMALL_MODEL,
    largeModel: env.W2_LARGE_MODEL,
    embeddingModel: env.W2_EMBEDDING_MODEL,
    policyReference: env.W2_PROVIDER_POLICY_REFERENCE,
    effort: AnthropicEffortSchema.parse(env.W2_ANTHROPIC_EFFORT ?? "low"),
    ...(rates ? { rates } : {}),
  });
}
