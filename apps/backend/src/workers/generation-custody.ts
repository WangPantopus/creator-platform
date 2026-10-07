import review from "../../../../infra/migrations/reviews/20261007-generation-worker.json" with { type: "json" };
import { invariant } from "../core/errors.js";
import { generationPrivacySourcesRegistered } from "../db/generation-privacy-sources.js";
import type { GenerationTerminalPurposeConsumer } from "../modules/identity/generation-scope.js";
import type { GenerationWorkerCustody } from "./generation-composition.js";

type HostAuthorities = Pick<
  GenerationWorkerCustody["identity"],
  "assertAllowed" | "assertDiscoveryAllowed"
> &
  Pick<GenerationWorkerCustody["terminal"], "assertRestoredInTransaction"> &
  Pick<GenerationWorkerCustody["guardrail"], "assertPrivacyRegistered">;

function freeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value))
    if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}

const reviewed = freeze(review.custody);
const terminalConsumer = (
  receipt: Omit<GenerationTerminalPurposeConsumer, "purpose">,
): GenerationTerminalPurposeConsumer =>
  Object.freeze({ ...receipt, purpose: "generation_terminal" });

/** Fixed configuration from the independent closed fresh/preserved source
 * review. This reads no database and issues no purpose, task or registration.
 * The host must supply original restoration and privacy registration; each owner still
 * prepares against the actual worker login and checks current custody again
 * at its transaction bookends. No input can override a reviewed receipt. */
export async function reviewedGenerationWorkerCustody(
  authorities: HostAuthorities,
  signal?: AbortSignal,
): Promise<GenerationWorkerCustody> {
  signal?.throwIfAborted();
  invariant(
    typeof authorities.assertAllowed === "function" &&
      typeof authorities.assertDiscoveryAllowed === "function" &&
      typeof authorities.assertRestoredInTransaction === "function" &&
      typeof authorities.assertPrivacyRegistered === "function" &&
      (await generationPrivacySourcesRegistered(signal)),
    "generation_worker_custody_unavailable",
    "The reviewed source graph, original restoration and privacy registration are required.",
  );
  signal?.throwIfAborted();
  const custody: GenerationWorkerCustody = {
    ...reviewed,
    identity: {
      ...reviewed.identity,
      terminalConsumers:
        reviewed.identity.terminalConsumers.map(terminalConsumer),
      assertAllowed: authorities.assertAllowed,
      assertDiscoveryAllowed: authorities.assertDiscoveryAllowed,
    },
    terminal: {
      ...reviewed.terminal,
      assertRestoredInTransaction: authorities.assertRestoredInTransaction,
    },
    guardrail: {
      ...reviewed.guardrail,
      assertPrivacyRegistered: authorities.assertPrivacyRegistered,
    },
    terminalJournal: {
      ...reviewed.terminalJournal,
      consumers: reviewed.terminalJournal.consumers.map(terminalConsumer),
    },
    finalization: {
      ...reviewed.finalization,
      consumer: terminalConsumer(reviewed.finalization.consumer),
    },
    settlement: {
      ...reviewed.settlement,
      consumers: reviewed.settlement.consumers.map(terminalConsumer),
    },
  };
  return freeze(custody);
}
