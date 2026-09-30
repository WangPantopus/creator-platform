"use client";
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
        "Publication is unconfirmed. Retry this exact signed command or reload the saved offer before signing again.",
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
      setError(
        "Review and sign the accepted call request before offering times.",
      );
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
        throw new Error(
          "Each time needs an explicit UTC offset, for example 2026-10-14T16:00-07:00.",
        );
      await publish(signedActId);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The offer could not be saved.",
      );
    }
  }
  return (
    <main className="w6-call w6-offer">
      <span className="qv-meta">STUDIO · CALL REQUEST</span>
      <h1>{sent ? "Times offered" : "Offer three times"}</h1>
      {!context && (!creatorTimeZone || !fanTimeZone) ? (
        <p className="w6-notice" role="status">
          Open a call request to load both time zones and its signed acceptance.
        </p>
      ) : null}
      {context && (
        <p className="qv-help">
          {context.creatorName} · {context.durationSeconds / 60}-minute{" "}
          {context.mediaMode} call · accepted request {context.commitmentId}
        </p>
      )}
      {context && (
        <div className="w6-card">
          <label>
            Your IANA time zone
            <input
              type="text"
              value={creatorTimeZone}
              disabled={sent || busy || !!publication.current}
              onChange={(event) => setCreatorZone(event.target.value)}
            />
          </label>
          <label>
            Fan's confirmed IANA time zone
            <input
              type="text"
              value={fanTimeZone}
              placeholder="Area/City"
              disabled={sent || busy || !!publication.current}
              onChange={(event) => setFanZone(event.target.value)}
            />
          </label>
          <label>
            Offer expiry, with UTC offset
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
              Time {index + 1}
              {creatorTimeZone ? ` · ${creatorTimeZone}` : ""}
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
                {new Intl.DateTimeFormat(undefined, {
                  timeZone: fanTimeZone,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(value))}{" "}
                for the fan · {fanTimeZone}
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="qv-help">
        The fan picks one. This request was charged on acceptance; offering
        times does not add another charge. Creator no-show is refunded in full.
        A fan no-show is charged as agreed.
      </p>
      <details>
        <summary>Edit your availability</summary>
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
            title="Review these exact offered times"
            rows={[
              [
                "Call",
                `${context.durationSeconds / 60} minutes · ${context.mediaMode}`,
              ],
              ["Your zone", creatorTimeZone],
              ["Fan's zone", fanTimeZone],
              ["Offer expires", expiresAt],
              ["Request", commitmentId],
            ]}
            onSigned={async (id) => publish(id)}
          />
        )}
        {context && !ready && !sent && !publication.current && (
          <p className="qv-help">
            Enter three distinct future times with explicit UTC offsets, both
            confirmed IANA zones, and an expiry before the first time to review
            and sign.
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
            Retry this exact signed offer
          </button>
        )}
        {context && (
          <a
            className="qv-btn qv-btn--quiet"
            href={`/studio/calls/${creatorId}/${fanId}/${commitmentId}`}
          >
            Reload saved offer
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
              Send signed times
            </button>
            {!signedActId && (
              <p className="qv-help">
                Open an accepted request from Studio to review the exact signed
                offer.
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
