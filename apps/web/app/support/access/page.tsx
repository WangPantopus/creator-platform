"use client";
import Link from "next/link";
import {
  ErrorState,
  TrustSession,
  useTrust,
  dateLabel,
} from "../../ops/trust-client";
export default function AccessPage() {
  const { data, error, refresh } = useTrust<{
    items: {
      case_id: string;
      action: string;
      purpose: string;
      created_at: string;
    }[];
  }>("access-history");
  return (
    <main className="trust-page">
      <Link href="/support">Support</Link>
      <h1>Case access history</h1>
      <p>
        These records show that an authorized operations account opened your
        case evidence, its purpose, and when. Opening a case does not mean a
        person read every word.
      </p>
      <TrustSession />
      <ErrorState error={error} retry={() => void refresh()} />
      <section className="trust-panel">
        {data?.items.length === 0 && <p>No case accesses yet.</p>}
        {data?.items.map((item, index) => (
          <article className="trust-job" key={`${item.case_id}-${index}`}>
            <p>
              {item.action.replaceAll("_", " ")} · {dateLabel(item.created_at)}
            </p>
            <p>{item.purpose}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
