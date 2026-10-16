import { brand } from "@qelvora/brand";
import { copy } from "@qelvora/copy";

/** The designed under-18 state (D-11): the policy and nothing else. No
 * session exists and no part of the product opens from here; its only link
 * is the policy page for younger people. */
export default function Page() {
  return (
    <main className="qv identity-welcome">
      <span className="identity-wordmark">{brand.name}</span>
      <div className="identity-welcome-body">
        <h1>{copy.adultOnlyTitle}</h1>
        <p>{copy.adultOnlyBody}</p>
        <a href="/auth/under-18">{copy.underageLink}</a>
      </div>
    </main>
  );
}
