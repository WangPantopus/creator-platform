import { copy } from "@qelvora/copy";
import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";
import { ContentHeldClient } from "../content/held-client-cleanup.js";

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
export async function growthTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
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

  let held: ContentHeldClient | undefined;
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
    held = new ContentHeldClient(client, signal);
    await held.begin();
    await held.run(() =>
      client.query(
        `SELECT set_config(name,
          least(nullif(setting::integer,0),
            CASE name WHEN 'statement_timeout' THEN 5000 ELSE 2000 END)::text,
          true)
         FROM pg_settings WHERE name IN ('statement_timeout','lock_timeout')`,
      ),
    );
    // Await the actual callback. A timer race would abandon provider sends or
    // nested transactions while releasing their enclosing erasure fence.
    // SQL cancellation closes this exact client; external work still needs
    // its own physical cancellation/settlement contract.
    value = await work(client);
    signal?.throwIfAborted();
    await held.commit();
  } catch (cause) {
    failed = true;
    failure =
      signal?.aborted ||
      querySettlementUncertain(cause) ||
      (cause instanceof DomainError &&
        [
          "content_privacy_begin_unavailable",
          "content_privacy_commit_unavailable",
        ].includes(cause.code))
        ? unavailable("growth_transaction_unavailable", cause)
        : cause;
  } finally {
    try {
      // Known SQL/domain failures roll back. Unknown BEGIN/query/COMMIT or
      // actual cancellation closes and discards, without speculative SQL.
      await held?.settle(failed ? failure : undefined);
    } catch (cause) {
      failed = true;
      failure = unavailable("growth_client_settlement_unavailable", cause);
    }
  }
  if (failed) throw failure;
  return value;
}
