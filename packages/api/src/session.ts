import { z } from "zod";

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
export type SessionState = z.infer<typeof SessionStateSchema>;
export type SessionOutcome = z.infer<typeof SessionOutcomeSchema>;
export type CallRole = "creator" | "fan";
/** C06 presentation only. Price/capture/acceptance remain W4's canonical projection. */
export type CallOfferContext = {
  commitmentId: string;
  threadId: string;
  authorizationVersion: number;
  creatorName: string;
  durationSeconds: number;
  mediaMode: "audio" | "video";
};
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
