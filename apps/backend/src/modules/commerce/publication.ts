import type { PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import type { ScopeRestrictionInTransaction } from "../access/scope.js";

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
  await client.query(
    "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
    [`commerce.mode:${pointer.mode_id}`],
  );
  const result = await client.query(
    `SELECT p.id FROM creator.commerce_packet p
     JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=$3
     JOIN creator.commerce_mode mode ON mode.id=p.mode_id AND mode.creator_id=p.creator_id
     JOIN creator.commerce_commitment c ON c.packet_id=p.id AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
     JOIN creator.signed_act sa ON sa.id=p.accepted_act_id AND sa.account_id=cp.account_id AND sa.creator_id=cp.id
     JOIN creator.passkey_credential pc ON pc.id=sa.credential_id AND pc.account_id=cp.account_id
     WHERE p.id=$1 AND p.creator_id=$2 AND p.mode_id=$4 AND p.state='accepted' AND p.payment_state='captured'
     AND p.visibility='public' AND p.snapshot->>'shareable'='true' AND mode.shareable
     AND cp.verification='verified' AND NOT cp.recovery_required AND pc.revoked_at IS NULL
     AND c.state IN('due','in_progress','delivered') AND sa.act_type='accept' AND sa.subject_id=p.thread_id
     AND NOT EXISTS(SELECT 1 FROM creator.commerce_share_grant sg WHERE sg.commitment_id=c.id AND (sg.revoked_at IS NOT NULL OR NOT sg.fan_choice OR NOT sg.creator_permission))
     AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.packet_id=p.id AND l.kind='refund')
     FOR SHARE OF p,c,cp`,
    [packetId, creatorId, actor.accountId, pointer.mode_id],
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
