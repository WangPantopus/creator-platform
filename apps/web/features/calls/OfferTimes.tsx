"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useRef, useState } from "react";
import { SignedActReview } from "../identity/signing";
import type { CallOfferContext } from "../../../../packages/api/src/session";
import type { SignedActCommand } from "@qelvora/api";
import { mediaRequest } from "../media/api";
import { AvailabilityEditor } from "./AvailabilityEditor";
import "../media/media.css";
/** W4 supplies exact signed acceptance and catalog; entering times cannot create a second payment decision. */
export function OfferTimes({
  creatorId,
  fanId,
  commitmentId,
  signedActId,
  authorizationVersion,
  creatorTimeZone: suppliedCreatorZone,
  fanTimeZone: suppliedFanZone,
  expiresAt: suppliedExpiry,
  signedStartsAt,
  context,
}: {
  creatorId: string;
  fanId: string;
  commitmentId: string;
  signedActId?: string;
  authorizationVersion?: number;
  creatorTimeZone?: string;
  fanTimeZone?: string;
  expiresAt?: string;
  /** W4's reviewed signature must bind these exact slots; editing invalidates that signature. */
  signedStartsAt?: string[];
  context?: CallOfferContext;
}) {
  const [creatorTimeZone, setCreatorZone] = useState(
    suppliedCreatorZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [fanTimeZone, setFanZone] = useState(suppliedFanZone ?? "");
  const [expiresAt, setExpiry] = useState(suppliedExpiry ?? "");
  const [times, setTimes] = useState(() =>
    Array.from({ length: 3 }, (_, i) => signedStartsAt?.[i] ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const publication = useRef<{
    signedActId: string;
    body: Record<string, unknown>;
  } | null>(null);
  const revision = context?.authorizationVersion ?? authorizationVersion;
  const startsAt = times.filter(Boolean);
  const explicit =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/u;
  const zonesValid = (() => {
    try {
      new Intl.DateTimeFormat(undefined, {
        timeZone: creatorTimeZone,
      }).format();
      new Intl.DateTimeFormat(undefined, { timeZone: fanTimeZone }).format();
      return !!creatorTimeZone && !!fanTimeZone;
    } catch {
      return false;
    }
  })();
  const ready =
    !!context &&
    !!revision &&
    zonesValid &&
    startsAt.length === 3 &&
    startsAt.every(
      (at) => explicit.test(at) && Number.isFinite(Date.parse(at)),
    ) &&
    new Set(startsAt.map(Date.parse)).size === startsAt.length &&
    explicit.test(expiresAt) &&
    Date.parse(expiresAt) > Date.now() &&
    Date.parse(expiresAt) < Math.min(...startsAt.map(Date.parse));
  const command: SignedActCommand | null = ready
    ? {
        actType: "accept",
        subjectId: context!.threadId,
        content: {
          kind: "commerce_call_offer",
          commitmentId,
          authorizationVersion: revision,
          startsAt,
          creatorTimeZone,
          fanTimeZone,
          expiresAt,
        },
      }
    : null;
  const signatureMatches = Boolean(
    signedStartsAt &&
      times.filter(Boolean).length === signedStartsAt.length &&
      times
        .filter(Boolean)
        .every(
          (time, i) => Date.parse(time) === Date.parse(signedStartsAt[i]!),
        ),
  );
  async function publish(id: string) {
    if (publication.current?.signedActId !== id)
      publication.current = {
        signedActId: id,
        body: {
          commitmentId,
          startsAt,
          creatorTimeZone,
          fanTimeZone,
          expiresAt,
          expectedAuthorizationVersion: revision,
          signedActId: id,
          idempotencyKey: crypto.randomUUID(),
        },
      };
    setBusy(true);
    setError(null);
    try {
      await mediaRequest(`threads/${creatorId}/${fanId}/call-offers`, {
        method: "POST",
        body: JSON.stringify(publication.current.body),
      });
      setSent(true);
    } catch (failure) {
      setError(
        copy.w6PublicationIsUnconfirmedRetryThisExactSignedCommandOrReload,
      );
      throw failure;
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (
      !signedActId ||
      !revision ||
      !expiresAt ||
      !creatorTimeZone ||
      !fanTimeZone ||
      !signatureMatches
    ) {
      setError(copy.w6ReviewAndSignTheAcceptedCallRequestBeforeOfferingTimes);
      return;
    }
    try {
      // ISO timestamps with an explicit offset avoid guessing ambiguous/missing daylight-saving local times.
      if (
        startsAt.some(
          (value) =>
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/u.test(
              value,
            ),
        )
      )
        throw new Error(copy.w6EachTimeNeedsAnExplicitUTCOffsetForExample2026);
      await publish(signedActId);
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.w6TheOfferCouldNotBeSaved);
    }
  }
  return (
    <main className="w6-call w6-offer">
      <span className="qv-meta">{copy.w6STUDIOCALLREQUEST}</span>
      <h1>{sent ? copy.w6TimesOffered : copy.w6OfferThreeTimes}</h1>
      {!context && (!creatorTimeZone || !fanTimeZone) ? (
        <p className="w6-notice" role="status">
          {copy.w6OpenACallRequestToLoadBothTimeZonesAnd}
        </p>
      ) : null}
      {context && (
        <p className="qv-help">
          {formatCopy("w6MinuteCallAcceptedRequest", {
            value1: context.creatorName,
            value2: context.durationSeconds / 60,
            value3: context.mediaMode,
            value4: context.commitmentId,
          })}
        </p>
      )}
      {context && (
        <div className="w6-card">
          <label>
            {copy.w6YourIANATimeZone}
            <input
              type="text"
              value={creatorTimeZone}
              disabled={sent || busy || !!publication.current}
              onChange={(event) => setCreatorZone(event.target.value)}
            />
          </label>
          <label>
            {copy.w6FanSConfirmedIANATimeZone}
            <input
              type="text"
              value={fanTimeZone}
              placeholder="Area/City"
              disabled={sent || busy || !!publication.current}
              onChange={(event) => setFanZone(event.target.value)}
            />
          </label>
          <label>
            {copy.w6OfferExpiryWithUTCOffset}
            <input
              type="text"
              value={expiresAt}
              placeholder="YYYY-MM-DDTHH:mm±HH:mm"
              disabled={sent || busy || !!publication.current}
              onChange={(event) => setExpiry(event.target.value)}
            />
          </label>
        </div>
      )}
      <div className="w6-offer-slots">
        {times.map((value, index) => (
          <div className="w6-offer-slot" key={index}>
            <label htmlFor={`slot-${index}`}>
              {formatCopy("w6Time", {
                value1: index + 1,
                value2: creatorTimeZone ? ` · ${creatorTimeZone}` : "",
              })}
            </label>
            <input
              id={`slot-${index}`}
              type="text"
              value={value}
              placeholder="YYYY-MM-DDTHH:mm±HH:mm"
              disabled={sent || busy || !!publication.current}
              onChange={(event) =>
                setTimes(
                  times.map((time, i) =>
                    i === index ? event.target.value : time,
                  ),
                )
              }
            />
            {!Number.isNaN(Date.parse(value)) && value && zonesValid && (
              <p className="qv-help">
                {formatCopy("w6ForTheFan", {
                  value1: new Intl.DateTimeFormat(undefined, {
                    timeZone: fanTimeZone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(value)),
                  value2: fanTimeZone,
                })}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="qv-help">
        {copy.w6TheFanPicksOneThisRequestWasChargedOnAcceptance}
      </p>
      <details>
        <summary>{copy.w6EditYourAvailability}</summary>
        <AvailabilityEditor creatorId={creatorId} fanId={fanId} />
      </details>
      {error && (
        <p role="status" className="w6-notice">
          {error}
        </p>
      )}
      <div className="w6-bottom">
        {context && !sent && command && !publication.current && (
          <SignedActReview
            creatorId={creatorId}
            fanId={fanId}
            command={command}
            creatorName={context.creatorName}
            text={startsAt.join("\n")}
            title={copy.w6ReviewTheseExactOfferedTimes}
            rows={[
              [
                copy.w6Call,
                formatCopy("w6Minutes", {
                  value1: context.durationSeconds / 60,
                  value2: context.mediaMode,
                }),
              ],
              [copy.w6YourZone, creatorTimeZone],
              [copy.w6FanSZone, fanTimeZone],
              [copy.w6OfferExpires, expiresAt],
              [copy.w6Request, commitmentId],
            ]}
            onSigned={async (id) => publish(id)}
          />
        )}
        {context && !ready && !sent && !publication.current && (
          <p className="qv-help">
            {copy.w6EnterThreeDistinctFutureTimesWithExplicitUTCOffsetsBoth}
          </p>
        )}
        {publication.current && !sent && (
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy}
            onClick={() => {
              void publish(publication.current!.signedActId).catch(
                () => undefined,
              );
            }}
          >
            {copy.w6RetryThisExactSignedOffer}
          </button>
        )}
        {context && (
          <a
            className="qv-btn qv-btn--quiet"
            href={`/studio/calls/${creatorId}/${fanId}/${commitmentId}`}
          >
            {copy.w6ReloadSavedOffer}
          </a>
        )}
        {!context && (
          <>
            <button
              className="qv-btn qv-btn--maya qv-btn--lg"
              disabled={
                busy ||
                sent ||
                !signedActId ||
                !revision ||
                !expiresAt ||
                !signatureMatches ||
                !creatorTimeZone ||
                !fanTimeZone
              }
              onClick={() => {
                void send();
              }}
            >
              {copy.w6SendSignedTimes}
            </button>
            {!signedActId && (
              <p className="qv-help">
                {copy.w6OpenAnAcceptedRequestFromStudioToReviewTheExact}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
