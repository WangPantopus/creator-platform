import { z } from "zod";
import type { PoolClient } from "pg";
import type { ThreadScope } from "../access/scope.js";
import { contentHash } from "../../core/canonical.js";
import type {
  ProviderExecution,
  TranslationJobBinding,
} from "./provider-usage.js";

export const HumanTranslationOriginal = z.strictObject({
  messageId: z.uuid(),
  /** Immutable source message.version, not the thread's control revision. */
  version: z.number().int().positive(),
  authorKind: z.enum([
    "human_creator",
    "approved_draft",
    "team",
    "human_broadcast",
  ]),
  text: z.string().min(1).max(10000),
  signedAct: z.strictObject({
    id: z.uuid(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    authorAccountId: z.uuid(),
  }),
});
export type HumanTranslationOriginal = z.infer<typeof HumanTranslationOriginal>;
/** W3 verifies the genuine W1 signed act, current purpose/processor consent,
 * readable immutable message and scope/control barriers on this SAME client.
 * It supplies no HTTP-selected original, signature or authority. */
export interface HumanTranslationSourcePort {
  currentInTransaction(
    scope: ThreadScope,
    client: PoolClient,
    sourceMessageId: string,
  ): Promise<HumanTranslationOriginal>;
}
export function translationSourceHash(original: HumanTranslationOriginal) {
  return contentHash(HumanTranslationOriginal.parse(original));
}
/** The real W3 producer locks its durable accepted job's kind, source, target
 * and lease. A fabricated generation row or HTTP flag is not this authority. */
export type TranslationExecution = ProviderExecution & {
  readonly purpose: "translation";
  assertPurposeInTransaction(
    client: PoolClient,
    expected: "reply" | "translation",
    binding?: TranslationJobBinding,
  ): Promise<void>;
};
export type ApprovedTranslation = Readonly<{
  kind: "ai_translation";
  text: string;
  targetLanguage: string;
  sourceMessageId: string;
  sourceVersion: number;
  sourceHash: string;
  versionId: string;
  versionHash: string;
  /** Real journal binding; the sealed known/unknown receipt is read separately. */
  usageBinding: Readonly<{ generationId: string; attemptId: string }>;
}>;
export const TranslationOutput = z.strictObject({
  text: z.string().trim().min(1).max(16000),
  targetLanguage: z.string(),
});
export const TranslationVerdict = z.strictObject({
  faithful: z.boolean(),
  targetLanguageCorrect: z.boolean(),
  noAddedFacts: z.boolean(),
  noOmittedMeaning: z.boolean(),
  noInstructionExecution: z.boolean(),
});
