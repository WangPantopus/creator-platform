import type { Pool, PoolClient } from "pg";
import { assertCurrentSession } from "./request-authority.js";
export async function identityTransaction<T>(
  pool: Pool,
  accountId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('statement_timeout','5000',true), set_config('lock_timeout','2000',true)",
    );
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      accountId,
    ]);
    await assertCurrentSession(client, accountId);
    const value = await work(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
