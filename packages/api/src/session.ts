import { z } from "zod";

/** Navigation only after the current account's held booking is authorized.
 * It grants no admission, provider token, worker or financial authority. */
export const CallRouteSchema = z.strictObject({
  sessionId: z.uuid(),
  creatorId: z.uuid(),
  fanId: z.uuid(),
});

export const AvailabilityCommandSchema = z.strictObject({
  timeZone: z.string().min(1).max(80),
  windows: z
    .array(
      z.strictObject({
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(64),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(128),
});
export const AvailabilitySchema = z.strictObject({
  creatorId: z.uuid(),
  version: z.number().int().positive(),
  timeZone: z.string().min(1).max(80),
  windows: AvailabilityCommandSchema.shape.windows,
});
export const AvailabilityViewSchema = AvailabilitySchema.nullable();

export const SessionStateSchema = z.enum([
  "scheduled",
  "waiting",
  "connecting",
  "connected",
  "reconnecting",
  "ending",
  "ended",
  "cancelled",
]);
export const SessionOutcomeSchema = z.enum([
  "completed",
  "partial",
  "creator_no_show",
  "fan_no_show",
  "technical_failure",
]);
export const CallConsentPurposeSchema = z.enum([
  "recording",
  "summary",
  "content_reuse",
  "ai_source",
]);
export const ConsentCommandSchema = z.strictObject({
  purpose: CallConsentPurposeSchema,
  granted: z.boolean(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});
export const OfferTimesSchema = z.strictObject({
  commitmentId: z.uuid(),
  startsAt: z
    .array(z.iso.datetime({ offset: true }))
    .min(1)
    .max(3),
  creatorTimeZone: z.string().max(80),
  fanTimeZone: z.string().max(80),
  expiresAt: z.iso.datetime({ offset: true }),
  expectedAuthorizationVersion: z.number().int().positive(),
  signedActId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});
export const SelectTimeSchema = z.strictObject({
  slotId: z.uuid(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});
export const EndCallSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  fanChoice: z.enum(["end_by_choice", "technical_problem"]).optional(),
  idempotencyKey: z.string().min(8).max(128),
});
/** The nonce belongs to the actual current session/account. Redemption is
 * application admission; the provider separately enforces its token custody. */
export const AdmissionRedemptionSchema = z.strictObject({ nonce: z.uuid() });
export const AdmissionReceiptSchema = z.strictObject({
  admitted: z.literal(true),
});
export type CallConsentPurpose = z.infer<typeof CallConsentPurposeSchema>;
export const CallSummaryNoteSchema = z.strictObject({
  note: z.string().trim().max(8000),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});
export const CallRevisionSchema = z.strictObject({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});
export const CallAdmissionSchema = z.strictObject({
  token: z.string().min(1).max(16384),
  url: z.url(),
  nonce: z.uuid(),
  sessionId: z.uuid(),
  accountId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
  role: z.enum(["creator", "fan"]),
});
export const CallOfferSchema = z.strictObject({
  id: z.uuid(),
  commitmentId: z.uuid(),
  version: z.number().int().positive(),
  creatorTimeZone: z.string(),
  fanTimeZone: z.string(),
  expiresAt: z.iso.datetime({ offset: true }),
  state: z.enum(["offered", "selected", "expired", "cancelled"]),
  selectedSessionId: z.uuid().nullable(),
  slots: z.array(
    z.strictObject({
      id: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
    }),
  ),
});
export const CallOffersSchema = z.array(CallOfferSchema);
/** Exact receipt from the original W4-authorized offer transaction. */
export const CallOfferReceiptSchema = z.strictObject({
  id: z.uuid(),
  version: z.literal(1),
  slots: CallOfferSchema.shape.slots,
  expiresAt: CallOfferSchema.shape.expiresAt,
  creatorTimeZone: z.string(),
  fanTimeZone: z.string(),
  acceptance: z.literal("accepted_by_commerce"),
});
/** The persisted call projection is authoritative. Client clocks and SDK events
 * never manufacture connected time, outcomes, recording or settlement. */
export const CallSessionSchema = z.strictObject({
  id: z.uuid(),
  commitmentId: z.uuid(),
  threadId: z.uuid(),
  creatorId: z.uuid(),
  fanId: z.uuid(),
  creatorName: z.string(),
  creatorAccountId: z.uuid(),
  fanAccountId: z.uuid(),
  mediaMode: z.enum(["audio", "video"]),
  scheduledAt: z.iso.datetime({ offset: true }),
  hardEndAt: z.iso.datetime({ offset: true }),
  durationSeconds: z.number().int().positive(),
  graceSeconds: z.number().int().nonnegative(),
  reconnectBudgetSeconds: z.number().int().nonnegative(),
  connectedMilliseconds: z.number().int().nonnegative(),
  reconnectUsedMilliseconds: z.number().int().nonnegative(),
  reconnectExhaustedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  state: SessionStateSchema,
  version: z.number().int().positive(),
  serverNow: z.iso.datetime({ offset: true }),
  present: z.array(z.enum(["creator", "fan"])),
  recordingState: z.enum(["off", "starting", "on", "stopping", "blocked"]),
  consents: z.array(
    z.strictObject({
      id: z.uuid(),
      actorAccountId: z.uuid(),
      role: z.enum(["creator", "fan"]),
      purpose: CallConsentPurposeSchema,
      granted: z.boolean(),
      at: z.iso.datetime({ offset: true }),
      revokedAt: z.iso.datetime({ offset: true }).nullable(),
    }),
  ),
  outcome: SessionOutcomeSchema.nullable(),
  reconciliation: z.enum(["pending", "complete", "blocked"]),
  conversationEpoch: z.number().int().nonnegative().optional(),
  packet: z.strictObject({
    summary: z.string(),
    attachmentIds: z.array(z.uuid()),
  }),
  summary: z.string().nullable(),
  creatorSummaryNote: z.string().optional(),
  summaryState: z
    .enum(["absent", "pending", "ready", "deleted", "blocked"])
    .optional(),
  summaryRevision: z.number().int().nonnegative().optional(),
  summarySources: z
    .strictObject({
      kind: z.literal("packet_and_creator_note"),
      commitmentId: z.uuid(),
      noteRevision: z.number().int().nonnegative(),
    })
    .optional(),
  recordingOccurred: z.boolean().optional(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;
export type SessionOutcome = z.infer<typeof SessionOutcomeSchema>;
export type CallRole = "creator" | "fan";
/** C06 presentation only. Price/capture/acceptance remain W4's canonical projection. */
export const CallOfferContextSchema = z.strictObject({
  commitmentId: z.uuid(),
  threadId: z.uuid(),
  authorizationVersion: z.number().int().positive(),
  creatorName: z.string(),
  durationSeconds: z.number().int().positive(),
  mediaMode: z.enum(["audio", "video"]),
});
export type CallOfferContext = z.infer<typeof CallOfferContextSchema>;
export type CallOfferView = {
  id: string;
  commitmentId: string;
  version: number;
  creatorTimeZone: string;
  fanTimeZone: string;
  expiresAt: string;
  state: "offered" | "selected" | "expired" | "cancelled";
  /** Authoritative recovery destination after selection, including a lost POST response. */
  selectedSessionId: string | null;
  slots: Array<{ id: string; startsAt: string }>;
};
export type SessionConsent = {
  id: string;
  actorAccountId: string;
  role: CallRole;
  purpose: CallConsentPurpose;
  granted: boolean;
  at: string;
  revokedAt: string | null;
};
export type ConnectedInterval = { start: string; end: string };
/** C07: settlement-free, immutable evidence. Reconciliation may remain blocked. */
export type SessionEvidence = {
  schemaVersion: 1;
  sessionId: string;
  commitmentId: string;
  creatorAccountId: string;
  fanAccountId: string;
  scheduledAt: string;
  durationSeconds: number;
  hardEndAt: string;
  connectedMilliseconds: number;
  connectedIntervals: ConnectedInterval[];
  reconnectBudgetSeconds: number;
  reconnectUsedMilliseconds: number;
  endedBy: "creator" | "fan" | "timer" | "failure";
  fanEndedByChoice: boolean;
  outcome: SessionOutcome;
  providerRoomId: string;
  providerHistoryReference: string;
  reconciledAt: string;
  roomClosed: true;
  evidenceComplete: true;
  consent: SessionConsent[];
};
export type CallSession = {
  id: string;
  commitmentId: string;
  threadId: string;
  creatorId: string;
  fanId: string;
  creatorName: string;
  creatorAccountId: string;
  fanAccountId: string;
  mediaMode: "audio" | "video";
  scheduledAt: string;
  hardEndAt: string;
  durationSeconds: number;
  graceSeconds: number;
  reconnectBudgetSeconds: number;
  connectedMilliseconds: number;
  reconnectUsedMilliseconds: number;
  reconnectExhaustedAt?: string | null;
  state: SessionState;
  version: number;
  serverNow: string;
  present: CallRole[];
  recordingState: "off" | "starting" | "on" | "stopping" | "blocked";
  consents: SessionConsent[];
  outcome: SessionOutcome | null;
  reconciliation: "pending" | "complete" | "blocked";
  /** Actual creator takeover bound to this call, never a worker/control grant. */
  conversationEpoch?: number;
  packet: { summary: string; attachmentIds: string[] };
  summary: string | null;
  creatorSummaryNote?: string;
  summaryState?: "absent" | "pending" | "ready" | "deleted" | "blocked";
  summaryRevision?: number;
  summarySources?: {
    kind: "packet_and_creator_note";
    commitmentId: string;
    noteRevision: number;
  };
  recordingOccurred?: boolean;
};
