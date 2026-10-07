"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { useState } from "react";
import { useGrowthSession } from "./session";
export function LaunchKit() {
  const { request, signal } = useGrowthSession();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="growth-stack">
      <h1>{growthCopy.growthYourLaunchKit}</h1>
      <p>
        {growthCopy.growthShareYourPublicCreatorPageOrAnInvitationWithPeople}
      </p>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          try {
            const result = await request<{ id: string; expires_at: string }>(
              "invites",
              { method: "POST", body: JSON.stringify({ contextId: null }) },
            );
            const link = `${window.location.origin}/invite/${result.id}`;
            await navigator.clipboard.writeText(link);
            signal.throwIfAborted();
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
