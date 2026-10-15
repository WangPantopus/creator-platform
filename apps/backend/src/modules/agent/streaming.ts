import { z } from "zod";
import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";
import { DomainError } from "../../core/errors.js";
import { ReplySchema, type ModelConfiguration } from "./model.js";
import { ProviderResponseError, responseUsage } from "./response-usage.js";
import { contentHash } from "../../core/canonical.js";
export type ReplySentence = z.infer<typeof ReplySchema>["sentences"][number];
export type StreamProposal = { sentence: ReplySentence } | { usage: Usage };

/** Parse only complete sentence objects at the beginning of the strict response schema. */
export function completedSentences(raw: string): ReplySentence[] {
  const prefix = raw.match(/^\s*\{\s*"sentences"\s*:\s*\[/u);
  if (!prefix) return [];
  let cursor = prefix[0].length;
  const sentences: ReplySentence[] = [];
  while (cursor < raw.length) {
    while (/[\s,]/u.test(raw[cursor] ?? "") && cursor < raw.length) cursor++;
    if (raw[cursor] !== "{") break;
    const start = cursor;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let end = -1;
    for (; cursor < raw.length; cursor++) {
      const char = raw[cursor];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") {
        depth--;
        if (depth === 0) {
          end = cursor + 1;
          cursor++;
          break;
        }
      }
    }
    if (end < 0) break;
    sentences.push(
      ReplySchema.shape.sentences.element.parse(
        JSON.parse(raw.slice(start, end)),
      ),
    );
    if (sentences.length > 12)
      throw new DomainError(
        "provider_output_large",
        "The reply exceeded its sentence limit.",
        503,
      );
  }
  return sentences;
}
export async function* streamResponses(
  configuration: ModelConfiguration,
  instructions: string,
  context: string[],
  route: "small" | "large",
  signal: AbortSignal,
): AsyncIterable<StreamProposal> {
  const model =
    route === "small" ? configuration.smallModel : configuration.largeModel;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      stream: true,
      max_output_tokens: 2000,
      instructions,
      prompt_cache_key: contentHash({
        model,
        instructions,
        schema: "agent_reply",
      }),
      input: [{ role: "user", content: context.join("\n\n") }],
      text: {
        format: {
          type: "json_schema",
          name: "agent_reply",
          strict: true,
          schema: z.toJSONSchema(ReplySchema),
        },
      },
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
    redirect: "error",
  });
  if (!response.ok || !response.body)
    throw new DomainError(
      "provider_failed",
      "The configured model is unavailable.",
      503,
    );
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let frames = "";
  let raw = "";
  let delivered = 0;
  let completed = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      frames += decoder
        .decode(chunk.value, { stream: true })
        .replace(/\r\n/gu, "\n");
      if (frames.length > 2_000_000)
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
        if (!data || data === "[DONE]") continue;
        const item = z
          .object({
            type: z.string(),
            delta: z.string().optional(),
            response: z.record(z.string(), z.unknown()).optional(),
          })
          .parse(JSON.parse(data));
        if (item.type === "response.output_text.delta") {
          raw += item.delta ?? "";
          if (raw.length > 100_000)
            throw new DomainError(
              "provider_output_large",
              "The reply exceeded its limit.",
              503,
            );
          const sentences = completedSentences(raw);
          while (delivered < sentences.length)
            yield { sentence: sentences[delivered++]! };
        } else if (item.type === "response.completed") {
          const usage = responseUsage(
            item.response?.usage,
            model,
            configuration.rates?.[model],
          );
          let reply: z.infer<typeof ReplySchema>;
          try {
            if (item.response?.status !== "completed")
              throw new DomainError(
                "provider_incomplete",
                "The reply did not complete.",
                503,
              );
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
          // The terminal provider receipt already arrived. Preserve its actual
          // usage even if a later sentence is rejected or delivery is cancelled.
          yield { usage };
          while (delivered < reply.sentences.length)
            yield { sentence: reply.sentences[delivered++]! };
          completed = true;
        } else if (
          item.type === "response.failed" ||
          item.type === "response.incomplete" ||
          item.type === "error"
        ) {
          if (item.response?.usage != null)
            throw new ProviderResponseError(
              "provider_incomplete",
              "The model stream was interrupted.",
              responseUsage(
                item.response.usage,
                model,
                configuration.rates?.[model],
              ),
            );
          throw new DomainError(
            "provider_incomplete",
            "The model stream was interrupted.",
            503,
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
