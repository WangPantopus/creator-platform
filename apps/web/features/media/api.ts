import type {
  MediaAsset,
  UploadTicket,
  CreatorMediaAsset,
  CreatorMediaPurpose,
  CreatorMediaUploadTicket,
} from "../../../../packages/api/src/media";
import { CreatorMediaPolicyViewSchema } from "../../../../packages/api/src/media";

/** Current saved-object projection only. Upload rechecks the same real policy. */
export async function readCreatorMediaPolicy(input: {
  creatorId: string;
  objectId: string;
  purpose: CreatorMediaPurpose;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams({
    objectId: input.objectId,
    purpose: input.purpose,
  });
  const result = CreatorMediaPolicyViewSchema.parse(
    await mediaRequest<unknown>(
      `creators/${input.creatorId}/media-policy?${query}`,
      { signal: input.signal },
    ),
  );
  if (
    result.creatorId !== input.creatorId ||
    result.objectId !== input.objectId ||
    result.purpose !== input.purpose
  )
    throw new Error(
      "This recording limit does not match the current saved content.",
    );
  return result;
}

export class MediaRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function mediaRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/w6/${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    throw new MediaRequestError(
      error?.error?.message ?? "Media is unavailable. Try again.",
      response.status,
      error?.error?.code,
    );
  }
  return response.json() as Promise<T>;
}
export type RecordingUploadInput = {
  creatorId: string;
  fanId: string;
  purpose: "human_note" | "human_reply" | "interview_audio";
  blob: Blob;
  durationMs: number;
  /** Retain with the recording, including when the initial response is lost. */
  idempotencyKey: string;
  signal: AbortSignal;
  progress: (ratio: number) => void;
  resumed?: UploadTicket;
  onTicket: (ticket: UploadTicket) => void;
};

export function uploadRecording(input: RecordingUploadInput) {
  return uploadBinary<MediaAsset>({
    ...input,
    family: `threads/${input.creatorId}/${input.fanId}/media`,
    declaration: { purpose: input.purpose },
  });
}
export function uploadCreatorMedia(
  input: Omit<
    RecordingUploadInput,
    "fanId" | "purpose" | "durationMs" | "resumed" | "onTicket"
  > & {
    objectId: string;
    purpose: CreatorMediaPurpose;
    durationMs?: number;
    resumed?: CreatorMediaUploadTicket;
    onTicket: (ticket: CreatorMediaUploadTicket) => void;
  },
) {
  const verify = (ticket: CreatorMediaUploadTicket) => {
    if (
      ticket.asset.creatorId !== input.creatorId ||
      ticket.asset.objectId !== input.objectId ||
      ticket.asset.purpose !== input.purpose
    )
      throw new Error(
        "This upload does not belong to the current content. Refresh before continuing.",
      );
    input.onTicket(ticket);
  };
  return uploadBinary<CreatorMediaAsset>({
    ...input,
    onTicket: verify,
    family: `creators/${input.creatorId}/media`,
    declaration: { objectId: input.objectId, purpose: input.purpose },
  });
}
type BinaryTicket<A> = Omit<UploadTicket, "asset"> & { asset: A };
async function uploadBinary<A extends MediaAsset | CreatorMediaAsset>(input: {
  family: string;
  declaration: Record<string, string>;
  blob: Blob;
  durationMs?: number;
  idempotencyKey: string;
  signal: AbortSignal;
  progress: (ratio: number) => void;
  resumed?: BinaryTicket<A>;
  onTicket: (ticket: BinaryTicket<A>) => void;
}): Promise<A> {
  const family = input.family;
  if (
    !Number.isSafeInteger(input.blob.size) ||
    input.blob.size <= 0 ||
    input.blob.size > 268_435_456 ||
    ![
      "audio/webm",
      "audio/mp4",
      "audio/ogg",
      "audio/wav",
      "image/png",
      "image/jpeg",
    ].includes(input.blob.type) ||
    (input.durationMs !== undefined &&
      (!Number.isSafeInteger(input.durationMs) ||
        input.durationMs <= 0 ||
        input.durationMs > 3_600_000))
  )
    throw new Error(
      "Choose a supported file within the content's media limit.",
    );
  input.signal.throwIfAborted();
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await input.blob.arrayBuffer()),
    ),
  )
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  input.signal.throwIfAborted();
  let ticket =
    input.resumed ??
    (await mediaRequest<BinaryTicket<A>>(family, {
      method: "POST",
      body: JSON.stringify({
        ...input.declaration,
        mimeType: input.blob.type,
        bytes: input.blob.size,
        durationMs: input.durationMs,
        sha256: digest,
        idempotencyKey: input.idempotencyKey,
      }),
      signal: input.signal,
    }));
  const validateTicket = () => {
    if (
      (ticket.asset.state === "uploading" &&
        (ticket.asset.sha256 !== digest ||
          ticket.asset.bytes !== input.blob.size)) ||
      !Number.isSafeInteger(ticket.asset.uploadedBytes) ||
      ticket.asset.uploadedBytes < 0 ||
      ticket.asset.uploadedBytes > input.blob.size ||
      !Number.isSafeInteger(ticket.chunkBytes) ||
      ticket.chunkBytes < 1 ||
      ticket.chunkBytes > 1_048_576
    )
      throw new Error(
        "The resumed upload does not match this recording. Start a new upload.",
      );
  };
  validateTicket();
  const assetId = ticket.asset.id;
  input.onTicket(ticket);
  // A finish response may be lost after the worker has already claimed or processed the asset.
  const current = await mediaRequest<A>(`${family}/${ticket.asset.id}`, {
    signal: input.signal,
  });
  if (current.id !== assetId)
    throw new Error("The saved upload could not be confirmed.");
  if (
    ["quarantined", "processing", "ready", "rejected"].includes(current.state)
  )
    return current;
  ticket = await mediaRequest<BinaryTicket<A>>(
    `${family}/${ticket.asset.id}/resume`,
    {
      method: "POST",
      body: "{}",
      signal: input.signal,
    },
  );
  validateTicket();
  if (ticket.asset.id !== assetId)
    throw new Error("The resumed upload changed.");
  input.onTicket(ticket);
  let offset = ticket.asset.uploadedBytes;
  input.progress(offset / input.blob.size);
  while (offset < input.blob.size) {
    if (Date.parse(ticket.expiresAt) <= Date.now() + 5000) {
      ticket = await mediaRequest<BinaryTicket<A>>(
        `${family}/${ticket.asset.id}/resume`,
        { method: "POST", body: "{}", signal: input.signal },
      );
      validateTicket();
      if (ticket.asset.id !== assetId)
        throw new Error("The resumed upload changed.");
      offset = ticket.asset.uploadedBytes;
      input.onTicket(ticket);
    }
    const url = new URL(ticket.url);
    const next = Math.min(input.blob.size, offset + ticket.chunkBytes);
    const asset = await mediaRequest<A>(
      `${family}/${ticket.asset.id}/upload${url.search}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Upload-Offset": String(offset),
        },
        body: input.blob.slice(offset, next),
        signal: input.signal,
      },
    );
    if (asset.id !== assetId || asset.uploadedBytes !== next)
      throw new Error(
        "Upload progress could not be confirmed. Resume this recording.",
      );
    offset = asset.uploadedBytes;
    input.progress(offset / input.blob.size);
  }
  return mediaRequest<A>(`${family}/${ticket.asset.id}/finish`, {
    method: "POST",
    body: "{}",
    signal: input.signal,
  });
}
