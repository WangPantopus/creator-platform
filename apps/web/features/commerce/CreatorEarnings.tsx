"use client";
import { useState } from "react";
import type { commerceContracts } from "@qelvora/api";

export function CreatorEarnings({
  summary,
  money,
  loadLedger,
}: {
  summary: commerceContracts.CreatorEarnings | null;
  money: (amount: string, currency: string) => string;
  loadLedger: (
    currency: string,
    cursor?: string,
  ) => Promise<commerceContracts.CreatorLedgerPage>;
}) {
  const [currency, setCurrency] = useState<string | null>(null);
  const [page, setPage] = useState<commerceContracts.CreatorLedgerPage | null>(
    null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [olderPage, setOlderPage] = useState(false);
  if (!summary)
    return (
      <section className="commerce-empty">
        <h2>Earnings information unavailable</h2>
        <p>Refresh to confirm your current recorded amounts.</p>
      </section>
    );
  const totals =
    summary.currencies.find((c) => c.currency === currency) ??
    summary.currencies[0];
  const history = page ?? summary.ledger;
  async function load(currency: string, cursor?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      setPage(await loadLedger(currency, cursor));
      setCurrency(currency);
      setOlderPage(Boolean(cursor));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The connection is unavailable. Your ledger page has been kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="commerce-help">
        Confirmed records · all time. Pending payments and transfers remain
        processing.
      </p>
      {summary.currencies.length > 1 && (
        <label className="commerce-field">
          Currency
          <select
            value={totals?.currency}
            disabled={busy}
            onChange={(e) => void load(e.target.value)}
          >
            {summary.currencies.map((c) => (
              <option key={c.currency} value={c.currency}>
                {c.currency}
              </option>
            ))}
          </select>
        </label>
      )}
      {totals ? (
        <>
          <div className="commerce-stats">
            {[
              ["Requests captured", totals.requestMinor],
              ["Memberships captured", totals.membershipMinor],
              ["All captured", totals.capturedMinor],
              ["Refunds recorded", totals.refundedMinor],
              ["Transferred cash", totals.transferredMinor],
              ["Reversed cash", totals.reversedMinor],
            ].map(([label, amount]) => (
              <section className="commerce-card" key={label}>
                <h2>{label}</h2>
                <span className="commerce-money">
                  {amount === null
                    ? "Processing"
                    : money(amount!, totals.currency)}
                </span>
              </section>
            ))}
          </div>
          {totals.pendingPayouts > 0 && (
            <p role="status" className="commerce-help">
              {totals.pendingPayouts} payout{" "}
              {totals.pendingPayouts === 1 ? "action is" : "actions are"}{" "}
              processing. Confirmed reversals remain in your history.
            </p>
          )}
        </>
      ) : (
        <section className="commerce-empty">
          <h2>No recorded earnings yet</h2>
          <p>Amounts appear after confirmed provider activity.</p>
        </section>
      )}
      <h2>
        {olderPage ? "Older ledger entries" : "Recent ledger entries"} ·{" "}
        {history.currency}
      </h2>
      <p className="commerce-help">
        Up to 100 entries per page. The totals above include your complete
        recorded history. Pass pool cash has its own earnings view.
      </p>
      {history.entries.map((l) => (
        <div className="commerce-ledger-row" key={l.id}>
          <span className="qv-meta">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeZone: "UTC",
            }).format(new Date(l.createdAt))}
          </span>
          <span>{l.kind.replaceAll("_", " ")}</span>
          <span>{money(l.amount, l.currency)}</span>
          <span>
            {l.packetId ? `REQ-${l.packetId.slice(0, 8).toUpperCase()}` : "—"}
          </span>
        </div>
      ))}
      {!history.entries.length && <p>No ledger entries yet.</p>}
      {error && <p role="alert">{error}</p>}
      <div className="commerce-actions">
        {olderPage && (
          <button
            type="button"
            className="commerce-refresh"
            disabled={busy}
            onClick={() => void load(history.currency)}
          >
            Latest entries
          </button>
        )}
        {history.nextCursor && (
          <button
            type="button"
            className="commerce-refresh"
            disabled={busy}
            onClick={() => void load(history.currency, history.nextCursor!)}
          >
            {busy ? "Loading older entries…" : "Older entries"}
          </button>
        )}
      </div>
    </>
  );
}
