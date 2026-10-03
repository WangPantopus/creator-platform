import { z } from "zod";
import type { PoolClient } from "pg";
import type { ThreadScope } from "../access/scope.js";
import { contentHash } from "../../core/canonical.js";
import type {
  ProviderExecution,
  TranslationJobBinding,
} from "./provider-usage.js";

const Hash = z.string().regex(/^[a-f0-9]{64}$/u);

/** These fields describe the actual original. Parsing them is never a
 * substitute for W3's held source read, W1's signed-act authority or a current
 * authenticated team membership. Team authors cannot claim a creator act. */
export const HumanTranslationProvenance = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("creator_signed"),
      authorKind: z.enum([
        "human_creator",
        "approved_draft",
        "human_broadcast",
      ]),
      authorAccountId: z.uuid(),
      signedActId: z.uuid(),
      signedContentHash: Hash,
      signedActType: z.enum([
        "reply",
        "approved_draft",
        "broadcast",
        "correction",
      ]),
      signedSubjectId: z.uuid(),
      approvalId: z.uuid().nullable(),
    }),
    z.strictObject({
      kind: z.literal("team_authenticated"),
      authorKind: z.literal("team"),
      authorAccountId: z.uuid(),
    }),
  ])
  .superRefine((source, context) => {
    if (
      source.kind === "creator_signed" &&
      ((source.authorKind === "approved_draft") !==
        (source.approvalId !== null) ||
        (source.authorKind === "approved_draft" &&
          source.signedActType !== "approved_draft") ||
        (source.authorKind === "human_broadcast" &&
          source.signedActType !== "broadcast") ||
        (source.authorKind === "human_creator" &&
          !["reply", "correction"].includes(source.signedActType)))
    )
      context.addIssue({
        code: "custom",
        message: "The exact original authorship, approval and act must match.",
      });
  });

export const HumanTranslationOriginal = z.strictObject({
  messageId: z.uuid(),
  /** Immutable source message.version, not the thread's control revision. */
  version: z.number().int().positive(),
  text: z.string().min(1).max(10000),
  sourceProvenance: HumanTranslationProvenance,
});
export type HumanTranslationOriginal = z.infer<typeof HumanTranslationOriginal>;
/** W3 verifies the actual creator act or authenticated team author, current
 * purpose/processor consent, readable immutable message and scope/control
 * barriers on this SAME client. It supplies no HTTP-selected original,
 * signature, team membership or authority. */
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
