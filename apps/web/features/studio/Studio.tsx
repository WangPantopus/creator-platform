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
  type RefObject,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { brand } from "@qelvora/brand";
import { copy, formatCopy } from "@qelvora/copy";
import {
  AuthorLabel,
  AuditBanner,
  CapacityHeader,
  EmptyState,
  LabelPreview,
  Message,
  Note,
  Notice,
  QueueCard,
  ReactionChip,
  Sidebar,
  StudioTabBar,
} from "@qelvora/ui-web";
import type { SignedActCommand } from "@qelvora/api";
import { validReturnTarget, MessageSchema } from "@qelvora/api";
import type {
  ContentBody,
  ContentView,
  PrivateNoteReply,
} from "../../../../packages/api/src/content";
import { ContentReplyList } from "../../../../packages/api/src/content";
import { SignedActReview } from "../identity/signing";
import { CreatorVoiceRecording } from "../media/VoiceRecorder";
import { VoicePlayer } from "../media/VoicePlayer";
import {
  ConversationMessageSchema,
  type ConversationMessage,
} from "../../../../packages/api/src/conversation/contracts";
import { PhotoAttachment } from "./PhotoAttachment";
import { PostVoiceAttachment } from "./PostVoiceAttachment";
import { ConversationVoiceReply } from "./ConversationVoiceReply";
import { AvailabilityEditor } from "../calls/AvailabilityEditor";
import { ApprovedReply } from "./ApprovedReply";
import { CorrectionReply } from "./CorrectionReply";
import { ConversationCorrectionMessageSchema } from "../../../../packages/api/src/conversation/correction";
import { configureStudioRequests, StudioFailure, studioRequest } from "./api";
import "./studio.css";
import { useIdentityRequest } from "../identity/session-boundary";

type Creator = {
  id: string;
  display_name: string;
  handle: string;
  verification: string;
  owned: boolean;
  roles: string[];
  memberHandle: string | null;
  viewerAccountId: string;
};
type Page<T> = { items: T[]; nextCursor: string | null };
type QueueItem = {
  id: string;
  fan_id: string;
  handle: string;
  version: number;
  state: string;
  payment_state: string;
  decision_at: string;
  deadline: string;
  commitment_id: string | null;
  commitment_state: string | null;
  commitment_version: number;
  due_at: string | null;
  snapshot: {
    title: string;
    mode: string;
    amount: number;
    currency: string;
    shareable: boolean;
  };
  disclosure: {
    summary?: string;
    identity?: "handle" | "shared_intro";
    wholeThread?: boolean;
    attachmentIds?: string[];
    attachments?: unknown[];
    messages?: { text: string }[];
  };
};
type Queue = Page<QueueItem> & {
  capacity: {
    title: string;
    weekly_limit: number;
    used: number;
    reserved: number;
  }[];
  serverTime: string;
  requests: number;
};
type Packet = {
  groupModes: {
    id: string;
    title: string;
    kind: string;
    amount: string;
    currency: string;
    version: number;
  }[];
  packet: QueueItem & {
    thread_id: string;
    creator_id: string;
    hold_expires_at: string;
    accepted_at: string | null;
    proposed_mode: unknown;
  };
  commitment: {
    id: string;
    version: number;
    state: string;
    due_at: string;
  } | null;
  ledger: { kind: string; amount: number; currency: string; cause: string }[];
  share: unknown;
};
const key = () => crypto.randomUUID();
const contentStateLabel = (state: string) =>
  ({
    draft: "Draft",
    scheduled: "Scheduled",
    published: "Published",
    media_pending: "Media processing",
    unpublished: "Unpublished",
    archived: "Archived",
    withdrawn: "Withdrawn",
  })[state] ?? "Status unavailable";
const packetStateLabel = (state: string) =>
  ({
    draft: "Draft",
    submitting: "Submitting",
    submitted: "Waiting for your decision",
    more_info: "Waiting for more information",
    offer_pending: "Waiting for the fan’s decision",
    accepting: "Confirming acceptance",
    accepted: "Accepted",
    releasing: "Closing request",
    declined: "Passed on this one",
    expired: "Decision time passed",
    withdrawn: "Withdrawn",
  })[state] ?? "Request status unavailable";
const paymentStateLabel = (state: string) =>
  ({
    authorization_pending: "Checking payment hold",
    requires_action: "Fan payment confirmation needed",
    requires_capture: "Payment held · not charged",
    unknown: "Checking payment status",
    capturing: "Confirming charge",
    captured: "Charged",
    releasing: "Releasing payment hold",
    released: "Payment hold released",
    refund_pending: "Refund in progress",
    refunded: "Refunded",
    failed: "Payment could not complete",
  })[state] ?? "Payment status unavailable";
const speakerLabel = (control: string, name: string) =>
  ({
    ai_active: `${name}’s AI`,
    human_active: name,
    ai_paused: `${name}’s AI is paused`,
    closed: "Conversation closed",
  })[control] ?? "Current speaker unavailable";
