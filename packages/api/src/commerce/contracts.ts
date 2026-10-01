import { z } from "zod";

// Namespaced C03/C06; W1 integrates this module into generated clients.
export const MinorUnits = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const Currency = z.string().regex(/^[A-Z]{3}$/u);
export const Money = z.strictObject({ amount: MinorUnits, currency: Currency });
export const ModeKind = z.enum([
  "written_reply",
  "voice_note",
  "audio_call",
  "video_call",
  "group_answer",
  "guaranteed_review",
]);
export const PacketState = z.enum([
  "draft",
  "submitting",
  "submitted",
  "more_info",
  "offer_pending",
  "accepting",
  "accepted",
  "releasing",
  "declined",
  "expired",
  "withdrawn",
]);
export const PaymentState = z.enum([
  "authorization_pending",
  "requires_action",
  "requires_capture",
  "unknown",
  "capturing",
  "captured",
  "releasing",
  "released",
  "refund_pending",
  "refunded",
  "failed",
]);
export const CommitmentState = z.enum([
  "due",
  "in_progress",
  "delivered",
  "resolution_required",
  "refund_pending",
  "refunded",
  "resolved",
]);
export const IdempotencyKey = z.string().min(8).max(128);
export const Disclosure = z.strictObject({
  summary: z.string().trim().min(1).max(8000),
  includeSummary: z.boolean().default(true),
  messageIds: z.array(z.uuid()).max(100),
  attachmentIds: z.array(z.uuid()).max(10),
  wholeThread: z.boolean().default(false),
  identity: z.enum(["handle", "shared_intro"]).default("handle"),
  accessNoticeVersion: z.string().min(1).max(80),
});
export const SubmitPacket = z.strictObject({
  creatorId: z.uuid(),
  fanId: z.uuid(),
  modeId: z.uuid(),
  modeVersion: z.number().int().positive(),
  visibility: z.enum(["private", "public"]),
  disclosure: Disclosure,
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/u),
  idempotencyKey: IdempotencyKey,
});
export const SpendLimitCommand = z
  .strictObject({
    currency: Currency,
    amount: MinorUnits.nullable(),
    explicitNone: z.boolean(),
    remindersOn: z.boolean().default(true),
    idempotencyKey: IdempotencyKey,
  })
  .refine((v) => (v.amount === null ? v.explicitNone : !v.explicitNone), {
    message: "Choose a monthly amount or explicitly no limit.",
  });
export const DecisionAction = z.enum([
  "ai_answer",
  "approve_draft",
  "reply_myself",
  "voice_note",
  "offer_times",
  "group_offer",
  "more_info",
  "decline",
]);
export const DecidePacket = z.strictObject({
  action: DecisionAction,
  version: z.number().int().positive(),
  idempotencyKey: IdempotencyKey,
  signedActId: z.uuid().optional(),
  text: z.string().trim().max(8000).optional(),
  proposedModeId: z.uuid().optional(),
});
export const VersionCommand = z.strictObject({
  version: z.number().int().positive(),
  idempotencyKey: IdempotencyKey,
});
export const MoreInfoReply = VersionCommand.extend({
  text: z.string().trim().min(1).max(8000),
});
export const OfferChoice = VersionCommand.extend({ accept: z.boolean() });
export const ReauthorizePacket = VersionCommand.extend({
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/u),
});
export const FulfillmentCommand = VersionCommand.extend({
  messageId: z.uuid(),
});
export const ShareChoice = VersionCommand.extend({
  enabled: z.boolean(),
  handleDisplay: z.enum(["hidden", "handle"]),
});
export type SubmitPacketInput = z.infer<typeof SubmitPacket>;
export type DecisionInput = z.infer<typeof DecidePacket>;
export type Mode = z.infer<typeof ModeKind>;
export type CurrencyCode = z.infer<typeof Currency>;
export type MoneyValue = z.infer<typeof Money>;
export type CapabilitySnapshot = Readonly<{
  version: string;
  creatorId: string;
  fanId: string;
  validUntil: string | null;
  capabilities: readonly string[];
  allowance: { available: number; unit: "cost_unit" };
  sources: readonly { id: string; source: string; validUntil: string }[];
}>;
export interface VerifiedSessionOutcome {
  evidenceId: string;
  commitmentId: string;
  creatorAccountId: string;
  fanAccountId: string;
  mediaMode: "audio_call" | "video_call";
  outcome:
    | "completed"
    | "partial"
    | "creator_no_show"
    | "fan_no_show"
    | "technical_failure";
  scheduledSeconds: number;
  connectedSeconds: number;
  fanEndedEarly: boolean;
  reconciledAt: string;
}
