"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Seal } from "@qelvora/ui-web";
import {
  VoiceRecorder as BrowserRecorder,
  type RecordingSnapshot,
} from "./recorder";
import { mediaRequest, uploadCreatorMedia, uploadRecording } from "./api";
import type {
  MediaAsset,
  UploadTicket,
  CreatorMediaAsset,
  CreatorMediaUploadTicket,
  ProcessedMediaEvidence,
} from "../../../../packages/api/src/media";
import { ProcessedMediaEvidenceSchema } from "../../../../packages/api/src/media";
import "./media.css";
import { SignRecording } from "./SignRecording";
import { CreatorVoicePlayer, VoicePlayer } from "./VoicePlayer";

type ThreadRecordingProps = {
  creatorId?: string;
  fanId?: string;
  creatorName?: string;
  purpose?: "human_note" | "human_reply";
  maxDurationMs: number;
};
export function VoiceRecording(props: ThreadRecordingProps) {
  return (
    <RecordingForm
      key={`${props.creatorId}/${props.fanId}/${props.purpose}`}
      {...props}
    />
  );
}
export type CreatorVoiceRecordingProps = {
  creatorId: string;
  /** Actual saved W5 draft, issued by content authority. Never a fan/thread ID. */
  objectId: string;
  creatorName?: string;
  /** Client host owns saving the attachment and signing the complete Note. */
  onReady?: (
    asset: CreatorMediaAsset,
    evidence: ProcessedMediaEvidence,
  ) => void;
  /** Host removes any current draft attachment before the asset is revoked. */
  beforeDiscard?: (assetId: string) => Promise<void>;
};
export function CreatorVoiceRecording(props: CreatorVoiceRecordingProps) {
  return (
    <RecordingForm
      key={`${props.creatorId}/${props.objectId}`}
      {...props}
      purpose="human_note"
      maxDurationMs={60_000}
    />
  );
}
/** The host supplies the current approved Post duration. No product default is
 * inferred from the transport ceiling or from the separate60-second Note rule. */
