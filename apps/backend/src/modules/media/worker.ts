import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { ThreadScope } from "../access/scope.js";
import { MediaService } from "./service.js";
import { withDeadline } from "./deadline.js";

import { MediaProcessor, type MalwareScanner } from "./processor.js";
export { CommandMalwareScanner, type MalwareScanner } from "./processor.js";
export interface ContentCredentialSigner {
  /** Return newly embedded bytes and independently verify credentials. Never mutate the input file. */
  embed(input: {
    file: string;
    manifest: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<{ bytes: Buffer; verified: true }>;
}
/** Run exclusively in W8's bounded ingestion pool, never the interactive Node process. */
export class MediaWorker {
  private readonly processor: MediaProcessor;
  constructor(
    private readonly service: MediaService,
    scanner?: MalwareScanner,
    private readonly credentials?: ContentCredentialSigner,
    ffmpeg = "ffmpeg",
    ffprobe = "ffprobe",
  ) {
    this.processor = new MediaProcessor(scanner, ffmpeg, ffprobe);
  }
  async process(scope: ThreadScope): Promise<boolean> {
    const claimed = await this.service.db.withThread(scope, async (client) => {
      // Retention expiry first denies access, then uses the same durable deletion path as revocation.
      // Bound each pass; W8 enumerates authorized scopes rather than a cross-tenant sweep.
      await client.query(
        "WITH expired AS (SELECT id FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND expires_at<=now() AND state NOT IN('revoked','deleted') ORDER BY expires_at,id LIMIT 64 FOR UPDATE SKIP LOCKED) UPDATE creator.media_asset SET state='revoked',version=version+1,delete_pending=true,job_available_at=now() WHERE id IN(SELECT id FROM expired)",
        [scope.creatorId, scope.fanId],
      );
      const row = await client.query<{
        id: string;
        input_sha256: string;
        output_sha256: string | null;
        mime_type: string;
        bytes: number;
        max_bytes: number;
        max_duration_ms: number;
        purpose: string;
        version: number;
        signed_act_id: string | null;
        manifest_pending: boolean;
        delete_pending: boolean;
        owner_account_id: string;
        creator_id: string;
        fan_id: string;
        thread_id: string;
        duration_ms: number | null;
      }>(
        `SELECT * FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND job_available_at<=now() AND (job_lease_until IS NULL OR job_lease_until<now()) AND (state IN ('quarantined','processing','revoked') OR manifest_pending OR delete_pending) ORDER BY job_available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [scope.creatorId, scope.fanId],
      );
      const item = row.rows[0];
      if (!item) return null;
      const lease = new Date(Date.now() + 600_000).toISOString();
      await client.query(
        "UPDATE creator.media_asset SET job_lease_until=$4,state=CASE WHEN state='quarantined' THEN 'processing' ELSE state END WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        [item.id, scope.creatorId, scope.fanId, lease],
      );
      return { ...item, lease };
    });
    if (!claimed) return false;
    const staging = `${this.service.storage.file(claimed.id, "output")}.${randomUUID()}.work`;
    const update = async (
      sql: string,
      values: unknown[] = [],
      before?: () => Promise<void>,
    ) =>
      this.service.db.withThread(scope, async (client) => {
        const owned = (
          await client.query<{ state: string }>(
            "SELECT state FROM creator.media_asset WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND version=$4 AND job_lease_until=$5 AND job_lease_until>now() FOR UPDATE",
            [
              claimed.id,
              scope.creatorId,
              scope.fanId,
              claimed.version,
              claimed.lease,
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
          (
            await client.query(
              `${sql} AND job_lease_until=$${values.length + 4}`,
              [
                claimed.id,
                scope.creatorId,
                scope.fanId,
                ...values,
                claimed.lease,
              ],
            )
          ).rowCount === 1
        );
      });
    try {
      if (claimed.delete_pending) {
        await update(
          "UPDATE creator.media_asset SET state='deleted',delete_pending=false,manifest_pending=false,provenance=NULL,waveform='[]',job_lease_until=NULL,job_available_at=NULL,failure_code=NULL WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND delete_pending",
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
          Number(claimed.max_bytes),
        );
        if (
          !claimed.signed_act_id ||
          !claimed.output_sha256 ||
          claimed.mime_type !== "audio/mp4" ||
          claimed.duration_ms === null ||
          !Number.isSafeInteger(claimed.duration_ms) ||
          claimed.duration_ms <= 0 ||
          !["human_note", "human_reply"].includes(claimed.purpose) ||
          processed.length !== Number(claimed.bytes) ||
          MediaService.digest(processed) !== claimed.output_sha256
        )
          throw new Error("processed_media_integrity_invalid");
        const manifest = {
          schemaVersion: 1,
          kind: "human_recording",
          accountId: claimed.owner_account_id,
          creatorId: claimed.creator_id,
          fanId: claimed.fan_id,
          threadId: claimed.thread_id,
          purpose: claimed.purpose,
          signedActId: claimed.signed_act_id,
          assetId: claimed.id,
          assetVersion: claimed.version,
          processedMediaSha256: claimed.output_sha256,
          processedMediaBytes: Number(claimed.bytes),
          processedMediaMimeType: claimed.mime_type,
          processedMediaDurationMs: claimed.duration_ms,
          transform: "aac_m4a",
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
          fileBytes: signed.bytes.length,
          fileVariant: "credentialed",
        });
        await update(
          "UPDATE creator.media_asset SET provenance=$4,manifest_pending=false,job_lease_until=NULL,failure_code=NULL WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state='ready'",
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
      const { output, mimeType, durationMs, waveform } =
        await this.processor.process({
          file: this.service.storage.file(claimed.id),
          staging,
          input_sha256: claimed.input_sha256,
          mime_type: claimed.mime_type,
          // PostgreSQL bigint columns arrive as strings with the default driver.
          bytes: Number(claimed.bytes),
          max_bytes: Number(claimed.max_bytes),
          max_duration_ms: claimed.max_duration_ms,
        });
      const saved = await update(
        "UPDATE creator.media_asset SET state='ready',bytes=$4,output_sha256=$5,mime_type=$6,duration_ms=$7,waveform=$8,job_lease_until=NULL,failure_code=NULL WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state='processing'",
        [
          output.length,
          MediaService.digest(output),
          mimeType,
          durationMs,
          JSON.stringify(waveform),
        ],
        async () => {
          await this.service.storage.put(claimed.id, "output", output);
          await this.service.storage.put(claimed.id, "processed", output);
        },
      );
      if (saved)
        await rm(this.service.storage.file(claimed.id), { force: true });
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
        "UPDATE creator.media_asset SET state=CASE WHEN $4 THEN state ELSE 'rejected' END,failure_code=$5,job_lease_until=NULL,job_available_at=now()+interval '1 minute' WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state<>'deleted'",
        [
          configuration || claimed.manifest_pending || claimed.delete_pending,
          reason,
        ],
        !configuration && !claimed.manifest_pending && !claimed.delete_pending
          ? () => this.service.storage.delete(claimed.id)
          : undefined,
      );
    } finally {
      await rm(staging, { force: true });
    }
    // A revocation racing external parsing/credential work must leave no derived file behind.
    const tombstoned = await this.service.db.withThread(
      scope,
      async (client) => {
        const row = await client.query<{ state: string }>(
          "SELECT state FROM creator.media_asset WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          [claimed.id, scope.creatorId, scope.fanId],
        );
        return (
          !row.rows[0] || ["revoked", "deleted"].includes(row.rows[0].state)
        );
      },
    );
    if (tombstoned) await this.service.storage.delete(claimed.id);
    return true;
  }
}
