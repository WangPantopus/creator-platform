import type { Pool } from "pg";
import { canonical } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import {
  assertSyntheticDevelopmentHost,
  DevelopmentLicenseVerifier,
  type SyntheticDevelopmentHost,
} from "../agent/development-license.js";
import { SessionService } from "../identity/sessions.js";
import type { ProviderPolicy } from "../../../../../packages/api/src/conversation/contracts.js";

export const SYNTHETIC_PROVIDER_REFERENCE =
  "synthetic-review-only-unapproved-processor-20261001";
const issued = new WeakSet<object>();

/** An unreviewed policy is usable only by this explicitly fictional host.
 * This capability is not a processor approval and never changes verified. */
export class DevelopmentConversationPolicy {
  private readonly fingerprint: string;
  private readonly accounts: ReadonlySet<string>;
  private constructor(
    private readonly pool: Pool,
    policy: ProviderPolicy,
    sessions: SessionService,
  ) {
    this.fingerprint = canonical(policy);
    this.accounts = new Set(sessions.developmentActors!.map(({ id }) => id));
    issued.add(this);
  }
  static prepare(input: {
    pool: Pool;
    policy: ProviderPolicy;
    verifier: DevelopmentLicenseVerifier;
    sessions: SessionService;
    host: SyntheticDevelopmentHost;
    reference: string | undefined;
  }) {
    assertSyntheticDevelopmentHost(input.host);
    invariant(
      input.verifier instanceof DevelopmentLicenseVerifier &&
        input.sessions instanceof SessionService &&
        input.sessions.mode === "development" &&
        Boolean(input.sessions.developmentActors?.length),
      "synthetic_policy_authority_required",
      "Development conversations require the configured synthetic identity and license authorities.",
    );
    input.verifier.assertPool(input.pool);
    invariant(
      input.reference === SYNTHETIC_PROVIDER_REFERENCE &&
        input.policy.reference === SYNTHETIC_PROVIDER_REFERENCE &&
        input.policy.verified === false &&
        input.policy.providers.length === 1 &&
        input.policy.providers[0]!.name === "OpenAI" &&
        input.policy.providers[0]!.noRetention === false,
      "synthetic_policy_reference_required",
      "Use the explicit unreviewed development policy. Provider approval is unavailable.",
    );
    const prepared = new DevelopmentConversationPolicy(
      input.pool,
      input.policy,
      input.sessions,
    );
    Object.freeze(prepared);
    return prepared;
  }
  isFor(pool: Pool, policy: ProviderPolicy) {
    return (
      issued.has(this) &&
      pool === this.pool &&
      canonical(policy) === this.fingerprint
    );
  }
  allowsAccounts(...accountIds: string[]) {
    return (
      issued.has(this) &&
      accountIds.length > 0 &&
      accountIds.every((id) => this.accounts.has(id))
    );
  }
}
