import { z } from "zod";
import type { PoolClient } from "pg";
import type { ThreadScope } from "../access/scope.js";
import { invariant } from "../../core/errors.js";
import type { GenerationCostPolicy } from "./generation-allowance.js";
import type {
  GenerationPrivacyAuthority,
  GenerationPrivacyFamily,
  GenerationPrivacyJob,
} from "./generation-privacy.js";

/** Explicit reviewed whole-unit policy. This adapter supports ceiling rounding
 * of W2's actual micro-USD cost; unsupported weighting requires its own review.
 * No rate, ceiling, version or approval is supplied by an HTTP generation body. */
export const ReviewedGenerationCostRule = z.strictObject({
  version: z.string().min(1).max(200),
  microsPerUnit: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ceilingUnits: z.number().int().positive().max(2147483647),
  rounding: z.literal("ceil"),
});
export type AttributedGenerationReceipt = {
  generationId: string;
  custody: "missing" | "open" | "sealed";
  state: "known" | "unknown" | "no_request";
  costMicros: number | null;
  usageIds: string[];
  attemptIds: string[];
  reference: string;
};
/** Exact published de038f4 PreparedGenerationJournal receipt contract. The
 * host supplies its genuinely prepared instance after0048/privacy custody;
 * PipelineResult.usage, client JSON and inferred no-request are not readers. */
export interface AttributedGenerationJournal {
  readonly retentionPolicyVersion: string;
  current(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
  ): Promise<AttributedGenerationReceipt>;
  currentFamily?(
    client: PoolClient,
    job: GenerationPrivacyJob,
    family: GenerationPrivacyFamily,
    generationId: string,
    authority: GenerationPrivacyAuthority,
  ): Promise<AttributedGenerationReceipt>;
}

/** Preserve old reviewed rules for late receipts. A new host's current version
 * never relabels a durable earlier reservation or reweights its cost. */
export function attributedGenerationCostPolicy(input: {
  journal: AttributedGenerationJournal;
  currentVersion: string;
  approvedRules: readonly unknown[];
  migration: GenerationCostPolicy["migration"];
}): GenerationCostPolicy {
  invariant(
    typeof input.journal.current === "function" &&
      input.journal.retentionPolicyVersion.length > 0,
    "attributed_usage_unconfigured",
    "Use the actually prepared generation journal and its reviewed retention policy.",
  );
  const rules = input.approvedRules.map((rule) =>
    Object.freeze(ReviewedGenerationCostRule.parse(rule)),
  );
  invariant(
    new Set(rules.map((rule) => rule.version)).size === rules.length,
    "cost_policy_conflict",
    "Reviewed generation cost versions must be unique.",
  );
  const versions = new Map(rules.map((rule) => [rule.version, rule]));
  const active = versions.get(input.currentVersion);
  invariant(
    active,
    "cost_policy_unconfigured",
    "The current reviewed cost policy is required.",
  );
  const readReceipt = input.journal.current.bind(input.journal);
  const readFamily = input.journal.currentFamily?.bind(input.journal);
  const convert = (
    receipt: AttributedGenerationReceipt,
    generationId: string,
    originalPolicyVersion: string,
  ) => {
    const original = versions.get(originalPolicyVersion);
    invariant(
      original,
      "cost_policy_unconfigured",
      "Retain the original reviewed rule before reconciling its cost.",
    );
    invariant(
      receipt.generationId === generationId &&
        ["known", "unknown", "no_request"].includes(receipt.state) &&
        ["missing", "open", "sealed"].includes(receipt.custody),
      "generation_cost_mismatch",
      "The durable cost receipt must match this exact generation.",
    );
    if (receipt.state === "unknown")
      return {
        generationId,
        policyVersion: original.version,
        state: "unknown" as const,
      };
    invariant(
      receipt.custody === "sealed" &&
        receipt.costMicros !== null &&
        Number.isSafeInteger(receipt.costMicros) &&
        receipt.costMicros >= 0 &&
        receipt.reference.length > 0 &&
        receipt.reference.length <= 200 &&
        (receipt.state !== "no_request" ||
          (receipt.costMicros === 0 && receipt.usageIds.length === 0)),
      "generation_cost_invalid",
      "A complete immutable terminal usage receipt is required. Retain unknown holds.",
    );
    const rate = BigInt(original.microsPerUnit);
    const units = (BigInt(receipt.costMicros) + rate - 1n) / rate;
    invariant(
      units <= BigInt(original.ceilingUnits),
      "generation_cost_exceeded",
      "Actual cost exceeded its original ceiling. Retain the hold for reconciliation.",
    );
    return {
      generationId,
      policyVersion: original.version,
      state: "final" as const,
      units: Number(units),
      reference: receipt.reference,
    };
  };
  return Object.freeze({
    version: active.version,
    migration: Object.freeze({ ...input.migration }),
    reserveUnits: () => active.ceilingUnits,
    async current(
      scope: ThreadScope,
      client: PoolClient,
      generationId: string,
      originalPolicyVersion: string,
    ) {
      return convert(
        await readReceipt(scope, client, generationId),
        generationId,
        originalPolicyVersion,
      );
    },
    ...(readFamily
      ? {
          retentionPolicyVersion: input.journal.retentionPolicyVersion,
          async currentFamily(
            client: PoolClient,
            job: GenerationPrivacyJob,
            family: GenerationPrivacyFamily,
            generationId: string,
            originalPolicyVersion: string,
            authority: GenerationPrivacyAuthority,
          ) {
            return convert(
              await readFamily(client, job, family, generationId, authority),
              generationId,
              originalPolicyVersion,
            );
          },
        }
      : {}),
  });
}
