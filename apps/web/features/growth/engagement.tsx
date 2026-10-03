"use client";
import { copy as growthCopy } from "@qelvora/copy";
import { useEffect, useRef, useState } from "react";
import { mutate, GrowthActionError } from "./actions";
import { growthText as text } from "./copy";
import { useGrowthSession } from "./session";

/** Owner-recorded value + server-side caps determine whether this optional prompt exists. */
export function BrowserPostValuePrompt() {
  const [platform, setPlatform] = useState<"web" | "ios" | "android" | null>(
    null,
  );
  useEffect(() => {
    setPlatform(
      /iPhone|iPad|iPod/u.test(navigator.userAgent)
        ? "ios"
        : /Android/u.test(navigator.userAgent)
          ? "android"
          : "web",
    );
  }, []);
  return platform ? (
    <PostValuePrompt
      kind={platform === "web" ? "return" : "install"}
      platform={platform}
    />
  ) : null;
}

export function PostValuePrompt({
  kind = "return",
  platform = "web",
}: {
  kind?: "install" | "return";
  platform?: "web" | "ios" | "android";
}) {
  const { request, signal } = useGrowthSession();
  const claim = useRef<string | null>(null);
  const [target, setTarget] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    claim.current ??= crypto.randomUUID();
    void request<{ eligible: boolean; target: string | null }>(
      `engagement/${kind}/claim`,
      { method: "POST", body: JSON.stringify({ platform, id: claim.current }) },
    )
      .then((result) => {
        if (active) setTarget(result.eligible ? result.target : null);
      })
      .catch(() => {}); // Optional prompts never obstruct the underlying value.
    return () => {
      active = false;
    };
  }, [kind, platform, request]);
  if (!target) return null;
  async function choose(choice: "later" | "declined" | "accepted") {
    setBusy(true);
    setError("");
    try {
      await request(`engagement/${kind}/choice`, {
        method: "PUT",
        body: JSON.stringify({ id: claim.current, choice }),
      });
      if (choice === "accepted") window.location.assign(target!);
      else setTarget(null);
    } catch {
      if (signal.aborted) return;
      setError(text("unavailable"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside
      className="growth-card growth-card-body growth-stack"
      aria-label={text(kind === "install" ? "installTitle" : "returnTitle")}
    >
      <h2>{text(kind === "install" ? "installTitle" : "returnTitle")}</h2>
      <p>{text(kind === "install" ? "installBody" : "returnBody")}</p>
      <div className="growth-actions">
        <button
          className="qv-btn qv-btn--secondary"
          disabled={busy}
          onClick={() => void choose("accepted")}
        >
          {text(kind === "install" ? "installAction" : "returnAction")}
        </button>
        <button
          className="qv-btn qv-btn--quiet"
          disabled={busy}
          onClick={() => void choose("later")}
        >
          {text("later")}
        </button>
        <button
          className="qv-btn qv-btn--quiet"
          disabled={busy}
          onClick={() => void choose("declined")}
        >
          {text("decline")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}

export function VoluntaryInvite({
  handle,
  contextId = null,
}: {
  handle: string;
  contextId?: string | null;
}) {
  const [link, setLink] = useState<{ id: string; url: string } | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [signIn, setSignIn] = useState(false);
  return (
    <div className="growth-stack">
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          setSignIn(false);
          try {
            const result = await mutate("referrals", { handle, contextId });
            setLink({
              id: result.id,
              url: new URL(`/invite/${result.id}`, window.location.origin).href,
            });
          } catch (error) {
            setSignIn(
              error instanceof GrowthActionError && error.status === 401,
            );
            setMessage(
              error instanceof Error ? error.message : text("unavailable"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {text("inviteAction")}
      </button>
      {link && (
        <>
          <p>{text("inviteBody")}</p>
          <a href={link.url}>{text("inviteReady")}</a>
          <button
            className="qv-btn qv-btn--quiet"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await mutate(`invites/${link.id}`, null, "DELETE");
                setLink(null);
                setMessage(text("inviteRevoked"));
              } catch (error) {
                setMessage(
                  error instanceof Error ? error.message : text("unavailable"),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {text("inviteRevoke")}
          </button>
        </>
      )}
      <p role="status">{message}</p>
      {signIn && (
        <a
          href={`/auth/continue?returnTo=${encodeURIComponent(contextId ? `/creators/${handle}/posts/${contextId}` : `/creators/${handle}`)}`}
        >
          {growthCopy.continueWithPantopus}
        </a>
      )}
    </div>
  );
}

export function EntryConsent({
  handle,
  source,
  objectId = null,
}: {
  handle: string;
  source: "creator_link" | "post" | "invite" | "share";
  objectId?: string | null;
}) {
  const id = useRef<string | null>(null),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [signIn, setSignIn] = useState(false);
  const returnTo =
    source === "invite"
      ? `/invite/${objectId}`
      : source === "share"
        ? `/share/${objectId}`
        : source === "post"
          ? `/creators/${handle}/posts/${objectId}`
          : `/creators/${handle}`;
  return (
    <div className="growth-stack">
      <p className="growth-help">{text("entryBody")}</p>
      <button
        className="qv-btn qv-btn--quiet"
        disabled={busy || saved}
        onClick={async () => {
          id.current ??= crypto.randomUUID();
          setBusy(true);
          setSignIn(false);
          try {
            await mutate("entry", {
              id: id.current,
              handle,
              source,
              objectId,
              surface: "web",
              consent: true,
            });
            setSaved(true);
            setMessage(text("entrySaved"));
          } catch (error) {
            setSignIn(
              error instanceof GrowthActionError && error.status === 401,
            );
            setMessage(
              error instanceof Error ? error.message : text("unavailable"),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {text("entryConsent")}
      </button>
      <p role="status">{message}</p>
      {signIn && (
        <a href={`/auth/continue?returnTo=${encodeURIComponent(returnTo)}`}>
          {growthCopy.continueWithPantopus}
        </a>
      )}
    </div>
  );
}

/** Approved copy augments the required authorship disclosures instead of replacing them. */
export function ApprovedVariant({ handle }: { handle: string }) {
  const [variant, setVariant] = useState<{
    heading: string;
    introduction: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void fetch(
      `/api/growth/experiments/variant/${encodeURIComponent(handle)}?surface=creator_landing`,
    )
      .then(async (response) => {
        if (response.ok && active) setVariant((await response.json()).variant);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [handle]);
  return variant ? (
    <section className="growth-card growth-card-body">
      <h2>{variant.heading}</h2>
      <p>{variant.introduction}</p>
    </section>
  ) : null;
}
