import { Client, type Pool, type PoolClient } from "pg";
import { DomainError, invariant } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";

/** Cancellation uses the original pool's shorter positive acquisition budget. */
export function agentPrivacyConnectionTimeout(pool: Pool): number {
  const configured = pool.options.connectionTimeoutMillis;
  const original =
    typeof configured === "number" || typeof configured === "string"
      ? Number(configured)
      : NaN;
  return Number.isFinite(original) && original > 0
    ? Math.min(original, 1500)
    : 1500;
}

/** A per-query pg option replaces its connection budget. Keep a shorter
 * positive original budget, including pg's numeric environment form. */
export function agentPrivacyQueryTimeout(
  client: PoolClient,
  ceiling = 5000,
): number {
  const configured = (
    client as PoolClient & {
      connectionParameters?: { query_timeout?: unknown };
    }
  ).connectionParameters?.query_timeout;
  const original =
    typeof configured === "number" || typeof configured === "string"
      ? Number(configured)
      : NaN;
  return Number.isFinite(original) && original > 0
    ? Math.min(original, ceiling)
    : ceiling;
}

const boundedQuery = (client: PoolClient, text: string) => ({
  text,
  query_timeout: agentPrivacyQueryTimeout(client),
});

/** A private cause can wrap an uncertain response. It never grants task authority. */
export function uncertainAgentReadResponse(failure: unknown): boolean {
  return querySettlementUncertain(failure);
}

/** The caller supplies every actual W8 task, ownership and restoration fence.
 * This owns only the exact pool checkout, cancellation and atomic transaction.
 * Cancellation settles and closes that original socket before pool release.
 */
export async function agentPrivacyTransaction<T>(
  pool: Pool,
  parent: AbortSignal,
  work: (client: PoolClient) => Promise<T>,
  isolation: "READ COMMITTED" | "REPEATABLE READ" = "READ COMMITTED",
): Promise<T> {
  if (
    !Number.isSafeInteger(pool.options.connectionTimeoutMillis) ||
    pool.options.connectionTimeoutMillis! < 1 ||
    pool.options.connectionTimeoutMillis! > 5000 ||
    pool.options.pipeline === true ||
    !["READ COMMITTED", "REPEATABLE READ"].includes(isolation)
  )
    throw new DomainError(
      "privacy_connection_unconfigured",
      "Use the bounded original non-pipelined Agent pool.",
      503,
    );
  const signal = AbortSignal.any([parent, AbortSignal.timeout(45_000)]);
  signal.throwIfAborted();
  const client = await pool.connect();
  let pid: number | undefined;
  let phase: "pid" | "begin" | "work" | "commit" = "pid";
  let discard = false;
  let committed = false;
  let failed = false;
  let failure: unknown;
  let value: T | undefined;
  const transport: unknown[] = [];
  const cleanup: unknown[] = [];
  let cancelling: Promise<void> | undefined;
  let ending: Promise<void> | undefined;
  const endSource = () =>
    (ending ??= client.end().catch((error: unknown) => {
      cleanup.push(error);
    }));
  const onError = (error: Error) => {
    transport.push(error);
    discard = true;
  };
  client.on("error", onError);
  const abort = () => {
    if (cancelling) return;
    discard = true;
    cancelling = (async () => {
      if (pid !== undefined) {
        const control = new Client({
          ...pool.options,
          connectionTimeoutMillis: agentPrivacyConnectionTimeout(pool),
          statement_timeout: 1500,
          query_timeout: agentPrivacyQueryTimeout(client, 1500),
          pipeline: false,
        });
        const onControlError = (error: Error) => cleanup.push(error);
        control.on("error", onControlError);
        try {
          await control.connect();
          const result = await control.query<{ cancelled: boolean }>(
            "SELECT pg_cancel_backend($1) AS cancelled",
            [pid],
          );
          invariant(
            result.rows[0]?.cancelled === true,
            "privacy_cancel_unavailable",
            "The actual held Agent source could not be cancelled.",
          );
        } catch (error) {
          cleanup.push(error);
        } finally {
          await control.end().catch((error: unknown) => cleanup.push(error));
          control.removeListener("error", onControlError);
        }
      }
      // Even a dropped source reply cannot leave cancellation waiting on SQL.
      // Disconnect rolls back; no guessed PID or later cleanup SQL is submitted.
      await endSource();
    })().catch((error: unknown) => {
      cleanup.push(error);
    });
  };
  signal.addEventListener("abort", abort, { once: true });
  const settle = async () => {
    signal.removeEventListener("abort", abort);
    await cancelling;
  };
  try {
    signal.throwIfAborted();
    const actual = (
      await client.query(boundedQuery(client, "SELECT pg_backend_pid() AS pid"))
    ).rows[0]?.pid;
    invariant(
      Number.isSafeInteger(actual) && actual > 0,
      "privacy_cancel_unavailable",
      "Use the backend PID observed on this exact held source.",
    );
    pid = actual;
    signal.throwIfAborted();
    phase = "begin";
    await client.query(
      boundedQuery(client, `BEGIN ISOLATION LEVEL ${isolation}`),
    );
    phase = "work";
    await client.query(
      "SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'",
    );
    value = await work(client);
    await settle();
    signal.throwIfAborted();
    if (discard || cleanup.length || transport.length)
      throw new Error("Agent privacy connection could not settle safely");
    // The actual final task fence is inside work. Close cancellation before the
    // sole COMMIT; a late abort cannot contradict a committed server receipt.
    phase = "commit";
    const receipt = await client.query(boundedQuery(client, "COMMIT"));
    invariant(
      receipt.command === "COMMIT",
      "privacy_commit_unavailable",
      "The actual Agent privacy commit receipt is required.",
    );
    committed = true;
  } catch (error) {
    failed = true;
    failure = error;
    await settle();
    discard ||=
      phase !== "work" ||
      transport.length > 0 ||
      uncertainAgentReadResponse(error);
    if (!discard) {
      try {
        await client.query(boundedQuery(client, "ROLLBACK"));
      } catch (error) {
        cleanup.push(error);
        discard = true;
      }
    }
  } finally {
    await settle();
    if (discard) await endSource();
    try {
      client.release(discard);
    } catch (error) {
      cleanup.push(error);
    }
    client.removeListener("error", onError);
  }
  if (cleanup.length || transport.length || (failed && phase === "commit")) {
    const error = new DomainError(
      committed
        ? "privacy_release_unavailable"
        : phase === "commit"
          ? "privacy_commit_uncertain"
          : "privacy_cleanup_unavailable",
      committed
        ? "Agent privacy committed but connection cleanup failed. Reconcile its actual receipt."
        : phase === "commit"
          ? "The Agent privacy commit response is uncertain. Reconcile the actual job before retrying."
          : "The actual Agent privacy connection could not settle safely.",
      503,
    );
    Object.defineProperty(error, "cause", {
      value: new AggregateError(
        [...(failed ? [failure] : []), ...transport, ...cleanup],
        "Original Agent privacy and connection failures",
      ),
      configurable: true,
    });
    throw error;
  }
  if (failed) throw failure;
  return value as T;
}
