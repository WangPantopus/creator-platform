import type {
  MediaAsset,
  UploadTicket,
} from "../../../../packages/api/src/media";

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
    throw new Error(
      error?.error?.message ?? "Media is unavailable. Try again.",
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
  let ticket = input.resumed
    ? await mediaRequest<UploadTicket>(
        `${family}/${input.resumed.asset.id}/resume`,
        { method: "POST", body: "{}", signal: input.signal },
      )
    : await mediaRequest<UploadTicket>(family, {
        method: "POST",
        body: JSON.stringify({
          purpose: input.purpose,
          mimeType: input.blob.type,
          bytes: input.blob.size,
          durationMs: input.durationMs,
          sha256: digest,
          idempotencyKey: crypto.randomUUID(),
        }),
        signal: input.signal,
      });
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
  input.onTicket(ticket);
  let offset = ticket.asset.uploadedBytes;
  while (offset < input.blob.size) {
    if (Date.parse(ticket.expiresAt) <= Date.now() + 5000) {
      ticket = await mediaRequest<UploadTicket>(
        `${family}/${ticket.asset.id}/resume`,
        { method: "POST", body: "{}", signal: input.signal },
      );
      validateTicket();
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
    if (
      !Number.isSafeInteger(asset.uploadedBytes) ||
      asset.uploadedBytes <= offset ||
      asset.uploadedBytes > next
    )
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
