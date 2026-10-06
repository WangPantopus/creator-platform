"use client";
import { useCallback } from "react";
import { SessionSchema } from "@qelvora/api";
import { copy } from "@qelvora/copy";
import { useIdentityRequest } from "../identity/session-boundary";

export class GrowthActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Private fan views retain their actual issued session. Expected headers can
 * only refuse a mismatch; the server still resolves the genuine credential. */
export function useGrowthSession() {
  const {
    session,
    signal,
    end,
    request: identityRequest,
  } = useIdentityRequest();
  const request = useCallback(
    async <T = Record<string, unknown>>(
      path: string,
      init: RequestInit = {},
    ): Promise<T> => {
      signal.throwIfAborted();
      const workSignal = AbortSignal.any([
        signal,
        AbortSignal.timeout(10000),
        ...(init.signal ? [init.signal] : []),
      ]);
      const headers = new Headers(init.headers);
      headers.set("Content-Type", "application/json");
      headers.set("X-Expected-Account-Id", session.accountId);
      headers.set("X-Expected-Session-Id", session.sessionId);
      const originalSession = async () => {
        const response = await identityRequest("session", {
          signal: workSignal,
        });
        workSignal.throwIfAborted();
        if (!response.ok)
          throw new GrowthActionError(
            response.status,
            copy.growthTheServiceIsUnavailablePleaseTryAgain,
          );
        const current = SessionSchema.parse(await response.json());
        workSignal.throwIfAborted();
        if (
          current.accountId !== session.accountId ||
          current.sessionId !== session.sessionId
        )
          end();
        workSignal.throwIfAborted();
      };
      try {
        await originalSession();
        const response = await fetch(`/api/growth/${path}`, {
          ...init,
          headers,
          cache: "no-store",
          signal: workSignal,
        });
        const result = await response.json();
        workSignal.throwIfAborted();
        if (
          response.status === 409 &&
          ["session_account_changed", "session_view_changed"].includes(
            result.error?.code,
          )
        )
          end();
        workSignal.throwIfAborted();
        await originalSession();
        workSignal.throwIfAborted();
        if (!response.ok)
          throw new GrowthActionError(
            response.status,
            result.error?.message ?? copy.growthThisActionCouldNotBeCompleted,
          );
        return result as T;
      } catch (error) {
        signal.throwIfAborted();
        if (error instanceof GrowthActionError) throw error;
        throw new GrowthActionError(
          503,
          copy.growthTheServiceIsUnavailablePleaseTryAgain,
        );
      }
    },
    [session.accountId, session.sessionId, signal, end, identityRequest],
  );
  return { request, signal };
}
