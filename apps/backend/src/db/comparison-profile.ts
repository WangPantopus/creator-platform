import review from "../../../../infra/migrations/reviews/20261008-comparison.json" with { type: "json" };
import noticesReview from "../../../../infra/migrations/reviews/20261015-notices.json" with { type: "json" };
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
const notices = freeze(noticesReview);

/** The notices wave follows comparison. Every pinned catalogue lists every
 * relation, so once its two sources are registered its regenerated pins
 * describe the complete graph and replace the comparison pins. */
async function registeredNoticesProfile(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const active = await Promise.all(notices.sources.map(registeredMigration));
  signal?.throwIfAborted();
  if (active.every((source) => !source)) return undefined;
  invariant(
    active.every(
      (source, index) =>
        source?.version === notices.sources[index]!.version &&
        source.checksum === notices.sources[index]!.checksum,
    ),
    "comparison_unconfigured",
    "The complete reviewed notices source graph is required.",
  );
  return notices;
}

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
  const head = await registeredNoticesProfile(signal);
  return head
    ? freeze({
        ...profile,
        ...head,
        sources: [...profile.sources, ...head.sources],
      })
    : profile;
}

export async function assertComparisonExtensionIfRegistered(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  const selected = await registeredComparisonProfile(signal);
  if (selected)
    for (const source of selected.sources)
      await assertRegisteredMigration(client, source, signal);
}
