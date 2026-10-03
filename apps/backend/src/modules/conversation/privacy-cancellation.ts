import { Client, type Pool, type PoolClient } from "pg";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";

/** Destruction must close this exact source without a pipelined drain. */
export function assertConversationPrivacyPool(pool: Pool): void {
  invariant(
    pool.options.pipeline !== true,
    "conversation_privacy_pool_unconfigured",
    "Use the original non-pipelined privacy connection.",
  );
}

/** Purpose metadata guards retain their private causes. An uncertain response
 * cannot authorize later rollback SQL; a bounded or cyclic graph fails closed. */
export function conversationPrivacyReadUncertain(failure: unknown): boolean {
  if (querySettlementUncertain(failure)) return true;
  const pending = [failure];
  const seen = new Set<Error>();
  while (pending.length) {
    const error = pending.pop();
    if (!(error instanceof Error)) continue;
    if (seen.has(error)) return true;
    seen.add(error);
    if (seen.size > 32) return true;
    if (error.cause !== undefined) pending.push(error.cause);
    if (error instanceof AggregateError) {
      if (error.errors.length > 32) return true;
      pending.push(...error.errors);
    }
  }
  return false;
}

export function conversationPrivacyCause(error: Error, cause: unknown): void {
  Object.defineProperty(error, "cause", {
    value: cause,
    configurable: true,
    writable: true,
  });
}

function boundedTimeout(value: unknown, ceiling: number): number {
  const original =
    typeof value === "number" ||
    (typeof value === "string" && value.trim() !== "")
      ? Number(value)
      : NaN;
  return Number.isFinite(original) && original > 0
    ? Math.min(original, ceiling)
    : ceiling;
}

/** pg's query override replaces its actual connection budget. Preserve a
 * shorter original held-client budget while keeping the existing finite cap
 * when the original connection's deadline is absent or disabled. */
export function conversationPrivacyQueryTimeout(
  source: PoolClient,
  ceiling: number,
): number {
  return boundedTimeout(
    (
      source as PoolClient & {
        connectionParameters?: { query_timeout?: unknown };
      }
    ).connectionParameters?.query_timeout,
    ceiling,
  );
}

/** Only the PID observed from the caller's still-held source client. The
 * caller keeps that client checked out until cancellation and this control
 * socket's close settle; uncertain cancellation requires source destruction. */
export async function cancelConversationPrivacyBackend(
  pool: Pool,
  observedPid: number,
  source: PoolClient,
): Promise<void> {
  const pid = z.int().positive().max(2147483647).parse(observedPid);
  const control = new Client({
    ...pool.options,
    connectionTimeoutMillis: boundedTimeout(
      pool.options.connectionTimeoutMillis,
      1500,
    ),
    statement_timeout: 1500,
    query_timeout: conversationPrivacyQueryTimeout(source, 1500),
    pipeline: false,
  });
  const failures: unknown[] = [];
  const onError = (error: Error) => failures.push(error);
  control.on("error", onError);
  try {
    await control.connect();
    const result = await control.query<{ cancelled: boolean }>(
      "SELECT pg_cancel_backend($1) AS cancelled",
      [pid],
    );
    invariant(
      result.rows[0]?.cancelled === true,
      "conversation_privacy_cancel_unavailable",
      "The actual held privacy backend could not be cancelled.",
    );
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      await control.end();
    } catch (error) {
      failures.push(error);
    } finally {
      control.removeListener("error", onError);
    }
  }
  if (failures.length)
    throw new AggregateError(
      [...new Set(failures)],
      "Original privacy cancellation and control close failed.",
    );
}
