import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { ContentAudience } from "../../../../../packages/api/src/content.js";
import type {
  ScopeRestriction,
  ScopeRestrictionInTransaction,
} from "../access/scope.js";
import type { AudienceRestriction } from "../identity/audience-scope.js";
import type { Actor } from "../identity/adapter.js";
import type { TrustService } from "./service.js";
import { DomainError } from "../../core/errors.js";
import {
  assertCurrentSession,
  requestAuthority,
} from "../identity/request-authority.js";

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
  const result = await denialQuery(client, sql, values);
  if (result !== "allowed" && result !== "denied")
    throw new DomainError(
      "scope_denial_unavailable",
      "Current scope authority is unavailable.",
      503,
    );
  if (result === "denied")
    throw new DomainError("scope_revoked", "This scope is closed.");
}

async function denialQuery(client: PoolClient, sql: string, values: string[]) {
  try {
    return (await client.query<{ denial: string }>(sql, values)).rows[0]
      ?.denial;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      ["42883", "42501"].includes(String(error.code))
    )
      throw new DomainError(
        "scope_denial_unconfigured",
        "Current scope authority is not configured.",
        503,
      );
    throw error;
  }
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

/** Actual held content request, including Team publishers and fans. No owner
 * account substitution, object permission or background request scope. */
export function trustContentRestrictionInTransaction() {
  return async (client: PoolClient, actor: Actor, creatorId: string) => {
    const current = requestAuthority.getStore();
    if (!current || current.accountId !== actor.accountId)
      throw new DomainError(
        "content_session_required",
        "Continue with Pantopus for this content.",
        401,
      );
    await assertCurrentSession(client, actor.accountId);
    // Older canonical session helpers do not yet bind this GUC. The value comes
    // solely from the genuine session just held above, never from the request.
    await client.query("SELECT set_config('app.identity_session_id',$1,true)", [
      current.sessionId,
    ]);
    await projectedDenial(
      client,
      actor,
      "SELECT creator_trust.runtime_content_denial($1) AS denial",
      [creatorId],
    );
  };
}

const PacketTuple = z.strictObject({
  creatorId: z.uuid(),
  packetId: z.uuid(),
  contentId: z.uuid(),
  contentVersion: z.int().positive(),
  audience: ContentAudience,
});
export type TrustPublicPacketTuple = z.infer<typeof PacketTuple>;

/** W4's early negative preparation. Call before content/positive family locks.
 * False means a recorded current denial; missing authority or contention is
 * unavailable and must never be rendered as a successful empty view. */
export function trustPublicPacketDenial() {
  return async (
    client: PoolClient,
    actor: Actor,
    raw: TrustPublicPacketTuple,
  ): Promise<boolean> => {
    const tuple = PacketTuple.parse(raw);
    const current = requestAuthority.getStore();
    if (
      !actor.adultEligible ||
      !current ||
      current.accountId !== actor.accountId
    )
      throw new DomainError(
        "content_session_required",
        "Continue with Pantopus for this content.",
        401,
      );
    await assertCurrentSession(client, actor.accountId);
    await client.query("SELECT set_config('app.identity_session_id',$1,true)", [
      current.sessionId,
    ]);
    const account = await client.query<{ account: string }>(
      "SELECT nullif(current_setting('app.account_id',true),'') AS account",
    );
    if (account.rows[0]?.account !== actor.accountId)
      throw new DomainError("scope_unavailable", "This scope is unavailable.");
    const result = await denialQuery(
      client,
      "SELECT creator_trust.runtime_packet_denial($1,$2,$3,$4,$5::jsonb) AS denial",
      [
        tuple.creatorId,
        tuple.packetId,
        tuple.contentId,
        String(tuple.contentVersion),
        JSON.stringify(tuple.audience),
      ],
    );
    if (result === "denied") return false;
    if (result !== "allowed")
      throw new DomainError(
        "public_packet_denial_unavailable",
        "Current public request authority is unavailable. Try again.",
        503,
      );
    return true;
  };
}

/** W1 publication purpose. Bind only its candidate task metadata, then require
 * the actual durable tuple's held negative projection. This mints no sealed
 * scope or permission; W1 still verifies the command and issues its own nonce.
 * The host separately checks restoration currentness on this same client. */
export function trustPublicationWorkerDenial() {
  return async (
    client: PoolClient,
    task: Readonly<{
      creatorId: string;
      contentId: string;
      version: number;
      publisherAccountId: string;
      signedActId: string | null;
      commandHash: string;
    }>,
  ) => {
    if (requestAuthority.getStore())
      throw new DomainError(
        "publication_worker_required",
        "Use the separate publication worker authority.",
        403,
      );
    await client.query(
      `SELECT set_config('publication.operation','issue',true),
       set_config('publication.creator_id',$1,true),set_config('publication.content_id',$2,true),
       set_config('publication.version',$3,true),set_config('publication.publisher_account_id',$4,true),
       set_config('publication.signed_act_id',$5,true),set_config('publication.command_hash',$6,true)`,
      [
        task.creatorId,
        task.contentId,
        String(task.version),
        task.publisherAccountId,
        task.signedActId ?? "",
        task.commandHash,
      ],
    );
    const result = await denialQuery(
      client,
      "SELECT creator_trust.publication_worker_denial($1,$2) AS denial",
      [task.creatorId, task.publisherAccountId],
    );
    if (result !== "allowed")
      throw new DomainError(
        "publication_scope_revoked",
        "Current publication authority is unavailable.",
        result === "denied" ? 403 : 503,
      );
  };
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
