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
  EmptyState,
  LabelPreview,
  Message,
  Notice,
  Sidebar,
  StudioTabBar,
} from "@qelvora/ui-web";
import { validReturnTarget, MessageSchema } from "@qelvora/api";
import { SignedActReview } from "../identity/signing";
import { ConversationVoiceReply } from "./ConversationVoiceReply";
import { ApprovedReply } from "./ApprovedReply";
import { CorrectionReply } from "./CorrectionReply";
import { ConversationCorrectionMessageSchema } from "../../../../packages/api/src/conversation/correction";
import { configureStudioRequests, StudioFailure, studioRequest } from "./api";
import "./studio.css";
import { useIdentityRequest } from "../identity/session-boundary";
import type { Creator, Queue } from "./shared/types";
import { key, speakerLabel, time } from "./shared/format";
import { Feedback, useAction } from "./shared/action";
import { Modal } from "./shared/Modal";
import { ThanksFeed } from "./thanks/ThanksFeed";
import { More } from "./more/More";
import { Team } from "./team/Team";
import { Notes } from "./notes/Notes";
import { Compose } from "./notes/Compose";
import { Library } from "./library/Library";
import { Requests } from "./requests/Requests";
import { PacketDetail } from "./requests/PacketDetail";

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
