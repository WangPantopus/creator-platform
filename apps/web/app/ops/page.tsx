"use client";
import { useState } from "react";
import Link from "next/link";
import { brand } from "@qelvora/brand";
import type {
  CaseSummary,
  QueueName,
} from "../../../backend/src/modules/trust/contracts";
import {
  ErrorState,
  TrustSession,
  useTrust,
  caseLabel,
  openedLabel,
} from "./trust-client";

const navigation: [QueueName, string][] = [
  ["safety", "Safety cases"],
  ["disputes", "Disputes"],
  ["verification", "Verification review"],
  ["pauses", "Pauses and suspensions"],
];
const category: Record<string, string> = {
  ai_report: "Report: AI reply",
  crisis: "Crisis help request",
  abuse: "Abuse report",
  dispute: "Dispute",
  verification: "Verification review",
  pause: "Pause or suspension",
  support: "Support request",
  reply_review: "Private Note reply review",
};
const stateLabel: Record<string, string> = {
  open: "Open",
  urgent: "Urgent",
  reviewing: "In review",
  waiting: "Waiting",
  action_pending: "Action pending",
  resolved: "Reviewed",
  appealed: "Appealed",
};
export default function QueuePage() {
  const [queue, setQueue] = useState<QueueName>("safety");
  const [number, setNumber] = useState("");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, error, loading, refresh } = useTrust<{
    items: CaseSummary[];
    counts: Partial<Record<QueueName, number>>;
    nextCursor: string | null;
  }>(
    `cases?queue=${queue}${search ? `&number=${search}` : ""}${cursor ? `&cursor=${cursor}` : ""}`,
  );
  return (
    <div className="ops-shell ops-queue">
      <nav className="ops-nav" aria-label="Ops">
        <span className="ops-brand">{brand.name} Ops</span>
        {navigation.map(([key, label]) => (
          <a
            key={key}
            href={`#${key}`}
            aria-current={key === queue ? "page" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setQueue(key);
              setCursor(null);
              setSearch("");
            }}
          >
            {label}
            <span>{data?.counts[key] ?? ""}</span>
          </a>
        ))}
        <Link href="/ops/audits">Access audits</Link>
        <a
          href="#support"
          aria-current={queue === "support" ? "page" : undefined}
          onClick={(event) => {
            event.preventDefault();
            setQueue("support");
            setCursor(null);
            setSearch("");
          }}
        >
          Support requests<span>{data?.counts.support ?? ""}</span>
        </a>
        <Link href="/ops/metrics">Service metrics</Link>
        <Link href="/status">Service status</Link>
        <TrustSession />
      </nav>
      <main className="ops-main" id="ops-main" tabIndex={-1}>
        <h1>
          {queue === "support"
            ? "Support requests"
            : navigation.find(([key]) => key === queue)?.[1]}
        </h1>
        <p className="ops-description">
          Every case you open is logged. Fan message text appears only inside a
          case, never in lists or alerts.
        </p>
        <ErrorState error={error} retry={() => void refresh()} />
        {loading && <p role="status">Loading cases…</p>}
        {data && (
          <>
            <div className="ops-table">
              <div className="qv-meta ops-table-head">
                <span>CASE</span>
                <span>CATEGORY</span>
                <span>CREATOR</span>
                <span>OPENED</span>
                <span>STATE</span>
              </div>
              {data.items.map((item) => (
                <Link
                  className="ops-row"
                  key={item.id}
                  href={`/ops/cases/${item.id}`}
                >
                  <span className="qv-mono">{caseLabel(item.number)}</span>
                  <span>{category[item.kind]}</span>
                  <span>{item.creator_name ?? "—"}</span>
                  <time className="qv-meta" dateTime={item.created_at}>
                    {openedLabel(item.created_at)}
                  </time>
                  <span
                    className={`ops-state ${item.state === "urgent" ? "urgent" : ["resolved", "waiting"].includes(item.state) ? "muted" : ""}`}
                  >
                    {stateLabel[item.state]}
                  </span>
                </Link>
              ))}
              {data.items.length === 0 && (
                <p
                  className="ops-description"
                  style={{ padding: "var(--space-5)" }}
                >
                  No cases in this queue.
                </p>
              )}
            </div>
            <form
              className="ops-search"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(number);
                setCursor(null);
              }}
            >
              <label htmlFor="case-number">Case number</label>
              <input
                id="case-number"
                type="number"
                min="1"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
              <button className="qv-btn qv-btn--secondary">Find case</button>
              <button
                className="qv-link-btn"
                type="button"
                onClick={() => {
                  setSearch("");
                  setNumber("");
                  setCursor(null);
                }}
              >
                All cases
              </button>
            </form>
            {data.nextCursor && (
              <button
                className="qv-btn qv-btn--secondary"
                onClick={() => setCursor(data.nextCursor)}
              >
                Older cases
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
