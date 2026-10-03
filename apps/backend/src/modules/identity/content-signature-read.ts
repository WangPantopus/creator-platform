import type { PoolClient, QueryConfig } from "pg";
import { z } from "zod";
import { ContentAudience } from "../../../../../packages/api/src/content.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  assertHeldCurrentRequestSession,
  type HeldCurrentRequestSession,
} from "./request-authority.js";
import { assertContentSignatureReadCatalogue } from "./content-signature-read-catalogue.js";

const Input = z.strictObject({
  creatorId: z.uuid(),
  contentId: z.uuid(),
  contentVersion: z.int().positive().max(2147483647),
  audience: ContentAudience,
  signedActId: z.uuid(),
  canonicalCommandHash: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type ContentSignatureReadInput = Readonly<z.infer<typeof Input>>;
export type ContentSignatureRead = (
  client: PoolClient,
  original: HeldCurrentRequestSession,
  input: ContentSignatureReadInput,
) => Promise<boolean>;

// Share the family guard across factory instances. A second genuine held
// capability or a second reader cannot introduce another creator in this TX.
const families = new WeakMap<
  PoolClient,
  { transaction: string; pid: number; creatorId: string }
>();

/** One ordinary Content LAST reader. W5 must already hold the exact current
 * version/audience/publication/withdrawal and all actual recipient/restoration
 * negatives on this original client. Compute the canonical command hash from
 * the stored revision and actual publication media evidence; pass no body here.
 * After this callback: only original held-session metadata and COMMIT/ROLLBACK
 * or original connection settlement. Never acquire another domain/row lease,
 * call a publisher/packet/ThreadScope or open a publicVerification pool.
 * Missing reviewed catalogue/registry remains unavailable and is not a null
 * unsigned publication. No factory creates an Actor or request authority.
 */
export function createContentSignatureRead(): ContentSignatureRead {
  return async (client, original, raw) => {
    const tuple = Input.parse(raw);
    await assertHeldCurrentRequestSession(original, client);
    await assertContentSignatureReadCatalogue(client);
    const context = (
      await client.query<{ transaction: string | null; pid: number }>(
        "SELECT pg_current_xact_id_if_assigned()::text AS transaction,pg_backend_pid() AS pid",
      )
    ).rows[0];
    invariant(
      context?.transaction,
      "content_signature_transaction_required",
      "Reopen this post with its current account transaction.",
    );
    const prior = families.get(client);
    invariant(
      !prior ||
        prior.transaction !== context.transaction ||
        (prior.pid === context.pid && prior.creatorId === tuple.creatorId),
      "content_signature_read_order_invalid",
      "Finish this creator's post before reading another.",
    );
    families.set(client, {
      transaction: context.transaction,
      pid: context.pid,
      creatorId: tuple.creatorId,
    });
    await assertHeldCurrentRequestSession(original, client);
    try {
      const result = await client.query<{ allowed: boolean }>({
        text: "SELECT creator.hold_content_signature_read($1,$2,$3,$4,$5) AS allowed",
        values: [
          tuple.creatorId,
          tuple.contentId,
          tuple.signedActId,
          tuple.canonicalCommandHash,
          tuple.audience.kind === "public",
        ],
        query_timeout: 5000,
      } as QueryConfig & { query_timeout: number });
      await assertHeldCurrentRequestSession(original, client);
      return result.rows[0]?.allowed === true;
    } catch (cause) {
      throw new DomainError(
        "content_signature_read_unavailable",
        "Current Signed information is unavailable. Reopen the post and try again.",
        503,
        { cause },
      );
    }
  };
}
