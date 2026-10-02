import { z } from "zod";
import { responseLanguage } from "../agent/language.js";

/** Reserved source descriptor. Registration and genuine W1/W8 purpose custody
 * are separate requirements; this value cannot activate a worker or provider. */
export const TRANSLATION_JOB_MIGRATION = "0083_w3_translation_worker_scope";

const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());
const Language = z
  .string()
  .min(2)
  .max(35)
  .transform((value) => responseLanguage(value).tag);
const CanonicalLanguage = z
  .string()
  .min(2)
  .max(35)
  .refine((value) => responseLanguage(value).tag === value);

/** The entire fan-selected request. Account, session, proof, provider policy,
 * expiry, price, worker token and source text must come from their real owners. */
export const TranslationRequestSchema = z.strictObject({
  sourceMessageId: z.uuid(),
  sourceVersion: z.int().positive(),
  targetLanguage: Language,
  idempotencyKey: z.string().min(8).max(128),
});

const SourceProvenance = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("creator_signed"),
    authorKind: z.enum(["human_creator", "approved_draft", "human_broadcast"]),
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
]);

/** Metadata only: parsing this object grants no accepted-job, source-body,
 * provider, financial or output authority. W1 issues its distinct branded scope
 * against the actual row and held client; W2 verifies its own source union. */
export const TranslationJobMetadataSchema = z
  .strictObject({
    kind: z.literal("translation"),
    translationId: z.uuid(),
    threadId: z.uuid(),
    creatorId: z.uuid(),
    fanId: z.uuid(),
    sourceMessageId: z.uuid(),
    sourceVersion: z.int().positive(),
    sourceSequence: z.int().positive(),
    sourceEpoch: z.int().nonnegative(),
    sourceHash: Hash,
    sourceProvenance: SourceProvenance,
    targetLanguage: CanonicalLanguage,
    initiatingAccountId: z.uuid(),
    initiatingSessionId: z.uuid(),
    adultVerifiedAt: Instant,
    acceptanceTransaction: z.string().regex(/^[0-9]+$/u),
    acceptedAt: Instant,
    acceptanceConfirmedAt: Instant,
    epoch: z.int().nonnegative(),
    contextRevision: z.int().nonnegative(),
    processorConsentId: z.uuid(),
    processorConsentVersion: z.string().min(1).max(2000),
    translationPolicyVersion: z.string().min(1).max(200),
    providerPolicyVersion: z.string().min(1).max(2000),
    costPolicyVersion: z.string().min(1).max(200),
    retentionPolicyVersion: z.string().min(1).max(200),
    expiresAt: Instant,
    requestKeyHash: Hash,
    requestHash: Hash,
    state: z.enum([
      "queued",
      "translating",
      "delivered",
      "failed",
      "interrupted",
    ]),
    attempt: z.int().nonnegative(),
    workerToken: z.uuid().nullable(),
    leaseUntil: Instant.nullable(),
    completedAt: Instant.nullable(),
  })
  .superRefine((value, context) => {
    const issue = (message: string) =>
      context.addIssue({ code: "custom", message });
    if (value.expiresAt <= value.acceptedAt)
      issue("The owner's finite retention deadline must follow acceptance.");
    if (
      value.acceptanceConfirmedAt < value.acceptedAt ||
      value.acceptanceConfirmedAt >= value.expiresAt ||
      value.adultVerifiedAt > value.acceptedAt
    )
      issue("Original acceptance and adult provenance must match.");
    const terminal = ["delivered", "failed", "interrupted"].includes(
      value.state,
    );
    if (terminal !== (value.completedAt !== null))
      issue("Only a terminal job has an actual completion time.");
    if (value.completedAt !== null && value.completedAt < value.acceptedAt)
      issue("Actual completion cannot precede original acceptance.");
    if (
      (value.state === "translating") !==
      (value.workerToken !== null && value.leaseUntil !== null)
    )
      issue("Only actual leased work has both token and lease metadata.");
    if (
      (value.workerToken === null) !== (value.leaseUntil === null) ||
      (value.leaseUntil !== null &&
        (value.leaseUntil <= value.acceptedAt ||
          value.leaseUntil > value.expiresAt))
    )
      issue("Lease metadata must remain within the original expiry.");
    const source = value.sourceProvenance;
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
      issue("The exact source authorship and proof kind must match.");
  });

export type TranslationJobMetadata = z.infer<
  typeof TranslationJobMetadataSchema
>;
