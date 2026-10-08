import review from "../../../../infra/migrations/reviews/20261007-generation-first-visible.json" with { type: "json" };
import type { PoolClient } from "pg";
import { invariant } from "../core/errors.js";
import {
  assertRegisteredMigration,
  registeredMigration,
} from "./reviewed-migration.js";

export const generationOutputRepairSource = Object.freeze({ ...review.source });

function freeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value))
    if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}
const profile = freeze(review);

/** Fixed independently reviewed metadata. Registration selects constants;
 * only the actual held database can prove activation. */
export async function registeredGenerationOutputProfile(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const active = await registeredMigration(generationOutputRepairSource);
  signal?.throwIfAborted();
  if (!active) return undefined;
  invariant(
    active.version === generationOutputRepairSource.version &&
      active.checksum === generationOutputRepairSource.checksum,
    "generation_output_profile_unavailable",
    "The exact reviewed output repair source is required.",
  );
  return profile;
}

export async function assertGenerationOutputRepairIfRegistered(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  if (await registeredGenerationOutputProfile(signal))
    await assertRegisteredMigration(
      client,
      generationOutputRepairSource,
      signal,
    );
}
