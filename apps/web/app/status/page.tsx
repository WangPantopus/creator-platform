"use client";
import Link from "next/link";
import { ErrorState, useTrust, dateLabel } from "../ops/trust-client";
import "../ops/trust.css";
export default function StatusPage() {
  const { data, error, refresh } = useTrust<{
    ready: boolean;
    environment: string;
    release: string;
    capabilities: {
      name: string;
      state: string;
      code: string;
      checkedAt: string;
    }[];
    incidents: {
      id: string;
      component: string;
      state: string;
      public_message: string;
      updated_at: string;
    }[];
  }>("status");
  return (
    <main className="trust-page">
      <nav>
        <Link href="/trust">Trust and help</Link>
        <Link href="/support">Support</Link>
      </nav>
      <h1>Service status</h1>
      <p>
        Process health and usable capabilities are measured separately.
        Availability targets are not a claim of measured production readiness.
      </p>
      <ErrorState error={error} retry={() => void refresh()} />
      {data && (
        <>
          <section className="trust-panel">
            <h2>
              {data.ready
                ? "Required capabilities available"
                : "Some required capabilities are unavailable"}
            </h2>
            <p className="qv-meta">
              {data.environment} · {data.release}
            </p>
            {data.capabilities.map((capability) => (
              <article className="trust-job" key={capability.name}>
                <p>
                  {capability.name.replaceAll("_", " ")} · {capability.state}
                </p>
                <p className="qv-help">
                  {capability.code.replaceAll("_", " ")} · checked{" "}
                  {dateLabel(capability.checkedAt)}
                </p>
              </article>
            ))}
          </section>
          <section className="trust-panel">
            <h2>Incidents</h2>
            {data.incidents.length === 0 && (
              <p>
                No published incidents. This does not establish production
                availability.
              </p>
            )}
            {data.incidents.map((incident) => (
              <article className="trust-job" key={incident.id}>
                <p>
                  {incident.component} · {incident.state}
                </p>
                <p>{incident.public_message}</p>
              </article>
            ))}
          </section>
        </>
      )}
      <button
        className="qv-btn qv-btn--secondary"
        onClick={() => void refresh()}
      >
        Check again
      </button>
    </main>
  );
}
