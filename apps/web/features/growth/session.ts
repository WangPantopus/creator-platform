"use client";
import { useCallback } from "react";
import { copy } from "@qelvora/copy";
import { useIdentityRequest } from "../identity/session-boundary";

/** Private Growth forms use W1's actual issued session lifetime. The account
 * header is only a mismatch precondition; the server still resolves authority. */
export function useGrowthSession() {
  const identity = useIdentityRequest();
  const { signal, session, end, request: identityRequest } = identity;
  const request = useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      signal.throwIfAborted();
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      headers.set("X-Expected-Account-Id", session.accountId);
      const response = await fetch(`/api/growth/${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal: AbortSignal.any([
          signal,
          AbortSignal.timeout(10000),
          ...(init.signal ? [init.signal] : []),
        ]),
      });
      const result = await response.json();
      if (response.status === 401) await identityRequest("session");
      if (
        response.status === 409 &&
        result.error?.code === "session_account_changed"
      )
        end();
      signal.throwIfAborted();
      if (!response.ok)
        throw new Error(
          result.error?.message ?? copy.growthThisActionCouldNotBeCompleted,
        );
      return result as T;
    },
    [signal, session.accountId, end, identityRequest],
  );
  return { request, signal };
}
