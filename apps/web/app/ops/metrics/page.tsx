"use client";
import Link from "next/link";
import { ErrorState, TrustSession, useTrust } from "../trust-client";

type Metrics = {
  environment: string;
  release: string;
  startedAt: string;
  uptimeSeconds: number;
  memoryBytes: { rss: number; heapUsed: number };
  eventLoopLagMs: { p95: number; p99: number };
  signals: Record<string, number>;
  http: Record<string, { count: number; sum: number; buckets: number[] }>;
};
export default function MetricsPage() {
  const { data, error, loading, refresh } =
    useTrust<Metrics>("operations/metrics");
  return (
    <main className="trust-page" id="ops-main" tabIndex={-1}>
      <Link href="/ops">Back to cases</Link>
      <h1>Trust service metrics</h1>
      <p>
        Supervisor snapshot of the current process and worker. Message,
        generation, payment, call, voice and notification collectors must be
        connected before their reliability or cost can be assessed.
      </p>
      {loading && <p role="status">Loading metrics…</p>}
      <ErrorState error={error} retry={() => void refresh()} />
      {data && (
        <>
          <section className="trust-panel">
            <h2>Runtime</h2>
            <p>
              {data.environment} · {data.release}
            </p>
            <p>
              Started {new Date(data.startedAt).toLocaleString()} · uptime{" "}
              {Math.floor(data.uptimeSeconds)} seconds
            </p>
            <p>
              Resident memory {(data.memoryBytes.rss / 1048576).toFixed(1)} MiB
              · heap used {(data.memoryBytes.heapUsed / 1048576).toFixed(1)} MiB
            </p>
            <p>
              Event loop lag: p95 {data.eventLoopLagMs.p95.toFixed(1)} ms · p99{" "}
              {data.eventLoopLagMs.p99.toFixed(1)} ms
            </p>
          </section>
          <section className="trust-panel">
            <h2>Worker signals</h2>
            {Object.entries(data.signals).map(([name, value]) => (
              <p key={name}>
                {name.replaceAll("_", " ")}:{" "}
                <span className="qv-mono">{value.toFixed(2)}</span>
              </p>
            ))}
            {Object.keys(data.signals).length === 0 && (
              <p>No worker sample is available yet.</p>
            )}
          </section>
          <section className="trust-panel">
            <h2>HTTP requests</h2>
            <p>
              Cumulative counts since this process started. Durations include
              request handling; these are not provider or visible-sentence
              latency measurements.
            </p>
            {Object.entries(data.http).map(([name, value]) => (
              <p key={name}>
                <span className="qv-mono">{name}</span> · {value.count} requests
                · mean {(value.sum / value.count).toFixed(1)} ms
              </p>
            ))}
          </section>
        </>
      )}
      <button
        className="qv-btn qv-btn--secondary"
        disabled={loading}
        onClick={() => void refresh()}
      >
        Refresh snapshot
      </button>
      <TrustSession />
    </main>
  );
}
