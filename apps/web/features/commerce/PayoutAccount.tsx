"use client";
import { useEffect, useRef, useState } from "react";
import { commerceContracts, SessionSchema } from "@qelvora/api";

export function PayoutAccount({
  accountId,
  creatorId,
  record,
  available,
  disabled,
  fetchAccount,
}: {
  accountId: string;
  creatorId: string;
  record?: { state: string; details_due: boolean; version: number };
  available: boolean;
  disabled: boolean;
  fetchAccount(path: string, init?: RequestInit): Promise<Response>;
}) {
  const [result, setResult] =
    useState<commerceContracts.PayoutOnboardingResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!result?.expiresAt) return;
    const expiry = Date.parse(result.expiresAt);
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = expiry - Date.now();
      if (remaining <= 0) setExpired(true);
      else timer = setTimeout(check, Math.min(remaining, 2147483647));
    };
    check();
    return () => clearTimeout(timer);
  }, [result]);
  async function currentAccount(signal: AbortSignal) {
    const response = await fetchAccount("/api/platform/identity/session", {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      cache: "no-store",
    });
    if (
      !response.ok ||
      SessionSchema.parse(await response.json()).accountId !== accountId
    )
      throw new Error(
        "Your account changed. Continue with Pantopus before managing payouts.",
      );
  }
  async function start() {
    if (busy || disabled || !available || !record) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    setExpired(false);
    try {
      await currentAccount(controller.signal);
      const version = result?.version ?? record.version;
      const response = await fetchAccount(
        `/api/commerce/creators/${creatorId}/payout-onboarding`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message ??
            "Payout verification is unavailable. Refresh before trying again.",
        );
      const next = commerceContracts.PayoutOnboardingResult.parse(body);
      if (
        next.creatorId !== creatorId ||
        next.version <= version ||
        (next.expiresAt && Date.parse(next.expiresAt) <= Date.now())
      )
        throw new Error(
          "The payout account or verification link changed. Refresh before continuing.",
        );
      await currentAccount(controller.signal);
      if (!controller.signal.aborted) setResult(next);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Payout verification is unavailable. Refresh before trying again.",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const state = result?.state ?? record?.state;
  const due = result?.detailsDue ?? record?.details_due;
  return (
    <section className="commerce-card" aria-busy={busy}>
      <h2>Payout account</h2>
      <p>
        {state ?? "Not configured"}
        {due ? " · Verification details required" : ""}
      </p>
      {!record ? (
        <p>The approved payout account is not connected yet.</p>
      ) : !available ? (
        <p>Payout verification is not connected yet.</p>
      ) : (
        <>
          <button
            type="button"
            className="qv qv-btn qv-btn--secondary qv-btn--lg"
            disabled={disabled || busy}
            onClick={() => void start()}
          >
            {busy
              ? "Checking payout account…"
              : state === "enabled" && !due
                ? "Check verification status"
                : "Continue payout verification"}
          </button>
          {result?.url && !expired && (
            <p>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                referrerPolicy="no-referrer"
                onClick={(event) => {
                  if (
                    !result.expiresAt ||
                    Date.parse(result.expiresAt) <= Date.now()
                  ) {
                    event.preventDefault();
                    setExpired(true);
                  }
                }}
              >
                Continue to provider verification
              </a>
            </p>
          )}
          {result?.url && expired && (
            <p role="status">
              This verification link expired. Continue payout verification
              again.
            </p>
          )}
          {result?.state === "enabled" && (
            <p role="status">
              The provider reports verification complete. Current funds and
              payout eligibility are checked separately.
            </p>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
