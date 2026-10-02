"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { copy } from "@qelvora/copy";
import { Notice } from "@qelvora/ui-web";
import { CallRouteSchema } from "../../../../packages/api/src/session";
import { useIdentityRequest } from "../identity/session-boundary";
import { mediaRequest } from "../media/api";
import { CallView } from "./CallView";

/** Navigation metadata does not authorize admission or any call action. */
export function AccountCallLookup({ sessionId }: { sessionId: string }) {
  const { session, signal } = useIdentityRequest();
  const [route, setRoute] = useState<ReturnType<
    typeof CallRouteSchema.parse
  > | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const requestSignal = AbortSignal.any([
      signal,
      controller.signal,
      AbortSignal.timeout(10000),
    ]);
    let active = true;
    setRoute(null);
    setLoading(true);
    setUnavailable(false);
    void (async () => {
      try {
        const current = CallRouteSchema.parse(
          await mediaRequest<unknown>(`calls/${sessionId}/route`, {
            expectedAccountId: session.accountId,
            signal: requestSignal,
          }),
        );
        requestSignal.throwIfAborted();
        if (current.sessionId.toLowerCase() !== sessionId.toLowerCase())
          throw new Error("Call destination mismatch");
        if (active) setRoute(current);
      } catch {
        if (active && !signal.aborted) setUnavailable(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [sessionId, session.accountId, session.sessionId, signal, attempt]);
  if (route) return <CallView {...route} actorAccountId={session.accountId} />;
  return (
    <main className="qv w6-call">
      <h1>{copy.w1CallLookupTitle}</h1>
      {loading && <p role="status">{copy.w1CallLookupChecking}</p>}
      {unavailable && (
        <Notice tone="error">{copy.w1CallLookupUnavailable}</Notice>
      )}
      <button
        type="button"
        className="qv-btn qv-btn--secondary qv-btn--lg qv-btn--block"
        disabled={loading}
        onClick={() => setAttempt((value) => value + 1)}
      >
        {copy.retry}
      </button>
      <Link href="/requests">{copy.w6OpenRequests}</Link>
    </main>
  );
}
