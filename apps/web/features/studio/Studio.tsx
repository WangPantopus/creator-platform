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
import { copy } from "@qelvora/copy";
import {
  AuthorLabel,
  AuditBanner,
  CapacityHeader,
  EmptyState,
  LabelPreview,
  Message,
  Notice,
  QueueCard,
  Sidebar,
  StudioTabBar,
} from "@qelvora/ui-web";
import type { SignedActCommand } from "@qelvora/api";
import { validReturnTarget, MessageSchema } from "@qelvora/api";
import { SignedActReview } from "../identity/signing";
import { VoicePlayer } from "../media/VoicePlayer";
import {
  ConversationMessageSchema,
  type ConversationMessage,
} from "../../../../packages/api/src/conversation/contracts";
import { ConversationVoiceReply } from "./ConversationVoiceReply";
import { ApprovedReply } from "./ApprovedReply";
import { CorrectionReply } from "./CorrectionReply";
import { ConversationCorrectionMessageSchema } from "../../../../packages/api/src/conversation/correction";
import { configureStudioRequests, StudioFailure, studioRequest } from "./api";
import "./studio.css";
import { useIdentityRequest } from "../identity/session-boundary";
import type { Creator, Packet, Queue } from "./shared/types";
import {
  key,
  money,
  packetStateLabel,
  paymentStateLabel,
  speakerLabel,
  time,
} from "./shared/format";
import { Feedback, useAction } from "./shared/action";
import { Modal } from "./shared/Modal";
import { ThanksFeed } from "./thanks/ThanksFeed";
import { More } from "./more/More";
import { Team } from "./team/Team";
import { Notes } from "./notes/Notes";
import { Compose } from "./notes/Compose";
import { Library } from "./library/Library";

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
function Requests({ creator }: { creator: Creator }) {
  const [queue, setQueue] = useState<Queue | null>(null),
    [filter, setFilter] = useState("all"),
    [ready, setReady] = useState(false),
    [reload, setReload] = useState(0),
    action = useAction(),
    router = useRouter();
  const positionKey = `w5.queue:${creator.viewerAccountId}:${creator.id}`;
  const pages = useRef(1),
    restore = useRef<{ pages: number; scroll: number } | null>(null),
    requestGeneration = useRef(0);
  useEffect(() => {
    // Persist only navigation metadata. Every return reloads current authorized
    // producer pages; private packet/disclosure text never enters storage.
    try {
      const stored = JSON.parse(sessionStorage.getItem(positionKey) ?? "null");
      if (
        stored &&
        ["all", "due", "decide", "more_info"].includes(stored.filter) &&
        Number.isInteger(stored.pages) &&
        stored.pages >= 1 &&
        stored.pages <= 50 &&
        Number.isFinite(stored.scroll) &&
        stored.scroll >= 0
      ) {
        setFilter(stored.filter);
        restore.current = { pages: stored.pages, scroll: stored.scroll };
      }
    } catch {
      // Invalid or unavailable storage starts a fresh current queue.
    }
    setReady(true);
  }, [positionKey]);
  useEffect(() => {
    if (!ready) return;
    const current = ++requestGeneration.current;
    let frame: number | undefined;
    const position = restore.current;
    restore.current = null;
    void action.run(async () => {
      let result = await studioRequest<Queue>(
        "studio",
        `${creator.id}/queue?filter=${filter}`,
      );
      if (current !== requestGeneration.current) return;
      setQueue(result);
      let loadedPages = 1;
      while (
        current === requestGeneration.current &&
        result.nextCursor &&
        loadedPages < (position?.pages ?? 1)
      ) {
        const next = await studioRequest<Queue>(
          "studio",
          `${creator.id}/queue?filter=${filter}&cursor=${result.nextCursor}`,
        );
        result = { ...next, items: [...result.items, ...next.items] };
        loadedPages++;
        if (current === requestGeneration.current) setQueue(result);
      }
      if (current !== requestGeneration.current) return;
      pages.current = loadedPages;
      setQueue(result);
      if (position)
        frame = requestAnimationFrame(() =>
          window.scrollTo(0, position.scroll),
        );
    });
    return () => {
      requestGeneration.current++;
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [creator.id, filter, ready, reload]);
  const rememberPosition = () => {
    try {
      sessionStorage.setItem(
        positionKey,
        JSON.stringify({
          filter,
          pages: Math.min(pages.current, 50),
          scroll: window.scrollY,
        }),
      );
    } catch {
      // Storage availability never blocks opening a current request.
    }
  };
  return (
    <section className="w5-requests">
      <header className="w5-heading">
        <h1>Requests</h1>
        <button
          className="qv-link-btn"
          disabled={action.busy || !ready}
          onClick={() => {
            restore.current = null;
            pages.current = 1;
            setQueue(null);
            setReload((value) => value + 1);
          }}
        >
          Refresh requests
        </button>
        <span className="qv-meta">
          {queue?.items.length ?? "—"}
          {queue?.nextCursor ? "+" : ""}
        </span>
      </header>
      <Feedback action={action} />
      {queue && (
        <div className="w5-gutter">
          <CapacityHeader
            rows={queue.capacity.map((c) => ({
              mode: c.title,
              used: c.used + c.reserved,
              limit: c.weekly_limit,
            }))}
            line="Used and reserved capacity from Offers"
          />
        </div>
      )}
      <div className="w5-gutter">
        <label className="w5-field">
          Filter
          <select
            value={filter}
            disabled={action.busy || !ready}
            onChange={(e) => {
              restore.current = null;
              pages.current = 1;
              setQueue(null);
              setFilter(e.target.value);
              try {
                sessionStorage.setItem(
                  positionKey,
                  JSON.stringify({
                    filter: e.target.value,
                    pages: 1,
                    scroll: 0,
                  }),
                );
              } catch {
                // The filter still works without browser storage.
              }
            }}
          >
            <option value="all">All</option>
            <option value="due">Due</option>
            <option value="decide">To decide</option>
            <option value="more_info">Waiting for more information</option>
          </select>
        </label>
      </div>
      {[
        "Due",
        "To decide",
        "Waiting for more information",
        "Waiting for fan decision",
      ].map((section, index) => {
        const items =
          queue?.items.filter((p) => {
            const due = Boolean(
              p.commitment_id &&
                ["due", "in_progress"].includes(p.commitment_state ?? ""),
            );
            return index === 0
              ? due
              : !due &&
                  p.state ===
                    ["", "submitted", "more_info", "offer_pending"][index];
          }) ?? [];
        if (index > 1 && !items.length) return null;
        return (
          <div className="w5-queue-section" key={section}>
            <h2>{section}</h2>
            {items.map((p) => (
              <button
                key={p.id}
                className="w5-queue-open"
                onClick={() => {
                  rememberPosition();
                  router.push(`/studio/${creator.id}/packets/${p.id}`);
                }}
              >
                <QueueCard
                  kind={index === 0 ? "commitment" : "packet"}
                  handle={`@${p.handle}`}
                  mode={p.snapshot.title}
                  price={money(p.snapshot.amount, p.snapshot.currency)}
                  due={`${index === 0 ? "DUE" : index === 1 ? "DECIDE BY" : "HOLD EXPIRES"} ${time(p.deadline)}`}
                  summary={p.disclosure.summary ?? "Fan-selected disclosure"}
                  shared="Only the fan's selected disclosure"
                  overdue={
                    index < 2 && new Date(p.deadline).getTime() < Date.now()
                  }
                />
              </button>
            ))}
          </div>
        );
      })}
      {queue?.items.length === 0 && (
        <div className="w5-gutter">
          <EmptyState
            title="You're up to date"
            body="Requests and accepted commitments appear here. Opening them does not charge or fulfill anything."
          />
        </div>
      )}
      {queue?.nextCursor && (
        <button
          disabled={action.busy}
          className="qv-btn qv-btn--secondary"
          onClick={() =>
            void action.run(async () => {
              const next = await studioRequest<Queue>(
                "studio",
                `${creator.id}/queue?filter=${filter}&cursor=${queue.nextCursor}`,
              );
              pages.current++;
              setQueue({ ...next, items: [...queue.items, ...next.items] });
            })
          }
        >
          More requests
        </button>
      )}
    </section>
  );
}
function PacketDetail({ creator, id }: { creator: Creator; id: string }) {
  const [detail, setDetail] = useState<Packet | null>(null),
    [text, setText] = useState(""),
    [draftVersion, setDraftVersion] = useState(0),
    [decision, setDecision] = useState<string | null>(null),
    [command, setCommand] = useState<SignedActCommand | null>(null),
    [proposedMode, setProposedMode] = useState(""),
    [approveDraft, setApproveDraft] = useState(false),
    [deliveries, setDeliveries] = useState<ConversationMessage[] | null>(null),
    action = useAction();
  const router = useRouter(),
    edited = useRef(false);
  const load = useCallback(async () => {
    const value = await studioRequest<Packet>(
      "studio",
      `${creator.id}/packets/${id}`,
    );
    setDetail(value);
    if (!edited.current) {
      const draft = await studioRequest<{ text: string; version: number }>(
        "studio",
        `${creator.id}/threads/${value.packet.fan_id}/draft`,
      );
      setText(draft.text);
      setDraftVersion(draft.version);
    }
  }, [creator.id, id]);
  useEffect(() => {
    void action.run(load);
  }, [load]);
  const savePacketDraft = async () => {
    if (!detail) return;
    const saved = await studioRequest<{ version: number }>(
      "studio",
      `${creator.id}/threads/${detail.packet.fan_id}/draft`,
      { text, expectedVersion: draftVersion, idempotencyKey: key() },
      creator.viewerAccountId,
    );
    setDraftVersion(saved.version);
    edited.current = false;
  };
  const decide = async (name: string, signedActId?: string) => {
    if (!detail) return;
    await studioRequest(
      "studio",
      `${creator.id}/packets/${id}/decide`,
      {
        action: name,
        version: detail.packet.version,
        idempotencyKey: key(),
        ...(signedActId ? { signedActId } : {}),
        ...(text ? { text } : {}),
        ...(proposedMode ? { proposedModeId: proposedMode } : {}),
      },
      creator.viewerAccountId,
    );
    setCommand(null);
    setDecision(null);
    await load();
  };
  const signedDecision = async (name: string) => {
    if (!detail) return;
    const mode = detail.groupModes.find((m) => m.id === proposedMode);
    if (name === "group_offer" && !mode)
      throw new Error("Choose a current lower-priced group offer first.");
    setDecision(name);
    setCommand({
      actType: "accept",
      subjectId: detail.packet.thread_id,
      content: {
        packetId: id,
        packetVersion: detail.packet.version,
        snapshot: detail.packet.snapshot,
        action: name,
        ...(name === "group_offer" && mode
          ? {
              proposedMode: {
                id: mode.id,
                kind: mode.kind,
                amount: mode.amount,
                currency: mode.currency,
                version: mode.version,
              },
            }
          : {}),
      },
    });
  };
  return (
    <section className="w5-packet">
      <header className="w5-compose-head">
        <Link href={`/studio/${creator.id}/requests`}>Back</Link>
        <strong>A request</strong>
        <span />
      </header>
      <Feedback action={action} />
      {detail && (
        <>
          <div className="w5-gutter">
            <h1>{detail.packet.snapshot.title}</h1>
            <p className="qv-meta">
              {money(
                detail.packet.snapshot.amount,
                detail.packet.snapshot.currency,
              )}{" "}
              · {packetStateLabel(detail.packet.state)} ·{" "}
              {paymentStateLabel(detail.packet.payment_state)}
            </p>
            <p>
              Decide by {time(detail.packet.decision_at)} · hold expires{" "}
              {time(detail.packet.hold_expires_at)}
            </p>
            <div className="w5-card">
              <h2>Included in your request</h2>
              <p className="w5-fan-text">{detail.packet.disclosure.summary}</p>
              {detail.packet.disclosure.messages?.map((m, i) => (
                <p key={i}>{m.text}</p>
              ))}
              <dl>
                <dt>Shared identity</dt>
                <dd>
                  {detail.packet.disclosure.identity === "shared_intro"
                    ? "Handle and shared introduction"
                    : "Handle"}
                </dd>
                <dt>Conversation selection</dt>
                <dd>
                  {detail.packet.disclosure.wholeThread
                    ? "Fan selected the whole conversation snapshot"
                    : `${detail.packet.disclosure.messages?.length ?? 0} selected messages`}
                </dd>
                <dt>Attachments</dt>
                <dd>
                  {detail.packet.disclosure.attachmentIds?.length ?? 0} selected
                  attachments
                </dd>
              </dl>
              {Boolean(detail.packet.disclosure.attachmentIds?.length) && (
                <Notice title="Attachment access">
                  The media service must provide current attachment access
                  before playback.
                </Notice>
              )}
              <Link
                href={`/studio/${creator.id}/threads/${detail.packet.fan_id}`}
              >
                Open the audited full conversation
              </Link>
            </div>
          </div>
          <div className="w5-gutter">
            <LabelPreview kind="human_creator" name={creator.display_name} />
            <label className="w5-field">
              Your written reply
              <textarea
                value={text}
                onChange={(e) => {
                  edited.current = true;
                  setText(e.target.value);
                  setCommand(null);
                }}
                rows={5}
              />
            </label>
            {detail.commitment && (
              <p className="qv-help">
                Commitment {detail.commitment.state} · due{" "}
                {time(detail.commitment.due_at)}. Only a delivered
                creator-signed reply can fulfill a written commitment.
              </p>
            )}
            <div className="w5-actions">
              {!detail.commitment && (
                <button
                  className="qv-btn qv-btn--maya"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() =>
                      signedDecision(
                        detail.packet.snapshot.mode === "voice_note"
                          ? "voice_note"
                          : detail.packet.snapshot.mode.includes("call")
                            ? "offer_times"
                            : "reply_myself",
                      ),
                    )
                  }
                >
                  Accept promised service
                </button>
              )}
              <button
                className="qv-btn qv-btn--secondary"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await savePacketDraft();
                    router.push(
                      `/studio/${creator.id}/threads/${detail.packet.fan_id}`,
                    );
                  })
                }
              >
                Save reply and open audited thread
              </button>
              <button
                className="qv-btn qv-btn--quiet"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await savePacketDraft();
                    action.setNotice(
                      `Draft saved · revision ${draftVersion + 1}`,
                    );
                  })
                }
              >
                Save written draft
              </button>
              {detail.packet.snapshot.mode === "voice_note" && (
                <button
                  className="qv-link-btn"
                  onClick={() =>
                    action.setNotice(
                      "Voice replies are unavailable for this request. You can still save your written draft.",
                    )
                  }
                >
                  Record human voice
                </button>
              )}
              {detail.commitment &&
                detail.packet.snapshot.mode.includes("call") && (
                  <Link
                    href={`/studio/calls/${creator.id}/${detail.packet.fan_id}/${detail.commitment.id}`}
                  >
                    Offer times
                  </Link>
                )}
            </div>
            <details className="w5-card">
              <summary>Instead</summary>
              <p className="qv-help">
                Changed modes and prices need the fan's choice. Every action
                goes to the commerce producer.
              </p>
              <label className="w5-field">
                Current lower-priced group offer
                <select
                  value={proposedMode}
                  onChange={(e) => setProposedMode(e.target.value)}
                >
                  <option value="">Choose an offer</option>
                  {detail.groupModes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.title} · {money(Number(mode.amount), mode.currency)}
                    </option>
                  ))}
                </select>
              </label>
              {[
                ["ai_answer", "Let AI answer"],
                ["approve_draft", "Approve exact draft"],
                ["reply_myself", "Reply myself"],
                ["voice_note", "Send human voice"],
                ["offer_times", "Offer times"],
                ["group_offer", "Offer a group answer"],
                ["more_info", "Ask for more information"],
                ["decline", "Decline"],
              ].map(([name, label]) => (
                <button
                  key={name}
                  className="qv-btn qv-btn--secondary"
                  disabled={
                    action.busy ||
                    (name === "approve_draft" &&
                      !creator.owned &&
                      !(
                        creator.roles.includes("triage") &&
                        creator.roles.includes("drafter")
                      ))
                  }
                  onClick={() =>
                    void action.run(async () => {
                      if (["ai_answer", "more_info", "decline"].includes(name!))
                        await decide(name!);
                      else if (name === "approve_draft") setApproveDraft(true);
                      else await signedDecision(name!);
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </details>
            <div className="w5-card">
              {detail.commitment &&
                ["written_reply", "voice_note"].includes(
                  detail.packet.snapshot.mode,
                ) &&
                ["due", "in_progress"].includes(detail.commitment.state) && (
                  <>
                    <h2>
                      {detail.packet.snapshot.mode === "voice_note"
                        ? "Fulfill with a delivered recording"
                        : "Fulfill with a delivered reply"}
                    </h2>
                    <p>
                      Choose your signed reply or recording for this request. It
                      must match the promised service.
                    </p>
                    <button
                      className="qv-btn qv-btn--secondary"
                      disabled={action.busy}
                      onClick={() =>
                        void action.run(async () => {
                          const result = await studioRequest<{
                            items: unknown;
                          }>(
                            "studio",
                            `${creator.id}/packets/${id}/deliveries`,
                          );
                          setDeliveries(
                            ConversationMessageSchema.array()
                              .max(100)
                              .parse(result.items),
                          );
                        })
                      }
                    >
                      Open audited signed replies
                    </button>
                    {deliveries && <AuditBanner />}
                    {deliveries?.map((message) => (
                      <article key={message.id}>
                        <AuthorLabel
                          kind={
                            message.authorKind === "approved_draft"
                              ? "approved_draft"
                              : "human_creator"
                          }
                          name={creator.display_name}
                        />
                        {message.recording?.state === "available" ? (
                          <VoicePlayer
                            asset={message.recording.asset}
                            creatorId={creator.id}
                            fanId={detail.packet.fan_id}
                            creatorName={creator.display_name}
                            time={message.createdAt}
                            expectedAccountId={creator.viewerAccountId}
                          />
                        ) : (
                          <p>{message.text}</p>
                        )}
                        <button
                          className="qv-btn qv-btn--secondary"
                          disabled={action.busy}
                          onClick={() =>
                            void action.run(async () => {
                              await studioRequest(
                                "studio",
                                `${creator.id}/packets/${id}/deliver`,
                                {
                                  messageId: message.id,
                                  version: detail.commitment!.version,
                                  idempotencyKey: key(),
                                },
                                creator.viewerAccountId,
                              );
                              await load();
                              setDeliveries(null);
                            })
                          }
                        >
                          {detail.packet.snapshot.mode === "voice_note"
                            ? "Use this delivered recording"
                            : "Use this delivered reply"}
                        </button>
                      </article>
                    ))}
                    {deliveries?.length === 0 && (
                      <p>
                        {detail.packet.snapshot.mode === "voice_note"
                          ? "No current signed recording is available. Deliver your personal recording in the audited thread first."
                          : "No signed delivered reply is available. Send your personal reply in the audited thread first."}
                      </p>
                    )}
                  </>
                )}
              {detail.packet.state === "accepted" &&
                detail.commitment?.state === "delivered" && (
                  <Link href={`/studio/${creator.id}/publish?packet=${id}`}>
                    Compose a public answer with current sharing permission
                  </Link>
                )}
              <h2>Payment record</h2>
              {detail.ledger.map((l, i) => (
                <p key={i} className="qv-meta">
                  {l.kind} · {money(Number(l.amount), l.currency)} · {l.cause}
                </p>
              ))}
              {!detail.ledger.length && <p>No money movement is recorded.</p>}
            </div>
          </div>
        </>
      )}
      {command && detail && (
        <Modal title="Review acceptance" onClose={() => setCommand(null)}>
          <SignedActReview
            creatorId={creator.id}
            command={command}
            creatorName={creator.display_name}
            text={`Accept ${detail.packet.snapshot.title}`}
            title="Accept the current request"
            rows={[
              [
                "Fan is charged",
                money(
                  detail.packet.snapshot.amount,
                  detail.packet.snapshot.currency,
                ),
              ],
              ["Promised mode", detail.packet.snapshot.title],
            ]}
            onSigned={async (signedActId) => decide(decision!, signedActId)}
          />
        </Modal>
      )}
      {approveDraft && detail && (
        <Modal
          title="Review an AI-prepared draft"
          onClose={() => setApproveDraft(false)}
        >
          <ApprovedReply
            key={`${creator.viewerAccountId}:${creator.id}:${detail.packet.fan_id}`}
            creator={creator}
            fanId={detail.packet.fan_id}
            deliveryAllowed={Boolean(
              detail.commitment &&
                ["due", "in_progress"].includes(detail.commitment.state),
            )}
            deliveryHelp="Accept the promised service before sending this reply. Then use its delivered message to fulfill the current request."
            onDelivered={load}
          />
        </Modal>
      )}
    </section>
  );
}
function Threads({ creator, fanId }: { creator: Creator; fanId?: string }) {
  const voiceTrigger = useRef<HTMLButtonElement | null>(null);
  const [voiceReply, setVoiceReply] = useState<{
    fanId: string;
    threadId: string;
  } | null>(null);
  const [voicePending, setVoicePending] = useState(false);
  const [entries, setEntries] = useState<{
      items: {
        fanId: string;
        handle: string;
        sources: string[];
        updatedAt: string;
      }[];
      nextCursor: string | null;
    } | null>(null),
    [filter, setFilter] = useState("all"),
    [data, setData] = useState<{
      timeline: {
        threadId: string;
        control: string;
        epoch: number;
        messages: {
          id: string;
          authorKind: string;
          text: string;
          deliveryState: string;
          signedActId?: string;
          member?: string | null;
          version?: number;
          correction?: unknown;
        }[];
      };
      authority: string;
      creatorName: string;
    } | null>(null),
    [text, setText] = useState(""),
    [draftVersion, setDraftVersion] = useState(0),
    [draftDirty, setDraftDirty] = useState(false),
    [sentMessageId, setSentMessageId] = useState<string | null>(null),
    [review, setReview] = useState(false),
    [approveDraft, setApproveDraft] = useState(false),
    [correction, setCorrection] = useState<string | null>(null),
    [attachedCorrection, setAttachedCorrection] = useState<string | null>(null),
    [attachedVersion, setAttachedVersion] = useState<number | undefined>(
      undefined,
    ),
    [correctionPending, setCorrectionPending] = useState(false),
    [threadCurrent, setThreadCurrent] = useState(false),
    [teamPending, setTeamPending] = useState<{
      idempotencyKey: string;
      draftVersion: number;
      messageId?: string;
    } | null>(null),
    action = useAction();
  const draftEdited = useRef(false),
    threadLoading = useRef(false),
    threadMounted = useRef(false),
    threadGeneration = useRef(0),
    threadCheckedAt = useRef(0),
    directoryCursors = useRef<(string | null)[]>([null]),
    pendingTeam = useRef<typeof teamPending>(null);
  const teamStorage = `w5.team-reply:${creator.viewerAccountId}:${creator.id}:${fanId}`;
  const rememberTeam = useCallback(
    (value: typeof teamPending) => {
      pendingTeam.current = value;
      setTeamPending(value);
      try {
        if (value) sessionStorage.setItem(teamStorage, JSON.stringify(value));
        else sessionStorage.removeItem(teamStorage);
      } catch {
        /* Durable draft still lives with W5. */
      }
    },
    [teamStorage],
  );
  const load = useCallback(async () => {
    if (threadLoading.current) return;
    threadLoading.current = true;
    const generation = threadGeneration.current;
    const started = performance.now();
    try {
      if (fanId) {
        const timeline = await studioRequest<NonNullable<typeof data>>(
          "studio",
          `${creator.id}/threads/${fanId}`,
          undefined,
          creator.viewerAccountId,
        );
        const draft = await studioRequest<{
          text: string;
          version: number;
          sentMessageId: string | null;
        }>(
          "studio",
          `${creator.id}/threads/${fanId}/draft`,
          undefined,
          creator.viewerAccountId,
        );
        if (!threadMounted.current || generation !== threadGeneration.current)
          return;
        setData(timeline);
        const pending = pendingTeam.current;
        if (
          pending?.messageId &&
          draft.version > pending.draftVersion &&
          draft.text === "" &&
          timeline.timeline.messages.some(
            (message) =>
              message.id === pending.messageId &&
              message.authorKind === "team" &&
              message.deliveryState === "delivered",
          )
        )
          rememberTeam(null);
        setSentMessageId(draft.sentMessageId);
        if (!draftEdited.current) {
          setDraftVersion(draft.version);
          setText(draft.text);
        }
      } else {
        const cursor = directoryCursors.current.at(-1);
        const value = await studioRequest<NonNullable<typeof entries>>(
          "studio",
          `${creator.id}/threads${cursor ? `?${new URLSearchParams({ cursor })}` : ""}`,
          undefined,
          creator.viewerAccountId,
        );
        // Refresh one visible bounded page. Earlier private rows are discarded;
        // retaining only their opaque cursors avoids cumulative lease expiry.
        if (!threadMounted.current || generation !== threadGeneration.current)
          return;
        setEntries(value);
      }
      threadCheckedAt.current = started;
      setThreadCurrent(!document.hidden && performance.now() - started < 5000);
    } catch (error) {
      if (threadMounted.current && generation === threadGeneration.current) {
        setThreadCurrent(false);
        if (
          error instanceof StudioFailure &&
          ([401, 403, 404].includes(error.status) ||
            error.code === "session_account_changed" ||
            error.code === "session_changed")
        ) {
          setData(null);
          setEntries(null);
          setText("");
          setReview(false);
          setApproveDraft(false);
          setCorrection(null);
          setAttachedCorrection(null);
          setCorrectionPending(false);
          draftEdited.current = false;
        }
      }
      throw error;
    } finally {
      threadLoading.current = false;
    }
  }, [creator.id, creator.viewerAccountId, fanId, rememberTeam]);
  useEffect(() => {
    threadMounted.current = true;
    try {
      const raw = sessionStorage.getItem(teamStorage),
        value = raw ? (JSON.parse(raw) as typeof teamPending) : null;
      if (
        value &&
        typeof value.idempotencyKey === "string" &&
        /^[a-f0-9-]{36}$/u.test(value.idempotencyKey) &&
        Number.isSafeInteger(value.draftVersion) &&
        value.draftVersion > 0 &&
        (!value.messageId || /^[a-f0-9-]{36}$/u.test(value.messageId))
      )
        rememberTeam(value);
    } catch {
      /* Corrupt metadata cannot select an actor or invent a receipt. */
    }
    void action.run(load);
    const refresh = () => {
        if (!document.hidden) void action.run(load);
      },
      visibility = () => {
        if (document.hidden) {
          threadGeneration.current++;
          setThreadCurrent(false);
        } else refresh();
      },
      polling = setInterval(refresh, 4000),
      expiry = setInterval(() => {
        if (performance.now() - threadCheckedAt.current >= 5000)
          setThreadCurrent(false);
      }, 500);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      threadMounted.current = false;
      threadGeneration.current++;
      clearInterval(polling);
      clearInterval(expiry);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, teamStorage, rememberTeam]);
  const sendTeam = async () => {
    if (!fanId || !data || creator.owned) return;
    let command = pendingTeam.current;
    if (!command) {
      const saved = await studioRequest<{ version: number }>(
        "studio",
        `${creator.id}/threads/${fanId}/draft`,
        {
          text: text.trim(),
          expectedVersion: draftVersion,
          idempotencyKey: key(),
        },
        creator.viewerAccountId,
      );
      setDraftVersion(saved.version);
      setDraftDirty(false);
      draftEdited.current = false;
      setText(text.trim());
      command = { idempotencyKey: key(), draftVersion: saved.version };
      rememberTeam(command);
    }
    const saved = await studioRequest<{ text: string; version: number }>(
      "studio",
      `${creator.id}/threads/${fanId}/draft`,
      undefined,
      creator.viewerAccountId,
    );
    if (saved.version !== command.draftVersion)
      throw new Error(
        "The saved draft changed while the Team reply was unconfirmed. Refresh the audited conversation before another send.",
      );
    const message = MessageSchema.pick({
      id: true,
      threadId: true,
      authorKind: true,
      deliveryState: true,
      signedActId: true,
      member: true,
      authorAccountId: true,
    })
      .refine(
        (value) =>
          value.threadId === data.timeline.threadId &&
          value.authorKind === "team" &&
          value.deliveryState === "delivered" &&
          value.signedActId === null &&
          value.authorAccountId === creator.viewerAccountId &&
          typeof value.member === "string" &&
          value.member.length > 0,
      )
      .parse(
        await studioRequest(
          "conversations",
          `${creator.id}/${fanId}/team-replies`,
          { text: saved.text, idempotencyKey: command.idempotencyKey },
          creator.viewerAccountId,
        ),
      );
    rememberTeam({ ...command, messageId: message.id });
    const cleared = await studioRequest<{ version: number }>(
      "studio",
      `${creator.id}/threads/${fanId}/draft`,
      {
        text: "",
        expectedVersion: saved.version,
        idempotencyKey: `clear_${command.idempotencyKey}`,
      },
      creator.viewerAccountId,
    );
    setDraftVersion(cleared.version);
    setText("");
    setDraftDirty(false);
    draftEdited.current = false;
    rememberTeam(null);
    action.setNotice(`Team reply delivered · ${message.id}`);
    await load();
  };
  return (
    <section className="w5-threads">
      <header className="w5-heading">
        <h1>Threads</h1>
        <button
          className="qv-link-btn"
          disabled={action.busy}
          onClick={() => void action.run(load)}
        >
          Refresh conversations
        </button>
      </header>
      <div className="w5-gutter">
        <AuditBanner />
        <Feedback action={action} />
        {!threadCurrent && (
          <p role="status">
            Checking current conversation access. Your draft stays here during a
            connection interruption.
          </p>
        )}
        <div hidden={!threadCurrent} inert={!threadCurrent}>
          {!fanId ? (
            <>
              <p className="qv-help">
                Conversation access is separate from request routing. Every
                full-thread open is recorded for the fan.
              </p>
              <p className="qv-help">
                Conversations linked to your Notes and requests appear here.
              </p>
              <label className="w5-field">
                Show conversations
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                >
                  <option value="all">All linked conversations</option>
                  <option value="note_reply">Note replies</option>
                  <option value="request">Requests</option>
                </select>
              </label>
              {entries?.items
                .filter(
                  (entry) => filter === "all" || entry.sources.includes(filter),
                )
                .map((entry) => (
                  <article className="w5-card" key={entry.fanId}>
                    <h2>@{entry.handle}</h2>
                    <p className="qv-meta">
                      {entry.sources
                        .map((source) =>
                          source === "note_reply" ? "Note reply" : "Request",
                        )
                        .join(" · ")}
                    </p>
                    <Link
                      className="qv-btn qv-btn--secondary"
                      href={`/studio/${creator.id}/threads/${entry.fanId}`}
                    >
                      Open audited conversation
                    </Link>
                  </article>
                ))}
              {entries?.items.length === 0 && (
                <EmptyState
                  title="No linked conversations"
                  body="Current conversations will appear when fans reply to Notes or send requests."
                />
              )}
              <div className="w5-actions">
                {directoryCursors.current.length > 1 && (
                  <button
                    className="qv-btn qv-btn--secondary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        threadGeneration.current++;
                        setThreadCurrent(false);
                        setEntries(null);
                        directoryCursors.current.pop();
                        await load();
                      })
                    }
                  >
                    Previous conversations
                  </button>
                )}
                {entries?.nextCursor && (
                  <button
                    className="qv-btn qv-btn--secondary"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        if (!entries.nextCursor) return;
                        threadGeneration.current++;
                        setThreadCurrent(false);
                        directoryCursors.current.push(entries.nextCursor);
                        setEntries(null);
                        await load();
                      })
                    }
                  >
                    Next conversations
                  </button>
                )}
              </div>
            </>
          ) : (
            data && (
              <>
                <p className="qv-meta">
                  Current speaker ·{" "}
                  {speakerLabel(data.timeline.control, creator.display_name)}
                </p>
                <div className="w5-thread-messages">
                  {data.timeline.messages.map((m) => {
                    const parsed =
                      ConversationCorrectionMessageSchema.safeParse(m);
                    const attachment =
                      parsed.success &&
                      parsed.data.authorKind === "human_creator" &&
                      parsed.data.signedActId
                        ? parsed.data.correction
                        : null;
                    return (
                      <article key={m.id}>
                        <Message
                          kind={m.authorKind as "fan"}
                          name={creator.display_name}
                          signedActId={m.signedActId}
                          member={m.member ?? "Member identity unavailable"}
                          actions={false}
                        >
                          {m.text}
                        </Message>
                        {attachment && (
                          <Notice title="Correction to the AI answer">
                            <p>
                              Original answer · version{" "}
                              {attachment.originalVersion}
                            </p>
                            <button
                              className="qv-btn qv-btn--quiet"
                              onClick={() => {
                                setAttachedVersion(attachment.originalVersion);
                                setAttachedCorrection(
                                  attachment.originalMessageId,
                                );
                              }}
                            >
                              Open original answer
                            </button>
                          </Notice>
                        )}
                        {creator.owned && m.authorKind === "ai" && (
                          <div className="w5-actions">
                            <button
                              className="qv-btn qv-btn--quiet"
                              disabled={
                                !m.text.trim() ||
                                !["delivered", "interrupted"].includes(
                                  m.deliveryState,
                                )
                              }
                              onClick={() => {
                                setAttachedVersion(undefined);
                                setAttachedCorrection(m.id);
                              }}
                            >
                              Correct this answer
                            </button>
                            <button
                              className="qv-btn qv-btn--quiet"
                              onClick={() => setCorrection(m.text)}
                            >
                              I’d never say that
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
                <div className="w5-actions">
                  {[
                    ["takeover", "Take over"],
                    ["handback", "Hand back to AI"],
                    ["pause", "Pause for this fan"],
                  ].map(([op, label]) => (
                    <button
                      key={op}
                      className={`qv-btn ${op === "takeover" ? "qv-btn--maya" : "qv-btn--secondary"}`}
                      disabled={action.busy || !creator.owned}
                      onClick={() =>
                        void action.run(async () => {
                          await studioRequest(
                            "studio",
                            `${creator.id}/threads/${fanId}/${op}`,
                            {
                              idempotencyKey: key(),
                            },
                            creator.viewerAccountId,
                          );
                          await load();
                        })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="w5-field">
                  Your words
                  <textarea
                    rows={4}
                    disabled={action.busy || !!teamPending}
                    maxLength={creator.owned ? 20000 : 8000}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setDraftDirty(true);
                      draftEdited.current = true;
                      setReview(false);
                    }}
                  />
                </label>
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={action.busy || !!teamPending}
                  onClick={() =>
                    void action.run(async () => {
                      const saved = await studioRequest<{ version: number }>(
                        "studio",
                        `${creator.id}/threads/${fanId}/draft`,
                        {
                          text,
                          expectedVersion: draftVersion,
                          idempotencyKey: key(),
                        },
                        creator.viewerAccountId,
                      );
                      setDraftVersion(saved.version);
                      setDraftDirty(false);
                      draftEdited.current = false;
                      setSentMessageId(null);
                      setReview(false);
                    })
                  }
                >
                  Save reply draft
                </button>
                {sentMessageId && (
                  <p className="qv-help">
                    This saved revision was delivered. Edit and save a new
                    revision for another reply.
                  </p>
                )}
                {creator.owned ? (
                  <LabelPreview
                    kind="human_creator"
                    name={creator.display_name}
                  />
                ) : (
                  <AuthorLabel
                    kind="team"
                    name={creator.display_name}
                    member={
                      creator.memberHandle
                        ? `@${creator.memberHandle} · triage`
                        : "Member identity unavailable"
                    }
                  />
                )}
                <button
                  className="qv-btn qv-btn--maya"
                  disabled={
                    !creator.owned ||
                    !text ||
                    Boolean(sentMessageId && !draftDirty) ||
                    data.timeline.control !== "human_active"
                  }
                  onClick={() =>
                    void action.run(async () => {
                      if (draftDirty || !draftVersion) {
                        const saved = await studioRequest<{ version: number }>(
                          "studio",
                          `${creator.id}/threads/${fanId}/draft`,
                          {
                            text,
                            expectedVersion: draftVersion,
                            idempotencyKey: key(),
                          },
                          creator.viewerAccountId,
                        );
                        setDraftVersion(saved.version);
                        setDraftDirty(false);
                        draftEdited.current = false;
                      }
                      setReview(true);
                    })
                  }
                >
                  Review signed reply
                </button>
                {creator.owned && fanId && (
                  <button
                    ref={voiceTrigger}
                    className="qv-btn qv-btn--secondary"
                    disabled={
                      action.busy || data.timeline.control !== "human_active"
                    }
                    onClick={() =>
                      setVoiceReply({ fanId, threadId: data.timeline.threadId })
                    }
                  >
                    {copy.w6RecordAVoiceReply}
                  </button>
                )}
                {!creator.owned && (
                  <>
                    <p className="qv-help">
                      Your reply carries your Team identity. The creator
                      controls personal replies and AI takeover.
                    </p>
                    <button
                      className="qv-btn qv-btn--secondary"
                      disabled={
                        action.busy ||
                        (!text.trim() && !teamPending) ||
                        text.trim().length > 8000 ||
                        data.authority !== "triage" ||
                        data.timeline.control === "closed"
                      }
                      onClick={() => void action.run(sendTeam)}
                    >
                      {teamPending
                        ? "Confirm pending Team reply"
                        : "Send as Team"}
                    </button>
                  </>
                )}
                {(creator.owned ||
                  (creator.roles.includes("triage") &&
                    creator.roles.includes("drafter"))) && (
                  <button
                    className="qv-btn qv-btn--secondary"
                    disabled={action.busy}
                    onClick={() => setApproveDraft(true)}
                  >
                    Review an AI-prepared draft
                  </button>
                )}
                {review && (
                  <Modal
                    title="Review personal reply"
                    onClose={() => setReview(false)}
                  >
                    <SignedActReview
                      creatorId={creator.id}
                      fanId={fanId}
                      command={{
                        actType: "reply",
                        subjectId: data.timeline.threadId,
                        content: { text },
                      }}
                      creatorName={creator.display_name}
                      text={text}
                      title="Send your personal reply"
                      rows={[["Fan sees", creator.display_name]]}
                      onSigned={async (signedActId) => {
                        await studioRequest(
                          "studio",
                          `${creator.id}/threads/${fanId}/send-draft`,
                          {
                            version: draftVersion,
                            signedActId,
                            idempotencyKey: key(),
                          },
                          creator.viewerAccountId,
                        );
                        setText("");
                        draftEdited.current = false;
                        setReview(false);
                        await load();
                      }}
                    />
                  </Modal>
                )}
              </>
            )
          )}
        </div>
      </div>
      <div hidden={!threadCurrent} inert={!threadCurrent}>
        {creator.owned &&
          fanId &&
          data &&
          voiceReply?.fanId === fanId &&
          voiceReply.threadId === data.timeline.threadId && (
            <Modal
              title={copy.w6RecordAVoiceReply}
              closeDisabled={voicePending}
              restoreFocusTo={voiceTrigger}
              onClose={() => setVoiceReply(null)}
            >
              <ConversationVoiceReply
                key={`${creator.viewerAccountId}:${creator.id}:${fanId}:${data.timeline.threadId}`}
                creatorId={creator.id}
                fanId={fanId}
                threadId={data.timeline.threadId}
                creatorName={creator.display_name}
                expectedAccountId={creator.viewerAccountId}
                current={
                  threadCurrent && data.timeline.control === "human_active"
                }
                onPendingChange={setVoicePending}
                onDelivered={() => {
                  setVoiceReply(null);
                  void action
                    .run(load)
                    .then(() => action.setNotice(copy.w6RecordingDelivered));
                }}
              />
            </Modal>
          )}
        {attachedCorrection && fanId && data && (
          <Modal
            title="Correct this answer"
            closeDisabled={correctionPending}
            onClose={() => setAttachedCorrection(null)}
          >
            <CorrectionReply
              key={`${creator.viewerAccountId}:${creator.id}:${fanId}:${attachedCorrection}:${attachedVersion ?? "current"}`}
              creator={creator}
              fanId={fanId}
              threadId={data.timeline.threadId}
              originalMessageId={attachedCorrection}
              originalVersion={attachedVersion}
              onDelivered={load}
              onPendingChange={setCorrectionPending}
            />
          </Modal>
        )}
        {correction !== null && (
          <Modal title="Correct my AI" onClose={() => setCorrection(null)}>
            <CorrectionForm creator={creator} answer={correction} />
          </Modal>
        )}
        {approveDraft && fanId && data && (
          <Modal
            title="Review an AI-prepared draft"
            onClose={() => setApproveDraft(false)}
          >
            <ApprovedReply
              key={`${creator.viewerAccountId}:${creator.id}:${fanId}`}
              creator={creator}
              fanId={fanId}
              deliveryAllowed={data.timeline.control === "human_active"}
              deliveryHelp="Take over this conversation before sending the personally approved reply."
              onDelivered={load}
            />
          </Modal>
        )}
      </div>
    </section>
  );
}
function CorrectionForm({
  creator,
  answer,
}: {
  creator: Creator;
  answer: string;
}) {
  const [revision, setRevision] = useState<number | null>(null),
    [question, setQuestion] = useState(""),
    [rule, setRule] = useState(""),
    [excerpt, setExcerpt] = useState(answer),
    [saved, setSaved] = useState<string | null>(null),
    action = useAction();
  useEffect(() => {
    let current = true;
    void action.run(async () => {
      const value = await studioRequest<{ revision: number }>(
        "studio",
        `${creator.id}/corrections`,
      );
      if (current) setRevision(value.revision);
    });
    return () => {
      current = false;
    };
  }, [creator.id]);
  return (
    <>
      <Feedback action={action} />
      <p>
        Describe the question in your own words, leaving out fan details. The
        signed conversation remains unchanged.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void action.run(async () => {
            const result = await studioRequest<{ id: string }>(
              "studio",
              `${creator.id}/corrections`,
              {
                expectedRevision: revision,
                paraphrasedPrompt: question,
                rule,
                unacceptableAnswer: excerpt,
                idempotencyKey: key(),
              },
              creator.viewerAccountId,
            );
            setSaved(result.id);
          });
        }}
      >
        <label className="w5-field">
          Paraphrased question
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            minLength={5}
            maxLength={1000}
            required
          />
        </label>
        <label className="w5-field">
          AI answer or excerpt
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            maxLength={3000}
          />
        </label>
        <label className="w5-field">
          My rule
          <textarea
            value={rule}
            onChange={(e) => setRule(e.target.value)}
            minLength={5}
            maxLength={500}
            required
          />
        </label>
        <button
          className="qv-btn qv-btn--maya"
          disabled={
            action.busy || revision === null || !!saved || excerpt.length > 3000
          }
        >
          Save rule and regression
        </button>
      </form>
      {saved && (
        <Notice title="AI draft updated">
          The rule and regression example are stored. Review and evaluate your
          AI draft before publishing it.
        </Notice>
      )}
      <Link href="/studio/ai">Open My AI</Link>
      <p className="qv-help">
        Use “Correct this answer” beside the original AI answer to review a
        signed correction for that fan.
      </p>
    </>
  );
}
