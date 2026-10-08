import type { PoolClient } from "pg";
import { assertPublicationPreparationCatalogue } from "./publication-preparation-catalogue.js";

/** Compatibility entry for the reconciled original-family lifecycle. The
 * original0167 signature fence and0201 ledger custody are mandatory in the
 * same held client's registered source and effective catalogue inspection.
 * This metadata check issues no publication authority or positive permission.
 */
export async function assertPublicationPreparation(client: PoolClient) {
  await assertPublicationPreparationCatalogue(client);
}
