import type {
  MediaAsset,
  UploadTicket,
} from "../../../../packages/api/src/media";

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
export async function uploadRecording(input: {
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
}) {
  const family = `threads/${input.creatorId}/${input.fanId}/media`;
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await input.blob.arrayBuffer()),
    ),
  )
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  let ticket =
    input.resumed ??
    (await mediaRequest<UploadTicket>(family, {
      method: "POST",
      body: JSON.stringify({
        purpose: input.purpose,
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
      ticket.asset.sha256 !== digest ||
      ticket.asset.bytes !== input.blob.size ||
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
  const current = await mediaRequest<MediaAsset>(
    `${family}/${ticket.asset.id}`,
    {
      signal: input.signal,
    },
  );
  if (current.id !== assetId)
    throw new Error("The saved upload could not be confirmed.");
  if (
    ["quarantined", "processing", "ready", "rejected"].includes(current.state)
  )
    return current;
  ticket = await mediaRequest<UploadTicket>(
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
      ticket = await mediaRequest<UploadTicket>(
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
    const asset = await mediaRequest<MediaAsset>(
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
  return mediaRequest<MediaAsset>(`${family}/${ticket.asset.id}/finish`, {
    method: "POST",
    body: "{}",
    signal: input.signal,
  });
}
