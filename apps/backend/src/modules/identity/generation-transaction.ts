import { Client, type Pool, type PoolClient } from "pg";
import { DomainError, invariant } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";

/** The original worker must have a finite one-connection acquisition/read
 * budget and no pipelined
 * drain that could postpone destruction of an uncertain original session. */
export function assertGenerationPoolCustody(pool: Pool): void {
  const { max, connectionTimeoutMillis, query_timeout, pipeline } =
    pool.options;
  if (
    max !== 1 ||
    !Number.isSafeInteger(connectionTimeoutMillis) ||
    connectionTimeoutMillis! < 1 ||
    connectionTimeoutMillis! > 5000 ||
    !Number.isSafeInteger(query_timeout) ||
    query_timeout! < 1 ||
    query_timeout! > 5000 ||
    pipeline === true
  )
    throw new DomainError(
      "generation_pool_unconfigured",
      "The bounded original generation connection is unavailable.",
      503,
    );
}

/** Custody for the original generation or terminal pool. Cancellation supplies
 * no purpose permission: its PID comes only from this checked-out connection.
 * This function owns BEGIN and COMMIT. The caller performs every authority
 * bookend and scope cleanup before cancellation settles and commit begins.
 */
export async function generationTransaction<T>(
  pool: Pool,
  signal: AbortSignal | undefined,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  assertGenerationPoolCustody(pool);
  const controlConnectionTimeout = Math.min(
    pool.options.connectionTimeoutMillis!,
    1500,
  );
  const controlQueryTimeout = Math.min(pool.options.query_timeout!, 1500);
  signal?.throwIfAborted();
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    const failure = new DomainError(
      signal?.aborted
        ? "generation_acquisition_cancelled"
        : "generation_connection_unavailable",
      "The bounded original generation connection is unavailable.",
      503,
      {
        cause: new AggregateError(
          signal?.aborted ? [signal.reason, error] : [error],
          "Original generation connection acquisition failed.",
        ),
      },
    );
    throw failure;
  }
  let pid: number | undefined;
  let cancelling: Promise<void> | undefined;
  const cancellationFailures: unknown[] = [];
  const transportFailures: unknown[] = [];
  const cleanupFailures: unknown[] = [];
  let failure: unknown;
  let failed = false;
  let value: T | undefined;
  let committed = false;
  let phase: "pid" | "begin" | "work" | "commit" = "pid";
  let discard = false;
  const sourceError = (error: Error) => {
    transportFailures.push(error);
    discard = true;
  };
  client.on("error", sourceError);
  const abort = () => {
    if (cancelling) return;
    if (!pid) {
      // There is an actual held source but no observed PID yet. Close that
      // exact non-pipelined socket; never guess a PID or submit later SQL.
      discard = true;
      cancelling = client.end().catch((error: unknown) => {
        cancellationFailures.push(error);
      });
      return;
    }
    // Keep the source checked out until the separate, bounded control socket
    // closes. A delayed cancel must never reach a later user of this PID.
    cancelling = (async () => {
      const control = new Client({
        ...pool.options,
        connectionTimeoutMillis: controlConnectionTimeout,
        statement_timeout: controlQueryTimeout,
        query_timeout: controlQueryTimeout,
        pipeline: false,
      });
      control.on("error", (error: Error) => {
        cancellationFailures.push(error);
        discard = true;
      });
      try {
        await control.connect();
        const result = await control.query<{ cancelled: boolean }>(
          "SELECT pg_cancel_backend($1) AS cancelled",
          [pid],
        );
        invariant(
          result.rows[0]?.cancelled === true,
          "generation_cancel_unavailable",
          "The original generation backend could not be cancelled.",
        );
      } catch (error) {
        cancellationFailures.push(error);
        discard = true;
      } finally {
        await control.end().catch((error: unknown) => {
          cancellationFailures.push(error);
          discard = true;
        });
      }
    })().catch((error: unknown) => {
      cancellationFailures.push(error);
      discard = true;
    });
  };
  signal?.addEventListener("abort", abort, { once: true });
  const settle = async () => {
    signal?.removeEventListener("abort", abort);
    await cancelling;
  };
  try {
    signal?.throwIfAborted();
    const observed = (await client.query("SELECT pg_backend_pid() AS pid"))
      .rows[0]?.pid;
    invariant(
      Number.isSafeInteger(observed) && observed > 0,
      "generation_cancel_unavailable",
      "The original generation backend is required.",
    );
    pid = observed;
    signal?.throwIfAborted();
    phase = "begin";
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    phase = "work";
    value = await work(client);
    await settle();
    if (cancellationFailures.length || transportFailures.length)
      throw new DomainError(
        "generation_transaction_unavailable",
        "The original generation transaction could not settle safely.",
        503,
      );
    signal?.throwIfAborted();
    // Cancellation is closed before this atomic commit. Later aborts cannot
    // cancel COMMIT or discard its actual receipt as if it never happened.
    phase = "commit";
    const receipt = await client.query("COMMIT");
    invariant(
      receipt.command === "COMMIT",
      "generation_commit_unavailable",
      "The original generation commit did not return a commit receipt.",
    );
    committed = true;
  } catch (error) {
    failed = true;
    failure = error;
    await settle();
    const uncertainResponse =
      phase !== "work" || querySettlementUncertain(error);
    if (uncertainResponse) transportFailures.push(error);
    if (
      uncertainResponse ||
      cancellationFailures.length ||
      transportFailures.length
    ) {
      // A transport failure cannot prove that the server consumed a cancel.
      // Close the original socket without submitting any subsequent SQL.
      discard = true;
    } else {
      try {
        await client.query("ROLLBACK");
      } catch (cause) {
        cleanupFailures.push(cause);
        discard = true;
      }
    }
  } finally {
    await settle();
    // Await destruction for every uncertain transport or failed rollback,
    // before release. Preserve end/release failures alongside the first cause.
    if (discard)
      await client.end().catch((error: unknown) => {
        cleanupFailures.push(error);
      });
    try {
      client.release(discard);
    } catch (error) {
      cleanupFailures.push(error);
    }
    client.removeListener("error", sourceError);
  }
  if (
    cancellationFailures.length ||
    transportFailures.length ||
    cleanupFailures.length
  ) {
    const unavailable = new DomainError(
      cancellationFailures.length
        ? "generation_cancel_unavailable"
        : committed
          ? "generation_release_unavailable"
          : "generation_rollback_unavailable",
      committed
        ? "The generation committed but its connection cleanup failed. Reconcile its actual receipt."
        : "The original generation transaction could not settle safely.",
      503,
      {
        cause: new AggregateError(
          [
            ...(failed ? [failure] : []),
            ...transportFailures,
            ...cancellationFailures,
            ...cleanupFailures,
          ],
          committed
            ? "Committed generation connection cleanup failures."
            : "Original generation and settlement failures.",
        ),
      },
    );
    throw unavailable;
  }
  if (failed) throw failure;
  return value as T;
}
