import { z } from "zod";
import { MediaAssetSchema } from "../media.ts";
import {
  AuthorKindSchema,
  IdSchema,
  MessageSchema,
  ThreadControlSchema,
  ThreadTimelineSchema,
} from "../schemas.ts";

export const ProviderPolicySchema = z.strictObject({
  version: z.string().min(1).max(120),
  providers: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(100),
        termsUrl: z.url(),
        noTraining: z.boolean(),
        noRetention: z.boolean(),
      }),
    )
    .min(1)
    .max(8),
  verified: z.boolean(),
});
export type ProviderPolicy = z.infer<typeof ProviderPolicySchema>;
export const BeginConversationSchema = z.strictObject({
  creatorId: IdSchema,
  policyVersion: z.string().max(120),
  accessNoticeAccepted: z.literal(true),
  idempotencyKey: z.string().min(8).max(128),
});
export const ConsentInputSchema = z.strictObject({
  version: z.string().max(120),
  accepted: z.boolean(),
});
export const ThreadPreferencesSchema = z.strictObject({
  offTheRecord: z.boolean(),
  introShared: z.boolean(),
  expectedRevision: z.number().int().nonnegative(),
});
export const MemoryProposalSchema = z.strictObject({
  kind: z.enum(["fact", "summary", "open_loop"]),
  text: z.string().trim().min(1).max(2000),
  semanticKey: z.string().trim().min(1).max(120),
  provenanceMessageId: IdSchema,
  expectedRevision: z.number().int().nonnegative(),
  sensitiveCategory: z.string().min(1).max(60).optional(),
});
export const MemoryDecisionSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum(["accept", "delete", "edit", "resolve"]),
  text: z.string().trim().min(1).max(2000).optional(),
});
export const MemoryItemSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(["fact", "summary", "open_loop"]),
  text: z.string(),
  provenanceMessageId: IdSchema,
  sensitiveCategory: z.string().nullable(),
  state: z.enum(["proposed", "remembered", "resolved"]),
  editedByFan: z.boolean(),
  createdAt: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export const AgentReplyVersionSchema = z.strictObject({
  id: IdSchema,
  hash: z.string().regex(/^[0-9a-f]{64}$/u),
});
export const ReplyFeedbackRatingSchema = z.enum(["helpful", "not_helpful"]);
export const ReplyFeedbackPolicySchema = z.strictObject({
  version: z.string().min(1).max(120),
  notice: z.string().min(1).max(2000),
});
export type ReplyFeedbackPolicy = z.infer<typeof ReplyFeedbackPolicySchema>;
export const ReplyFeedbackInputSchema = z
  .strictObject({
    messageVersion: z.number().int().positive(),
    agentVersion: AgentReplyVersionSchema,
    rating: ReplyFeedbackRatingSchema.nullable(),
    consent: z.literal(true).optional(),
    policyVersion: z.string().min(1).max(120).optional(),
  })
  .refine(
    (body) =>
      body.rating === null ||
      (body.consent === true && body.policyVersion !== undefined),
    {
      message: "Review the current feedback notice before sending a response.",
    },
  );
export type ReplyFeedbackInput = z.infer<typeof ReplyFeedbackInputSchema>;
export const ConversationCorrectionCommandSchema = z.strictObject({
  actType: z.literal("correction"),
  subjectId: IdSchema,
  content: z.strictObject({
    kind: z.literal("conversation_correction"),
    creatorId: IdSchema,
    threadId: IdSchema,
    fanId: IdSchema,
    messageVersion: z.number().int().positive(),
    text: z
      .string()
      .min(1)
      .max(10000)
      .refine((text) => text.trim().length > 0),
  }),
});
export const ConversationCorrectionInputSchema = z.strictObject({
  command: ConversationCorrectionCommandSchema,
  signedActId: IdSchema,
  idempotencyKey: z.string().min(8).max(128),
});
/** The command signs only W6's exact processed recording; no additional prose. */
export const ConversationRecordingCommandSchema = z.strictObject({
  actType: z.literal("reply"),
  subjectId: IdSchema,
  content: z.strictObject({
    mediaAssetId: IdSchema,
    version: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    mimeType: z.literal("audio/mp4"),
    durationMs: z.number().int().positive().max(3_600_000),
    bytes: z.number().int().positive().max(268_435_456),
  }),
});
export const ConversationRecordingInputSchema = z.strictObject({
  evidence: z.strictObject({
    assetId: IdSchema,
    version: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    mimeType: z.literal("audio/mp4"),
    durationMs: z.number().int().positive().max(3_600_000),
    bytes: z.number().int().positive().max(268_435_456),
  }),
  signedActId: IdSchema,
  idempotencyKey: z.string().min(8).max(128),
});
export const ConversationRecordingViewSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("available"),
    asset: MediaAssetSchema,
  }),
  z.strictObject({ state: z.literal("unavailable") }),
]);
export const ConversationRecordingResultSchema = z.strictObject({
  messageId: IdSchema,
  threadId: IdSchema,
  signedActId: IdSchema,
});
export type ConversationRecordingInput = z.infer<
  typeof ConversationRecordingInputSchema
