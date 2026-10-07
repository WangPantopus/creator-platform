import type { Pool, QueryConfig } from "pg";
import { DomainError, invariant } from "../../core/errors.js";
import { requestAuthority } from "./request-authority.js";

/** Startup metadata on the actual canonical host pool. Its normal interactive
 * budget stays unchanged. A timed-out or cancelled read closes and drains its
 * original connection before release; no abandoned query can reach reuse. */
export async function generationHostDatabase(
  pool: Pool,
  signal?: AbortSignal,
): Promise<Readonly<{ database: string; oid: number }>> {
  const acquisition = pool.options.connectionTimeoutMillis;
  const original = pool.options.query_timeout;
  invariant(
    !requestAuthority.getStore() &&
      Number.isSafeInteger(acquisition) &&
      acquisition! > 0 &&
      acquisition! <= 5000 &&
      pool.options.pipeline !== true &&
      (original === undefined ||
        original === 0 ||
        (Number.isSafeInteger(original) && original > 0)),
    "generation_host_connection_unconfigured",
    "Use the bounded original canonical host connection outside requests.",
  );
  signal?.throwIfAborted();
  const client = await pool.connect();
  let closing: Promise<void> | undefined;
  const cleanup: unknown[] = [];
  const transport: unknown[] = [];
  let failed = false;
  let failure: unknown;
  let result: { database: string; oid: number } | undefined;
  const close = () => {
    closing ??= Promise.resolve()
      .then(() => client.end())
      .catch((error: unknown) => {
        cleanup.push(error);
      });
  };
  const onError = (error: Error) => {
    transport.push(error);
    close();
  };
  const abort = () => close();
  client.on("error", onError);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const query: QueryConfig & { query_timeout: number } = {
      text: `SELECT current_database() AS database,oid,
       session_user='creator_runtime' AND current_user=session_user AS canonical
       FROM pg_database WHERE datname=current_database()`,
      query_timeout: original ? Math.min(original, 5000) : 5000,
    };
    const observed = (
      await client.query<{
        database: string;
        oid: number;
        canonical: boolean;
      }>(query)
    ).rows[0];
    signal?.throwIfAborted();
    invariant(
      observed?.canonical === true &&
        typeof observed.database === "string" &&
        observed.database.length > 0 &&
        Number.isSafeInteger(observed.oid) &&
        observed.oid > 0,
      "generation_host_connection_unconfigured",
      "Generation requires the actual canonical host database identity.",
    );
    result = { database: observed.database, oid: observed.oid };
  } catch (error) {
    failed = true;
    failure = error;
    close();
  } finally {
    signal?.removeEventListener("abort", abort);
    await closing;
    try {
      client.release(Boolean(closing));
    } catch (error) {
      cleanup.push(error);
    }
    client.removeListener("error", onError);
  }
  if (transport.length || cleanup.length)
    throw new DomainError(
      "generation_host_cleanup_unavailable",
      "The original canonical metadata connection did not close cleanly.",
      503,
      {
        cause: new AggregateError([
          ...(failed ? [failure] : []),
          ...transport,
          ...cleanup,
        ]),
      },
    );
  if (failed) throw failure;
  return Object.freeze(result!);
}
