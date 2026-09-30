"use client";
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
              : "The captured call could not be loaded.",
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
      <span className="qv-meta">STUDIO · CALL REQUEST</span>
      <h1>{existing ? "Times already offered" : "Offer three times"}</h1>
      {existing ? (
        <>
          <p>
            The current offer is {existing.state}. Check this saved offer before
            sending another signed act.
          </p>
          <ul>
            {existing.slots.map((slot) => (
              <li key={slot.id}>{slot.startsAt}</li>
            ))}
          </ul>
          <p>
            Your time zone · {existing.creatorTimeZone}
            <br />
            Fan's time zone · {existing.fanTimeZone}
          </p>
          {existing.selectedSessionId && (
            <a
              href={`/calls/${props.creatorId}/${props.fanId}/${existing.selectedSessionId}`}
            >
              Open the scheduled call
            </a>
          )}
        </>
      ) : (
        <p>
          {notice ??
            "Checking the current captured request and creator access."}
        </p>
      )}
      <button
        className="qv-btn qv-btn--quiet"
        onClick={() => setRevision(revision + 1)}
      >
        Reload current offer
      </button>
      <a className="qv-btn qv-btn--quiet" href="/studio/requests">
        Open Studio requests
      </a>
    </main>
  );
}
