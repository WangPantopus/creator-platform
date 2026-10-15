import type { Pool, PoolClient } from "pg";

type Verify = () => Promise<void>;
/** One ledger per open original generation or terminal transaction. */
const held = new WeakMap<object, Map<object, Verify>>();

/** Owned by generationTransaction only: opened after its BEGIN. */
export function openHeldVerification(client: PoolClient): void {
  held.set(client, new Map());
}

/** Owned by generationTransaction only: the end bookend, after the work and
 * before COMMIT. Every reviewed check that ran in this transaction runs again,
 * in the order it first ran, so drift at any point in between rolls the whole
 * transaction back before anything it read or wrote is used or committed. */
export async function closeHeldVerification(client: PoolClient): Promise<void> {
  const ledger = held.get(client);
  if (!ledger) return;
  for (const verify of ledger.values()) await verify();
}

export function discardHeldVerification(client: PoolClient): void {
  held.delete(client);
}

/** Run a reviewed catalogue or custody check (side-effect free reads of the
 * catalogue and migration ledger) at most once while one original generation
 * transaction is open, plus once more before its COMMIT. Outside such a
 * transaction (factory qualification on a pool, other callers) it runs every
 * time, as before. Per-stage scope and lease checks never come through here:
 * they stay fresh on every call. `key` is the reviewed custody object itself. */
export async function verifyInHeldTransaction(
  client: Pick<Pool | PoolClient, "query">,
  key: object,
  verify: Verify,
): Promise<void> {
  const ledger = held.get(client);
  if (!ledger) return verify();
  if (ledger.has(key)) return;
  await verify();
  ledger.set(key, verify);
}
