"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class TrustError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly correlationId?: string,
  ) {
    super(message);
  }
}
export async function trustApi<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/trust/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok)
    throw new TrustError(
      result.error?.message ?? "This service is unavailable.",
      result.error?.code ?? "service_unavailable",
      result.error?.correlationId,
    );
  return result as T;
}
export function useTrust<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<TrustError | null>(null);
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    setData(null);
    setLoading(true);
    setError(null);
    try {
      const result = await trustApi<T>(path);
      if (sequence.current === current) setData(result);
    } catch (error) {
      if (sequence.current === current)
        setError(
          error instanceof TrustError
            ? error
            : new TrustError("Reconnect and try again.", "offline"),
        );
    } finally {
      if (sequence.current === current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    void refresh();
    const update = () => void refresh();
    window.addEventListener("trust-session", update);
    return () => {
      sequence.current++;
      window.removeEventListener("trust-session", update);
    };
  }, [refresh]);
  return { data, error, loading, refresh };
}
export function TrustSession() {
  const { data } = useTrust<{ localDevelopment: boolean }>("capabilities");
  const [actor, setActor] = useState("fan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!data?.localDevelopment)
    return (
      <a className="qv-link-btn" href="/api/auth/continue?returnTo=/support">
        Continue with Pantopus
      </a>
    );
  return (
    <div className="trust-session">
      <p>Synthetic local accounts · no provider or production identity</p>
      <label htmlFor="local-actor">Switch to local actor</label>
      <select
        id="local-actor"
        value={actor}
        onChange={(event) => setActor(event.target.value)}
      >
        {[
          ["fan", "Fan · @kilnfire"],
          ["other_fan", "A different fan"],
          ["creator", "Creator · Maya"],
          ["safety", "Ops · supervisor"],
          ["appeals", "Ops · independent reviewer"],
          ["verification", "Ops · verification only"],
        ].map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await trustApi("dev/session", { actor });
            window.dispatchEvent(new Event("trust-session"));
            setError("");
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "Session unavailable.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Use local actor
      </button>
      <button
        className="qv-link-btn"
        onClick={async () => {
          await trustApi("dev/logout", {});
          window.dispatchEvent(new Event("trust-session"));
        }}
      >
        Sign out
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: TrustError | null;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <div className="trust-error" role="alert">
      <p>{error.message}</p>
      {error.correlationId && (
        <p className="qv-meta">Reference {error.correlationId}</p>
      )}
      {retry && (
        <button className="qv-btn qv-btn--secondary" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export const caseLabel = (number: number) =>
  `CASE-${String(number).padStart(3, "0")}`;
export function openedLabel(date: string) {
  const elapsed = Math.max(0, Date.now() - new Date(date).getTime());
  if (elapsed < 60_000) return "JUST NOW";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} MIN AGO`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} H AGO`;
  if (elapsed < 172_800_000) return "YESTERDAY";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" })
    .format(new Date(date))
    .toUpperCase();
}
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
