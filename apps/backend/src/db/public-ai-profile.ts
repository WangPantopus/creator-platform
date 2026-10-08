import review from "../../../../infra/migrations/reviews/20261007-public-ai.json" with { type: "json" };
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

/** Fixed metadata from the closed independent review. Source registration
 * selects a profile; only the held database can prove its activation. */
export async function registeredPublicAIProfile(signal?: AbortSignal) {
  signal?.throwIfAborted();
  const active = await Promise.all(profile.sources.map(registeredMigration));
  signal?.throwIfAborted();
  if (active.every((source) => !source)) return undefined;
  invariant(
    active.every(
      (source, index) => source?.version === profile.sources[index]!.version,
    ),
    "public_ai_unconfigured",
    "Both exact public metadata and denial sources are required.",
  );
  return profile;
}

export async function assertPublicAIExtensionIfRegistered(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
) {
  if (await registeredPublicAIProfile(signal))
    for (const source of profile.sources)
      await assertRegisteredMigration(client, source, signal);
}
