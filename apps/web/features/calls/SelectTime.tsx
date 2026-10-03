"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useRef, useState } from "react";
import {
  CallOffersSchema,
  CallSessionSchema,
  type CallOfferView,
} from "../../../../packages/api/src/session";
import { mediaRequest, MediaRequestError } from "../media/api";
import "../media/media.css";
/** An offer link carries a destination, never a booking or payment authority. */
type SelectionProps = {
  creatorId: string;
  fanId: string;
  offerId: string;
  actorAccountId: string;
  canSelect: boolean;
};
function selectionNotice(error: unknown, fallback: string) {
  if (!(error instanceof MediaRequestError)) return fallback;
  return ["media_unavailable", "media_transport_unavailable"].includes(
    error.code ?? "",
  )
    ? copy.w6TheTimesCouldNotBeLoadedReconnectAndTryAgain
    : error.message;
}
export function SelectTime(props: SelectionProps) {
  return (
    <SelectionForm
      key={`${props.actorAccountId}/${props.creatorId}/${props.fanId}/${props.offerId}`}
      {...props}
    />
  );
}
function SelectionForm({
  creatorId,
  fanId,
  offerId,
  actorAccountId,
  canSelect,
}: SelectionProps) {
  const root = `threads/${creatorId}/${fanId}/call-offers`;
  const [offer, setOffer] = useState<CallOfferView | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [stale, setStale] = useState(true);
  const [now, setNow] = useState(0);
  const [revision, setRevision] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const command = useRef<AbortController | null>(null);
  const currentOffer = useRef<CallOfferView | null>(null);
  const deadline = useRef<{ wall: number; elapsed: number } | null>(null);
  const selectionVersion = useRef<number | null>(null);
  const selecting = useRef(false);
  const submission = useRef<{
    slot: string;
    version: number;
    key: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    let epoch = 0;
    let retry = true;
    let delay = 1000;
    let request: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    lifetime.current = controller;
    function conceal() {
      epoch++;
      request?.abort();
      request = null;
      command.current?.abort();
      command.current = null;
      selecting.current = false;
      setBusy(false);
      clearTimeout(timer);
      currentOffer.current = null;
      deadline.current = null;
      setOffer(null);
      setStale(true);
    }
    async function refresh() {
      if (!active || request || selecting.current || document.hidden) return;
      const started = performance.now();
      const attempt = epoch;
      const pending = new AbortController();
      request = pending;
      try {
        const values = CallOffersSchema.parse(
          await mediaRequest<unknown>(root, {
            expectedAccountId: actorAccountId,
            signal: AbortSignal.any([
              controller.signal,
              pending.signal,
              AbortSignal.timeout(4000),
            ]),
          }),
        );
        if (!active || document.hidden || attempt !== epoch) return;
        if (performance.now() - started >= 5000)
          throw new Error(copy.w6TheTimesCouldNotBeLoadedReconnectAndTryAgain);
        const next = values.find((value) => value.id === offerId) ?? null;
        if (next) {
          for (const zone of [next.fanTimeZone, next.creatorTimeZone])
            new Intl.DateTimeFormat(undefined, { timeZone: zone });
          const wall = Date.parse(next.expiresAt);
          const elapsed = performance.now() + Math.max(0, wall - Date.now());
          const prior = currentOffer.current;
          deadline.current = {
            wall,
            elapsed:
              prior?.version === next.version &&
              prior.expiresAt === next.expiresAt &&
              deadline.current
                ? Math.min(deadline.current.elapsed, elapsed)
                : elapsed,
          };
        } else deadline.current = null;
        currentOffer.current = next;
        setOffer(next);
        setChosen((slot) =>
          next?.state === "offered" &&
          selectionVersion.current === next.version &&
          next.slots.some((value) => value.id === slot)
            ? slot
            : null,
        );
        setStale(false);
        setNow(Date.now());
        setNotice(null);
        setLoaded(true);
        delay = 30000;
      } catch (error) {
        if (active && !document.hidden && attempt === epoch) {
          currentOffer.current = null;
          deadline.current = null;
          setOffer(null);
          setStale(true);
          setLoaded(true);
          setNotice(selectionNotice(error, copy.w6TheTimesCouldNotBeLoaded));
          if (
            error instanceof MediaRequestError &&
            ([401, 403, 404, 409].includes(error.status) ||
              error.code === "calls_unconfigured")
          )
            retry = false;
          delay = Math.min(30000, delay * 2);
        }
      } finally {
        if (request === pending) request = null;
        if (active && attempt === epoch && retry && !document.hidden)
          timer = setTimeout(() => void refresh(), delay);
      }
    }
    const foreground = () => {
      if (document.hidden) conceal();
      else {
        clearTimeout(timer);
        if (retry) void refresh();
      }
    };
    const clock = setInterval(() => {
      if (active && !document.hidden) {
        setNow(Date.now());
        if (
          currentOffer.current?.state === "offered" &&
          deadline.current &&
          (Date.now() >= deadline.current.wall ||
            performance.now() >= deadline.current.elapsed)
        ) {
          setChosen(null);
          setStale(true);
          setNotice(copy.w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent);
        }
      }
    }, 500);
    void refresh();
    window.addEventListener("pagehide", conceal);
    window.addEventListener("pageshow", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      active = false;
      epoch++;
      clearTimeout(timer);
      clearInterval(clock);
      request?.abort();
      command.current?.abort();
      command.current = null;
      controller.abort();
      if (lifetime.current === controller) lifetime.current = null;
      window.removeEventListener("pagehide", conceal);
      window.removeEventListener("pageshow", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [root, offerId, actorAccountId, revision]);
  async function select() {
    const observed = currentOffer.current;
    const boundary = lifetime.current;
    const expires = deadline.current;
    if (
      !observed ||
      !boundary ||
      boundary.signal.aborted ||
      !expires ||
      Date.now() >= expires.wall ||
      performance.now() >= expires.elapsed ||
      !chosen ||
      busy ||
      selecting.current ||
      stale ||
      document.hidden ||
      observed.state !== "offered" ||
      !canSelect
    )
      return;
    const slot = observed.slots.find((value) => value.id === chosen);
    if (!slot || Date.parse(slot.startsAt) <= Date.now()) return;
    const here = location.href;
    const pending = new AbortController();
    command.current = pending;
    selecting.current = true;
    const signal = AbortSignal.any([
      boundary.signal,
      pending.signal,
      AbortSignal.timeout(10000),
    ]);
    const mounted = () =>
      !boundary.signal.aborted &&
      !pending.signal.aborted &&
      !document.hidden &&
      lifetime.current === boundary &&
      command.current === pending &&
      location.href === here;
    const current = () => mounted() && !signal.aborted;
    setBusy(true);
    setNotice(null);
    try {
      const started = performance.now();
      const values = CallOffersSchema.parse(
        await mediaRequest<unknown>(root, {
          expectedAccountId: actorAccountId,
          signal,
        }),
      );
      if (!current()) return;
      const latest = values.find((value) => value.id === observed.id);
      if (
        !latest ||
        latest.state !== "offered" ||
        latest.version !== observed.version ||
        latest.commitmentId !== observed.commitmentId ||
        latest.expiresAt !== observed.expiresAt ||
        latest.creatorTimeZone !== observed.creatorTimeZone ||
        latest.fanTimeZone !== observed.fanTimeZone ||
        !latest.slots.some(
          (value) => value.id === slot.id && value.startsAt === slot.startsAt,
        ) ||
        Date.now() >= expires.wall ||
        performance.now() >= expires.elapsed ||
        Date.parse(slot.startsAt) <= Date.now() ||
        performance.now() - started >= 5000
      )
        throw new Error(copy.w6ThisTimeIsUnavailableReloadTheCurrentOffer);
      if (
        submission.current?.slot !== chosen ||
        submission.current?.version !== observed.version
      )
        submission.current = {
          slot: chosen,
          version: observed.version,
          key: crypto.randomUUID(),
        };
      const session = CallSessionSchema.parse(
        await mediaRequest<unknown>(`${root}/${observed.id}/select`, {
          method: "POST",
          expectedAccountId: actorAccountId,
          signal,
          body: JSON.stringify({
            slotId: chosen,
            expectedVersion: observed.version,
            idempotencyKey: submission.current.key,
          }),
        }),
      );
      if (!current()) return;
      if (
        session.creatorId !== creatorId ||
        session.fanId !== fanId ||
        session.fanAccountId !== actorAccountId ||
        session.commitmentId !== observed.commitmentId ||
        Date.parse(session.scheduledAt) !== Date.parse(slot.startsAt)
      )
        throw new Error(copy.w6ThisTimeIsUnavailableReloadTheCurrentOffer);
      window.location.assign(`/calls/${creatorId}/${fanId}/${session.id}`);
    } catch (error) {
      if (mounted()) {
        setStale(true);
        setNotice(
          selectionNotice(
            error,
            copy.w6ThisTimeIsUnavailableReloadTheCurrentOffer,
          ),
        );
      }
    } finally {
      if (command.current === pending) {
        command.current = null;
        selecting.current = false;
        setBusy(false);
      }
    }
  }
  return (
    <main className="w6-call w6-offer">
      <span className="qv-meta">{copy.w6CALLREQUEST}</span>
      <h1>{copy.w6ChooseATime}</h1>
      {offer?.state === "offered" && !stale ? (
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
                    {formatCopy("w6YourTime", { value1: offer.fanTimeZone })}
                  </span>
                </span>
                <input
                  type="radio"
                  name="call-time"
                  value={slot.id}
                  checked={chosen === slot.id}
                  disabled={
                    busy || !canSelect || Date.parse(slot.startsAt) <= now
                  }
                  onChange={() => {
                    selectionVersion.current = offer.version;
                    setChosen(slot.id);
                  }}
                />
              </label>
            ))}
          </div>
          <p className="qv-help">
            {formatCopy("w6CreatorSTimeZone", {
              value1: offer.creatorTimeZone,
            })}
          </p>
          <p className="qv-help">
            {copy.w6YourRequestSAcceptedTermsAndPaymentStayWithIts}
          </p>
          <p className="qv-help">
            {formatCopy("w6OfferExpirescfe463", {
              value1: new Intl.DateTimeFormat(undefined, {
                timeZone: offer.fanTimeZone,
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(offer.expiresAt)),
            })}
          </p>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy || !chosen || !canSelect}
            onClick={() => {
              void select();
            }}
          >
            {copy.w6ConfirmThisTime}
          </button>
        </>
      ) : offer?.state === "selected" && !stale && offer.selectedSessionId ? (
        <a
          className="qv-btn qv-btn--secondary"
          href={`/calls/${creatorId}/${fanId}/${offer.selectedSessionId}`}
        >
          {copy.w6OpenYourScheduledCall}
        </a>
      ) : (
        <p className="w6-notice">
          {loaded
            ? notice && !offer
              ? copy.w6TheTimesCouldNotBeLoaded
              : copy.w6ThisOfferChangedOrExpiredOpenRequestsForItsCurrent
            : copy.w6CheckingTheCurrentOfferAndParticipantAccess}
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
        {copy.w6ReloadCurrentOffer}
      </button>
      <a className="qv-btn qv-btn--quiet" href="/requests">
        {copy.w6OpenRequests}
      </a>
    </main>
  );
}
