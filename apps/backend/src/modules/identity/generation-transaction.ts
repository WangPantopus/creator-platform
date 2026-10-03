import { Client, type Pool, type PoolClient } from "pg";
import { DomainError, invariant } from "../../core/errors.js";

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
  signal?.throwIfAborted();
  const client = await pool.connect();
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
      phase !== "work" ||
      (error instanceof Error && error.message === "Query read timeout");
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
    );
    unavailable.cause = new AggregateError(
      [
        ...(failed ? [failure] : []),
        ...transportFailures,
        ...cancellationFailures,
        ...cleanupFailures,
      ],
      committed
        ? "Committed generation connection cleanup failures."
        : "Original generation and settlement failures.",
    );
    throw unavailable;
  }
  if (failed) throw failure;
  return value as T;
}
