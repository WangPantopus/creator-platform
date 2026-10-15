"use client";
import Link from "next/link";
import { AvailabilityEditor } from "../../calls/AvailabilityEditor";
import { useIdentityRequest } from "../../identity/session-boundary";
import type { Creator } from "../shared/types";
export function More({ creator }: { creator: Creator }) {
  const { signal } = useIdentityRequest();
  return (
    <section className="w5-more">
      <header className="w5-heading">
        <h1>More</h1>
      </header>
      <div className="w5-more-links">
        {[
          ["Offers", "/commerce/offers"],
          ["Publish", `/studio/${creator.id}/publish`],
          ["Insights", "/studio/insights"],
          ["Earnings", "/commerce/earnings"],
          ["Team", `/studio/${creator.id}/team`],
          ["Thanks", `/studio/${creator.id}/thanks`],
          ["Impact", "/studio/impact"],
          ["Verification and account", "/identity/account"],
          ["License", "/studio/ai/license"],
          ["Support", "/support"],
        ].map(([label, href]) => (
          <Link key={label} href={href!}>
            <span>{label}</span>
            <span aria-hidden="true">›</span>
          </Link>
        ))}
      </div>
      <p className="w5-gutter qv-help">
        Personal signing and commitments stay with the creator. Support access
        is scoped and audited.
      </p>
      {creator.owned && creator.verification === "verified" && (
        <AvailabilityEditor
          creatorId={creator.id}
          accountId={creator.viewerAccountId}
          signal={signal}
        />
      )}
    </section>
  );
}
