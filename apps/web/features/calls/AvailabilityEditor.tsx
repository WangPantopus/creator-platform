"use client";
import { copy, formatCopy } from "@qelvora/copy";
import { useEffect, useState } from "react";
import { mediaRequest } from "../media/api";
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
}: {
  creatorId: string;
  fanId?: string;
}) {
  return (
    <AvailabilityForm
      key={`${creatorId}/${fanId ?? "creator"}`}
      creatorId={creatorId}
      fanId={fanId}
    />
  );
}
function AvailabilityForm({
  creatorId,
  fanId,
}: {
  creatorId: string;
  fanId?: string;
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
  async function refresh() {
    setBusy(true);
    try {
      const value = await mediaRequest<Availability | null>(root);
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
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    void mediaRequest<Availability | null>(root)
      .then((value) => {
        if (active) {
          setCurrent(value);
          setZone(
            value?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
          );
          setWindows(value?.windows ?? []);
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (active)
          setNotice(
            error instanceof Error
              ? error.message
              : copy.w6AvailabilityCouldNotBeLoaded,
          );
      });
    return () => {
      active = false;
    };
  }, [root]);
  async function save() {
    if (!loaded || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      new Intl.DateTimeFormat(undefined, { timeZone: zone }).format();
      const explicit =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(Z|[+-]\d{2}:\d{2})$/u;
      if (
        windows.some(
          (w) => !explicit.test(w.startsAt) || !explicit.test(w.endsAt),
        )
      )
        throw new Error(copy.w6UseISOTimesWithAnExplicitUTCOffsetForEach);
      const value = await mediaRequest<Availability>(root, {
        method: "PUT",
        body: JSON.stringify({
          timeZone: zone,
          windows,
          expectedVersion: current?.version ?? 0,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setCurrent(value);
      setZone(value.timeZone);
      setWindows(value.windows);
      setNotice(copy.w6AvailabilitySaved);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : copy.w6AvailabilityCouldNotBeSavedYourChangesAreKept,
      );
    } finally {
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
        disabled={!loaded || busy}
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
                disabled={busy}
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
            disabled={busy}
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
        disabled={!loaded || busy || windows.length >= 64}
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
        {copy.w6SaveAvailability}
      </button>
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy}
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
