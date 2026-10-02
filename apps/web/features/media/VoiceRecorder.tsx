"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useId, useRef, useState } from "react";
import { Seal } from "@qelvora/ui-web";
import {
  VoiceRecorder as BrowserRecorder,
  type RecordingSnapshot,
} from "./recorder";
import {
  MediaRequestError,
  mediaRequest,
  uploadCreatorMedia,
  uploadRecording,
} from "./api";
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
  /** Current host account precondition; it never supplies identity authority. */
  expectedAccountId?: string;
  embedded?: boolean;
  /** Host retains the actual server projection, including credential completion. */
  onAssetChange?: (asset: MediaAsset | null) => void;
  actionsDisabled?: boolean;
};
export function VoiceRecording(props: ThreadRecordingProps) {
  return (
    <RecordingForm
      key={`${props.expectedAccountId ?? ""}/${props.creatorId}/${props.fanId}/${props.purpose}`}
      {...props}
    />
  );
}
export type CreatorVoiceRecordingProps = {
  creatorId: string;
  /** Actual saved W5 draft, issued by content authority. Never a fan/thread ID. */
  objectId: string;
  expectedAccountId?: string;
  creatorName?: string;
  /** The Studio dialog already supplies this surface's visible heading. */
  embedded?: boolean;
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
      key={`${props.expectedAccountId ?? ""}/${props.creatorId}/${props.objectId}`}
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
      <p role="status">{copy.w6RecordingIsAwaitingItsCurrentDurationLimit}</p>
    );
  return (
    <RecordingForm
      key={`${props.expectedAccountId ?? ""}/${props.creatorId}/${props.objectId}/post_audio/${props.maxDurationMs}`}
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
  expectedAccountId,
  embedded = false,
  onAssetChange,
  actionsDisabled = false,
}: Omit<ThreadRecordingProps, "purpose"> &
  Omit<CreatorVoiceRecordingProps, "creatorId" | "objectId"> & {
    objectId?: string;
    purpose?: "human_note" | "human_reply" | "post_audio";
  }) {
  const heading = useId();
  const surface = useRef<HTMLElement | null>(null);
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
  const previewAudio = useRef<HTMLAudioElement | null>(null);
  const [upload, setUpload] = useState<
    "idle" | "uploading" | "processing" | "failed"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<MediaAsset | CreatorMediaAsset | null>(
    null,
  );
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!objectId)
      onAssetChange?.(asset && !("objectId" in asset) ? asset : null);
  }, [asset, objectId, onAssetChange]);
  const recorder = useRef<BrowserRecorder | null>(null);
  const controller = useRef<AbortController | null>(null);
  const ticket = useRef<UploadTicket | CreatorMediaUploadTicket | undefined>(
    undefined,
  );
  const uploadKey = useRef<string | undefined>(undefined);
  const pendingUpload = useRef<Promise<void> | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const recordingAction = useRef<HTMLButtonElement | null>(null);
  const restoreRecordingFocus = useRef(false);
  useEffect(() => {
    const action = recordingAction.current;
    if (!restoreRecordingFocus.current || !action || action.disabled) return;
    restoreRecordingFocus.current = false;
    if (
      document.activeElement === document.body &&
      !document.hidden &&
      action.getClientRects().length > 0 &&
      !action.closest(
        '[hidden], [inert], [aria-hidden="true"], dialog:not([open])',
      )
    )
      action.focus();
  }, [discarding, recording.state, upload]);
  useEffect(() => {
    const value = new BrowserRecorder(maxDurationMs, setRecording);
    recorder.current = value;
    const visibility = () => {
      let hidden = document.hidden;
      for (let node = surface.current; node; node = node.parentElement) {
        if (
          node.hidden ||
          node.inert ||
          node.getAttribute("aria-hidden") === "true" ||
          (node instanceof HTMLDialogElement && !node.open)
        ) {
          hidden = true;
          break;
        }
      }
      if (hidden) {
        value.pause(true);
        previewAudio.current?.pause();
      }
    };
    const observer = new MutationObserver(visibility);
    for (let node = surface.current; node; node = node.parentElement) {
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["hidden", "inert", "aria-hidden", "open"],
      });
    }
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
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
    const element = previewAudio.current;
    return () => {
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
    };
  }, [preview]);
  useEffect(() => {
    const abort = new AbortController();
    void mediaRequest<{
      mediaAvailable: boolean;
      creatorMediaAvailable?: boolean;
    }>("capabilities", { signal: abort.signal, expectedAccountId })
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
  }, [objectId, expectedAccountId]);
  useEffect(() => {
    if (
      !asset ||
      !family ||
      (!["quarantined", "processing"].includes(asset.state) &&
        !(
          asset.state === "ready" &&
          asset.signedActId &&
          asset.provenance?.c2paVerified !== true
        ))
    )
      return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await mediaRequest<MediaAsset | CreatorMediaAsset>(
          `${family}/${asset.id}`,
          { signal: abort.signal, expectedAccountId },
        );
        if (!abort.signal.aborted) setAsset(current);
      } catch (error) {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : copy.w6ProcessingIsUnavailable,
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
  }, [asset, family, expectedAccountId]);
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
      (expectedAccountId !== undefined &&
        asset.ownerAccountId !== expectedAccountId) ||
      asset.mimeType !== "audio/mp4"
    ) {
      setError(copy.w6TheProcessedRecordingDoesNotMatchThisSavedContentRefresh);
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
        copy.w6TheProcessedRecordingEvidenceIsUnavailableRefreshBeforeContinuing,
      );
      return;
    }
    notified.current = occurrence;
    onReady(asset, evidence.data);
  }, [
    asset,
    creatorId,
    objectId,
    onReady,
    purpose,
    maxDurationMs,
    expectedAccountId,
  ]);
  async function send() {
    if (!recording.blob || !creatorId || !family || pendingUpload.current)
      return;
    const firstAttempt = uploadKey.current === undefined;
    uploadKey.current ??= crypto.randomUUID();
    const abort = new AbortController();
    controller.current = abort;
    setUpload("uploading");
    setError(null);
    try {
      const common = {
        creatorId,
        expectedAccountId,
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
      // A definitive rejection of the first opening request allocated no
      // ticket. A lost response or any later retry remains unconfirmed.
      if (
        firstAttempt &&
        !ticket.current &&
        e instanceof MediaRequestError &&
        [400, 403, 404, 413, 415, 422].includes(e.status)
      )
        uploadKey.current = undefined;
      setUpload("failed");
      setError(
        abort.signal.aborted
          ? copy.w6UploadPausedRetryToResumeFromTheSavedPosition
          : e instanceof Error
            ? e.message
            : copy.w6UploadFailedYourPreviewIsStillHere,
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
          expectedAccountId,
        });
      } catch {
        setError(copy.w6TheUploadedFileCouldNotBeRemovedTryAgainBefore);
        setDiscarding(false);
        return false;
      }
    }
    if (uploadKey.current && !current) {
      setError(copy.w6TheUploadIsUnconfirmedRetryItToFindAndRemove);
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
    <section
      ref={surface}
      className="w6-recorder"
      aria-labelledby={embedded ? undefined : heading}
      aria-label={embedded ? copy.w6YourOwnVoice : undefined}
    >
      <div className="w6-author">
        {creatorName && (
          <Seal size={28} initial={Array.from(creatorName.trim())[0]} />
        )}
        <span>
          {creatorName
            ? formatCopy("w6RecordAVoiceNoteAs", { value1: creatorName })
            : copy.w6RecordAVoiceNote}
        </span>
      </div>
      {!embedded && <h1 id={heading}>{copy.w6YourOwnVoice}</h1>}
      <p>{copy.w6RecordListenAndSignTheExactRecordingBeforeItIs}</p>
      <div
        className="w6-data"
        aria-label={formatCopy("w6RecordedSeconds", {
          value1: Math.floor(recording.durationMs / 1000),
        })}
      >
        {time}{" "}
        <span className="qv-help">
          {formatCopy("w6OfSeconds", {
            value1: Math.floor(maxDurationMs / 1000),
          })}
        </span>
      </div>
      <div className="w6-actions">
        <button
          ref={recordingAction}
          className={`qv-btn ${active || recording.state === "requesting" ? "qv-btn--secondary" : "qv-btn--maya"}`}
          disabled={actionsDisabled || upload === "uploading" || discarding}
          onClick={(event) => {
            restoreRecordingFocus.current =
              document.activeElement === event.currentTarget;
            if (recording.state === "requesting") recorder.current?.discard();
            else if (recording.state === "recording") recorder.current?.pause();
            else if (recording.state === "paused") recorder.current?.resume();
            else {
              void discard().then((discarded) => {
                if (discarded) void recorder.current?.start();
              });
            }
          }}
        >
          {recording.state === "requesting"
            ? copy.w6CancelPermissionRequest
            : recording.state === "recording"
              ? copy.w6Pause
              : recording.state === "paused"
                ? copy.w6Resume
                : preview
                  ? copy.w6RecordAgain
                  : copy.w6Record}
        </button>
        {active && (
          <button
            className="qv-btn qv-btn--maya"
            onClick={(event) => {
              restoreRecordingFocus.current =
                document.activeElement === event.currentTarget;
              recorder.current?.stop();
            }}
          >
            {copy.w6StopAndPreview}
          </button>
        )}
      </div>
      {preview && (
        <div className="w6-plate">
          <span>{copy.w6PrivatePreviewYourRecording}</span>
          <audio
            key={preview}
            ref={previewAudio}
            controls
            preload="metadata"
            src={preview}
            aria-label={copy.w6PreviewYourOwnRecording}
          />
          <button
            className="qv-btn qv-btn--quiet"
            disabled={actionsDisabled || discarding}
            onClick={(event) => {
              restoreRecordingFocus.current =
                document.activeElement === event.currentTarget;
              void discard();
            }}
          >
            {copy.w6DiscardRecording}
          </button>
        </div>
      )}
      {(recording.reason ||
        error ||
        (asset?.failureCode && asset.state !== "rejected")) && (
        <p className="w6-notice" role="status">
          {error ?? recording.reason ?? copy.w6ProcessingIsUnavailable}
        </p>
      )}
      {upload === "uploading" && (
        <>
          <progress
            max={1}
            value={progress}
            aria-label={copy.w6AudioUploadProgress}
          />
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => controller.current?.abort()}
          >
            {copy.w6PauseUpload}
          </button>
        </>
      )}
      {preview && upload !== "uploading" && !asset && (
        <button
          className="qv-btn qv-btn--maya"
          disabled={actionsDisabled || !available || !family || discarding}
          onClick={() => {
            if (pendingUpload.current) return;
            const work = send();
            pendingUpload.current = work;
            void work.finally(() => {
              if (pendingUpload.current === work) pendingUpload.current = null;
            });
          }}
        >
          {upload === "failed" ? copy.w6RetryUpload : copy.w6UploadRecording}
        </button>
      )}
      {asset && (
        <p role="status">
          {asset.state === "ready"
            ? copy.w6ProcessedReviewAndSignTheExactRecordingInStudio
            : asset.state === "rejected"
              ? copy.w6ThisFileCouldNotBeProcessedRecordAgain
              : copy.w6UploadedProcessingBeforeSharing}
        </p>
      )}
      {asset?.state === "ready" &&
        creatorId &&
        objectId &&
        "objectId" in asset && (
          <CreatorVoicePlayer
            asset={asset}
            creatorId={creatorId}
            expectedAccountId={expectedAccountId}
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
              expectedAccountId={expectedAccountId}
              fanId={fanId}
              creatorName={creatorName ?? "the creator"}
            />
            <SignRecording
              asset={asset}
              creatorId={creatorId}
              expectedAccountId={expectedAccountId}
              fanId={fanId}
              onSigned={setAsset}
              disabled={actionsDisabled}
            />
          </>
        )}
      {(!available || !family) && (
        <p className="qv-help">
          {copy.w6UploadsAndSigningAreUnavailableYourPreviewStaysOnThisDevice}
        </p>
      )}
    </section>
  );
}
