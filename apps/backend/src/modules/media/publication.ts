import type { PoolClient } from "pg";
import { z } from "zod";
import type { ContentBody } from "../../../../../packages/api/src/content.js";
import {
  ProcessedMediaEvidenceSchema,
  type ProcessedMediaEvidence,
} from "../../../../../packages/api/src/media.js";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import type {
  PublicationIdentityAuthority,
  PublicationTaskScope,
} from "../identity/publication-scope.js";
import { readMediaFile } from "./files.js";
import { verifiedCreatorMediaProvenance } from "./provenance.js";
import type { PrivateMediaStorage } from "./storage.js";

const snapshotSchema = z.strictObject({
  id: z.uuid(),
  creatorId: z.uuid(),
  objectId: z.uuid(),
  ownerAccountId: z.uuid(),
  purpose: z.enum(["human_note", "post_audio", "post_photo"]),
  state: z.literal("ready"),
  version: z.number().int().positive(),
  mimeType: z.enum(["audio/mp4", "image/png"]),
  bytes: z.number().int().positive().max(268435456),
  durationMs: z.number().int().positive().max(3600000).nullable(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  signedActId: z.uuid(),
  expiresAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  maxBytes: z.number().int().positive().max(268435456),
  provenance: z.record(z.string(), z.json()).nullable(),
  manifestPending: z.boolean(),
  deletePending: z.boolean(),
  originalAssociation: z.boolean(),
  currentAssociation: z.boolean(),
});
type Snapshot = z.infer<typeof snapshotSchema>;

export interface PublicationMedia {
  evidence(
    client: PoolClient,
    taskAuthority: PublicationTaskScope,
    attachment: ContentBody["media"][number],
  ): Promise<ProcessedMediaEvidence>;
  ready(
    client: PoolClient,
    taskAuthority: PublicationTaskScope,
    evidence: ProcessedMediaEvidence,
  ): Promise<boolean>;
}

/** Joins W1's actual sealed publication transaction. No request Actor,
 * interactive CreatorScope, account GUC or background signing is constructed.
 * W8 must activate 0071+0073+0075 before this projection can return any asset.
 */
export function createPublicationMedia(input: {
  identity: PublicationIdentityAuthority;
  storage: PrivateMediaStorage;
}): PublicationMedia {
  const snapshot = async (
    client: PoolClient,
    scope: PublicationTaskScope,
    id: string,
  ) => {
    await input.identity.authorizeInTransaction(scope, client);
    invariant(
      scope.signedActId,
      "media_signature_required",
      "This media requires its exact signed publication.",
    );
    const result = await client.query<{ snapshot: unknown }>(
      "SELECT creator.publication_media_snapshot($1,$2,$3,$4) AS snapshot",
      [scope.creatorId, scope.contentId, scope.version, z.uuid().parse(id)],
    );
    const value = snapshotSchema.parse(result.rows[0]?.snapshot);
    invariant(
      value.creatorId === scope.creatorId &&
        value.objectId === scope.contentId &&
        value.ownerAccountId === scope.publisherAccountId &&
        value.id === id &&
        value.currentAssociation &&
        value.originalAssociation &&
        !value.deletePending &&
        Date.parse(value.expiresAt) > Date.now(),
      "media_publication_unavailable",
      "This publication's exact media is unavailable.",
    );
    return value;
  };
  const evidenceOf = (row: Snapshot) =>
    ProcessedMediaEvidenceSchema.parse({
      assetId: row.id,
      version: row.version,
      sha256: row.sha256,
      bytes: row.bytes,
      mimeType: row.mimeType,
      durationMs: row.durationMs,
    });
  return Object.freeze<PublicationMedia>({
    async evidence(client, scope, attachment) {
      const row = await snapshot(client, scope, attachment.assetId);
      invariant(
        row.version === attachment.version &&
          row.sha256 === attachment.sha256 &&
          (attachment.kind === "photo"
            ? row.purpose === "post_photo" && row.mimeType === "image/png"
            : ["human_note", "post_audio"].includes(row.purpose) &&
              row.mimeType === "audio/mp4") &&
          (row.purpose !== "human_note" ||
            (row.durationMs !== null && row.durationMs <= 60000)),
        "media_version_changed",
        "This publication's exact media changed.",
      );
      return evidenceOf(row);
    },
    async ready(client, scope, expected) {
      const proof = ProcessedMediaEvidenceSchema.parse(expected);
      const row = await snapshot(client, scope, proof.assetId);
      if (
        contentHash(evidenceOf(row)) !== contentHash(proof) ||
        row.manifestPending
      )
        return false;
      if (
        !verifiedCreatorMediaProvenance({
          id: row.id,
          version: row.version,
          purpose: row.purpose,
          creator_id: row.creatorId,
          object_id: row.objectId,
          owner_account_id: row.ownerAccountId,
          signed_act_id: row.signedActId,
          output_sha256: row.sha256,
          bytes: row.bytes,
          mime_type: row.mimeType,
          duration_ms: row.durationMs,
          max_bytes: row.maxBytes,
          provenance: row.provenance,
        })
      )
        return false;
      // Share-locks from the projection hold the actual asset through commit.
      // Verify both immutable processed bytes and the distinct served variant;
      // no credential tool, signer, repair or alternate file is run here.
      await readMediaFile(
        input.storage.file(row.id, "processed"),
        row.maxBytes,
        { bytes: row.bytes, sha256: row.sha256 },
        false,
      );
      await readMediaFile(
        input.storage.file(row.id, "output"),
        row.maxBytes,
        {
          bytes: row.provenance!.fileBytes as number,
          sha256: row.provenance!.fileSha256 as string,
        },
        false,
      );
      await input.identity.authorizeInTransaction(scope, client);
      return Date.parse(row.expiresAt) > Date.now();
    },
  });
}
