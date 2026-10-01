"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useState } from "react";
import type {
  CallOfferContext,
  CallOfferView,
} from "../../../../packages/api/src/session";
import { mediaRequest } from "../media/api";
import { OfferTimes } from "./OfferTimes";

type Destination = { creatorId: string; fanId: string; commitmentId: string };
export function StudioCallOffer(props: Destination) {
  return (
    <CurrentOffer
      key={`${props.creatorId}/${props.fanId}/${props.commitmentId}`}
      {...props}
    />
  );
}
function CurrentOffer(props: Destination) {
  const [context, setContext] = useState<CallOfferContext | null>(null);
  const [existing, setExisting] = useState<CallOfferView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const root = `threads/${props.creatorId}/${props.fanId}/call-offers`;
    void Promise.all([
      mediaRequest<CallOfferContext>(`${root}/context/${props.commitmentId}`),
      mediaRequest<CallOfferView[]>(root),
    ])
      .then(([current, offers]) => {
        if (!active) return;
        setContext(current);
        setExisting(
          offers.find(
            (offer) =>
              offer.commitmentId === current.commitmentId &&
              ["offered", "selected"].includes(offer.state),
          ) ?? null,
        );
        setNotice(null);
      })
      .catch((failure: unknown) => {
        if (active)
          setNotice(
            failure instanceof Error
              ? failure.message
              : copy.w6TheCapturedCallCouldNotBeLoaded,
          );
      });
    return () => {
      active = false;
    };
  }, [props.creatorId, props.fanId, props.commitmentId, revision]);
  return context && !existing ? (
    <OfferTimes
      key={context.authorizationVersion}
      {...props}
      context={context}
    />
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
        onClick={() => setRevision(revision + 1)}
      >
        {copy.w6ReloadCurrentOffer}
      </button>
      <a className="qv-btn qv-btn--quiet" href="/studio/requests">
        {copy.w6OpenStudioRequests}
      </a>
    </main>
  );
}
