import type { PoolClient } from "pg";
import type { ThreadScope } from "../modules/access/scope.js";
import { contentHash } from "./canonical.js";
import { invariant } from "./errors.js";

export async function idempotent<T>(
  client: PoolClient,
  scope: {
    actorAccountId: ThreadScope["actorAccountId"];
    threadId: ThreadScope["threadId"] | null;
  },
  operation: string,
  key: string,
  request: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const hash = contentHash({ operation, threadId: scope.threadId, request });
  // Lock a stable tuple before checking. Same-key concurrent retries serialize even before a row exists.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `${scope.actorAccountId}:${operation}:${key}`,
  ]);
  const prior = await client.query<{ request_hash: string; response: T }>(
    "SELECT request_hash,response FROM creator.idempotency_key WHERE actor_account_id=$1 AND operation=$2 AND key=$3",
    [scope.actorAccountId, operation, key],
  );
  if (prior.rows[0]) {
    invariant(
      prior.rows[0].request_hash === hash,
      "idempotency_conflict",
      "This retry key was already used for a different request.",
    );
    return prior.rows[0].response;
  }
  const response = await run();
  await client.query(
    "INSERT INTO creator.idempotency_key(actor_account_id,operation,key,request_hash,response) VALUES($1,$2,$3,$4,$5)",
    [scope.actorAccountId, operation, key, hash, JSON.stringify(response)],
  );
  return response;
}
