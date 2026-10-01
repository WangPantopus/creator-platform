"use client";
import { useState } from "react";
import type { commerceContracts } from "@qelvora/api";

const cycleName = (cycle: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${cycle}-01T00:00:00Z`));
const utcDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
function slotDays(seconds: string) {
  const value = BigInt(seconds);
  return `${value / 86400n}.${((value % 86400n) * 10n) / 86400n}`;
}

export function PoolEarnings({
  summary,
  money,
}: {
  summary?: commerceContracts.PoolEarnings;
  money: (amount: string, currency: string) => string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!summary)
    return (
      <section className="commerce-empty">
        <h2>Pool information unavailable</h2>
        <p>Refresh to confirm your current pool records.</p>
      </section>
    );
  const cycle = summary.postedCycles.find((c) => c.cycle === selected);
  return (
    <>
      <div className="commerce-pool-intro">
        <span className="qv-meta">
          EARNINGS · PASS POOL ·{" "}
          {cycleName(cycle?.cycle ?? summary.cycle).toUpperCase()} CYCLE
        </span>
        <h1>
          {cycle
            ? `Your pool share for ${cycleName(cycle.cycle)}`
            : `You're in ${summary.fanCount} ${summary.fanCount === 1 ? "fan's pass" : "fans' passes"} this cycle`}
        </h1>
      </div>
      {summary.postedCycles.length > 0 && (
        <label className="commerce-field">
          Cycle
          <select
            value={cycle?.cycle ?? summary.cycle}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value={summary.cycle}>
              {cycleName(summary.cycle)} · current
            </option>
            {summary.postedCycles.map((c) => (
              <option key={c.cycle} value={c.cycle}>
                {cycleName(c.cycle)} · posted
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="commerce-stats commerce-pool-stats">
        <section className="commerce-card">
          <span className="qv-meta">SLOTS</span>
          <span className="commerce-money">
            {cycle ? slotDays(cycle.slotSeconds) : summary.slotCount}
          </span>
          <p className="commerce-help">
            {cycle
              ? "slot days · pro-rated by time held"
              : "recorded active slots · pro-rated by days in the cycle"}
          </p>
        </section>
        <section className="commerce-card">
          <span className="qv-meta">YOUR SHARE</span>
          <span className="commerce-money">
            {cycle
              ? money(cycle.allocationMinor, cycle.currency)
              : "Awaiting close"}
          </span>
          <p className="commerce-help">in-app only, never in a push</p>
        </section>
        <section className="commerce-card">
          <span className="qv-meta">POSTED</span>
          <span className="commerce-money">
            {cycle
              ? utcDate(cycle.postedAt)
              : `After ${utcDate(summary.closesAt)}`}
          </span>
          <p className="commerce-help">
            {cycle
              ? "with the cycle’s confirmed breakdown"
              : "after the cycle closes and funding is confirmed"}
          </p>
        </section>
      </div>
      <p className="commerce-help">
        The pool splits by slots held, not by messages sent. Nothing in the
        product rewards keeping fans talking longer.
      </p>
      {cycle ? (
        <section className="commerce-card">
          <h2>Cycle breakdown</h2>
          <dl className="commerce-rows">
            <dt>Allocated share</dt>
            <dd>{money(cycle.allocationMinor, cycle.currency)}</dd>
            <dt>Recorded transferred cash</dt>
            <dd>
              {cycle.transferredMinor === null
                ? "Processing"
                : money(cycle.transferredMinor, cycle.currency)}
            </dd>
            <dt>Recorded reversed cash</dt>
            <dd>
              {cycle.reversedMinor === null
                ? "Processing"
                : money(cycle.reversedMinor, cycle.currency)}
            </dd>
            <dt>Transfer actions processing</dt>
            <dd>{cycle.pendingEffects}</dd>
          </dl>
          <p className="commerce-help">
            Transfers can remain held while funding or payout account details
            are reviewed. Reversed cash stays in this history.
          </p>
        </section>
      ) : (
        <p className="commerce-help">
          Active slots come from your current pass records. Your final
          allocation uses confirmed eligible funding and slot time after the UTC
          calendar cycle closes.
        </p>
      )}
      {summary.historyLimited && (
        <p className="commerce-help">
          Showing the latest 12 posted cycles. Earlier cycles remain in your
          financial history.
        </p>
      )}
    </>
  );
}
