"use client";
import { useState } from "react";
import { mutate } from "./actions";
export function LaunchKit() {
  const [message, setMessage] = useState("");
  return (
    <div className="growth-stack">
      <h1>Your launch kit</h1>
      <p>
        Share your public creator page or an invitation with people who choose
        to open it.
      </p>
      <button
        className="qv-btn qv-btn--secondary"
        onClick={async () => {
          try {
            const result = await mutate("invites", { contextId: null });
            const link = `${window.location.origin}/invite/${result.id}`;
            await navigator.clipboard.writeText(link);
            setMessage(
              `Invitation copied. Expires ${new Date(result.expires_at).toLocaleDateString()}.`,
            );
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Invitation unavailable.",
            );
          }
        }}
      >
        Create and copy invitation
      </button>
      <p role="status">{message}</p>
      <p className="growth-help">
        Invitations expire after 30 days. No messages are sent automatically.
        Reply sharing needs both parties' permission.
      </p>
    </div>
  );
}
