"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SessionSchema, type Session } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import { sessionChannel } from "../identity/session-boundary";
import { GrowthActionError } from "./session";

/** Public pages remain readable. Their private controls capture actual W1
 * session responses and discard account state when that lifetime changes. */
export function useGrowthPublicSession(context: string) {
  const lifetime = useRef(new AbortController());
  const original = useRef<Session | null>(null);
  const active = useRef(true);
  const [revision, setRevision] = useState(0);
  const clear = useCallback(() => {
    lifetime.current.abort();
    lifetime.current = new AbortController();
    original.current = null;
    if (active.current) setRevision((value) => value + 1);
  }, []);
  const current = useCallback(async (signal: AbortSignal) => {
    const response = await fetch("/api/platform/identity/session", {
      cache: "no-store",
      signal,
    });
    if (!response.ok)
      throw new GrowthActionError(
        response.status,
        response.status === 401
          ? copy.growthContinueWithPantopusToOpenYourAccountSCurrentState
          : copy.growthTheServiceIsUnavailablePleaseTryAgain,
      );
    return SessionSchema.parse(await response.json());
  }, []);
  const request = useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      if (document.visibilityState !== "visible")
        throw new DOMException("Page hidden", "AbortError");
      const capturedLifetime = lifetime.current;
      const signal = AbortSignal.any([
        capturedLifetime.signal,
        AbortSignal.timeout(10000),
        ...(init.signal ? [init.signal] : []),
      ]);
      const same = (session: Session) => {
        const captured = original.current;
        if (
          captured &&
          (captured.accountId !== session.accountId ||
            captured.sessionId !== session.sessionId)
        ) {
          clear();
          throw new GrowthActionError(
            401,
            copy.growthContinueWithPantopusToOpenYourAccountSCurrentState,
          );
        }
        signal.throwIfAborted();
      };
      let before: Session;
      try {
        before = await current(signal);
      } catch (error) {
        if (
          original.current &&
          lifetime.current === capturedLifetime &&
          active.current
        )
          clear();
        throw error;
      }
      same(before);
      original.current ??= before;
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      headers.set("X-Expected-Account-Id", before.accountId);
      // A replacement cookie for the same account must not authorize this
      // original public-page action. Ordinary token rotation keeps this ID.
      headers.set("X-Expected-Session-Id", before.sessionId);
      const response = await fetch(`/api/growth/${path}`, {
        ...init,
        headers,
        signal,
        cache: "no-store",
      });
      const result = await response.json();
      try {
        same(await current(signal));
      } catch (error) {
        if (lifetime.current === capturedLifetime && active.current) clear();
        throw error;
      }
      if (!response.ok)
        throw new GrowthActionError(
          response.status,
          result.error?.message ?? copy.growthThisActionCouldNotBeCompleted,
        );
      return result as T;
    },
    [clear, current],
  );
  useEffect(() => {
    active.current = true;
    if (lifetime.current.signal.aborted)
      lifetime.current = new AbortController();
    const check = () => {
      if (document.visibilityState !== "visible") {
        if (original.current) clear();
        return;
      }
      const captured = original.current;
      if (!captured) return;
      const pending = lifetime.current;
      void current(AbortSignal.any([pending.signal, AbortSignal.timeout(4000)]))
        .then((session) => {
          if (
            active.current &&
            lifetime.current === pending &&
            (session.accountId !== captured.accountId ||
              session.sessionId !== captured.sessionId)
          )
            clear();
        })
        .catch(() => {
          if (active.current && lifetime.current === pending) clear();
        });
    };
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined")
        channel = new BroadcastChannel(sessionChannel);
    } catch {
      /* Canonical bounded polling remains available. */
    }
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === "ended") check();
      };
    const timer = setInterval(check, 4000);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", clear);
    return () => {
      active.current = false;
      lifetime.current.abort();
      original.current = null;
      clearInterval(timer);
      channel?.close();
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", clear);
    };
  }, [clear, current, context]);
  return { request, revision };
}
