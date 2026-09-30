import type { PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import type { AudienceSnapshot } from "../agent/pipeline.js";

export type VerifiedGroupAudience = {
  groupIds: readonly string[];
  revision: string;
  validUntil: Date;
};

/** W2 consumes domain tier IDs, never grant UUIDs. Unknown group membership
 * contributes no group audience. Revalidate this five-second lease before using
 * cached tier/group passages or continuing a licensed generation. */
export async function commerceAudience(
  client: PoolClient,
  scope: ThreadScope,
  groups?: VerifiedGroupAudience,
): Promise<AudienceSnapshot> {
  assertThreadScope(scope);
  const observedAt = Date.now();
  const memberships = (
    await client.query<{
      tier_id: string;
      id: string;
      version: number;
      period_end: Date;
      audience_end: Date;
      grant_id: string;
    }>(
      `SELECT m.tier_id,m.id,m.version,m.period_end,m.grant_id,
     least(CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END,g.valid_until) AS audience_end
     FROM creator.commerce_membership m
     JOIN creator.access_grant g ON g.id=m.grant_id AND g.creator_id=m.creator_id AND g.fan_id=m.fan_id
     WHERE m.creator_id=$1 AND m.fan_id=$2 AND m.state IN('active','grace','cancelled') AND m.period_start<=now()
     AND CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END>now()
     AND g.state='active' AND g.valid_from<=now() AND g.valid_until>now() AND 'ai_message'=ANY(g.capabilities)
     ORDER BY m.tier_id,m.id LIMIT 1001`,
      [scope.creatorId, scope.fanId],
    )
  ).rows;
  invariant(
    memberships.length <= 1000,
    "audience_reconciliation_required",
    "Current membership audience needs reconciliation before licensed context can be read.",
  );
  const groupIds = groups
    ? z.array(z.uuid()).max(1000).parse(groups.groupIds)
    : [];
  const validUntil = new Date(
    Math.min(
      observedAt + 5000,
      ...memberships.map((row) => row.audience_end.getTime()),
      groups?.validUntil.getTime() ?? Infinity,
    ),
  );
  invariant(
    validUntil > new Date(),
    "audience_expired",
    "Refresh current group and membership audience before reading licensed context.",
  );
  return {
    tierIds: [...new Set(memberships.map((row) => row.tier_id))],
    groupIds: [...new Set(groupIds)].sort(),
    revision: contentHash({
      memberships: memberships.map((row) => ({
        ...row,
        period_end: row.period_end.toISOString(),
        audience_end: row.audience_end.toISOString(),
      })),
      groups: groups ? { ids: groupIds, revision: groups.revision } : null,
    }),
    validUntil: validUntil.toISOString(),
  };
}
