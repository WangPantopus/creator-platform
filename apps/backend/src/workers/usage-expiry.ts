import { invariant } from "../core/errors.js";
import type { AgentRepository } from "../modules/agent/repository.js";
import type { PreparedUsageRetention } from "../modules/agent/usage-retention.js";
import {
  PreparedUsageExpiryOwner,
  type UsageExpiryPass,
} from "../modules/trust/usage-expiry.js";

export { PreparedUsageExpiryOwner, type UsageExpiryPass };

/** Start only the actual prepared W8/W2 graph. Preparation retains installed
 * source/catalogue and registered privacy gates; this does not register them.
 * The host retains pool ownership and observes/awaits done before pool.end(). */
export function startUsageExpiryWorker(
  input: {
    owner: PreparedUsageExpiryOwner;
    repository: AgentRepository;
    retention: PreparedUsageRetention;
    signal?: AbortSignal;
  },
  onPass?: (result: UsageExpiryPass) => void,
) {
  invariant(
    input.owner instanceof PreparedUsageExpiryOwner,
    "usage_expiry_unconfigured",
    "The original prepared expiry owner is required.",
  );
  input.owner.assertComposition(input.repository, input.retention);
  const controller = new AbortController();
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;
  const done = input.owner.run(
    input.repository,
    input.retention,
    signal,
    onPass,
  );
  void done.catch(() => {});
  return Object.freeze({
    done,
    close(): Promise<void> {
      controller.abort();
      return done;
    },
  });
}
