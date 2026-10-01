"use client";
import { useEffect, useRef, useState } from "react";
import { AuthorLabel, SignedMarker } from "@qelvora/ui-web";
import type {
  MediaAsset,
  PlaybackTicket,
  CreatorMediaAsset,
  CreatorMediaPlaybackTicket,
} from "../../../../packages/api/src/media";
import { mediaRequest } from "./api";
import "./media.css";

type VoicePlayerProps = {
  asset: MediaAsset;
  creatorId: string;
  fanId: string;
  creatorName: string;
  transcript?: string;
  /** W3/W5 supply the persisted publication time; the player never invents it. */
  time?: string;
  /** Optional current-account precondition; never supplies W1 authority. */
  expectedAccountId?: string;
};
export function VoicePlayer(props: VoicePlayerProps) {
  const family = `threads/${props.creatorId}/${props.fanId}/media`;
  return (
    <Player
      key={`${props.expectedAccountId ?? ""}/${family}/${props.asset.id}/${props.asset.version}/${props.asset.sha256}`}
      {...props}
      family={family}
    />
  );
}
export function CreatorVoicePlayer(
  props: Omit<VoicePlayerProps, "asset" | "fanId"> & {
    asset: CreatorMediaAsset;
    objectId: string;
    /** Present only for an actual W1-authorized audience thread. */
    fanId?: string;
    /** Actual authenticated W5 content audience; W1 resolves its real fan profile. */
    audience?: boolean;
  },
) {
  const family =
    props.audience === true
      ? `creators/${props.creatorId}/audience-media`
      : props.fanId
        ? `threads/${props.creatorId}/${props.fanId}/creator-media`
        : `creators/${props.creatorId}/media`;
  if (
    props.asset.creatorId !== props.creatorId ||
    props.asset.objectId !== props.objectId ||
    !["human_note", "post_audio"].includes(props.asset.purpose) ||
    props.asset.state !== "ready" ||
    props.asset.mimeType !== "audio/mp4"
  )
    return (
      <p role="status">
        This recording is unavailable for the current content.
      </p>
    );
  return (
    <Player
      key={`${props.expectedAccountId ?? ""}/${family}/${props.objectId}/${props.asset.id}/${props.asset.version}/${props.asset.sha256}`}
      {...props}
      family={family}
    />
  );
}
function Player({
  asset,
  creatorName,
  transcript,
  time,
  family,
  expectedAccountId,
}: {
  asset: MediaAsset | CreatorMediaAsset;
  creatorName: string;
  transcript?: string;
  time?: string;
  family: string;
  expectedAccountId?: string;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const surface = useRef<HTMLElement | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
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
  useEffect(
    () => () => {
      loadRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!src) return;
    const element = audio.current;
    const visibility = () => {
      let hidden = document.hidden;
      for (let node = surface.current; node; node = node.parentElement)
        if (
          node.hidden ||
          node.inert ||
          node.getAttribute("aria-hidden") === "true" ||
          (node instanceof HTMLDialogElement && !node.open)
        ) {
          hidden = true;
          break;
        }
      if (hidden) element?.pause();
    };
    const observer = new MutationObserver(visibility);
    for (let node = surface.current; node; node = node.parentElement)
      observer.observe(node, {
        attributes: true,
        attributeFilter: ["hidden", "inert", "aria-hidden", "open"],
      });
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const abort = new AbortController();
    let checking = false;
    const timer = setInterval(() => {
      if (checking) return;
      checking = true;
      void mediaRequest<MediaAsset | CreatorMediaAsset>(
        `${family}/${asset.id}`,
        {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(1000)]),
          ...(expectedAccountId
            ? { headers: { "x-qelvora-expected-account": expectedAccountId } }
            : {}),
        },
      )
        .then((current) => {
          if (
            current.id !== asset.id ||
            current.version !== asset.version ||
            current.sha256 !== asset.sha256 ||
            current.state !== "ready"
          )
            throw new Error(
              "This recording changed or is no longer available.",
            );
        })
        .catch(() => {
          if (abort.signal.aborted) return;
          audio.current?.pause();
          setSrc(null);
          setPlaying(false);
          setError(
            "Audio access could not be confirmed. Refresh the link to try again.",
          );
        })
        .finally(() => {
          checking = false;
        });
    }, 1000);
    return () => {
      abort.abort();
      clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      // A removed audio element can keep playing. Retain the exact element
      // so source changes and authority-driven unmounts stop its bytes too.
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
    };
  }, [src, family, asset.id, asset.version, asset.sha256, expectedAccountId]);
  async function load() {
    if (loadRequest.current) return;
    const abort = new AbortController();
    loadRequest.current = abort;
    setLoading(true);
    try {
      const ticket = await mediaRequest<
        PlaybackTicket | CreatorMediaPlaybackTicket
      >(`${family}/${asset.id}/playback`, {
        method: "POST",
        body: "{}",
        signal: abort.signal,
        ...(expectedAccountId
          ? { headers: { "x-qelvora-expected-account": expectedAccountId } }
          : {}),
      });
      const url = new URL(ticket.url);
      // Same-origin HTTP-only cookie bridge; never a bearer token in a URL.
      const path = `${family}/${asset.id}/play`;
      if (
        url.pathname !== `/v1/w6/${path}` ||
        ticket.asset.id !== asset.id ||
        ticket.asset.version !== asset.version ||
        ticket.asset.sha256 !== asset.sha256 ||
        !url.searchParams.has("ticket") ||
        [...url.searchParams.keys()].some((name) => name !== "ticket")
      )
        throw new Error("The playback link is unavailable for this recording.");
      if (abort.signal.aborted) return;
      audio.current?.pause();
      setPlaying(false);
      if (expectedAccountId)
        url.searchParams.set("expectedAccountId", expectedAccountId);
      setSrc(`/api/w6/${path}${url.search}`);
      setPosition(0);
      setError(null);
    } catch (error) {
      if (!abort.signal.aborted)
        setError(
          error instanceof Error ? error.message : "Audio is unavailable.",
        );
    } finally {
      if (!abort.signal.aborted) setLoading(false);
      if (loadRequest.current === abort) loadRequest.current = null;
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
      ref={surface}
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
            key={src}
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
