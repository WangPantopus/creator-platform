import type { CreatorAssetRow } from "./creator-service.js";

export type CreatorProvenanceEvidence = Pick<
  CreatorAssetRow,
  | "id"
  | "version"
  | "purpose"
  | "creator_id"
  | "object_id"
  | "owner_account_id"
  | "signed_act_id"
  | "output_sha256"
  | "bytes"
  | "mime_type"
  | "duration_ms"
  | "max_bytes"
  | "provenance"
>;

/** Persisted result of W6's genuine external-tool validation, tied to the
 * original signing occurrence and processed tuple. A boolean alone is no proof.
 * Current reuse/publication authority is checked separately on the held client.
 */
export function verifiedCreatorMediaProvenance(row: CreatorProvenanceEvidence) {
  const provenance = row.provenance;
  return Boolean(
    row.signed_act_id &&
      provenance?.schemaVersion === 1 &&
      provenance.kind ===
        (["human_note", "post_audio"].includes(row.purpose)
          ? "human_recording"
          : "human_publication_media") &&
      provenance.transform ===
        (row.mime_type === "audio/mp4" ? "aac_m4a" : "png") &&
      provenance.c2paVerified === true &&
      provenance.assetId === row.id &&
      provenance.assetVersion === row.version &&
      provenance.creatorId === row.creator_id &&
      provenance.objectId === row.object_id &&
      provenance.accountId === row.owner_account_id &&
      provenance.signedActId === row.signed_act_id &&
      provenance.processedMediaSha256 === row.output_sha256 &&
      provenance.processedMediaBytes === Number(row.bytes) &&
      provenance.processedMediaMimeType === row.mime_type &&
      provenance.processedMediaDurationMs === row.duration_ms &&
      typeof provenance.fileSha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(provenance.fileSha256) &&
      typeof provenance.fileBytes === "number" &&
      Number.isSafeInteger(provenance.fileBytes) &&
      provenance.fileBytes > 0 &&
      provenance.fileVariant === "credentialed" &&
      provenance.fileBytes <= Number(row.max_bytes),
  );
}
