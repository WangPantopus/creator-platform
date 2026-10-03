"use client";
import { useCallback } from "react";
import { copy } from "@qelvora/copy";
import { SessionSchema } from "@qelvora/api";
import { useIdentityRequest } from "../identity/session-boundary";

export class GrowthActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Private Growth forms use W1's actual issued session lifetime. The account
 * header is only a mismatch precondition; the server still resolves authority. */
export function useGrowthSession() {
  const identity = useIdentityRequest();
  const { signal, session, end, request: identityRequest } = identity;
  const request = useCallback(
    async <T>(path: string, init: RequestInit = {}): Promise<T> => {
      signal.throwIfAborted();
      const workSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(10000),
        ...(init.signal ? [init.signal] : []),
      ]);
      const originalSession = async () => {
        const response = await identityRequest("session", {
          signal: workSignal,
        });
        if (!response.ok)
          throw new GrowthActionError(
            response.status,
            response.status === 401
              ? copy.growthContinueWithPantopusToOpenYourAccountSCurrentState
              : copy.growthTheServiceIsUnavailablePleaseTryAgain,
          );
        const current = SessionSchema.parse(await response.json());
        if (
          current.accountId !== session.accountId ||
          current.sessionId !== session.sessionId
        )
          end();
        workSignal.throwIfAborted();
      };
      // Read W1's actual session around each private action. A matching account
      // header cannot distinguish a replacement session for the same account.
      await originalSession();
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      headers.set("X-Expected-Account-Id", session.accountId);
      const response = await fetch(`/api/growth/${path}`, {
        ...init,
        headers,
        cache: "no-store",
        signal: workSignal,
      });
      const result = await response.json();
      if (
        response.status === 409 &&
        result.error?.code === "session_account_changed"
      )
        end();
      await originalSession();
      workSignal.throwIfAborted();
      if (!response.ok)
        throw new GrowthActionError(
          response.status,
          result.error?.message ?? copy.growthThisActionCouldNotBeCompleted,
        );
      return result as T;
    },
    [signal, session.accountId, session.sessionId, end, identityRequest],
  );
  return { request, signal };
}
