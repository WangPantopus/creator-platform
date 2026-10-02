import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type {
  CreatorMediaPurpose,
  MediaPolicy,
  MediaPurpose,
} from "../../../../../packages/api/src/media.js";
import { MEDIA_FILE_CEILING } from "./files.js";

const Limit = z.strictObject({
  maxBytes: z.number().int().positive().max(MEDIA_FILE_CEILING),
  maxDurationMs: z.number().int().min(0).max(3_600_000),
  retentionSeconds: z.number().int().positive(),
  allowTranscript: z.boolean(),
});
/** Only purposes with an implemented producer/consumer are configurable here.
 * Licensed AI audio and provider call recordings never enter through this file. */
const PolicyFile = z.strictObject({
  schemaVersion: z.literal(1),
  thread: z
    .strictObject({
      human_reply: Limit.optional(),
      fan_attachment: Limit.optional(),
    })
    .default({}),
  creator: z
    .strictObject({
      human_note: Limit.optional(),
      post_photo: Limit.optional(),
      post_audio: Limit.optional(),
      source_audio: Limit.optional(),
      interview_audio: Limit.optional(),
    })
    .default({}),
});
export type MediaPolicyFile = z.infer<typeof PolicyFile>;

export type MediaInteractiveEnvironment = Readonly<{
  storageRoot: string;
  ticketSecret: Buffer;
  ticketOrigin: string;
  policy: Readonly<{
    thread: (purpose: MediaPurpose) => MediaPolicy | null;
    creator: (purpose: CreatorMediaPurpose) => MediaPolicy | null;
  }>;
}>;
export type MediaWorkerEnvironment = MediaInteractiveEnvironment &
  Readonly<{
    clamdSocket: string;
    ffmpeg: string;
    ffprobe: string;
    credentials?: Readonly<{
      executable: string;
      signerExecutable: string;
      trustAnchorsFile: string;
      trustAnchorsSha256: string;
      workingDirectory: string;
      maxBytes: number;
    }>;
  }>;

function absolute(name: string, value: string | undefined) {
  if (!value || !path.isAbsolute(value) || value.includes("\0"))
    throw new Error(`${name} must be an absolute path.`);
  return path.normalize(value);
}
function privateDirectory(name: string, value: string | undefined) {
  const directory = absolute(name, value);
  const stat = statSync(directory);
  // Storage and credential staging are worker-private; refuse a shared folder.
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0)
    throw new Error(`${name} must be an existing directory with mode 0700.`);
  return directory;
}

/** Interactive API configuration. Absent storage root means media stays
 * unconfigured; partial configuration is an error, never a silent default. */
export function readMediaEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): MediaInteractiveEnvironment | undefined {
  const keys = [
    "MEDIA_STORAGE_ROOT",
    "MEDIA_TICKET_SECRET",
    "MEDIA_TICKET_ORIGIN",
    "MEDIA_POLICY_FILE",
  ] as const;
  if (keys.every((key) => !env[key])) return undefined;
  const missing = keys.filter((key) => !env[key]);
  if (missing.length)
    throw new Error(
      `Media configuration is incomplete: ${missing.join(", ")}.`,
    );
  const ticketSecret = Buffer.from(env.MEDIA_TICKET_SECRET!, "base64");
  if (ticketSecret.byteLength < 32)
    throw new Error("MEDIA_TICKET_SECRET must decode to at least 32 bytes.");
  const origin = new URL(env.MEDIA_TICKET_ORIGIN!);
  if (origin.origin !== env.MEDIA_TICKET_ORIGIN)
    throw new Error("MEDIA_TICKET_ORIGIN must be an origin without a path.");
  const file = PolicyFile.parse(
    JSON.parse(
      readFileSync(
        absolute("MEDIA_POLICY_FILE", env.MEDIA_POLICY_FILE),
        "utf8",
      ),
    ),
  );
  if ((file.creator.human_note?.maxDurationMs ?? 0) > 60_000)
    throw new Error("A Note's voice is limited to 60 seconds.");
  return Object.freeze({
    storageRoot: privateDirectory("MEDIA_STORAGE_ROOT", env.MEDIA_STORAGE_ROOT),
    ticketSecret,
    ticketOrigin: origin.origin,
    policy: Object.freeze({
      thread: (purpose: MediaPurpose) =>
        (file.thread as Partial<Record<MediaPurpose, MediaPolicy>>)[purpose] ??
        null,
      creator: (purpose: CreatorMediaPurpose) =>
        (file.creator as Partial<Record<CreatorMediaPurpose, MediaPolicy>>)[
          purpose
        ] ?? null,
    }),
  });
}

/** Ingestion-pool configuration. The scanner is mandatory; content credentials
 * are optional only in the sense that signed media then stays pending. */
export function readMediaWorkerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): MediaWorkerEnvironment | undefined {
  const interactive = readMediaEnvironment(env);
  if (!interactive) return undefined;
  const credentialKeys = [
    "MEDIA_C2PA_TOOL",
    "MEDIA_C2PA_SIGNER",
    "MEDIA_C2PA_TRUST_ANCHORS",
    "MEDIA_C2PA_TRUST_ANCHORS_SHA256",
    "MEDIA_C2PA_WORKDIR",
  ] as const;
  const configured = credentialKeys.filter((key) => env[key]);
  if (configured.length && configured.length !== credentialKeys.length)
    throw new Error(
      `Content credential configuration is incomplete: ${credentialKeys
        .filter((key) => !env[key])
        .join(", ")}.`,
    );
  const maxBytes = Math.max(
    ...[
      interactive.policy.thread("human_reply"),
      interactive.policy.creator("human_note"),
      interactive.policy.creator("post_audio"),
      interactive.policy.creator("post_photo"),
    ].map((policy) => policy?.maxBytes ?? 0),
  );
  return Object.freeze({
    ...interactive,
    clamdSocket: absolute("MEDIA_CLAMD_SOCKET", env.MEDIA_CLAMD_SOCKET),
    ffmpeg: absolute("MEDIA_FFMPEG", env.MEDIA_FFMPEG),
    ffprobe: absolute("MEDIA_FFPROBE", env.MEDIA_FFPROBE),
    ...(configured.length
      ? {
          credentials: Object.freeze({
            executable: absolute("MEDIA_C2PA_TOOL", env.MEDIA_C2PA_TOOL),
            signerExecutable: absolute(
              "MEDIA_C2PA_SIGNER",
              env.MEDIA_C2PA_SIGNER,
            ),
            trustAnchorsFile: absolute(
              "MEDIA_C2PA_TRUST_ANCHORS",
              env.MEDIA_C2PA_TRUST_ANCHORS,
            ),
            trustAnchorsSha256: env.MEDIA_C2PA_TRUST_ANCHORS_SHA256!,
            workingDirectory: privateDirectory(
              "MEDIA_C2PA_WORKDIR",
              env.MEDIA_C2PA_WORKDIR,
            ),
            maxBytes: maxBytes > 0 ? maxBytes : MEDIA_FILE_CEILING,
          }),
        }
      : {}),
  });
}
