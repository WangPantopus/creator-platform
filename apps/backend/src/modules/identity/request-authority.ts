import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";

export const requestAuthority = new AsyncLocalStorage<
  Readonly<{ accountId: string; sessionId: string }>
>();

/** Lock the session for the duration of the domain transaction. Revocation waits for
 * in-flight work, and any transaction starting after revocation is denied. */
export async function assertCurrentSession(
  client: PoolClient,
  accountId: string,
) {
  const authority = requestAuthority.getStore();
  if (!authority) return; // Purpose-scoped jobs and host adapters have their own authority.
  if (authority.accountId !== accountId)
    throw new DomainError(
      "session_account_changed",
      "Sign in with the account that owns this action.",
      401,
    );
  const result = await client.query(
    "SELECT id FROM creator.identity_session WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE",
    [authority.sessionId, accountId],
  );
  if (result.rowCount !== 1)
    throw new DomainError(
      "session_expired",
      "Your session ended. Continue with Pantopus again.",
      401,
    );
}
