import review from "../../../../infra/migrations/reviews/20261007-content-privacy.json" with { type: "json" };
import { invariant } from "../core/errors.js";
import { registeredMigration } from "./reviewed-migration.js";
import { registeredGenerationOutputProfile } from "./generation-output-profile.js";

export const contentPrivacySource = Object.freeze({ ...review.source });

function freeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value))
    if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}

const profile = freeze(review);

/** Select independently reviewed constants by exact executable source custody.
 * This reads no database and grants no task or migration authority. A reserved
 * source cannot select its profile. Each original purpose still checks its
 * actual held database, role, source, task and transaction at its bookends. */
export async function registeredContentPrivacyProfile(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const active = await registeredMigration(contentPrivacySource);
  signal?.throwIfAborted();
  if (!active) return undefined;
  invariant(
    active.version === contentPrivacySource.version &&
      active.checksum === contentPrivacySource.checksum,
    "content_privacy_profile_unavailable",
    "The exact reviewed Content export source graph is required.",
  );
  return profile;
}

export async function generationPrivacyCatalogueChecksum(
  purpose: keyof typeof review.runtimeCatalogues,
  baseline: string,
  signal?: AbortSignal,
) {
  if (await registeredContentPrivacyProfile(signal)) {
    const output = await registeredGenerationOutputProfile(signal);
    if (output) return output.runtimeCatalogues[purpose];
    return profile.runtimeCatalogues[purpose];
  }
  return baseline;
}
