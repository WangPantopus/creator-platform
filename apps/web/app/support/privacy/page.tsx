"use client";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PrivacyJobView } from "../../../../backend/src/modules/trust/contracts";
import {
  ErrorState,
  TrustError,
  TrustSession,
  useTrustStatus,
  useTrust,
  useTrustSession,
  useTrustRequest,
  retryTrustReads,
  dateLabel,
} from "../../ops/trust-client";

function DownloadNotice() {
  const status = useSearchParams().get("download");
  if (!["verify", "expired", "unavailable"].includes(status ?? "")) return null;
  return (
    <div className="trust-error" role="alert">
      {status === "verify" ? (
        <>
          <p>Verify your account again to download your export.</p>
          <a href="/api/auth/continue?returnTo=%2Fsupport%2Fprivacy">
            Continue with Pantopus
          </a>
          <p>Your completed request will still be here when you return.</p>
        </>
      ) : status === "expired" ? (
        <p>This download has expired. Request a new export below.</p>
      ) : (
        <p>
          Your download is unavailable. Check your account and connection, then
          try the download from your completed request again.
        </p>
      )}
    </div>
  );
}

function Job({
  id,
  available,
  readEnabled,
  onReadError,
}: {
  id: string;
  available: boolean;
  readEnabled: boolean;
  onReadError: (id: string, error: TrustError | null) => void;
}) {
  const request = useTrustRequest();
  const sessionState = useTrustStatus();
  const { data, error, loading, refresh } = useTrust<PrivacyJobView>(
    `privacy/jobs/${id}`,
    readEnabled,
  );
  const [actionError, setError] = useState<TrustError | null>(null);
  const [busy, setBusy] = useState(false);
  const epoch = useTrustSession(() => {
    setError(null);
    setBusy(false);
  });
  useEffect(() => {
    onReadError(id, error);
    return () => onReadError(id, null);
  }, [id, error, onReadError]);
  return (
    <article className="trust-job">
      {data && available && (
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
              disabled={!available || loading || busy}
              onClick={() => void refresh()}
            >
              Check progress
            </button>
            {data.state !== "complete" && (
              <button
                className="qv-btn qv-btn--secondary"
                disabled={!available || loading || busy}
                onClick={async () => {
                  if (!available || loading || busy) return;
                  const current = epoch.current;
                  setBusy(true);
                  try {
                    await request(`privacy/jobs/${id}/retry`, {});
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
          {data.kind === "export" &&
            data.state === "complete" &&
            data.tasks.some((task) => task.receipt?.artifact) && (
              <nav aria-label="Export files">
                {data.tasks
                  .filter(
                    (task) =>
                      task.state === "complete" &&
                      task.receipt?.artifact &&
                      typeof task.receipt.artifact === "object" &&
                      "format" in task.receipt.artifact &&
                      task.receipt.artifact.format === "privacy-stream-v1",
                  )
                  .map((task) => (
                    <a
                      key={task.domain}
                      href={`/api/trust/privacy/jobs/${id}/download/${task.domain}`}
                    >
                      Download {task.domain} file
                    </a>
                  ))}
              </nav>
            )}
          <ErrorState error={sessionState.concealed ? null : actionError} />
        </>
      )}
    </article>
  );
}
export default function PrivacyPage() {
  const request = useTrustRequest();
  const sessionState = useTrustStatus();
  const capability = useTrust<{
    localDevelopment: boolean;
    actorVerification: string;
    verificationMethod?: string;
  }>("capabilities");
  // A read failure blocks actions, but must not toggle its own request gate.
  // Only the original session/capability checks enable private reads again.
  const privateReadsEnabled = sessionState.ready && !capability.error;
  const { data, error, loading, refresh } = useTrust<{
    items: PrivacyJobView[];
  }>("privacy/jobs", privateReadsEnabled);
  const [jobErrors, setJobErrors] = useState<Record<string, TrustError>>({});
  const onReadError = useCallback((id: string, error: TrustError | null) => {
    setJobErrors((current) => {
      if (current[id] === error || (!error && !current[id])) return current;
      const next = { ...current };
      if (error) next[id] = error;
      else delete next[id];
      return next;
    });
  }, []);
  const readError =
    capability.error ??
    sessionState.error ??
    error ??
    Object.values(jobErrors)[0] ??
    null;
  const readsReady = sessionState.ready && !loading && !readError;
  const verificationReady =
    readsReady &&
    !capability.loading &&
    !!capability.data &&
    !capability.error &&
    capability.data.actorVerification === "configured";
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
    setJobErrors({});
  });
  useLayoutEffect(() => {
    if (!verificationReady) dialog.current?.close();
  }, [verificationReady]);
  const run = async () => {
    if (!verificationReady || busy) return;
    const current = epoch.current;
    setBusy(true);
    setError(null);
    key.current ??= crypto.randomUUID();
    try {
      const job = await request<{ id: string; immediateDeny: boolean }>(
        "privacy/jobs",
        {
          kind,
          scope,
          proof:
            capability.data?.verificationMethod === "current_session"
              ? "CURRENT_SESSION"
              : proof,
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
      <Suspense fallback={null}>
        <DownloadNotice />
      </Suspense>
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
      <TrustSession showErrors={false} />
      {capability.data?.verificationMethod === "current_session" && (
        <p>
          <a href="/api/auth/continue?returnTo=%2Fsupport%2Fprivacy">
            Verify with Pantopus again
          </a>{" "}
          before requesting or downloading your data.
        </p>
      )}
      <ErrorState error={readError} retry={retryTrustReads} />
      {capability.loading && (
        <p className="qv-help" role="status">
          Loading…
        </p>
      )}
      <form
        hidden={sessionState.concealed}
        className="trust-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (!verificationReady || busy) return;
          if (kind === "delete") dialog.current?.showModal();
          else void run();
        }}
      >
        <label htmlFor="privacy-kind">Request</label>
        <select
          id="privacy-kind"
          disabled={capability.loading}
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
          disabled={capability.loading}
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
              disabled={capability.loading}
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
              disabled={capability.loading}
              required
              value={threadId}
              onChange={(event) => {
                setThread(event.target.value);
                key.current = null;
              }}
            />
          </>
        )}
        {capability.data &&
          capability.data.verificationMethod !== "current_session" && (
            <>
              <label htmlFor="privacy-proof">
                {capability.data?.localDevelopment
                  ? "Type LOCAL DEVELOPMENT for this synthetic account"
                  : "Account verification receipt"}
              </label>
              <input
                id="privacy-proof"
                disabled={capability.loading}
                required
                autoComplete="off"
                value={proof}
                onChange={(event) => setProof(event.target.value)}
              />
            </>
          )}
        {capability.data && !capability.data.localDevelopment && (
          <p className="qv-help">
            {capability.data?.verificationMethod === "current_session"
              ? "Your sign-in must be recent. Continue with Pantopus again if asked to verify your account."
              : "Fresh identity verification must be connected before this action is available."}
          </p>
        )}
        <button
          className="qv-btn qv-btn--secondary"
          disabled={busy || !verificationReady}
        >
          {busy
            ? "Saving…"
            : kind === "delete"
              ? "Request deletion"
              : "Request export"}
        </button>
        <ErrorState error={sessionState.concealed ? null : actionError} />
        {!sessionState.concealed && result && <p role="status">{result}</p>}
      </form>
      <section className="trust-panel">
        <h2>Request progress</h2>
        {readsReady && data?.items.length === 0 && <p>No data requests yet.</p>}
        {data?.items.map((job) => (
          <Job
            key={job.id}
            id={job.id}
            available={readsReady}
            readEnabled={privateReadsEnabled}
            onReadError={onReadError}
          />
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
            disabled={busy || !verificationReady}
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
        <ErrorState error={sessionState.concealed ? null : actionError} />
      </dialog>
    </main>
  );
}
