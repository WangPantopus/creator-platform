"use client";
import { IdentityContinueSchema } from "@qelvora/api/schemas";
import { sessionChannel } from "../../features/identity/session-boundary";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export class TrustError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly correlationId?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
type TrustView = Readonly<{
  accountId: string;
  sessionId: string | null;
  isolatedDevelopment: boolean;
  signal: AbortSignal;
}>;
let verifiedView: TrustView | null = null;
let viewController: AbortController | null = null;
let sessionRevision = 0;
type TrustSnapshot = Readonly<{
  view: TrustView | null;
  ready: boolean;
  concealed: boolean;
  error: TrustError | null;
}>;
const initialSnapshot: TrustSnapshot = Object.freeze({
  view: null,
  ready: false,
  concealed: false,
  error: null,
});
let snapshot = initialSnapshot;
const subscribers = new Set<() => void>();
function publish(
  ready: boolean,
  error: TrustError | null = null,
  concealed = ready ? false : snapshot.concealed,
) {
  if (
    snapshot.view === verifiedView &&
    snapshot.ready === ready &&
    snapshot.concealed === concealed &&
    snapshot.error === error
  )
    return;
  snapshot = Object.freeze({ view: verifiedView, ready, concealed, error });
  for (const subscriber of subscribers) subscriber();
}
const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
};
function useTrustSnapshot() {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => initialSnapshot,
  );
}
/** Readiness can change without ending the original session or its drafts. */
export function useTrustStatus() {
  const current = useTrustSnapshot();
  return {
    ready: current.ready,
    concealed: current.concealed,
    error: current.error,
  };
}
const isPublicPath = (path: string) =>
  ["capabilities", "help", "status", "session"].includes(path);
