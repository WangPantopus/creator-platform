import { copy } from "@qelvora/copy";
import type {
  MediaAsset,
  UploadTicket,
  CreatorMediaAsset,
  CreatorMediaPurpose,
  CreatorMediaUploadTicket,
} from "../../../../packages/api/src/media";
import {
  CreatorMediaPolicyViewSchema,
  CreatorMediaAssetSchema,
  MediaAssetSchema,
} from "../../../../packages/api/src/media";

/** Current saved-object projection only. Upload rechecks the same real policy. */
export async function readCreatorMediaPolicy(input: {
  creatorId: string;
  objectId: string;
  purpose: CreatorMediaPurpose;
  expectedAccountId?: string;
  signal?: AbortSignal;
}) {
  const query = new URLSearchParams({
    objectId: input.objectId,
    purpose: input.purpose,
  });
  const result = CreatorMediaPolicyViewSchema.parse(
    await mediaRequest<unknown>(
      `creators/${input.creatorId}/media-policy?${query}`,
      { signal: input.signal, expectedAccountId: input.expectedAccountId },
    ),
  );
  if (
    result.creatorId !== input.creatorId ||
    result.objectId !== input.objectId ||
    result.purpose !== input.purpose
  )
    throw new Error(
      copy.w6ThisRecordingLimitDoesNotMatchTheCurrentSavedContent,
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

type MediaIdentity = {
  accountId: string;
  signal: AbortSignal;
  end: () => void;
};
let identity: MediaIdentity | undefined;
/** W1 attaches the current account boundary before mounting private media. */
export function configureMediaRequests(current: MediaIdentity) {
  identity = current;
  return () => {
    if (identity === current) identity = undefined;
  };
}

export async function mediaRequest<T>(
  path: string,
  init: RequestInit & { expectedAccountId?: string } = {},
): Promise<T> {
  const current = identity;
  const { expectedAccountId, ...request } = init;
  if (
    current &&
    expectedAccountId !== undefined &&
    expectedAccountId !== current.accountId
  )
    throw new MediaRequestError(
      "Your account changed. Reopen this content to continue.",
      409,
      "session_account_changed",
    );
  const headers = new Headers(request.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const account = expectedAccountId ?? current?.accountId;
  if (account !== undefined) headers.set("x-qelvora-expected-account", account);
  const signal = current
    ? AbortSignal.any([
        current.signal,
        ...(request.signal ? [request.signal] : []),
      ])
    : request.signal;
  signal?.throwIfAborted();
  let response: Response;
  try {
    response = await fetch(`/api/w6/${path}`, {
      ...request,
      credentials: "same-origin",
      cache: "no-store",
      headers,
      signal,
    });
  } catch (failure) {
    signal?.throwIfAborted();
    if (failure instanceof TypeError)
      throw new MediaRequestError(
        copy.w6MediaIsUnavailableTryAgain,
        503,
        "media_transport_unavailable",
      );
    throw failure;
  }
  signal?.throwIfAborted();
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    if (
      response.status === 409 &&
      error?.error?.code === "session_account_changed"
    )
      current?.end();
    throw new MediaRequestError(
      error?.error?.message ?? copy.w6MediaIsUnavailableTryAgain,
      response.status,
      error?.error?.code,
    );
  }
  const result = (await response.json()) as T;
  signal?.throwIfAborted();
  return result;
}
export type RecordingUploadInput = {
  creatorId: string;
  fanId: string;
  purpose: "human_note" | "human_reply" | "interview_audio";
  blob: Blob;
  durationMs: number;
  /** Current host account precondition, never identity or access authority. */
  expectedAccountId?: string;
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
    parseAsset: (value) => MediaAssetSchema.parse(value),
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
      ticket.asset.purpose !== input.purpose ||
      (input.expectedAccountId !== undefined &&
        ticket.asset.ownerAccountId !== input.expectedAccountId)
    )
      throw new Error(copy.w6ThisUploadDoesNotBelongToTheCurrentContentRefresh);
    input.onTicket(ticket);
  };
  return uploadBinary<CreatorMediaAsset>({
    ...input,
    onTicket: verify,
    family: `creators/${input.creatorId}/media`,
    declaration: { objectId: input.objectId, purpose: input.purpose },
    parseAsset: (value) => CreatorMediaAssetSchema.parse(value),
  });
}
type BinaryTicket<A> = Omit<UploadTicket, "asset"> & { asset: A };
async function uploadBinary<A extends MediaAsset | CreatorMediaAsset>(input: {
  family: string;
  declaration: Record<string, string>;
  parseAsset: (value: unknown) => A;
  blob: Blob;
  durationMs?: number;
  expectedAccountId?: string;
  idempotencyKey: string;
  signal: AbortSignal;
  progress: (ratio: number) => void;
  resumed?: BinaryTicket<A>;
  onTicket: (ticket: BinaryTicket<A>) => void;
}): Promise<A> {
  const family = input.family;
  const openingIdentity = identity;
  const expectedAccountId =
    input.expectedAccountId ?? openingIdentity?.accountId;
  if (
    expectedAccountId === undefined ||
    (openingIdentity && openingIdentity.accountId !== expectedAccountId)
  )
    throw new MediaRequestError(
      "Your account changed. Reopen this content to continue.",
      409,
      "session_account_changed",
    );
  const signal = openingIdentity
    ? AbortSignal.any([input.signal, openingIdentity.signal])
    : input.signal;
  const request = <T>(path: string, init: RequestInit = {}) =>
    mediaRequest<T>(path, {
      ...init,
      expectedAccountId,
      signal,
    });
  const parseAsset = (value: unknown): A => {
    const asset = input.parseAsset(value);
    if (
      asset.purpose !== input.declaration.purpose ||
      ("creatorId" in asset &&
        (asset.creatorId !== family.split("/")[1] ||
          asset.objectId !== input.declaration.objectId ||
          asset.ownerAccountId !== expectedAccountId)) ||
      (asset.state === "uploading" &&
        (asset.mimeType !== input.blob.type ||
          asset.durationMs !== (input.durationMs ?? null) ||
          asset.sha256 !== digest ||
          asset.bytes !== input.blob.size))
    )
      throw new Error(copy.w6ThisUploadDoesNotBelongToTheCurrentContentRefresh);
    return asset;
  };
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
    throw new Error(copy.w6ChooseASupportedFileWithinTheContentSMediaLimit);
  signal.throwIfAborted();
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await input.blob.arrayBuffer()),
    ),
  )
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  signal.throwIfAborted();
  let ticket =
    input.resumed ??
    (await request<BinaryTicket<A>>(family, {
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
    ticket.asset = parseAsset(ticket.asset);
    const url = new URL(ticket.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.pathname !== `/v1/w6/${family}/${ticket.asset.id}/upload` ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      url.searchParams.getAll("ticket").length !== 1 ||
      !url.searchParams.get("ticket") ||
      [...url.searchParams.keys()].some((key) => key !== "ticket") ||
      !Number.isFinite(Date.parse(ticket.expiresAt)) ||
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
      throw new Error(copy.w6TheResumedUploadDoesNotMatchThisRecordingStartA);
  };
  validateTicket();
  const assetId = ticket.asset.id;
  input.onTicket(ticket);
  // A finish response may be lost after the worker has already claimed or processed the asset.
  const current = parseAsset(
    await request<unknown>(`${family}/${ticket.asset.id}`),
  );
  if (current.id !== assetId)
    throw new Error(copy.w6TheSavedUploadCouldNotBeConfirmed);
  if (
    ["quarantined", "processing", "ready", "rejected"].includes(current.state)
  )
    return current;
  ticket = await request<BinaryTicket<A>>(
    `${family}/${ticket.asset.id}/resume`,
    {
      method: "POST",
      body: "{}",
      signal: input.signal,
    },
  );
  validateTicket();
  if (ticket.asset.id !== assetId)
    throw new Error(copy.w6TheResumedUploadChanged);
  input.onTicket(ticket);
  let offset = ticket.asset.uploadedBytes;
  input.progress(offset / input.blob.size);
  while (offset < input.blob.size) {
    if (Date.parse(ticket.expiresAt) <= Date.now() + 5000) {
      ticket = await request<BinaryTicket<A>>(
        `${family}/${ticket.asset.id}/resume`,
        { method: "POST", body: "{}", signal: input.signal },
      );
      validateTicket();
      if (ticket.asset.id !== assetId)
        throw new Error(copy.w6TheResumedUploadChanged);
      offset = ticket.asset.uploadedBytes;
      input.onTicket(ticket);
    }
    const url = new URL(ticket.url);
    const next = Math.min(input.blob.size, offset + ticket.chunkBytes);
    const asset = parseAsset(
      await request<unknown>(
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
      ),
    );
    if (asset.id !== assetId || asset.uploadedBytes !== next)
      throw new Error(
        copy.w6UploadProgressCouldNotBeConfirmedResumeThisRecording,
      );
    offset = asset.uploadedBytes;
    input.progress(offset / input.blob.size);
  }
  const finished = parseAsset(
    await request<unknown>(`${family}/${ticket.asset.id}/finish`, {
      method: "POST",
      body: "{}",
    }),
  );
  if (finished.id !== assetId)
    throw new Error(copy.w6TheSavedUploadCouldNotBeConfirmed);
  return finished;
}
