"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
  type AnchorHTMLAttributes,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brand } from "@qelvora/brand";
import { EmptyState, Notice, Sidebar, StudioTabBar } from "@qelvora/ui-web";
import { validReturnTarget } from "@qelvora/api";
import { configureStudioRequests, StudioFailure, studioRequest } from "./api";
import "./studio.css";
import { useIdentityRequest } from "../identity/session-boundary";
import type { Creator, Queue } from "./shared/types";
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

function words(node: ReactNode): string {
  return Children.toArray(node)
    .map((n) =>
      typeof n === "string"
        ? n
        : isValidElement<{ children?: ReactNode }>(n)
          ? words(n.props.children)
          : "",
    )
    .join("");
}
function navigationTree(
  node: ReactNode,
  href: (label: string) => string,
): ReactNode {
  return Children.map(node, (n) => {
    if (!isValidElement<AnchorHTMLAttributes<HTMLAnchorElement>>(n)) return n;
    const children = navigationTree(n.props.children, href);
    if (n.type === "a")
      return (
        <Link
          {...n.props}
          key={n.key}
          href={href(words(n.props.children))}
          prefetch={false}
        >
          {children}
        </Link>
      );
    return cloneElement(n, { children });
  });
}
function studioSidebar(
  props: Parameters<typeof Sidebar>[0],
  moreHref: string,
  active: boolean,
) {
  const sidebar = Sidebar(props) as ReactElement<{ children?: ReactNode }>;
  const children = Children.toArray(sidebar.props.children);
  children.splice(
    children.length - 1,
    0,
    <div key="w5-more" className="qv-side__group">
      <Link
        href={moreHref}
        prefetch={false}
        className={`qv-side__item${active ? " is-active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <span className="qv-side__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
            <circle cx="5.5" cy="11" r="1.4" fill="currentColor" />
            <circle cx="11" cy="11" r="1.4" fill="currentColor" />
            <circle cx="16.5" cy="11" r="1.4" fill="currentColor" />
          </svg>
        </span>
        <span className="qv-side__label">More</span>
      </Link>
    </div>,
  );
  return cloneElement(sidebar, { children });
}
function useRequestsCount(creator: Creator | null, suspended: boolean) {
  const [count, setCount] = useState<number>();
  useEffect(() => {
    setCount(undefined);
    if (
      !creator ||
      suspended ||
      (!creator.owned && !creator.roles.includes("triage"))
    )
      return;
    let closed = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (closed || document.hidden || controller) return;
      const current = new AbortController();
      controller = current;
      try {
        const result = await studioRequest<Queue>(
          "studio",
          `${creator.id}/queue?filter=all&limit=1`,
          undefined,
          creator.viewerAccountId,
          {
            signal: AbortSignal.any([
              current.signal,
              AbortSignal.timeout(4000),
            ]),
          },
        );
        if (!closed && !document.hidden)
          setCount(
            Number.isSafeInteger(result.requests) && result.requests >= 0
              ? result.requests
              : undefined,
          );
      } catch {
        if (!closed) setCount(undefined);
      } finally {
        if (controller === current) controller = null;
      }
    };
    const visibility = () => {
      if (document.hidden) {
        controller?.abort();
        setCount(undefined);
      } else void load();
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      closed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [
    creator?.id,
    creator?.viewerAccountId,
    creator?.owned,
    creator?.roles,
    suspended,
  ]);
  return count;
}
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
    ? `/studio/${creatorId}/${screen.join("/") || "notes"}`
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
    [loading, setLoading] = useState(true);
  const requests = useRequestsCount(creator, suspended);
  const generation = useRef(0),
    roleRequest = useRef<AbortController | null>(null),
    reconnectButton = useRef<HTMLButtonElement>(null),
    previousFocus = useRef<HTMLElement | null>(null),
    router = useRouter();
  const conceal = useCallback(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest(".w5-studio"))
      previousFocus.current = focused;
    setSuspended(true);
  }, []);
  const refresh = useCallback(async () => {
    if (document.hidden) {
      conceal();
      return;
    }
    if (roleRequest.current) return;
    const controller = new AbortController();
    roleRequest.current = controller;
    const current = ++generation.current;
    const started = performance.now();
    setLoading(true);
    setError("");
    try {
      const result = await studioRequest<{
        creators: Creator[];
        invitations: typeof invitations;
      }>("studio", "session", undefined, undefined, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
      });
      if (current !== generation.current) return;
      if (document.hidden || performance.now() >= started + 5000)
        throw new StudioFailure(
          503,
          "authority_expired",
          "Reconnect to check your current account and roles. Your input is kept.",
        );
      setCreators(result.creators);
      setSessionExpired(false);
      setInvitations(result.invitations);
      setCreator(result.creators.find((c) => c.id === creatorId) ?? null);
      setFreshUntil(started + 5000);
      setSuspended(false);
    } catch (failure) {
      if (current !== generation.current) return;
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
      } else {
        setCreator(null);
        setFreshUntil(0);
        previousFocus.current = null;
      }
      setSuspended(unavailable);
      setError(
        failure instanceof Error ? failure.message : "Studio is unavailable.",
      );
    } finally {
      if (roleRequest.current === controller) roleRequest.current = null;
      if (current === generation.current) setLoading(false);
    }
  }, [conceal, creatorId]);
  useEffect(() => {
    if (!creator || !freshUntil) return;
    // A slow role request cannot extend the last successful authority check.
    const timer = setTimeout(
      conceal,
      Math.max(0, freshUntil - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [conceal, creator, freshUntil]);
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
    void refresh();
    return () => {
      generation.current++;
      roleRequest.current?.abort();
      roleRequest.current = null;
    };
  }, [refresh]);
  useEffect(() => {
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.hidden) {
        generation.current++;
        roleRequest.current?.abort();
        roleRequest.current = null;
        setFreshUntil(0);
        conceal();
      } else void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(onFocus, 4000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [conceal, refresh]);
  const root = `/studio/${creatorId}`,
    continuation = `${sessionExpired ? "/api/auth/restore" : "/auth/continue"}?returnTo=${encodeURIComponent(returnTo)}`,
    current = screen[0] ?? "notes";
  const paths: Record<string, string> = {
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
    current === "compose"
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
            <Link key={c.id} className="w5-card" href={`/studio/${c.id}/notes`}>
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
                  await refresh();
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
    <>
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
            onClick={() => void refresh()}
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
            <Link href="/studio/workspace">{brand.studioName}</Link>
            <span>
              {creator.owned
                ? creator.display_name
                : `Team · ${creator.roles.join(", ")}`}
            </span>
            <button
              type="button"
              className="qv-link-btn"
              onClick={() => void refresh()}
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
              onDone={() => router.push(`${root}/notes`)}
            />
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
              active: [
                "Notes",
                "Requests",
                "Threads",
                "My AI",
                "More",
              ].includes(active)
                ? (active as "Notes")
                : "More",
            }),
            href,
          )}
        </div>
      </div>
    </>
  );
}