function invalidateSession() {
  viewController?.abort();
  viewController = null;
  verifiedView = null;
  sessionRevision++;
  publish(false, null, true);
  window.dispatchEvent(new Event("trust-session"));
}
function notifySessionChange() {
  for (const name of ["trust-account", sessionChannel]) {
    try {
      const channel = new BroadcastChannel(name);
      try {
        channel.postMessage(name === sessionChannel ? "ended" : "changed");
      } finally {
        channel.close();
      }
    } catch {
      // Optional notification cannot turn a confirmed account action into an
      // error. Resume checks and the bounded poll still check the producer.
    }
  }
}
export async function trustApi<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return requestForView<T>(path, body, signal, verifiedView);
}
async function requestForView<T>(
  path: string,
  body: unknown,
  signal: AbortSignal | undefined,
  view: TrustView | null,
): Promise<T> {
  signal?.throwIfAborted();
  const revision = sessionRevision;
  const publicPath = isPublicPath(path);
  const privatePath = !publicPath && path !== "dev/session";
  if (
    privatePath &&
    (!view || view !== verifiedView || view.signal.aborted || !snapshot.ready)
  )
    throw new TrustError(
      "Refresh your account before taking this action.",
      "session_required",
    );
  const original = privatePath
    ? AbortSignal.any([view!.signal, ...(signal ? [signal] : [])])
    : signal;
  original?.throwIfAborted();
  // Settle a real session read before its four-second poll replaces it. A
  // stalled read must reach the readiness consumer while keeping the original
  // account/view lifetime and its unsent input intact. Include the JSON body.
  const responseSignal = AbortSignal.any([
    ...(original ? [original] : []),
    AbortSignal.timeout(
      path === "session" && body === undefined ? 3000 : 10000,
    ),
  ]);
  responseSignal?.throwIfAborted();
  let response: Response;
  let result;
  try {
    response = await fetch(`/api/trust/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-Id": crypto.randomUUID(),
        ...(privatePath && view
          ? {
              "X-Expected-Account-Id": view.accountId,
              ...(view.sessionId
                ? { "X-Expected-Session-Id": view.sessionId }
                : {}),
            }
          : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      ...(responseSignal ? { signal: responseSignal } : {}),
    });
    result = await response.json();
    responseSignal?.throwIfAborted();
  } catch (error) {
    if (path === "session" && revision === sessionRevision && !signal?.aborted)
      publish(false, new TrustError("Reconnect and try again.", "offline"));
    throw error;
  }
  if (revision !== sessionRevision && !path.startsWith("dev/"))
    throw new TrustError(
      "Your account changed. Reopen this page.",
      "session_account_changed",
    );
  if (
    privatePath &&
    (view !== verifiedView || view!.signal.aborted || !snapshot.ready)
  )
    throw new TrustError(
      "Check your current session and retry the same action.",
      "session_required",
    );
  if (response.ok && path === "session") {
    const isolatedDevelopment =
      result.localDevelopment === true && result.localActorSelection === true;
    const sessionId = result.sessionId ?? null;
    if (
      typeof result.accountId !== "string" ||
      (!isolatedDevelopment &&
        (typeof sessionId !== "string" ||
          !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(sessionId)))
    ) {
      const error = new TrustError(
        "Your current session could not be checked. Try again.",
        "session_context_unavailable",
        undefined,
        503,
      );
      publish(false, error);
      throw error;
    }
    if (
      verifiedView &&
      (verifiedView.accountId !== result.accountId ||
        verifiedView.sessionId !== sessionId ||
        verifiedView.isolatedDevelopment !== isolatedDevelopment)
    )
      invalidateSession();
    if (!verifiedView) {
      viewController = new AbortController();
      verifiedView = Object.freeze({
        accountId: result.accountId,
        sessionId,
        isolatedDevelopment,
        signal: viewController.signal,
      });
    }
    publish(true);
  }
  if (
    ["session_account_changed", "session_view_changed"].includes(
      result.error?.code,
    )
  )
    invalidateSession();
  if (path === "session" && response.status === 401 && verifiedView)
    invalidateSession();
  if (privatePath && response.status === 401) {
    // A concurrent token rotation can cause a transient 401. Conceal private
    // state and check the producer before ending this view or its drafts.
    publish(false, null, true);
    retryTrustReads();
  }
  if (!response.ok) {
    const error = new TrustError(
      result.error?.message ?? "This service is unavailable.",
      result.error?.code ?? "service_unavailable",
      result.error?.correlationId,
      response.status,
    );
    if (path === "session") publish(false, error);
    throw error;
  }
  return result as T;
}
/** The visible form captures its actual checked session and browser lifetime.
 * A late callback cannot borrow the replacement view's cookie or authority. */
export function useTrustRequest() {
  const { view } = useTrustSnapshot();
  const controller = useRef<AbortController | null>(null);
  if (!controller.current) controller.current = new AbortController();
  const [lifetime, setLifetime] = useState(() => controller.current!.signal);
  useEffect(() => {
    // Reuse the canonical boundary's actual effect-restart lifetime rule.
    // Old callbacks keep their aborted owner; departure cancels real fetches.
    if (controller.current!.signal.aborted)
      controller.current = new AbortController();
    const owner = controller.current!;
    setLifetime(owner.signal);
    return () => {
      owner.abort();
    };
  }, []);
  return useCallback(
    <T,>(path: string, body?: unknown, signal?: AbortSignal) =>
      requestForView<T>(
        path,
        body,
        AbortSignal.any([lifetime, ...(signal ? [signal] : [])]),
        view,
      ),
    [view, lifetime],
  );
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
/** Retry current reads together without granting an account or changing the
 * form/session epoch. Each real response retains the original account fence. */
export function retryTrustReads() {
  window.dispatchEvent(new Event("trust-retry"));
}
/** A disabled private read clears its result and cancels its real browser
 * request. Re-enabling always reads again; periodic session loading need not
 * disable a containing page. Browser cancellation is not a server receipt. */
export function useTrust<T>(path: string, enabled = true) {
  const currentSession = useTrustSnapshot();
  const privatePath = !isPublicPath(path);
  const view = privatePath ? currentSession.view : null;
  const readable = enabled && (!privatePath || currentSession.ready);
  const [result, setResult] = useState<{
    path: string;
    view: TrustView | null;
    data: T | null;
    error: TrustError | null;
  }>({ path, view, data: null, error: null });
  const [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    const current = ++sequence.current;
    request.current?.abort();
    request.current = null;
    setResult({ path, view, data: null, error: null });
    if (!readable) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const data = await requestForView<T>(
        path,
        undefined,
        controller.signal,
        view,
      );
      if (sequence.current === current)
        setResult({ path, view, data, error: null });
    } catch (error) {
      if (sequence.current === current)
        setResult({
          path,
          view,
          data: null,
          error:
            error instanceof TrustError
              ? error
              : new TrustError("Reconnect and try again.", "offline"),
        });
    } finally {
      if (sequence.current === current) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [path, readable, view]);
  useEffect(() => {
    void refresh();
    const update = () => void refresh();
    window.addEventListener("trust-session", update);
    window.addEventListener("trust-retry", update);
    return () => {
      sequence.current++;
      request.current?.abort();
      request.current = null;
      window.removeEventListener("trust-session", update);
      window.removeEventListener("trust-retry", update);
    };
  }, [refresh]);
  // Check the actual view during render, before effects can refetch/clear it.
  const visible = readable && result.path === path && result.view === view;
  return {
    data: visible ? result.data : null,
    error: visible ? result.error : null,
    loading: readable && (loading || !visible),
    refresh,
  };
}
export type TrustSessionState = {
  ready: boolean;
  error: TrustError | null;
};
export function TrustSession({
  capabilityError = null,
  showErrors = true,
  onSessionState,
}: {
  /** A containing page may already present the same capability failure. */
  capabilityError?: TrustError | null;
  /** Containing pages may present this same failure above their own form. */
  showErrors?: boolean;
  /** A containing privacy page presents one read failure and gates its actions
   * on the real session response. Periodic loading is not an account change. */
  onSessionState?: (state: TrustSessionState) => void;
} = {}) {
  const capability = useTrust<{
    localDevelopment: boolean;
    localActorSelection?: boolean;
  }>("capabilities");
  const { data } = capability;
  const session = useTrust<{ accountId: string; sessionId: string | null }>(
    "session",
  );
  const request = useTrustRequest();
  const sessionStatus = useTrustStatus();
  useLayoutEffect(() => {
    if (!sessionStatus.ready || capability.error || session.error)
      onSessionState?.({
        ready: false,
        error: capability.error ?? session.error ?? sessionStatus.error,
      });
    else if (session.data) onSessionState?.({ ready: true, error: null });
  }, [
    capability.error,
    session.error,
    session.data,
    sessionStatus.ready,
    sessionStatus.error,
    onSessionState,
  ]);
  const [actor, setActor] = useState("fan");
  const actorChoice = useRef<HTMLSelectElement | null>(null);
  const observedAccount = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const signOut = async () => {
    setBusy(true);
    try {
      await request("dev/logout", {});
      invalidateSession();
      notifySessionChange();
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Sign out unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const destination = IdentityContinueSchema.safeParse({
      returnTo: window.location.pathname + window.location.search,
    });
    // Appearance parameters are not identity navigation authority. Preserve
    // the registered Trust page when its optional query is not a return target.
    const page = IdentityContinueSchema.safeParse({
      returnTo: window.location.pathname,
    });
    setReturnTo(
      destination.success
        ? destination.data.returnTo
        : page.success
          ? page.data.returnTo
          : "/home",
    );
  }, []);
  useEffect(() => {
    const refresh = () => void session.refresh();
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const resume = () => {
      if (document.visibilityState === "visible") {
        publish(false, null, true);
        refresh();
      }
    };
    // Cross-tab messages are negative hints. Conceal results and recheck the
    // producer, but preserve drafts until a changed/ended session is confirmed.
    const changed = () => {
      publish(false, null, true);
      refresh();
    };
    const channels: BroadcastChannel[] = [];
    for (const name of ["trust-account", sessionChannel]) {
      try {
        channels.push(new BroadcastChannel(name));
      } catch {
        // Some browser contexts deny channels even when the API exists.
      }
    }
    for (const channel of channels) channel.onmessage = changed;
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = window.setInterval(visible, 4000);
    return () => {
      for (const channel of channels) channel.close();
      window.clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [session.refresh]);
  useEffect(() => {
    if (!data?.localDevelopment || !session.data) return;
    // A periodic refresh clears data while loading. Preserve the pending
    // selection unless the verified account actually changes.
    if (observedAccount.current === session.data.accountId) return;
    observedAccount.current = session.data.accountId;
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
  const continuation =
    returnTo &&
    !session.loading &&
    !session.data &&
    (!session.error || session.error.status === 401) ? (
      <a
        className="qv-link-btn"
        href={`/api/auth/continue?returnTo=${encodeURIComponent(returnTo)}`}
      >
        Continue with Pantopus
      </a>
    ) : null;
  if (capability.error)
    return capability.error.status === 401 ? (
      continuation
    ) : !showErrors ||
      onSessionState ||
      capability.error.code === capabilityError?.code ? null : (
      <ErrorState error={capability.error} retry={retryTrustReads} />
    );
  if (session.error && session.error.status !== 401)
    return !showErrors || onSessionState ? null : (
      <ErrorState error={session.error} retry={retryTrustReads} />
    );
  if (!data?.localDevelopment) return continuation;
  if (data.localActorSelection === false)
    return (
      <div className="trust-session">
        <p>Synthetic local accounts · no provider or production identity</p>
        {session.loading && (
          <p className="qv-help" role="status">
            Checking account…
          </p>
        )}
        {returnTo && !session.loading && (
          <a
            className="qv-link-btn"
            href={`/api/auth/continue?returnTo=${encodeURIComponent(returnTo)}`}
          >
            {session.data
              ? "Switch development account"
              : "Continue with Pantopus"}
          </a>
        )}
        {session.data && (
          <button
            className="qv-link-btn"
            disabled={busy}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    );
  return (
    <div className="trust-session">
      {continuation}
      <p>Synthetic local accounts · no provider or production identity</p>
      <label htmlFor="local-actor">Switch to local actor</label>
      <select
        id="local-actor"
        ref={actorChoice}
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
            await trustApi("dev/session", {
              actor: actorChoice.current?.value ?? actor,
            });
            invalidateSession();
            notifySessionChange();
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
        onClick={() => void signOut()}
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
