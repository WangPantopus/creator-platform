import Link from "next/link";
import "../../ops/trust.css";
export default function TermsPage() {
  return (
    <main className="trust-page">
      <Link href="/trust">Trust and help</Link>
      <h1>Terms status</h1>
      <p>
        Final product, replica license and privacy terms are awaiting review.
        This local environment is for synthetic development records. It does not
        accept external creator licenses or external payments.
      </p>
      <p>
        Public release requires reviewed terms, actual processor disclosures,
        retention configuration, support contacts and the shared Pantopus
        account lifecycle boundary.
      </p>
      <Link href="/support">Ask for help</Link>
    </main>
  );
}
