import type { PoolClient } from "pg";
import type { MediaPolicy } from "../../../../../packages/api/src/media.js";
import type { Actor } from "../identity/adapter.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { ContentService } from "./service.js";

type Purpose = "human_note" | "post_photo";
/** Structural W6 port. The host must pass an asset read under its issued scope. */
export type ContentMediaAsset = Readonly<{
  id: string;
  creatorId: string;
  objectId: string;
  ownerAccountId: string;
  purpose: string;
  version: number;
  sha256: string;
  bytes: number;
  mimeType: string;
  durationMs: number | null;
  signedActId: string | null;
  provenance: Record<string, unknown> | null;
}>;

/** W5 object/audience authority; byte limits and retention remain configured
 * W6/W8 policy. This does not issue a CreatorScope, upload ticket or signature.
 */
export function contentMediaAuthority(
  content: ContentService,
  limits: (
    client: PoolClient,
    creatorId: string,
    purpose: Purpose,
  ) => Promise<MediaPolicy | null>,
  publicationBinding: (
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    objectId: string,
    signedActId: string,
    asset: ContentMediaAsset,
  ) => Promise<boolean>,
) {
  const purposeAllowed = (kind: string, purpose: string) =>
    purpose === "post_photo" || (purpose === "human_note" && kind === "note");
  const owned = async (client: PoolClient, actor: Actor, creatorId: string) =>
    Boolean(
      (
        await client.query(
          "SELECT 1 FROM creator.creator_profile WHERE id=$1 AND account_id=$2",
          [creatorId, actor.accountId],
        )
      ).rowCount,
    );
  const currentRead = async (
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    objectId: string,
    asset: ContentMediaAsset,
  ) => {
    await content.assertCurrentAllowed(client, actor, creatorId);
    if (asset.creatorId !== creatorId || asset.objectId !== objectId)
      return null;
    const owner = await owned(client, actor, creatorId);
    if (owner) await content.role(client, actor, creatorId);
    // index holds the shared object lock through the caller's transaction.
    const row = await content.index(client, creatorId, objectId);
    try {
      await content.authorizeRead(client, actor, row, owner);
    } catch (error) {
      if (error instanceof DomainError && [403, 404].includes(error.status))
        return null;
      throw error;
    }
    const current = await content.view(client, actor, row);
    if (!purposeAllowed(current.document.kind, asset.purpose)) return null;
    // Owner previews need no publication tuple. W6 checks asset custody.
    if (owner && asset.ownerAccountId === actor.accountId)
      return { ownerPreview: true, publication: null };
    const attachment = current.document.media.find(
      (item) =>
        item.assetId === asset.id &&
        item.version === asset.version &&
        item.sha256 === asset.sha256 &&
        ((asset.purpose === "human_note" && item.kind === "voice") ||
          (asset.purpose === "post_photo" && item.kind === "photo")),
    );
    if (
      !attachment ||
      current.state !== "published" ||
      !current.signedActId ||
      asset.provenance?.c2paVerified !== true ||
      asset.provenance.processedMediaSha256 !== attachment.sha256 ||
      // Preserve the original recording occurrence. A later signed revision
      // has its own publication association, verified below on this client.
      asset.provenance.signedActId !== asset.signedActId ||
      !(await publicationBinding(
        client,
        actor,
        creatorId,
        objectId,
        current.signedActId,
        asset,
      ))
    )
      return null;
    return {
      ownerPreview: false,
      publication: {
        signedActId: current.signedActId,
        version: current.version,
      },
    };
  };
  return {
    async policy(
      client: PoolClient,
      actor: Actor,
      creatorId: string,
      objectId: string,
      purpose: string,
      operation: "upload" | "read",
    ): Promise<MediaPolicy | null> {
      await content.assertCurrentAllowed(client, actor, creatorId);
      if (purpose !== "human_note" && purpose !== "post_photo") return null;
      const owner = await owned(client, actor, creatorId);
      if (owner) await content.role(client, actor, creatorId);
      const row = await content.index(client, creatorId, objectId);
      if (operation === "upload") {
        await content.role(client, actor, creatorId);
        invariant(
          row.state === "draft",
          "media_draft_required",
          "Save a current draft before adding media.",
        );
      }
      await content.authorizeRead(client, actor, row, owner);
      const current = await content.view(client, actor, row);
      if (!purposeAllowed(current.document.kind, purpose)) return null;
      const policy = await limits(client, creatorId, purpose);
      if (!policy) return null;
      invariant(
        Number.isSafeInteger(policy.maxBytes) &&
          policy.maxBytes > 0 &&
          Number.isSafeInteger(policy.maxDurationMs) &&
          policy.maxDurationMs >= 0 &&
          Number.isSafeInteger(policy.retentionSeconds) &&
          policy.retentionSeconds > 0,
        "media_policy_unavailable",
        "Current media limits and retention are unavailable.",
      );
      return {
        ...policy,
        maxDurationMs:
          purpose === "human_note"
            ? Math.min(policy.maxDurationMs, 60000)
            : policy.maxDurationMs,
      };
    },
    async currentAssetRead(
      client: PoolClient,
      actor: Actor,
      creatorId: string,
      objectId: string,
      asset: ContentMediaAsset,
    ): Promise<boolean> {
      return Boolean(
        await currentRead(client, actor, creatorId, objectId, asset),
      );
    },
    async currentPublication(
      client: PoolClient,
      actor: Actor,
      creatorId: string,
      objectId: string,
      asset: ContentMediaAsset,
    ): Promise<{ signedActId: string; version: number } | null> {
      const read = await currentRead(client, actor, creatorId, objectId, asset);
      return read?.publication ?? null;
    },
  };
}
