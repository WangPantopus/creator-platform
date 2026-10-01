"use client";
import { useEffect, useRef, useState } from "react";
type Card = { mount(node: HTMLElement): void; destroy(): void };
type StripeClient = {
  elements(): { create(kind: "card", options: Record<string, unknown>): Card };
  createPaymentMethod(input: {
    type: "card";
    card: Card;
  }): Promise<{ paymentMethod?: { id: string }; error?: { message?: string } }>;
  confirmCardPayment(secret: string): Promise<{ error?: { message?: string } }>;
};
declare global {
  interface Window {
    Stripe?: (key: string) => StripeClient;
  }
}
let loading: Promise<void> | undefined;
async function loadStripe() {
  if (window.Stripe) return;
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = () => resolve();
    script.onerror = () => {
      loading = undefined;
      reject(new Error("Card entry could not connect. Your draft is kept."));
    };
    document.head.append(script);
  });
  await loading;
}
export async function authenticateCard(key: string, secret: string) {
  await loadStripe();
  const stripe = window.Stripe?.(key);
  if (!stripe) throw new Error("Payment authentication is unavailable.");
  const result = await stripe.confirmCardPayment(secret);
  if (result.error)
    throw new Error(result.error.message ?? "Authentication did not complete.");
}
/** Hosted processor fields: raw card details never enter app forms, state, API or logs. */
export function CardEntry({
  publishableKey,
  busy,
  label,
  onMethod,
  onCancel,
  title = "A hold, not a charge",
  description = "Your bank may show a pending hold for a few days. Charged only when the creator accepts.",
  returnLabel = "Return to your request",
}: {
  publishableKey: string;
  busy: boolean;
  label: string;
  onMethod: (id: string) => Promise<void>;
  onCancel: () => void;
  title?: string;
  description?: string;
  returnLabel?: string;
}) {
  const mount = useRef<HTMLDivElement>(null),
    client = useRef<StripeClient | null>(null),
    card = useRef<Card | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [sending, setSending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    void loadStripe()
      .then(() => {
        if (!active || !mount.current) return;
        const stripe = window.Stripe?.(publishableKey);
        if (!stripe) throw new Error("Card entry is unavailable.");
        client.current = stripe;
        const element = stripe.elements().create("card", {
          hidePostalCode: false,
          style: {
            base: {
              color: getComputedStyle(mount.current).color,
              fontSize: "16px",
            },
          },
        });
        card.current = element;
        element.mount(mount.current);
        setReady(true);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Card entry is unavailable.",
          );
      });
    return () => {
      active = false;
      card.current?.destroy();
      card.current = null;
      client.current = null;
    };
  }, [publishableKey]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="commerce-card-title"
      className="commerce-checkout"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy && !sending) onCancel();
      }}
    >
      <h2 id="commerce-card-title">{title}</h2>
      <p>{description}</p>
      <div
        ref={mount}
        className="commerce-card-field"
        aria-label="Secure card details"
      />
      {error && <p role="alert">{error}</p>}
      <button
        className="qv qv-btn qv-btn--secondary qv-btn--lg"
        disabled={!ready || busy || sending}
        onClick={async () => {
          if (!client.current || !card.current) return;
          setSending(true);
          setError("");
          try {
            const result = await client.current.createPaymentMethod({
              type: "card",
              card: card.current,
            });
            if (result.error || !result.paymentMethod)
              throw new Error(
                result.error?.message ?? "Check your card details.",
              );
            await onMethod(result.paymentMethod.id);
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Payment is unavailable.",
            );
          } finally {
            setSending(false);
          }
        }}
      >
        {sending ? "Confirming…" : label}
      </button>
      <button
        className="qv qv-btn qv-btn--quiet"
        disabled={busy || sending}
        onClick={onCancel}
      >
        {returnLabel}
      </button>
    </dialog>
  );
}
