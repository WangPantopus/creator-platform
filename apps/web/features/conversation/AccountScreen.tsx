"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Notice, TabBar } from "@qelvora/ui-web";
import { copy } from "@qelvora/copy";
import type {
  ConversationPage,
  MemoryItem,
  ProviderPolicy,
  ConversationAccountPage,
} from "../../../../packages/api/src/conversation/contracts";
import { useConversationRequest, ConversationError } from "./api";
import { useIdentityRequest } from "../identity/session-boundary";
import "./conversation.css";
type Account = ConversationAccountPage;
type AccountCommerce = {
  fan: { id: string } | null;
  exposure: { captured: number; currency: string } | null;
  policy: { currency: string };
  limits: { currency: string; amount: string | null; explicit_none: boolean }[];
  memberships: { id: string }[];
};
function accountMoney(value: number | string, currency: string): string {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) return "—";
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits;
    if (digits === undefined) return "—";
    return formatter.format(amount / 10 ** digits);
  } catch {
    return "—";
  }
}
type MemoryView = {
  revision: number;
  offTheRecord: boolean;
  introShared: boolean;
  items: MemoryItem[];
};
type Audit = {
  id: string;
  readerAccountId: string;
  role: string;
  readAt: string;
};

export function AccountScreen({
  creatorId,
  fanId,
}: {
  creatorId?: string;
  fanId?: string;
}) {
  const request = useConversationRequest();
  const {
    session,
    signal,
    end,
    request: identityRequest,
  } = useIdentityRequest();
  const [account, setAccount] = useState<Account | null>(null);
  const [commerce, setCommerce] = useState<AccountCommerce | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (creatorId && fanId) return;
    let active = true;
    let revision = 0;
    let controller: AbortController | undefined;
    const conceal = () => {
      revision++;
      controller?.abort();
      setAccount(null);
      setCommerce(null);
      setLoading(false);
    };
    const refresh = () => {
      conceal();
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) {
        setError("Reconnect to open your account.");
        return;
      }
      const currentRevision = revision;
      controller = new AbortController();
      setLoading(true);
      setError(null);
      void request<Account>(
        cursor ? `account?cursor=${cursor}` : "account",
        undefined,
        controller.signal,
      )
        .then(async (value) => {
          if (!active || revision !== currentRevision) return;
          setAccount(value);
          try {
            const response = await fetch("/api/commerce/overview", {
              cache: "no-store",
              headers: { "X-Commerce-Account-Id": session.accountId },
              signal: AbortSignal.any([
                signal,
                controller!.signal,
                AbortSignal.timeout(10000),
              ]),
            });
            if (!active || revision !== currentRevision || signal.aborted)
              return;
            if (response.status === 401) {
              // Recheck the current session after an ordinary cookie rotation.
              await identityRequest("session");
              return;
            }
            if (
              response.status === 409 &&
              (await response.clone().json()).error?.code ===
                "session_account_changed"
            ) {
              conceal();
              end();
              return;
            }
            if (!response.ok) return;
            const overview = (await response.json()) as AccountCommerce;
            if (
              active &&
              revision === currentRevision &&
              !signal.aborted &&
              overview.fan?.id === value.fan.id
            )
              setCommerce(overview);
          } catch {
            // Commerce has its own permission/read boundary. An unavailable
            // metric never turns into a zero or replaces the account read.
            if (active && revision === currentRevision) setCommerce(null);
          }
        })
        .catch((error) => {
          if (active && revision === currentRevision && !signal.aborted)
            setError(
              error instanceof Error
                ? error.message
                : "Reconnect to open your account.",
            );
        })
        .finally(() => {
          if (active && revision === currentRevision) setLoading(false);
        });
    };
    const offline = () => {
      conceal();
      setError("Reconnect to open your account.");
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => {
      active = false;
      revision++;
      controller?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [
    request,
    cursor,
    attempt,
    creatorId,
    fanId,
    session.accountId,
    signal,
    end,
    identityRequest,
  ]);
  if (creatorId && fanId)
    return (
      <ConversationPrivacy
        key={`${creatorId}:${fanId}`}
        creatorId={creatorId}
        fanId={fanId}
      />
    );
  const limit = commerce?.limits.find(
    (value) => value.currency === commerce.policy.currency,
  );
  const limitDetail = !commerce
    ? "Currently unavailable"
    : !limit
      ? "Choose your limit"
      : limit.explicit_none
        ? "No limit"
        : limit.amount === null
          ? "Limit unavailable"
          : `of your ${accountMoney(limit.amount, limit.currency)} limit`;
  return (
    <main className="conversation-account conversation-you" aria-busy={loading}>
      <div className="account-title">
        <h1>{account ? `@${account.fan.handle}` : "You"}</h1>
        <p className="conversation-quiet">
          {session.mode === "development"
            ? "Synthetic local account. Pantopus production sign-in is not connected."
            : "Signed in with Pantopus"}
        </p>
      </div>
      {error && (
        <section>
          <Notice title="Your account is unavailable" tone="error">
            {error}
          </Notice>
          <button
            type="button"
            className="qv-btn qv-btn--quiet"
            disabled={loading}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </button>
        </section>
      )}
      <section
        className="account-metrics"
        aria-label="Spending and memberships"
      >
        <article>
          <span className="qv-meta">THIS MONTH</span>
          <span className="account-metric-value">
            {commerce?.exposure
              ? accountMoney(
                  commerce.exposure.captured,
                  commerce.exposure.currency,
                )
              : "—"}
          </span>
          <span className="qv-help">{limitDetail}</span>
        </article>
        <article>
          <span className="qv-meta">MEMBERSHIPS</span>
          <span className="account-metric-value">
            {commerce ? commerce.memberships.length : "—"}
          </span>
          <span className="qv-help">
            {commerce ? "Saved memberships" : "Currently unavailable"}
          </span>
        </article>
      </section>
      <section>
        <nav aria-label="Your account">
          <article>
            {[
              [
                "Me and privacy",
                "Memories, who opened your conversations, consents",
                "#conversations",
              ],
              [
                "Spending and time",
                "Your limit, receipts, time with each AI",
                "/commerce/spending",
              ],
              [
                "Memberships",
                "Manage your memberships",
                "/commerce/membership",
              ],
              [
                "Notifications",
                "Push and email, per creator, quiet hours",
                "/notifications/settings",
              ],
              [
                "Receipts",
                "Your purchases and deliveries",
                "/commerce/requests",
              ],
              ["Help and safety", "Report, block, crisis support", "/support"],
            ].map(([title, description, href]) => (
              <a key={title} href={href}>
                <span className="account-row-label">
                  <strong>{title}</strong>
                  <span className="qv-help">{description}</span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M6 3.5L10.5 8 6 12.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            ))}
          </article>
        </nav>
      </section>
      <section>
        <h2>Your intro</h2>
        <p>
          {account
            ? account.fan.intro || "You haven’t added an intro yet."
            : error
              ? "Your intro is unavailable."
              : "Loading your account…"}
        </p>
        <Button href="/identity/account" variant="quiet">
          Edit handle and intro
        </Button>
      </section>
      <section id="conversations">
        <h2>Me and privacy</h2>
        <p className="conversation-quiet">{copy.conversationAccess}</p>
        {account?.threads.length === 0 && <p>No conversations yet.</p>}
        {account?.threads.map((thread) => (
          <article key={thread.id}>
            <a
              className="conversation-row"
              href={`/you?creatorId=${thread.creatorId}&fanId=${thread.fanId}`}
            >
              <span>{thread.name} · memories and access history</span>
              <span aria-hidden="true">›</span>
            </a>
            <a
              className="conversation-row"
              href={`/threads/${thread.creatorId}/${thread.fanId}`}
            >
              Open conversation
            </a>
          </article>
        ))}
        {loading && <p role="status">Loading your conversations…</p>}
        {account?.nextCursor && (
          <button
            type="button"
            className="qv-btn qv-btn--quiet"
            disabled={loading || Boolean(error)}
            onClick={() => setCursor(account.nextCursor)}
          >
            More conversations
          </button>
        )}
        {cursor && (
          <button
            type="button"
            className="qv-btn qv-btn--quiet"
            disabled={loading}
            onClick={() => setCursor(null)}
          >
            Back to first page
          </button>
        )}
        <Button href="/support/privacy" variant="secondary" block>
          Export or delete my data
        </Button>
      </section>
      <TabBar
        active="You"
        hrefs={{
          Home: "/home",
          Discover: "/discover",
          Requests: "/requests",
          You: "/you",
        }}
      />
    </main>
  );
}