>;
export type ConversationRecordingResult = z.infer<
  typeof ConversationRecordingResultSchema
>;
export const ConversationMessageSchema = MessageSchema.extend({
  citations: z.array(IdSchema),
  createdAt: z.string(),
  member: z.string().nullable(),
  offTheRecord: z.boolean(),
  version: z.number().int().positive(),
  agentVersion: AgentReplyVersionSchema.nullable().optional(),
  feedback: ReplyFeedbackRatingSchema.nullable().optional(),
  recording: ConversationRecordingViewSchema.nullable().optional(),
  correction: z
    .strictObject({
      originalMessageId: IdSchema,
      originalVersion: z.number().int().positive(),
    })
    .nullable()
    .optional(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
/** Audited Studio reads share the actual bounded W3 message projection.
 * Lineage is optional until its registered migration has been prepared. */
export const ConversationTimelineSchema = ThreadTimelineSchema.extend({
  messages: z.array(ConversationMessageSchema).max(100),
});
export type ConversationTimeline = z.infer<typeof ConversationTimelineSchema>;
export const ConversationPageSchema = z.strictObject({
  threadId: IdSchema,
  creatorId: IdSchema,
  fanId: IdSchema,
  creatorName: z.string(),
  fanHandle: z.string(),
  control: ThreadControlSchema,
  epoch: z.number().int().nonnegative(),
  cursor: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  generationSequences: z.record(IdSchema, z.number().int().nonnegative()),
  messages: z.array(ConversationMessageSchema).max(100),
  before: z.number().int().positive().nullable(),
  offTheRecord: z.boolean(),
  introShared: z.boolean(),
  consentCurrent: z.boolean(),
  canSend: z.boolean(),
  unavailableReason: z.string().nullable(),
  feedbackPolicy: ReplyFeedbackPolicySchema.nullable().optional(),
});
export type ConversationPage = z.infer<typeof ConversationPageSchema>;
export const ConversationAccountPageSchema = z.strictObject({
  fan: z.strictObject({
    id: IdSchema,
    handle: z.string(),
    intro: z.string().nullable(),
  }),
  threads: z
    .array(
      z.strictObject({
        id: IdSchema,
        creatorId: IdSchema,
        fanId: IdSchema,
        name: z.string(),
      }),
    )
    .max(50),
  nextCursor: IdSchema.nullable(),
});
export type ConversationAccountPage = z.infer<
  typeof ConversationAccountPageSchema
>;
export const TeamReplySchema = z.strictObject({
  text: z.string().trim().min(1).max(10000),
  idempotencyKey: z.string().min(8).max(128),
});
export const AuditEntrySchema = z.strictObject({
  id: IdSchema,
  readerAccountId: IdSchema,
  role: z.enum(["creator", "triage", "ops"]),
  readAt: z.string(),
});
export const TranslationSchema = z.strictObject({
  messageId: IdSchema,
  originalVersion: z.number().int().positive(),
  language: z.string().min(2).max(35),
  text: z.string(),
  provider: z.string(),
  label: z.literal("Translated · original available"),
});
export const ConversationAuthorshipSchema = AuthorKindSchema;
export const ConversationUsageSchema = z.strictObject({
  timezone: z.literal("UTC"),
  days: z
    .array(
      z.strictObject({
        day: z.string(),
        seconds: z.number().nonnegative().max(86400),
        companionSeconds: z.number().nonnegative().max(86400),
      }),
    )
    .max(7),
  modeAvailable: z.boolean(),
  measurement: z.string(),
});
export type ConversationUsage = z.infer<typeof ConversationUsageSchema>;
