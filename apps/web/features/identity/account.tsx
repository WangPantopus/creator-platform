"use client";
import { useEffect, useState } from "react";
import { Notice } from "@qelvora/ui-web";
import { SessionSchema, type Session } from "@qelvora/api";

export function AccountPanel({ initial }: { initial: Session }) {
  const [session, setSession] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const returnTo = "/identity/account";
  useEffect(() => {
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/platform/identity/session", {
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (response.status === 401) {
          setSession({ ...initial, fan: null, creator: null, teams: [] });
          location.replace(
            `/auth/continue?returnTo=${encodeURIComponent(returnTo)}`,
          );
          return;
        }
        if (!response.ok)
          throw new Error(
            "Reconnect to refresh your account. Privileged actions remain checked by the server.",
          );
        const value = SessionSchema.parse(await response.json());
        if (value.accountId !== initial.accountId) {
          setSession({ ...initial, fan: null, creator: null, teams: [] });
          location.replace(
            `/auth/continue?returnTo=${encodeURIComponent(returnTo)}`,
          );
          return;
        }
        if (active) {
          setSession(value);
          setError("");
        }
      } catch (error) {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Reconnect to refresh your account.",
          );
      } finally {
        checking = false;
      }
    };
    const timer = setInterval(check, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [initial]);
  const act = async (path: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/platform/identity/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok && response.status !== 401) {
        setError("Could not complete this action. Reconnect and try again.");
        return;
      }
      if (path !== "refresh" || response.status === 401) {
        setSession({ ...initial, fan: null, creator: null, teams: [] });
        location.replace("/auth/continue");
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
    <section className="account-panel">
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
      {error && (
        <div role="alert">
          <Notice title="Account status" tone="error">
            {error}
          </Notice>
        </div>
      )}
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        onClick={() => act("refresh")}
      >
        Refresh session
      </button>
      <button
        className="qv-btn qv-btn--secondary"
        disabled={busy}
        onClick={() => act("logout")}
      >
        Sign out
      </button>
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy}
        onClick={() => act("revoke-sessions")}
      >
        Sign out on all devices
      </button>
    </section>
  );
}
