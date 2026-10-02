"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AuditBanner, Message, ModeList } from "@qelvora/ui-web";
import type {
  CaseDetail,
  DecisionCommand,
} from "../../../../../backend/src/modules/trust/contracts";
import {
  ErrorState,
  TrustError,
  TrustSession,
  useTrust,
  useTrustSession,
  trustApi,
  caseLabel,
  dateLabel,
} from "../../trust-client";

const choices: {
  value: DecisionCommand["resolution"];
  title: string;
  meta: string;
}[] = [
  { value: "uphold", title: "Uphold", meta: "Delivered as disclosed" },
  {
    value: "partial_refund",
    title: "Partial refund",
    meta: "Goodwill",
  },
  {
    value: "full_refund",
    title: "Full refund",
    meta: "Not delivered as promised",
  },
];
export default function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, loading, refresh } = useTrust<CaseDetail>(`cases/${id}`);
  const [purpose, setPurpose] = useState("");
  const [reason, setReason] = useState("");
  const [resolution, setResolution] =
    useState<DecisionCommand["resolution"]>("uphold");
  const [amount, setAmount] = useState("");
  const [actionError, setActionError] = useState<TrustError | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryReason, setRetryReason] = useState("");
  const retryKey = useRef<string | null>(null);
  const key = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (data && data.queue !== "disputes") setResolution("close");
  }, [data?.queue]);
  useEffect(() => {
    if (!data) return;
    const remaining = new Date(data.access_expires_at).getTime() - Date.now();
    const timer = window.setTimeout(
      () => void refresh(),
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(timer);
  }, [data?.access_expires_at, refresh]);
  const epoch = useTrustSession(() => {
    dialog.current?.close();
    setPurpose("");
    setReason("");
    setAmount("");
    setRetryReason("");
    setActionError(null);
    setBusy(false);
    key.current = null;
    retryKey.current = null;
  });
  const confirm = async () => {
    if (!data) return;
    const current = epoch.current;
    setBusy(true);
    setActionError(null);
    key.current ??= crypto.randomUUID();
    try {
      await trustApi(`cases/${id}/decisions`, {
        version: data.version,
        resolution,
        reason,
        ...(resolution === "partial_refund"
          ? { amountMinor: Number(amount) }
          : {}),
        idempotencyKey: key.current,
      });
      if (epoch.current !== current) return;
      dialog.current?.close();
      key.current = null;
      await refresh();
    } catch (error) {
      if (epoch.current !== current) return;
      setActionError(
        error instanceof TrustError
          ? error
          : new TrustError("Reconnect and retry the same action.", "offline"),
      );
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  const reset = () => {
    key.current = null;
  };
  const recover = async () => {
    if (!data) return;
    const current = epoch.current;
    setBusy(true);
    setActionError(null);
    retryKey.current ??= crypto.randomUUID();
    try {
      await trustApi(`cases/${id}/effects/retry`, {
        version: data.version,
        reason: retryReason,
        idempotencyKey: retryKey.current,
      });
      if (epoch.current !== current) return;
      retryKey.current = null;
      setRetryReason("");
      await refresh();
    } catch (error) {
      if (epoch.current !== current) return;
      setActionError(
        error instanceof TrustError
          ? error
          : new TrustError(
              "Reconnect and retry the same recovery action.",
              "offline",
            ),
      );
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  const caseChoices =
    data?.queue === "disputes"
      ? choices
      : [
          {
            value: "close" as const,
            title: "Close case",
            meta: "Reasoned review complete",
          },
          {
            value: "pause_creator" as const,
            title: "Pause creator",
            meta: "Supervisor · needs agent acknowledgment",
          },
          {
            value: "revoke_license" as const,
            title: "Revoke license",
            meta: "Supervisor · needs license acknowledgment",
          },
          {
            value: "suspend_account" as const,
            title: "Suspend account",
            meta: "Supervisor · needs identity acknowledgment",
          },
          ...(data?.queue === "verification"
            ? [
                {
                  value: "verify_creator" as const,
                  title: "Approve verification",
                  meta: "Supervisor · needs identity acknowledgment",
                },
                {
                  value: "reject_verification" as const,
                  title: "Reject verification",
                  meta: "Supervisor · needs identity acknowledgment",
                },
              ]
            : []),
        ];
  const sold = data?.evidence.find((item) => item.mode);
  const delivered = data?.evidence.find(
    (item) => item.author_kind && item.author_kind !== "fan",
  );
  const authorLabels = {
    ai: "AI",
    approved_draft: "Prepared by AI · approved by creator",
    human_creator: "Written by creator",
    team: "Written by team",
    fan: "Written by fan",
    system: "System record",
  };
  return (
    <div className="ops-shell ops-case">
      <main className="ops-case-body" id="ops-main" tabIndex={-1}>
        <Link className="qv-link-btn" href="/ops">
          Back to cases
        </Link>
        <TrustSession />
        {loading && <p role="status">Loading case…</p>}
        {!data && (
          <>
            <h1>Open this case</h1>
            <AuditBanner>
              Opening this case is logged. Access is limited to its evidence and
              lasts at most 15 minutes.
            </AuditBanner>
            <ErrorState error={error} retry={() => void refresh()} />
            <form
              className="ops-resolution"
              onSubmit={async (event) => {
                event.preventDefault();
                const current = epoch.current;
                setBusy(true);
                setActionError(null);
                try {
                  await trustApi(`cases/${id}/access`, {
                    purpose,
                    minutes: 15,
                  });
                  if (epoch.current !== current) return;
                  await refresh();
                } catch (error) {
                  if (epoch.current !== current) return;
                  setActionError(
                    error instanceof TrustError
                      ? error
                      : new TrustError("This case is unavailable.", "offline"),
                  );
                } finally {
                  if (epoch.current === current) setBusy(false);
                }
              }}
            >
              <label className="qv-field__label" htmlFor="purpose">
                Purpose of access
              </label>
              <textarea
                id="purpose"
                required
                minLength={12}
                maxLength={2000}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                rows={3}
              />
              <button className="qv-btn qv-btn--secondary" disabled={busy}>
                Open case for 15 minutes
              </button>
              <ErrorState error={actionError} />
            </form>
          </>
        )}
        {data && (
          <>
            <span className="qv-meta">
              {caseLabel(data.number)}
              {data.request_id ? ` · ${data.request_id}` : ""} ·{" "}
              {data.creator_name ?? "Support"}
            </span>
            <h1>{data.reason}</h1>
            <AuditBanner>
              Opening this case is logged. You see only its reported evidence.
              Packet and delivery records, when supplied, are kept 12 months for
              disputes.
            </AuditBanner>
            {data.evidence.map((evidence) => (
              <div key={evidence.id}>
                {evidence.text &&
                evidence.author_kind &&
                [
                  "ai",
                  "approved_draft",
                  "human_creator",
                  "team",
                  "fan",
                ].includes(evidence.author_kind) ? (
                  <Message
                    actions={false}
                    kind={
                      evidence.author_kind as
                        | "ai"
                        | "approved_draft"
                        | "human_creator"
                        | "team"
                        | "fan"
                    }
                    name={
                      evidence.creator_name ?? data.creator_name ?? "Creator"
                    }
                    time={
                      evidence.created_at
                        ? dateLabel(evidence.created_at)
                        : undefined
                    }
                  >
                    {evidence.text}
                  </Message>
                ) : (
                  <p>{evidence.text ?? evidence.category}</p>
                )}
              </div>
            ))}
            {data.evidence.length === 0 && (
              <p className="ops-description">
                No private conversation was shared with this case.
              </p>
            )}
            <dl className="ops-details">
              {data.queue === "disputes" && (
                <>
                  <dt className="qv-meta">MODE SOLD</dt>
                  <dd>
                    {sold?.mode_title ??
                      sold?.mode ??
                      "Request snapshot unavailable"}
                  </dd>
                  <dt className="qv-meta">DELIVERED AS</dt>
                  <dd>
                    {delivered?.author_kind
                      ? authorLabels[delivered.author_kind]
                      : "No delivery evidence"}
                    {delivered?.signed_act_id
                      ? ` · signed${delivered.signed_at ? ` ${dateLabel(delivered.signed_at)}` : ""}`
                      : ""}
                  </dd>
                  <dt className="qv-meta">FAN SAW</dt>
                  <dd>
                    {sold?.disclosure ?? "Checkout disclosure unavailable"}
                  </dd>
                </>
              )}
              <dt className="qv-meta">CASE STATE</dt>
              <dd>{data.state.replaceAll("_", " ")}</dd>
              {data.queue !== "disputes" && (
                <>
                  <dt className="qv-meta">REPORTED AUTHOR</dt>
                  <dd>
                    {delivered?.author_kind
                      ? authorLabels[delivered.author_kind]
                      : "No message evidence"}
                  </dd>
                </>
              )}
              <dt className="qv-meta">ACCESS ENDS</dt>
              <dd>{dateLabel(data.access_expires_at)}</dd>
              {data.resolution_reason && (
                <>
                  <dt className="qv-meta">REASON SENT</dt>
                  <dd>{data.resolution_reason}</dd>
                </>
              )}
              {data.effects.map((effect) => (
                <div style={{ display: "contents" }} key={effect.id}>
                  <dt className="qv-meta">
                    {effect.type.replaceAll(".", " · ")}
                  </dt>
                  <dd>
                    {effect.state}
                    {effect.error_code
                      ? ` · ${effect.error_code.replaceAll("_", " ")}`
                      : ""}
                  </dd>
                </div>
              ))}
            </dl>
            <h2 className="qv-field__label">Evidence timeline</h2>
            <ul className="ops-timeline">
              {data.timeline.map((event) => (
                <li key={event.id}>
                  <time className="qv-meta" dateTime={event.created_at}>
                    {dateLabel(event.created_at)}
                  </time>
                  <p>{event.type.replaceAll("_", " ")}</p>
                  {event.reason && <p>{event.reason}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
      {data && (
        <aside className="ops-resolution">
          <span className="qv-meta">RESOLVE</span>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              dialog.current?.showModal();
            }}
            style={{ display: "contents" }}
          >
            <div
              onChange={(event) => {
                const input = event.target;
                if (
                  !(input instanceof HTMLInputElement) ||
                  input.type !== "radio"
                )
                  return;
                const index = Number(input.id.replace("resolution-", ""));
                const selected = caseChoices[index];
                if (selected) {
                  setResolution(selected.value);
                  reset();
                }
              }}
            >
              <ModeList
                group="resolution"
                legend="Resolution"
                modes={caseChoices.map((choice) => ({
                  title: choice.title,
                  meta: choice.meta,
                  selected: resolution === choice.value,
                  disabled: busy || !data.can_decide,
                  ...(choice.value === "uphold" ? { price: "0" } : {}),
                }))}
              />
            </div>
            {resolution === "partial_refund" && (
              <>
                <label htmlFor="refund-amount">
                  Refund amount · minor units
                </label>
                <input
                  id="refund-amount"
                  type="number"
                  min="1"
                  required
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    reset();
                  }}
                />
              </>
            )}
            <label htmlFor="decision-reason" className="qv-field__label">
              Reason sent to both
            </label>
            <textarea
              id="decision-reason"
              rows={3}
              required
              minLength={12}
              maxLength={2000}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                reset();
              }}
            />
            <button
              className="qv-btn qv-btn--secondary qv-btn--block"
              disabled={busy || !data.can_decide}
            >
              Resolve and notify both
            </button>
            {!data.can_decide && (
              <p className="qv-help">
                This case already has a decision, or its appeal needs a
                different reviewer.
              </p>
            )}
            <ErrorState error={actionError} />
          </form>
          {data.state === "action_pending" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void recover();
              }}
            >
              <label className="qv-field__label" htmlFor="retry-reason">
                Action recovery · supervisor
              </label>
              <p className="qv-help">
                Check the owning domain's receipt and current state before
                retrying. The original effect ID and decision are preserved.
              </p>
              <textarea
                id="retry-reason"
                rows={3}
                required
                minLength={12}
                maxLength={2000}
                value={retryReason}
                onChange={(event) => {
                  setRetryReason(event.target.value);
                  retryKey.current = null;
                }}
              />
              <button className="qv-btn qv-btn--secondary" disabled={busy}>
                Retry pending action
              </button>
            </form>
          )}
        </aside>
      )}
      <dialog className="trust-dialog" ref={dialog}>
        <h2>Record this decision?</h2>
        <p>{reason}</p>
        <p>
          External refunds, account changes and license actions remain pending
          until the owning domain confirms them. Both parties receive the reason
          in their trust inbox.
        </p>
        <div className="actions">
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? "Recording…" : "Record and notify"}
          </button>
          <button
            className="qv-btn qv-btn--quiet"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Keep reviewing
          </button>
        </div>
        <ErrorState error={actionError} />
      </dialog>
    </div>
  );
}
