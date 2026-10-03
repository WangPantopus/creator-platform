import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";

type MembershipAudience = {
  tier_id: string;
  id: string;
  version: number;
  period_end: Date;
  audience_end: Date;
  grant_id: string;
};

/** Current identity/negative authority must already be held by the caller.
 * Billing and tenure lock memberships before grants; a joined FOR SHARE OF
 * m,g cannot promise that order. Only current membership grants contribute.
 */
export async function lockMembershipAudience(
  client: PoolClient,
  creatorId: string,
  fanId: string,
  requireAiMessage: boolean,
): Promise<MembershipAudience[]> {
  const projection = `SELECT m.tier_id,m.id,m.version,m.period_end,m.grant_id,
    least(CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END,g.valid_until) AS audience_end
    FROM creator.commerce_membership m
    JOIN creator.access_grant g ON g.id=m.grant_id AND g.creator_id=m.creator_id AND g.fan_id=m.fan_id
    WHERE m.creator_id=$1 AND m.fan_id=$2 AND m.state IN('active','grace','cancelled') AND m.period_start<=now()
     AND CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END>now()
     AND g.source='membership' AND g.state='active' AND g.valid_from<=now() AND g.valid_until>now()
     AND (NOT $3::boolean OR 'ai_message'=ANY(g.capabilities))`;
  const parameters = [creatorId, fanId, requireAiMessage];
  const candidates = (
    await client.query<MembershipAudience>(
      `${projection} ORDER BY m.id LIMIT 1001 FOR SHARE OF m`,
      parameters,
    )
  ).rows;
  invariant(
    candidates.length <= 1000,
    "audience_reconciliation_required",
    "Current membership audience needs reconciliation.",
  );
  const ids = candidates.map((membership) => membership.id);
  if (!ids.length) return [];
  await client.query(
    `SELECT g.id FROM creator.access_grant g
     JOIN creator.commerce_membership m ON m.grant_id=g.id
      AND m.creator_id=g.creator_id AND m.fan_id=g.fan_id
     WHERE m.creator_id=$1 AND m.fan_id=$2 AND m.id=ANY($3::uuid[])
     ORDER BY g.id FOR SHARE OF g`,
    [creatorId, fanId, ids],
  );
  // A grant may have changed while its row lease was acquired. Re-read current
  // truth under both leases instead of using the earlier unlocked grant join.
  return (
    await client.query<MembershipAudience>(
      `${projection} AND m.id=ANY($4::uuid[]) ORDER BY m.tier_id,m.id`,
      [...parameters, ids],
    )
  ).rows;
}
