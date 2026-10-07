"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { copy } from "@qelvora/copy";
import {
  TrustSession,
  TrustError,
  useTrustStatus,
  useTrustRequest,
  useTrustSession,
} from "../../ops/trust-client";
export default function FeedbackPage() {
  const request = useTrustRequest();
  const sessionState = useTrustStatus();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const retryKey = useRef<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const epoch = useTrustSession(() => {
    form.current?.reset();
    setMessage("");
    setBusy(false);
    setSaved(false);
    retryKey.current = null;
  });
  return (
    <main className="trust-page">
      <Link href="/support">Support</Link>
      <h1>Optional product feedback</h1>
      <p>
        Your answers help us evaluate usefulness and whether authorship is
        clear. They do not affect access, ranking or payment. Feedback is
        retained for 90 days and is included in account deletion.
      </p>
      <TrustSession />
      <form
        hidden={sessionState.concealed}
        ref={form}
        className="trust-panel"
        onChange={() => {
          if (busy) return;
          retryKey.current = null;
          setSaved(false);
          setMessage("");
        }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!sessionState.ready || busy || saved) return;
          const current = epoch.current;
          setBusy(true);
          const input = new FormData(event.currentTarget);
          retryKey.current ??= crypto.randomUUID();
          try {
            await request("feedback", {
              consent: input.get("consent") === "on",
              cohort: input.get("cohort"),
              useful: input.get("useful") === "yes",
              authorshipClear: input.get("clear") === "yes",
              comment: input.get("comment"),
              idempotencyKey: retryKey.current,
            });
            if (epoch.current !== current) return;
            setMessage("Your feedback is saved.");
            setSaved(true);
          } catch (error) {
            if (epoch.current !== current) return;
            setMessage(
              error instanceof TrustError
                ? error.message
                : copy.productFeedbackUnconfirmed,
            );
          } finally {
            if (epoch.current === current) setBusy(false);
          }
        }}
      >
        <label htmlFor="feedback-cohort">Creator mode</label>
        <select id="feedback-cohort" name="cohort" disabled={busy}>
          <option value="unspecified">Prefer not to say</option>
          <option value="expert">Expert</option>
          <option value="companion">Companion</option>
          <option value="blend">Blend</option>
        </select>
        <fieldset disabled={busy}>
          <legend>Was the conversation useful?</legend>
          <label>
            <input type="radio" name="useful" value="yes" required /> Yes
          </label>
          <label>
            <input type="radio" name="useful" value="no" /> No
          </label>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Was it clear who wrote each message?</legend>
          <label>
            <input type="radio" name="clear" value="yes" required /> Yes
          </label>
          <label>
            <input type="radio" name="clear" value="no" /> No
          </label>
        </fieldset>
        <label htmlFor="feedback-comment">
          Anything to improve? (optional)
        </label>
        <textarea
          id="feedback-comment"
          name="comment"
          maxLength={2000}
          disabled={busy}
        />
        <label>
          <input type="checkbox" name="consent" required disabled={busy} /> I
          agree to share these answers for product feedback.
        </label>
        <button
          className="qv-btn qv-btn--secondary"
          disabled={busy || saved || !sessionState.ready}
        >
          Send feedback
        </button>
        {!sessionState.concealed && message && (
          <p role={saved ? "status" : "alert"}>{message}</p>
        )}
      </form>
    </main>
  );
}
