"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useRef, useState } from "react";
import { MediaRequestError, mediaRequest } from "../media/api";
import {
  AvailabilityCommandSchema,
  AvailabilityViewSchema,
  AvailabilitySchema,
} from "../../../../packages/api/src/session";
import "../media/media.css";
type Availability = {
  version: number;
  timeZone: string;
  windows: Array<{ startsAt: string; endsAt: string }>;
};
/** Explicit offsets distinguish both occurrences of a repeated DST wall time. No recurring rule is guessed. */
export function AvailabilityEditor({
  creatorId,
  fanId,
  accountId,
  signal,
}: {
  creatorId: string;
  fanId?: string;
  accountId?: string;
  signal?: AbortSignal;
}) {
  return (
    <AvailabilityForm
      key={`${accountId ?? "current"}/${creatorId}/${fanId ?? "creator"}`}
      creatorId={creatorId}
      fanId={fanId}
      accountId={accountId}
      signal={signal}
    />
  );
}
function AvailabilityForm({
  creatorId,
  fanId,
  accountId,
  signal,
}: {
  creatorId: string;
  fanId?: string;
  accountId?: string;
  signal?: AbortSignal;
}) {
  const root = fanId
    ? `threads/${creatorId}/${fanId}/call-availability`
    : `creators/${creatorId}/call-availability`;
  const [current, setCurrent] = useState<Availability | null>(null);
  const [zone, setZone] = useState("");
  const [windows, setWindows] = useState<Availability["windows"]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const command = useRef<ReturnType<
    typeof AvailabilityCommandSchema.parse
  > | null>(null);
  const pending = useRef(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const dirty =
    loaded &&
    (zone !==
      (current?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone) ||
      JSON.stringify(windows) !== JSON.stringify(current?.windows ?? []));
  const request = (init?: RequestInit) =>
    mediaRequest<unknown>(root, {
      ...init,
      signal,
      expectedAccountId: accountId,
    });
  async function refresh() {
    if (pending.current || command.current) return;
    if (dirty && !window.confirm(copy.w6RefreshWillReplaceAvailabilityChanges))
      return;
    pending.current = true;
    setBusy(true);
    try {
      const value = AvailabilityViewSchema.parse(await request());
      if (signal?.aborted) return;
      setCurrent(value);
      setZone(
        value?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      setWindows(value?.windows ?? []);
      setLoaded(true);
      setNotice(null);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : copy.w6AvailabilityCouldNotBeLoaded,
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void mediaRequest<unknown>(root, { signal, expectedAccountId: accountId })
      .then((value) => AvailabilityViewSchema.parse(value))
      .then((value) => {
        if (active && !signal?.aborted) {
          setCurrent(value);
          setZone(
            value?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          );
          setWindows(value?.windows ?? []);
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (active && !signal?.aborted)
          setNotice(
            error instanceof Error
              ? error.message
              : copy.w6AvailabilityCouldNotBeLoaded,
          );
      });
    return () => {
      active = false;
    };
  }, [root, accountId, signal]);
  async function save() {
    if (!loaded || pending.current || signal?.aborted) return;
    pending.current = true;
    setBusy(true);
    setNotice(null);
    try {
      if (!command.current) {
        const canonicalZone = new Intl.DateTimeFormat(undefined, {
          timeZone: zone,
        }).resolvedOptions().timeZone;
        const explicit =
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/u;
        if (
          windows.some(
            (w) => !explicit.test(w.startsAt) || !explicit.test(w.endsAt),
          )
        )
          throw new Error(copy.w6UseISOTimesWithAnExplicitUTCOffsetForEach);
        command.current = AvailabilityCommandSchema.parse({
          timeZone: canonicalZone,
          windows: windows.map((value) => ({ ...value })),
          expectedVersion: current?.version ?? 0,
          idempotencyKey: crypto.randomUUID(),
        });
      }
      const sent = command.current;
      setUnconfirmed(true);
      const value = AvailabilitySchema.parse(
        await request({
          method: "PUT",
          body: JSON.stringify(sent),
        }),
      );
      if (signal?.aborted) return;
      const normalized = [...sent.windows]
        .map((value) => ({
          startsAt: new Date(value.startsAt).toISOString(),
          endsAt: new Date(value.endsAt).toISOString(),
        }))
        .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
      if (
        value.creatorId !== creatorId ||
        value.version !== sent.expectedVersion + 1 ||
        value.timeZone !== sent.timeZone ||
        value.windows.length !== normalized.length ||
        !normalized.every(
          (window, index) =>
            value.windows[index]?.startsAt === window.startsAt &&
            value.windows[index]?.endsAt === window.endsAt,
        )
      )
        throw new Error(copy.w6AvailabilitySaveIsUnconfirmed);
      command.current = null;
      setUnconfirmed(false);
      setCurrent(value);
      setZone(value.timeZone);
      setWindows(value.windows);
      setNotice(copy.w6AvailabilitySaved);
    } catch (error) {
      if (signal?.aborted) return;
      if (
        error instanceof MediaRequestError &&
        [400, 401, 403, 404, 409, 422].includes(error.status)
      ) {
        command.current = null;
        setUnconfirmed(false);
        if (
          error.code === "session_account_changed" ||
          error.status === 401 ||
          (error.status === 403 &&
            ![
              "availability_invalid",
              "time_zone_invalid",
              "availability_stale",
            ].includes(error.code ?? ""))
        ) {
          setLoaded(false);
          setWindows([]);
          setZone("");
        }
      }
      setNotice(
        error instanceof MediaRequestError &&
          error.code === "session_account_changed"
          ? copy.w6AvailabilityAccountChanged
          : command.current
            ? copy.w6AvailabilitySaveIsUnconfirmed
            : error instanceof Error
              ? error.message
              : copy.w6AvailabilityCouldNotBeSavedYourChangesAreKept,
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="w6-card" aria-label={copy.w6CallAvailability}>
      <h2>{copy.w6CallAvailability}</h2>
      <p className="qv-help">
        {copy.w6UseDatedWindowsEachOfferedCallAndItsReconnectAllowance}
      </p>
      <label htmlFor="call-availability-zone">{copy.w6YourTimeZone}</label>
      <input
        id="call-availability-zone"
        type="text"
        value={zone}
        disabled={!loaded || busy || unconfirmed}
        onChange={(event) => setZone(event.target.value)}
      />
      {windows.map((window, index) => (
        <fieldset key={index} className="w6-offer-slot">
          <legend>{formatCopy("w6Window", { value1: index + 1 })}</legend>
          {(["startsAt", "endsAt"] as const).map((key) => (
            <label key={key}>
              {key === "startsAt" ? copy.w6Starts : copy.w6Ends}
              <input
                type="text"
                placeholder="YYYY-MM-DDTHH:mm±HH:mm"
                value={window[key]}
                disabled={busy || unconfirmed}
                onChange={(event) =>
                  setWindows(
                    windows.map((w, i) =>
                      i === index ? { ...w, [key]: event.target.value } : w,
                    ),
                  )
                }
              />
            </label>
          ))}
          <button
            className="qv-btn qv-btn--quiet"
            disabled={busy || unconfirmed}
            onClick={() => setWindows(windows.filter((_, i) => i !== index))}
          >
            {formatCopy("w6RemoveWindow", { value1: index + 1 })}
          </button>
        </fieldset>
      ))}
      {loaded && !windows.length && (
        <p className="qv-help">{copy.w6NoWindowsSaved}</p>
      )}
      <button
        className="qv-btn qv-btn--secondary"
        disabled={!loaded || busy || unconfirmed || windows.length >= 64}
        onClick={() => setWindows([...windows, { startsAt: "", endsAt: "" }])}
      >
        {copy.w6AddAWindow}
      </button>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={!loaded || busy}
        onClick={() => {
          void save();
        }}
      >
        {unconfirmed ? copy.w6RetryAvailabilitySave : copy.w6SaveAvailability}
      </button>
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy || unconfirmed}
        onClick={() => {
          void refresh();
        }}
      >
        {copy.w6ReloadSavedWindows}
      </button>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
