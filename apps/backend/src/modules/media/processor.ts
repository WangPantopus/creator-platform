import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { withDeadline } from "./deadline.js";
import { z } from "zod";

export interface MalwareScanner {
  scan(file: string): Promise<"clean" | "infected">;
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
    child.on("error", () => {
      failed = true;
      clearTimeout(timer);
      reject(new Error("media_processor_unavailable"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (!failed) {
        if (code === 0) resolve(Buffer.concat(chunks));
        else reject(new MediaProcessError(code));
      }
    });
  });
}
class MediaProcessError extends Error {
  constructor(readonly exitCode: number | null) {
    super("media_parse_rejected");
  }
}
export class CommandMalwareScanner implements MalwareScanner {
  /** Configure a current clamscan executable and signature database in the ingestion pool. */
  constructor(private readonly executable: string) {
    if (!path.isAbsolute(executable))
      throw new Error("malware_scanner_path_invalid");
  }
  async scan(file: string): Promise<"clean" | "infected"> {
    // Configured scanner must be an executable path; arguments never pass through a shell.
    try {
      // ClamAV can otherwise skip oversized files and return success. Limits must produce alerts.
      await processFile(
        this.executable,
        [
          "--no-summary",
          "--max-filesize=268435456",
          "--max-scansize=536870912",
          "--max-scantime=55000",
          "--alert-exceeds-max=yes",
          "--follow-file-symlinks=0",
          file,
        ],
        8192,
      );
      return "clean";
    } catch (error) {
      if (error instanceof MediaProcessError && error.exitCode === 1)
        return "infected";
      throw new Error("malware_scanner_unavailable");
    }
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
/** Shared bounded scanner/parser/transcoder. Run only in the ingestion pool. */
export class MediaProcessor {
  constructor(
    private readonly scanner?: MalwareScanner,
    private readonly ffmpeg = "ffmpeg",
    private readonly ffprobe = "ffprobe",
  ) {}
  async process(input: {
    file: string;
    staging: string;
    input_sha256: string;
    mime_type: string;
    bytes: number;
    max_bytes: number;
    max_duration_ms: number;
  }) {
    const staging = input.staging;
    const size = (await stat(input.file)).size;
    if (size !== Number(input.bytes) || size > input.max_bytes)
      throw new Error("media_integrity_invalid");
    const bytes = await readFile(input.file);
    if (
      bytes.length !== Number(input.bytes) ||
      bytes.length > input.max_bytes ||
      createHash("sha256").update(bytes).digest("hex") !== input.input_sha256
    )
      throw new Error("media_integrity_invalid");
    if (!this.scanner) throw new Error("malware_scanner_unconfigured");
    if ((await withDeadline(this.scanner.scan(input.file), 60_000)) !== "clean")
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
        input.file,
      ],
      32_768,
    );
    const probe = Probe.parse(JSON.parse(data.toString("utf8")));
    const audio = input.mime_type.startsWith("audio/");
    let duration: number | null = null;
    const stream = probe.streams[0];
    const formats = probe.format.format_name.split(",");
    const declaredMatches =
      input.mime_type === "audio/webm"
        ? formats.includes("webm")
        : input.mime_type === "audio/ogg"
          ? formats.includes("ogg")
          : input.mime_type === "audio/wav"
            ? formats.includes("wav")
            : input.mime_type === "audio/mp4"
              ? formats.includes("mov") || formats.includes("mp4")
              : input.mime_type === "image/png"
                ? stream?.codec_name === "png"
                : input.mime_type === "image/jpeg"
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
          input.file,
          "-map",
          "0:a:0",
          "-vn",
          "-af",
          `aresample=1000,atrim=end_sample=${input.max_duration_ms + 1000},asetpts=N/SR/TB`,
          "-t",
          String(input.max_duration_ms / 1000 + 1),
          "-ac",
          "1",
          "-ar",
          "1000",
          "-f",
          "s16le",
          "pipe:1",
        ],
        Math.ceil((input.max_duration_ms + 1000) * 2) + 4096,
      );
      if (measured.length % 2 !== 0) throw new Error("media_parse_rejected");
      duration = Math.floor(measured.length / 2);
      if (duration <= 0 || duration > input.max_duration_ms)
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
      input.file,
      "-map_metadata",
      "-1",
      "-fs",
      String(input.max_bytes + 1),
    ];
    if (audio)
      args.push(
        "-vn",
        "-map",
        "0:a:0",
        "-t",
        String(input.max_duration_ms / 1000),
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
    if ((await stat(staging)).size > input.max_bytes)
      throw new Error("media_output_size_invalid");
    const output = await readFile(staging);
    if (output.length > input.max_bytes)
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
        Math.ceil((input.max_duration_ms / 1000) * 200) + 1024,
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

    return {
      output,
      mimeType: audio ? "audio/mp4" : "image/png",
      durationMs: duration,
      waveform,
    };
  }
}
