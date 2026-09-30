"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Notice, TabBar } from "@qelvora/ui-web";
import type {
  ConversationPage,
  MemoryItem,
  ProviderPolicy,
} from "../../../../packages/api/src/conversation/contracts";
import { useConversationRequest, ConversationError } from "./api";
import "./conversation.css";
type Account = {
  fan: { id: string; handle: string; intro: string };
  threads: { id: string; creatorId: string; fanId: string; name: string }[];
};
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
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void request<Account>("account")
      .then((value) => {
        if (active) setAccount(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [request]);
  if (creatorId && fanId)
    return (
      <ConversationPrivacy
        key={`${creatorId}:${fanId}`}
        creatorId={creatorId}
        fanId={fanId}
      />
    );
  return (
    <main className="conversation-account">
      <div className="account-title">
        <h1>{account ? `@${account.fan.handle}` : "You"}</h1>
        <p className="conversation-quiet">Signed in with Pantopus</p>
      </div>
      {error && (
        <section>
          <Notice title="Your account is unavailable" tone="error">
            {error}
          </Notice>
        </section>
      )}
      <section>
        <h2>Your intro</h2>
        <p>{account?.fan.intro || "You haven’t added an intro yet."}</p>
        <Button href="/identity/account" variant="quiet">
          Edit handle and intro
        </Button>
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
                <span>
                  <strong>{title}</strong>
                  <br />
                  <span className="qv-help">{description}</span>
                </span>
                <span aria-hidden="true">›</span>
              </a>
            ))}
          </article>
        </nav>
      </section>
      <section id="conversations">
        <h2>Me and privacy</h2>
        {account?.threads.length === 0 && <p>No conversations yet.</p>}
        {account?.threads.map((thread) => (
          <article key={thread.id}>
            <a
              className="conversation-row"
              href={`/you?creator=${thread.creatorId}&fan=${thread.fanId}`}
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
        <Button href="/support/privacy" variant="secondary" block>
          Export or delete my data
        </Button>
      </section>
      <TabBar active="You" />
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
  const [audit, setAudit] = useState<Audit[]>([]);
  const [usage, setUsage] = useState<
    | import("../../../../packages/api/src/conversation/contracts").ConversationUsage
    | null
  >(null);
  const [policy, setPolicy] = useState<ProviderPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [fresh, memories, entries, caps, time] = await Promise.all([
        request<ConversationPage>(root),
        request<MemoryView>(`${root}/memory`),
        request<Audit[]>(`${root}/audit`),
        request<{ providers: ProviderPolicy | null }>("capabilities"),
        request<
          import("../../../../packages/api/src/conversation/contracts").ConversationUsage
        >(`${root}/usage`),
      ]);
      setPage(fresh);
      setMemory(memories);
      setAudit(entries);
      setPolicy(caps.providers);
      setUsage(time);
      setError(null);
    } catch (error) {
      if (
        error instanceof ConversationError &&
        [401, 403, 404].includes(error.status)
      ) {
        setPage(null);
        setMemory(null);
        setAudit([]);
        setUsage(null);
        setEditing(null);
        setText("");
      }
      setError(
        error instanceof Error
          ? error.message
          : "Reconnect to view your privacy settings.",
      );
    }
  }, [root, request]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const action = async (run: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await run();
      setEditing(null);
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "This change could not be saved.",
      );
    } finally {
      setBusy(false);
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
          {audit.length === 0 ? (
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
