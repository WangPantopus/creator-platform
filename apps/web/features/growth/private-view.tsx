"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SessionSchema, type Session } from "@qelvora/api";
import { Notice } from "@qelvora/ui-web";
import {
  IdentitySessionBoundary,
  sessionChannel,
  useIdentityRequest,
} from "../identity/session-boundary";

export function GrowthSessionBoundary({
  initial,
  returnTo,
  children,
}: {
  initial: Session;
  returnTo: string;
  children: React.ReactNode;
}) {
  return (
    <IdentitySessionBoundary initial={initial} returnTo={returnTo}>
      <PrivateView>{children}</PrivateView>
    </IdentitySessionBoundary>
  );
}

function PrivateView({ children }: { children: React.ReactNode }) {
  const { request, signal, session, end } = useIdentityRequest();
  const [store] = useState(() => {
    let concealed = false;
    const listeners = new Set<() => void>();
    return {
      read: () => concealed,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      set(value: boolean) {
        if (concealed === value) return;
        concealed = value;
        for (const listener of listeners) listener();
      },
    };
  });
  const concealed = useSyncExternalStore(
    store.subscribe,
    store.read,
    () => false,
  );
  const [retry, setRetry] = useState(0);
  const privateContent = useRef<HTMLDivElement>(null);
  const checkButton = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (concealed) {
      if (
        document.activeElement === document.body ||
        document.activeElement === previousFocus.current
      )
        checkButton.current?.focus();
    } else if (
      previousFocus.current?.isConnected &&
      (document.activeElement === document.body ||
        document.activeElement === checkButton.current)
    ) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [concealed]);
  useEffect(() => {
    const effect = new AbortController();
    let active = true,
      checking = false,
      pending = false,
      generation = 0;
    let validUntil = performance.now() + 5000;
    const hidePrivateContent = () => {
      if (
        !store.read() &&
        document.activeElement instanceof HTMLElement &&
        privateContent.current?.contains(document.activeElement)
      )
        previousFocus.current = document.activeElement;
      store.set(true);
    };
    const check = async () => {
      if (!active || document.hidden || signal.aborted) return;
      if (checking) {
        pending = true;
        return;
      }
      checking = true;
      const current = ++generation;
      const started = performance.now();
      try {
        const response = await request("session", {
          signal: AbortSignal.any([
            signal,
            effect.signal,
            AbortSignal.timeout(4000),
          ]),
        });
        if (!response.ok) throw new Error("Current account unavailable.");
        const original = SessionSchema.parse(await response.json());
        if (!active || signal.aborted || current !== generation) return;
        if (performance.now() - started >= 4000)
          throw new Error("Current account check expired.");
        if (
          original.accountId !== session.accountId ||
          original.sessionId !== session.sessionId
        ) {
          end();
          return;
        }
        if (!document.hidden) {
          validUntil = performance.now() + 5000;
          store.set(false);
        }
      } catch {
        if (active && !signal.aborted && current === generation)
          hidePrivateContent();
      } finally {
        checking = false;
        if (active && pending) {
          pending = false;
          void check();
        }
      }
    };
    const conceal = () => {
      // A negative hint is not session authority. Conceal synchronously while
      // preserving mounted input; only a canonical reread may restore it.
      generation++;
      hidePrivateContent();
      void check();
    };
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined")
        channel = new BroadcastChannel(sessionChannel);
    } catch {
      // Resume checks and W1's canonical polling remain available.
    }
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "ended") conceal();
      };
    window.addEventListener("focus", conceal);
    window.addEventListener("pageshow", conceal);
    document.addEventListener("visibilitychange", conceal);
    const polling = setInterval(() => void check(), 4000);
    const lease = setInterval(() => {
      if (performance.now() >= validUntil) hidePrivateContent();
    }, 500);
    void check();
    return () => {
      active = false;
      generation++;
      effect.abort();
      clearInterval(polling);
      clearInterval(lease);
      channel?.close();
      window.removeEventListener("focus", conceal);
      window.removeEventListener("pageshow", conceal);
      document.removeEventListener("visibilitychange", conceal);
    };
  }, [
    request,
    signal,
    session.accountId,
    session.sessionId,
    end,
    store,
    retry,
  ]);
  return (
    <>
      {concealed && (
        <div className="growth growth-stack">
          <Notice title="Checking your current account">
            Your input is kept in this tab. Reconnect to check your original
            account before continuing.
          </Notice>
          <button
            ref={checkButton}
            type="button"
            className="qv-btn qv-btn--secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Check current account
          </button>
        </div>
      )}
      <div ref={privateContent} hidden={concealed} inert={concealed}>
        {children}
      </div>
    </>
  );
}
