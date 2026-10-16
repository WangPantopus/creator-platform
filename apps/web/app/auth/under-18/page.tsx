import { brand } from "@qelvora/brand";
import { copy } from "@qelvora/copy";

/** The policy for younger people (WP 1.9), linked from the under-18 state.
 * Like that state, it opens no part of the product. */
export default function Page() {
  return (
    <main className="qv identity-welcome">
      <span className="identity-wordmark">{brand.name}</span>
      <div className="identity-welcome-body">
        <h1>{copy.underagePolicyTitle}</h1>
        <p>{copy.underagePolicyOpening}</p>
        <p>{copy.underagePolicyNotKept}</p>
        <p>{copy.underagePolicyKept}</p>
      </div>
    </main>
  );
}