function ConversationPrivacy({
  creatorId,
  fanId,
}: {
  creatorId: string;
  fanId: string;
}) {
  const request = useConversationRequest();
  const root = `${creatorId}/${fanId}`;
  const [page, setPage] = useState<ConversationPage | null>(null);
  const [memory, setMemory] = useState<MemoryView | null>(null);
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [usage, setUsage] = useState<
    | import("../../../../packages/api/src/conversation/contracts").ConversationUsage
    | null
  >(null);
  const [policy, setPolicy] = useState<ProviderPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const conceal = useCallback(() => {
    revision.current++;
    controller.current?.abort();
    setPage(null);
    setMemory(null);
    setAudit(null);
    setUsage(null);
    setPolicy(null);
    setBusy(false);
  }, []);
  const refresh = useCallback(async () => {
    conceal();
    if (document.visibilityState !== "visible") return;
    if (!navigator.onLine) {
      setError("Reconnect to view your privacy settings.");
      return;
    }
    const currentRevision = revision.current;
    const requestController = new AbortController();
    controller.current = requestController;
    setError(null);
    try {
      const [fresh, memories, entries, caps, time] = await Promise.all([
        request<ConversationPage>(root, undefined, requestController.signal),
        request<MemoryView>(
          `${root}/memory`,
          undefined,
          requestController.signal,
        ),
        request<Audit[]>(`${root}/audit`, undefined, requestController.signal),
        request<{ providers: ProviderPolicy | null }>(
          "capabilities",
          undefined,
          requestController.signal,
        ),
        request<
          import("../../../../packages/api/src/conversation/contracts").ConversationUsage
        >(`${root}/usage`, undefined, requestController.signal),
      ]);
      if (revision.current !== currentRevision) return;
      setPage(fresh);
      setMemory(memories);
      setAudit(entries);
      setPolicy(caps.providers);
      setUsage(time);
      setError(null);
    } catch (error) {
      if (revision.current !== currentRevision) return;
      requestController.abort();
      if (
        error instanceof ConversationError &&
        [401, 403, 404].includes(error.status)
      ) {
        setEditing(null);
        setText("");
      }
      setError(
        error instanceof Error
          ? error.message
          : "Reconnect to view your privacy settings.",
      );
    }
  }, [root, request, conceal]);
  useEffect(() => {
    const offline = () => {
      conceal();
      setError("Reconnect to view your privacy settings.");
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", refresh);
    void refresh();
    return () => {
      conceal();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh, conceal]);
  const action = async (run: () => Promise<unknown>) => {
    if (busy || !page || !memory) return;
    const currentRevision = revision.current;
    setBusy(true);
    setError(null);
    try {
      await run();
      if (revision.current !== currentRevision) return;
      setEditing(null);
      await refresh();
    } catch (error) {
      if (revision.current !== currentRevision) return;
      if (
        error instanceof ConversationError &&
        [401, 403, 404].includes(error.status)
      ) {
        conceal();
        setEditing(null);
        setText("");
      }
      setError(
        error instanceof Error
          ? error.message
          : "This change could not be saved.",
      );
    } finally {
      if (revision.current === currentRevision) setBusy(false);
    }
  };
  const decide = (item: MemoryItem, decision: string) =>
    action(() =>
      request(`${root}/memory/${item.id}`, {
        action: decision,
        expectedRevision: memory!.revision,
        ...(decision === "edit" ? { text } : {}),
      }),
    );
  return (
    <main className="conversation-account">
      <header>
        <a className="qv-icon-btn" aria-label="Back to You" href="/you">
          ‹
        </a>
        <strong>Me and privacy</strong>
      </header>
      {error && (
        <section>
          <Notice title="Privacy status" tone="error">
            {error}
          </Notice>
          <button
            className="qv-btn qv-btn--secondary"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
        </section>
      )}
      <section id="memory">
        <h2>What {page?.creatorName ?? "this creator"}'s AI remembers</h2>
        {!memory && (
          <p>{error ? "Memories unavailable." : "Loading your memories…"}</p>
        )}
        {memory?.items.length === 0 && (
          <p>No memories. The AI asks before remembering.</p>
        )}
        {memory?.items.map((item) => (
          <div className="conversation-memory" key={item.id}>
            <span className="qv-meta">
              {item.state === "proposed"
                ? "Want me to remember this? Only if you say yes."
                : item.kind === "open_loop"
                  ? item.state === "resolved"
                    ? "Resolved open loop"
                    : "Open loop"
                  : item.kind === "summary"
                    ? "Summary"
                    : "Remembered"}
            </span>
            {editing === item.id ? (
              <>
                <label htmlFor={`edit-${item.id}`}>
                  What you want remembered
                </label>
                <textarea
                  id={`edit-${item.id}`}
                  maxLength={2000}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
                <button
                  className="qv-btn qv-btn--secondary"
                  disabled={busy || !text.trim()}
                  onClick={() => void decide(item, "edit")}
                >
                  Save proposal
                </button>
                <button
                  className="qv-link-btn"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{item.text}</p>
            )}
            {item.sensitiveCategory && (
              <p className="conversation-quiet">
                Sensitive item · agreeing applies only to this exact memory.
              </p>
            )}
            <a
              href={`/threads/${creatorId}/${fanId}/messages/${item.provenanceMessageId}`}
            >
              View where this came from
            </a>
            <div className="conversation-actions">
              {item.state === "proposed" && (
                <button
                  disabled={busy || memory.offTheRecord}
                  className="qv-btn qv-btn--secondary"
                  onClick={() => void decide(item, "accept")}
                >
                  Remember
                </button>
              )}
              <button
                disabled={busy}
                className="qv-link-btn"
                onClick={() => {
                  setEditing(item.id);
                  setText(item.text);
                }}
              >
                Edit
              </button>
              <button
                disabled={busy}
                className="qv-link-btn"
                onClick={() => void decide(item, "delete")}
              >
                {item.state === "proposed" ? "Don't remember" : "Delete"}
              </button>
              {item.kind === "open_loop" && item.state === "remembered" && (
                <button
                  disabled={busy}
                  className="qv-link-btn"
                  onClick={() => void decide(item, "resolve")}
                >
                  Resolved
                </button>
              )}
            </div>
          </div>
        ))}
        <p className="conversation-quiet">
          The creator and their authorized team can see these memories, never
          edit them. Deleting one also removes summaries that could repeat it.
        </p>
      </section>
      <section>
        <h2>Time with this creator’s AI</h2>
        {usage === null && (
          <p>{error ? "Time history unavailable." : "Loading time history…"}</p>
        )}
        {usage && (
          <article>
            <p>{usage.measurement} Days are shown in UTC.</p>
            <p>
              This week ·{" "}
              {Math.floor(
                usage.days.reduce((total, day) => total + day.seconds, 0) / 60,
              )}{" "}
              minutes
            </p>
            {usage.days.map((day) => (
              <div className="conversation-row" key={day.day}>
                <time>{day.day}</time>
                <span>{Math.floor(day.seconds / 60)} minutes</span>
              </div>
            ))}
            {!usage.modeAvailable && (
              <p className="qv-help">
                Companion mode time signals await the verified AI mode
                configuration.
              </p>
            )}
          </article>
        )}
        <h2>Who opened your conversations</h2>
        <article>
          {audit === null ? (
            <div className="conversation-row">
              {error
                ? "Opening history unavailable."
                : "Loading opening history…"}
            </div>
          ) : audit.length === 0 ? (
            <div className="conversation-row">No logged openings.</div>
          ) : (
            audit.map((entry) => (
              <div className="conversation-row" key={entry.id}>
                <span>
                  {entry.role === "creator"
                    ? `${page?.creatorName ?? "Creator"}'s account`
                    : entry.role === "triage"
                      ? "Authorized team · triage"
                      : "Authorized safety account"}
                  <br />
                  <span className="qv-help">Opened this conversation</span>
                  <br />
                  <span className="qv-help">
                    Account {entry.readerAccountId}
                  </span>
                </span>
                <time className="qv-meta" dateTime={entry.readAt}>
                  {new Date(entry.readAt).toLocaleString()}
                </time>
              </div>
            ))
          )}
        </article>
        <p className="conversation-quiet">
          This shows when an authorized account opened a conversation, not that
          a person read every message.
        </p>
      </section>
      <section>
        <h2>Off the record</h2>
        <label>
          <input
            type="checkbox"
            checked={memory?.offTheRecord ?? false}
            disabled={busy || !memory}
            onChange={(event) =>
              void action(() =>
                request(`${root}/preferences`, {
                  offTheRecord: event.target.checked,
                  introShared: memory!.introShared,
                  expectedRevision: memory!.revision,
                }),
              )
            }
          />
          <span>
            <strong>Keep this conversation off the record</strong>
            <br />
            <span className="qv-help">
              The AI keeps no memory from it. It's still labeled, still visible
              to the creator and their team, and you can delete it.
            </span>
          </span>
        </label>
        <label>
          <input
            type="checkbox"
            checked={memory?.introShared ?? false}
            disabled={busy || !memory}
            onChange={(event) =>
              void action(() =>
                request(`${root}/preferences`, {
                  offTheRecord: memory!.offTheRecord,
                  introShared: event.target.checked,
                  expectedRevision: memory!.revision,
                }),
              )
            }
          />
          <span>Share my intro with this creator’s AI</span>
        </label>
      </section>
      <section>
        <h2>AI providers</h2>
        {policy?.providers.map((provider) => (
          <a key={provider.name} href={provider.termsUrl}>
            {provider.name} · processing terms
          </a>
        ))}
        <p>
          {page?.consentCurrent
            ? "You agreed to these providers for this conversation."
            : "AI provider consent is unavailable or has been withdrawn."}
        </p>
        {page?.consentCurrent ? (
          <button
            disabled={busy}
            className="qv-btn qv-btn--secondary"
            onClick={() =>
              void action(() =>
                request(`${root}/consent`, {
                  version: policy?.version ?? "",
                  accepted: false,
                }),
              )
            }
          >
            Withdraw AI provider consent
          </button>
        ) : (
          policy?.verified && (
            <button
              disabled={busy}
              className="qv-btn qv-btn--secondary"
              onClick={() =>
                void action(() =>
                  request(`${root}/consent`, {
                    version: policy.version,
                    accepted: true,
                  }),
                )
              }
            >
              Agree to these AI providers
            </button>
          )
        )}
      </section>
      <section>
        <Button href="/support/privacy" variant="secondary" block>
          Export or delete my data
        </Button>
        <p className="conversation-quiet">
          Conversation ID: {page?.threadId ?? "Unavailable"}. Deletion and any
          retained dispute records are tracked by the data request service.
        </p>
        <Button href="/support" variant="quiet" block>
          Report, block, or get support
        </Button>
      </section>
    </main>
  );
}
