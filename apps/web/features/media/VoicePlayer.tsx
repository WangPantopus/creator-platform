"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthorLabel, SignedMarker } from "@qelvora/ui-web";
import type {
  MediaAsset,
  PlaybackTicket,
  CreatorMediaAsset,
  CreatorMediaPlaybackTicket,
  PlaybackFile,
} from "../../../../packages/api/src/media";
import {
  CreatorMediaAssetSchema,
  MediaAssetSchema,
  CreatorMediaPlaybackTicketSchema,
  PlaybackTicketSchema,
} from "../../../../packages/api/src/media";
import { mediaRequest } from "./api";
import {
  playbackDeadline,
  playbackUnexpired,
  type PlaybackDeadline,
} from "./playback-deadline";
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
        {copy.w6ThisRecordingIsUnavailableForTheCurrentContent}
      </p>
    );
  return (
    <Player
      key={`${props.expectedAccountId ?? ""}/${family}/${props.objectId}/${props.asset.id}/${props.asset.version}/${props.asset.sha256}`}
      {...props}
      family={family}
      requireCredentialed={props.audience === true || !!props.fanId}
    />
  );
}
function recordingMatches(
  current: MediaAsset | CreatorMediaAsset,
  asset: MediaAsset | CreatorMediaAsset,
  proof: PlaybackFile,
  requireCredentialed: boolean,
) {
  if (
    current.id !== asset.id ||
    current.version !== asset.version ||
    current.sha256 !== asset.sha256 ||
    current.state !== "ready" ||
    current.purpose !== asset.purpose ||
    current.bytes !== asset.bytes ||
    current.mimeType !== asset.mimeType ||
    current.durationMs !== asset.durationMs ||
    current.signedActId !== asset.signedActId ||
    current.expiresAt !== asset.expiresAt ||
    !Number.isFinite(Date.parse(current.expiresAt)) ||
    Date.parse(current.expiresAt) <= Date.now()
  )
    return false;
  if ("creatorId" in asset) {
    if (
      !("creatorId" in current) ||
      current.creatorId !== asset.creatorId ||
      current.objectId !== asset.objectId ||
      current.ownerAccountId !== asset.ownerAccountId
    )
      return false;
  } else if (!("threadId" in current) || current.threadId !== asset.threadId)
    return false;
  if (proof.variant === "processed")
    return (
      !requireCredentialed &&
      current.provenance?.c2paVerified !== true &&
      proof.sha256 === current.sha256 &&
      proof.bytes === current.bytes
    );
  const original = asset.provenance,
    value = current.provenance;
  return (
    value?.c2paVerified === true &&
    original?.c2paVerified === true &&
    value.fileVariant === "credentialed" &&
    value.fileSha256 === proof.sha256 &&
    value.fileBytes === proof.bytes &&
    [
      "schemaVersion",
      "kind",
      "transform",
      "assetId",
      "assetVersion",
      "creatorId",
      "objectId",
      "threadId",
      "fanId",
      "accountId",
      "signedActId",
      "processedMediaSha256",
      "processedMediaBytes",
      "processedMediaMimeType",
      "processedMediaDurationMs",
    ].every((key) => value[key] === original[key])
  );
}

