"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@qelvora/ui-web";
import type { Session } from "@qelvora/api";

export function HandleForm({
  returnTo,
  mode,
  initialHandle = "",
  initialIntro = "",
}: {
  returnTo: string;
  mode: Session["mode"];
  initialHandle?: string;
  initialIntro?: string;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(initialHandle);
  const [intro, setIntro] = useState(initialIntro);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="qv identity-handle"
      onSubmit={async (event) => {
        event.preventDefault();
        if (saving) return;
        setSaving(true);
        setError("");
        try {
          const response = await fetch("/api/platform/identity/fan-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handle, intro }),
          });
          const result = await response.json();
          if (!response.ok) {
            if (response.status === 401) {
              location.assign(
                `/auth/continue?returnTo=${encodeURIComponent(returnTo)}`,
              );
              return;
            }
            throw new Error(result.error?.message);
          }
          router.replace(returnTo);
          router.refresh();
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Could not save. Try again.",
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="handle-header">
        <a href="/you" aria-label="Back" className="handle-back">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path
              d="M13.5 4.5L7 11l6.5 6.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
        <span className="qv-meta">
          {mode === "development"
            ? "DEVELOPMENT SIGN-IN"
            : "SIGNED IN WITH PANTOPUS"}
        </span>
      </div>
      <h1>How creators will know you</h1>
      <div className="qv-field">
        <label className="qv-field__label" htmlFor="handle">
          Handle
        </label>
        <input
          id="handle"
          className="qv-input"
          autoCapitalize="none"
          autoCorrect="off"
          required
          pattern="@?[a-zA-Z0-9_]{3,30}"
          maxLength={31}
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          aria-describedby="handle-help"
        />
        <div id="handle-help" className="qv-help">
          Creators and their teams see your handle, never your name or city
          unless you share them in a request.
        </div>
      </div>
      <div className="intro-card">
        <label className="qv-meta" htmlFor="intro">
          A LINE ABOUT YOU · OPTIONAL
        </label>
        <textarea
          id="intro"
          rows={3}
          maxLength={240}
          value={intro}
          onChange={(event) => setIntro(event.target.value)}
          aria-describedby="intro-help"
        />
        <span id="intro-help" className="qv-help">
          You choose, per creator, whether their AI may use this.
        </span>
      </div>
      {error && (
        <div role="alert">
          <Notice tone="error" title="Could not save your profile">
            {error}
          </Notice>
        </div>
      )}
      <button
        disabled={saving}
        className="qv-btn qv-btn--secondary qv-btn--lg qv-btn--block handle-continue"
      >
        {saving ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
