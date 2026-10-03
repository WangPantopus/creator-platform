import { z } from "zod";
import { CommerceFulfillmentPlanRef } from "./commerce/fulfillment.ts";

/** C08 v1. Audience and AI-source permission are independent, server checked. */
export const ContentAudience = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("public") }),
  z.strictObject({ kind: z.literal("followers") }),
  z.strictObject({ kind: z.literal("members") }),
  z.strictObject({
    kind: z.literal("tiers"),
    ids: z.array(z.uuid()).min(1).max(50),
  }),
  z.strictObject({
    kind: z.literal("groups"),
    ids: z.array(z.uuid()).min(1).max(50),
  }),
]);
export const ContentMedia = z
  .strictObject({
    assetId: z.uuid(),
    version: z.int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    kind: z.enum(["photo", "voice", "video"]),
    alt: z.string().trim().max(1000),
  })
  .refine(
    (v) => v.kind !== "photo" || v.alt.length > 0,
    "Photos need alternative text.",
  );
export const ContentDocument = z
  .strictObject({
    kind: z.enum([
      "note",
      "post",
      "public_answer",
      "quote_reply",
      "live",
      "replay",
    ]),
    title: z.string().trim().max(180),
    text: z.string().trim().max(20000),
    audience: ContentAudience,
    media: z.array(ContentMedia).max(10),
    nameToken: z.boolean(),
    showAudienceCount: z.boolean(),
    aiUseIntent: z.boolean(),
    scheduledAt: z.iso.datetime({ offset: true }).nullable(),
    quote: z
      .strictObject({ replyId: z.uuid(), consentVersion: z.int().positive() })
      .nullable(),
    packetId: z.uuid().nullable(),
    // Omitted stays omitted: adding a default changes historical signed C08s.
    // Recipients and current consent remain W4-owned; this is a reference only.
    planRef: CommerceFulfillmentPlanRef.nullable().optional(),
    live: z
      .strictObject({
        sessionId: z.uuid(),
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
        replayContentId: z.uuid().nullable(),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      !v.planRef ||
      (v.kind === "public_answer" &&
        v.packetId === null &&
        v.quote === null &&
        !v.live &&
        v.scheduledAt === null &&
        (v.audience.kind === "public" ||
          (v.audience.kind === "groups" &&
            v.audience.ids.length === 1 &&
            v.audience.ids[0] === v.planRef.id))),
    "A fulfillment plan needs its exact public or matched-group answer.",
  )
  .refine(
    (v) => v.kind !== "note" || v.audience.kind !== "public",
    "Notes need an explicit relationship audience.",
  )
  .refine(
    (v) => (v.kind === "quote_reply") === (v.quote !== null),
    "A quote requires current fan consent.",
  )
  .refine(
    (v) => !v.nameToken || v.kind === "note",
    "Name tokens are for broadcasts only.",
  )
  .refine(
    (v) =>
      ["live", "replay"].includes(v.kind)
        ? Boolean(
            v.live && Date.parse(v.live.endsAt) > Date.parse(v.live.startsAt),
          )
        : !v.live,
    "A live entry needs the exact scheduled W6 session and time window.",
  )
  .refine(
    (v) => v.kind !== "note" || !v.media.some((m) => m.kind === "video"),
    "Notes support photos and human voice only.",
  )
  .refine(
    (v) => new Set(v.media.map((m) => m.assetId)).size === v.media.length,
    "Attach each processed asset only once.",
  );
export const ContentKey = z.string().min(8).max(128);
export const SaveContent = z.strictObject({
  id: z.uuid(),
  expectedVersion: z.int().nonnegative(),
  document: ContentDocument,
  idempotencyKey: ContentKey,
});
export const ContentVersionCommand = z.strictObject({
  version: z.int().positive(),
  idempotencyKey: ContentKey,
});
export const PublishContent = ContentVersionCommand.extend({
  signedActId: z.uuid(),
});
export const ReplyToNote = z.strictObject({
  // This transport ceiling is not an entitlement. W5 checks current confirmed
  // tenure and the activated SQL ceiling on every actual reply transaction.
  text: z.string().trim().min(1).max(12000),
  idempotencyKey: ContentKey,
});
export const QuoteConsent = z
  .strictObject({
    version: z.int().positive(),
    shareText: z.boolean(),
    showHandle: z.boolean(),
    idempotencyKey: ContentKey,
  })
  .refine(
    (v) => !v.showHandle || v.shareText,
    "Handle display requires sharing consent.",
  );
export const ReactToReply = z.strictObject({
  version: z.int().positive(),
  kind: z.enum(["heart", "thanks", "helpful"]),
  signedActId: z.uuid(),
  idempotencyKey: ContentKey,
});
export const ThanksCommand = z
  .strictObject({
    targetKind: z.enum(["content", "message"]),
    targetId: z.uuid(),
    text: z.string().trim().max(2000),
    shareWithCreatorDigest: z.boolean(),
    showIdentity: z.boolean(),
    withdrawn: z.boolean(),
    expectedVersion: z.int().nonnegative(),
    idempotencyKey: ContentKey,
  })
  .refine(
    (v) => !v.showIdentity || v.shareWithCreatorDigest,
    "Identity needs digest sharing consent.",
  );
export const ContentPage = z.strictObject({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  state: z
    .enum([
      "draft",
      "media_pending",
      "scheduled",
      "published",
      "unpublished",
      "archived",
    ])
    .optional(),
  query: z.string().trim().max(180).optional(),
});
export const ContentReplyPage = ContentPage.pick({
  cursor: true,
  limit: true,
}).extend({
  contentId: z.uuid().optional(),
  filter: z.enum(["all", "unread", "reacted", "flagged"]).default("all"),
});
export const ContentReplyReviewResult = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  safetyState: z.enum(["pending", "allowed", "flagged"]),
});
export const ContentReplyReadResult = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  read: z.literal(true),
});
export type Audience = z.infer<typeof ContentAudience>;
export type ContentBody = z.infer<typeof ContentDocument>;
export const ContentView = z.strictObject({
  id: z.uuid(),
  creatorId: z.uuid(),
  creatorName: z.string(),
  creatorHandle: z.string(),
  teamMember: z.string().nullable(),
  displayText: z.string(),
  version: z.int().positive(),
  state: z.string(),
  authorKind: z.enum(["human_broadcast", "human_creator", "team"]),
  authorLabel: z.string(),
  audienceLabel: z.string(),
  signedActId: z.uuid().nullable(),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  document: ContentDocument,
  audienceCount: z.int().nonnegative().nullable(),
  sourceState: z.enum([
    "not_requested",
    "candidate_pending",
    "candidate",
    "revocation_pending",
    "revoked",
  ]),
  quotedText: z.string().nullable(),
  quotedHandle: z.string().nullable(),
});
export const ContentTenureRecognition = z
  .strictObject({
    confirmedDays: z.int().nonnegative(),
    milestone: z
      .union([z.literal(50), z.literal(100), z.literal(365)])
      .nullable(),
    basis: z.enum(["confirmed_stripe_paid_periods", "confirmed_paid_periods"]),
    historyComplete: z.literal(false),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .refine(
    (tenure) =>
      tenure.milestone ===
      (tenure.confirmedDays >= 365
        ? 365
        : tenure.confirmedDays >= 100
          ? 100
          : tenure.confirmedDays >= 50
            ? 50
            : null),
  );
export type ContentTenureRecognition = z.infer<typeof ContentTenureRecognition>;
export const PrivateNoteReply = z.strictObject({
  safetyState: z.enum(["pending", "allowed", "flagged"]),
  safetyReviewAvailable: z.boolean(),
  read: z.boolean(),
  id: z.uuid(),
  contentId: z.uuid(),
  fanId: z.uuid(),
  handle: z.string(),
  text: z.string(),
  version: z.int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  tenure: ContentTenureRecognition.nullable().optional(),
  consent: z.strictObject({
    shareText: z.boolean(),
    showHandle: z.boolean(),
    version: z.int().positive(),
  }),
  reaction: z
    .strictObject({ kind: z.string(), signedActId: z.uuid() })
    .nullable(),
});
export const ContentList = z.strictObject({
  items: z.array(ContentView),
  nextCursor: z.uuid().nullable(),
  serverTime: z.iso.datetime({ offset: true }),
});
export const ContentReplyList = z.strictObject({
  items: z.array(PrivateNoteReply),
  nextCursor: z.uuid().nullable(),
});
export const ContentResult = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
  state: z.string(),
  signedActId: z.uuid().nullable().optional(),
});
export const ContentRevisionResult = z.strictObject({
  id: z.uuid(),
  version: z.int().positive(),
});
export const ContentConsentResult = z.strictObject({
  version: z.int().positive(),
  share_text: z.boolean(),
  show_handle: z.boolean(),
});
export const ContentWithdrawResult = z.strictObject({
  id: z.uuid(),
  withdrawn: z.literal(true),
});
export const ContentReactionResult = z.strictObject({
  replyId: z.uuid(),
  kind: z.string(),
  signedActId: z.uuid(),
});
export const ContentMuteCommand = z.strictObject({ muted: z.boolean() });
export const ContentPreference = z.strictObject({
  accountId: z.uuid(),
  muted: z.boolean(),
});
export const NoteReplyPolicy = z
  .strictObject({
    accountId: z.uuid(),
    creatorId: z.uuid(),
    limit: z.union([
      z.literal(4000),
      z.literal(6000),
      z.literal(8000),
      z.literal(12000),
    ]),
    confirmedDays: z.int().nonnegative().nullable(),
    milestone: z
      .union([z.literal(50), z.literal(100), z.literal(365)])
      .nullable(),
    basis: z
      .enum(["confirmed_stripe_paid_periods", "confirmed_paid_periods"])
      .nullable(),
    historyComplete: z.literal(false),
    longerRepliesActive: z.boolean(),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .refine((policy) => {
    const milestone =
      policy.confirmedDays === null || policy.confirmedDays < 50
        ? null
        : policy.confirmedDays >= 365
          ? 365
          : policy.confirmedDays >= 100
            ? 100
            : 50;
    const limit =
      !policy.longerRepliesActive || milestone === null
        ? 4000
        : milestone === 365
          ? 12000
          : milestone === 100
            ? 8000
            : 6000;
    return (
      policy.milestone === milestone &&
      policy.limit === limit &&
      (policy.confirmedDays === null || policy.basis !== null)
    );
  }, "Membership recognition and the reply limit must agree.");
export const ContentThanksQuery = z.strictObject({
  targetKind: z.enum(["content", "message"]),
  targetId: z.uuid(),
});
export const ContentThanksView = z
  .strictObject({
    id: z.uuid(),
    version: z.int().positive(),
    text: z.string(),
    shareWithCreatorDigest: z.boolean(),
    showIdentity: z.boolean(),
    withdrawn: z.boolean(),
  })
  .nullable();
export const ContentThanksFeed = z.array(
  z.strictObject({
    id: z.uuid(),
    version: z.int().positive(),
    target_kind: z.enum(["content", "message"]),
    target_id: z.uuid(),
    text: z.string(),
    handle: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),
  }),
);
export const ContentLiveCatalog = z.strictObject({
  available: z.boolean(),
  items: z.array(
    z.strictObject({
      sessionId: z.uuid(),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      replayContentId: z.uuid().nullable(),
      replayReady: z.boolean(),
    }),
  ),
});
export const ContentScheduledResult = z.strictObject({
  published: z.int().nonnegative(),
});
export const ContentEffectsResult = z.strictObject({
  processed: z.int().nonnegative(),
});
export type ContentView = z.infer<typeof ContentView>;
export type PrivateNoteReply = z.infer<typeof PrivateNoteReply>;
export type NoteReplyPolicy = z.infer<typeof NoteReplyPolicy>;
