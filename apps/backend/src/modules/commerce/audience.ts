import type { PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import type { AudienceSnapshot } from "../agent/pipeline.js";
import type { Database } from "../../db/database.js";
import { lockMembershipAudience } from "./audience-memberships.js";

export type VerifiedGroupAudience = {
  groupIds: readonly string[];
  revision: string;
  validUntil: Date;
};

/** The group owner must hold current rights/denial locks through this transaction.
 * A snapshot obtained from another transaction cannot authorize a sentence. */
export type GroupAudienceReader = (
  scope: ThreadScope,
  client: PoolClient,
) => Promise<VerifiedGroupAudience>;

/** W2/W3 use currentInTransaction during accepted-message/sentence writes. */
export function createCommerceAudience(
  database: Database,
  groups?: GroupAudienceReader,
) {
  const currentInTransaction = async (
    scope: ThreadScope,
    client: PoolClient,
  ) => {
    assertThreadScope(scope);
    return commerceAudience(
      client,
      scope,
      groups ? await groups(scope, client) : undefined,
    );
  };
  return {
    current: (scope: ThreadScope) =>
      database.withThread(scope, (client) =>
        currentInTransaction(scope, client),
      ),
    currentInTransaction,
  };
}

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
  const memberships = await lockMembershipAudience(
    client,
    scope.creatorId,
    scope.fanId,
    true,
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
