"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { commerceContracts, SessionSchema } from "@qelvora/api";
import { CardEntry, authenticateCard } from "./CardEntry";

type Attempt = {
  quoteId: string;
  version: number;
  paymentMethodId: string;
  renewalConsent: true;
  idempotencyKey: string;
};

/** Account-fenced consumer of the installed original pass journal. Network
 * uncertainty keeps the original command; it never opens another card form. */
export function PassCheckout({
  accountId,
  publishableKey,
  available,
  disabled,
  fetchAccount,
  refresh,
  money,
}: {
  accountId: string;
  publishableKey: string | null;
  available: boolean;
  disabled: boolean;
  fetchAccount(path: string, init?: RequestInit): Promise<Response>;
  refresh(): Promise<void>;
  money(amount: number, currency: string): string;
}) {
  const [billing, setBilling] =
    useState<commerceContracts.PassBillingStatus | null>(null);
  const [quote, setQuote] =
    useState<commerceContracts.PassPurchaseQuote | null>(null);
  const [consent, setConsent] = useState(false);
  const [card, setCard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const original = useRef<Attempt | null>(null);
  const cancellation = useRef<{
    version: number;
    idempotencyKey: string;
  } | null>(null);
  const request = useCallback(
    async (path: string, body?: unknown, signal?: AbortSignal) => {
      if (body !== undefined) {
        const session = await fetchAccount("/api/platform/identity/session", {
          signal: AbortSignal.timeout(5000),
        });
        if (
          !session.ok ||
          SessionSchema.parse(await session.json()).accountId !== accountId
        )
          throw new Error(
            "Your account changed. Continue with Pantopus before using this quote.",
          );
      }
      const response = await fetchAccount(`/api/commerce/pass/${path}`, {
        ...(body === undefined
          ? {}
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
        ...(signal ? { signal } : {}),
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          value.error?.message ??
            "Pass billing is unavailable. Check its current status before retrying.",
        );
      return value;
    },
    [accountId, fetchAccount],
  );
  const current = useCallback(
    async (signal?: AbortSignal) => {
      const value = commerceContracts.PassBillingStatus.parse(
        await request("billing", undefined, signal),
      );
      if (!signal?.aborted) setBilling(value);
      return value;
    },
    [request],
  );
  useEffect(() => {
    if (!available) return;
    const abort = new AbortController();
    void current(abort.signal).catch((e) => {
      if (!abort.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Pass billing is unavailable.",
        );
    });
    return () => abort.abort();
  }, [available, current]);
  useEffect(() => {
    if (!quote) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote]);
  const expires = quote ? new Date(quote.expiresAt).getTime() : 0;
  const locked = disabled || busy;
  const date = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  async function work(action: () => Promise<void>) {
    if (locked) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Check the current pass status before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reconcile() {
    const originalState = original.current
      ? commerceContracts.PassPurchaseStatus.parse(
          await request("purchase-status", original.current),
        )
      : null;
    if (originalState?.state === "expired_uncommitted") {
      original.current = null;
      setQuote(null);
      setConsent(false);
      setUncertain(false);
    }
    const value = await current();
    for (const effect of value.effects) {
      const result = commerceContracts.PassPurchaseEffect.parse(
        await request(`effects/${effect.id}/reconcile`, {}),
      );
      if (result.clientSecret && publishableKey)
        await authenticateCard(publishableKey, result.clientSecret);
    }
    const latest = await current();
    // A missing effect does not prove an uncertain original POST never arrived.
    // Keep its exact body/key until a successful replay confirms its result.
    if (originalState?.state === "recorded" && !latest.processing) {
      original.current = null;
      setQuote(null);
      setConsent(false);
    }
    if (!original.current && !latest.processing) setUncertain(false);
    await refresh();
  }
  async function purchase(body: Attempt) {
    setUncertain(true);
    setCard(false);
    const result = commerceContracts.PassPurchaseEffect.parse(
      await request("purchase", body),
    );
    if (result.clientSecret && publishableKey) {
      await authenticateCard(publishableKey, result.clientSecret);
      await request(`effects/${result.effectId}/reconcile`, {});
    }
    original.current = null;
    setQuote(null);
    setConsent(false);
    const latest = await current();
    setUncertain(latest.processing);
    await refresh();
  }
  if (!available) return null;
  return (
    <section className="commerce-card" aria-labelledby="pass-billing-title">
      <h2 id="pass-billing-title">Pass billing</h2>
      {error && <p role="alert">{error}</p>}
      {billing && (
        <p>
          Your renewal choice:{" "}
          {billing.desiredRenewal ? "renew each month" : "do not renew"}.
        </p>
      )}
      {(billing?.processing || uncertain) && (
        <p role="status">
          Your original purchase or renewal change is processing. Check its
          status before starting another purchase.
        </p>
      )}
      <button
        className="commerce-link-button"
        disabled={locked}
        onClick={() => void work(reconcile)}
      >
        Check purchase status
      </button>
      {original.current && (
        <button
          className="commerce-link-button"
          disabled={locked}
          onClick={() => void work(() => purchase(original.current!))}
        >
          Retry original confirmation
        </button>
      )}
      {billing?.desiredRenewal && (
        <button
          className="commerce-link-button"
          disabled={locked}
          onClick={() =>
            void work(async () => {
              const body = cancellation.current ?? {
                version: billing.version,
                idempotencyKey: crypto.randomUUID(),
              };
              cancellation.current = body;
              await request("cancel", body);
              cancellation.current = null;
              setCard(false);
              setQuote(null);
              setConsent(false);
              await current();
              await refresh();
            })
          }
        >
          Stop renewal; keep this paid period
        </button>
      )}
      {!billing?.desiredRenewal && (
        <button
          className="commerce-link-button"
          disabled={
            locked ||
            !billing ||
            billing.processing ||
            uncertain ||
            !publishableKey
          }
          onClick={() =>
            void work(async () => {
              const value = commerceContracts.PassPurchaseQuote.parse(
                await request("quote", {}),
              );
              setQuote(value);
              setConsent(false);
              setNow(Date.now());
            })
          }
        >
          Review current pass price
        </button>
      )}
      {!publishableKey && <p>Secure card entry is not connected yet.</p>}
      {quote && (
        <>
          <h3>Review your pass</h3>
          <p>
            Pay {money(quote.amount, quote.currency)} for the period ending{" "}
            {date(quote.periodEndsAt)} UTC.
          </p>
          <p>
            {quote.slotCapacity} creator slots and {quote.allowance} shared AI
            cost units for this first period. Membership-included AI uses no
            slot.
          </p>
          <p>
            Monthly base price: {money(quote.monthlyAmount, quote.currency)}.
            Taxes, where applicable, are calculated on the renewal invoice. Each
            full month includes {quote.monthlyAllowance} shared AI cost units.
          </p>
          <p id="pass-renewal-terms">
            Renewal is on the 1st of each month. You can stop renewal and keep
            access until the paid period ends.
          </p>
          <label>
            <input
              type="checkbox"
              checked={consent}
              disabled={locked || now >= expires || uncertain}
              aria-describedby="pass-renewal-terms"
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            I agree to this purchase and monthly renewal.
          </label>
          {now >= expires && (
            <p role="status">
              This quote expired. Review a fresh price before confirming.
            </p>
          )}
          <button
            className="commerce-link-button"
            disabled={
              locked ||
              !consent ||
              now >= expires ||
              uncertain ||
              billing?.processing ||
              !publishableKey
            }
            onClick={() => setCard(true)}
          >
            Continue to secure card entry
          </button>
          {card && publishableKey && (
            <CardEntry
              publishableKey={publishableKey}
              busy={locked}
              confirmationDisabled={now >= expires || !consent || uncertain}
              title="Confirm your pass purchase"
              description={`Pay ${money(quote.amount, quote.currency)} now. Monthly renewal follows the terms you reviewed.`}
              label={`Pay ${money(quote.amount, quote.currency)} and renew monthly`}
              returnLabel="Return to pass review"
              onCancel={() => setCard(false)}
              onMethod={async (paymentMethodId) => {
                if (!consent || Date.now() >= expires || uncertain)
                  throw new Error(
                    "Review the current price and renewal terms before confirming.",
                  );
                const body: Attempt = {
                  quoteId: quote.quoteId,
                  version: quote.version,
                  paymentMethodId,
                  renewalConsent: true,
                  idempotencyKey: crypto.randomUUID(),
                };
                original.current = body;
                await work(() => purchase(body));
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
