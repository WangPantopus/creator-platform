"use client";
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
          : "Availability could not be loaded.",
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
              : "Availability could not be loaded.",
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
        throw new Error(
          "Use ISO times with an explicit UTC offset for each boundary.",
        );
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
      setNotice("Availability saved.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Availability could not be saved. Your changes are kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="w6-card" aria-label="Call availability">
      <h2>Call availability</h2>
      <p className="qv-help">
        Use dated windows. Each offered call and its reconnect allowance must
        fit inside one window. Existing bookings keep their agreed time.
      </p>
      <label htmlFor="call-availability-zone">Your time zone</label>
      <input
        id="call-availability-zone"
        type="text"
        value={zone}
        disabled={!loaded || busy}
        onChange={(event) => setZone(event.target.value)}
      />
      {windows.map((window, index) => (
        <fieldset key={index} className="w6-offer-slot">
          <legend>Window {index + 1}</legend>
          {(["startsAt", "endsAt"] as const).map((key) => (
            <label key={key}>
              {key === "startsAt" ? "Starts" : "Ends"}
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
            Remove window {index + 1}
          </button>
        </fieldset>
      ))}
      {loaded && !windows.length && (
        <p className="qv-help">No windows saved.</p>
      )}
      <button
        className="qv-btn qv-btn--secondary"
        disabled={!loaded || busy || windows.length >= 64}
        onClick={() => setWindows([...windows, { startsAt: "", endsAt: "" }])}
      >
        Add a window
      </button>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={!loaded || busy}
        onClick={() => {
          void save();
        }}
      >
        Save availability
      </button>
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy}
        onClick={() => {
          void refresh();
        }}
      >
        Reload saved windows
      </button>
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
