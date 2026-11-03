import type { PoolClient } from "pg";
import { invariant } from "../core/errors.js";
import {
  assertRegisteredMigration,
  registeredMigration,
} from "./reviewed-migration.js";
import { type HeadReview, type HeadWave, headWaves } from "./reviewed-waves.js";

function freeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value))
    if (child && typeof child === "object") freeze(child);
  return Object.freeze(value);
}
for (const wave of headWaves) freeze(wave.review);

// The walk follows the chain's order: each head review after the first pins
// the packet of the wave before it as its baselineWave, and the generator
// checks those pins against infra/migrations/chain.json.
for (const [index, wave] of headWaves.entries())
  invariant(
    index === 0 ||
      wave.review.baselineWave.path ===
        `infra/migrations/waves/${headWaves[index - 1]!.id}.json`,
    "comparison_unconfigured",
    "The reviewed head waves are out of the chain's order.",
  );

/** A wave's review once all its sources are registered exactly, and nothing
 * while none is. Reservations cannot select it, and a partial registration
 * is refused. */
async function registeredWave(wave: HeadWave, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const sources = wave.review.sources;
  const active = await Promise.all(sources.map(registeredMigration));
  signal?.throwIfAborted();
  if (active.every((source) => !source)) return undefined;
  invariant(
    active.every(
      (source, index) =>
        source?.version === sources[index]!.version &&
        source.checksum === sources[index]!.checksum,
    ),
    "comparison_unconfigured",
    wave.partial,
  );
  return wave.review;
}

/** Exact executable source selects independently reviewed metadata only.
 * Reservations and hand-installed ledger entries cannot activate this profile.
 * Original owners still check their actual source, purpose and transaction.
 * The later head waves follow comparison in the chain's order. Every pinned
 * catalogue lists every relation, so once a wave's sources are registered its
 * regenerated pins describe the complete graph and replace the ones before. */
export async function registeredComparisonProfile(
  signal?: AbortSignal,
): Promise<HeadReview | undefined> {
  const [comparison, notices, ...later] = headWaves;
  const profile = await registeredWave(comparison, signal);
  if (!profile) return undefined;
  // reviews[0] is notices', and reviews[index + 1] is later[index]'s.
  const reviews = [await registeredWave(notices, signal)];
  for (const wave of later) reviews.push(await registeredWave(wave, signal));
  // A wave is selected only on top of the complete wave before it, checked
  // from the newest down. Notices' predecessor, comparison, is required above.
  for (let index = later.length - 1; index >= 0; index--)
    invariant(
      reviews[index] || !reviews[index + 1],
      "comparison_unconfigured",
      later[index]!.requires,
    );
  const selected = [
    profile,
    ...reviews.filter((review) => review !== undefined),
  ];
  return selected.length > 1
    ? freeze({
        ...selected.reduce((head, review) => ({ ...head, ...review })),
        sources: selected.flatMap((review) => review.sources),
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
