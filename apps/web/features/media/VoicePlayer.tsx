"use client";
import { useRef, useState } from "react";
import { AuthorLabel, SignedMarker } from "@qelvora/ui-web";
import type {
  MediaAsset,
  PlaybackTicket,
} from "../../../../packages/api/src/media";
import { mediaRequest } from "./api";
import "./media.css";

export function VoicePlayer({
  asset,
  creatorId,
  fanId,
  creatorName,
  transcript,
  time,
}: {
  asset: MediaAsset;
  creatorId: string;
  fanId: string;
  creatorName: string;
  transcript?: string;
  /** W3/W5 supply the persisted publication time; the player never invents it. */
  time?: string;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState((asset.durationMs ?? 0) / 1000);
  const ai = asset.purpose === "ai_audio";
  const label = ai ? `${creatorName}'s AI audio` : `${creatorName}'s recording`;
  const peaks = Array.from(
    { length: Math.min(26, asset.waveform.length) },
    (_, index) => {
      const step = asset.waveform.length / Math.min(26, asset.waveform.length);
      return Math.max(
        ...asset.waveform.slice(
          Math.floor(index * step),
          Math.ceil((index + 1) * step),
        ),
      );
    },
  );
  const elapsed = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;
  async function load() {
    setLoading(true);
    try {
      const ticket = await mediaRequest<PlaybackTicket>(
        `threads/${creatorId}/${fanId}/media/${asset.id}/playback`,
        { method: "POST", body: "{}" },
      );
      const url = new URL(ticket.url);
      // Authenticated audio uses the same-origin HTTP-only cookie bridge, never a bearer token in a URL.
      const path = url.pathname.replace(/^\/v1\/w6\//u, "");
      if (
        !path.startsWith(`threads/${creatorId}/${fanId}/media/${asset.id}/play`)
      )
        throw new Error("The playback link is unavailable.");
      setSrc(`/api/w6/${path}${url.search}`);
      setPosition(0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio is unavailable.");
    } finally {
      setLoading(false);
    }
  }
  async function toggle() {
    if (!src) {
      await load();
      return;
    }
    const element = audio.current;
    if (!element) return;
    if (!element.paused) element.pause();
    else
      try {
        await element.play();
      } catch {
        setError("Playback could not start. Try again.");
      }
  }
  return (
    <article
      className="qv w6-voice-player"
      aria-label={
        ai ? `${creatorName}'s AI voice note` : `Recorded by ${creatorName}`
      }
    >
      {ai && <AuthorLabel kind="ai" name={creatorName} time={time} />}
      <div
        className={`qv-voicenote ${ai ? "qv-voicenote--ai" : "qv-voicenote--human qv-on-maya"}`}
      >
        {ai ? (
          <span className="qv-tag w6-ai-voice-label">
            AI voice · opens with “{creatorName}’s AI”
          </span>
        ) : (
          <AuthorLabel
            kind="human_creator"
            name={creatorName}
            time={time}
            onMaya
          />
        )}
        <div className="qv-voicenote__row">
          <button
            className="qv-voicenote__play"
            disabled={loading}
            aria-label={
              loading
                ? "Loading audio"
                : !src
                  ? "Load voice note"
                  : playing
                    ? "Pause voice note"
                    : "Play voice note"
            }
            onClick={() => {
              void toggle();
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              aria-hidden="true"
            >
              {playing ? (
                <path d="M4 3h3v10H4zm5 0h3v10H9z" />
              ) : (
                <path d="M5 3l8 5-8 5z" />
              )}
            </svg>
          </button>
          <div className="qv-wave w6-waveform" aria-hidden="true">
            {peaks.map((peak, index) => (
              <i
                key={index}
                style={{
                  height: Math.max(2, peak * 28),
                  opacity:
                    duration && index / peaks.length <= position / duration
                      ? 1
                      : 0.55,
                }}
              />
            ))}
          </div>
          <span className="qv-mono w6-audio-time">
            {elapsed(playing || position ? position : duration)}
          </span>
        </div>
        {src && duration > 0 && (
          <label className="w6-audio-seek">
            <span className="w6-sr-only">Seek in {label}</span>
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              value={Math.min(position, duration)}
              aria-valuetext={`${elapsed(position)} of ${elapsed(duration)}`}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (audio.current) audio.current.currentTime = next;
                setPosition(next);
              }}
            />
          </label>
        )}
        {src && (
          <audio
            ref={audio}
            preload="metadata"
            src={src}
            onLoadedMetadata={(event) => {
              if (Number.isFinite(event.currentTarget.duration))
                setDuration(event.currentTarget.duration);
            }}
            onTimeUpdate={(event) =>
              setPosition(event.currentTarget.currentTime)
            }
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() =>
              setError(
                "The audio link expired or access changed. Refresh it to try again.",
              )
            }
          />
        )}
        {error && (
          <>
            <p className="qv-help" role="status">
              {error}
            </p>
            <button
              className="qv-btn qv-btn--secondary"
              disabled={loading}
              onClick={() => {
                void load();
              }}
            >
              Refresh audio link
            </button>
          </>
        )}
        {transcript ? (
          <details className="qv-voicenote__transcript">
            <summary>Read transcript</summary>
            <p>{transcript}</p>
          </details>
        ) : null}
        {!ai && asset.signedActId && (
          <SignedMarker
            name={creatorName}
            extra={`Recorded by ${creatorName}`}
            href={`/verify/${asset.signedActId}`}
          />
        )}
      </div>
    </article>
  );
}
