import { randomUUID } from "node:crypto";
import type { ThreadScope } from "../access/scope.js";
import type { MediaService } from "./service.js";
import { MediaService as Media } from "./service.js";
import { invariant } from "../../core/errors.js";
import type { PoolClient } from "pg";
import { withDeadline } from "./deadline.js";

/** W2 supplies licensed authorization and genuinely verified marking. Nothing is inferred from a file label. */
export interface LicensedAudioPolicy {
  /** Check/lock W2's current license and pilot gate in the caller's transaction. */
  authorization(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<{
    enabledAfterPilot: boolean;
    licenseId: string;
    licenseRevision: number;
    voiceAssetId: string;
    creatorName: string;
    expiresAt: string;
  } | null>;
}
export interface SyntheticAudioMarker {
  markAndVerify(input: {
    audio: Buffer;
    mimeType: "audio/mp4";
    spokenLabel: string;
    manifest: Record<string, unknown>;
  }): Promise<{
    bytes: Buffer;
    durationMs: number;
    c2paVerified: true;
    watermarkVerified: true;
    spokenLabelVerified: true;
    verificationReference: string;
    transform: "m4a_original";
  }>;
}
export class LicensedAudioIngestor {
  constructor(
    private readonly media: MediaService,
    private readonly policy: LicensedAudioPolicy,
    private readonly marker?: SyntheticAudioMarker,
  ) {}
  async ingest(
    scope: ThreadScope,
    source: { audio: Buffer; mimeType: "audio/mp4"; generationId: string },
  ) {
    const { authorization, limits } = await this.media.db.withThread(
      scope,
      async (client) => ({
        authorization: await this.policy.authorization(scope, client),
        limits: await this.media.ingestionPolicy(scope, client),
      }),
    );
    invariant(
      authorization?.enabledAfterPilot === true &&
        this.marker &&
        Date.parse(authorization.expiresAt) > Date.now(),
      "ai_audio_unavailable",
      "AI voice is not available yet.",
    );
    invariant(
      Buffer.isBuffer(source.audio) &&
        source.audio.length > 0 &&
        source.audio.length <= limits.maxBytes &&
        source.mimeType === "audio/mp4" &&
        source.generationId.length > 0 &&
        source.generationId.length <= 200,
      "ai_audio_input_invalid",
      "AI audio could not be processed.",
    );
    const id = randomUUID();
    const manifest = {
      schemaVersion: 1,
      algorithmicMedia: true,
      kind: "ai_audio",
      generationId: source.generationId,
      licenseId: authorization.licenseId,
      licenseRevision: authorization.licenseRevision,
      voiceAssetId: authorization.voiceAssetId,
      assetId: id,
    };
    const marked = await withDeadline(
      this.marker.markAndVerify({
        audio: source.audio,
        mimeType: source.mimeType,
        spokenLabel: `${authorization.creatorName}'s AI`,
        manifest,
      }),
      60_000,
    );
    invariant(
      marked.c2paVerified === true &&
        marked.watermarkVerified === true &&
        marked.spokenLabelVerified === true &&
        marked.transform === "m4a_original" &&
        Buffer.isBuffer(marked.bytes) &&
        marked.bytes.length > 0 &&
        marked.bytes.length <= limits.maxBytes &&
        Number.isSafeInteger(marked.durationMs) &&
        marked.durationMs > 0 &&
        marked.durationMs <= limits.maxDurationMs &&
        typeof marked.verificationReference === "string" &&
        marked.verificationReference.trim().length > 0 &&
        marked.verificationReference.length <= 2000,
      "ai_audio_marking_invalid",
      "AI audio marking could not be verified.",
    );
    try {
      await this.media.db.withThread(scope, async (client) => {
        // License revocation and publication share the policy's lock/transaction; no out-of-transaction recheck race.
        const current = await this.policy.authorization(scope, client);
        const currentLimits = await this.media.ingestionPolicy(scope, client);
        invariant(
          current?.enabledAfterPilot === true &&
            current.licenseId === authorization.licenseId &&
            current.licenseRevision === authorization.licenseRevision &&
            current.voiceAssetId === authorization.voiceAssetId &&
            Date.parse(current.expiresAt) > Date.now() &&
            marked.bytes.length <= currentLimits.maxBytes &&
            marked.durationMs <= currentLimits.maxDurationMs,
          "ai_audio_license_revoked",
          "AI voice authorization changed.",
        );
        await this.media.storage.put(id, "output", marked.bytes);
        await client.query(
          `INSERT INTO creator.media_asset(id,thread_id,creator_id,fan_id,owner_account_id,purpose,state,mime_type,bytes,uploaded_bytes,input_sha256,output_sha256,duration_ms,max_duration_ms,max_bytes,expires_at,provenance) VALUES($1,$2,$3,$4,$5,'ai_audio','ready','audio/mp4',$6,$6,$7,$7,$8,$8,$6,$9,$10)`,
          [
            id,
            scope.threadId,
            scope.creatorId,
            scope.fanId,
            scope.creatorAccountId,
            marked.bytes.length,
            Media.digest(marked.bytes),
            marked.durationMs,
            new Date(
              Math.min(
                Date.parse(current.expiresAt),
                Date.now() + currentLimits.retentionSeconds * 1000,
              ),
            ).toISOString(),
            JSON.stringify({
              ...manifest,
              c2paVerified: true,
              watermarkVerified: true,
              spokenLabelVerified: true,
              verificationReference: marked.verificationReference,
              fileSha256: Media.digest(marked.bytes),
              fileBytes: marked.bytes.length,
              fileVariant: "credentialed",
              transformsVerified: [marked.transform],
            }),
          ],
        );
      });
    } catch (error) {
      await this.media.storage.delete(id);
      throw error;
    }
    return this.media.read(scope, id);
  }
}