function Player({
  asset,
  creatorName,
  transcript,
  time,
  family,
  expectedAccountId,
  requireCredentialed = false,
}: {
  asset: MediaAsset | CreatorMediaAsset;
  creatorName: string;
  transcript?: string;
  time?: string;
  family: string;
  expectedAccountId?: string;
  requireCredentialed?: boolean;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const surface = useRef<HTMLElement | null>(null);
  const loadRequest = useRef<AbortController | null>(null);
  const playbackFile = useRef<PlaybackFile | null>(null);
  const loadedAsset = useRef<MediaAsset | CreatorMediaAsset | null>(null);
  const deadline = useRef<PlaybackDeadline | null>(null);
  const checkedAt = useRef(0);
  const revision = useRef(0);
  const commandRequest = useRef<AbortController | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [commanding, setCommanding] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState((asset.durationMs ?? 0) / 1000);
  const ai = asset.purpose === "ai_audio";
  const label = ai
    ? formatCopy("w6SAIAudio", { value1: creatorName })
    : formatCopy("w6SRecording", { value1: creatorName });
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
  const discard = useCallback((message: string) => {
    ++revision.current;
    loadRequest.current?.abort();
    loadRequest.current = null;
    commandRequest.current?.abort();
    commandRequest.current = null;
    audio.current?.pause();
    audio.current?.removeAttribute("src");
    audio.current?.load();
    playbackFile.current = null;
    loadedAsset.current = null;
    deadline.current = null;
    checkedAt.current = 0;
    setSrc(null);
    setPlaying(false);
    setPrepared(false);
    setPosition(0);
    setLoading(false);
    setCommanding(false);
    setError(message);
  }, []);
  const currentSurface = () => {
    if (document.hidden) return false;
    for (let node = surface.current; node; node = node.parentElement)
      if (
        node.hidden ||
        node.inert ||
        node.getAttribute("aria-hidden") === "true" ||
        (node instanceof HTMLDialogElement && !node.open)
      )
        return false;
    return surface.current !== null;
  };
  useEffect(
    () => () => {
      ++revision.current;
      loadRequest.current?.abort();
      commandRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!src) return;
    const element = audio.current;
    const proof = playbackFile.current;
    const expected = loadedAsset.current;
    const lifetime = deadline.current;
    const attempt = revision.current;
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
      if (hidden) element?.pause();
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
    const abort = new AbortController();
    let checking = false;
    const expiry = setInterval(() => {
      if (
        attempt === revision.current &&
        (!playbackUnexpired(lifetime) ||
          performance.now() - checkedAt.current >= 5000)
      )
        discard(copy.w6TheAudioLinkExpiredOrAccessChangedRefreshItTo);
    }, 500);
    const timer = setInterval(() => {
      if (checking) return;
      checking = true;
      const started = performance.now();
      void mediaRequest<MediaAsset | CreatorMediaAsset>(
        `${family}/${asset.id}`,
        {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(1000)]),
          ...(expectedAccountId
            ? { headers: { "x-qelvora-expected-account": expectedAccountId } }
            : {}),
        },
      )
        .then((raw) => {
          if (abort.signal.aborted || attempt !== revision.current) return;
          const current =
            expected && "creatorId" in expected
              ? CreatorMediaAssetSchema.parse(raw)
              : MediaAssetSchema.parse(raw);
          if (
            !proof ||
            !expected ||
            !recordingMatches(current, expected, proof, requireCredentialed) ||
            !playbackUnexpired(lifetime) ||
            performance.now() - started >= 5000
          )
            throw new Error(copy.w6ThisRecordingChangedOrIsNoLongerAvailable);
          checkedAt.current = started;
        })
        .catch(() => {
          if (abort.signal.aborted || attempt !== revision.current) return;
          discard(copy.w6AudioAccessCouldNotBeConfirmedRefreshTheLinkTo);
        })
        .finally(() => {
          checking = false;
        });
    }, 1000);
    return () => {
      abort.abort();
      clearInterval(timer);
      clearInterval(expiry);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      // A removed audio element can keep playing. Retain the exact element
      // so source changes and authority-driven unmounts stop its bytes too.
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
      if (playbackFile.current === proof) playbackFile.current = null;
    };
  }, [
    src,
    family,
    asset.id,
    asset.version,
    asset.sha256,
    expectedAccountId,
    requireCredentialed,
    discard,
  ]);
  async function load() {
    if (loadRequest.current) return;
    discard("");
    const attempt = revision.current,
      started = performance.now();
    const abort = new AbortController();
    loadRequest.current = abort;
    setLoading(true);
    try {
      const raw = await mediaRequest<
        PlaybackTicket | CreatorMediaPlaybackTicket
      >(`${family}/${asset.id}/playback`, {
        method: "POST",
        body: "{}",
        signal: abort.signal,
        ...(expectedAccountId
          ? { headers: { "x-qelvora-expected-account": expectedAccountId } }
          : {}),
      });
      const ticket =
        "creatorId" in asset
          ? CreatorMediaPlaybackTicketSchema.parse(raw)
          : PlaybackTicketSchema.parse(raw);
      const url = new URL(ticket.url);
      const proof = ticket.playbackFile;
      const lifetime = playbackDeadline(
        ticket.expiresAt,
        ticket.asset.expiresAt,
      );
      // Same-origin HTTP-only cookie bridge; never a bearer token in a URL.
      const path = `${family}/${asset.id}/play`;
      if (
        url.pathname !== `/v1/w6/${path}` ||
        ticket.asset.id !== asset.id ||
        ticket.asset.version !== asset.version ||
        ticket.asset.sha256 !== asset.sha256 ||
        ticket.asset.bytes !== asset.bytes ||
        ticket.asset.mimeType !== asset.mimeType ||
        ticket.asset.durationMs !== asset.durationMs ||
        !recordingMatches(ticket.asset, asset, proof, requireCredentialed) ||
        !Number.isFinite(Date.parse(ticket.expiresAt)) ||
        Date.parse(ticket.expiresAt) <= Date.now() ||
        (requireCredentialed &&
          (proof.variant !== "credentialed" ||
            asset.provenance?.c2paVerified !== true ||
            asset.provenance.fileVariant !== "credentialed" ||
            asset.provenance.fileSha256 !== proof.sha256 ||
            asset.provenance.fileBytes !== proof.bytes)) ||
        (proof.variant === "processed"
          ? proof.sha256 !== ticket.asset.sha256 ||
            proof.bytes !== ticket.asset.bytes ||
            ticket.asset.provenance?.c2paVerified === true
          : ticket.asset.provenance?.c2paVerified !== true ||
            ticket.asset.provenance.fileVariant !== "credentialed" ||
            ticket.asset.provenance.fileSha256 !== proof.sha256 ||
            ticket.asset.provenance.fileBytes !== proof.bytes) ||
        !url.searchParams.get("ticket") ||
        url.username !== "" ||
        url.password !== "" ||
        url.hash !== "" ||
        [...url.searchParams.keys()].length !== 1 ||
        [...url.searchParams.keys()].some((name) => name !== "ticket")
      )
        throw new Error("The playback link is unavailable for this recording.");
      if (abort.signal.aborted || attempt !== revision.current) return;
      if (!playbackUnexpired(lifetime) || performance.now() - started >= 5000)
        throw new Error(copy.w6TheAudioLinkExpiredOrAccessChangedRefreshItTo);
      audio.current?.pause();
      setPlaying(false);
      if (expectedAccountId)
        url.searchParams.set("expectedAccountId", expectedAccountId);
      playbackFile.current = proof;
      loadedAsset.current = ticket.asset;
      deadline.current = lifetime;
      checkedAt.current = started;
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
  async function command(seek?: number) {
    if (commandRequest.current || loading || !currentSurface()) return;
    if (!src) {
      if (seek === undefined) await load();
      return;
    }
    const element = audio.current;
    if (!element) return;
    const proof = playbackFile.current,
      expected = loadedAsset.current,
      lifetime = deadline.current,
      attempt = revision.current;
    const abort = new AbortController();
    commandRequest.current = abort;
    setCommanding(true);
    try {
      const started = performance.now();
      const raw = await mediaRequest<MediaAsset | CreatorMediaAsset>(
        `${family}/${asset.id}`,
        {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(1000)]),
          expectedAccountId,
        },
      );
      const actual =
        expected && "creatorId" in expected
          ? CreatorMediaAssetSchema.parse(raw)
          : MediaAssetSchema.parse(raw);
      if (
        abort.signal.aborted ||
        attempt !== revision.current ||
        audio.current !== element
      )
        return;
      if (
        !proof ||
        !expected ||
        !recordingMatches(actual, expected, proof, requireCredentialed) ||
        !playbackUnexpired(lifetime) ||
        performance.now() - started >= 5000 ||
        !currentSurface()
      )
        throw new Error(copy.w6AudioAccessCouldNotBeConfirmedRefreshTheLinkTo);
      checkedAt.current = started;
      if (seek !== undefined) {
        const end = Math.min(element.duration, (actual.durationMs ?? 0) / 1000);
        if (!Number.isFinite(seek) || !Number.isFinite(end) || end <= 0)
          throw new Error(copy.w6PlaybackCouldNotStartTryAgain);
        element.currentTime = Math.min(end, Math.max(0, seek));
        setPosition(element.currentTime);
      } else if (!element.paused) element.pause();
      else {
        await element.play();
        if (
          abort.signal.aborted ||
          attempt !== revision.current ||
          audio.current !== element ||
          !playbackUnexpired(lifetime) ||
          !currentSurface()
        ) {
          element.pause();
          if (attempt === revision.current)
            discard(copy.w6AudioAccessCouldNotBeConfirmedRefreshTheLinkTo);
        }
      }
    } catch {
      if (!abort.signal.aborted && attempt === revision.current)
        discard(copy.w6AudioAccessCouldNotBeConfirmedRefreshTheLinkTo);
    } finally {
      if (commandRequest.current === abort) {
        commandRequest.current = null;
        setCommanding(false);
      }
    }
  }
  return (
    <article
      ref={surface}
      className="qv w6-voice-player"
      aria-label={
        ai
          ? formatCopy("w6SAIVoiceNote", { value1: creatorName })
          : formatCopy("w6RecordedBy", { value1: creatorName })
      }
    >
      {ai && <AuthorLabel kind="ai" name={creatorName} time={time} />}
      <div
        className={`qv-voicenote ${ai ? "qv-voicenote--ai" : "qv-voicenote--human qv-on-maya"}`}
      >
        {ai ? (
          <span className="qv-tag w6-ai-voice-label">
            {formatCopy("w6AIVoiceOpensWithSAI", { value1: creatorName })}
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
            disabled={loading || commanding}
            aria-label={
              loading
                ? copy.w6LoadingAudio
                : !src
                  ? copy.w6LoadVoiceNote
                  : playing
                    ? copy.w6PauseVoiceNote
                    : copy.w6PlayVoiceNote
            }
            onClick={() => {
              void command();
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
        {src && prepared && duration > 0 && (
          <label className="w6-audio-seek">
            <span className="w6-sr-only">
              {formatCopy("w6SeekIn", { value1: label })}
            </span>
            <input
              type="range"
              min="0"
              max={duration}
              step="0.1"
              disabled={loading || commanding}
              value={Math.min(position, duration)}
              aria-valuetext={formatCopy("w6TimeOfDuration", {
                value1: elapsed(position),
                value2: elapsed(duration),
              })}
              onChange={(event) => {
                const next = Number(event.target.value);
                void command(next);
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
              if (event.currentTarget !== audio.current) return;
              const end = Math.min(
                event.currentTarget.duration,
                (loadedAsset.current?.durationMs ?? 0) / 1000,
              );
              if (
                !playbackUnexpired(deadline.current) ||
                !Number.isFinite(end) ||
                end <= 0
              )
                discard(copy.w6TheAudioLinkExpiredOrAccessChangedRefreshItTo);
              else {
                setDuration(end);
                setPrepared(true);
              }
            }}
            onTimeUpdate={(event) => {
              const element = event.currentTarget;
              if (element !== audio.current) return;
              if (!playbackUnexpired(deadline.current)) {
                discard(copy.w6TheAudioLinkExpiredOrAccessChangedRefreshItTo);
                return;
              }
              const end = Math.min(
                element.duration,
                (loadedAsset.current?.durationMs ?? 0) / 1000,
              );
              if (Number.isFinite(end) && element.currentTime >= end)
                element.pause();
              setPosition(Math.min(duration, Math.max(0, element.currentTime)));
            }}
            onPlay={(event) => {
              if (event.currentTarget !== audio.current) return;
              if (
                !playbackUnexpired(deadline.current) ||
                performance.now() - checkedAt.current >= 5000 ||
                !currentSurface()
              )
                discard(copy.w6AudioAccessCouldNotBeConfirmedRefreshTheLinkTo);
              else setPlaying(true);
            }}
            onPause={(event) => {
              if (event.currentTarget === audio.current) setPlaying(false);
            }}
            onEnded={(event) => {
              if (event.currentTarget === audio.current) setPlaying(false);
            }}
            onError={(event) => {
              if (
                event.currentTarget === audio.current &&
                playbackFile.current !== null
              )
                discard(copy.w6TheAudioLinkExpiredOrAccessChangedRefreshItTo);
            }}
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
              {copy.w6RefreshAudioLink}
            </button>
          </>
        )}
        {transcript ? (
          <details className="qv-voicenote__transcript">
            <summary>{copy.w6ReadTranscript}</summary>
            <p>{transcript}</p>
          </details>
        ) : null}
        {!ai && asset.signedActId && (
          <SignedMarker
            name={creatorName}
            extra={formatCopy("w6RecordedBy", { value1: creatorName })}
            href={`/verify/${asset.signedActId}`}
          />
        )}
      </div>
    </article>
  );
}
