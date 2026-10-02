import { z } from "zod";

// Namespaced C03/C06; W1 integrates this module into generated clients.
export const MinorUnits = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const Currency = z.string().regex(/^[A-Z]{3}$/u);
export const Money = z.strictObject({ amount: MinorUnits, currency: Currency });
/** Participant System metadata only; transport closure does not settle money
 * or fulfill a service. Provider history, room references and identities stay
 * inside the genuine owner evidence adapter. */
export const CallTransportStatus = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("unavailable"),
    authorKind: z.literal("system"),
  }),
  z.strictObject({
    state: z.literal("closed_unresolved"),
    authorKind: z.literal("system"),
    reason: z.literal("both_missed_arrival_grace"),
    scheduledAt: z.iso.datetime({ offset: true }),
    arrivalGraceEndedAt: z.iso.datetime({ offset: true }),
    recordedAt: z.iso.datetime({ offset: true }),
    outcome: z.null(),
    settlementResolved: z.literal(false),
  }),
]);
export type CallTransportStatus = z.infer<typeof CallTransportStatus>;
const IntegerText = z.string().regex(/^\d+$/u).max(32);
/** Creator-only projection of canonical slots and posted pool cash. It contains
 * no fan identities, private invoices, provider keys or estimated money. */
export const PoolEarnings = z.strictObject({
  creatorId: z.uuid(),
  cycle: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  observedAt: z.iso.datetime({ offset: true }),
  closesAt: z.iso.datetime({ offset: true }),
  fanCount: MinorUnits,
  slotCount: MinorUnits,
  historyLimited: z.boolean(),
  postedCycles: z
    .array(
      z.strictObject({
        cycle: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
        currency: Currency,
        allocationMinor: IntegerText,
        transferredMinor: IntegerText.nullable(),
        reversedMinor: IntegerText.nullable(),
        slotSeconds: IntegerText,
        totalSlotSeconds: IntegerText,
        pendingEffects: MinorUnits,
        postedAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(12),
});
export type PoolEarnings = z.infer<typeof PoolEarnings>;
export const CreatorLedgerPage = z.strictObject({
  currency: Currency,
  entries: z
    .array(
      z.strictObject({
        id: z.uuid(),
        packetId: z.uuid().nullable(),
        kind: z.string().min(1).max(40),
        amount: IntegerText,
        currency: Currency,
        createdAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(100),
  nextCursor: z.string().max(512).nullable(),
});
export type CreatorLedgerPage = z.infer<typeof CreatorLedgerPage>;
export const CreatorEarnings = z.strictObject({
  creatorId: z.uuid(),
  observedAt: z.iso.datetime({ offset: true }),
  currencies: z
    .array(
      z.strictObject({
        currency: Currency,
        capturedMinor: IntegerText,
        requestMinor: IntegerText,
        membershipMinor: IntegerText,
        refundedMinor: IntegerText,
        transferredMinor: IntegerText.nullable(),
        reversedMinor: IntegerText.nullable(),
        pendingPayouts: MinorUnits,
      }),
    )
    .max(676),
  ledger: CreatorLedgerPage,
});
export type CreatorEarnings = z.infer<typeof CreatorEarnings>;
/** Ephemeral provider link; no account/provider reference or command history. */
export const PayoutOnboardingCommand = z.strictObject({
  version: z.int().positive(),
});
export const PayoutOnboardingResult = z
  .strictObject({
    creatorId: z.uuid(),
    state: z.enum(["onboarding", "restricted", "enabled"]),
    detailsDue: z.boolean(),
    version: z.int().positive(),
    url: z
      .url()
      .max(4096)
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.hash
        );
      })
      .nullable(),
    expiresAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine((value) =>
    value.state === "enabled"
      ? value.url === null && value.expiresAt === null
      : value.url !== null && value.expiresAt !== null,
  );
export type PayoutOnboardingResult = z.infer<typeof PayoutOnboardingResult>;
/** Public consent projection of a real persisted provider pass preview.
 * Provider/customer references remain on the server's original quote. */
export const PassPurchaseQuote = z
  .strictObject({
    quoteId: z.uuid(),
    version: z.number().int().positive(),
    currency: Currency,
    amount: MinorUnits.positive(),
    monthlyAmount: MinorUnits.positive(),
    slotCapacity: z.number().int().positive().max(100),
    allowance: MinorUnits.max(2147483647),
    monthlyAllowance: MinorUnits.max(2147483647),
    termsVersion: z.string().min(1).max(100),
    budgetPolicyVersion: z.string().min(1).max(100),
    createdAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    periodEndsAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (quote) => quote.allowance <= quote.monthlyAllowance,
    "The first-period allowance must fit its reviewed monthly budget.",
  );
export type PassPurchaseQuote = z.infer<typeof PassPurchaseQuote>;
export const PassBillingStatus = z.strictObject({
  version: z.number().int().positive(),
  currency: Currency,
  desiredRenewal: z.boolean(),
  processing: z.boolean(),
  effects: z
    .array(
      z.strictObject({
        id: z.uuid(),
        state: z.enum(["pending", "processing", "unknown"]),
        operation: z.enum([
          "start",
          "activate_renewal",
          "cancel",
          "compensate_cancel",
        ]),
      }),
    )
    .max(50),
});
export type PassBillingStatus = z.infer<typeof PassBillingStatus>;
export const PassPurchaseStatus = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("recorded"),
    effectId: z.uuid(),
    processing: z.boolean(),
  }),
  z.strictObject({
    state: z.literal("not_recorded"),
    effectId: z.null(),
    processing: z.literal(false),
  }),
  z.strictObject({
    state: z.literal("expired_uncommitted"),
    effectId: z.null(),
    processing: z.literal(false),
  }),
]);
export const PassPurchaseEffect = z.strictObject({
  effectId: z.uuid(),
  processing: z.boolean(),
  clientSecret: z.string().min(1).max(2048).optional(),
});
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
    remindersOn: z.boolean().default(false),
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
