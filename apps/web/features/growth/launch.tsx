"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { useRef, useState } from "react";
import { useGrowthSession } from "./session";
export function LaunchKit() {
  const { request, signal } = useGrowthSession();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const attempt = useRef<{ id: string; note: string } | null>(null);
  return (
    <div className="growth-stack">
      <h1>{growthCopy.growthYourLaunchKit}</h1>
      <p>
        {growthCopy.growthShareYourPublicCreatorPageOrAnInvitationWithPeople}
      </p>
      <label htmlFor="growth-invitation-note">
        {growthCopy.growthInvitationNoteLabel}
      </label>
      <textarea
        id="growth-invitation-note"
        aria-describedby="growth-invitation-note-hint"
        value={note}
        maxLength={600}
        rows={4}
        disabled={busy}
        onChange={(event) => setNote(event.target.value)}
      />
      <p className="growth-help" id="growth-invitation-note-hint">
        {growthCopy.growthInvitationNoteHint}
      </p>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            if (!attempt.current || attempt.current.note !== note)
              attempt.current = { id: crypto.randomUUID(), note };
            const result = await request<{ id: string; expires_at: string }>(
              "invites",
              {
                method: "POST",
                body: JSON.stringify({ ...attempt.current, contextId: null }),
              },
            );
            const link = `${window.location.origin}/invite/${result.id}`;
            await navigator.clipboard.writeText(link);
            signal.throwIfAborted();
            attempt.current = null;
            setMessage(
              growthFormat("growthInvitationCopiedExpires", {
                value1: new Date(result.expires_at).toLocaleDateString(),
              }),
            );
          } catch (e) {
            if (signal.aborted) return;
            setMessage(
              e instanceof Error
                ? e.message
                : growthCopy.growthInvitationUnavailable,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {growthCopy.growthCreateAndCopyInvitation}
      </button>
      <p role="status">{message}</p>
      <p className="growth-help">
        {
          growthCopy.growthInvitationsExpireAfter30DaysNoMessagesAreSentAutomatically
        }
      </p>
    </div>
  );
}
