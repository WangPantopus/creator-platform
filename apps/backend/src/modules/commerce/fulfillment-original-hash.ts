import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import {
  CommerceFulfillmentViewAuthority,
  type CommerceFulfillmentViewScope,
} from "./fulfillment-view-authority.js";
import {
  assertFulfillmentOriginalHashCatalogue,
  FULFILLMENT_ORIGINAL_HASH_MIGRATION,
  FULFILLMENT_ORIGINAL_HASH_SCHEMA_SHA256,
  originalHashUnavailable,
} from "./fulfillment-original-hash-catalogue.js";

const issued = new WeakSet<CommerceFulfillmentOriginalHash>();

/** Compares bounded current private inputs only through the actual interactive
 * viewer owner. No caller-selected packet, raw input or scalar licence exists. */
export class CommerceFulfillmentOriginalHash {
  private constructor(
    private readonly database: Database,
    private readonly viewAuthority: CommerceFulfillmentViewAuthority,
  ) {
    issued.add(this);
  }
  static async prepare(input: {
    database: Database;
    viewAuthority: CommerceFulfillmentViewAuthority;
    migration: { version: string; checksum: string };
  }): Promise<CommerceFulfillmentOriginalHash> {
    if (
      input.migration.version !== FULFILLMENT_ORIGINAL_HASH_MIGRATION ||
      input.migration.checksum !== FULFILLMENT_ORIGINAL_HASH_SCHEMA_SHA256
    )
      originalHashUnavailable();
    CommerceFulfillmentViewAuthority.assertRuntime(
      input.viewAuthority,
      input.database,
    );
    await input.database.assertRuntimeRole();
    const client = await input.database.pool.connect();
    try {
      await CommerceFulfillmentViewAuthority.assertCurrentCatalogue(
        input.viewAuthority,
        input.database,
        client,
      );
      await assertFulfillmentOriginalHashCatalogue(client);
    } finally {
      client.release();
    }
    return new CommerceFulfillmentOriginalHash(
      input.database,
      input.viewAuthority,
    );
  }
  static assertRuntime(
    authority: CommerceFulfillmentOriginalHash,
    database: Database,
    viewAuthority: CommerceFulfillmentViewAuthority,
  ): void {
    if (
      !issued.has(authority) ||
      authority.database !== database ||
      authority.viewAuthority !== viewAuthority
    )
      originalHashUnavailable();
  }
  async matchesInTransaction(
    client: PoolClient,
    scope: CommerceFulfillmentViewScope,
  ): Promise<boolean> {
    const binding = await this.viewAuthority.assertCurrentInTransaction(
      client,
      scope,
    );
    await assertFulfillmentOriginalHashCatalogue(client);
    const matches = (
      await client.query<{ matches: boolean }>(
        "SELECT creator.commerce_fulfillment_originals_match($1) AS matches",
        [binding.nonce],
      )
    ).rows[0]?.matches;
    await assertFulfillmentOriginalHashCatalogue(client);
    await this.viewAuthority.assertCurrentInTransaction(client, scope);
    return matches === true;
  }
}
