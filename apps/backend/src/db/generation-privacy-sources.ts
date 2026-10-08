import review from "../../../../infra/migrations/reviews/20261007-generation-privacy.json" with { type: "json" };
import { registeredMigration } from "./reviewed-migration.js";

/** The six complete-purpose metadata pins belong to this exact composed
 * source graph. A reservation, partial executable graph or matching installed
 * catalogue cannot activate them. This file/build check reads no database and
 * adds no ledger grants; each original purpose still checks its actual held
 * database registration, caller, task, restoration and transaction custody. */
export async function generationPrivacySourcesRegistered(
  signal?: AbortSignal,
): Promise<boolean> {
  signal?.throwIfAborted();
  if (review.sources.length !== 39) return false;
  for (const source of review.sources) {
    const active = await registeredMigration(source);
    signal?.throwIfAborted();
    if (!active || active.version !== source.version) return false;
  }
  return true;
}
