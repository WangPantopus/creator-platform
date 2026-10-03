import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";

/** Only the labelled loopback development host. This checks current database
 * closure on the caller's held transaction; it does not attest production
 * recovery, tombstone replay or domain reconciliation. */
export function trustLocalRestorationInTransaction(
  env: NodeJS.ProcessEnv = process.env,
) {
  let database: string | undefined;
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.search &&
      !url.hash
    )
      database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    // A missing or malformed URL cannot enable a restoration authority.
  }
  if (
    env.NODE_ENV !== "development" ||
    env.TRUST_LOCAL_DEVELOPMENT !== "true" ||
    !database ||
    !/^[a-zA-Z0-9_-]{1,63}$/.test(database)
  )
    throw new DomainError(
      "local_restoration_unconfigured",
      "Configure the explicit loopback development restoration authority.",
      503,
    );

  return async (client: PoolClient): Promise<boolean> => {
    if (env.RESTORED_TRAFFIC_DISABLED === "true" || env.RESTORED_DATABASE_NAME)
      return false;
    // SAVEPOINT rejects a checked-out but idle client. Never open a transaction
    // here or borrow another pool: the caller owns its family and lifecycle.
    await client.query("SAVEPOINT w8_held_restoration");
    let completed = false;
    try {
      const state = await client.query<{
        database: string;
        isolation: string;
        closed: boolean | null;
        connections: number;
      }>(
        `SELECT current_database() AS database,
         current_setting('transaction_isolation') AS isolation,
         shobj_description(oid,'pg_database')='creator-platform:restored-traffic-closed' AS closed,
         datconnlimit AS connections FROM pg_database WHERE datname=current_database()`,
      );
      const row = state.rows[0];
      completed = true;
      return (
        state.rows.length === 1 &&
        row?.database === database &&
        row.isolation === "read committed" &&
        row.closed !== true &&
        row.connections !== 0
      );
    } finally {
      // A failed response stays with the original transaction owner. Helper
      // cleanup cannot settle an unknown read by sending more source SQL.
      if (completed)
        await client.query("RELEASE SAVEPOINT w8_held_restoration");
    }
  };
}
