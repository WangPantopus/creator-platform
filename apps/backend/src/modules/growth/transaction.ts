import { copy } from "@qelvora/copy";
import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";
import { GrowthHeldClient } from "./held-client.js";

function unavailable(code: string, cause: unknown) {
  const error = new DomainError(
    code,
    copy.growthTheServiceIsUnavailablePleaseTryAgain,
    503,
  );
  Object.defineProperty(error, "cause", { value: cause, configurable: true });
  return error;
}

/** Owns only checkout, SQL budgets and settlement of the original client.
 * The caller still owns account/task authority and any external operation.
 */
export async function withGrowthTransaction<T>(
  pool: Pool,
  work: (held: GrowthHeldClient) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const connectionBudget = pool.options.connectionTimeoutMillis;
  if (
    !Number.isFinite(connectionBudget) ||
    !connectionBudget ||
    connectionBudget <= 0 ||
    connectionBudget > 5000 ||
    pool.options.pipeline === true
  )
    throw unavailable(
      "growth_connection_budget_unavailable",
      new Error("A bounded original non-pipelined Growth pool is required."),
    );

  let held: GrowthHeldClient | undefined;
  let failed = false;
  let failure: unknown;
  let value!: T;
  try {
    let client: PoolClient;
    try {
      // Await even cancelled acquisition so no late client escapes cleanup.
      client = await pool.connect();
    } catch (cause) {
      throw unavailable("growth_connection_unavailable", cause);
    }
    held = new GrowthHeldClient(client, signal);
    await held.begin();
    await client.query(
      `SELECT set_config(name,
          least(nullif(setting::integer,0),
            CASE name WHEN 'statement_timeout' THEN 5000 ELSE 2000 END)::text,
          true)
         FROM pg_settings WHERE name IN ('statement_timeout','lock_timeout')`,
    );
    held.assertCurrent();
    // Await the actual callback. A timer race would abandon provider sends or
    // nested transactions while releasing their enclosing erasure fence.
    // SQL cancellation closes this exact client; external work still needs
    // its own physical cancellation/settlement contract.
    value = await work(held);
    signal?.throwIfAborted();
  } catch (cause) {
    failed = true;
    failure =
      signal?.aborted ||
      querySettlementUncertain(cause) ||
      (cause instanceof Error &&
        [
          "growth_begin_receipt_required",
          "growth_commit_receipt_required",
          "growth_client_closed",
        ].includes(cause.message))
        ? unavailable("growth_transaction_unavailable", cause)
        : cause;
  } finally {
    try {
      // Known SQL/domain failures roll back. Unknown BEGIN/query/COMMIT or
      // actual cancellation closes and discards, without speculative SQL.
      await held?.close({ failure: failed ? failure : undefined });
    } catch (cause) {
      failed = true;
      failure = unavailable("growth_client_settlement_unavailable", cause);
    }
  }
  if (failed) throw failure;
  return value;
}

export async function growthTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return withGrowthTransaction(
    pool,
    async (held) => {
      const result = await work(held.client);
      await held.commit();
      return result;
    },
    signal,
  );
}
