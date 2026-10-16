"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { brand } from "@qelvora/brand";
import { EmptyState, Notice, StudioTabBar } from "@qelvora/ui-web";
import { validReturnTarget } from "@qelvora/api";
import {
  configureStudioRequests,
  StudioFailure,
  studioRequest,
  studioStream,
} from "./api";
import "./studio.css";
import { useIdentityRequest } from "../identity/session-boundary";
import type { Creator } from "./shared/types";
import { time } from "./shared/format";
import { ThanksFeed } from "./thanks/ThanksFeed";
import { More } from "./more/More";
import { Team } from "./team/Team";
import { Notes } from "./notes/Notes";
import { Compose } from "./notes/Compose";
import { Library } from "./library/Library";
import { Requests } from "./requests/Requests";
import { PacketDetail } from "./requests/PacketDetail";
import { Threads } from "./threads/Threads";
import { Today } from "./today/Today";
import { navigationTree, studioSidebar } from "./shell/navigation";
import { liveQuery, StudioLive, type LiveViewState } from "./shell/live";
/** One frame of Studio's live stream (backend `modules/studio/live.ts`). */
type LiveFrame = {
  t: number;
  session?: string;
  state?: { creators: Creator[]; invitations: Invitation[] };
  badge?: number | null;
  view?: { digest: string } | { error: LiveFailure };
  end?: "renew" | "error";
  error?: LiveFailure;
};
type LiveFailure = { status: number; code: string; message: string };
type Invitation = {
  id: string;
  creatorId: string;
  creatorName: string;
  roles: string[];
  expiresAt: string;
};
/** The read the route's screen declares, so the first stream already carries it. */
const routeView = (screen: string[]) => {
  const [current = "today", fan] = screen;
  return current === "notes"
    ? liveQuery({ view: "notes", filter: "all" })
    : current === "threads"
      ? liveQuery(fan ? { view: "thread", fan } : { view: "threads" })
      : current === "team" || current === "thanks"
        ? liveQuery({ view: current })
        : "";
};
export function Studio({
  creatorId,
  screen = [],
}: {
  creatorId?: string;
  screen?: string[];
}) {
  const { session, signal, end, isSessionEnded } = useIdentityRequest();
  useEffect(
    () =>
      configureStudioRequests({
        accountId: session.accountId,
        sessionId: session.sessionId,
        signal,
        end,
        isSessionEnded,
      }),
    [session.accountId, session.sessionId, signal, end, isSessionEnded],
  );
  const requestedPath = creatorId
    ? `/studio/${creatorId}/${screen.join("/") || "today"}`
    : "/studio/workspace";
  const [returnTo, setReturnTo] = useState(
    validReturnTarget(requestedPath) ? requestedPath : "/studio/workspace",
  );
  useEffect(() => {
    const current = location.pathname + location.search;
    setReturnTo(validReturnTarget(current) ? current : "/studio/workspace");
  }, [requestedPath]);
  const [creators, setCreators] = useState<Creator[]>([]),
    [creator, setCreator] = useState<Creator | null>(null),
    [invitations, setInvitations] = useState<
      {
        id: string;
        creatorId: string;
        creatorName: string;
        roles: string[];
        expiresAt: string;
      }[]
    >([]),
    [error, setError] = useState(""),
    [sessionExpired, setSessionExpired] = useState(false),
    [suspended, setSuspended] = useState(false),
    [freshUntil, setFreshUntil] = useState(0),
    [loading, setLoading] = useState(true),
    [badge, setBadge] = useState<number>(),
    [watched, setWatched] = useState(() => routeView(screen)),
    [view, setView] = useState<LiveViewState>();
  const requests = suspended ? undefined : badge;
  const generation = useRef(0),
    stream = useRef<AbortController | null>(null),
    retry = useRef<ReturnType<typeof setTimeout>>(undefined),
    failures = useRef(0),
    lastFrame = useRef(0),
    digests = useRef(new Map<string, string>()),
    reconnectButton = useRef<HTMLButtonElement>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    router = useRouter(),
    from = useSearchParams().get("from");
  const watch = useCallback((query: string) => setWatched(query), []),
    live = useMemo(() => ({ state: view, watch }), [view, watch]);
  const conceal = useCallback(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest(".w5-studio"))
      previousFocus.current = focused;
    setSuspended(true);
  }, []);
  // One live stream per open tab replaces the 4-second role check: the server
  // re-checks the current roles and the open screen's read every two seconds,
  // and each answer extends the five-second authority lease from the moment
  // that check started. `renewal` is the server's routine 30-second turnover.
  const connect = useCallback(
    (renewal = false) => {
      clearTimeout(retry.current);
      if (document.hidden) {
        conceal();
        return;
      }
      stream.current?.abort();
      const controller = new AbortController();
      stream.current = controller;
      const current = ++generation.current;
      const started = performance.now();
      // A focus or "online" event while this stream opens does not restart it.
      lastFrame.current = started;
      if (!renewal) {
        setLoading(true);
        setError("");
      }
      let first = true,
        answered = false,
        ended: LiveFrame | null = null;
      // As the old role check gave up after 4 seconds, a first answer slower
      // than the lease counts as unavailable, and Studio retries.
      const slow = setTimeout(() => controller.abort(), 5000);
      // The Studio picker has no creator, so no screen read either.
      const query = new URLSearchParams(creatorId ? watched : "");
      if (creatorId) query.set("creator", creatorId);
      const retryAfter = (delay: number) => {
        retry.current = setTimeout(() => connect(), delay);
      };
      const refused = (failure: unknown) => {
        setCreators([]);
        setInvitations([]);
        setSessionExpired(
          failure instanceof StudioFailure && failure.status === 401,
        );
        const unavailable =
          failure instanceof StudioFailure && failure.status >= 500;
        // A transport outage cannot prove role removal. Keep the mounted view's
        // input in memory, but conceal it and disable interaction until the same
        // account's current authority is confirmed. Explicit denial clears it.
        if (unavailable) {
          conceal();
          if (!document.hidden)
            retryAfter(Math.min(8000, 1000 * 2 ** failures.current++));
        } else {
          setCreator(null);
          setFreshUntil(0);
          previousFocus.current = null;
        }
        setSuspended(unavailable);
        setError(
          failure instanceof Error ? failure.message : "Studio is unavailable.",
        );
        setLoading(false);
      };
      void studioStream(
        query.toString(),
        (raw) => {
          if (current !== generation.current) return;
          const frame = raw as LiveFrame;
          if (frame.end) {
            ended = frame;
            return;
          }
          answered = true;
          clearTimeout(slow);
          lastFrame.current = performance.now();
          // A frame delayed past its own lease cannot restore Studio.
          if (performance.now() >= started + frame.t + 5000) return;
          failures.current = 0;
          if (frame.state) {
            const next =
              frame.state.creators.find((c) => c.id === creatorId) ?? null;
            setCreators(frame.state.creators);
            setInvitations(frame.state.invitations);
            setCreator((previous) =>
              previous &&
              next &&
              JSON.stringify(previous) === JSON.stringify(next)
                ? previous
                : next,
            );
          }
          setSessionExpired(false);
          setError("");
          setFreshUntil(started + frame.t + 5000);
          setSuspended(false);
          setLoading(false);
          setBadge(
            Number.isSafeInteger(frame.badge) && frame.badge! >= 0
              ? frame.badge!
              : undefined,
          );
          const key = creatorId ? watched : "",
            read = frame.view;
          if (!key || !read) return;
          if ("error" in read) {
            digests.current.delete(key);
            setView((previous) => ({
              key,
              revision: previous?.key === key ? previous.revision : 0,
              error: new StudioFailure(
                read.error.status,
                read.error.code,
                read.error.message,
              ),
            }));
          } else {
            // Read again on a change, and once after any reconnect that was
            // not a routine renewal (a return to the tab, a lapse, a retry).
            const changed =
              digests.current.get(key) !== read.digest || (first && !renewal);
            digests.current.set(key, read.digest);
            if (changed)
              setView((previous) => ({
                key,
                revision: (previous?.key === key ? previous.revision : 0) + 1,
              }));
          }
          first = false;
        },
        controller.signal,
      ).then(
        () => {
          clearTimeout(slow);
          if (current !== generation.current) return;
          const end = ended as LiveFrame | null;
          if (!answered && !end)
            refused(
              new StudioFailure(
                503,
                "offline",
                "Reconnect to continue. Your input is kept; nothing is replayed automatically.",
              ),
            );
          else if (end?.end === "renew") connect(true);
          else if (end?.error)
            refused(
              new StudioFailure(
                end.error.status,
                end.error.code,
                end.error.message,
              ),
            );
          // A dropped stream reconnects at once, then backs off.
          else if (!document.hidden) {
            const tries = failures.current++;
            retryAfter(tries ? Math.min(8000, 1000 * 2 ** tries) : 0);
          }
        },
        (failure: unknown) => {
          clearTimeout(slow);
          if (current === generation.current) refused(failure);
        },
      );
    },
    [conceal, creatorId, watched],
  );
  useEffect(() => {
    if (!creator || !freshUntil) return;
    // A slow check cannot extend the last successful authority check. When the
    // lease lapses and the stream stays silent, open a new one.
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(
      () => {
        conceal();
        const silentSince = lastFrame.current;
        watchdog = setTimeout(() => {
          if (lastFrame.current === silentSince) connect();
        }, 3000);
      },
      Math.max(0, freshUntil - performance.now()),
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(watchdog);
    };
  }, [conceal, connect, creator, freshUntil]);
  useEffect(() => {
    if (suspended) {
      if (!document.hidden) reconnectButton.current?.focus();
    }
  }, [loading, suspended]);
  useEffect(() => {
    if (!suspended && previousFocus.current?.isConnected) {
      previousFocus.current.focus();
      previousFocus.current = null;
    }
  }, [suspended]);
  useEffect(() => {
    connect();
    return () => {
      generation.current++;
      stream.current?.abort();
      stream.current = null;
      clearTimeout(retry.current);
    };
  }, [connect]);
  useEffect(() => {
    // Focus and "online" reconnect only when nothing arrived for 5 seconds
    // (nor did a stream open); a page restored from the back cache always does.
    const onFocus = () => {
      if (performance.now() >= lastFrame.current + 5000) connect();
    };
    const onVisibility = () => {
      if (document.hidden) {
        generation.current++;
        stream.current?.abort();
        stream.current = null;
        clearTimeout(retry.current);
        setFreshUntil(0);
        conceal();
      } else connect();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) connect();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [conceal, connect]);
  const root = `/studio/${creatorId}`,
    continuation = `${sessionExpired ? "/api/auth/restore" : "/auth/continue"}?returnTo=${encodeURIComponent(returnTo)}`,
    current = screen[0] ?? "today",
    // A composer opened from Today returns there; otherwise to Notes.
    composeBack = `${root}/${from === "today" ? "today" : "notes"}`;
  const paths: Record<string, string> = {
    Today: `${root}/today`,
    Notes: `${root}/notes`,
    Requests: `${root}/requests`,
    Threads: `${root}/threads`,
    "My AI": "/studio/ai",
    More: `${root}/more`,
    Offers: "/commerce/offers",
    Publish: `${root}/publish`,
    Insights: "/studio/insights",
    Earnings: "/commerce/earnings",
    Team: `${root}/team`,
  };
  const active =
    current === "today"
      ? "Today"
      : current === "compose"
        ? "Notes"
        : current === "packets"
          ? "Requests"
          : current === "publish"
            ? "Publish"
            : current === "team"
              ? "Team"
              : current.charAt(0).toUpperCase() + current.slice(1);
  const href = (label: string) =>
    paths[Object.keys(paths).find((k) => label.startsWith(k)) ?? "Notes"]!;
  if (!creatorId)
    return (
      <main className="qv w5-entry">
        <h1>Your Studio</h1>
        {error && (
          <Notice tone="error" title="Studio status">
            {error}
          </Notice>
        )}
        {loading ? (
          <p role="status">Loading your current roles…</p>
        ) : error ? null : creators.length ? (
          creators.map((c) => (
            <Link key={c.id} className="w5-card" href={`/studio/${c.id}/today`}>
              {c.display_name}
              <span className="qv-help">
                {c.owned ? "Creator" : `Team · ${c.roles.join(", ")}`}
              </span>
            </Link>
          ))
        ) : (
          <EmptyState
            title="No Studio access"
            body="Creator and team access comes from your current account. Set up your creator profile or accept an invitation."
          />
        )}
        {invitations.map((invite) => (
          <article className="w5-card" key={invite.id}>
            <h2>Invitation from {invite.creatorName}</h2>
            <p>
              {invite.roles.join(" · ")} · expires {time(invite.expiresAt)}
            </p>
            <p>
              These roles give the creator’s team access described in Team.
              Personal signing remains with the creator.
            </p>
            <button
              disabled={loading}
              onClick={async () => {
                setLoading(true);
                try {
                  await studioRequest(
                    "studio",
                    `invitations/${invite.id}/accept`,
                    {},
                  );
                  connect();
                } catch (failure) {
                  setError((failure as Error).message);
                  setLoading(false);
                }
              }}
            >
              Accept team invitation
            </button>
          </article>
        ))}
        <a href={continuation}>Continue with Pantopus</a>
        <Link href="/studio/setup">Creator setup</Link>
      </main>
    );
  if (loading && !creator)
    return (
      <main className="qv w5-entry" role="status">
        Loading Studio…
      </main>
    );
  if (!creator)
    return (
      <main className="qv w5-entry">
        <Notice tone="error" title="Studio unavailable">
          {error || "Your current account has no role in this Studio."}
        </Notice>
        <Link href="/studio/workspace">Choose your Studio</Link>
        <a href={continuation}>Continue with Pantopus</a>
      </main>
    );
  return (
    <StudioLive.Provider value={live}>
      {suspended && (
        <main className="qv w5-entry">
          <Notice tone="error" title="Reconnect to Studio">
            Your input is kept in this tab. Studio is hidden until your current
            account and roles can be checked again.
          </Notice>
          <button
            ref={reconnectButton}
            type="button"
            className="qv-btn qv-btn--secondary"
            aria-busy={loading}
            onClick={() => connect()}
          >
            Check connection and roles
          </button>
        </main>
      )}
      <div
        key={`${creator.id}:${creator.viewerAccountId}:${creator.roles.join()}`}
        className={`qv w5-studio${current === "compose" ? " w5-studio--compose" : ""}`}
        hidden={suspended}
        inert={suspended}
        onFocusCapture={(event) => {
          // Capture before a parent/current-role outage can remove browser
          // focus. Only a validated return may restore this private control.
          if (!suspended) previousFocus.current = event.target;
        }}
      >
        <aside className="w5-sidebar">
          {navigationTree(
            studioSidebar(
              {
                name: creator.display_name,
                active,
                requests,
                status: creator.owned
                  ? "Creator workspace"
                  : `Team · ${creator.roles.join(", ")}`,
              },
              `${root}/more`,
              ["more", "thanks"].includes(current),
            ),
            href,
          )}
        </aside>
        <main className="w5-main">
          <div className="w5-account">
            <Link href={`${root}/today`}>{brand.studioName}</Link>
            <span>
              {creator.owned
                ? creator.display_name
                : `Team · ${creator.roles.join(", ")}`}
            </span>
            <button
              type="button"
              className="qv-link-btn"
              onClick={() => connect()}
            >
              Refresh role
            </button>
          </div>
          {error && (
            <Notice tone="error" title="Connection status">
              {error}
            </Notice>
          )}
          {current === "compose" ? (
            <Compose
              key={`${creator.viewerAccountId}:${creator.id}:${screen[1] ?? "new"}`}
              creator={creator}
              id={screen[1]}
              back={composeBack}
              onDone={() => router.push(composeBack)}
            />
          ) : current === "today" ? (
            <Today creator={creator} />
          ) : current === "notes" ? (
            <Notes creator={creator} />
          ) : current === "requests" ? (
            <Requests creator={creator} />
          ) : current === "packets" && screen[1] ? (
            <PacketDetail creator={creator} id={screen[1]} />
          ) : current === "publish" ? (
            <Library creator={creator} />
          ) : current === "team" ? (
            <Team creator={creator} suspended={suspended} />
          ) : current === "threads" ? (
            <Threads creator={creator} fanId={screen[1]} />
          ) : current === "thanks" ? (
            <ThanksFeed creator={creator} />
          ) : (
            <More creator={creator} />
          )}
        </main>
        <div className="w5-tabs">
          {navigationTree(
            StudioTabBar({
              requests,
              // Today is not a tab (yet): the bar marks only an exact label
              // match, so passing "Today" leaves every tab unselected.
              active:
                active === "Today" ||
                ["Notes", "Requests", "Threads", "My AI", "More"].includes(
                  active,
                )
                  ? (active as "Notes")
                  : "More",
            }),
            href,
          )}
        </div>
      </div>
    </StudioLive.Provider>
  );
}
