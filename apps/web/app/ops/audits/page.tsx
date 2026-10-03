"use client";
import Link from "next/link";
import { useState } from "react";
import { AuditBanner } from "@qelvora/ui-web";
import {
  ErrorState,
  TrustSession,
  type TrustSessionState,
  dateLabel,
  useTrust,
  retryTrustReads,
} from "../trust-client";

type Audit = {
  id: string;
  case_id: string;
  action: string;
  created_at: string;
  correlation_id: string;
  queue: string;
};
export default function AccessAudits() {
  const [sessionState, setSessionState] = useState<TrustSessionState>({
    ready: false,
    error: null,
  });
  const { data, error, loading } = useTrust<{ items: Audit[] }>(
    "operations/audits",
    sessionState.ready,
  );
  return (
    <main className="trust-page" id="ops-main" tabIndex={-1}>
      <Link href="/ops">Back to cases</Link>
      <h1>Access audits</h1>
      <AuditBanner>
        Your latest 100 case access and action records. This view contains
        metadata; private evidence requires its own current case lease.
      </AuditBanner>
      {loading && <p role="status">Loading audits…</p>}
      <ErrorState error={sessionState.error ?? error} retry={retryTrustReads} />
      {data?.items.length === 0 && (
        <p>No case access has been recorded for this operations account.</p>
      )}
      {data?.items.map((item) => (
        <article className="trust-panel" key={item.id}>
          <Link href={`/ops/cases/${item.case_id}`}>
            {item.queue} · {item.action.replaceAll("_", " ")}
          </Link>
          <time dateTime={item.created_at}>{dateLabel(item.created_at)}</time>
          <span className="qv-meta">Reference {item.correlation_id}</span>
        </article>
      ))}
      <TrustSession onSessionState={setSessionState} />
    </main>
  );
}
