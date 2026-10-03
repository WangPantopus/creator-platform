"use client";
import { useEffect, useRef } from "react";
import { copy } from "@qelvora/copy";
import { Notice } from "@qelvora/ui-web";
import { sessionUnavailableDigest } from "../lib/session-digest";

/** Root recovery state. A platform outage never looks like a sign-out. */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const account = error.digest === sessionUnavailableDigest;
  const message = useRef<HTMLDivElement>(null);
  useEffect(() => message.current?.focus(), []);
  return (
    <main className="qv route-error">
      <div ref={message} tabIndex={-1} role="alert">
        <Notice
          tone="error"
          title={
            account ? copy.accountUnavailableTitle : copy.pageUnavailableTitle
          }
        >
          {account ? copy.accountUnavailableBody : copy.pageUnavailableBody}
        </Notice>
      </div>
      <button
        type="button"
        className="qv-btn qv-btn--secondary qv-btn--lg qv-btn--block"
        onClick={() => retry()}
      >
        {copy.retry}
      </button>
    </main>
  );
}
