import { Client, type Pool, type PoolClient } from "pg";
import { DomainError, invariant } from "../../core/errors.js";

/** Custody for the original generation or terminal pool. Cancellation supplies
 * no purpose permission: its PID comes only from this checked-out connection.
 * The caller performs BEGIN, every authority bookend and scope cleanup; this
 * function alone commits after cancellation has settled.
 */
export async function generationTransaction<T>(
  pool: Pool,
  signal: AbortSignal | undefined,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  signal?.throwIfAborted();
  const client = await pool.connect();
  let pid: number | undefined;
  let cancelling: Promise<void> | undefined;
  let cancellationFailure: unknown;
  let transportFailure: unknown;
  let discard = false;
  const sourceError = (error: Error) => {
    transportFailure = error;
    discard = true;
  };
  client.on("error", sourceError);
  const abort = () => {
    if (!pid || cancelling) return;
    // Keep the source checked out until the separate, bounded control socket
    // closes. A delayed cancel must never reach a later user of this PID.
    cancelling = (async () => {
      const control = new Client({
        ...pool.options,
        connectionTimeoutMillis: 1500,
        statement_timeout: 1500,
        query_timeout: 1500,
        pipeline: false,
      });
      control.on("error", (error: Error) => {
        cancellationFailure = error;
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
      } finally {
        await control.end();
      }
    })().catch((error: unknown) => {
      cancellationFailure = error;
      discard = true;
    });
  };
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
    signal?.addEventListener("abort", abort, { once: true });
    signal?.throwIfAborted();
    const value = await work(client);
    await settle();
    if (cancellationFailure || transportFailure)
      throw new DomainError(
        "generation_transaction_unavailable",
        "The original generation transaction could not settle safely.",
        503,
      );
    signal?.throwIfAborted();
    // Cancellation is closed before this atomic commit. Later aborts cannot
    // cancel COMMIT or discard its actual receipt as if it never happened.
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await settle();
    let rollbackFailure: unknown;
    if (cancellationFailure || transportFailure) {
      // A transport failure cannot prove that the server consumed a cancel.
      // Close the original socket without submitting any subsequent SQL.
      discard = true;
      await client.end().catch((cause: unknown) => {
        rollbackFailure = cause;
      });
    } else {
      try {
        await client.query("ROLLBACK");
      } catch (cause) {
        rollbackFailure = cause;
        discard = true;
      }
    }
    if (cancellationFailure || transportFailure || rollbackFailure) {
      const failure = new DomainError(
        cancellationFailure
          ? "generation_cancel_unavailable"
          : "generation_rollback_unavailable",
        "The original generation transaction could not settle safely.",
        503,
      );
      failure.cause = new AggregateError(
        [error, transportFailure, cancellationFailure, rollbackFailure].filter(
          (cause) => cause !== undefined,
        ),
        "Original generation and settlement failures.",
      );
      throw failure;
    }
    throw error;
  } finally {
    await settle();
    client.release(discard);
    client.removeListener("error", sourceError);
  }
}
