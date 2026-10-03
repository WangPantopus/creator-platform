import { z } from "zod";

/** Public composition state only. Protected media still requires current access. */
export const CapabilitiesSchema = z.strictObject({
  mediaAvailable: z.boolean(),
  creatorMediaAvailable: z.boolean(),
  creatorMediaAudienceAvailable: z.boolean(),
  callsAvailable: z.boolean(),
  aiAudioAvailable: z.literal(false),
  callRecoveryAvailable: z.boolean(),
  reason: z.enum([
    "media_unconfigured",
    "licensed_ai_audio_and_provider_verification_required",
  ]),
});

/** W6 namespaced C02/C10 contracts; no client-supplied authorship or grants. */
export const MediaPurposeSchema = z.enum([
  "fan_attachment",
  "source_audio",
  "interview_audio",
  "post_photo",
  "human_note",
  "human_reply",
  "call_recording",
  "ai_audio",
]);
export const MediaStateSchema = z.enum([
  "uploading",
  "quarantined",
  "processing",
  "ready",
  "rejected",
  "revoked",
  "deleted",
]);
export const UploadRequestSchema = z.strictObject({
  purpose: MediaPurposeSchema,
  mimeType: z.enum([
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
    "audio/wav",
    "image/jpeg",
    "image/png",
  ]),
  bytes: z
    .number()
    .int()
    .positive()
    .max(256 * 1024 * 1024),
  durationMs: z.number().int().positive().max(3_600_000).optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  idempotencyKey: z.string().min(8).max(128),
});
export const MediaAssetSchema = z.strictObject({
  id: z.uuid(),
  threadId: z.uuid(),
  purpose: MediaPurposeSchema,
  state: MediaStateSchema,
  version: z.number().int().positive(),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
  uploadedBytes: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().nullable(),
  sha256: z.string(),
  waveform: z.array(z.number().min(0).max(1)).max(128),
  signedActId: z.uuid().nullable(),
  expiresAt: z.iso.datetime(),
  failureCode: z.string().nullable(),
  provenance: z.record(z.string(), z.json()).nullable(),
});
export const MediaSignSchema = z.strictObject({
  signedActId: z.uuid(),
  version: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(128),
});
export type MediaPurpose = z.infer<typeof MediaPurposeSchema>;
export type MediaAsset = z.infer<typeof MediaAssetSchema>;
export type UploadRequest = z.infer<typeof UploadRequestSchema>;
export type MediaPolicy = Readonly<{
  maxBytes: number;
  maxDurationMs: number;
  retentionSeconds: number;
  allowTranscript: boolean;
}>;
/** A current read projection; the upload transaction rechecks its own policy. */
export const ThreadRecordingPolicySchema = z.strictObject({
  creatorId: z.uuid(),
  fanId: z.uuid(),
  threadId: z.uuid(),
  purpose: z.literal("human_reply"),
  maxBytes: z.number().int().positive().max(268435456),
  maxDurationMs: z.number().int().positive().max(3600000),
});
export type UploadTicket = {
  asset: MediaAsset;
  url: string;
  expiresAt: string;
  chunkBytes: number;
};
/** Bytes actually served. Credentials may change the file without changing the signed processed tuple. */
export const PlaybackFileSchema = z.strictObject({
  variant: z.enum(["processed", "credentialed"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().positive().max(268_435_456),
});
export type PlaybackFile = z.infer<typeof PlaybackFileSchema>;
export const PlaybackTicketSchema = z.strictObject({
  url: z.url(),
  expiresAt: z.iso.datetime(),
  asset: MediaAssetSchema,
  playbackFile: PlaybackFileSchema,
});
export type PlaybackTicket = z.infer<typeof PlaybackTicketSchema>;

/** Creator-owned objects use real W5 content/W2 source or interview IDs, never a fabricated fan thread. */
export const CreatorMediaPurposeSchema = z.enum([
  "source_audio",
  "interview_audio",
  "post_photo",
  "post_audio",
  "human_note",
]);
export const CreatorMediaUploadRequestSchema = UploadRequestSchema.extend({
  purpose: CreatorMediaPurposeSchema,
  objectId: z.uuid(),
});
/** Current saved-object limits; this read is not upload or publication authority. */
export const CreatorMediaPolicyViewSchema = z.strictObject({
  creatorId: z.uuid(),
  objectId: z.uuid(),
  purpose: CreatorMediaPurposeSchema,
  maxBytes: z.number().int().positive().max(268_435_456),
  maxDurationMs: z.number().int().nonnegative().max(3_600_000),
});
export type CreatorMediaPolicyView = z.infer<
  typeof CreatorMediaPolicyViewSchema
>;
export const CreatorMediaAssetSchema = MediaAssetSchema.omit({
  threadId: true,
}).extend({
  creatorId: z.uuid(),
  objectId: z.uuid(),
  ownerAccountId: z.uuid(),
  purpose: CreatorMediaPurposeSchema,
});
export const CreatorMediaUploadTicketSchema = z.strictObject({
  asset: CreatorMediaAssetSchema,
  url: z.url(),
  expiresAt: z.iso.datetime(),
  chunkBytes: z.number().int().positive().max(1048576),
});
export const CreatorMediaPlaybackTicketSchema =
  CreatorMediaUploadTicketSchema.omit({ chunkBytes: true }).extend({
    playbackFile: PlaybackFileSchema,
  });
export const MediaRevocationSchema = z.strictObject({
  state: z.literal("revoked"),
  deletion: z.literal("pending"),
});
/** Exact immutable processed bytes reviewed by the creator before W1 signs the publication. */
export const ProcessedMediaEvidenceSchema = z.strictObject({
  assetId: z.uuid(),
  version: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().positive().max(268_435_456),
  mimeType: z.enum(["audio/mp4", "image/png"]),
  durationMs: z.number().int().positive().max(3_600_000).nullable(),
});
export type CreatorMediaPurpose = z.infer<typeof CreatorMediaPurposeSchema>;
export type CreatorMediaUploadRequest = z.infer<
  typeof CreatorMediaUploadRequestSchema
>;
export type CreatorMediaAsset = z.infer<typeof CreatorMediaAssetSchema>;
export type ProcessedMediaEvidence = z.infer<
  typeof ProcessedMediaEvidenceSchema
>;
export type CreatorMediaUploadTicket = z.infer<
  typeof CreatorMediaUploadTicketSchema
>;
export type CreatorMediaPlaybackTicket = z.infer<
  typeof CreatorMediaPlaybackTicketSchema
>;
