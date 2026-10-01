"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FrameSchema,
  ThreadDeliveryGate,
  type AcceptedMessage,
  type Frame,
} from "@qelvora/api";
import {
  Avatar,
  AuthorLabel,
  Button,
  CitationChip,
  Correction,
  IdentityStrip,
  Message,
  Notice,
  SignedMarker,
  SystemLine,
} from "@qelvora/ui-web";
import type {
  ConversationMessage,
  ConversationPage,
} from "../../../../packages/api/src/conversation/contracts";
import { useConversationRequest, ConversationError } from "./api";
import { formatCopy } from "@qelvora/copy";
import "./conversation.css";

type Pending = {
  key: string;
  text: string;
  clientSequence: number;
  destination: "messages" | "fan-replies";
  state: "pending" | "uncertain" | "rejected";
};
function author(message: ConversationMessage, name: string) {
  if (message.correction) return formatCopy("correctionAuthor", { name });
  switch (message.authorKind) {
    case "fan":
      return "You";
    case "ai":
      return `${name}'s AI`;
    case "team":
      return `${name}'s team · ${message.member ?? "Authorized team member"}`;
    case "approved_draft":
      return formatCopy("approvedAuthor", { name });
    case "human_broadcast":
      return `Note from ${name}`;
    case "human_reaction":
      return `${name} reacted`;
    case "human_call":
      return `Call with ${name}`;
    case "system":
      return "Conversation update";
    default:
      return name;
  }
}

