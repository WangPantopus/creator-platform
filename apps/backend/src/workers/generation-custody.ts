import review from "../../../../infra/migrations/reviews/20261007-generation-worker.json" with { type: "json" };
import contentReview from "../../../../infra/migrations/reviews/20261007-content-worker.json" with { type: "json" };
import { registeredContentPrivacyProfile } from "../db/content-privacy-profile.js";
import { registeredGenerationOutputProfile } from "../db/generation-output-profile.js";
import { registeredPublicAIProfile } from "../db/public-ai-profile.js";
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

const baseline = freeze(review.custody);
const withContentPrivacy = freeze(contentReview.custody);
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
  const reviewed = (await registeredContentPrivacyProfile(signal))
    ? withContentPrivacy
    : baseline;
  const output = await registeredGenerationOutputProfile(signal);
  const publicAI = await registeredPublicAIProfile(signal);
  invariant(
    (!output || reviewed === withContentPrivacy) && (!publicAI || output),
    "generation_worker_custody_unavailable",
    "The output repair requires the complete Content source graph.",
  );
  signal?.throwIfAborted();
  const custody: GenerationWorkerCustody = {
    ...reviewed,
    ...(publicAI
      ? {
          inputs: {
            ...reviewed.inputs,
            catalogueChecksum:
              publicAI.workerCatalogues.creator_w2_generation_input,
          },
          origins: {
            ...reviewed.origins,
            catalogueChecksum:
              publicAI.workerCatalogues.creator_w5_generation_origin,
          },
          context: {
            ...reviewed.context,
            catalogueChecksum:
              publicAI.workerCatalogues.creator_generation_conversation_context,
          },
          metadata: {
            ...reviewed.metadata,
            catalogueChecksum:
              publicAI.workerCatalogues.creator_w2_generation_metadata,
          },
          accounting: {
            ...reviewed.accounting,
            catalogueChecksum:
              publicAI.workerCatalogues.creator_w2_generation_journal,
          },
          retrieval: {
            ...reviewed.retrieval,
            catalogueChecksum:
              publicAI.workerCatalogues.creator_w2_generation_retrieval,
          },
        }
      : {}),
    output: {
      ...reviewed.output,
      catalogueChecksum:
        publicAI?.outputCatalogueChecksum ??
        output?.outputCatalogueChecksum ??
        reviewed.output.catalogueChecksum,
    },
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
      catalogueChecksum:
        publicAI?.workerCatalogues.creator_w2_generation_guardrail ??
        reviewed.guardrail.catalogueChecksum,
      assertPrivacyRegistered: authorities.assertPrivacyRegistered,
    },
    terminalJournal: {
      ...reviewed.terminalJournal,
      catalogueChecksum:
        publicAI?.workerCatalogues.creator_w2_generation_terminal_journal ??
        reviewed.terminalJournal.catalogueChecksum,
      consumers: reviewed.terminalJournal.consumers.map(terminalConsumer),
    },
    finalization: {
      ...reviewed.finalization,
      catalogueChecksum:
        publicAI?.workerCatalogues.creator_w3_terminal_output ??
        reviewed.finalization.catalogueChecksum,
      consumer: terminalConsumer(reviewed.finalization.consumer),
    },
    settlement: {
      ...reviewed.settlement,
      catalogueChecksum:
        publicAI?.runtimeCatalogues.financial ??
        output?.runtimeCatalogues.financial ??
        reviewed.settlement.catalogueChecksum,
      consumers: reviewed.settlement.consumers.map(terminalConsumer),
    },
  };
  return freeze(custody);
}
