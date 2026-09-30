import { z } from "zod";

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
    (v) => v.text.length > 0 || v.media.length > 0,
    "Write something or attach processed media.",
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
  text: z.string().trim().min(1).max(4000),
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
    .enum(["draft", "scheduled", "published", "unpublished", "archived"])
    .optional(),
  query: z.string().trim().max(180).optional(),
});
export type Audience = z.infer<typeof ContentAudience>;
export type ContentBody = z.infer<typeof ContentDocument>;
export type ContentView = {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  teamMember: string | null;
  displayText: string;
  version: number;
  state: string;
  authorKind: "human_broadcast" | "human_creator" | "team";
  authorLabel: string;
  audienceLabel: string;
  signedActId: string | null;
  publishedAt: string | null;
  document: ContentBody;
  audienceCount: number | null;
  sourceState:
    | "not_requested"
    | "candidate_pending"
    | "candidate"
    | "revocation_pending"
    | "revoked";
  quotedText: string | null;
  quotedHandle: string | null;
};
export type PrivateNoteReply = {
  id: string;
  contentId: string;
  fanId: string;
  handle: string;
  text: string;
  version: number;
  consent: { shareText: boolean; showHandle: boolean; version: number };
  createdAt: string;
  reaction: { kind: string; signedActId: string } | null;
};
