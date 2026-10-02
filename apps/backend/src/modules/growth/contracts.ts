import { copy } from "@qelvora/copy";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import type { NotificationReadCustody } from "./notification-custody.js";

export const notificationTypes = [
  "ai_reply",
  "approved_draft",
  "personal_reply",
  "request_status",
  "call_reminder",
  "answered_publicly",
  "content_match",
  "announcement",
  "creator_offer",
  "slot_change",
  "new_packet",
  "commitment_due",
  "guardrail",
  "pool_share",
  "note",
  "reaction",
  "public_answer",
  "spending_reminder",
  "weekly_impact",
] as const;
export const NotificationType = z.enum(notificationTypes);
export type NotificationKind = z.infer<typeof NotificationType>;
export const Destination = z
  .string()
  .max(512)
  .regex(
    /^\/(?:creators\/[a-z0-9_-]+(?:\/(?:posts\/[a-f0-9-]+|chat(?:\?context=[a-f0-9-]+)?))?|commerce\/(?:requests|spending|status\?packetId=[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})|requests\/[a-f0-9-]+|calls\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}|notifications|studio\/(?:impact|insights)|you(?:\/spending)?|share\/[a-f0-9-]+)$/u,
  );
const EventFields = {
  id: z.uuid(),
  aggregateId: z.uuid(),
  aggregateVersion: z.int().positive(),
  causationId: z.uuid(),
  correlationId: z.uuid(),
  occurredAt: z.iso.datetime(),
};
export const CreatorEventEnvelope = z.strictObject({
  ...EventFields,
  schemaVersion: z.literal(1),
  type: NotificationType.exclude(["spending_reminder"]),
  creatorId: z.uuid(),
  recipients: z
    .array(
      z.strictObject({
        accountId: z.uuid(),
        role: z.enum(["fan", "creator", "team", "ops"]),
      }),
    )
    .min(1)
    .max(500),
});
/** Portfolio-wide reminders belong to the actual fan account, never a made-up creator. */
export const SpendingEventEnvelope = z
  .strictObject({
    ...EventFields,
    schemaVersion: z.literal(2),
    type: z.literal("spending_reminder"),
    creatorId: z.null(),
    accountId: z.uuid(),
    recipients: z
      .array(z.strictObject({ accountId: z.uuid(), role: z.literal("fan") }))
      .length(1),
  })
  .refine((event) => event.recipients[0]!.accountId === event.accountId, {
    message: "Spending reminders require the exact account recipient",
  });
export const EventEnvelope = z.union([
  CreatorEventEnvelope,
  SpendingEventEnvelope,
]);
/** Read existing v1 spending rows without accepting any new creator-scoped
 * spending producer. Their former creator cannot authorize portfolio data. */
export const StoredEventEnvelope = z.union([
  CreatorEventEnvelope.extend({ type: NotificationType }),
  SpendingEventEnvelope,
]);
export type GrowthEvent = z.infer<typeof StoredEventEnvelope>;
export const CreatorProjection = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  handle: z.string().regex(/^[a-z0-9_]{3,30}$/u),
  name: z.string().min(1).max(80),
  biography: z.string().max(600),
  category: z.string().max(60),
  mode: z.enum(["expert", "companion", "expert_and_companion"]),
  state: z.enum(["published", "paused", "unpublished", "revoked"]),
  verified: z.boolean(),
  topics: z.array(z.string().max(80)).max(30),
  sourceSummary: z.string().max(200),
  reliability: z.string().max(300),
  capacity: z.string().max(300),
  presence: z.string().max(300),
  photoCaption: z.string().max(100),
  membershipLabel: z.string().max(80).nullable(),
  accessLines: z.array(z.string().max(300)).max(4),
  updatedAt: z.iso.datetime(),
});
export type PublicCreator = z.infer<typeof CreatorProjection>;
export const ContentProjection = z.strictObject({
  id: z.uuid(),
  creatorId: z.uuid(),
  version: z.int().positive(),
  state: z.enum(["published", "withdrawn"]),
  audience: z.literal("public"),
  title: z.string().max(180),
  body: z.string().max(20000),
  authorKind: z.enum([
    "human_creator",
    "human_broadcast",
    "approved_draft",
    "team",
  ]),
  authorLabel: z.string().max(160),
  signedActId: z.uuid().nullable(),
  publishedAt: z.iso.datetime(),
  aiContextEligible: z.boolean(),
});
export type PublicContent = z.infer<typeof ContentProjection>;
export const Preferences = z
  .strictObject({
    push: z.boolean(),
    email: z.boolean(),
    hideSensitive: z.boolean(),
    quietStart: z.int().min(0).max(1439).nullable(),
    quietEnd: z.int().min(0).max(1439).nullable(),
    timeZone: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
    mutedCreators: z.array(z.uuid()).max(500),
    disabledPushTypes: z.array(NotificationType).max(19),
    disabledEmailTypes: z.array(NotificationType).max(19),
  })
  .refine(
    (value) => (value.quietStart === null) === (value.quietEnd === null),
    copy.growthErrorQuietHoursPair,
  );
