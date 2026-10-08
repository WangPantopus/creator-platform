import review from "../../../../infra/migrations/reviews/20261008-comparison.json" with { type: "json" };
import type { PoolClient } from "pg";
import { invariant } from "../core/errors.js";
import {
  assertRegisteredMigration,
  registeredMigration,
} from "./reviewed-migration.js";

function freeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value))
    if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}
const profile = freeze(review);

/** Exact executable source selects independently reviewed metadata only.
 * Reservations and hand-installed ledger entries cannot activate this profile.
 * Original owners still check their actual source, purpose and transaction. */
export async function registeredComparisonProfile(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const active = await Promise.all(profile.sources.map(registeredMigration));
  signal?.throwIfAborted();
  if (active.every((source) => !source)) return undefined;
  invariant(
    active.every(
      (source, index) =>
        source?.version === profile.sources[index]!.version &&
        source.checksum === profile.sources[index]!.checksum,
    ),
    "comparison_unconfigured",
    "The complete reviewed comparison source graph is required.",
  );
  return profile;
}

export async function assertComparisonExtensionIfRegistered(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  if (await registeredComparisonProfile(signal))
    for (const source of profile.sources)
      await assertRegisteredMigration(client, source, signal);
}
