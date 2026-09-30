"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import type { PrivacyJobView } from "../../../../backend/src/modules/trust/contracts";
import {
  ErrorState,
  TrustError,
  TrustSession,
  useTrust,
  useTrustSession,
  trustApi,
  dateLabel,
} from "../../ops/trust-client";

function Job({ id }: { id: string }) {
  const { data, error, refresh } = useTrust<PrivacyJobView>(
    `privacy/jobs/${id}`,
  );
  const [actionError, setError] = useState<TrustError | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useTrustSession(() => {
    setError(null);
    setBusy(false);
  });
  return (
    <article className="trust-job">
      <ErrorState error={error} retry={() => void refresh()} />
      {data && (
        <>
          <p className="qv-mono">
            {data.kind} · {data.state}
          </p>
          <p className="qv-help">Started {dateLabel(data.created_at)}</p>
          <dl>
            {data.tasks.map((task) => (
              <div key={task.domain} style={{ display: "contents" }}>
                <dt>{task.domain}</dt>
                <dd>
                  {task.state}
                  {task.error_code
                    ? ` · ${task.error_code.replaceAll("_", " ")}`
                    : ""}
                </dd>
              </div>
            ))}
          </dl>
          {data.retained.map((record) => (
            <p className="qv-help" key={record.category}>
              {record.category.replaceAll("_", " ")}: {record.reason}
              {record.until ? ` Until ${dateLabel(record.until)}.` : ""}
            </p>
          ))}
          <div className="ops-search">
            <button
              className="qv-btn qv-btn--secondary"
              onClick={() => void refresh()}
            >
              Check progress
            </button>
            {data.state !== "complete" && (
              <button
                className="qv-btn qv-btn--secondary"
                disabled={busy}
                onClick={async () => {
                  const current = epoch.current;
                  setBusy(true);
                  try {
                    await trustApi(`privacy/jobs/${id}/retry`, {});
                    if (epoch.current !== current) return;
                    setError(null);
                    await refresh();
                  } catch (error) {
                    if (epoch.current !== current) return;
                    setError(
                      error instanceof TrustError
                        ? error
                        : new TrustError("Retry unavailable.", "offline"),
                    );
                  } finally {
                    if (epoch.current === current) setBusy(false);
                  }
                }}
              >
                Retry pending domains
              </button>
            )}
            {data.kind === "export" && data.state === "complete" && (
              <a
                className="qv-btn qv-btn--secondary"
                href={`/api/trust/privacy/jobs/${id}/download`}
              >
                Download export
              </a>
            )}
          </div>
          <ErrorState error={actionError} />
        </>
      )}
    </article>
  );
}
export default function PrivacyPage() {
  const { data, error, refresh } = useTrust<{ items: PrivacyJobView[] }>(
    "privacy/jobs",
  );
  const capability = useTrust<{
    localDevelopment: boolean;
    actorVerification: string;
  }>("capabilities");
  const [kind, setKind] = useState("export");
  const [scope, setScope] = useState("account");
  const [creatorId, setCreator] = useState("");
  const [threadId, setThread] = useState("");
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setError] = useState<TrustError | null>(null);
  const [result, setResult] = useState("");
  const key = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const epoch = useTrustSession(() => {
    dialog.current?.close();
    setKind("export");
    setScope("account");
    setCreator("");
    setThread("");
    setProof("");
    setBusy(false);
    setError(null);
    setResult("");
    key.current = null;
  });
  const run = async () => {
    const current = epoch.current;
    setBusy(true);
    setError(null);
    key.current ??= crypto.randomUUID();
    try {
      const job = await trustApi<{ id: string; immediateDeny: boolean }>(
        "privacy/jobs",
        {
          kind,
          scope,
          proof,
          ...(scope !== "account" ? { creatorId } : {}),
          ...(scope === "thread" ? { threadId } : {}),
          idempotencyKey: key.current,
        },
      );
      if (epoch.current !== current) return;
      setResult(
        job.immediateDeny
          ? "Your deletion request is saved and its scope is denied now. Purge is complete only when every domain acknowledges it."
          : "Your export request is saved. Its download becomes available after every domain finishes.",
      );
      dialog.current?.close();
      key.current = null;
      await refresh();
    } catch (error) {
      if (epoch.current !== current) return;
      setError(
        error instanceof TrustError
          ? error
          : new TrustError(
              "Reconnect and retry the same data request.",
              "offline",
            ),
      );
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  return (
    <main className="trust-page">
      <nav>
        <Link href="/support">Support</Link>
        <Link href="/trust">Trust and help</Link>
      </nav>
      <h1>Export or delete your data</h1>
      <p>
        Deleting a conversation removes its memory and prevents future use.
        Packet disclosure and delivery records may remain for 12 months for
        disputes. Account deletion keeps only legally required ledger records;
        the shared-account boundary and legal retention configuration require
        review before public use.
      </p>
      <p>
        Store billing cancellation and data deletion are separate. Deleting an
        account does not cancel an Apple or Google subscription. You can cancel
        through your store’s subscription settings before or after requesting
        deletion.
      </p>
      <nav aria-label="Subscription management">
        <a href="https://apps.apple.com/account/subscriptions">
          Apple subscriptions
        </a>
        <a href="https://play.google.com/store/account/subscriptions">
          Google Play subscriptions
        </a>
      </nav>
      <TrustSession />
      <ErrorState error={error} retry={() => void refresh()} />
      <form
        className="trust-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (kind === "delete") dialog.current?.showModal();
          else void run();
        }}
      >
        <label htmlFor="privacy-kind">Request</label>
        <select
          id="privacy-kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            key.current = null;
          }}
        >
          <option value="export">Export my data</option>
          <option value="delete">Delete my data</option>
        </select>
        <label htmlFor="privacy-scope">Scope</label>
        <select
          id="privacy-scope"
          value={scope}
          onChange={(event) => {
            setScope(event.target.value);
            key.current = null;
          }}
        >
          <option value="account">Creator product account data</option>
          <option value="creator">One creator relationship</option>
          <option value="thread">One conversation</option>
        </select>
        {scope !== "account" && (
          <>
            <label htmlFor="privacy-creator">Creator reference</label>
            <input
              id="privacy-creator"
              required
              value={creatorId}
              onChange={(event) => {
                setCreator(event.target.value);
                key.current = null;
              }}
            />
          </>
        )}
        {scope === "thread" && (
          <>
            <label htmlFor="privacy-thread">Conversation reference</label>
            <input
              id="privacy-thread"
              required
              value={threadId}
              onChange={(event) => {
                setThread(event.target.value);
                key.current = null;
              }}
            />
          </>
        )}
        <label htmlFor="privacy-proof">
          {capability.data?.localDevelopment
            ? "Type LOCAL DEVELOPMENT for this synthetic account"
            : "Account verification receipt"}
        </label>
        <input
          id="privacy-proof"
          required
          autoComplete="off"
          value={proof}
          onChange={(event) => setProof(event.target.value)}
        />
        {!capability.data?.localDevelopment && (
          <p className="qv-help">
            Fresh identity verification must be connected before this action is
            available.
          </p>
        )}
        <button
          className="qv-btn qv-btn--secondary"
          disabled={
            busy || capability.data?.actorVerification === "unavailable"
          }
        >
          {busy
            ? "Saving…"
            : kind === "delete"
              ? "Request deletion"
              : "Request export"}
        </button>
        <ErrorState error={actionError} />
        {result && <p role="status">{result}</p>}
      </form>
      <section className="trust-panel">
        <h2>Request progress</h2>
        {data?.items.length === 0 && <p>No data requests yet.</p>}
        {data?.items.map((job) => (
          <Job key={job.id} id={job.id} />
        ))}
      </section>
      <dialog className="trust-dialog" ref={dialog}>
        <h2>Delete this data?</h2>
        <p>
          Access to this scope is denied immediately. Each domain must finish
          its purge before the request is complete. Packet and delivery dispute
          records may retain their original 12-month expiry; required ledger
          retention needs reviewed configuration. Backup restoration must apply
          the tombstone before reopening access.
        </p>
        <p>
          This does not cancel store billing or silently close your shared
          Pantopus account.
        </p>
        <div className="actions">
          <button
            className="qv-btn qv-btn--secondary"
            disabled={busy}
            onClick={() => void run()}
          >
            Request deletion
          </button>
          <button
            className="qv-btn qv-btn--quiet"
            disabled={busy}
            onClick={() => dialog.current?.close()}
          >
            Keep my data
          </button>
        </div>
        <ErrorState error={actionError} />
      </dialog>
    </main>
  );
}
