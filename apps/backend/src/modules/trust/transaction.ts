import type { Pool, PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";
import { ContentHeldClient } from "../content/held-client-cleanup.js";

function unavailable(code: string, cause: unknown) {
  const error = new DomainError(
    code,
    "The trust data service is unavailable. Try again.",
    503,
  );
  Object.defineProperty(error, "cause", { value: cause, configurable: true });
  return error;
}

/** Reuse the existing source-settlement implementation, without borrowing
 * Content authority. The callback receives the actual original PoolClient.
 * This host's five-second budget is not an invented request/task signal.
 * Actual caller cancellation, when supplied, remains an independent boundary. */
export async function trustTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
  options: Readonly<{
    readOnly?: boolean;
    isolation?: "read committed";
    signal?: AbortSignal;
  }> = {},
): Promise<T> {
  options.signal?.throwIfAborted();
  const connectionBudget = pool.options.connectionTimeoutMillis;
  if (
    !Number.isFinite(connectionBudget) ||
    !connectionBudget ||
    connectionBudget <= 0 ||
    connectionBudget > 5000
  )
    throw unavailable(
      "trust_connection_budget_unavailable",
      new Error("A finite original pool connection budget is required."),
    );
  const deadline = new AbortController();
  const timer = setTimeout(() => {
    const cause = Object.assign(
      new Error("The actual Trust transaction budget expired."),
      { code: "ETIMEDOUT" },
    );
    deadline.abort(cause);
  }, 5000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, deadline.signal])
    : deadline.signal;
  let held: ContentHeldClient | undefined;
  let failed = false;
  let failure: unknown;
  let result!: T;
  try {
    // Await the bounded acquisition. Never abandon a late borrowed client.
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch (cause) {
      throw unavailable("trust_connection_unavailable", cause);
    }
    held = new ContentHeldClient(client, signal, pool);
    await held.begin();
    if (options.isolation === "read committed")
      await held.run(() =>
        client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED"),
      );
    // The core pool does not set a server timeout. Bound its actual source
    // query too, preserving any shorter existing timeout on this client.
    await held.run(() =>
      client.query(
        `SELECT set_config('statement_timeout',
          least(nullif(setting::integer,0),5000)::text,true)
         FROM pg_settings WHERE name='statement_timeout'`,
      ),
    );
    if (options.readOnly)
      await held.run(() => client.query("SET TRANSACTION READ ONLY"));
    // Cancellation interrupts the actual database source, but cannot release
    // its client while the original owner callback or finalizer still runs.
    result = await work(client);
    signal.throwIfAborted();
    if (!options.readOnly) await held.commit();
  } catch (cause) {
    // A shorter pg read budget can reject before the host deadline while the
    // server still runs its query. Cancel that same observed source as well.
    if (querySettlementUncertain(cause) && !signal.aborted)
      deadline.abort(cause);
    failed = true;
    failure =
      // Preserve only this caller's original cooperative cancellation. The
      // held source still settles below; a cleanup failure replaces it and
      // rejects the lifetime. Internal deadlines and database errors remain
      // unavailable, even when the caller concurrently cancels.
      options.signal?.aborted && cause === options.signal.reason
        ? cause
        : signal.aborted ||
            querySettlementUncertain(cause) ||
            (cause instanceof DomainError &&
              [
                "content_privacy_begin_unavailable",
                "content_privacy_commit_unavailable",
              ].includes(cause.code))
          ? unavailable("trust_transaction_unavailable", cause)
          : cause;
  } finally {
    try {
      // Unknown BEGIN/read/COMMIT or actual abort closes this exact source,
      // then discards it. No later SQL, assumed rollback or success receipt.
      await held?.settle(failed ? failure : undefined);
    } catch (cause) {
      failed = true;
      failure = unavailable("trust_client_settlement_unavailable", cause);
    } finally {
      clearTimeout(timer);
    }
  }
  if (failed) throw failure;
  return result;
}
