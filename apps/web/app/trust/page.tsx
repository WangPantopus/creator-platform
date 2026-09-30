import Link from "next/link";
import { brand } from "@qelvora/brand";
import "../ops/trust.css";
export default function TrustPage() {
  return (
    <main className="trust-page">
      <h1>Trust and help</h1>
      <p>
        {brand.name} gives creators an authorized, clearly labeled AI. Official
        means the creator authorized the AI. It does not mean they read your
        message.
      </p>
      <nav>
        <Link href="/support">Support and reports</Link>
        <Link href="/support/privacy">Export and deletion</Link>
        <Link href="/status">Service status</Link>
        <Link href="/trust/crisis">Crisis help protocol</Link>
        <Link href="/trust/terms">Terms status</Link>
      </nav>
      <section className="trust-panel">
        <h2>Who is speaking and who can access a conversation</h2>
        <p>
          AI messages carry the AI’s label. Approved drafts name both AI
          preparation and the creator’s approval. Personal creator acts require
          a signature. Team replies identify the team.
        </p>
        <p>
          Creators and their authorized team can separately review their own AI
          conversations. Those accesses are logged. Operations access requires a
          defined case, a purpose and a time limit. Case lists and alerts
          contain no fan message text.
        </p>
      </section>
      <section className="trust-panel">
        <h2>Your data and choices</h2>
        <p>
          Memory is scoped to one creator conversation. You can request its
          deletion and export your data. Accepted packet and delivery records
          retain their disclosed dispute exceptions; account removal and legally
          required ledger retention need reviewed configuration.
        </p>
        <p>
          The processor consent screen must name the actual configured model and
          voice providers before personal data is sent. Provider identities and
          contractual data practices remain unconfigured in this development
          environment.
        </p>
        <p>
          Cancel store subscriptions through the relevant store. Data deletion
          is a separate request. Deleting creator product data does not silently
          delete the shared Pantopus account.
        </p>
      </section>
      <section className="trust-panel">
        <h2>Reports and safety</h2>
        <p>
          Report AI output from its message or the support page. Reporting and
          crisis help never require buying access. Safety decisions do not
          become offers, commercial routing or spending ranks.
        </p>
        <p>
          External support contacts, final legal terms, provider disclosures and
          emergency resource configuration remain release dependencies. Use the
          in-app support queue in this configured environment.
        </p>
      </section>
    </main>
  );
}
