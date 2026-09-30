import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import type { PoolClient } from "pg";
import { MediaService } from "./service.js";
import type {
  CreatorMediaService,
  CreatorAssetRow,
} from "./creator-service.js";
import { MediaProcessor, type MalwareScanner } from "./processor.js";
import type { ContentCredentialSigner } from "./worker.js";
import { withDeadline } from "./deadline.js";

/** A family reference only. W8 must validate the current bounded ingestion task
 * and restore scoped non-owner RLS in each transaction, including after revocation. */
export type CreatorMediaWorkerScope = Readonly<{
  creatorId: string;
  ownerAccountId: string;
}>;
export type CreatorMediaWorkerTransaction = <T>(
  scope: CreatorMediaWorkerScope,
  work: (client: PoolClient) => Promise<T>,
) => Promise<T>;
type Job = CreatorAssetRow & {
  manifest_pending: boolean;
  delete_pending: boolean;
};

/** Only the bounded ingestion pool may run scanner/parser/signing processes. */
export class CreatorMediaWorker {
  private readonly processor: MediaProcessor;
  constructor(
    private readonly service: CreatorMediaService,
    private readonly transaction: CreatorMediaWorkerTransaction,
    scanner?: MalwareScanner,
    private readonly credentials?: ContentCredentialSigner,
    ffmpeg = "ffmpeg",
    ffprobe = "ffprobe",
  ) {
    this.processor = new MediaProcessor(scanner, ffmpeg, ffprobe);
  }
  async process(scope: CreatorMediaWorkerScope): Promise<boolean> {
    const token = randomUUID();
    const claimed = await this.transaction(scope, async (client) => {
      await client.query(
        "WITH expired AS (SELECT id FROM creator.creator_media_asset WHERE creator_id=$1 AND owner_account_id=$2 AND expires_at<=now() AND state NOT IN('revoked','deleted') ORDER BY expires_at,id LIMIT 64 FOR UPDATE SKIP LOCKED) UPDATE creator.creator_media_asset SET state='revoked',version=version+1,delete_pending=true,job_available_at=now() WHERE id IN(SELECT id FROM expired)",
        [scope.creatorId, scope.ownerAccountId],
      );
      const item = (
        await client.query<Job>(
          "SELECT * FROM creator.creator_media_asset WHERE creator_id=$1 AND owner_account_id=$2 AND job_available_at<=now() AND (job_lease_until IS NULL OR job_lease_until<now()) AND (state IN('quarantined','processing','revoked') OR manifest_pending OR delete_pending) ORDER BY job_available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED",
          [scope.creatorId, scope.ownerAccountId],
        )
      ).rows[0];
      if (!item) return null;
      await client.query(
        "UPDATE creator.creator_media_asset SET job_token=$3,job_lease_until=now()+interval '10 minutes',state=CASE WHEN state='quarantined' THEN 'processing' ELSE state END WHERE id=$1 AND creator_id=$2",
        [item.id, scope.creatorId, token],
      );
      return item;
    });
    if (!claimed) return false;
    const staging = `${this.service.storage.file(claimed.id, "output")}.${token}.work`;
    const update = async (
      sql: string,
      values: unknown[] = [],
      before?: () => Promise<void>,
    ) =>
      this.transaction(scope, async (client) => {
        const owned = (
          await client.query<{ state: string }>(
            "SELECT state FROM creator.creator_media_asset WHERE id=$1 AND creator_id=$2 AND owner_account_id=$3 AND version=$4 AND job_token=$5 AND job_lease_until>now() FOR UPDATE",
            [
              claimed.id,
              scope.creatorId,
              scope.ownerAccountId,
              claimed.version,
              token,
            ],
          )
        ).rows[0];
        const expected = claimed.delete_pending
          ? "revoked"
          : claimed.manifest_pending
            ? "ready"
            : "processing";
        if (!owned || owned.state !== expected) return false;
        await before?.();
        return (
          (await client.query(sql, [claimed.id, scope.creatorId, ...values]))
            .rowCount === 1
        );
      });
    try {
      if (claimed.delete_pending) {
        await update(
          "UPDATE creator.creator_media_asset SET state='deleted',delete_pending=false,manifest_pending=false,provenance=NULL,waveform='[]',job_lease_until=NULL,job_token=NULL,job_available_at=NULL,failure_code=NULL WHERE id=$1 AND creator_id=$2",
          [],
          () => this.service.storage.delete(claimed.id),
        );
        return true;
      }
      if (claimed.manifest_pending) {
        if (!this.credentials)
          throw new Error("content_credentials_unconfigured");
        const processed = await this.service.storage.read(
          claimed.id,
          "processed",
        );
        if (
          !claimed.signed_act_id ||
          !claimed.output_sha256 ||
          MediaService.digest(processed) !== claimed.output_sha256
        )
          throw new Error("processed_media_integrity_invalid");
        const manifest = {
          schemaVersion: 1,
          kind:
            claimed.purpose === "human_note"
              ? "human_recording"
              : "human_publication_media",
          accountId: claimed.owner_account_id,
          creatorId: claimed.creator_id,
          objectId: claimed.object_id,
          signedActId: claimed.signed_act_id,
          assetId: claimed.id,
          assetVersion: claimed.version,
          processedMediaSha256: claimed.output_sha256,
          processedMediaBytes: Number(claimed.bytes),
          processedMediaMimeType: claimed.mime_type,
          processedMediaDurationMs: claimed.duration_ms,
          transform: claimed.mime_type === "audio/mp4" ? "aac_m4a" : "png",
          c2paVerified: true,
        };
        const signed = await withDeadline(
          this.credentials.embed({
            file: this.service.storage.file(claimed.id, "processed"),
            manifest,
            signal: AbortSignal.timeout(30_000),
          }),
          30_000,
        );
        if (
          signed.verified !== true ||
          !Buffer.isBuffer(signed.bytes) ||
          !signed.bytes.length ||
          signed.bytes.length > claimed.max_bytes
        )
          throw new Error("content_credentials_invalid");
        const provenance = JSON.stringify({
          ...manifest,
          fileSha256: MediaService.digest(signed.bytes),
        });
        await update(
          "UPDATE creator.creator_media_asset SET provenance=$3,manifest_pending=false,job_lease_until=NULL,job_token=NULL,failure_code=NULL WHERE id=$1 AND creator_id=$2",
          [provenance],
          async () => {
            await this.service.storage.put(claimed.id, "output", signed.bytes);
            await this.service.storage.put(
              claimed.id,
              "manifest",
              Buffer.from(provenance),
            );
          },
        );
        return true;
      }
      const result = await this.processor.process({
        file: this.service.storage.file(claimed.id),
        staging,
        input_sha256: claimed.input_sha256,
        mime_type: claimed.mime_type,
        bytes: Number(claimed.bytes),
        max_bytes: Number(claimed.max_bytes),
        max_duration_ms: claimed.max_duration_ms,
      });
      await update(
        "UPDATE creator.creator_media_asset SET state='ready',bytes=$3,output_sha256=$4,mime_type=$5,duration_ms=$6,waveform=$7,job_lease_until=NULL,job_token=NULL,failure_code=NULL WHERE id=$1 AND creator_id=$2",
        [
          result.output.length,
          MediaService.digest(result.output),
          result.mimeType,
          result.durationMs,
          JSON.stringify(result.waveform),
        ],
        async () => {
          await this.service.storage.put(
            claimed.id,
            "processed",
            result.output,
          );
          await this.service.storage.put(claimed.id, "output", result.output);
        },
      );
      // Keep the exact quarantined original for truthful source/archive provenance;
      // retention and revocation delete every stored variant together.
    } catch (error) {
      const reason =
        error instanceof Error && /^[a-z_]+$/u.test(error.message)
          ? error.message
          : "media_processing_failed";
      const configuration =
        reason.endsWith("unconfigured") ||
        reason === "media_processor_unavailable" ||
        reason === "malware_scanner_unavailable";
      await update(
        "UPDATE creator.creator_media_asset SET state=CASE WHEN $3 THEN state ELSE 'rejected' END,failure_code=$4,job_lease_until=NULL,job_token=NULL,job_available_at=now()+interval '1 minute' WHERE id=$1 AND creator_id=$2",
        [
          configuration || claimed.manifest_pending || claimed.delete_pending,
          reason,
        ],
        !configuration && !claimed.manifest_pending && !claimed.delete_pending
          ? () => this.service.storage.delete(claimed.id)
          : undefined,
      );
    } finally {
      // Temporary work never survives a stale lease or revoked worker task.
      await rm(staging, { force: true });
    }
    return true;
  }
}