export function ConversationScreen({
  creatorId,
  fanId,
  accountId,
}: {
  creatorId: string;
  fanId: string;
  accountId: string;
}) {
  const request = useConversationRequest();
  const root = `${creatorId}/${fanId}`;
  const [page, setPage] = useState<ConversationPage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [older, setOlder] = useState<ConversationMessage[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const current = useRef<ConversationPage | null>(null);
  const gate = useRef<ThreadDeliveryGate | null>(null);
  const latestPending = useRef<Pending | null>(null);
  latestPending.current = pending;
  const scrollEnd = useRef<HTMLDivElement>(null);
  const cursorKey = `qelvora:conversation:${accountId}:${creatorId}:${fanId}`;
  const lifecycle = useRef(0);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    const revision = lifecycle.current;
    try {
      const fresh = await request<ConversationPage>(root);
      if (!mounted.current || lifecycle.current !== revision) return;
      // A delayed HTTP response cannot put an earlier author boundary back on screen.
      if (current.current && fresh.cursor < current.current.cursor) return;
      current.current = fresh;
      gate.current = new ThreadDeliveryGate(
        fresh.threadId,
        fresh.cursor,
        fresh.epoch,
        fresh.generationSequences,
      );
      setPage(fresh);
      setOnline(navigator.onLine);
      setFailure(null);
      setBefore((value) => value ?? fresh.before);
      sessionStorage.setItem(
        cursorKey,
        JSON.stringify({ cursor: fresh.cursor, epoch: fresh.epoch }),
      );
      const item = latestPending.current;
      if (item) {
        const result = await request<{ accepted: boolean }>(
          `${root}/messages/status`,
          { idempotencyKey: item.key },
        );
        if (
          result.accepted &&
          latestPending.current?.key === item.key &&
          mounted.current &&
          lifecycle.current === revision
        ) {
          setPending(null);
          setDraft((value) => (value.trim() === item.text ? "" : value));
        }
      }
    } catch (error) {
      if (!mounted.current || lifecycle.current !== revision) return;
      setOnline(false);
      if (
        error instanceof ConversationError &&
        [401, 403, 404].includes(error.status)
      ) {
        current.current = null;
        gate.current = null;
        setPage(null);
        setOlder([]);
        setDraft("");
        setPending(null);
        sessionStorage.removeItem(cursorKey);
      }
      setFailure(
        error instanceof Error
          ? error.message
          : "This conversation is unavailable.",
      );
    }
  }, [root, cursorKey, request]);

  useEffect(() => {
    mounted.current = true;
    lifecycle.current++;
    setPage(null);
    setOlder([]);
    setDraft("");
    setPending(null);
    setBefore(null);
    let resumeCursor: number | undefined;
    try {
      const stored = JSON.parse(sessionStorage.getItem(cursorKey) ?? "null");
      if (
        Number.isSafeInteger(stored?.cursor) &&
        stored.cursor >= 0 &&
        Number.isSafeInteger(stored?.epoch) &&
        stored.epoch >= 0
      )
        resumeCursor = stored.cursor;
      for (const key of Object.keys(sessionStorage))
        if (
          key.startsWith("qelvora:conversation:") &&
          !key.startsWith(`qelvora:conversation:${accountId}:`)
        )
          sessionStorage.removeItem(key);
    } catch {
      sessionStorage.removeItem(cursorKey);
    }
    let connecting = false;
    let disposed = false,
      socket: WebSocket | undefined,
      reconnect: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000,
      refreshing = false,
      again = false;
    const orderedRefresh = async () => {
      if (refreshing) {
        again = true;
        return;
      }
      refreshing = true;
      do {
        again = false;
        await refresh();
      } while (again && !disposed);
      refreshing = false;
    };
    const receive = (raw: unknown) => {
      const parsed = FrameSchema.safeParse(raw);
      if (!parsed.success || !gate.current) return;
      try {
        const visible: Frame[] = gate.current.receive(parsed.data);
        if (visible.length) void orderedRefresh();
      } catch {
        void orderedRefresh();
      }
    };
    const connect = async () => {
      if (disposed || connecting || !navigator.onLine) return;
      connecting = true;
      clearTimeout(reconnect);
      reconnect = undefined;
      const previous = socket;
      socket = undefined;
      previous?.close();
      await orderedRefresh();
      if (disposed || !current.current) {
        connecting = false;
        if (!disposed) {
          reconnect = setTimeout(() => void connect(), delay);
          delay = Math.min(delay * 2, 15000);
        }
        return;
      }
      try {
        const ticket = await request<{
          ticket: string;
          url: string;
        }>("realtime-ticket", {});
        if (disposed) return;
        const liveSocket = new WebSocket(ticket.url, [
          "qelvora-ticket",
          ticket.ticket,
        ]);
        socket = liveSocket;
        socket.onopen = () => {
          delay = 1000;
          socket?.send(
            JSON.stringify({
              kind: "subscribe",
              creatorId,
              fanId,
              cursor: Math.min(
                resumeCursor ?? gate.current?.cursor ?? 0,
                gate.current?.cursor ?? 0,
              ),
            }),
          );
          resumeCursor = undefined;
        };
        socket.onmessage = (event) => {
          try {
            const payload: unknown = JSON.parse(String(event.data));
            if (
              typeof payload === "object" &&
              payload !== null &&
              "error" in payload
            ) {
              socket?.close();
              void orderedRefresh();
            } else receive(payload);
          } catch {
            socket?.close();
          }
        };
        socket.onclose = () => {
          if (disposed || socket !== liveSocket) return;
          setOnline(false);
          reconnect = setTimeout(() => void connect(), delay);
          delay = Math.min(delay * 2, 15000);
        };
      } catch {
        if (!disposed)
          reconnect = setTimeout(
            () => void connect(),
            (delay = Math.min(delay * 2, 15000)),
          );
      } finally {
        connecting = false;
      }
    };
    const offline = () => {
      setOnline(false);
      socket?.close();
    };
    const resume = () => {
      setOnline(false);
      clearTimeout(reconnect);
      socket?.close();
      void connect();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", resume);
    const visible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        if (!socket || socket.readyState === WebSocket.CLOSED) void connect();
        else void orderedRefresh();
      }
    };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    // Polling recovers gaps and non-stream metadata. Only a freshly scoped snapshot is rendered.
    const poll = setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible")
        void orderedRefresh();
    }, 5000);
    setOnline(false);
    void connect();
    return () => {
      disposed = true;
      mounted.current = false;
      lifecycle.current++;
      socket?.close();
      clearTimeout(reconnect);
      clearInterval(poll);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
      current.current = null;
      gate.current = null;
    };
  }, [accountId, creatorId, fanId, cursorKey, refresh, request]);
  useEffect(() => {
    const clientId = crypto.randomUUID();
    const pulse = () => {
      if (current.current)
        void request(`${root}/presence`, {
          clientId,
          active: navigator.onLine && document.visibilityState === "visible",
        }).catch(() => undefined);
    };
    const timer = setInterval(pulse, 20000);
    document.addEventListener("visibilitychange", pulse);
    window.addEventListener("online", pulse);
    pulse();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pulse);
      window.removeEventListener("online", pulse);
      if (navigator.onLine)
        void request(`${root}/presence`, {
          clientId,
          active: false,
        }).catch(() => undefined);
    };
  }, [root, accountId, page?.threadId, request]);

  const send = async (retry?: Pending) => {
    const revision = lifecycle.current;
    if (!navigator.onLine || !online || busy || !page) return;
    const text = retry?.text ?? draft.trim();
    if (!text) return;
    const item: Pending = retry ?? {
      key: crypto.randomUUID(),
      text,
      clientSequence: (page.messages.at(-1)?.sequence ?? 0) + 1,
      destination: page.control === "human_active" ? "fan-replies" : "messages",
      state: "pending",
    };
    setPending({ ...item, state: "pending" });
    setBusy(true);
    setFailure(null);
    try {
      await request<AcceptedMessage>(`${root}/${item.destination}`, {
        text,
        idempotencyKey: item.key,
        clientSequence: item.clientSequence,
      });
      if (!mounted.current || lifecycle.current !== revision) return;
      setPending(null);
      if (!retry) setDraft("");
      await refresh();
      scrollEnd.current?.scrollIntoView({ block: "end", behavior: "instant" });
    } catch (error) {
      if (!mounted.current || lifecycle.current !== revision) return;
      const uncertain =
        !(error instanceof ConversationError) ||
        error.status >= 500 ||
        error.status === 409;
      setPending({ ...item, state: uncertain ? "uncertain" : "rejected" });
      setFailure(
        error instanceof Error
          ? error.message
          : "Reconnect to check whether this message was accepted.",
      );
    } finally {
      if (mounted.current && lifecycle.current === revision) setBusy(false);
    }
  };
  const loadOlder = async () => {
    const revision = lifecycle.current;
    if (!before || busy) return;
    const height = document.documentElement.scrollHeight;
    setBusy(true);
    try {
      const previous = await request<ConversationPage>(
        `${root}?before=${before}`,
      );
      if (!mounted.current || lifecycle.current !== revision) return;
      setOlder((items) =>
        [...previous.messages, ...items]
          .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i)
          .slice(0, 250),
      );
      setBefore(previous.before);
      requestAnimationFrame(() => {
        if (mounted.current && lifecycle.current === revision)
          window.scrollBy(0, document.documentElement.scrollHeight - height);
      });
    } catch (error) {
      if (!mounted.current || lifecycle.current !== revision) return;
      setFailure(
        error instanceof Error
          ? error.message
          : "Earlier messages are unavailable.",
      );
    } finally {
      if (mounted.current && lifecycle.current === revision) setBusy(false);
    }
  };
  const forget = async (message: ConversationMessage) => {
    if (busy || !online || !page) return;
    const revision = lifecycle.current;
    setBusy(true);
    try {
      await request(`${root}/messages/${message.id}/dont-remember`, {
        expectedRevision: page.revision,
      });
      if (mounted.current && lifecycle.current === revision) await refresh();
    } catch (error) {
      if (mounted.current && lifecycle.current === revision)
        setFailure(
          error instanceof Error
            ? error.message
            : "This memory change is unavailable.",
        );
    } finally {
      if (mounted.current && lifecycle.current === revision) setBusy(false);
    }
  };
  const feedback = async (
    message: ConversationMessage,
    rating: "helpful" | "not_helpful" | null,
  ) => {
    if (
      busy ||
      !online ||
      !message.agentVersion ||
      (rating !== null && !page?.feedbackPolicy)
    )
      return;
    const revision = lifecycle.current;
    setBusy(true);
    try {
      const result = await request<{
        rating: "helpful" | "not_helpful" | null;
      }>(`${root}/messages/${message.id}/feedback`, {
        messageVersion: message.version,
        agentVersion: message.agentVersion,
        rating,
        ...(rating !== null
          ? { consent: true, policyVersion: page!.feedbackPolicy!.version }
          : {}),
      });
      if (mounted.current && lifecycle.current === revision) {
        setOlder((items) =>
          items.map((item) =>
            item.id === message.id && item.version === message.version
              ? { ...item, feedback: result.rating }
              : item,
          ),
        );
        await refresh();
      }
    } catch (error) {
      if (mounted.current && lifecycle.current === revision)
        setFailure(
          error instanceof Error
            ? error.message
            : "Your response could not be saved. Try again.",
        );
    } finally {
      if (mounted.current && lifecycle.current === revision) setBusy(false);
    }
  };
  if (!page)
    return (
      <main className="conversation-screen">
        <div className="conversation-body">
          <a href="/you">You</a>
          <Notice
            title={
              failure ? "Conversation unavailable" : "Opening conversation"
            }
          >
            {failure ?? "Loading your messages…"}
          </Notice>
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => void refresh()}
          >
            Try again
          </button>
          <Button href="/support" variant="quiet">
            Report or get help
          </Button>
        </div>
      </main>
    );
  const all = [
    ...older.filter((m) => !page.messages.some((latest) => latest.id === m.id)),
    ...page.messages,
  ];
  const active = Object.keys(page.generationSequences).length > 0;
  return (
    <main className="conversation-screen">
      <div className="conversation-pinned">
        <header className="conversation-thread-header">
          <a className="qv-icon-btn" aria-label="Back to You" href="/you">
            ‹
          </a>
          <Avatar
            initial={page.creatorName.charAt(0)}
            live={page.control === "human_active"}
          />
          <div>
            <strong>{page.creatorName}</strong>
            <div className="qv-meta">
              {page.control === "human_active"
                ? "In this conversation"
                : "Official AI"}
            </div>
          </div>
          <a
            className="qv-icon-btn"
            href={`/you?creatorId=${creatorId}&fanId=${fanId}`}
            aria-label="Conversation privacy"
          >
            ⋯
          </a>
        </header>
        <IdentityStrip
          name={page.creatorName}
          state={
            page.control === "human_active"
              ? "human"
              : page.control === "ai_active"
                ? "ai"
                : "paused"
          }
        />
      </div>
      <div className="conversation-body">
        <p className="conversation-disclosure">
          Conversations with a creator’s AI can be read by that creator and
          their authorized team. Those accesses are logged. You can delete any
          conversation at any time.
        </p>
        {!online && (
          <Notice tone="offline" title="You're offline">
            You're seeing the last loaded conversation. Reconnect to send. Your
            input is kept on this screen.
          </Notice>
        )}
        {page.offTheRecord && (
          <SystemLine>
            Off the record · the AI keeps no memory from this conversation.
          </SystemLine>
        )}
        {before && (
          <button
            disabled={busy}
            className="qv-btn qv-btn--quiet"
            onClick={() => void loadOlder()}
          >
            Earlier messages
          </button>
        )}
        {all.length === 0 && (
          <Notice title={`Start with ${page.creatorName}'s AI`}>
            Ask about their work. Every AI reply is labeled, and remembered
            facts need your agreement.
          </Notice>
        )}
        {all.map((message) => (
          <article
            key={message.id}
            id={`message-${message.id}`}
            aria-label={author(message, page.creatorName)}
          >
            {message.authorKind === "system" ? (
              <SystemLine>{message.text}</SystemLine>
            ) : message.correction &&
              all.some(
                (original) =>
                  original.id === message.correction?.originalMessageId &&
                  original.version === message.correction.originalVersion &&
                  original.authorKind === "ai",
              ) ? (
              <Correction
                name={page.creatorName}
                aiText={
                  all.find(
                    (original) =>
                      original.id === message.correction?.originalMessageId,
                  )!.text
                }
                signedActId={message.signedActId ?? undefined}
              >
                {message.text}
              </Correction>
            ) : [
                "fan",
                "ai",
                "team",
                "human_creator",
                "approved_draft",
              ].includes(message.authorKind) ? (
              <Message
                kind={
                  message.authorKind as
                    | "fan"
                    | "ai"
                    | "team"
                    | "human_creator"
                    | "approved_draft"
                }
                name={page.creatorName}
                member={message.member ?? "Authorized team member"}
                signedActId={message.signedActId ?? undefined}
                actions={false}
                live={
                  !message.correction &&
                  message.authorKind === "human_creator" &&
                  page.control === "human_active"
                }
                delivery={
                  message.deliveryState === "generating"
                    ? message.text
                      ? "streaming"
                      : "accepted"
                    : message.deliveryState === "interrupted"
                      ? "interrupted"
                      : undefined
                }
                citation={
                  <>
                    {message.citations.map((id) => (
                      <CitationChip
                        key={id}
                        title="Source"
                        meta="Read the original passage"
                        href={`/threads/${creatorId}/${fanId}/citations/${id}`}
                      />
                    ))}
                  </>
                }
              >
                <span style={{ whiteSpace: "pre-wrap" }}>{message.text}</span>
                {message.correction && (
                  <div>
                    <span>
                      {formatCopy("correctionAuthor", {
                        name: page.creatorName,
                      })}
                    </span>
                    <a
                      href={`/threads/${creatorId}/${fanId}/messages/${message.correction.originalMessageId}`}
                    >
                      Original AI reply · version{" "}
                      {message.correction.originalVersion}
                    </a>
                  </div>
                )}
                {message.deliveryState === "failed" && (
                  <span className="qv-tag">
                    Reply unavailable · your allowance was released
                  </span>
                )}
              </Message>
            ) : (
              <div className="qv qv-msg">
                {message.authorKind === "human_call" ? (
                  <span className="qv-author">
                    {formatCopy("callAuthor", { name: page.creatorName })}
                  </span>
                ) : (
                  <AuthorLabel
                    kind={
                      message.authorKind === "human_broadcast"
                        ? "human_broadcast"
                        : "human_reaction"
                    }
                    name={page.creatorName}
                    audience="Audience details unavailable"
                  />
                )}
                <p className="qv-voice" style={{ whiteSpace: "pre-wrap" }}>
                  {message.text}
                </p>
                {message.signedActId && (
                  <SignedMarker
                    name={page.creatorName}
                    signedActId={message.signedActId}
                  />
                )}
              </div>
            )}
            {message.authorKind === "fan" &&
              (message.offTheRecord ? (
                <span className="qv-help">Not used for memory</span>
              ) : (
                <button
                  className="qv-link-btn"
                  disabled={busy || !online}
                  onClick={() => void forget(message)}
                >
                  Don’t remember this
                </button>
              ))}
            {message.authorKind === "ai" &&
              message.agentVersion &&
              ["delivered", "interrupted"].includes(message.deliveryState) &&
              page.feedbackPolicy && (
                <details className="conversation-feedback">
                  <summary>{formatCopy("thisHelped", {})}</summary>
                  <p className="qv-help">{page.feedbackPolicy.notice}</p>
                  <div className="conversation-actions">
                    <button
                      className="qv-link-btn"
                      disabled={busy || !online}
                      aria-pressed={message.feedback === "helpful"}
                      onClick={() => void feedback(message, "helpful")}
                    >
                      {formatCopy("thisHelped", {})}
                    </button>
                    <button
                      className="qv-link-btn"
                      disabled={busy || !online}
                      aria-pressed={message.feedback === "not_helpful"}
                      onClick={() => void feedback(message, "not_helpful")}
                    >
                      Not helpful
                    </button>
                    {message.feedback && (
                      <button
                        className="qv-link-btn"
                        disabled={busy || !online}
                        onClick={() => void feedback(message, null)}
                      >
                        Remove my response
                      </button>
                    )}
                  </div>
                  {message.feedback && (
                    <p className="qv-help" role="status">
                      Your response is saved.
                    </p>
                  )}
                </details>
              )}
            {message.feedback && !page.feedbackPolicy && (
              <button
                className="qv-link-btn"
                disabled={busy || !online}
                onClick={() => void feedback(message, null)}
              >
                Remove my response
              </button>
            )}
            {message.authorKind !== "fan" &&
              message.authorKind !== "system" && (
                <div className="conversation-actions">
                  <a
                    className="qv-link-btn"
                    href={`/support?creatorId=${creatorId}${message.authorKind === "ai" ? `&messageId=${message.id}` : ""}`}
                  >
                    Report
                  </a>
                  <a
                    className="qv-link-btn"
                    href={`/you?creatorId=${creatorId}&fanId=${fanId}#memory`}
                  >
                    What it remembers
                  </a>
                </div>
              )}
          </article>
        ))}
        {pending && (
          <div>
            <Message
              kind="fan"
              name={page.creatorName}
              delivery={pending.state === "pending" ? "pending" : undefined}
            >
              {pending.text}
            </Message>
            {pending.state !== "pending" && (
              <div role="status">
                <p className="conversation-quiet">
                  {pending.state === "uncertain"
                    ? "Acceptance hasn't been confirmed. Retry checks the same message without sending a duplicate."
                    : "Not sent"}
                </p>
                <button
                  className="qv-link-btn"
                  disabled={!online || busy}
                  onClick={() => void send(pending)}
                >
                  Retry
                </button>
                {pending.state === "rejected" && (
                  <button
                    className="qv-link-btn"
                    disabled={busy}
                    onClick={() => {
                      setDraft(pending.text);
                      setPending(null);
                    }}
                  >
                    Keep editing
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {failure && (
          <Notice tone="error" title="Message unavailable">
            {failure}
          </Notice>
        )}
        <div ref={scrollEnd} />
      </div>
      <footer className="conversation-footer">
        {!page.canSend && (
          <Notice
            title={
              page.control === "ai_paused" ? "AI paused" : "AI unavailable"
            }
          >
            {page.unavailableReason ?? "Messaging is unavailable."}
          </Notice>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className="conversation-input-row">
            <textarea
              aria-label={
                page.control === "human_active"
                  ? `Message ${page.creatorName}`
                  : `Message ${page.creatorName}'s AI`
              }
              placeholder={
                page.control === "human_active"
                  ? `Message ${page.creatorName}…`
                  : `Message ${page.creatorName}'s AI…`
              }
              maxLength={2000}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <button
              aria-label="Send message"
              className="qv-send"
              type="submit"
              disabled={
                !online ||
                !page.canSend ||
                busy ||
                active ||
                Boolean(pending) ||
                !draft.trim()
              }
            >
              ↑
            </button>
          </div>
        </form>
        <Button variant="maya" href={`/commerce/packet?creatorId=${creatorId}`}>
          Ask {page.creatorName} to step in
        </Button>
        <div className="conversation-actions">
          <a href={`/you?creatorId=${creatorId}&fanId=${fanId}`}>
            Me and privacy
          </a>
          <a href="/trust/crisis">Get support</a>
        </div>
      </footer>
    </main>
  );
}
