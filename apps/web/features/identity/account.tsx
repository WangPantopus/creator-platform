"use client";
import { useEffect, useRef, useState } from "react";
import { Notice } from "@qelvora/ui-web";
import { announceSessionEnd, useIdentityRequest } from "./session-boundary";

export function AccountPanel() {
  const identity = useIdentityRequest();
  const session = identity.session;
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const actionFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (busy) return;
    const button = actionFocus.current;
    actionFocus.current = null;
    if (
      button?.isConnected &&
      !identity.signal.aborted &&
      !document.hidden &&
      document.activeElement === document.body
    )
      button.focus();
  }, [busy, identity.signal]);
  const act = async (path: string, button: HTMLButtonElement) => {
    if (busy) return;
    actionFocus.current = document.activeElement === button ? button : null;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await identity.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        setError("Could not complete this action. Reconnect and try again.");
        return;
      }
      if (path === "refresh") {
        setMessage("Session refreshed.");
      } else {
        announceSessionEnd();
        identity.end();
      }
    } catch {
      setError(
        "Could not confirm this action. Reconnect and check your account status.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="account-panel" aria-busy={busy}>
      <h1>Your account</h1>
      {session.mode === "development" && (
        <Notice title="Development identity">
          Synthetic local account. Pantopus production sign-in is not connected.
        </Notice>
      )}
      <p>Signed in as @{session.fan?.handle ?? "Choose your handle"}</p>
      <p>
        Only your public handle and chosen intro belong to this app. Your
        Pantopus neighborhood and private profile are not imported.
      </p>
      <nav aria-label="Account">
        <a
          className="qv-btn qv-btn--secondary"
          href="/onboarding/handle?returnTo=%2Fidentity%2Faccount"
        >
          Edit public profile
        </a>
        <a className="qv-btn qv-btn--secondary" href="/studio/setup">
          {session.creator
            ? "Creator verification and signing"
            : "Set up as a creator"}
        </a>
        <a className="qv-btn qv-btn--quiet" href="/home">
          Fan home
        </a>
      </nav>
      {session.creator && (
        <p>
          Creator identity: {session.creator.verification}. Team roles do not
          grant creator identity.
        </p>
      )}
      {session.teams.length > 0 && (
        <section aria-label="Team authority">
          <h2>Your team scopes</h2>
          {session.teams.map((team) => (
            <p key={team.creatorId}>
              {team.roles.join(", ")} · creator {team.creatorId}
              <br />
              These roles do not allow signing as the creator.
            </p>
          ))}
        </section>
      )}
      {(error || message) && (
        <Notice title="Account status" tone={error ? "error" : undefined}>
          {error || message}
        </Notice>
      )}
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        onClick={(event) => act("refresh", event.currentTarget)}
      >
        Refresh session
      </button>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        onClick={(event) => act("logout", event.currentTarget)}
      >
        Sign out
      </button>
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy}
        onClick={(event) => act("revoke-sessions", event.currentTarget)}
      >
        Sign out on all devices
      </button>
    </section>
  );
}
