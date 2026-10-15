"use client";
import { useState } from "react";
import { brand } from "@qelvora/brand";
import { copy } from "@qelvora/copy";
import { ContextCard, Notice } from "@qelvora/ui-web";

/** Option D's errors, in the approved wording. */
const signInErrors: Record<string, string> = {
  continuation_expired: copy.signInFailed,
  continuation_failed: copy.signInFailed,
  sign_in_unavailable: copy.signInUnavailable,
  rate_limited: copy.signInRateLimited,
};
export function IdentityWelcome({
  returnTo,
  arrival,
  error,
  providers = [],
  development = false,
}: {
  returnTo: string;
  arrival: { source: string; title: string; creatorName: string } | null;
  error?: string;
  /** Apple and Google, when the Qelvora sign-in is configured. */
  providers?: readonly ("apple" | "google")[];
  development?: boolean;
}) {
  const qelvora = providers.length > 0;
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
        {qelvora && error && signInErrors[error] && (
          <div>
            <Notice tone="error">{signInErrors[error]}</Notice>
          </div>
        )}
        {error && !(qelvora && signInErrors[error]) && (
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
                      : error === "adult_eligibility_required"
                        ? copy.adultOnlyTitle
                        : copy.pantopusUnavailableTitle
              }
            >
              {error === "invalid_return"
                ? "This arrival link is unavailable. You can continue to Home."
                : error === "continuation_expired" ||
                    error === "continuation_failed"
                  ? "Start again to return to your saved destination."
                  : error === "adult_eligibility_required"
                    ? copy.adultOnlyBody
                    : copy.pantopusUnavailable}
            </Notice>
          </div>
        )}
        {(["apple", "google"] as const)
          .filter((provider) => providers.includes(provider))
          .map((provider) => (
            <a
              key={provider}
              className="qv-btn qv-btn--secondary qv-btn--lg qv-btn--block"
              href={`/api/auth/start?provider=${provider}&returnTo=${encodeURIComponent(destination)}`}
            >
              {provider === "apple"
                ? copy.signInWithApple
                : copy.signInWithGoogle}
            </a>
          ))}
        {(!qelvora || development) && (
          <a
            className={`qv-btn ${qelvora ? "qv-btn--quiet" : "qv-btn--secondary qv-btn--lg"} qv-btn--block`}
            href={`/api/auth/continue?returnTo=${encodeURIComponent(destination)}`}
          >
            {error === "identity_unconfigured"
              ? copy.retry
              : copy.continueWithPantopus}
          </a>
        )}
        {error === "identity_unconfigured" && (
          <a
            className="qv-btn qv-btn--text qv-btn--block"
            href={`/auth/continue?returnTo=${encodeURIComponent(destination)}`}
          >
            {copy.back}
          </a>
        )}
        {!qelvora && <p>{copy.pantopusAccount}</p>}
      </div>
    </main>
  );
}
