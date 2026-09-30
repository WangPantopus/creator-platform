"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { InboxItem, Cluster } from "./types";
import { glyphs } from "@qelvora/ui-web";

export class GrowthActionError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function mutate(path: string, body: unknown, method = "POST") {
  const response = await fetch(`/api/growth/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method !== "DELETE" ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok)
    throw new GrowthActionError(
      response.status,
      result.error?.message ?? "This action could not be completed.",
    );
  return result;
}
export function Follow({
  creatorId,
  handle,
  following = false,
}: {
  creatorId: string;
  handle: string;
  following?: boolean;
}) {
  const [value, setValue] = useState(following),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [signIn, setSignIn] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/growth/follow/${creatorId}`)
      .then(async (response) => {
        if (response.ok) {
          const result = await response.json();
          if (active) setValue(result.following === true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [creatorId]);
  return (
    <div>
      <button
        className="qv-btn qv-btn--secondary growth-submit"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          setSignIn(false);
          try {
            await mutate(`follow/${creatorId}`, { following: !value }, "PUT");
            setValue(!value);
          } catch (e) {
            setSignIn(e instanceof GrowthActionError && e.status === 401);
            setError(
              e instanceof Error ? e.message : "Could not update follow.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving…" : value ? "Following · unfollow" : "Follow"}
      </button>
      {error ? (
        <p className="growth-error" role="alert">
          {error}
        </p>
      ) : null}
      {signIn ? (
        <a
          href={`/auth/continue?returnTo=${encodeURIComponent(`/creators/${handle}`)}`}
        >
          Continue with Pantopus
        </a>
      ) : null}
    </div>
  );
}
export function Inbox({
  items,
  timeZone = "UTC",
}: {
  items: InboxItem[];
  timeZone?: string;
}) {
  const [error, setError] = useState("");
  const dateKey = (value: string | Date) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date(value))
        .map((part) => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const today = dateKey(new Date());
  const day = new Date(today + "T00:00:00Z"),
    monday = new Date(day);
  monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const groups = items.reduce<Record<string, InboxItem[]>>((result, item) => {
    const date = dateKey(item.createdAt),
      group =
        date === today
          ? "TODAY"
          : date >= monday.toISOString().slice(0, 10)
            ? "THIS WEEK"
            : "EARLIER";
    (result[group] ??= []).push(item);
    return result;
  }, {});
  return (
    <>
      {error ? (
        <p role="alert" className="growth-error">
          {error}
        </p>
      ) : null}
      {Object.entries(groups).map(([group, entries]) => (
        <section key={group}>
          <p className="growth-meta">{group}</p>
          {entries.map((item) => (
            <a
              className={`qv qv-notif growth-notification ${item.readAt ? "" : "is-unread"}`}
              key={item.id}
              href={item.destination}
              onClick={async (event) => {
                event.preventDefault();
                try {
                  await mutate(`notifications/${item.id}/read`, {}, "PUT");
                  window.location.assign(item.destination);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not open update.",
                  );
                }
              }}
            >
              <span
                aria-hidden="true"
                className={`qv-notif__icon qv-notif__icon--${item.authorKind === "ai" ? "ai" : item.authorKind === "team" ? "team" : item.authorKind.startsWith("human") || item.authorKind === "approved_draft" ? "maya" : "system"}`}
              >
                {item.authorKind === "ai" ? (
                  glyphs.ring(16)
                ) : item.authorKind === "approved_draft" ? (
                  glyphs.approved(16)
                ) : item.authorKind === "human_broadcast" ? (
                  glyphs.broadcast(16)
                ) : item.authorKind === "human_reaction" ? (
                  glyphs.heart(15)
                ) : item.authorKind === "team" ? (
                  glyphs.team(16)
                ) : item.authorKind.startsWith("human") ? (
                  <span className="growth-author-initial">
                    {item.creatorName.slice(0, 1)}
                  </span>
                ) : (
                  glyphs.inbox(18)
                )}
              </span>
              <div>
                <strong className="qv-notif__sender">{item.sender}</strong>
                <p className="qv-notif__preview">{item.preview}</p>
              </div>
              <time
                className="qv-meta"
                dateTime={item.createdAt}
                title={timeZone}
              >
                {new Date(item.createdAt).toLocaleString(
                  "en",
                  group === "TODAY"
                    ? {
                        timeZone,
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }
                    : { timeZone, month: "short", day: "numeric" },
                )}
              </time>
            </a>
          ))}
        </section>
      ))}
    </>
  );
}
export function ShareLink({ url, title }: { url: string; title: string }) {
  const [message, setMessage] = useState("");
  return (
    <div>
      <button
        className="qv-btn qv-btn--quiet"
        onClick={async () => {
          try {
            if (navigator.share) await navigator.share({ title, url });
            else {
              await navigator.clipboard.writeText(url);
              setMessage("Link copied.");
            }
          } catch {
            setMessage("The link was not shared.");
          }
        }}
      >
        Share link
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
export function Connection() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline ? (
    <div className="growth-offline" role="status">
      Offline · this page may be out of date. Actions need a connection.
    </div>
  ) : null;
}
export function Producer({ cluster }: { cluster: Cluster }) {
  const [outline, setOutline] = useState(
      cluster.outline ?? `Answer ${cluster.topicKey.replaceAll("-", " ")}`,
    ),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const router = useRouter();
  const window = cluster.window.slice(0, 10);
  async function decide(decision: string) {
    setBusy(true);
    try {
      await mutate(
        "recommendations",
        { window, topicKey: cluster.topicKey, outline, decision },
        "PUT",
      );
      setMessage(`Saved: ${decision}.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <aside className="growth-card growth-card-body">
      <span className="growth-meta">RECOMMENDED NEXT</span>
      <h3>Answer once for everyone</h3>
      <p className="growth-help">
        Evidence: {cluster.fanCount} distinct fans · seven-day window beginning{" "}
        {window}. Effort and audience must be chosen by you.
      </p>
      <label>
        Outline
        <textarea
          value={outline}
          onChange={(e) => setOutline(e.target.value)}
          maxLength={2000}
        />
      </label>
      <div className="growth-actions">
        {["accept", "edit", "defer", "dismiss"].map((decision) => (
          <button
            key={decision}
            className="qv-btn qv-btn--secondary"
            disabled={busy}
            onClick={() => void decide(decision)}
          >{`${decision[0]?.toUpperCase()}${decision.slice(1)}`}</button>
        ))}
      </div>
      <button
        disabled={busy}
        className="qv-btn qv-btn--secondary"
        onClick={async () => {
          setBusy(true);
          try {
            const result = await mutate("recommendations/publish", {
              window,
              topicKey: cluster.topicKey,
              outline,
            });
            router.push(result.destination);
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Publishing is unavailable.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Open group-answer composer
      </button>
      <p role="status" className="growth-help">
        {message}
      </p>
    </aside>
  );
}
