"use client";
import { useEffect, useRef, useState } from "react";
import type {
  CallOfferView,
  CallSession,
} from "../../../../packages/api/src/session";
import { mediaRequest } from "../media/api";
import "../media/media.css";
/** An offer link carries a destination, never a booking or payment authority. */
type SelectionProps = {
  creatorId: string;
  fanId: string;
  offerId: string;
  canSelect: boolean;
};
export function SelectTime(props: SelectionProps) {
  return (
    <SelectionForm
      key={`${props.creatorId}/${props.fanId}/${props.offerId}`}
      {...props}
    />
  );
}
function SelectionForm({
  creatorId,
  fanId,
  offerId,
  canSelect,
}: SelectionProps) {
  const root = `threads/${creatorId}/${fanId}/call-offers`;
  const [offer, setOffer] = useState<CallOfferView | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const submission = useRef<{
    slot: string;
    version: number;
    key: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void mediaRequest<CallOfferView[]>(root)
      .then((values) => {
        if (active) {
          setOffer(values.find((value) => value.id === offerId) ?? null);
          setChosen(null);
          setNotice(null);
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoaded(true);
          setNotice(
            error instanceof Error
              ? error.message
              : "The times could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [root, offerId, revision]);
  async function select() {
    if (!offer || !chosen || busy || !canSelect) return;
    setBusy(true);
    setNotice(null);
    try {
      if (
        submission.current?.slot !== chosen ||
        submission.current?.version !== offer.version
      )
        submission.current = {
          slot: chosen,
          version: offer.version,
          key: crypto.randomUUID(),
        };
      const session = await mediaRequest<CallSession>(
        `${root}/${offer.id}/select`,
        {
          method: "POST",
          body: JSON.stringify({
            slotId: chosen,
            expectedVersion: offer.version,
            idempotencyKey: submission.current.key,
          }),
        },
      );
      window.location.assign(`/calls/${creatorId}/${fanId}/${session.id}`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "This time is unavailable. Reload the current offer.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="w6-call w6-offer">
      <span className="qv-meta">CALL REQUEST</span>
      <h1>Choose a time</h1>
      {offer?.state === "offered" ? (
        <>
          <div className="w6-offer-slots">
            {offer.slots.map((slot) => (
              <label className="w6-offer-slot" key={slot.id}>
                <span>
                  <strong>
                    {new Intl.DateTimeFormat(undefined, {
                      timeZone: offer.fanTimeZone,
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZoneName: "shortOffset",
                    }).format(new Date(slot.startsAt))}
                  </strong>
                  <br />
                  <span className="qv-help">
                    Your time · {offer.fanTimeZone}
                  </span>
                </span>
                <input
                  type="radio"
                  name="call-time"
                  value={slot.id}
                  checked={chosen === slot.id}
                  disabled={busy || !canSelect}
                  onChange={() => setChosen(slot.id)}
                />
              </label>
            ))}
          </div>
          <p className="qv-help">
            Creator's time zone · {offer.creatorTimeZone}
          </p>
          <p className="qv-help">
            Your request's accepted terms and payment stay with its receipt.
            Choosing a time cannot create a second charge.
          </p>
          <p className="qv-help">
            Offer expires{" "}
            {new Intl.DateTimeFormat(undefined, {
              timeZone: offer.fanTimeZone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(offer.expiresAt))}
            .
          </p>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy || !chosen || !canSelect}
            onClick={() => {
              void select();
            }}
          >
            Confirm this time
          </button>
        </>
      ) : offer?.state === "selected" && offer.selectedSessionId ? (
        <a
          className="qv-btn qv-btn--secondary"
          href={`/calls/${creatorId}/${fanId}/${offer.selectedSessionId}`}
        >
          Open your scheduled call
        </a>
      ) : (
        <p className="w6-notice">
          {loaded
            ? "This offer changed or expired. Open Requests for its current options."
            : "Checking the current offer and participant access."}
        </p>
      )}
      {notice && (
        <p className="w6-notice" role="status">
          {notice}
        </p>
      )}
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy}
        onClick={() => setRevision(revision + 1)}
      >
        Reload current offer
      </button>
      <a className="qv-btn qv-btn--quiet" href="/requests">
        Open Requests
      </a>
    </main>
  );
}
