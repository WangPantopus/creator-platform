"use client";
import { useState } from "react";
import { brand } from "@qelvora/brand";
import { copy } from "@qelvora/copy";
import { ContextCard, Notice } from "@qelvora/ui-web";

export function IdentityWelcome({
  returnTo,
  arrival,
  error,
}: {
  returnTo: string;
  arrival: { source: string; title: string; creatorName: string } | null;
  error?: string;
}) {
  const [context, setContext] = useState(arrival);
  const [destination, setDestination] = useState(returnTo);
  return (
    <main className="qv identity-welcome">
      <span className="identity-wordmark">{brand.name}</span>
      <div className="identity-welcome-body">
        <svg
          width="120"
          height="56"
          viewBox="0 0 120 56"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="28"
            cy="28"
            r="22"
            stroke="var(--ai-ink)"
            strokeWidth="2"
          />
          <circle cx="28" cy="28" r="5" fill="var(--ai-ink)" />
          <circle cx="80" cy="28" r="26" fill="var(--maya-surface)" />
          <circle cx="80" cy="28" r="12" fill="var(--maya-accent)" />
        </svg>
        <h1>{copy.welcomeTitle}</h1>
        <p>
          {context
            ? `Every message says who wrote it: ${context.creatorName}'s AI, ${context.creatorName}, or their team. You'll always know which.`
            : "Every message says who wrote it: the creator's AI, the creator, or their team. You'll always know which."}
        </p>
      </div>
      <div className="identity-welcome-actions">
        {context && (
          <ContextCard
            source={context.source}
            title={context.title}
            onRemove={() => {
              setContext(null);
              setDestination(destination.split("?")[0]!);
            }}
          />
        )}
        {error && (
          <div>
            <Notice
              tone="error"
              title={
                error === "invalid_return"
                  ? "Arrival link unavailable"
                  : error === "continuation_expired"
                    ? "Sign-in request expired"
                    : error === "continuation_failed"
                      ? "Sign-in could not complete"
                      : copy.pantopusUnavailableTitle
              }
            >
              {error === "invalid_return"
                ? "This arrival link is unavailable. You can continue to Home."
                : error === "continuation_expired" ||
                    error === "continuation_failed"
                  ? "Start again to return to your saved destination."
                  : copy.pantopusUnavailable}
            </Notice>
          </div>
        )}
        <a
          className="qv-btn qv-btn--secondary qv-btn--lg qv-btn--block"
          href={`/api/auth/continue?returnTo=${encodeURIComponent(destination)}`}
        >
          {copy.continueWithPantopus}
        </a>
        <p>{copy.pantopusAccount}</p>
      </div>
    </main>
  );
}
