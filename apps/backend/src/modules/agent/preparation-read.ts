import type { Pool, PoolClient } from "pg";
import { DomainError, invariant } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";
import { requestAuthority } from "../identity/request-authority.js";
import { agentPrivacyTransaction } from "./privacy-transaction.js";

/** Startup metadata only. Reuse original client settlement without issuing a
 * privacy task or generation purpose. The host budget cannot extend a shorter
 * caller/connection budget or alter the pool's interactive configuration. */
export async function agentPreparationRead<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  parent?: AbortSignal,
): Promise<T> {
  invariant(
    !requestAuthority.getStore(),
    "agent_preparation_unavailable",
    "Prepare original accounting owners outside request authority.",
  );
  parent?.throwIfAborted();
  const deadline = new AbortController();
  const timer = setTimeout(
    () =>
      deadline.abort(
        new DomainError(
          "agent_preparation_timeout",
          "Original accounting metadata preparation exceeded its budget.",
          503,
        ),
      ),
    5000,
  );
  const signal = parent
    ? AbortSignal.any([parent, deadline.signal])
    : deadline.signal;
  try {
    return await agentPrivacyTransaction(pool, signal, async (client) => {
      try {
        await client.query("SET TRANSACTION READ ONLY");
        const role = (
          await client.query<{ canonical: boolean }>(
            "SELECT session_user='creator_runtime' AND current_user=session_user AS canonical",
          )
        ).rows[0];
        invariant(
          role?.canonical === true,
          "agent_preparation_unavailable",
          "Original accounting preparation requires its canonical host pool.",
        );
        return await work(client);
      } catch (error) {
        // A shorter pg read deadline can precede the host timer. Cancel its
        // actual observed source before closing, rather than leaving SQL alive.
        if (querySettlementUncertain(error)) deadline.abort(error);
        throw error;
      }
    });
  } finally {
    clearTimeout(timer);
  }
}
