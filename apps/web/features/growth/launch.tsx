"use client";
import { copy as growthCopy, formatCopy as growthFormat } from "@qelvora/copy";
import { useState } from "react";
import { mutate } from "./actions";
export function LaunchKit() {
  const [message, setMessage] = useState("");
  return (
    <div className="growth-stack">
      <h1>{growthCopy.growthYourLaunchKit}</h1>
      <p>
        {growthCopy.growthShareYourPublicCreatorPageOrAnInvitationWithPeople}
      </p>
      <button
        className="qv-btn qv-btn--secondary"
        onClick={async () => {
          try {
            const result = await mutate("invites", { contextId: null });
            const link = `${window.location.origin}/invite/${result.id}`;
            await navigator.clipboard.writeText(link);
            setMessage(
              growthFormat("growthInvitationCopiedExpires", {
                value1: new Date(result.expires_at).toLocaleDateString(),
              }),
            );
          } catch (e) {
            setMessage(
              e instanceof Error
                ? e.message
                : growthCopy.growthInvitationUnavailable,
            );
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
