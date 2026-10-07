"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { SessionSchema, type Session } from "@qelvora/api";
import { Notice } from "@qelvora/ui-web";
import { discardPrivateSessionBuffers } from "./private-session-buffers";

type IdentityScope = {
  accountId: string;
  signal: AbortSignal;
  end: () => void;
  /** Presentation cleanup only: ordinary view disposal cancels requests but
   * does not imply that this view's account session ended. */
  isSessionEnded: () => boolean;
  session: Session;
};
const Scope = createContext<IdentityScope | null>(null);
export const sessionChannel = "qelvora-identity-status";

/** Only an invalidation signal crosses tabs; credentials and private data never do. */
export function announceSessionEnd(original: {
  accountId: string;
  sessionId: string;
}) {
  discardPrivateSessionBuffers(original);
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(sessionChannel);
    try {
      channel.postMessage("ended");
    } finally {
      channel.close();
    }
  } catch {
    // Optional cross-tab notification cannot prevent the actual local end.
  }
}

/** Unmount private drafts on revocation or account switch, including return from bfcache. */
export function IdentitySessionBoundary({
  initial,
  returnTo,
  children,
}: {
  initial: Session;
  returnTo: string;
  children: React.ReactNode;
}) {
  return (
    <IdentitySessionView
      key={`${initial.accountId}:${initial.sessionId}:${returnTo}`}
      initial={initial}
      returnTo={returnTo}
    >
      {children}
    </IdentitySessionView>
  );
}

function IdentitySessionView({
  initial,
  returnTo,
  children,
}: {
  initial: Session;
  returnTo: string;
  children: React.ReactNode;
}) {
  const [valid, setValid] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState(initial);
  const accountId = initial.accountId;
  const sessionId = initial.sessionId;
  const controller = useRef<AbortController | null>(null);
  const endedLifetimes = useRef(new WeakSet<AbortSignal>());
  if (!controller.current) controller.current = new AbortController();
  const [lifetime, setLifetime] = useState(() => ({
    signal: controller.current!.signal,
    revision: 0,
  }));
  const signal = lifetime.signal;
  const end = useCallback(
    (original: AbortSignal) => {
      if (original.aborted || controller.current?.signal !== original) return;
      endedLifetimes.current.add(original);
      discardPrivateSessionBuffers({ accountId, sessionId });
      controller.current.abort();
      setValid(false);
      location.replace(
        `/auth/continue?returnTo=${encodeURIComponent(returnTo)}`,
      );
    },
    [accountId, sessionId, returnTo],
  );
  const endOriginal = useCallback(() => end(signal), [end, signal]);
  const isSessionEnded = useCallback(
    () => endedLifetimes.current.has(signal),
    [signal],
  );
  useEffect(() => {
    // Development effect restarts need a fresh lifetime. Old consumers retain
    // their aborted signal; they cannot end or update this replacement view.
    if (controller.current!.signal.aborted)
      controller.current = new AbortController();
    const owner = controller.current!;
    setLifetime((previous) =>
      previous.signal === owner.signal
        ? previous
        : { signal: owner.signal, revision: previous.revision + 1 },
    );
    let active = true;
    let checking = false;
    const check = async () => {
      if (!active || checking || owner.signal.aborted) return;
      checking = true;
      try {
        const options = {
          cache: "no-store",
          signal: AbortSignal.any([owner.signal, AbortSignal.timeout(4000)]),
        } satisfies RequestInit;
        let response = await fetch("/api/platform/identity/session", options);
        if (!active || owner.signal.aborted) return;
        // Rotation can invalidate an in-flight request using the previous
        // cookie. Recheck the current cookie before ending the visible session.
        if (response.status === 401)
          response = await fetch("/api/platform/identity/session", options);
        if (!active || owner.signal.aborted) return;
        if (response.status === 401) {
          end(owner.signal);
          return;
        }
        if (!response.ok)
          throw new Error(
            "Reconnect to check your account status. Your unsaved input is kept.",
          );
        const session = SessionSchema.parse(await response.json());
        if (!active || owner.signal.aborted) return;
        if (
          session.accountId !== accountId ||
          session.sessionId !== sessionId
        ) {
          end(owner.signal);
          return;
        }
        setError("");
        setSession(session);
      } catch {
        if (active && !owner.signal.aborted)
          setError(
            "Reconnect to check your account status. Your unsaved input is kept.",
          );
      } finally {
        checking = false;
      }
    };
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined")
        channel = new BroadcastChannel(sessionChannel);
    } catch {
      // The genuine bounded session reread still detects invalidation.
    }
    if (channel)
      channel.onmessage = (event) => {
        // A delayed negative hint from an older session cannot end a newer
        // genuine view. Only the existing canonical reread decides that.
        if (active && event.data === "ended") void check();
      };
    const timer = setInterval(check, 4000);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    void check();
    return () => {
      active = false;
      owner.abort();
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [accountId, sessionId, end]);
  if (!valid) return null;
  return (
    <Scope.Provider
      key={lifetime.revision}
      value={{ accountId, signal, end: endOriginal, isSessionEnded, session }}
    >
      {error && (
        <Notice title="Account status" tone="offline">
          {error}
        </Notice>
      )}
      {children}
    </Scope.Provider>
  );
}

export function useIdentityRequest() {
  const scope = useContext(Scope);
  const accountId = scope?.accountId;
  const sessionId = scope?.session.sessionId;
  const signal = scope?.signal;
  const end = scope?.end;
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!signal || !end || !accountId || !sessionId)
        throw new Error("Identity session required.");
      const original = AbortSignal.any([
        signal,
        AbortSignal.timeout(10000),
        ...(init.signal ? [init.signal] : []),
      ]);
      original.throwIfAborted();
      const headers = new Headers(init.headers);
      // This is a mismatch precondition, never a source of account authority.
      headers.set("X-Expected-Account-Id", accountId);
      headers.set("X-Expected-Session-Id", sessionId);
      const response = await fetch(`/api/platform/identity/${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal: original,
      });
      original.throwIfAborted();
      if (response.status === 401) {
        const current = await fetch("/api/platform/identity/session", {
          cache: "no-store",
          signal: AbortSignal.any([original, AbortSignal.timeout(4000)]),
        });
        original.throwIfAborted();
        const session = current.ok
          ? SessionSchema.parse(await current.json())
          : undefined;
        original.throwIfAborted();
        if (
          current.status === 401 ||
          (session &&
            (session.accountId !== accountId ||
              session.sessionId !== sessionId))
        )
          end();
      } else if (response.status === 409) {
        const failure = await response.clone().json();
        original.throwIfAborted();
        if (
          failure.error?.code === "session_account_changed" ||
          failure.error?.code === "session_view_changed"
        )
          end();
      }
      original.throwIfAborted();
      return response;
    },
    [accountId, sessionId, signal, end],
  );
  if (!scope)
    throw new Error("Identity forms require an account session boundary.");
  return {
    signal: scope.signal,
    session: scope.session,
    end: scope.end,
    isSessionEnded: scope.isSessionEnded,
    request,
  };
}
