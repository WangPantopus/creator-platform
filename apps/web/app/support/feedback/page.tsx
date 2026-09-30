"use client";
import { useState } from "react";
import Link from "next/link";
import { TrustSession, trustApi } from "../../ops/trust-client";
export default function FeedbackPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
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
        className="trust-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const input = new FormData(event.currentTarget);
          try {
            await trustApi("feedback", {
              consent: input.get("consent") === "on",
              cohort: input.get("cohort"),
              useful: input.get("useful") === "yes",
              authorshipClear: input.get("clear") === "yes",
              comment: input.get("comment"),
            });
            setMessage("Your feedback is saved.");
          } catch (error) {
            setMessage(
              error instanceof Error ? error.message : "Feedback unavailable.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="feedback-cohort">Creator mode</label>
        <select id="feedback-cohort" name="cohort">
          <option value="unspecified">Prefer not to say</option>
          <option value="expert">Expert</option>
          <option value="companion">Companion</option>
          <option value="blend">Blend</option>
        </select>
        <fieldset>
          <legend>Was the conversation useful?</legend>
          <label>
            <input type="radio" name="useful" value="yes" required /> Yes
          </label>
          <label>
            <input type="radio" name="useful" value="no" /> No
          </label>
        </fieldset>
        <fieldset>
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
        <textarea id="feedback-comment" name="comment" maxLength={2000} />
        <label>
          <input type="checkbox" name="consent" required /> I agree to share
          these answers for product feedback.
        </label>
        <button className="qv-btn qv-btn--secondary" disabled={busy}>
          Send feedback
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </main>
  );
}
