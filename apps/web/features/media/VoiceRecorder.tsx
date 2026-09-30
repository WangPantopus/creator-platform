"use client";
import { useEffect, useRef, useState } from "react";
import { Seal } from "@qelvora/ui-web";
import {
  VoiceRecorder as BrowserRecorder,
  type RecordingSnapshot,
} from "./recorder";
import { mediaRequest, uploadRecording } from "./api";
import type {
  MediaAsset,
  UploadTicket,
} from "../../../../packages/api/src/media";
import "./media.css";
import { SignRecording } from "./SignRecording";
import { VoicePlayer } from "./VoicePlayer";

export function VoiceRecording({
  creatorId,
  fanId,
  creatorName,
  purpose = "human_note",
  maxDurationMs,
}: {
  creatorId?: string;
  fanId?: string;
  creatorName?: string;
  purpose?: "human_note" | "human_reply";
  maxDurationMs: number;
}) {
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
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [available, setAvailable] = useState(false);
  const recorder = useRef<BrowserRecorder | null>(null);
  const controller = useRef<AbortController | null>(null);
  const ticket = useRef<UploadTicket | undefined>(undefined);
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
    void mediaRequest<{ mediaAvailable: boolean }>("capabilities")
      .then((value) => setAvailable(value.mediaAvailable))
      .catch(() => setAvailable(false));
  }, []);
  useEffect(() => {
    if (
      !asset ||
      !creatorId ||
      !fanId ||
      !["quarantined", "processing"].includes(asset.state)
    )
      return;
    const timer = setInterval(() => {
      void mediaRequest<MediaAsset>(
        `threads/${creatorId}/${fanId}/media/${asset.id}`,
      )
        .then(setAsset)
        .catch((e) =>
          setError(
            e instanceof Error ? e.message : "Processing is unavailable.",
          ),
        );
    }, 2000);
    return () => clearInterval(timer);
  }, [asset, creatorId, fanId]);
  async function send() {
    if (!recording.blob || !creatorId || !fanId) return;
    const abort = new AbortController();
    controller.current = abort;
    setUpload("uploading");
    setError(null);
    try {
      const result = await uploadRecording({
        creatorId,
        fanId,
        purpose,
        blob: recording.blob,
        durationMs: Math.round(recording.durationMs),
        signal: abort.signal,
        progress: setProgress,
        resumed: ticket.current,
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
    controller.current?.abort();
    const current = ticket.current;
    if (current && creatorId && fanId) {
      try {
        await mediaRequest(
          `threads/${creatorId}/${fanId}/media/${current.asset.id}`,
          { method: "DELETE" },
        );
      } catch {
        setError(
          "The uploaded file could not be removed. Try again before discarding.",
        );
        return;
      }
    }
    ticket.current = undefined;
    recorder.current?.discard();
    setAsset(null);
    setUpload("idle");
    setError(null);
  }
  const active = ["recording", "paused"].includes(recording.state);
  const time = `${Math.floor(recording.durationMs / 60_000)}:${String(Math.floor(recording.durationMs / 1000) % 60).padStart(2, "0")}`;
  return (
    <section className="w6-recorder" aria-labelledby="voice-heading">
      <div className="w6-author">
        {creatorName && <Seal size={28} />}
        <span>
          {creatorName
            ? `Record a voice note as ${creatorName}`
            : "Record a voice note"}
        </span>
      </div>
      <h1 id="voice-heading">Your own voice</h1>
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
            onClick={() => {
              void discard().then(() => {
                if (!ticket.current) void recorder.current?.start();
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
          disabled={!available || !creatorId || !fanId}
          onClick={() => {
            void send();
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
      {asset?.state === "ready" && creatorId && fanId && (
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
      {(!available || !creatorId || !fanId) && (
        <p className="qv-help">
          Sign in to a configured creator account to upload and sign. Your
          preview stays on this device until you upload it.
        </p>
      )}
    </section>
  );
}
