"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  CreatorMediaAssetSchema,
  MediaRevocationSchema,
  type CreatorMediaAsset,
  type CreatorMediaUploadTicket,
} from "../../../../packages/api/src/media";
import {
  MediaRequestError,
  captureMediaRequest,
  mediaRequest,
  uploadCreatorMedia,
} from "../media/api";

/** Saved W5 object + real W6 upload/processing. No URL or processing receipt is
 * made locally; the editor signs the immutable processed revision separately.
 */
export function PhotoAttachment({
  creatorId,
  objectId,
  expectedAccountId,
  onReady,
  beforeDiscard,
}: {
  creatorId: string;
  objectId: string;
  expectedAccountId: string;
  onReady(asset: CreatorMediaAsset, alt: string): void;
  beforeDiscard(assetId: string): Promise<void>;
}) {
  const altId = useId();
  const [available, setAvailable] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [alt, setAlt] = useState(""),
    [asset, setAsset] = useState<CreatorMediaAsset | null>(null),
    [activity, setActivity] = useState<"upload" | "discard" | null>(null),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  const ticket = useRef<CreatorMediaUploadTicket | undefined>(undefined),
    uploadKey = useRef<string | undefined>(undefined),
    controller = useRef<AbortController | null>(null),
    fileInput = useRef<HTMLInputElement | null>(null),
    pending = useRef(false);
  const lifetime = useRef(new AbortController());
  useEffect(() => {
    if (lifetime.current.signal.aborted)
      lifetime.current = new AbortController();
    const original = lifetime.current;
    return () => original.abort();
  }, []);
  const busy = activity !== null;
  useEffect(() => {
    const abort = new AbortController();
    void mediaRequest<{ creatorMediaAvailable?: boolean }>("capabilities", {
      signal: abort.signal,
      expectedAccountId,
    })
      .then((value) => {
        if (!abort.signal.aborted)
          setAvailable(value.creatorMediaAvailable === true);
      })
      .catch(() => {
        if (!abort.signal.aborted) setAvailable(false);
      });
    return () => {
      abort.abort();
      controller.current?.abort();
    };
  }, [expectedAccountId]);
  useEffect(() => {
    if (
      activity === "discard" ||
      !asset ||
      !["quarantined", "processing"].includes(asset.state)
    )
      return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = CreatorMediaAssetSchema.parse(
          await mediaRequest(`creators/${creatorId}/media/${asset.id}`, {
            signal: abort.signal,
            expectedAccountId,
          }),
        );
        if (
          value.creatorId !== creatorId ||
          value.objectId !== objectId ||
          value.purpose !== "post_photo" ||
          value.ownerAccountId !== expectedAccountId
        )
          throw new Error("The photo does not belong to this draft.");
        if (!abort.signal.aborted) setAsset(value);
      } catch (failure) {
        if (!abort.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Photo processing is unavailable.",
          );
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 2000);
      }
    };
    timer = setTimeout(() => void poll(), 2000);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [asset, creatorId, objectId, expectedAccountId, activity]);
  const upload = async () => {
    if (!file || pending.current) return;
    pending.current = true;
    setActivity("upload");
    setError("");
    const abort = new AbortController();
    const original = lifetime.current;
    const signal = AbortSignal.any([abort.signal, original.signal]);
    const currentView = () =>
      lifetime.current === original && !original.signal.aborted;
    controller.current = abort;
    const firstAttempt = uploadKey.current === undefined;
    uploadKey.current ??= crypto.randomUUID();
    try {
      const value = CreatorMediaAssetSchema.parse(
        await uploadCreatorMedia({
          creatorId,
          expectedAccountId,
          objectId,
          purpose: "post_photo",
          blob: file,
          idempotencyKey: uploadKey.current,
          signal,
          progress: setProgress,
          resumed: ticket.current,
          onTicket: (value) => {
            ticket.current = value;
          },
        }),
      );
      if (!signal.aborted && currentView()) setAsset(value);
    } catch (failure) {
      if (!currentView()) return;
      if (
        firstAttempt &&
        !ticket.current &&
        failure instanceof MediaRequestError &&
        [400, 403, 404, 413, 415, 422].includes(failure.status)
      )
        uploadKey.current = undefined;
      if (!signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : "Photo upload is unavailable.",
        );
    } finally {
      if (currentView()) {
        pending.current = false;
        setActivity(null);
      }
    }
  };
  const discard = async () => {
    if (pending.current) return;
    pending.current = true;
    const originalView = lifetime.current;
    const currentView = () =>
      lifetime.current === originalView && !originalView.signal.aborted;
    setActivity("discard");
    setError("");
    try {
      // Retain the genuine opening binding before the host's draft detach.
      const original =
        ticket.current || uploadKey.current
          ? captureMediaRequest(expectedAccountId)
          : null;
      const check = () => {
        originalView.signal.throwIfAborted();
        if (!currentView()) throw new DOMException("View closed", "AbortError");
        original?.check();
      };
      check();
      const current = ticket.current?.asset;
      if (current) {
        await beforeDiscard(current.id);
        check();
        MediaRevocationSchema.parse(
          await original!.request(`creators/${creatorId}/media/${current.id}`, {
            method: "DELETE",
            signal: originalView.signal,
          }),
        );
        check();
      } else if (uploadKey.current)
        throw new Error(
          "Retry the unconfirmed upload before discarding its saved file.",
        );
      ticket.current = undefined;
      uploadKey.current = undefined;
      setError("");
      setAsset(null);
      setFile(null);
      setAlt("");
      if (fileInput.current) fileInput.current.value = "";
      setProgress(0);
    } catch (failure) {
      if (currentView())
        setError(
          failure instanceof Error
            ? failure.message
            : "The saved photo could not be removed.",
        );
    } finally {
      if (currentView()) {
        pending.current = false;
        setActivity(null);
      }
    }
  };
  return (
    <section aria-label="Photo attachment">
      <p className="qv-help">
        Choose a photo and describe it for people who cannot see it. Upload and
        processing happen before the creator reviews the complete publication.
      </p>
      {!available && (
        <p role="status">
          Photo uploads are unavailable until the current media service and
          policy are configured. Your text draft is saved.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <label className="w5-field">
        Photo
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png"
          disabled={!available || busy || !!uploadKey.current}
          onChange={(event) => {
            const selected = event.target.files?.[0] ?? null;
            setFile(selected);
            setError("");
          }}
        />
      </label>
      <div className="w5-field">
        <label htmlFor={altId}>Alternative text</label>
        <textarea
          id={altId}
          style={{ resize: "none" }}
          maxLength={1000}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          placeholder="Describe the photo"
        />
      </div>
      {file && <p>{file.name}</p>}
      {activity === "upload" && (
        <p role="status">Uploaded {Math.round(progress * 100)}%</p>
      )}
      {activity === "discard" && <p role="status">Removing saved photo…</p>}
      {asset && (
        <p role="status">
          {asset.state === "ready"
            ? "Processed photo ready for review"
            : asset.state === "rejected"
              ? "Photo rejected by processing"
              : "Photo processing"}
        </p>
      )}
      <div className="w5-actions">
        <button
          className="qv-btn qv-btn--secondary"
          disabled={!available || !file || !alt.trim() || busy || !!asset}
          onClick={() => void upload()}
        >
          {uploadKey.current ? "Retry upload" : "Upload photo"}
        </button>
        {activity === "upload" && (
          <button
            className="qv-btn qv-btn--quiet"
            onClick={() => {
              controller.current?.abort();
              setError(
                "Upload paused. Retry this same photo to confirm the saved position.",
              );
            }}
          >
            Pause upload
          </button>
        )}
        {(file || asset) && (
          <button
            className="qv-btn qv-btn--quiet"
            disabled={busy}
            onClick={() => void discard()}
          >
            Discard photo
          </button>
        )}
        {asset?.state === "ready" && (
          <button
            className="qv-btn qv-btn--maya"
            disabled={busy || !alt.trim() || asset.mimeType !== "image/png"}
            onClick={() => onReady(asset, alt.trim())}
          >
            Add processed photo
          </button>
        )}
      </div>
    </section>
  );
}
