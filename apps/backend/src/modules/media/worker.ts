import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ThreadScope } from "../access/scope.js";
import { MediaService } from "./service.js";
import { withDeadline } from "./deadline.js";

export interface MalwareScanner {
  scan(file: string): Promise<"clean" | "infected">;
}
export interface ContentCredentialSigner {
  /** Return newly embedded bytes and independently verify credentials. Never mutate the input file. */
  embed(input: {
    file: string;
    manifest: Record<string, unknown>;
    signal: AbortSignal;
  }): Promise<{ bytes: Buffer; verified: true }>;
}
function processFile(
  command: string,
  args: string[],
  limitBytes: number,
  timeoutMs = 60_000,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let length = 0;
    let failed = false;
    const timer = setTimeout(() => {
      failed = true;
      child.kill("SIGKILL");
      reject(new Error("media_parser_timeout"));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      length += chunk.length;
      if (length > limitBytes) {
        failed = true;
        child.kill("SIGKILL");
        reject(new Error("media_parser_output_limit"));
      } else chunks.push(chunk);
    });
    // Parser diagnostics can contain file metadata. Never include them in shared logs/evidence.
    child.stderr.resume();
    child.on("error", (error) => {
      failed = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!failed) {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new Error("media_parse_rejected"));
      }
    });
  });
}
export class CommandMalwareScanner implements MalwareScanner {
  constructor(private readonly executable: string) {}
  async scan(file: string): Promise<"clean" | "infected"> {
    // Configured scanner must be an executable path; arguments never pass through a shell.
    await processFile(this.executable, ["--no-summary", file], 8192);
    return "clean";
  }
}
const Probe = z.object({
  format: z.object({
    duration: z.string().optional(),
    format_name: z.string(),
  }),
  streams: z
    .array(
      z.object({
        codec_type: z.string(),
        codec_name: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
      }),
    )
    .max(4),
});
/** Run exclusively in W8's bounded ingestion pool, never the interactive Node process. */
export class MediaWorker {
  constructor(
    private readonly service: MediaService,
    private readonly scanner?: MalwareScanner,
    private readonly credentials?: ContentCredentialSigner,
    private readonly ffmpeg = "ffmpeg",
    private readonly ffprobe = "ffprobe",
  ) {}
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
            "SELECT state FROM creator.media_asset WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND version=$4 AND job_lease_until=$5 FOR UPDATE",
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
      const input = await this.service.storage.read(claimed.id, "input");
      if (
        input.length !== Number(claimed.bytes) ||
        input.length > claimed.max_bytes ||
        MediaService.digest(input) !== claimed.input_sha256
      )
        throw new Error("media_integrity_invalid");
      if (!this.scanner) throw new Error("malware_scanner_unconfigured");
      if (
        (await withDeadline(
          this.scanner.scan(this.service.storage.file(claimed.id)),
          60_000,
        )) !== "clean"
      )
        throw new Error("media_scan_rejected");
      const data = await processFile(
        this.ffprobe,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          this.service.storage.file(claimed.id),
        ],
        32_768,
      );
      const probe = Probe.parse(JSON.parse(data.toString("utf8")));
      const audio = claimed.mime_type.startsWith("audio/");
      let duration: number | null = null;
      const stream = probe.streams[0];
      const formats = probe.format.format_name.split(",");
      const declaredMatches =
        claimed.mime_type === "audio/webm"
          ? formats.includes("webm")
          : claimed.mime_type === "audio/ogg"
            ? formats.includes("ogg")
            : claimed.mime_type === "audio/wav"
              ? formats.includes("wav")
              : claimed.mime_type === "audio/mp4"
                ? formats.includes("mov") || formats.includes("mp4")
                : claimed.mime_type === "image/png"
                  ? stream?.codec_name === "png"
                  : claimed.mime_type === "image/jpeg"
                    ? stream?.codec_name === "mjpeg"
                    : false;
      if (!declaredMatches || probe.streams.length !== 1)
        throw new Error("media_type_invalid");
      if (
        !stream ||
        (audio && probe.streams.some((s) => s.codec_type !== "audio"))
      )
        throw new Error("media_duration_invalid");
      if (
        !audio &&
        (stream.codec_type !== "video" ||
          !["mjpeg", "png"].includes(stream.codec_name) ||
          (stream.width ?? Infinity) * (stream.height ?? Infinity) > 40_000_000)
      )
        throw new Error("media_type_invalid");
      if (
        audio &&
        !["opus", "aac", "pcm_s16le", "pcm_f32le", "vorbis"].includes(
          stream.codec_name,
        )
      )
        throw new Error("media_codec_invalid");
      if (audio) {
        // Browser WebM need not contain a duration header. Decode and count real samples;
        // max+1 prevents unbounded parsing and rejects excess audio instead of shortening it silently.
        const measured = await processFile(
          this.ffmpeg,
          [
            "-nostdin",
            "-v",
            "error",
            "-xerror",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            this.service.storage.file(claimed.id),
            "-map",
            "0:a:0",
            "-vn",
            "-af",
            `aresample=1000,atrim=end_sample=${claimed.max_duration_ms + 1000},asetpts=N/SR/TB`,
            "-t",
            String(claimed.max_duration_ms / 1000 + 1),
            "-ac",
            "1",
            "-ar",
            "1000",
            "-f",
            "s16le",
            "pipe:1",
          ],
          Math.ceil((claimed.max_duration_ms + 1000) * 2) + 4096,
        );
        if (measured.length % 2 !== 0) throw new Error("media_parse_rejected");
        duration = Math.floor(measured.length / 2);
        if (duration <= 0 || duration > claimed.max_duration_ms)
          throw new Error("media_duration_invalid");
      }
      const args = [
        "-nostdin",
        "-v",
        "error",
        "-xerror",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        this.service.storage.file(claimed.id),
        "-map_metadata",
        "-1",
      ];
      if (audio)
        args.push(
          "-vn",
          "-map",
          "0:a:0",
          "-t",
          String(claimed.max_duration_ms / 1000),
          "-c:a",
          "aac",
          "-b:a",
          "96k",
          "-ac",
          "1",
          "-ar",
          "48000",
          "-movflags",
          "+faststart",
          "-f",
          "ipod",
        );
      else
        args.push(
          "-frames:v",
          "1",
          "-vf",
          "scale='min(1920,iw)':-2",
          "-f",
          "image2",
          "-vcodec",
          "png",
        );
      args.push(staging);
      await processFile(this.ffmpeg, args, 1024);
      const output = await readFile(staging);
      if (output.length > claimed.max_bytes)
        throw new Error("media_output_size_invalid");
      const waveform: number[] = [];
      if (audio) {
        const pcm = await processFile(
          this.ffmpeg,
          [
            "-nostdin",
            "-v",
            "error",
            "-i",
            staging,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "100",
            "-f",
            "s16le",
            "pipe:1",
          ],
          Math.ceil((claimed.max_duration_ms / 1000) * 200) + 1024,
        );
        const samples = Math.floor(pcm.length / 2);
        const step = Math.max(1, Math.ceil(samples / 64));
        for (let begin = 0; begin < samples; begin += step) {
          let peak = 0;
          for (let i = begin; i < Math.min(samples, begin + step); i++)
            peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)) / 32768);
          waveform.push(Math.round(peak * 1000) / 1000);
        }
      }
      const saved = await update(
        "UPDATE creator.media_asset SET state='ready',bytes=$4,output_sha256=$5,mime_type=$6,duration_ms=$7,waveform=$8,job_lease_until=NULL,failure_code=NULL WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state='processing'",
        [
          output.length,
          MediaService.digest(output),
          audio ? "audio/mp4" : "image/png",
          duration,
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
      const configuration = reason.endsWith("unconfigured");
      await update(
        "UPDATE creator.media_asset SET state=CASE WHEN $4 THEN state ELSE 'rejected' END,failure_code=$5,job_lease_until=NULL,job_available_at=now()+interval '1 minute' WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state NOT IN ('revoked','deleted')",
        [configuration || claimed.manifest_pending, reason],
        !configuration && !claimed.manifest_pending
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
