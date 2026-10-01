import { z } from "zod";

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
export type PlaybackTicket = {
  url: string;
  expiresAt: string;
  asset: MediaAsset;
  playbackFile: PlaybackFile;
};

/** Exact immutable processed bytes reviewed by the creator before W1 signs the publication. */
export const ProcessedMediaEvidenceSchema = z.strictObject({
  assetId: z.uuid(),
  version: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  bytes: z.number().int().positive().max(268_435_456),
  mimeType: z.enum(["audio/mp4", "image/png"]),
  durationMs: z.number().int().positive().max(3_600_000).nullable(),
});
export type ProcessedMediaEvidence = z.infer<
  typeof ProcessedMediaEvidenceSchema
>;