export type NotificationPreferences = z.infer<typeof Preferences>;
export const defaultPreferences: NotificationPreferences = {
  push: false,
  email: false,
  hideSensitive: true,
  quietStart: null,
  quietEnd: null,
  timeZone: "UTC",
  mutedCreators: [],
  disabledPushTypes: [],
  disabledEmailTypes: [],
};

/** Produced only by an authenticated owner-module adapter; never accepted from HTTP bodies. */
export interface NotificationState {
  retryable?: boolean;
  available: boolean;
  authorized: boolean;
  version: number;
  creatorName: string;
  authorKind:
    | "ai"
    | "approved_draft"
    | "human_creator"
    | "human_call"
    | "human_broadcast"
    | "human_reaction"
    | "team"
    | "system";
  audienceLabel?: string;
  teamName?: string;
  safePreview: string;
  inAppPreview?: string;
  destination: string;
  status?: string;
  contentMatchConsent?: boolean;
}
export interface HomeEntry {
  id: string;
  creatorId: string;
  creatorName: string;
  label: string;
  preview: string;
  destination: string;
  updatedAt: string;
  kind: "thread" | "request" | "call";
  /** Owner-issued directory position, never authority or a private preview.
   * Used only to resume a partially consumed Home page; omitted from HTTP. */
  cursor?: string;
}
export interface ShareSource {
  id: string;
  creatorId: string;
  creatorName: string;
  version: number;
  text: string;
  authorKind: "human_creator" | "approved_draft";
  signedActId: string;
  signedAt: string;
  contentHash: string;
  handle: string | null;
  correction: string | null;
}
export const PassDiscovery = z.strictObject({
  enabled: z.boolean(),
  markers: z
    .array(
      z.strictObject({
        creatorId: z.uuid(),
        state: z.enum(["active", "draft_next", "none"]),
        startsAt: z.iso.datetime().nullable(),
      }),
    )
    .max(100),
});
export type PassDiscoveryView = z.infer<typeof PassDiscovery>;
export interface GrowthOwners {
  notificationState(
    event: GrowthEvent,
    recipient: GrowthEvent["recipients"][number],
    custody?: NotificationReadCustody,
  ): Promise<NotificationState>;
  home(actor: Actor): Promise<HomeEntry[]>;
  homePage?(
    actor: Actor,
    cursor?: string,
  ): Promise<{
    entries: HomeEntry[];
    nextCursor: string | null;
    order?: "activity" | "directory";
  }>;
  discoveryAccess(
    actor: Actor,
    creatorIds: readonly string[],
  ): Promise<PassDiscoveryView>;
  creatorFor(actor: Actor): Promise<string | null>;
  shareSource(actor: Actor, grantId: string): Promise<ShareSource | null>;
  shareStatus(
    grantId: string,
    source: ShareSource,
  ): Promise<{ valid: boolean; correction: string | null }>;
  publishRecommendation(
    actor: Actor,
    input: { topicKey: string; outline: string; window: string },
  ): Promise<{ destination: string }>;
}
export const unavailableOwners: GrowthOwners = {
  notificationState: async () => ({
    retryable: true,
    available: false,
    authorized: false,
    version: 0,
    creatorName: "",
    authorKind: "system",
    safePreview: "",
    destination: "/notifications",
  }),
  home: async () => [],
  discoveryAccess: async () => ({ enabled: false, markers: [] }),
  creatorFor: async () => null,
  shareSource: async () => null,
  shareStatus: async () => ({ valid: false, correction: null }),
  publishRecommendation: async () => {
    throw new Error("content_owner_unconfigured");
  },
};

export const metricTypes = [
  "arrival",
  "sign_in",
  "consent",
  "useful_answer",
  "follow",
  "membership",
  "request",
  "human_delivery",
  "return",
  "renewal",
  "churn",
  "creator_activity",
  "support",
  "refund",
  "comprehension",
  "capability_unavailable",
] as const;
export const Metric = z.strictObject({
  id: z.uuid(),
  schemaVersion: z.literal(2),
  userState: z.enum(["new", "returning"]),
  capability: z.enum(["available", "unavailable"]),
  type: z.enum(metricTypes),
  creatorId: z.uuid(),
  role: z.enum(["fan", "creator"]),
  cohort: z.enum(["expert", "companion"]),
  surface: z.enum(["web", "ios", "android"]),
  source: z.enum([
    "direct",
    "creator_link",
    "post",
    "invite",
    "share",
    "search",
  ]),
  reason: z
    .enum([
      "not_useful",
      "too_costly",
      "no_time",
      "privacy",
      "provider_unavailable",
      "other",
    ])
    .nullable(),
  effortSeconds: z.int().min(0).max(86400).nullable(),
});
export const InsightSignal = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  creatorId: z.uuid(),
  fanAccountId: z.uuid(),
  topicKey: z.string().regex(/^[a-z0-9_-]{2,60}$/u),
  window: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  unresolved: z.boolean(),
});
