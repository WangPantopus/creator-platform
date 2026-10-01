import type { Pool } from "pg";
import type { ScopeRestriction } from "../access/scope.js";
import type { TrustService } from "./service.js";
import { DomainError } from "../../core/errors.js";

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
