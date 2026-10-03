import type { PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import {
  assertCurrentSession,
  requestAuthority,
} from "../identity/request-authority.js";
import type { ScopeRestrictionInTransaction } from "../access/scope.js";
import { DomainError } from "../../core/errors.js";

function changing() {
  return new DomainError(
    "public_packet_publication_unavailable",
    "This request's sharing permission is changing. Refresh and try again.",
    503,
  );
}

/** W5 publicPacket callback: exact current fan public/group consent and creator
 * mode permission, held through the publication transaction. This projection
 * exposes no private disclosure, fan handle, prompt, draft or payment record.
 * Publication is only permission; W4 still verifies delivered service separately.
 */
export async function commercePublicPacket(
  client: PoolClient,
  actor: Actor,
  creatorId: string,
  packetId: string,
  assertAllowed: ScopeRestrictionInTransaction,
): Promise<boolean> {
  if (!actor.adultEligible) return false;
  const authority = requestAuthority.getStore();
  if (!authority || authority.accountId !== actor.accountId)
    throw new DomainError(
      "creator_session_required",
      "Continue with Pantopus before publishing this request.",
      401,
    );
  await assertCurrentSession(client, actor.accountId);
  const pointer = (
    await client.query<{
      mode_id: string;
      thread_id: string;
      creator_account: string;
      fan_account: string;
    }>(
      `SELECT p.mode_id,p.thread_id,cp.account_id AS creator_account,fp.account_id AS fan_account
       FROM creator.commerce_packet p JOIN creator.creator_profile cp ON cp.id=p.creator_id
       JOIN creator.fan_profile fp ON fp.id=p.fan_id WHERE p.id=$1 AND p.creator_id=$2 AND cp.account_id=$3`,
      [packetId, creatorId, actor.accountId],
    )
  ).rows[0];
  if (!pointer) return false;
  await assertAllowed(
    actor,
    creatorId,
    pointer.thread_id,
    {
      fanAccountId: pointer.fan_account,
      creatorAccountId: pointer.creator_account,
    },
    client,
  );
  return holdCommercePublicationPermission(
    client,
    actor,
    creatorId,
    packetId,
    pointer.mode_id,
  );
}

/** Already prepared owner positives. No session or negative lock is acquired here. */
export async function holdCommercePublicationPermission(
  client: PoolClient,
  actor: Actor,
  creatorId: string,
  packetId: string,
  modeId: string,
): Promise<boolean> {
  // Studio already holds its content/creator locks. A writer can hold a
  // packet row while waiting for its BEFORE-write fence, or edit a batch in a
  // different order. Never wait for either advisory or row locks below Studio.
  for (const key of [
    `commerce.mode:${modeId}`,
    `commerce.public-packet:${packetId}`,
  ]) {
    const held = (
      await client.query<{ held: boolean }>(
        "SELECT pg_try_advisory_xact_lock_shared(hashtextextended($1,0)) AS held",
        [key],
      )
    ).rows[0]?.held;
    if (held !== true) throw changing();
  }
  try {
    // Explicit packet -> commitment -> sharing order also protects the
    // canonical pre-0070 writers, which acquire their packet row first.
    const packet = await client.query(
      `SELECT p.id FROM creator.commerce_packet p
       JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=$3
       WHERE p.id=$1 AND p.creator_id=$2 AND p.mode_id=$4 FOR SHARE OF p NOWAIT`,
      [packetId, creatorId, actor.accountId, modeId],
    );
    if (packet.rowCount !== 1) return false;
    const commitment = await client.query<{ id: string }>(
      `SELECT c.id FROM creator.commerce_commitment c
       JOIN creator.commerce_packet p ON p.id=c.packet_id
        AND p.creator_id=c.creator_id AND p.fan_id=c.fan_id
       WHERE p.id=$1 AND p.creator_id=$2 FOR SHARE OF c NOWAIT`,
      [packetId, creatorId],
    );
    if (commitment.rowCount !== 1) return false;
    await client.query(
      "SELECT commitment_id FROM creator.commerce_share_grant WHERE commitment_id=$1 FOR SHARE NOWAIT",
      [commitment.rows[0]!.id],
    );
    return readCommercePublicationPermission(
      client,
      actor,
      creatorId,
      packetId,
      modeId,
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "55P03"
    )
      throw changing();
    throw error;
  }
}

/** Plain MVCC only: safe after the final signer lease. */
export async function readCommercePublicationPermission(
  client: PoolClient,
  actor: Actor,
  creatorId: string,
  packetId: string,
  modeId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT p.id FROM creator.commerce_packet p
     JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=$3
     JOIN creator.commerce_mode mode ON mode.id=p.mode_id AND mode.creator_id=p.creator_id
     JOIN creator.commerce_commitment c ON c.packet_id=p.id AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
     JOIN creator.signed_act sa ON sa.id=p.accepted_act_id AND sa.account_id=cp.account_id AND sa.creator_id=cp.id
     JOIN creator.signed_act_consumption consumed ON consumed.signed_act_id=sa.id AND consumed.account_id=sa.account_id
     JOIN creator.signed_publication publication ON publication.signed_act_id=sa.id AND publication.account_id=sa.account_id AND publication.withdrawn_at IS NULL
     JOIN creator.signed_verification proof ON proof.id=sa.id AND proof.account_id=sa.account_id AND proof.creator_id=cp.id
      AND proof.content_hash=sa.content_hash AND NOT proof.key_revoked AND NOT proof.creator_revoked AND NOT proof.withdrawn
     JOIN creator.passkey_credential pc ON pc.id=sa.credential_id AND pc.account_id=cp.account_id
     LEFT JOIN creator.commerce_share_grant share ON share.commitment_id=c.id AND share.creator_id=p.creator_id AND share.fan_id=p.fan_id
     WHERE p.id=$1 AND p.creator_id=$2 AND p.mode_id=$4 AND p.state='accepted' AND p.payment_state='captured'
     AND p.accepted_at IS NOT NULL AND p.snapshot->>'shareable'='true' AND mode.shareable
     AND ((p.visibility='public' AND share.commitment_id IS NULL)
      OR (share.fan_choice AND share.creator_permission AND share.revoked_at IS NULL))
     AND cp.verification='verified' AND NOT cp.recovery_required AND pc.revoked_at IS NULL
     AND c.state IN('due','in_progress','delivered') AND sa.act_type='accept' AND sa.subject_id=p.thread_id
     AND c.mode=p.snapshot->>'mode' AND NOT c.dispute_open
     AND EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.packet_id=p.id AND l.kind='capture'
      AND l.amount=(p.snapshot->>'amount')::bigint AND l.currency=p.snapshot->>'currency')
     AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.packet_id=p.id AND l.kind='refund')
     AND NOT EXISTS(SELECT 1 FROM creator.commerce_effect effect WHERE effect.packet_id=p.id AND effect.operation='refund' AND effect.state<>'failed')`,
    [packetId, creatorId, actor.accountId, modeId],
  );
  return result.rowCount === 1;
}

export function createCommercePublicationPermission(
  assertAllowed: ScopeRestrictionInTransaction,
) {
  return (
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    packetId: string,
  ) => commercePublicPacket(client, actor, creatorId, packetId, assertAllowed);
}