const time = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    amount / 100,
  );

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
  const { session, signal } = useIdentityRequest();
  useEffect(
    () => configureStudioRequests({ accountId: session.accountId, signal }),
    [session.accountId, signal],
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
            <Team creator={creator} />
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
function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const pending = useRef(false);
  const run = async (work: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (f) {
      setError(
        f instanceof Error ? f.message : "This action could not complete.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy, error, notice, setNotice, run };
}
function Feedback({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <>
      {action.error && (
        <div>
          <Notice tone="error" title="Action status">
            {action.error}
          </Notice>
        </div>
      )}
      {action.notice && (
        <p role="status" className="qv-help">
          {action.notice}
        </p>
      )}
    </>
  );
}
function Notes({ creator }: { creator: Creator }) {
  const canReviewReplies = creator.owned || creator.roles.includes("triage");
  const [notes, setNotes] = useState<Page<ContentView>>({
      items: [],
      nextCursor: null,
    }),
    [replies, setReplies] = useState<Page<PrivateNoteReply>>({
      items: [],
      nextCursor: null,
    }),
    [replyFilter, setReplyFilter] = useState("all"),
    [reaction, setReaction] = useState<PrivateNoteReply | null>(null),
    [freshUntil, setFreshUntil] = useState(0),
    action = useAction();
  const reads = useRef({ generation: 0, mounted: true });
  const replyCursors = useRef<(string | null)[]>([null]);
  const load = useCallback(async () => {
    const request = ++reads.current.generation;
    const started = performance.now();
    const cursor = replyCursors.current.at(-1);
    // Revalidate only the visible bounded page. Re-fetching every previously
    // loaded page can exhaust the five-second lease as the feed grows.
    const [n, current] = await Promise.all([
      studioRequest<Page<ContentView>>(
        "content",
        `${creator.id}/studio`,
        undefined,
        creator.viewerAccountId,
      ),
      canReviewReplies
        ? studioRequest(
            "content",
            `${creator.id}/studio/replies?${new URLSearchParams({ filter: replyFilter, ...(cursor ? { cursor } : {}) })}`,
            undefined,
            creator.viewerAccountId,
          ).then((value) => ContentReplyList.parse(value))
        : Promise.resolve<Page<PrivateNoteReply>>({
            items: [],
            nextCursor: null,
          }),
    ]);
    if (!reads.current.mounted || request !== reads.current.generation) return;
    if (document.hidden || performance.now() >= started + 5000)
      throw new Error("Current Note and reply access must be checked again.");
    setNotes(n);
    setReplies(current);
    setFreshUntil(started + 5000);
    setReaction((previous) =>
      previous
        ? (current.items.find(
            (reply) =>
              reply.id === previous.id &&
              reply.version === previous.version &&
              reply.safetyState === "allowed",
          ) ?? null)
        : null,
    );
  }, [canReviewReplies, creator.id, creator.viewerAccountId, replyFilter]);
  useEffect(() => {
    reads.current.mounted = true;
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        await action.run(load);
      } finally {
        pending = false;
      }
    };
    const visibility = () => {
      if (document.hidden) {
        reads.current.generation++;
        setFreshUntil(0);
      } else void refresh();
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 4000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      reads.current.mounted = false;
      reads.current.generation++;
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  useEffect(() => {
    if (!freshUntil) return;
    const timer = setTimeout(
      () => setFreshUntil(0),
      Math.max(0, freshUntil - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [freshUntil]);
  return (
    <section className="w5-notes">
      <header className="w5-heading">
        <h1>Notes</h1>
        {(creator.owned || creator.roles.includes("drafter")) && (
          <Link
            className="qv-btn qv-btn--maya"
            href={`/studio/${creator.id}/compose`}
          >
            New Note
          </Link>
        )}
      </header>
      <Feedback action={action} />
      {!freshUntil && (
        <div className="w5-gutter">
          <p role="status">Checking current Note and private reply access.</p>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={action.busy}
            onClick={() => void action.run(load)}
          >
            Check current access
          </button>
        </div>
      )}
      <div hidden={!freshUntil} inert={!freshUntil}>
        <div className="w5-note-list">
          {notes.items
            .filter((n) => n.document.kind === "note")
            .map((n) => (
              <div key={n.id}>
                {n.state === "draft" ? (
                  <article className="w5-card">
                    <p className="qv-meta">Draft · not signed or sent</p>
                    <p className="w5-content-text">{n.document.text}</p>
                  </article>
                ) : (
                  <Note
                    name={creator.display_name}
                    audience={n.audienceLabel}
                    time={time(n.publishedAt)}
                    signedActId={n.signedActId ?? undefined}
                    audienceSize={n.audienceCount ?? undefined}
                    reply={false}
                  >
                    {n.document.text}
                  </Note>
                )}
                <p className="qv-help">
                  {n.state === "published"
                    ? "Broadcast"
                    : contentStateLabel(n.state)}{" "}
                  ·{" "}
                  {n.sourceState === "not_requested"
                    ? "Separate from AI sources"
                    : "AI-source review required"}
                </p>
                {["draft", "scheduled", "media_pending"].includes(n.state) && (
                  <Link
                    href={`/studio/${creator.id}/compose/${n.id}`}
                    className="qv-link-btn w5-note-edit"
                  >
                    Edit draft
                  </Link>
                )}
                {n.state === "media_pending" && (
                  <p className="qv-help">
                    Signed. Delivery waits for verified media credentials. You
                    can edit or withdraw this publication.
                  </p>
                )}
              </div>
            ))}
          {!notes.items.some((n) => n.document.kind === "note") &&
            !action.busy &&
            !action.error && (
              <EmptyState
                title="Your first Note"
                body="Write one Note for your audience. Each fan's reply stays private."
              />
            )}
        </div>
        {canReviewReplies && (
          <div className="w5-replies">
            <div className="w5-replies-title">
              <span className="qv-meta">
                REPLIES ·{" "}
                {action.busy
                  ? "loading"
                  : action.error
                    ? "unavailable"
                    : `${replies.items.length} on this page`}
              </span>
              <span className="qv-help">
                Only you and your triage team see these
              </span>
            </div>
            <label className="w5-field">
              Show replies
              <select
                value={replyFilter}
                onChange={(e) => {
                  replyCursors.current = [null];
                  setFreshUntil(0);
                  setReplyFilter(e.target.value);
                }}
              >
                <option value="all">All reviewed replies</option>
                <option value="unread">Unread</option>
                <option value="reacted">Reacted</option>
                <option value="flagged">Flagged</option>
              </select>
            </label>
            {replies.items.map((r) => (
              <article className="w5-reply" key={r.id}>
                <div className="w5-row">
                  <strong>@{r.handle}</strong>
                  <time className="qv-meta">{time(r.createdAt)}</time>
                </div>
                {r.tenure?.milestone && (
                  <p className="qv-meta">
                    {formatCopy("contentConfirmedTenure", {
                      days: r.tenure.confirmedDays,
                    })}
                  </p>
                )}
                <p>{r.text}</p>
                {!r.read && (
                  <button
                    className="qv-btn qv-btn--quiet"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await studioRequest(
                          "content",
                          `${creator.id}/replies/${r.id}/read`,
                          { version: r.version, idempotencyKey: key() },
                          creator.viewerAccountId,
                        );
                        await load();
                      })
                    }
                  >
                    Mark read
                  </button>
                )}
                {r.safetyState === "flagged" ? (
                  <p className="qv-help">
                    Withheld from the feed · sent for safety review. Private
                    text is not shown here.
                  </p>
                ) : r.reaction ? (
                  <ReactionChip
                    name={creator.display_name}
                    signedActId={r.reaction.signedActId}
                  />
                ) : (
                  <div className="w5-actions">
                    <button
                      className="qv-btn qv-btn--secondary"
                      disabled={!creator.owned || action.busy}
                      onClick={() => setReaction(r)}
                    >
                      React
                    </button>
                    {r.consent.shareText ? (
                      <Link
                        className="qv-btn qv-btn--quiet"
                        href={`/studio/${creator.id}/compose?quote=${r.id}`}
                      >
                        Quote in a Note
                      </Link>
                    ) : (
                      <button className="qv-btn qv-btn--quiet" disabled>
                        Sharing consent required
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            <nav className="w5-actions" aria-label="Private reply pages">
              {replyCursors.current.length > 1 && (
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      replyCursors.current.pop();
                      setFreshUntil(0);
                      setReaction(null);
                      await load();
                    })
                  }
                >
                  Previous replies
                </button>
              )}
              {replies.nextCursor && (
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      replyCursors.current.push(replies.nextCursor);
                      setFreshUntil(0);
                      setReaction(null);
                      await load();
                    })
                  }
                >
                  Next replies
                </button>
              )}
            </nav>
            {!replies.items.length && !action.busy && !action.error && (
              <p className="qv-help">
                Reviewed private replies appear here when fans reply to a
                published Note. Replies waiting for safety review stay out of
                the feed.
              </p>
            )}
          </div>
        )}
        {reaction && (
          <Modal
            title="React to this private reply"
            onClose={() => setReaction(null)}
          >
            <Message kind="fan">{reaction.text}</Message>
            <SignedActReview
              creatorId={creator.id}
              command={{
                actType: "reaction",
                subjectId: reaction.id,
                content: {
                  kind: "content_reaction",
                  creatorId: creator.id,
                  replyVersion: reaction.version,
                  reaction: "heart",
                },
              }}
              creatorName={creator.display_name}
              text="A heart reaction to this reply"
              title="Review reaction"
              rows={[
                ["Fan sees", `${creator.display_name} reacted to your reply`],
              ]}
              onSigned={async (signedActId) => {
                await studioRequest(
                  "content",
                  `${creator.id}/replies/${reaction.id}/reaction`,
                  {
                    version: reaction.version,
                    kind: "heart",
                    signedActId,
                    idempotencyKey: key(),
                  },
                  creator.viewerAccountId,
                );
                setReaction(null);
                await load();
              }}
            />
          </Modal>
        )}
      </div>
    </section>
  );
}
function Modal({
  title,
  onClose,
  children,
  closeDisabled = false,
  restoreFocusTo,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeDisabled?: boolean;
  restoreFocusTo?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    // An async save may disable the trigger before this modal mounts, moving
    // focus to body. Preserve the explicit media trigger in that case.
    const restore =
      restoreFocusTo?.current ?? (document.activeElement as HTMLElement | null);
    const dialog = ref.current;
    if (!dialog) return;
    let resumeFocus: HTMLElement | null = null;
    // A modal is in the top layer: hiding an ancestor alone is insufficient.
    // Close it while authority is suspended, retaining its mounted editor.
    const syncVisibility = () => {
      if (dialog.closest("[hidden], [inert]")) {
        if (dialog.open) {
          if (dialog.contains(document.activeElement))
            resumeFocus = document.activeElement as HTMLElement;
          dialog.close();
        }
      } else if (!dialog.open) {
        dialog.showModal();
        if (resumeFocus?.isConnected) resumeFocus.focus();
      }
    };
    const observer = new MutationObserver(syncVisibility);
    for (
      let ancestor = dialog.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    )
      observer.observe(ancestor, {
        attributes: true,
        attributeFilter: ["hidden", "inert"],
      });
    syncVisibility();
    return () => {
      observer.disconnect();
      dialog.close();
      restore?.focus();
    };
  }, [restoreFocusTo]);
  return (
    <dialog
      ref={ref}
      className="qv w5-dialog"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
    >
      <div className="w5-row">
        <h2>{title}</h2>
        <button
          className="qv-btn qv-btn--quiet"
          disabled={closeDisabled}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
const emptyBody = (kind: ContentBody["kind"] = "note"): ContentBody => ({
  kind,
  title: "",
  text: "",
  audience: { kind: "members" },
  media: [],
  nameToken: false,
  showAudienceCount: false,
  aiUseIntent: false,
  scheduledAt: null,
  quote: null,
  packetId: null,
});
const scheduleInput = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  const part = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`;
};
function Compose({
  creator,
  id,
  onDone,
  post = false,
}: {
  creator: Creator;
  id?: string;
  onDone: () => void;
  post?: boolean;
}) {
  const canDraft =
    creator.verification === "verified" &&
    (creator.owned ||
      creator.roles.includes("drafter") ||
      creator.roles.includes("publisher"));
  const canPublish =
    creator.verification === "verified" &&
    (creator.owned || creator.roles.includes("publisher"));
  const [document, setDocument] = useState<ContentBody>(
      emptyBody(post ? "post" : "note"),
    ),
    [saved, setSaved] = useState<{ id: string; version: number } | null>(null),
    [review, setReview] = useState<{
      command: SignedActCommand;
      view: ContentView;
    } | null>(null),
    [liveCatalog, setLiveCatalog] = useState<{
      available: boolean;
      items: (NonNullable<ContentBody["live"]> & { replayReady: boolean })[];
    } | null>(null),
    [catalog, setCatalog] = useState<{
      audienceCountsAvailable: boolean;
      tiers: { id: string; name: string }[];
      groups: { id: string; name: string }[];
    } | null>(null),
    [pendingPublication, setPendingPublication] = useState<{
      id: string;
      version: number;
      signedActId: string;
      idempotencyKey: string;
    } | null>(null),
    [schedule, setSchedule] = useState(""),
    [draftChanged, setDraftChanged] = useState(false),
    [currentDraft, setCurrentDraft] = useState<ContentView | null>(null),
    noteInput = useRef<HTMLTextAreaElement>(null),
    [voiceObjectId, setVoiceObjectId] = useState<string | null>(null),
    voiceTrigger = useRef<HTMLButtonElement>(null),
    [photoObjectId, setPhotoObjectId] = useState<string | null>(null),
    action = useAction(),
    draftId = useRef<string | null>(null),
    operation = useRef<{ body: string; key: string } | null>(null);
  const pendingStorage = `w5.pendingPublication:${creator.viewerAccountId}:${creator.id}`;
  const clearPending = () => {
    sessionStorage.removeItem(pendingStorage);
    setPendingPublication(null);
  };
  const draftReady = !id || saved?.id === id;
  const useSavedDraft = (value: ContentView) => {
    setDocument(value.document);
    setSchedule(scheduleInput(value.document.scheduledAt));
    setSaved({ id: value.id, version: value.version });
    draftId.current = value.id;
    operation.current = null;
    setReview(null);
    setDraftChanged(false);
    setCurrentDraft(null);
  };
  const loadDraft = async () => {
    if (!id) return;
    const value = await studioRequest<ContentView>(
      "content",
      `${creator.id}/${id}/studio`,
      undefined,
      creator.viewerAccountId,
    );
    useSavedDraft(value);
  };
  useEffect(() => {
    // Only opaque command references persist across a reload; no draft or fan text.
    try {
      const stored = sessionStorage.getItem(pendingStorage);
      if (stored) {
        const value = JSON.parse(stored);
        if (
          [value.id, value.signedActId].every(
            (id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id),
          ) &&
          Number.isInteger(value.version) &&
          value.version > 0 &&
          typeof value.idempotencyKey === "string" &&
          value.idempotencyKey.length >= 8
        ) {
          setPendingPublication(value);
          draftId.current = value.id;
          void action.run(async () => {
            const view = await studioRequest<ContentView>(
              "content",
              `${creator.id}/${value.id}/studio`,
            );
            setDocument(view.document);
            setSchedule(scheduleInput(view.document.scheduledAt));
            setSaved({ id: view.id, version: view.version });
            setReview({
              view,
              command: {
                actType: view.document.kind === "note" ? "broadcast" : "reply",
                subjectId: view.id,
                content: {
                  kind: "content_publication",
                  creatorId: creator.id,
                  version: value.version,
                  document: view.document,
                },
              },
            });
          });
        }
      }
    } catch {
      sessionStorage.removeItem(pendingStorage);
    }
    void studioRequest<typeof liveCatalog>(
      "content",
      `${creator.id}/studio/live`,
    )
      .then(setLiveCatalog)
      .catch(() => setLiveCatalog(null));
    void studioRequest<typeof catalog>("studio", `${creator.id}/audiences`)
      .then(setCatalog)
      .catch(() => setCatalog(null));
    if (id) void action.run(loadDraft);
    else {
      const query = new URLSearchParams(location.search);
      const packetId = query.get("packet");
      if (packetId) setDocument({ ...emptyBody("public_answer"), packetId });
      const quoteId = query.get("quote");
      if (quoteId)
        void action.run(async () => {
          const data = await studioRequest<Page<PrivateNoteReply>>(
              "content",
              `${creator.id}/studio/replies`,
            ),
            reply = data.items.find((r) => r.id === quoteId);
          if (!reply?.consent.shareText)
            throw new Error(
              "Current sharing consent is required. Ask the fan to choose sharing from their own reply.",
            );
          setDocument({
            ...emptyBody("quote_reply"),
            quote: { replyId: reply.id, consentVersion: reply.consent.version },
          });
        });
    }
  }, [creator.id, id]);
  const edit = (update: Partial<ContentBody>) => {
    if (!draftReady || pendingPublication) return;
    setDocument((d) => ({ ...d, ...update }));
    setReview(null);
  };
  const save = async (documentOverride = document) => {
    if (!draftReady) throw new Error("Wait for the saved draft to load.");
    if (!canDraft)
      throw new Error(
        "A verified creator and a current drafting role are required to save this draft. Your local text is kept.",
      );
    if (pendingPublication)
      throw new Error(
        "Check the pending publication before saving another revision.",
      );
    draftId.current ??= key();
    const body = {
        id: draftId.current,
        expectedVersion: saved?.version ?? 0,
        document: documentOverride,
      },
      snapshot = JSON.stringify(body);
    if (operation.current?.body !== snapshot)
      operation.current = { body: snapshot, key: key() };
    try {
      const result = await studioRequest<{ id: string; version: number }>(
        "content",
        `${creator.id}/drafts`,
        { ...body, idempotencyKey: operation.current.key },
        creator.viewerAccountId,
      );
      setSaved(result);
      setDraftChanged(false);
      operation.current = null;
      return result;
    } catch (failure) {
      if (
        failure instanceof StudioFailure &&
        failure.code === "content_changed"
      ) {
        setDraftChanged(true);
        setReview(null);
      }
      throw failure;
    }
  };
  if (!draftReady)
    return (
      <section className="w5-compose">
        <header className="w5-compose-head">
          <Link href={`/studio/${creator.id}/notes`}>Cancel</Link>
          <strong>{post ? "Publish" : "Edit Note"}</strong>
          <span />
        </header>
        <Feedback action={action} />
        {!action.error && <p role="status">Loading saved draft…</p>}
        <button
          className="qv-btn qv-btn--secondary"
          aria-busy={action.busy}
          onClick={() => void action.run(loadDraft)}
        >
          Retry loading draft
        </button>
      </section>
    );
  return (
    <section className="w5-compose">
      <header className="w5-compose-head">
        <Link href={`/studio/${creator.id}/notes`}>Cancel</Link>
        <strong>{post ? "Publish" : "New Note"}</strong>
        <span />
      </header>
      <Feedback action={action} />
      {draftChanged && (
        <div className="w5-gutter">
          <p className="qv-help">
            A newer revision is saved. Your local edits are kept. Review the
            saved draft before choosing which revision to edit.
          </p>
          <button
            className="qv-btn qv-btn--secondary"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                const value = await studioRequest<ContentView>(
                  "content",
                  `${creator.id}/${draftId.current}/studio`,
                  undefined,
                  creator.viewerAccountId,
                );
                setCurrentDraft(value);
              })
            }
          >
            Review saved draft
          </button>
        </div>
      )}
      {creator.verification !== "verified" && (
        <Notice title="Creator verification">
          Current creator status: {creator.verification.replaceAll("_", " ")}.
          You can write locally. Saving, attaching media and publishing require
          a verified creator.
        </Notice>
      )}
      <div className="w5-gutter">
        <span className="qv-meta">TO</span>
        <div className="qv-seg w5-audience" role="group" aria-label="Audience">
          {(post
            ? ["public", "followers", "members", "tiers", "groups"]
            : ["followers", "members", "tiers"]
          ).map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={document.audience.kind === kind}
              onClick={() =>
                edit({
                  audience:
                    kind === "tiers" || kind === "groups"
                      ? { kind, ids: [] }
                      : { kind: kind as "public" | "followers" | "members" },
                })
              }
            >
              {kind === "members"
                ? "All members"
                : kind[0]!.toUpperCase() + kind.slice(1)}
            </button>
          ))}
        </div>
        {["tiers", "groups"].includes(document.audience.kind) && (
          <fieldset className="w5-field">
            <legend>Select {document.audience.kind}</legend>
            {!catalog && (
              <p>
                Current audience options are unavailable. Refresh after
                reconnecting.
              </p>
            )}
            {catalog?.[document.audience.kind as "tiers" | "groups"].map(
              (option) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={
                      "ids" in document.audience &&
                      document.audience.ids.includes(option.id)
                    }
                    onChange={(e) => {
                      const ids =
                        "ids" in document.audience ? document.audience.ids : [];
                      edit({
                        audience: {
                          kind: document.audience.kind as "tiers" | "groups",
                          ids: e.target.checked
                            ? [...ids, option.id]
                            : ids.filter((id) => id !== option.id),
                        },
                      });
                    }}
                  />
                  {option.name}
                </label>
              ),
            )}
            {catalog?.[document.audience.kind as "tiers" | "groups"].length ===
              0 && (
              <p>
                No current {document.audience.kind} are available. Configure
                Offers first.
              </p>
            )}
          </fieldset>
        )}
        <p className="qv-help">
          {creator.owned ? (
            <>
              It's labeled “{creator.display_name} · to{" "}
              {document.audience.kind === "members"
                ? "all members"
                : document.audience.kind}
              ” everywhere.
            </>
          ) : document.kind === "post" ? (
            `A team publication stays labeled “${creator.display_name}'s team · ${creator.memberHandle}”.`
          ) : (
            `Your team can prepare this draft. ${creator.display_name} must review and personally sign it.`
          )}
        </p>
      </div>
      {post && !document.quote && !document.packetId && (
        <div className="w5-gutter w5-field">
          <label htmlFor="content-kind">Library entry</label>
          <select
            id="content-kind"
            value={document.kind}
            onChange={(e) =>
              edit({ kind: e.target.value as ContentBody["kind"], live: null })
            }
          >
            <option value="post">Post</option>
            <option value="live">Scheduled live session</option>
            <option value="replay">Replay</option>
          </select>
          {["live", "replay"].includes(document.kind) && (
            <>
              <label htmlFor="live-session">Session from Live</label>
              <select
                id="live-session"
                disabled={!liveCatalog?.available}
                value={document.live?.sessionId ?? ""}
                onChange={(e) => {
                  const session = liveCatalog?.items.find(
                    (s) => s.sessionId === e.target.value,
                  );
                  if (session) {
                    const live = {
                      sessionId: session.sessionId,
                      startsAt: session.startsAt,
                      endsAt: session.endsAt,
                      replayContentId: session.replayContentId,
                    };
                    edit({ live });
                  }
                }}
              >
                <option value="">Choose a session</option>
                {liveCatalog?.items
                  .filter((s) => document.kind !== "replay" || s.replayReady)
                  .map((s) => (
                    <option key={s.sessionId} value={s.sessionId}>
                      {new Date(s.startsAt).toLocaleString()} —{" "}
                      {new Date(s.endsAt).toLocaleString()}
                    </option>
                  ))}
              </select>
              <p>
                Choose the audience separately for each replay. A live entry
                points to the scheduled session.
              </p>
              {!liveCatalog?.available && (
                <Notice title="Live sessions unavailable">
                  The live service is not connected. Schedule a session in Live,
                  then return when the session list is available.
                </Notice>
              )}
            </>
          )}
        </div>
      )}
      {post && (
        <label className="w5-field w5-gutter">
          Title
          <input
            maxLength={180}
            value={document.title}
            onChange={(e) => edit({ title: e.target.value })}
          />
        </label>
      )}
      <div className={`w5-editor ${creator.owned ? "qv-on-maya" : ""}`}>
        <AuthorLabel
          kind={
            creator.owned
              ? post
                ? "human_creator"
                : "human_broadcast"
              : "team"
          }
          name={creator.display_name}
          audience={document.audience.kind}
          member={creator.memberHandle ?? "Team draft"}
          onMaya={creator.owned}
        />
        <label className="qv-sr" htmlFor="note-text">
          {post ? "Your post" : "Your Note"}
        </label>
        <textarea
          ref={noteInput}
          id="note-text"
          autoFocus={!!id}
          rows={5}
          maxLength={20000}
          value={document.text}
          onChange={(e) => edit({ text: e.target.value })}
          placeholder="Write in your own words"
        />
        <div className="w5-actions">
          <button
            className="qv-btn qv-btn--quiet"
            type="button"
            disabled={
              !canDraft || !creator.owned || action.busy || !!pendingPublication
            }
            onClick={() =>
              void action.run(async () => {
                const current = await save();
                setPhotoObjectId(current.id);
              })
            }
          >
            Photo
          </button>
          <button
            ref={voiceTrigger}
            className="qv-btn qv-btn--quiet"
            type="button"
            disabled={
              !canDraft ||
              !creator.owned ||
              action.busy ||
              !!pendingPublication ||
              !["note", "post"].includes(document.kind)
            }
            onClick={() =>
              void action.run(async () => {
                const current = await save();
                setVoiceObjectId(current.id);
              })
            }
          >
            {document.kind === "note" ? "Voice · up to 60 s" : "Voice"}
          </button>
        </div>
      </div>
      <label className="w5-source-row">
        <input
          type="checkbox"
          checked={document.aiUseIntent}
          disabled={!creator.owned && !document.aiUseIntent}
          onChange={(e) => edit({ aiUseIntent: e.target.checked })}
        />
        <span>
          <strong>Let my AI use this</strong>
          <span className="qv-help">
            {creator.owned
              ? "Adds a source candidate for this same audience. Approve it separately in My AI."
              : "The creator must confirm AI reuse for this revision. Team edits can remove that intent."}
          </span>
        </span>
      </label>
      <label className="w5-toggle">
        Show audience size
        <input
          type="checkbox"
          checked={document.showAudienceCount}
          disabled={
            !catalog?.audienceCountsAvailable && !document.showAudienceCount
          }
          onChange={(e) => edit({ showAudienceCount: e.target.checked })}
        />
      </label>
      {!catalog?.audienceCountsAvailable && (
        <p className="w5-gutter qv-help">
          Current audience size is unavailable.
        </p>
      )}
      {!post && (
        <label className="w5-toggle">
          Use the fan's name token
          <input
            type="checkbox"
            checked={document.nameToken}
            onChange={(e) => edit({ nameToken: e.target.checked })}
          />
        </label>
      )}
      {document.nameToken && (
        <p className="w5-gutter qv-help">
          Use {"{name}"} in your Note. It displays the fan’s public handle.
          Every copy keeps the broadcast label; the immutable signed original
          remains available.
        </p>
      )}
      <label className="w5-field w5-gutter">
        Schedule in your time zone
        <input
          type="datetime-local"
          value={schedule}
          onChange={(e) => {
            setSchedule(e.target.value);
            edit({
              scheduledAt: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
            });
          }}
        />
      </label>
      <div className="w5-compose-bottom">
        <div className="w5-actions">
          <button
            className="qv-btn qv-btn--secondary"
            disabled={
              !canDraft ||
              action.busy ||
              !!pendingPublication ||
              (!document.text.trim() && !document.media.length) ||
              (["live", "replay"].includes(document.kind) && !document.live)
            }
            onClick={() =>
              void action.run(async () => {
                await save();
                action.setNotice(
                  "Draft saved. Editing invalidates the signing preview.",
                );
              })
            }
          >
            Save draft
          </button>
          <button
            className={`qv-btn ${creator.owned ? "qv-btn--maya" : "qv-btn--secondary"}`}
            disabled={
              (!creator.owned &&
                (!creator.roles.includes("publisher") ||
                  document.kind !== "post" ||
                  document.media.length > 0)) ||
              !canPublish ||
              action.busy ||
              !!pendingPublication ||
              (!document.text.trim() && !document.media.length) ||
              (["live", "replay"].includes(document.kind) && !document.live)
            }
            onClick={() =>
              void action.run(async () => {
                if (!canPublish)
                  throw new Error(
                    "Current creator verification and a publishing role are required.",
                  );
                const result = await save();
                if (creator.owned)
                  setReview(
                    await studioRequest(
                      "content",
                      `${creator.id}/${result.id}/review`,
                    ),
                  );
                else {
                  await studioRequest(
                    "content",
                    `${creator.id}/${result.id}/team-publish`,
                    { version: result.version, idempotencyKey: key() },
                    creator.viewerAccountId,
                  );
                  onDone();
                }
              })
            }
          >
            {creator.owned
              ? "Review and sign"
              : document.kind !== "post" || document.media.length > 0
                ? "Creator signature required"
                : !creator.roles.includes("publisher")
                  ? "Publishing role required"
                  : "Publish as team"}
          </button>
        </div>
        {saved && <p className="qv-meta">SAVED · REVISION {saved.version}</p>}
      </div>
      {currentDraft && (
        <Modal
          title="Saved draft changed"
          onClose={() => setCurrentDraft(null)}
          restoreFocusTo={noteInput}
        >
          <p className="qv-meta">
            {contentStateLabel(currentDraft.state)} · revision{" "}
            {currentDraft.version}
          </p>
          <p>Audience: {currentDraft.audienceLabel}</p>
          {currentDraft.document.title && (
            <h3>{currentDraft.document.title}</h3>
          )}
          <label className="w5-field">
            Saved {post ? "post" : "Note"}
            <textarea readOnly rows={5} value={currentDraft.document.text} />
          </label>
          <p>
            Schedule:{" "}
            {currentDraft.document.scheduledAt
              ? time(currentDraft.document.scheduledAt)
              : "Not scheduled"}
          </p>
          <p>
            AI reuse intent:{" "}
            {currentDraft.document.aiUseIntent
              ? "Requested · separate approval required"
              : "Off"}
          </p>
          <p className="qv-help">
            Loading this revision replaces your local edits. Keeping your edits
            on this revision leaves them unsaved and invalidates the signing
            preview. Saving checks the current revision again.
          </p>
          <div className="w5-actions">
            <button
              className="qv-btn qv-btn--secondary"
              onClick={() => {
                useSavedDraft(currentDraft);
                action.setNotice(
                  "Saved revision loaded. Review it before signing.",
                );
              }}
            >
              Load saved revision
            </button>
            <button
              className="qv-btn qv-btn--secondary"
              disabled={
                currentDraft.state !== "draft" ||
                !!currentDraft.document.planRef ||
                !!document.planRef
              }
              onClick={() => {
                setSaved({
                  id: currentDraft.id,
                  version: currentDraft.version,
                });
                operation.current = null;
                setReview(null);
                setDraftChanged(false);
                setCurrentDraft(null);
                action.setNotice(
                  "Your local edits are kept on the current revision. Save when ready.",
                );
              }}
            >
              Keep my edits on this revision
            </button>
            <button
              className="qv-btn qv-btn--quiet"
              onClick={() => setCurrentDraft(null)}
            >
              Keep editing without changes
            </button>
          </div>
        </Modal>
      )}
      {review && canPublish && (
        <Modal
          title={
            document.scheduledAt
              ? "Review scheduled publication"
              : "Review and post"
          }
          onClose={() => {
            if (!pendingPublication) setReview(null);
          }}
        >
          <p className="qv-help">
            Audience: {review.view.audienceLabel}. AI use remains subject to a
            separate source approval.
          </p>
          {!pendingPublication && (
            <p className="qv-meta">
              Signature preview · this draft has not been signed or posted.
            </p>
          )}
          {pendingPublication ? (
            <div role="status">
              <p>
                The publication response is pending. Check its current state or
                retry the same signed command.
              </p>
              <button
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const value = await studioRequest<ContentView>(
                      "content",
                      `${creator.id}/${pendingPublication.id}/studio`,
                    );
                    if (
                      value.version === pendingPublication.version &&
                      value.signedActId === pendingPublication.signedActId &&
                      ["published", "scheduled"].includes(value.state)
                    ) {
                      clearPending();
                      onDone();
                    } else
                      throw new Error(
                        "Publication is not confirmed. Retry the same command below; no new signature is needed.",
                      );
                  })
                }
              >
                Check publication
              </button>
              <button
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    const { id, ...command } = pendingPublication;
                    await studioRequest(
                      "content",
                      `${creator.id}/${id}/publish`,
                      command,
                      creator.viewerAccountId,
                    );
                    clearPending();
                    onDone();
                  })
                }
              >
                Retry same publication
              </button>
              <Feedback action={action} />
            </div>
          ) : (
            <SignedActReview
              creatorId={creator.id}
              creatorName={creator.display_name}
              command={review.command}
              text={review.view.document.text}
              title="Review exact publication"
              rows={[
                ["Audience", review.view.audienceLabel],
                [
                  "Publish",
                  document.scheduledAt ? time(document.scheduledAt) : "Now",
                ],
                ...(document.media.length
                  ? [
                      [
                        "Media",
                        "Processed attachments. Delivery waits for verified media credentials.",
                      ] as [string, string],
                    ]
                  : []),
              ]}
              onSigned={async (signedActId) => {
                const command = {
                  id: review.view.id,
                  version: review.view.version,
                  signedActId,
                  idempotencyKey: key(),
                };
                sessionStorage.setItem(pendingStorage, JSON.stringify(command));
                setPendingPublication(command);
                await studioRequest(
                  "content",
                  `${creator.id}/${command.id}/publish`,
                  {
                    version: command.version,
                    signedActId: command.signedActId,
                    idempotencyKey: command.idempotencyKey,
                  },
                  creator.viewerAccountId,
                );
                clearPending();
                onDone();
              }}
            />
          )}
        </Modal>
      )}
      {voiceObjectId && canDraft && (
        <Modal
          title="Your own voice"
          onClose={() => setVoiceObjectId(null)}
          restoreFocusTo={voiceTrigger}
        >
          {(() => {
            const Recorder =
              document.kind === "post"
                ? PostVoiceAttachment
                : CreatorVoiceRecording;
            return (
              <Recorder
                embedded
                creatorId={creator.id}
                expectedAccountId={creator.viewerAccountId}
                creatorName={creator.display_name}
                objectId={voiceObjectId}
                onReady={(asset, evidence) => {
                  edit({
                    media: [
                      ...document.media.filter(
                        (item) => item.assetId !== asset.id,
                      ),
                      {
                        assetId: evidence.assetId,
                        version: evidence.version,
                        sha256: evidence.sha256,
                        kind: "voice",
                        alt: "",
                      },
                    ],
                  });
                  action.setNotice(
                    "Processed voice added. Save the draft, then review and sign the complete publication.",
                  );
                }}
                beforeDiscard={async (assetId) => {
                  if (!document.media.some((item) => item.assetId === assetId))
                    return;
                  const next = {
                    ...document,
                    media: document.media.filter(
                      (item) => item.assetId !== assetId,
                    ),
                  };
                  await save(next);
                  edit(next);
                }}
              />
            );
          })()}
        </Modal>
      )}
      {photoObjectId && canDraft && (
        <Modal title="Photo" onClose={() => setPhotoObjectId(null)}>
          <PhotoAttachment
            key={`${creator.viewerAccountId}/${creator.id}/${photoObjectId}`}
            creatorId={creator.id}
            expectedAccountId={creator.viewerAccountId}
            objectId={photoObjectId}
            onReady={(asset, alt) => {
              edit({
                media: [
                  ...document.media.filter((item) => item.assetId !== asset.id),
                  {
                    assetId: asset.id,
                    version: asset.version,
                    sha256: asset.sha256,
                    kind: "photo",
                    alt,
                  },
                ],
              });
              setPhotoObjectId(null);
              action.setNotice(
                "Processed photo added. Save the draft, then review the complete publication.",
              );
            }}
            beforeDiscard={async (assetId) => {
              if (!document.media.some((item) => item.assetId === assetId))
                return;
              const next = {
                ...document,
                media: document.media.filter(
                  (item) => item.assetId !== assetId,
                ),
              };
              await save(next);
              edit(next);
            }}
          />
        </Modal>
      )}
    </section>
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
function Library({ creator }: { creator: Creator }) {
  const [page, setPage] = useState<Page<ContentView>>({
      items: [],
      nextCursor: null,
    }),
    [editing, setEditing] = useState<
      { id?: string; post: boolean } | undefined
    >(undefined),
    [filter, setFilter] = useState(""),
    [query, setQuery] = useState(""),
    [reading, setReading] = useState(true),
    [readError, setReadError] = useState<string | null>(null),
    action = useAction();
  const searchKey = JSON.stringify([
    creator.id,
    creator.viewerAccountId,
    filter,
    query,
  ]);
  const reads = useRef({
    generation: 0,
    mounted: true,
    controller: null as AbortController | null,
    searchKey,
  });
  const load = useCallback(
    async (cursor?: string) => {
      if (reads.current.searchKey !== searchKey) return;
      const generation = ++reads.current.generation;
      reads.current.controller?.abort();
      const controller = new AbortController();
      reads.current.controller = controller;
      setReading(true);
      setReadError(null);
      try {
        const next = await studioRequest<Page<ContentView>>(
          "content",
          `${creator.id}/studio?${new URLSearchParams({ ...(cursor ? { cursor } : {}), ...(filter ? { state: filter } : {}), ...(query ? { query } : {}) })}`,
          undefined,
          creator.viewerAccountId,
          { signal: controller.signal },
        );
        if (
          !reads.current.mounted ||
          generation !== reads.current.generation ||
          reads.current.searchKey !== searchKey
        )
          return;
        setPage((previous) =>
          cursor
            ? {
                items: [...previous.items, ...next.items].filter(
                  (item, index, all) =>
                    all.findIndex((other) => other.id === item.id) === index,
                ),
                nextCursor: next.nextCursor,
              }
            : next,
        );
      } catch (error) {
        if (
          reads.current.mounted &&
          generation === reads.current.generation &&
          !controller.signal.aborted
        )
          setReadError(
            error instanceof Error
              ? error.message
              : "Your current library could not be read.",
          );
      } finally {
        if (reads.current.mounted && generation === reads.current.generation)
          setReading(false);
      }
    },
    [creator.id, creator.viewerAccountId, filter, query, searchKey],
  );
  useEffect(() => {
    reads.current.mounted = true;
    reads.current.searchKey = searchKey;
    setPage({ items: [], nextCursor: null });
    setReading(true);
    setReadError(null);
    // A new search supersedes the old read even while a mutation is pending.
    // Keep read cancellation separate from the command/retry boundary.
    const timer = setTimeout(() => void load(), 200);
    if (new URLSearchParams(location.search).has("packet"))
      setEditing({ post: true });
    return () => {
      clearTimeout(timer);
      reads.current.mounted = false;
      reads.current.generation++;
      reads.current.controller?.abort();
    };
  }, [load, searchKey]);
  if (editing !== undefined)
    return (
      <Compose
        key={`${creator.viewerAccountId}:${creator.id}:${editing.id ?? "new"}`}
        creator={creator}
        id={editing.id}
        post={editing.post}
        onDone={() => {
          setEditing(undefined);
          void load();
        }}
      />
    );
  return (
    <section className="w5-library w5-gutter">
      <header className="w5-heading">
        <h1>Publish</h1>
        <button
          className="qv-btn qv-btn--secondary"
          onClick={() => setEditing({ post: true })}
        >
          New post
        </button>
      </header>
      <Feedback action={action} />
      {readError && (
        <Notice tone="error" title="Library unavailable">
          {readError}
          <button
            className="qv-btn qv-btn--secondary"
            disabled={reading}
            onClick={() => void load()}
          >
            Retry current search
          </button>
        </Notice>
      )}
      {reading && <p role="status">Checking your current library…</p>}
      <p className="qv-help">
        Audience controls who can see it. AI-source approval is separate.
      </p>
      <label className="w5-field">
        Search your library
        <input
          type="search"
          maxLength={180}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <label className="w5-field">
        State
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All states</option>
          {[
            "draft",
            "media_pending",
            "scheduled",
            "published",
            "unpublished",
            "archived",
          ].map((s) => (
            <option key={s} value={s}>
              {contentStateLabel(s)}
            </option>
          ))}
        </select>
      </label>
      <div className="w5-actions">
        <button
          className="qv-link-btn"
          disabled={reading || action.busy}
          onClick={() => void load()}
        >
          Refresh library
        </button>
      </div>
      {page.items.map((item) => (
        <article key={item.id} className="w5-card">
          <h2>
            {item.document.title ||
              (item.document.kind === "note"
                ? "Untitled Note"
                : "Untitled post")}
          </h2>
          <p className="qv-meta">
            {contentStateLabel(item.state)} · REV {item.version} ·{" "}
            {item.audienceLabel}
          </p>
          <p>{item.document.text}</p>
          <p className="qv-help">
            {
              {
                not_requested: "Separate from AI sources",
                candidate_pending: "Waiting to add an AI source candidate",
                candidate: "AI source candidate · approval happens in My AI",
                revocation_pending: "AI source removal pending",
                revoked: "AI use is off",
              }[item.sourceState]
            }
            {item.document.scheduledAt &&
              ` · Scheduled ${time(item.document.scheduledAt)}`}
          </p>
          <div className="w5-actions">
            <button
              className="qv-btn qv-btn--secondary"
              onClick={() =>
                setEditing({
                  id: item.id,
                  post: item.document.kind !== "note",
                })
              }
            >
              Edit and review again
            </button>
            {item.state === "published" && (
              <Link href={`/content/${creator.id}/${item.id}`}>
                Open current fan view
              </Link>
            )}
            {["unpublish", "archive"].map((operation) => (
              <button
                key={operation}
                className="qv-btn qv-btn--quiet"
                disabled={
                  action.busy ||
                  item.state === "archived" ||
                  (operation === "unpublish" &&
                    !["published", "scheduled", "media_pending"].includes(
                      item.state,
                    ))
                }
                onClick={() =>
                  void action.run(async () => {
                    await studioRequest(
                      "content",
                      `${creator.id}/${item.id}/${operation}`,
                      { version: item.version, idempotencyKey: key() },
                      creator.viewerAccountId,
                    );
                    await load();
                  })
                }
              >
                {operation === "unpublish" ? "Unpublish" : "Archive"}
              </button>
            ))}
          </div>
        </article>
      ))}
      {!page.items.length &&
        !reading &&
        !readError &&
        !action.busy &&
        !action.error && (
          <EmptyState
            title={
              query || filter ? "No matching items" : "Your library is empty"
            }
            body={
              query || filter
                ? "Try another search or choose All states."
                : "Save a draft, choose its audience, and review its exact publication."
            }
          />
        )}
      {page.nextCursor && (
        <button
          className="qv-btn qv-btn--secondary"
          disabled={reading || action.busy}
          onClick={() => void load(page.nextCursor!)}
        >
          More content
        </button>
      )}
    </section>
  );
}
function Team({ creator }: { creator: Creator }) {
  const [readState, setReadState] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const retryRef = useRef<HTMLButtonElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);
  const retryFocusRequested = useRef(false);
  const [members, setMembers] = useState<
      {
        account_id: string;
        roles: string[];
        revoked_at: string | null;
        handle: string | null;
      }[]
    >([]),
    [account, setAccount] = useState(""),
    [pendingInvites, setPendingInvites] = useState<
      {
        id: string;
        account_id: string;
        handle: string | null;
        roles: string[];
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
      }[]
    >([]),
    [roles, setRoles] = useState<string[]>([]),
    action = useAction();
  const load = useCallback(async () => {
    setReadState("loading");
    try {
      const result = await studioRequest<{
        members: typeof members;
        invitations: typeof pendingInvites;
      }>("studio", `${creator.id}/team`);
      setMembers(result.members);
      setPendingInvites(result.invitations);
      setReadState("ready");
    } catch (error) {
      setReadState("unavailable");
      throw error;
    }
  }, [creator.id]);
  useEffect(() => {
    void action.run(load);
  }, [load]);
  useEffect(() => {
    if (readState === "loading") return;
    const requested = retryFocusRequested.current;
    retryFocusRequested.current = false;
    if (
      requested &&
      document.visibilityState === "visible" &&
      document.activeElement === document.body
    ) {
      const target =
        readState === "ready" ? handleRef.current : retryRef.current;
      if (
        target?.isConnected &&
        !target.closest("[hidden], [inert]") &&
        target.getClientRects().length
      )
        target.focus();
    }
  }, [readState]);
  const { request: identityRequest } = useIdentityRequest();
  const identity = async (path: string, body: unknown) => {
    const response = await identityRequest(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      value = await response.json();
    if (!response.ok)
      throw new Error(
        value.error?.message ?? "The team action is unavailable.",
      );
    return value;
  };
  return (
    <section className="w5-team">
      <header className="w5-heading">
        <h1>Team</h1>
      </header>
      {readState === "ready" ? (
        <Feedback action={action} />
      ) : (
        <>
          <Notice
            tone={readState === "loading" ? "neutral" : "error"}
            title={copy.identityTeamAccessTitle}
          >
            <p>{action.error || copy.identityTeamAccessLoading}</p>
            <p>{copy.identityTeamAccessRequired}</p>
            <button
              ref={retryRef}
              className="qv-btn qv-btn--secondary"
              aria-busy={action.busy}
              aria-disabled={action.busy}
              onClick={(event) => {
                if (action.busy) return;
                retryFocusRequested.current =
                  document.activeElement === event.currentTarget;
                void action.run(load);
              }}
            >
              {copy.retry}
            </button>
          </Notice>
          {action.notice && (
            <p role="status" className="qv-help">
              {action.notice}
            </p>
          )}
        </>
      )}
      <div className="w5-team-columns">
        <div className="w5-card">
          <h2>Roles</h2>
          {readState === "ready" &&
            members.map((m) => (
              <div className="w5-team-member" key={m.account_id}>
                <strong>{m.handle ? `@${m.handle}` : m.account_id}</strong>
                <p>{m.revoked_at ? "Removed" : m.roles.join(" · ")}</p>
                {!m.revoked_at && (
                  <button
                    className="qv-btn qv-btn--quiet"
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await identity(
                          `${creator.id}/team/${m.account_id}/remove`,
                          {},
                        );
                        await load();
                      })
                    }
                  >
                    Remove access
                  </button>
                )}
              </div>
            ))}
          {readState === "ready" &&
            pendingInvites
              .filter((i) => !i.accepted_at && !i.revoked_at)
              .map((i) => (
                <article key={i.id}>
                  <strong>
                    Invitation · {i.handle ? `@${i.handle}` : i.account_id}
                  </strong>
                  <p>
                    {i.roles.join(" · ")} ·{" "}
                    {new Date(i.expires_at).getTime() > Date.now()
                      ? "Expires"
                      : "Expired"}{" "}
                    {time(i.expires_at)}
                  </p>
                  <button
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(async () => {
                        await identity(
                          `${creator.id}/team/${i.account_id}/remove`,
                          {},
                        );
                        await load();
                      })
                    }
                  >
                    Remove invitation
                  </button>
                </article>
              ))}
          <label className="w5-field">
            Public fan handle
            <input
              ref={handleRef}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </label>
          {[
            [
              "triage",
              "Triage",
              "Reads and routes the queue. Replies as team.",
            ],
            ["drafter", "Drafting", "Prepares drafts. Never approves as you."],
            [
              "publisher",
              "Publishing",
              "Publishes content under team identity.",
            ],
            ["scheduler", "Scheduling", "Offers times from your hours."],
          ].map(([role, label, description]) => (
            <label className="w5-check" key={role}>
              <input
                type="checkbox"
                checked={roles.includes(role!)}
                onChange={(e) =>
                  setRoles(
                    e.target.checked
                      ? [...roles, role!]
                      : roles.filter((r) => r !== role),
                  )
                }
              />
              <span>
                <strong>{label}</strong>
                <span className="qv-help">{description}</span>
              </span>
            </label>
          ))}
          <button
            className="qv-btn qv-btn--secondary"
            disabled={
              action.busy ||
              readState !== "ready" ||
              creator.verification !== "verified" ||
              !account ||
              !roles.length
            }
            onClick={() =>
              void action.run(async () => {
                await studioRequest(
                  "studio",
                  `${creator.id}/team/invite`,
                  {
                    handle: account,
                    roles,
                  },
                  creator.viewerAccountId,
                );
                action.setNotice(
                  "Invitation created. The invited account must accept it; no role is granted yet.",
                );
                await load();
              })
            }
          >
            Create invitation
          </button>
        </div>
        <div className="w5-editor qv-on-maya">
          <h2>Only you</h2>
          <p>
            Approve exact drafts and sign personal replies, Notes and reactions.
          </p>
          <p>
            Team words always carry the team label. Team replies never fulfill a
            personal commitment.
          </p>
          <Link href="/identity/account">Verification and account</Link>
        </div>
      </div>
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
    directoryPages = useRef(1),
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
        let value = await studioRequest<NonNullable<typeof entries>>(
          "studio",
          `${creator.id}/threads`,
          undefined,
          creator.viewerAccountId,
        );
        let loadedPages = 1;
        // Rebuild every displayed page from current audited authority. A poll
        // must neither discard later pages nor retain unchecked private rows.
        while (value.nextCursor && loadedPages < directoryPages.current) {
          const next = await studioRequest<NonNullable<typeof entries>>(
            "studio",
            `${creator.id}/threads?cursor=${encodeURIComponent(value.nextCursor)}`,
            undefined,
            creator.viewerAccountId,
          );
          value = {
            items: [...value.items, ...next.items].filter(
              (entry, index, all) =>
                all.findIndex((other) => other.fanId === entry.fanId) === index,
            ),
            nextCursor: next.nextCursor,
          };
          loadedPages++;
        }
        if (!threadMounted.current || generation !== threadGeneration.current)
          return;
        directoryPages.current = loadedPages;
        setEntries(value);
      }
      threadCheckedAt.current = started;
      setThreadCurrent(performance.now() - started < 5000);
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
    const refresh = () => void action.run(load),
      polling = setInterval(refresh, 4000),
      expiry = setInterval(() => {
        if (performance.now() - threadCheckedAt.current >= 5000)
          setThreadCurrent(false);
      }, 500);
    window.addEventListener("focus", refresh);
    return () => {
      threadMounted.current = false;
      threadGeneration.current++;
      clearInterval(polling);
      clearInterval(expiry);
      window.removeEventListener("focus", refresh);
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
              {entries?.nextCursor && directoryPages.current < 50 && (
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      directoryPages.current++;
                      await load();
                    })
                  }
                >
                  Load more conversations
                </button>
              )}
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
function ThanksFeed({ creator }: { creator: Creator }) {
  const [rows, setRows] = useState<
      { id: string; text: string; handle: string | null; created_at: string }[]
    >([]),
    [error, setError] = useState(""),
    [freshUntil, setFreshUntil] = useState(0);
  useEffect(() => {
    let generation = 0,
      closed = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (closed || document.hidden || controller) return;
      const request = ++generation;
      const started = performance.now();
      const currentController = new AbortController();
      controller = currentController;
      try {
        const current = await studioRequest<typeof rows>(
          "content",
          `${creator.id}/studio/thanks`,
          undefined,
          creator.viewerAccountId,
          {
            signal: AbortSignal.any([
              currentController.signal,
              AbortSignal.timeout(4000),
            ]),
          },
        );
        if (closed || request !== generation) return;
        if (document.hidden || performance.now() >= started + 5000)
          throw new Error("Current sharing permission must be checked again.");
        setRows(current);
        setFreshUntil(started + 5000);
        setError("");
      } catch (failure) {
        if (closed || request !== generation) return;
        setRows([]);
        setFreshUntil(0);
        setError(
          failure instanceof Error
            ? failure.message
            : "Current sharing permission is unavailable.",
        );
      } finally {
        if (controller === currentController) controller = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        generation++;
        controller?.abort();
        controller = null;
        setRows([]);
        setFreshUntil(0);
      } else void load();
    };
    setRows([]);
    setFreshUntil(0);
    void load();
    const timer = setInterval(() => void load(), 4000);
    window.addEventListener("focus", load);
    window.addEventListener("pageshow", load);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      closed = true;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("pageshow", load);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [creator.id, creator.viewerAccountId]);
  useEffect(() => {
    if (!freshUntil) return;
    const timer = setTimeout(
      () => {
        setRows([]);
        setFreshUntil(0);
      },
      Math.max(0, freshUntil - performance.now()),
    );
    return () => clearTimeout(timer);
  }, [freshUntil]);
  return (
    <section className="w5-gutter">
      <header className="w5-heading">
        <h1>Thanks</h1>
      </header>
      {error && (
        <Notice tone="error" title="Thanks unavailable">
          {error}
        </Notice>
      )}
      <p className="qv-help">
        Only notes fans consented to share with your digest appear here.
      </p>
      {!error && freshUntil > 0 && rows.length === 0 && (
        <EmptyState
          title="No shared thanks yet"
          body="When a fan chooses to share a thanks with your digest, it appears here. Their private thanks stay private."
        />
      )}
      {!error && !freshUntil && (
        <p role="status" className="qv-help">
          Checking current sharing permission…
        </p>
      )}
      {rows.map((r) => (
        <article className="w5-card" key={r.id}>
          {r.handle && <strong>@{r.handle}</strong>}
          <p>{r.text || "This helped"}</p>
          <time className="qv-meta">{time(r.created_at)}</time>
        </article>
      ))}
    </section>
  );
}
function More({ creator }: { creator: Creator }) {
  const { signal } = useIdentityRequest();
  return (
    <section className="w5-more">
      <header className="w5-heading">
        <h1>More</h1>
      </header>
      <div className="w5-more-links">
        {[
          ["Offers", "/commerce/offers"],
          ["Publish", `/studio/${creator.id}/publish`],
          ["Insights", "/studio/insights"],
          ["Earnings", "/commerce/earnings"],
          ["Team", `/studio/${creator.id}/team`],
          ["Thanks", `/studio/${creator.id}/thanks`],
          ["Impact", "/studio/impact"],
          ["Verification and account", "/identity/account"],
          ["License", "/studio/ai/license"],
          ["Support", "/support"],
        ].map(([label, href]) => (
          <Link key={label} href={href!}>
            <span>{label}</span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
      <p className="w5-gutter qv-help">
        Personal signing and commitments stay with the creator. Support access
        is scoped and audited.
      </p>
      {creator.owned && creator.verification === "verified" && (
        <AvailabilityEditor
          creatorId={creator.id}
          accountId={creator.viewerAccountId}
          signal={signal}
        />
      )}
    </section>
  );
}
