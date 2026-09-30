import { z } from "zod";
import {
  AuthorKindSchema,
  IdSchema,
  MessageSchema,
  ThreadControlSchema,
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
export const ConversationMessageSchema = MessageSchema.extend({
  citations: z.array(IdSchema),
  createdAt: z.string(),
  member: z.string().nullable(),
  offTheRecord: z.boolean(),
  version: z.number().int().positive(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
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
});
export type ConversationPage = z.infer<typeof ConversationPageSchema>;
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