export function CreatorPostVoiceRecording(
  props: CreatorVoiceRecordingProps & { maxDurationMs: number },
) {
  if (
    !Number.isSafeInteger(props.maxDurationMs) ||
    props.maxDurationMs <= 0 ||
    props.maxDurationMs > 3_600_000
  )
    return (
      <p role="status">Recording is awaiting its current duration limit.</p>
    );
  return (
    <RecordingForm
      key={`${props.creatorId}/${props.objectId}/post_audio/${props.maxDurationMs}`}
      {...props}
      purpose="post_audio"
    />
  );
}
function RecordingForm({
  creatorId,
  fanId,
  objectId,
  creatorName,
  purpose = "human_note",
  maxDurationMs,
  onReady,
  beforeDiscard,
}: Omit<ThreadRecordingProps, "purpose"> &
  Omit<CreatorVoiceRecordingProps, "creatorId" | "objectId"> & {
    objectId?: string;
    purpose?: "human_note" | "human_reply" | "post_audio";
  }) {
  const heading = useId();
  const family =
    creatorId && (objectId || fanId)
      ? objectId
        ? `creators/${creatorId}/media`
        : `threads/${creatorId}/${fanId}/media`
      : null;
  const notified = useRef<string | null>(null);
  const [recording, setRecording] = useState<RecordingSnapshot>({
    state: "idle",
    durationMs: 0,
    blob: null,
    reason: null,
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [upload, setUpload] = useState<
    "idle" | "uploading" | "processing" | "failed"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<MediaAsset | CreatorMediaAsset | null>(
    null,
  );
  const [available, setAvailable] = useState(false);
  const recorder = useRef<BrowserRecorder | null>(null);
  const controller = useRef<AbortController | null>(null);
  const ticket = useRef<UploadTicket | CreatorMediaUploadTicket | undefined>(
    undefined,
  );
  const uploadKey = useRef<string | undefined>(undefined);
  const pendingUpload = useRef<Promise<void> | null>(null);
  const [discarding, setDiscarding] = useState(false);
  useEffect(() => {
    const value = new BrowserRecorder(maxDurationMs, setRecording);
    recorder.current = value;
    const visibility = () => {
      if (document.hidden) value.pause(true);
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      value.discard();
      recorder.current = null;
      controller.current?.abort();
    };
  }, [maxDurationMs]);
  useEffect(() => {
    if (!recording.blob) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(recording.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [recording.blob]);
  useEffect(() => {
    const abort = new AbortController();
    void mediaRequest<{
      mediaAvailable: boolean;
      creatorMediaAvailable?: boolean;
    }>("capabilities", { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted)
          setAvailable(
            (objectId ? value.creatorMediaAvailable : value.mediaAvailable) ===
              true,
          );
      })
      .catch(() => {
        if (!abort.signal.aborted) setAvailable(false);
      });
    return () => abort.abort();
  }, [objectId]);
  useEffect(() => {
    if (
      !asset ||
      !family ||
      !["quarantined", "processing"].includes(asset.state)
    )
      return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await mediaRequest<MediaAsset | CreatorMediaAsset>(
          `${family}/${asset.id}`,
          { signal: abort.signal },
        );
        if (!abort.signal.aborted) setAsset(current);
      } catch (error) {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Processing is unavailable.",
          );
      } finally {
        if (!abort.signal.aborted)
          timer = setTimeout(() => {
            void poll();
          }, 2000);
      }
    };
    timer = setTimeout(() => {
      void poll();
    }, 2000);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [asset, family]);
  useEffect(() => {
    if (
      !objectId ||
      !asset ||
      !("objectId" in asset) ||
      asset.state !== "ready" ||
      !onReady
    )
      return;
    const occurrence = `${asset.id}/${asset.version}/${asset.sha256}`;
    if (notified.current === occurrence) return;
    if (
      asset.creatorId !== creatorId ||
      asset.objectId !== objectId ||
      asset.purpose !== purpose ||
      asset.mimeType !== "audio/mp4"
    ) {
      setError(
        "The processed recording does not match this saved content. Refresh before continuing.",
      );
      return;
    }
    const evidence = ProcessedMediaEvidenceSchema.safeParse({
      assetId: asset.id,
      version: asset.version,
      sha256: asset.sha256,
      bytes: asset.bytes,
      mimeType: "audio/mp4",
      durationMs: asset.durationMs,
    });
    if (
      !evidence.success ||
      !asset.durationMs ||
      asset.durationMs > maxDurationMs
    ) {
      setError(
        "The processed recording evidence is unavailable. Refresh before continuing.",
      );
      return;
    }
    notified.current = occurrence;
    onReady(asset, evidence.data);
  }, [asset, creatorId, objectId, onReady, purpose, maxDurationMs]);
  async function send() {
    if (!recording.blob || !creatorId || !family || pendingUpload.current)
      return;
    uploadKey.current ??= crypto.randomUUID();
    const abort = new AbortController();
    controller.current = abort;
    setUpload("uploading");
    setError(null);
    try {
      const common = {
        creatorId,
        blob: recording.blob,
        durationMs: Math.round(recording.durationMs),
        idempotencyKey: uploadKey.current,
        signal: abort.signal,
        progress: setProgress,
      };
      const result = objectId
        ? await uploadCreatorMedia({
            ...common,
            objectId,
            purpose: purpose === "post_audio" ? "post_audio" : "human_note",
            resumed: ticket.current as CreatorMediaUploadTicket | undefined,
            onTicket: (value) => {
              ticket.current = value;
            },
          })
        : await uploadRecording({
            ...common,
            fanId: fanId!,
            purpose: purpose === "human_reply" ? "human_reply" : "human_note",
            resumed: ticket.current as UploadTicket | undefined,
            onTicket: (value) => {
              ticket.current = value;
            },
          });
      setAsset(result);
      setUpload("processing");
    } catch (e) {
      setUpload("failed");
      setError(
        abort.signal.aborted
          ? "Upload paused. Retry to resume from the saved position."
          : e instanceof Error
            ? e.message
            : "Upload failed. Your preview is still here.",
      );
    }
  }
  async function discard() {
    if (discarding) return false;
    setDiscarding(true);
    controller.current?.abort();
    await pendingUpload.current;
    const current = ticket.current;
    if (current && family) {
      try {
        await beforeDiscard?.(current.asset.id);
        await mediaRequest(`${family}/${current.asset.id}`, {
          method: "DELETE",
        });
      } catch {
        setError(
          "The uploaded file could not be removed. Try again before discarding.",
        );
        setDiscarding(false);
        return false;
      }
    }
    if (uploadKey.current && !current) {
      setError(
        "The upload is unconfirmed. Retry it to find and remove the saved file before discarding.",
      );
      setDiscarding(false);
      return false;
    }
    notified.current = null;
    ticket.current = undefined;
    uploadKey.current = undefined;
    recorder.current?.discard();
    setAsset(null);
    setUpload("idle");
    setError(null);
    setDiscarding(false);
    return true;
  }
  const active = ["recording", "paused"].includes(recording.state);
  const time = `${Math.floor(recording.durationMs / 60_000)}:${String(Math.floor(recording.durationMs / 1000) % 60).padStart(2, "0")}`;
  return (
    <section className="w6-recorder" aria-labelledby={heading}>
      <div className="w6-author">
        {creatorName && <Seal size={28} />}
        <span>
          {creatorName
            ? `Record a voice note as ${creatorName}`
            : "Record a voice note"}
        </span>
      </div>
      <h1 id={heading}>Your own voice</h1>
      <p>Record, listen, and sign the exact recording before it is shared.</p>
      <div
        className="w6-data"
        aria-label={`Recorded ${Math.floor(recording.durationMs / 1000)} seconds`}
      >
        {time}{" "}
        <span className="qv-help">
          of {Math.floor(maxDurationMs / 1000)} seconds
        </span>
      </div>
      <div className="w6-actions">
        {!active && recording.state !== "requesting" && (
          <button
            className="qv-btn qv-btn--maya"
            disabled={upload === "uploading" || discarding}
            onClick={() => {
              void discard().then((discarded) => {
                if (discarded) void recorder.current?.start();
              });
            }}
          >
            {" "}
            {preview ? "Record again" : "Record"}
          </button>
        )}
        {recording.state === "requesting" && (
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => recorder.current?.discard()}
          >
            Cancel permission request
          </button>
        )}
        {recording.state === "recording" && (
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => recorder.current?.pause()}
          >
            Pause
          </button>
        )}
        {recording.state === "paused" && (
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => recorder.current?.resume()}
          >
            Resume
          </button>
        )}
        {active && (
          <button
            className="qv-btn qv-btn--maya"
            onClick={() => recorder.current?.stop()}
          >
            Stop and preview
          </button>
        )}
      </div>
      {preview && (
        <div className="w6-plate">
          <span>Private preview · your recording</span>
          <audio
            controls
            preload="metadata"
            src={preview}
            aria-label="Preview your own recording"
          />
          <button
            className="qv-btn qv-btn--quiet"
            disabled={discarding}
            onClick={() => {
              void discard();
            }}
          >
            Discard recording
          </button>
        </div>
      )}
      {(recording.reason || error || asset?.failureCode) && (
        <p className="w6-notice" role="status">
          {error ??
            recording.reason ??
            asset?.failureCode?.replaceAll("_", " ")}
        </p>
      )}
      {upload === "uploading" && (
        <>
          <progress
            max={1}
            value={progress}
            aria-label="Audio upload progress"
          />
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => controller.current?.abort()}
          >
            Pause upload
          </button>
        </>
      )}
      {preview && upload !== "uploading" && !asset && (
        <button
          className="qv-btn qv-btn--maya"
          disabled={!available || !family || discarding}
          onClick={() => {
            if (pendingUpload.current) return;
            const work = send();
            pendingUpload.current = work;
            void work.finally(() => {
              if (pendingUpload.current === work) pendingUpload.current = null;
            });
          }}
        >
          {upload === "failed" ? "Retry upload" : "Upload recording"}
        </button>
      )}
      {asset && (
        <p role="status">
          {asset.state === "ready"
            ? "Processed. Review and sign the exact recording in Studio."
            : asset.state === "rejected"
              ? "This file could not be processed. Record again."
              : "Uploaded · processing before sharing"}
        </p>
      )}
      {asset?.state === "ready" &&
        creatorId &&
        objectId &&
        "objectId" in asset && (
          <CreatorVoicePlayer
            asset={asset}
            creatorId={creatorId}
            objectId={objectId}
            creatorName={creatorName ?? "the creator"}
          />
        )}
      {asset?.state === "ready" &&
        creatorId &&
        fanId &&
        !("objectId" in asset) && (
          <>
            <VoicePlayer
              asset={asset}
              creatorId={creatorId}
              fanId={fanId}
              creatorName={creatorName ?? "the creator"}
            />
            <SignRecording
              asset={asset}
              creatorId={creatorId}
              fanId={fanId}
              onSigned={setAsset}
            />
          </>
        )}
      {(!available || !family) && (
        <p className="qv-help">
          Sign in to a configured creator account to upload and sign. Your
          preview stays on this device until you upload it.
        </p>
      )}
    </section>
  );
}
