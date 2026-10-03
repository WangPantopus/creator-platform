import type { Pool, PoolClient } from "pg";
import { assertCurrentSession } from "./request-authority.js";
import { ContentHeldClient } from "../content/held-client-cleanup.js";
export async function identityTransaction<T>(
  pool: Pool,
  accountId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  // An actual host read budget; this is not an incoming request/task signal.
  const held = new ContentHeldClient(client, AbortSignal.timeout(5000));
  let failure: unknown;
  try {
    await held.begin();
    await held.run(() =>
      client.query(
        "SELECT set_config('statement_timeout','5000',true), set_config('lock_timeout','2000',true)",
      ),
    );
    await held.run(() =>
      client.query("SELECT set_config('app.account_id',$1,true)", [accountId]),
    );
    // Await the complete owner callback. The original host deadline may close
    // its socket, but cannot release it while a late continuation still runs.
    await assertCurrentSession(client, accountId);
    const value = await work(client);
    await held.commit();
    return value;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await held.settle(failure);
  }
}
