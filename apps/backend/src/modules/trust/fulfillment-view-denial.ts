import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import {
  CommerceFulfillmentViewAuthority,
  type CommerceFulfillmentViewScope,
} from "../commerce/fulfillment-view-authority.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import {
  assertFulfillmentViewDenialCatalog,
  fulfillmentViewDenialMigration,
} from "./fulfillment-view-denial-catalog.js";

export type TrustFulfillmentViewDenial = (
  client: PoolClient,
  scope: CommerceFulfillmentViewScope,
) => Promise<void>;

function unavailable(): never {
  throw new DomainError(
    "fulfillment_view_denial_unavailable",
    "The original answer recipients cannot be checked. Try again later.",
    503,
  );
}

/** Prepare after W1 has issued the real host graph and W4 its real issuer.
 * A caller array, serialized scope or publication nonce supplies no authority.
 * W4 owns the original positive/signature/final cleanup and sole COMMIT. */
export async function prepareTrustFulfillmentViewDenial(
  runtime: BackendRuntime,
  authority: CommerceFulfillmentViewAuthority,
): Promise<TrustFulfillmentViewDenial | undefined> {
  const current = () => {
    if (
      !isConfiguredBackendRuntime(runtime) ||
      runtime.database.pool !== runtime.pool ||
      typeof runtime.assertRestoredInTransaction !== "function"
    )
      unavailable();
    CommerceFulfillmentViewAuthority.assertRuntime(authority, runtime.database);
  };
  current();
  const active = await registeredMigration({
    name: "w8_fulfillment_view_denial",
    path: "apps/backend/migrations/0200_w8_fulfillment_view_denial.sql",
    owner: "W8",
    checksum: fulfillmentViewDenialMigration.checksum,
  });
  if (active?.version !== fulfillmentViewDenialMigration.version)
    return undefined;
  const review = await runtime.pool.connect();
  try {
    await review.query("BEGIN");
    await runtime.assertRestoredInTransaction!(review);
    await assertFulfillmentViewDenialCatalog(review);
    await CommerceFulfillmentViewAuthority.assertCurrentCatalogue(
      authority,
      runtime.database,
      review,
    );
    await review.query("ROLLBACK");
  } catch (error) {
    await review.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    review.release();
  }
  return async (client, scope) => {
    const bookend = async () => {
      current();
      await runtime.assertRestoredInTransaction!(client);
      await assertFulfillmentViewDenialCatalog(client);
      const binding = await authority.assertCurrentInTransaction(client, scope);
      const originals = await authority.originalsInTransaction(client, scope);
      return { binding, originalsHash: contentHash(originals) };
    };
    const before = await bookend();
    const result = (
      await client.query<{ result: string }>(
        "SELECT creator_trust.fulfillment_view_denial($1) AS result",
        [before.binding.nonce],
      )
    ).rows[0]?.result;
    const after = await bookend();
    if (
      before.binding.nonce !== after.binding.nonce ||
      contentHash(before.binding.tuple) !== contentHash(after.binding.tuple) ||
      before.originalsHash !== after.originalsHash
    )
      unavailable();
    if (result === "denied")
      throw new DomainError(
        "fulfillment_view_denied",
        "This answer is unavailable.",
        403,
      );
    if (result !== "allowed") unavailable();
  };
}
