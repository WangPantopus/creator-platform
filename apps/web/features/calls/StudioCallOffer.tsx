"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useRef, useState } from "react";
import {
  CallOfferContextSchema,
  CallOffersSchema,
  type CallOfferContext,
  type CallOfferView,
} from "../../../../packages/api/src/session";
import { MediaRequestError, mediaRequest } from "../media/api";
import { useIdentityRequest } from "../identity/session-boundary";
import { OfferTimes } from "./OfferTimes";

type Destination = { creatorId: string; fanId: string; commitmentId: string };
export function StudioCallOffer(props: Destination) {
  const identity = useIdentityRequest();
  const lifetime = useRef({ signal: identity.signal, revision: 0 });
  if (lifetime.current.signal !== identity.signal)
    lifetime.current = {
      signal: identity.signal,
      revision: lifetime.current.revision + 1,
    };
  return (
    <CurrentOffer
      key={`${identity.session.accountId}/${identity.session.sessionId}/${lifetime.current.revision}/${props.creatorId}/${props.fanId}/${props.commitmentId}`}
      {...props}
    />
  );
}
function CurrentOffer(props: Destination) {
  const opening = useRef(useIdentityRequest()).current;
  const [context, setContext] = useState<CallOfferContext | null>(null);
  const [existing, setExisting] = useState<CallOfferView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [concealed, setConcealed] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const signal = AbortSignal.any([
      opening.signal,
      controller.signal,
      AbortSignal.timeout(4000),
    ]);
    const conceal = () => {
      controller.abort();
      setContext(null);
      setExisting(null);
      setConcealed(true);
    };
    const foreground = () => {
      if (document.hidden) conceal();
      else setRevision((value) => value + 1);
    };
    const pageshow = (event: PageTransitionEvent) => {
      if (event.persisted) setRevision((value) => value + 1);
    };
    opening.signal.addEventListener("abort", conceal);
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("pagehide", conceal);
    window.addEventListener("pageshow", pageshow);
    setContext(null);
    setExisting(null);
    setNotice(null);
    setConcealed(document.hidden || opening.signal.aborted);
    const root = `threads/${props.creatorId}/${props.fanId}/call-offers`;
    const request = {
      signal,
      expectedAccountId: opening.session.accountId,
      expectedSessionId: opening.session.sessionId,
    };
    if (!document.hidden && !opening.signal.aborted)
      void Promise.all([
        mediaRequest<unknown>(`${root}/context/${props.commitmentId}`, request),
        mediaRequest<unknown>(root, request),
      ])
        .then(([current, offers]) => {
          if (!active || signal.aborted || document.hidden) return;
          const captured = CallOfferContextSchema.parse(current);
          const saved = CallOffersSchema.parse(offers);
          if (captured.commitmentId !== props.commitmentId)
            throw new Error(copy.w6TheCapturedCallCouldNotBeLoaded);
          for (const offer of saved)
            for (const zone of [offer.creatorTimeZone, offer.fanTimeZone])
              new Intl.DateTimeFormat(undefined, { timeZone: zone });
          setContext(captured);
          setExisting(
            saved.find(
              (offer) =>
                offer.commitmentId === captured.commitmentId &&
                ["offered", "selected"].includes(offer.state),
            ) ?? null,
          );
          setNotice(null);
        })
        .catch((failure: unknown) => {
          if (
            active &&
            !controller.signal.aborted &&
            !opening.signal.aborted &&
            !document.hidden
          )
            setNotice(
              signal.aborted ||
                (failure instanceof MediaRequestError &&
                  ["media_unavailable", "media_transport_unavailable"].includes(
                    failure.code ?? "",
                  ))
                ? copy.w6TheTimesCouldNotBeLoadedReconnectAndTryAgain
                : failure instanceof Error
                  ? failure.message
                  : copy.w6TheCapturedCallCouldNotBeLoaded,
            );
        });
    return () => {
      active = false;
      controller.abort();
      opening.signal.removeEventListener("abort", conceal);
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("pageshow", pageshow);
    };
  }, [opening, props.creatorId, props.fanId, props.commitmentId, revision]);
  if (concealed || opening.signal.aborted) return null;
  return context && !existing ? (
    <OfferTimes key={JSON.stringify(context)} {...props} context={context} />
  ) : (
    <main className="w6-call w6-offer">
      <span className="qv-meta">{copy.w6STUDIOCALLREQUEST}</span>
      <h1>{existing ? copy.w6TimesAlreadyOffered : copy.w6OfferThreeTimes}</h1>
      {existing ? (
        <>
          <p>
            {formatCopy("w6TheCurrentOfferIsCheckThisSavedOfferBeforeSending", {
              value1: existing.state,
            })}
          </p>
          <ul>
            {existing.slots.map((slot) => (
              <li key={slot.id}>{slot.startsAt}</li>
            ))}
          </ul>
          <p>
            {copy.w6YourTimeZonebb173f}
            {existing.creatorTimeZone}
            <br />
            {copy.w6FanSTimeZone}
            {existing.fanTimeZone}
          </p>
          {existing.selectedSessionId && (
            <a
              href={`/calls/${props.creatorId}/${props.fanId}/${existing.selectedSessionId}`}
            >
              {copy.w6OpenTheScheduledCall}
            </a>
          )}
        </>
      ) : (
        <p>
          {notice ?? copy.w6CheckingTheCurrentCapturedRequestAndCreatorAccess}
        </p>
      )}
      <button
        className="qv-btn qv-btn--quiet"
        onClick={() => setRevision((value) => value + 1)}
      >
        {copy.w6ReloadCurrentOffer}
      </button>
      <a
        className="qv-btn qv-btn--quiet"
        href={`/studio/${props.creatorId}/requests`}
      >
        {copy.w6OpenStudioRequests}
      </a>
    </main>
  );
}
