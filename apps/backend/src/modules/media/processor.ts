import { spawn } from "node:child_process";
import path from "node:path";
import { withDeadline } from "./deadline.js";
import { MEDIA_FILE_CEILING, readMediaFile } from "./files.js";
import { z } from "zod";

export interface MalwareScanner {
  scan(file: string): Promise<"clean" | "infected">;
}
export function processFile(
  command: string,
  args: string[],
  limitBytes: number,
  timeoutMs = 60_000,
  options: { signal?: AbortSignal; env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error("media_processor_aborted"));
      return;
    }
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      ...options,
    });
    const chunks: Buffer[] = [];
    let length = 0;
    let failure: Error | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      // External signers share this process group. Stop descendants as well
      // before a worker removes staging or releases its durable job lease.
      if (child.pid && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else child.kill("SIGKILL");
    };
    const abort = () => stop(new Error("media_processor_aborted"));
    options.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      stop(new Error("media_parser_timeout"));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      if (failure) return;
      length += chunk.length;
      if (length > limitBytes) {
        stop(new Error("media_parser_output_limit"));
      } else chunks.push(chunk);
    });
    // Parser diagnostics can contain file metadata. Never include them in shared logs/evidence.
    child.stderr.resume();
    child.on("error", () => {
      failure ??= new Error("media_processor_unavailable");
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      // Wait for termination before a worker removes staging or releases a lease.
      if (failure) reject(failure);
      else if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new MediaProcessError(code));
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
        55_000,
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
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    )
    .max(4),
});
const demuxers: Record<string, string> = {
  "audio/webm": "matroska,webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mp4": "mov,mp4,m4a,3gp,3g2,mj2",
  "image/png": "png_pipe",
  "image/jpeg": "jpeg_pipe",
};
function parserInput(file: string, mimeType: string) {
  const formats = demuxers[mimeType];
  if (!formats) throw new Error("media_type_invalid");
  // Restrict demuxers before opening untrusted input. A disguised playlist must
  // never be allowed to read another local file or fetch a remote resource.
  return [
    "-protocol_whitelist",
    "file,pipe",
    "-format_whitelist",
    formats,
    "-max_streams",
    "4",
    "-threads",
    "1",
    ...(mimeType === "audio/mp4"
      ? ["-enable_drefs", "0", "-use_absolute_path", "0"]
      : []),
    "-i",
    file,
  ];
}
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
    if (
      !Number.isSafeInteger(input.max_bytes) ||
      input.max_bytes <= 0 ||
      input.max_bytes > MEDIA_FILE_CEILING ||
      !Number.isSafeInteger(input.max_duration_ms) ||
      input.max_duration_ms < 0 ||
      input.max_duration_ms > 3_600_000 ||
      (input.mime_type.startsWith("audio/") && input.max_duration_ms === 0) ||
      path.resolve(input.file) === path.resolve(staging)
    )
      throw new Error("media_integrity_invalid");
    const source = parserInput(input.file, input.mime_type);
    await readMediaFile(
      input.file,
      input.max_bytes,
      {
        bytes: Number(input.bytes),
        sha256: input.input_sha256,
      },
      false,
    );
    if (!this.scanner) throw new Error("malware_scanner_unconfigured");
    if ((await withDeadline(this.scanner.scan(input.file), 60_000)) !== "clean")
      throw new Error("media_scan_rejected");
    const data = await processFile(
      this.ffprobe,
      [
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        ...source,
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
          "-filter_threads",
          "1",
          ...source,
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
      "-filter_threads",
      "1",
      ...source,
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
        String(duration! / 1000),
        "-c:a",
        "aac",
        "-threads",
        "1",
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
        "-threads",
        "1",
      );
    args.push(staging);
    await processFile(this.ffmpeg, args, 1024);
    const output = (await readMediaFile(staging, input.max_bytes)).output;
    const outputMime = audio ? "audio/mp4" : "image/png";
    const converted = Probe.parse(
      JSON.parse(
        (
          await processFile(
            this.ffprobe,
            [
              "-v",
              "error",
              "-show_format",
              "-show_streams",
              "-of",
              "json",
              ...parserInput(staging, outputMime),
            ],
            32_768,
          )
        ).toString("utf8"),
      ),
    );
    if (
      converted.streams.length !== 1 ||
      (audio
        ? converted.streams[0]?.codec_name !== "aac"
        : converted.streams[0]?.codec_name !== "png")
    )
      throw new Error("media_output_invalid");
    if (audio) {
      const encodedDuration = Number(converted.format.duration) * 1000;
      // AAC frame boundaries may differ slightly; a byte ceiling must never
      // silently shorten a recording. The delivered container still obeys the cap.
      if (
        !Number.isFinite(encodedDuration) ||
        encodedDuration <= 0 ||
        encodedDuration > input.max_duration_ms ||
        Math.abs(encodedDuration - duration!) > 22
      )
        throw new Error("media_output_duration_invalid");
      duration = Math.ceil(encodedDuration);
    }
    const waveform: number[] = [];
    if (audio) {
      const pcm = await processFile(
        this.ffmpeg,
        [
          "-nostdin",
          "-v",
          "error",
          "-xerror",
          "-filter_threads",
          "1",
          ...parserInput(staging, outputMime),
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
      if (!pcm.length || pcm.length % 2 !== 0)
        throw new Error("media_output_invalid");
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
      mimeType: outputMime,
      durationMs: duration,
      waveform,
    };
  }
}
