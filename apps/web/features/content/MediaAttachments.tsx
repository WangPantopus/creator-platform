"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentView } from "../../../../packages/api/src/content";
import {
  CreatorMediaAssetSchema,
  CreatorMediaPlaybackTicketSchema,
  type CreatorMediaAsset,
  type PlaybackFile,
} from "../../../../packages/api/src/media";
import { mediaRequest } from "../media/api";
import { CreatorVoicePlayer } from "../media/VoicePlayer";

type Attachment = ContentView["document"]["media"][number];
export function ContentAttachments({
  content,
  active,
  expectedAccountId,
}: {
  content: ContentView;
  active: boolean;
  expectedAccountId: string;
}) {
  return (
    <section aria-label="Content attachments">
      {content.document.media.map((attachment) => (
        <CurrentAttachment
          key={`${attachment.assetId}:${attachment.version}:${attachment.sha256}`}
          content={content}
          attachment={attachment}
          active={active}
          expectedAccountId={expectedAccountId}
        />
      ))}
    </section>
  );
}
function CurrentAttachment({
  content,
  attachment,
  active,
  expectedAccountId,
}: {
  content: ContentView;
  attachment: Attachment;
  active: boolean;
  expectedAccountId: string;
}) {
  const [asset, setAsset] = useState<CreatorMediaAsset | null>(null),
    [photo, setPhoto] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const generation = useRef(0),
    checkedAt = useRef(0),
    photoProof = useRef<PlaybackFile | null>(null),
    photoRequest = useRef<AbortController | null>(null);
  const family = `creators/${content.creatorId}/audience-media`;
  const matches = useCallback(
    (value: CreatorMediaAsset) =>
      value.id === attachment.assetId &&
      value.version === attachment.version &&
      value.sha256 === attachment.sha256 &&
      value.creatorId === content.creatorId &&
      value.objectId === content.id &&
      value.state === "ready" &&
      value.bytes > 0 &&
      value.provenance?.c2paVerified === true &&
      value.provenance.assetId === value.id &&
      value.provenance.assetVersion === value.version &&
      value.provenance.creatorId === value.creatorId &&
      value.provenance.objectId === value.objectId &&
      value.provenance.accountId === value.ownerAccountId &&
      value.signedActId !== null &&
      value.provenance.signedActId === value.signedActId &&
      value.provenance.processedMediaSha256 === attachment.sha256 &&
      value.provenance.processedMediaBytes === value.bytes &&
      value.provenance.processedMediaMimeType === value.mimeType &&
      value.provenance.processedMediaDurationMs === value.durationMs &&
      (attachment.kind === "photo"
        ? value.purpose === "post_photo" && value.mimeType === "image/png"
        : value.mimeType === "audio/mp4" &&
          value.purpose ===
            (content.document.kind === "note" ? "human_note" : "post_audio")),
    [
      attachment.assetId,
      attachment.version,
      attachment.sha256,
      attachment.kind,
      content.creatorId,
      content.id,
      content.document.kind,
    ],
  );
  useEffect(() => {
    const revision = ++generation.current;
    setAsset(null);
    setPhoto(null);
    photoProof.current = null;
    setError("");
    setBusy(false);
    if (!active) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const expiry = setInterval(() => {
      if (performance.now() - checkedAt.current >= 5000) {
        setAsset(null);
        setPhoto(null);
        photoProof.current = null;
      }
    }, 500);
    const read = async () => {
      const started = performance.now();
      try {
        const capability = await mediaRequest<{
          creatorMediaAudienceAvailable?: boolean;
        }>("capabilities", {
          headers: { "x-qelvora-expected-account": expectedAccountId },
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(2000)]),
        });
        if (capability.creatorMediaAudienceAvailable !== true)
          throw new Error(
            "Attachments are awaiting the current media and audience services.",
          );
        const value = CreatorMediaAssetSchema.parse(
          await mediaRequest(`${family}/${attachment.assetId}`, {
            headers: { "x-qelvora-expected-account": expectedAccountId },
            signal: AbortSignal.any([abort.signal, AbortSignal.timeout(2000)]),
          }),
        );
        if (!matches(value))
          throw new Error(
            "This attachment is unavailable for the current publication.",
          );
        if (!abort.signal.aborted && revision === generation.current) {
          checkedAt.current = started;
          if (performance.now() - started >= 5000)
            throw new Error(
              "Check current attachment access before continuing.",
            );
          setAsset(value);
          const proof = photoProof.current;
          if (
            proof &&
            (value.provenance?.fileVariant !== proof.variant ||
              value.provenance.fileSha256 !== proof.sha256 ||
              value.provenance.fileBytes !== proof.bytes)
          ) {
            setPhoto(null);
            photoProof.current = null;
          }
          setError("");
        }
      } catch (failure) {
        if (!abort.signal.aborted && revision === generation.current) {
          setAsset(null);
          setPhoto(null);
          photoProof.current = null;
          setError(
            failure instanceof Error
              ? failure.message
              : "Attachment access could not be confirmed.",
          );
        }
      } finally {
        if (!abort.signal.aborted) timer = setTimeout(() => void read(), 2000);
      }
    };
    void read();
    return () => {
      ++generation.current;
      abort.abort();
      clearTimeout(timer);
      clearInterval(expiry);
      photoRequest.current?.abort();
    };
    // The immutable content occurrence keys this component; retries always read
    // the actual W1 audience, never a fan ID or fabricated conversation.
  }, [
    active,
    expectedAccountId,
    family,
    attachment.assetId,
    attachment.version,
    attachment.sha256,
    content.id,
    content.version,
    matches,
  ]);
  const loadPhoto = async () => {
    if (!asset || photoRequest.current) return;
    const abort = new AbortController(),
      revision = generation.current;
    photoRequest.current = abort;
    setBusy(true);
    setError("");
    try {
      const ticket = CreatorMediaPlaybackTicketSchema.parse(
        await mediaRequest(`${family}/${attachment.assetId}/playback`, {
          method: "POST",
          body: "{}",
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(4000)]),
          headers: { "x-qelvora-expected-account": expectedAccountId },
        }),
      );
      const url = new URL(ticket.url),
        path = `${family}/${attachment.assetId}/play`;
      if (
        !matches(ticket.asset) ||
        ticket.asset.bytes !== asset.bytes ||
        ticket.asset.mimeType !== asset.mimeType ||
        ticket.asset.durationMs !== asset.durationMs ||
        ticket.playbackFile.variant !== "credentialed" ||
        ticket.asset.provenance?.fileVariant !== "credentialed" ||
        ticket.asset.provenance.fileSha256 !== ticket.playbackFile.sha256 ||
        ticket.asset.provenance.fileBytes !== ticket.playbackFile.bytes ||
        asset.provenance?.fileSha256 !== ticket.playbackFile.sha256 ||
        asset.provenance.fileBytes !== ticket.playbackFile.bytes ||
        Date.parse(ticket.expiresAt) <= Date.now() ||
        url.pathname !== `/v1/w6/${path}` ||
        !url.searchParams.has("ticket") ||
        [...url.searchParams.keys()].some((name) => name !== "ticket")
      )
        throw new Error(
          "The photo link does not match this current attachment.",
        );
      url.searchParams.set("expectedAccountId", expectedAccountId);
      if (
        !abort.signal.aborted &&
        revision === generation.current &&
        performance.now() - checkedAt.current < 5000
      ) {
        photoProof.current = ticket.playbackFile;
        setPhoto(`/api/w6/${path}${url.search}`);
      }
    } catch (failure) {
      if (!abort.signal.aborted && revision === generation.current) {
        setPhoto(null);
        setError(
          failure instanceof Error
            ? failure.message
            : "The photo is unavailable.",
        );
      }
    } finally {
      if (photoRequest.current === abort) photoRequest.current = null;
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  if (!active) return null;
  return (
    <article>
      {error && <p role="status">{error}</p>}
      {!asset && !error && (
        <p role="status">Checking current attachment access…</p>
      )}
      {asset && attachment.kind === "voice" && (
        <CreatorVoicePlayer
          asset={asset}
          creatorId={content.creatorId}
          objectId={content.id}
          creatorName={content.creatorName}
          audience
          expectedAccountId={expectedAccountId}
          time={content.publishedAt ?? undefined}
        />
      )}
      {asset &&
        attachment.kind === "photo" &&
        (photo ? (
          <img
            src={photo}
            alt={attachment.alt}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
            onError={() => {
              setPhoto(null);
              setError(
                "The photo is unavailable. Check current access before retrying.",
              );
            }}
          />
        ) : (
          <button disabled={busy} onClick={() => void loadPhoto()}>
            {busy ? "Loading photo…" : "Load photo"}
          </button>
        ))}
    </article>
  );
}
