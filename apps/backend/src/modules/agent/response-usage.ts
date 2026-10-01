import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import type { Usage } from "../../../../../packages/api/src/agent/contracts.js";

export const ModelRateSchema = z.strictObject({
  inputMicrosPerMillion: z.number().nonnegative(),
  outputMicrosPerMillion: z.number().nonnegative(),
  cachedInputMicrosPerMillion: z.number().nonnegative().optional(),
  cacheWriteMicrosPerMillion: z.number().nonnegative().optional(),
});
export type ModelRate = z.infer<typeof ModelRateSchema>;

/** A real provider result can carry valid usage even when its content is
 * refused, incomplete or invalid. Preserve that usage without accepting output. */
export class ProviderResponseError extends DomainError {
  readonly usage: Usage;
  constructor(code: string, message: string, usage: Usage) {
    super(code, message, 503);
    this.usage = Object.freeze({ ...usage });
  }
}

/** Reported cache reads/writes are subsets of input tokens, never extra tokens.
 * Missing counters/rates remain unknown unless their price cannot change the total. */
export function responseUsage(
  raw: unknown,
  model: string,
  rate: ModelRate | undefined,
): Usage {
  const usage = z
    .object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
      input_tokens_details: z
        .object({
          cached_tokens: z.number().int().nonnegative(),
          cache_write_tokens: z.number().int().nonnegative().optional(),
        })
        .optional(),
    })
    .parse(raw);
  const cached = usage.input_tokens_details?.cached_tokens ?? null;
  const written = usage.input_tokens_details?.cache_write_tokens ?? null;
  if ((cached ?? 0) + (written ?? 0) > usage.input_tokens)
    throw new DomainError(
      "provider_usage_invalid",
      "The provider reported inconsistent token usage.",
      503,
    );
  let costMicros: number | null = null;
  if (
    rate &&
    cached !== null &&
    (cached === 0 || rate.cachedInputMicrosPerMillion !== undefined) &&
    (written === null
      ? rate.cacheWriteMicrosPerMillion === rate.inputMicrosPerMillion
      : written === 0 || rate.cacheWriteMicrosPerMillion !== undefined)
  ) {
    const cost = Math.ceil(
      ((usage.input_tokens - cached - (written ?? 0)) *
        rate.inputMicrosPerMillion +
        cached * (rate.cachedInputMicrosPerMillion ?? 0) +
        (written ?? 0) * (rate.cacheWriteMicrosPerMillion ?? 0) +
        usage.output_tokens * rate.outputMicrosPerMillion) /
        1_000_000,
    );
    if (Number.isSafeInteger(cost)) costMicros = cost;
  }
  return {
    provider: "OpenAI",
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cachedInputTokens: cached,
    cacheWriteInputTokens: written,
    costMicros,
  };
}
