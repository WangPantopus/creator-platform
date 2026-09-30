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

type IdentityScope = {
  accountId: string;
  signal: AbortSignal;
  end: () => void;
  session: Session;
};
const Scope = createContext<IdentityScope | null>(null);
const sessionChannel = "qelvora-identity-status";

/** Only an invalidation signal crosses tabs; credentials and private data never do. */
export function announceSessionEnd() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(sessionChannel);
  channel.postMessage("ended");
  channel.close();
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
  const [valid, setValid] = useState(true);
  const [error, setError] = useState("");
  const [session, setSession] = useState(initial);
  const accountId = initial.accountId;
  const controller = useRef<AbortController | null>(null);
  if (!controller.current) controller.current = new AbortController();
  const end = useCallback(() => {
    controller.current?.abort();
    setValid(false);
    location.replace(`/auth/continue?returnTo=${encodeURIComponent(returnTo)}`);
  }, [returnTo]);
  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (!active || checking || controller.current?.signal.aborted) return;
      checking = true;
      try {
        const options = {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.current!.signal,
            AbortSignal.timeout(4000),
          ]),
        } satisfies RequestInit;
        let response = await fetch("/api/platform/identity/session", options);
        // Rotation can invalidate an in-flight request using the previous
        // cookie. Recheck the current cookie before ending the visible session.
        if (response.status === 401)
          response = await fetch("/api/platform/identity/session", options);
        if (!active) return;
        if (response.status === 401) {
          end();
          return;
        }
        if (!response.ok)
          throw new Error(
            "Reconnect to check your account status. Your unsaved input is kept.",
          );
        const session = SessionSchema.parse(await response.json());
        if (!active) return;
        if (session.accountId !== accountId) {
          end();
          return;
        }
        setError("");
        setSession(session);
      } catch {
        if (active && !controller.current?.signal.aborted)
          setError(
            "Reconnect to check your account status. Your unsaved input is kept.",
          );
      } finally {
        checking = false;
      }
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(sessionChannel);
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "ended") end();
      };
    const timer = setInterval(check, 4000);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    void check();
    return () => {
      active = false;
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [accountId, end]);
  if (!valid) return null;
  return (
    <Scope.Provider
      value={{ accountId, signal: controller.current.signal, end, session }}
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
  const signal = scope?.signal;
  const end = scope?.end;
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      if (!signal || !end || !accountId)
        throw new Error("Identity session required.");
      const headers = new Headers(init.headers);
      // This is a mismatch precondition, never a source of account authority.
      headers.set("X-Expected-Account-Id", accountId);
      const response = await fetch(`/api/platform/identity/${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(10000),
          ...(init.signal ? [init.signal] : []),
        ]),
      });
      if (response.status === 401) {
        const current = await fetch("/api/platform/identity/session", {
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]),
        });
        if (
          current.status === 401 ||
          (current.ok &&
            SessionSchema.parse(await current.json()).accountId !== accountId)
        )
          end();
      } else if (
        response.status === 409 &&
        (await response.clone().json()).error?.code ===
          "session_account_changed"
      )
        end();
      if (signal.aborted) throw new DOMException("Session ended", "AbortError");
      return response;
    },
    [accountId, signal, end],
  );
  if (!scope)
    throw new Error("Identity forms require an account session boundary.");
  return {
    signal: scope.signal,
    session: scope.session,
    end: scope.end,
    request,
  };
}
