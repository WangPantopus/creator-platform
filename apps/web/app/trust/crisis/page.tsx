"use client";
import Link from "next/link";
import { ErrorState, useTrust } from "../../ops/trust-client";
import "../../ops/trust.css";
export default function CrisisPage() {
  const { data, error, refresh } = useTrust<{
    protocolVersion: string;
    resources: { region: string; name: string; url: string; phone?: string }[];
    emergencyMessage: string;
  }>("help");
  return (
    <main className="trust-page">
      <Link href="/trust">Trust and help</Link>
      <h1>Crisis help protocol</h1>
      <p>
        If you are in immediate danger, contact local emergency services. An AI
        cannot provide emergency help. This product may be unsuitable for
        minors; access is limited to adults aged 18 and over.
      </p>
      <section className="trust-panel">
        <h2>What happens</h2>
        <p>
          The safety pipeline can withhold unsafe output, provide configured
          help resources and create a scoped case for human review. A report can
          be made without an active grant. Crisis handling never offers paid
          creator access.
        </p>
        <p>
          Urgent cases go to the safety responder. Reviewers see only the case
          evidence, document their reason and escalation, and record access. The
          service does not claim continuous emergency monitoring or a guaranteed
          response time until staffing is configured.
        </p>
        <p>
          Referral counts use day, coarse configured region and protocol
          version. They contain no account, creator, message or conversation
          identifiers. Annual reporting and filing requirements require counsel
          review.
        </p>
      </section>
      <ErrorState error={error} retry={() => void refresh()} />
      <section className="trust-panel">
        <h2>Help resources</h2>
        {data?.resources.length === 0 && (
          <p>
            Regional help resources are not configured in this development
            environment. Contact your local emergency services if immediate help
            is needed.
          </p>
        )}
        {data?.resources.map((resource) => (
          <p key={`${resource.region}-${resource.name}`}>
            <a href={resource.url}>{resource.name}</a> · {resource.region}
            {resource.phone && ` · ${resource.phone}`}
          </p>
        ))}
      </section>
      <Link href="/support">Report a safety concern</Link>
    </main>
  );
}
