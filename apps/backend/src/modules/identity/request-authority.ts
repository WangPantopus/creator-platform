import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";
import { DomainError } from "../../core/errors.js";
import type { Actor } from "./adapter.js";

export const requestAuthority = new AsyncLocalStorage<
  Readonly<{
    accountId: string;
    sessionId: string;
    /** Supplied only by the real session-resolution middleware. Older host
     * adapters may carry account/session context, but cannot issue a request
     * bootstrap capability without current provider-confirmed adulthood. */
    actor?: Actor;
    adultVerifiedAt?: string;
  }>
>();

const heldRequestBrand: unique symbol = Symbol("HeldCurrentRequestSession");
export type HeldCurrentRequestSession = Readonly<{
  [heldRequestBrand]: true;
  accountId: string;
  sessionId: string;
  actor: Actor;
  adultVerifiedAt: string;
}>;
const heldRequests = new WeakMap<
  HeldCurrentRequestSession,
  {
    client: PoolClient;
    transaction: string;
    pid: number;
    request: NonNullable<ReturnType<typeof requestAuthority.getStore>>;
  }
>();

/** Bootstrap only the actual current request before its family is known.
 * Call inside an explicit READ COMMITTED transaction, before domain locks.
 * This supplies no creator/thread, participant lookup, Access grant or Trust
 * permission. Consumers must hold restoration and actual participant
 * negatives on this same client before returning any metadata or effects. */
export async function holdCurrentRequestSession(
  client: PoolClient,
  accountId: string,
): Promise<HeldCurrentRequestSession> {
  const request = requestAuthority.getStore();
  const verifiedAt = Date.parse(request?.adultVerifiedAt ?? "");
  if (
    !request ||
    request.accountId !== accountId ||
    request.actor?.accountId !== accountId ||
    request.actor.adultEligible !== true ||
    !Number.isFinite(verifiedAt) ||
    verifiedAt > Date.now() + 30000 ||
    Date.now() - verifiedAt > 300000
  )
    throw new DomainError(
      "current_request_session_required",
      "Reopen this action with your current signed-in account.",
      401,
    );
  // A statement's implicit transaction must never masquerade as a held
  // transaction. SAVEPOINT fails outside the caller's actual BEGIN.
  await client.query("SAVEPOINT w1_current_request_session");
  await client.query("RELEASE SAVEPOINT w1_current_request_session");
  const context = (
    await client.query<{
      transaction: string;
      pid: number;
      role: string;
      login: string;
      isolation: string;
      account: string | null;
      session: string | null;
    }>(
      `SELECT pg_current_xact_id()::text AS transaction, pg_backend_pid() AS pid,
       current_user AS role, session_user AS login,
       current_setting('transaction_isolation') AS isolation,
       nullif(current_setting('app.account_id',true),'') AS account,
       nullif(current_setting('app.identity_session_id',true),'') AS session`,
    )
  ).rows[0];
  if (
    !context?.transaction ||
    context.role !== "creator_runtime" ||
    context.login !== context.role ||
    context.isolation !== "read committed" ||
    (context.account !== null && context.account !== request.accountId) ||
    (context.session !== null && context.session !== request.sessionId)
  )
    throw new DomainError(
      "current_request_transaction_required",
      "The current account transaction is unavailable. Try again.",
      503,
    );
  await client.query("SELECT set_config('app.account_id',$1,true)", [
    request.accountId,
  ]);
  await assertCurrentSession(client, request.accountId);
  const held: HeldCurrentRequestSession = Object.freeze({
    [heldRequestBrand]: true as const,
    accountId: request.accountId,
    sessionId: request.sessionId,
    actor: request.actor,
    adultVerifiedAt: new Date(verifiedAt).toISOString(),
  });
  heldRequests.set(held, {
    client,
    transaction: context.transaction,
    pid: context.pid,
    request,
  });
  return held;
}

/** Recheck the opaque issuer result at every metadata bookend, on the exact
 * original client/transaction/request. Retention, serialization, another
 * request, another pool client and COMMIT/ROLLBACK cannot carry authority.
 * The original issuer already holds the session row. Bookends read current
 * metadata/clock only: they acquire no row locks and change no GUCs. */
export async function assertHeldCurrentRequestSession(
  held: HeldCurrentRequestSession,
  client: PoolClient,
): Promise<void> {
  const binding = heldRequests.get(held);
  if (
    !binding ||
    binding.client !== client ||
    requestAuthority.getStore() !== binding.request
  )
    throw new DomainError(
      "held_request_session_required",
      "Reopen this action with your current signed-in account.",
      401,
    );
  const context = (
    await client.query<{ current: boolean }>(
      `SELECT pg_current_xact_id_if_assigned()::text=$1
       AND pg_backend_pid()=$2 AND current_user='creator_runtime'
       AND session_user=current_user
       AND current_setting('transaction_isolation')='read committed'
       AND nullif(current_setting('app.account_id',true),'')=$3
       AND nullif(current_setting('app.identity_session_id',true),'')=$4
       AND EXISTS(SELECT FROM creator.identity_session s
        WHERE s.id=$4::uuid AND s.account_id=$3::uuid AND s.revoked_at IS NULL
         AND s.expires_at>clock_timestamp()) AS current`,
      [binding.transaction, binding.pid, held.accountId, held.sessionId],
    )
  ).rows[0];
  if (context?.current !== true)
    throw new DomainError(
      "held_request_transaction_ended",
      "This account action ended or changed. Reopen it and try again.",
      401,
    );
}

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
  // Participant-bounded RLS may use this ID only after the actual request
  // session has been checked and held through the domain transaction. It is
  // transaction-local, never an account substitute or a worker credential.
  await client.query("SELECT set_config('app.identity_session_id',$1,true)", [
    authority.sessionId,
  ]);
}
