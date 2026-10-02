import type { Pool, PoolClient } from "pg";
import type {
  ScopeRestriction,
  ScopeRestrictionInTransaction,
} from "../access/scope.js";
import type { AudienceRestriction } from "../identity/audience-scope.js";
import type { Actor } from "../identity/adapter.js";
import type { TrustService } from "./service.js";
import { DomainError } from "../../core/errors.js";

async function projectedDenial(
  client: PoolClient,
  actor: Actor,
  sql: string,
  values: string[],
) {
  if (!actor.adultEligible)
    throw new DomainError(
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
  // The caller already owns this transaction and its genuine request scope.
  // Never substitute the creator/fan account for a non-participant caller.
  const current = await client.query<{ account: string }>(
    "SELECT nullif(current_setting('app.account_id',true),'') AS account",
  );
  if (current.rows[0]?.account !== actor.accountId)
    throw new DomainError("scope_unavailable", "This scope is unavailable.");
  const result = await client.query<{ denial: string }>(sql, values);
  if (result.rows[0]?.denial !== "allowed")
    throw new DomainError("scope_revoked", "This scope is closed.");
}

/** 0053 answers only for the actual thread participant on this held client. */
export function trustScopeRestrictionInTransaction(): ScopeRestrictionInTransaction {
  return async (actor, creatorId, threadId, participants, client) => {
    if (
      ![participants.fanAccountId, participants.creatorAccountId].includes(
        actor.accountId,
      )
    )
      throw new DomainError("scope_unavailable", "This scope is unavailable.");
    await projectedDenial(
      client,
      actor,
      "SELECT creator_trust.runtime_thread_denial($1,$2) AS denial",
      [creatorId, threadId],
    );
  };
}

/** Content audience authority is independent of whether a thread exists. */
export function trustAudienceRestrictionInTransaction(): AudienceRestriction {
  return async (actor, creatorId, participants, client) => {
    if (actor.accountId !== participants.fanAccountId)
      throw new DomainError("scope_unavailable", "This scope is unavailable.");
    await projectedDenial(
      client,
      actor,
      "SELECT creator_trust.runtime_audience_denial($1,$2) AS denial",
      [creatorId, participants.fanId],
    );
  };
}

export function trustCreatorRestrictionInTransaction() {
  return (actor: Actor, creatorId: string, client: PoolClient) =>
    projectedDenial(
      client,
      actor,
      "SELECT creator_trust.runtime_creator_denial($1) AS denial",
      [creatorId],
    );
}

/** W6 binary ingestion purpose, independent of interactive session authority.
 * 0062 grants EXECUTE only to its separately fenced worker role. */
export function trustMediaWorkerDenial() {
  return async (
    family: Readonly<{
      kind: "creator" | "thread";
      creatorId: string;
      ownerAccountId: string;
      fanId?: string;
    }>,
    client: PoolClient,
  ): Promise<boolean> => {
    const result = await client.query<{ denial: string }>(
      "SELECT creator_trust.media_worker_denial($1,$2,$3,$4) AS denial",
      [
        family.kind,
        family.creatorId,
        family.fanId ?? null,
        family.ownerAccountId,
      ],
    );
    if (!["allowed", "denied"].includes(result.rows[0]?.denial ?? ""))
      throw new DomainError(
        "media_worker_denial_unavailable",
        "Current media ingestion denial authority is unavailable.",
        503,
      );
    return result.rows[0]?.denial === "denied";
  };
}

/** Participants are supplied only after W1's current scoped authority check.
 * The coordinator reads deny metadata, never another account's private thread.
 */
export function trustScopeRestriction(
  service: TrustService,
  pool: Pool,
): ScopeRestriction {
  return async (actor, creatorId, threadId, participants) => {
    await service.assertAllowed(actor, creatorId, threadId);
    const accounts = [
      ...new Set([
        actor.accountId,
        participants.fanAccountId,
        participants.creatorAccountId,
      ]),
    ];
    const denied = await pool.query(
      `SELECT 1 WHERE
       EXISTS(SELECT 1 FROM creator_trust.block WHERE account_id=$1 AND creator_id=$2 AND revoked_at IS NULL) OR
       EXISTS(SELECT 1 FROM creator_trust.restriction WHERE revoked_at IS NULL AND (account_id=ANY($4::uuid[]) OR creator_id=$2)) OR
       EXISTS(SELECT 1 FROM creator_trust.tombstone WHERE account_id=ANY($4::uuid[]) AND
         (scope='account' OR (creator_id=$2 AND (scope='creator' OR thread_id=$3)))) OR
       EXISTS(SELECT 1 FROM creator_trust.tombstone t JOIN creator_trust.privacy_job j ON j.id=t.job_id
         WHERE t.scope='account' AND $2::uuid=ANY(j.owned_creator_ids))`,
      [participants.fanAccountId, creatorId, threadId, accounts],
    );
    if (denied.rowCount)
      throw new DomainError("scope_revoked", "This scope is closed.");
  };
}
