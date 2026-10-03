import { Client, type Pool } from "pg";
import { z } from "zod";
import { invariant } from "../../core/errors.js";

/** Only the PID observed from the caller's still-held source client. The
 * caller keeps that client checked out until cancellation and this control
 * socket's close settle; uncertain cancellation requires source destruction. */
export async function cancelConversationPrivacyBackend(
  pool: Pool,
  observedPid: number,
): Promise<void> {
  const pid = z.int().positive().max(2147483647).parse(observedPid);
  const control = new Client({
    ...pool.options,
    connectionTimeoutMillis: 1500,
    statement_timeout: 1500,
    query_timeout: 1500,
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
