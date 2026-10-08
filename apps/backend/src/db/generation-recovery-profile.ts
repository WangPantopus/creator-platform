import review from "../../../../infra/migrations/reviews/20261007-generation-recovery.json" with { type: "json" };
import partialReview from "../../../../infra/migrations/reviews/20261007-partial-generation-recovery.json" with { type: "json" };
import { invariant } from "../core/errors.js";
import { registeredMigration } from "./reviewed-migration.js";

function freeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value))
    if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}
const profile = freeze(review);
export const generationRecoverySource = profile.source;
const partialProfile = freeze(partialReview);
export const generationPartialRecoverySource = partialProfile.source;

/** Source selects fixed independent review metadata only. Every owner still
 * verifies activation and current custody on its actual held client. */
export async function registeredGenerationRecoveryProfile(
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const partial = await registeredMigration(partialProfile.source);
  const selected = partial ? partialProfile : profile;
  const active = partial ?? (await registeredMigration(profile.source));
  signal?.throwIfAborted();
  if (!active) return undefined;
  invariant(
    active.version === selected.source.version,
    "generation_recovery_unconfigured",
    "The exact original unknown-cost terminal source is required.",
  );
  return selected;
}
