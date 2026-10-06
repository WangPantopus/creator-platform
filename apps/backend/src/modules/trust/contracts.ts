import { z } from "zod";
import type { PrivacyExportStream } from "./privacy-export.js";

export const CaseKind = z.enum([
  "ai_report",
  "crisis",
  "abuse",
  "dispute",
  "verification",
  "pause",
  "support",
]);
export const Queue = z.enum([
  "safety",
  "disputes",
  "verification",
  "pauses",
  "support",
]);
export const Resolution = z.enum([
  "uphold",
  "partial_refund",
  "full_refund",
  "pause_creator",
  "revoke_license",
  "suspend_account",
  "verify_creator",
  "reject_verification",
  "close",
]);
const key = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const reason = z.string().trim().min(12).max(2000);
export const ReportInput = z
  .strictObject({
    kind: CaseKind,
    creatorId: z.uuid().optional(),
    messageId: z.uuid().optional(),
    requestId: z.uuid().optional(),
    reason,
    idempotencyKey: key,
  })
  .refine(
    (value) =>
      value.kind !== "ai_report" || Boolean(value.creatorId && value.messageId),
    { message: "Choose the AI message being reported." },
  );
export const ClaimInput = z.strictObject({
  purpose: reason,
  minutes: z.number().int().min(1).max(15).default(15),
});
export const DecisionInput = z
  .strictObject({
    version: z.number().int().positive(),
    resolution: Resolution,
    reason,
    amountMinor: z.number().int().nonnegative().optional(),
    idempotencyKey: key,
  })
  .refine(
    (value) =>
      value.resolution !== "partial_refund" || (value.amountMinor ?? 0) > 0,
    { message: "A partial refund needs an amount in minor units." },
  );
export const AppealInput = z.strictObject({
  version: z.number().int().positive(),
  reason,
  idempotencyKey: key,
});
export const EffectRetryInput = AppealInput;
export const BlockInput = z.strictObject({
  creatorId: z.uuid(),
  reason,
  idempotencyKey: key,
});
export const FeedbackInput = z.strictObject({
  consent: z.literal(true),
  cohort: z.enum(["expert", "companion", "blend", "unspecified"]),
  useful: z.boolean(),
  authorshipClear: z.boolean(),
  comment: z.string().trim().max(2000).optional(),
  idempotencyKey: key,
});
export const PrivacyInput = z
  .strictObject({
    kind: z.enum(["export", "delete"]),
    scope: z.enum(["account", "creator", "thread"]),
    creatorId: z.uuid().optional(),
    threadId: z.uuid().optional(),
    proof: z.string().min(1).max(2048),
    idempotencyKey: key,
  })
  .refine((value) => value.scope === "account" || Boolean(value.creatorId), {
    message: "A creator scope is required.",
  })
  .refine((value) => value.scope !== "thread" || Boolean(value.threadId), {
    message: "A thread scope is required.",
  })
  .refine(
    (value) =>
      value.scope !== "account" || (!value.creatorId && !value.threadId),
    {
      message: "An account request cannot include narrower scope references.",
    },
  )
  .refine((value) => value.scope !== "creator" || !value.threadId, {
    message: "Choose the thread scope for a conversation request.",
  });
export const PrivacyDomains = [
  "identity",
  "conversation",
  "agent",
  "commerce",
  "content",
  "media",
  "growth",
  "trust",
] as const;
export type PrivacyDomain = (typeof PrivacyDomains)[number];
export type ReportCommand = z.infer<typeof ReportInput>;
export type PrivacyCommand = z.infer<typeof PrivacyInput>;
export type DecisionCommand = z.infer<typeof DecisionInput>;
export type QueueName = z.infer<typeof Queue>;

export type CaseSummary = {
  id: string;
  number: number;
  kind: z.infer<typeof CaseKind>;
  queue: QueueName;
  creator_name: string | null;
  state:
    | "open"
    | "urgent"
    | "reviewing"
    | "waiting"
    | "action_pending"
    | "resolved"
    | "appealed";
  version: number;
  created_at: string;
  updated_at: string;
};
export type Evidence = {
  id: string;
  category: string;
  author_kind?:
    | "ai"
    | "approved_draft"
    | "human_creator"
    | "team"
    | "fan"
    | "system";
  text?: string;
  creator_name?: string;
  created_at?: string;
  thread_id?: string;
  proof_id?: string;
  signed_act_id?: string;
  signed_at?: string;
  mode?: string;
  mode_title?: string;
  disclosure?: string;
  amount_minor?: number;
  currency?: string;
};
export type CaseDetail = CaseSummary & {
  reason: string;
  creator_id: string | null;
  request_id: string | null;
  outcome: string | null;
  resolution_reason: string | null;
  evidence: Evidence[];
  timeline: {
    id: string;
    type: string;
    reason: string | null;
    created_at: string;
  }[];
  access_expires_at: string;
  can_decide: boolean;
  effects: {
    id: string;
    type: string;
    state: string;
    error_code: string | null;
  }[];
};
export type PrivacyTaskView = {
  domain: PrivacyDomain;
  state: string;
  attempts: number;
  error_code: string | null;
  receipt: Record<string, unknown> | null;
};
export type PrivacyJobView = {
  id: string;
  kind: "export" | "delete";
  scope: string;
  state: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  tasks: PrivacyTaskView[];
  retained: { category: string; until: string | null; reason: string }[];
};
export type PrivacyHook = {
  domain: PrivacyDomain;
  run(input: {
    jobId: string;
    kind: "export" | "delete";
    accountId: string;
    scope: string;
    creatorId: string | null;
    threadId: string | null;
    idempotencyKey: string;
    leaseToken?: string;
    signal?: AbortSignal;
  }): Promise<{
    receipt: Record<string, unknown>;
    data?: unknown;
    stream?: PrivacyExportStream;
    retained?: { category: string; until: string | null; reason: string }[];
  }>;
};
export type EffectHook = {
  type: string;
  run(input: {
    effectId: string;
    caseId: string;
    actorAccountId: string;
    creatorId: string | null;
    requestId: string | null;
    reason: string;
    amountMinor?: number;
    idempotencyKey: string;
    leaseToken?: string;
  }): Promise<{ receipt: Record<string, unknown> }>;
};
