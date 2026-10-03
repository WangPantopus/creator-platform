"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CaseSummary } from "../../../backend/src/modules/trust/contracts";
import {
  ErrorState,
  TrustError,
  TrustSession,
  useTrust,
  useTrustSession,
  useTrustRequest,
  caseLabel,
  dateLabel,
} from "../ops/trust-client";

export default function SupportPage() {
  const request = useTrustRequest();
  const session = useTrust<{ accountId: string }>("session");
  const { data, error, refresh } = useTrust<{
    items: (CaseSummary & { resolution_reason?: string })[];
  }>("my-cases");
  const inbox = useTrust<{
    items: { id: string; type: string; reason: string; created_at: string }[];
  }>("inbox");
  const [kind, setKind] = useState("support");
  const [reason, setReason] = useState("");
  const [creatorId, setCreatorId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState<TrustError | null>(null);
  const key = useRef<string | null>(null);
  const [appealId, setAppealId] = useState<string | null>(null);
  const [appealReason, setAppealReason] = useState("");
  const epoch = useTrustSession(() => {
    setKind("support");
    setCreatorId("");
    setMessageId("");
    setRequestId("");
    setReason("");
    setAppealReason("");
    setAppealId(null);
    setMessage("");
    setBusy(false);
    setActionError(null);
    key.current = null;
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const creator = params.get("creatorId"),
      reportedMessage = params.get("messageId");
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (creator && uuid.test(creator)) setCreatorId(creator);
    // Setup supplies presentation context only. The report API still verifies
    // the current creator and snapshots its actual owner proof.
    if (
      params.get("kind") === "verification" &&
      creator &&
      uuid.test(creator) &&
      !reportedMessage &&
      !params.get("requestId")
    )
      setKind("verification");
    if (
      creator &&
      reportedMessage &&
      uuid.test(creator) &&
      uuid.test(reportedMessage)
    ) {
      setKind("ai_report");
      setCreatorId(creator);
      setMessageId(reportedMessage);
    }
    const request = params.get("requestId");
    if (request && uuid.test(request)) {
      setKind("dispute");
      setRequestId(request);
      if (creator && uuid.test(creator)) setCreatorId(creator);
    }
  }, []);
  return (
    <main className="trust-page">
      <nav aria-label="Trust">
        <Link href="/trust">Trust and help</Link>
        <Link href="/support/privacy">Privacy requests</Link>
        <Link href="/support/access">Case access history</Link>
        <Link href="/status">Service status</Link>
      </nav>
      <h1>Support and reports</h1>
      <p>
        Reports and help are available without a paid grant. Reported AI text
        appears only in its scoped case. If you are in immediate danger, contact
        local emergency services.
      </p>
      <TrustSession />
      <ErrorState error={error} retry={() => void refresh()} />
      <form
        className="trust-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          const current = epoch.current;
          setBusy(true);
          setActionError(null);
          key.current ??= crypto.randomUUID();
          try {
            if (kind === "block") {
              await request("blocks", {
                creatorId,
                reason,
                idempotencyKey: key.current,
              });
              if (epoch.current !== current) return;
              setMessage(
                "Your block is saved. Enforcement in connected domains follows their current denial checks.",
              );
              key.current = null;
              setReason("");
              await refresh();
              return;
            }
            const result = await request<CaseSummary>("reports", {
              kind,
              reason,
              ...(kind !== "support" && creatorId ? { creatorId } : {}),
              ...(kind === "ai_report" && messageId ? { messageId } : {}),
              ...(kind === "dispute" && requestId ? { requestId } : {}),
              idempotencyKey: key.current,
            });
            if (epoch.current !== current) return;
            setMessage(
              `${caseLabel(result.number)} is saved. Return here for its decision.`,
            );
            key.current = null;
            setReason("");
            await refresh();
          } catch (error) {
            if (epoch.current !== current) return;
            setActionError(
              error instanceof TrustError
                ? error
                : new TrustError(
                    "Reconnect and retry the same report.",
                    "offline",
                  ),
            );
          } finally {
            if (epoch.current === current) setBusy(false);
          }
        }}
      >
        <h2>Send a report or ask for help</h2>
        <label htmlFor="report-kind">What needs attention?</label>
        <select
          id="report-kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            key.current = null;
          }}
        >
          <option value="support">Support request</option>
          <option value="ai_report">Report an AI reply</option>
          <option value="abuse">Abuse or harassment</option>
          <option value="block">Block creator</option>
          <option value="crisis">Crisis help</option>
          <option value="dispute">Request dispute</option>
          <option value="verification">Creator verification</option>
          <option value="pause">Pause or authorization</option>
        </select>
        {kind !== "support" && (
          <>
            <label htmlFor="report-creator">Creator reference</label>
            <input
              id="report-creator"
              value={creatorId}
              required={kind === "ai_report" || kind === "block"}
              onChange={(event) => {
                setCreatorId(event.target.value);
                key.current = null;
              }}
            />
            {kind === "ai_report" && (
              <>
                <label htmlFor="report-message">AI message reference</label>
                <input
                  id="report-message"
                  value={messageId}
                  required
                  onChange={(event) => {
                    setMessageId(event.target.value);
                    key.current = null;
                  }}
                />
              </>
            )}
            {kind === "dispute" && (
              <>
                <label htmlFor="report-request">Request reference</label>
                <input
                  id="report-request"
                  value={requestId}
                  required
                  onChange={(event) => {
                    setRequestId(event.target.value);
                    key.current = null;
                  }}
                />
              </>
            )}
          </>
        )}
        <label htmlFor="report-reason">What happened?</label>
        <textarea
          id="report-reason"
          rows={4}
          minLength={12}
          maxLength={2000}
          required
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            key.current = null;
          }}
        />
        <button
          className="qv-btn qv-btn--secondary"
          disabled={busy || !session.data}
        >
          {busy ? "Saving…" : "Send report"}
        </button>
        <ErrorState error={actionError} />
        {message && <p role="status">{message}</p>}
      </form>
      <section className="trust-panel">
        <h2>Your cases</h2>
        {data?.items.length === 0 && <p>No reports or support requests yet.</p>}
        {data?.items.map((item) => (
          <article className="trust-job" key={item.id}>
            <p>
              <span className="qv-mono">{caseLabel(item.number)}</span> ·{" "}
              {item.state.replaceAll("_", " ")}
            </p>
            <p className="qv-help">{dateLabel(item.created_at)}</p>
            {item.resolution_reason && <p>{item.resolution_reason}</p>}
            {item.state === "resolved" && (
              <button
                className="qv-btn qv-btn--secondary"
                onClick={() => {
                  setAppealId(item.id);
                  setAppealReason("");
                  key.current = null;
                }}
              >
                Appeal decision
              </button>
            )}
            {appealId === item.id && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const current = epoch.current;
                  setBusy(true);
                  key.current ??= crypto.randomUUID();
                  try {
                    await request(`cases/${item.id}/appeals`, {
                      version: item.version,
                      reason: appealReason,
                      idempotencyKey: key.current,
                    });
                    if (epoch.current !== current) return;
                    setAppealId(null);
                    key.current = null;
                    await refresh();
                  } catch (error) {
                    if (epoch.current !== current) return;
                    setActionError(
                      error instanceof TrustError
                        ? error
                        : new TrustError(
                            "Reconnect to send this appeal.",
                            "offline",
                          ),
                    );
                  } finally {
                    if (epoch.current === current) setBusy(false);
                  }
                }}
              >
                <label htmlFor="appeal-reason">
                  What should another reviewer consider?
                </label>
                <textarea
                  id="appeal-reason"
                  required
                  minLength={12}
                  maxLength={2000}
                  rows={3}
                  value={appealReason}
                  onChange={(event) => {
                    setAppealReason(event.target.value);
                    key.current = null;
                  }}
                />
                <button className="qv-btn qv-btn--secondary" disabled={busy}>
                  Send appeal
                </button>
              </form>
            )}
          </article>
        ))}
      </section>
      <section className="trust-panel">
        <h2>Trust inbox</h2>
        <ErrorState error={inbox.error} retry={() => void inbox.refresh()} />
        {inbox.data?.items.length === 0 && <p>No notices yet.</p>}
        {inbox.data?.items.map((item) => (
          <article className="trust-job" key={item.id}>
            <p>{item.type.replaceAll("_", " ")}</p>
            <p>{item.reason}</p>
            <time className="qv-meta" dateTime={item.created_at}>
              {dateLabel(item.created_at)}
            </time>
          </article>
        ))}
      </section>
      <Link href="/support/feedback">Share optional product feedback</Link>
    </main>
  );
}
