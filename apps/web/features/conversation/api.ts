"use client";
import { useCallback } from "react";
import { SessionSchema } from "@qelvora/api";
import { useIdentityRequest } from "../identity/session-boundary";

export class ConversationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function conversationRequest<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  expectedAccountId?: string,
  expectedSessionId?: string,
): Promise<T> {
  signal?.throwIfAborted();
  const response = await fetch(`/api/conversations/${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "X-Correlation-Id": crypto.randomUUID(),
      ...(expectedAccountId
        ? { "X-Expected-Account-Id": expectedAccountId }
        : {}),
      ...(expectedSessionId
        ? { "X-Expected-Session-Id": expectedSessionId }
        : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: signal ?? AbortSignal.timeout(10000),
  });
  const data = await response.json();
  signal?.throwIfAborted();
  if (!response.ok)
    throw new ConversationError(
      data.error?.code ?? "unavailable",
      data.error?.message ?? "This conversation is unavailable.",
      response.status,
    );
  return data as T;
}

/** W1 owns identity and invalidation. The account header is only a mismatch
 * precondition; the BFF and backend authorize using the current session. */
export function useConversationRequest() {
  const {
    signal,
    session,
    end,
    request: identityRequest,
  } = useIdentityRequest();
  const accountId = session.accountId;
  const sessionId = session.sessionId;
  return useCallback(
    async <T>(path: string, body?: unknown, requestSignal?: AbortSignal) => {
      try {
        const result = await conversationRequest<T>(
          path,
          body,
          AbortSignal.any([
            signal,
            AbortSignal.timeout(10000),
            ...(requestSignal ? [requestSignal] : []),
          ]),
          accountId,
          sessionId,
        );
        if (signal.aborted)
          throw new DOMException("Session ended", "AbortError");
        return result;
      } catch (error) {
        if (
          error instanceof ConversationError &&
          (error.code === "session_account_changed" ||
            error.code === "session_view_changed")
        )
          end();
        else if (error instanceof ConversationError && error.status === 401) {
          // W1 rechecks the current cookie before ending an in-flight request
          // that may have raced ordinary session rotation.
          const current = await identityRequest("session");
          const original = current.ok
            ? SessionSchema.parse(await current.json())
            : undefined;
          signal.throwIfAborted();
          if (
            current.status === 401 ||
            (original &&
              (original.accountId !== accountId ||
                original.sessionId !== sessionId))
          )
            end();
        }
        throw error;
      }
    },
    [accountId, sessionId, signal, end, identityRequest],
  );
}
