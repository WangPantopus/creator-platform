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
let verifiedAccount: string | null = null;
let sessionRevision = 0;
function invalidateSession() {
  verifiedAccount = null;
  sessionRevision++;
  window.dispatchEvent(new Event("trust-session"));
}
export async function trustApi<T>(path: string, body?: unknown): Promise<T> {
  const revision = sessionRevision;
  const account = verifiedAccount;
  const publicPath = ["capabilities", "help", "status", "session"].includes(
    path,
  );
  if (body !== undefined && !path.startsWith("dev/") && !account)
    throw new TrustError(
      "Refresh your account before taking this action.",
      "session_required",
    );
  const response = await fetch(`/api/trust/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Correlation-Id": crypto.randomUUID(),
      ...(!publicPath && account ? { "X-Expected-Account-Id": account } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await response.json();
  if (revision !== sessionRevision && !path.startsWith("dev/"))
    throw new TrustError(
      "Your account changed. Reopen this page.",
      "session_account_changed",
    );
  if (response.ok && path === "session") {
    if (verifiedAccount && verifiedAccount !== result.accountId)
      invalidateSession();
    verifiedAccount = result.accountId;
  }
  if (result.error?.code === "session_account_changed") invalidateSession();
  if (path === "session" && response.status === 401 && verifiedAccount)
    invalidateSession();
  if (!response.ok)
    throw new TrustError(
      result.error?.message ?? "This service is unavailable.",
      result.error?.code ?? "service_unavailable",
      result.error?.correlationId,
    );
  return result as T;
}
/** Invalidate form results as well as reads when the current account changes. */
export function useTrustSession(reset: () => void) {
  const epoch = useRef(0);
  const resetRef = useRef(reset);
  useEffect(() => {
    resetRef.current = reset;
  });
  useEffect(() => {
    const clear = () => {
      epoch.current++;
      resetRef.current();
    };
    window.addEventListener("trust-session", clear);
    return () => {
      epoch.current++;
      window.removeEventListener("trust-session", clear);
    };
  }, []);
  return epoch;
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
  const session = useTrust<{ accountId: string }>("session");
  const [actor, setActor] = useState("fan");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => void session.refresh();
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const channel = new BroadcastChannel("trust-account");
    channel.onmessage = () => {
      invalidateSession();
      refresh();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      channel.close();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [session.refresh]);
  useEffect(() => {
    if (!data?.localDevelopment || !session.data) return;
    const accountActors: Record<string, string> = {
      "10000000-0000-4000-8000-000000000001": "fan",
      "10000000-0000-4000-8000-000000000002": "other_fan",
      "10000000-0000-4000-8000-000000000003": "creator",
      "10000000-0000-4000-8000-000000000004": "safety",
      "10000000-0000-4000-8000-000000000005": "appeals",
      "10000000-0000-4000-8000-000000000006": "verification",
    };
    const selected = accountActors[session.data.accountId];
    if (selected) setActor(selected);
  }, [data?.localDevelopment, session.data?.accountId]);
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
            invalidateSession();
            const channel = new BroadcastChannel("trust-account");
            channel.postMessage("changed");
            channel.close();
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
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await trustApi("dev/logout", {});
            invalidateSession();
            const channel = new BroadcastChannel("trust-account");
            channel.postMessage("changed");
            channel.close();
            setError("");
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "Sign out unavailable.",
            );
          } finally {
            setBusy(false);
          }
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
