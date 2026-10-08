import type { PoolClient } from "pg";
import { DomainError, invariant } from "../../core/errors.js";
import { accountingRetentionPolicy } from "../trust/accounting-retention-policy.js";

/** This read supplies no authority. W2 callers already verify the current W8
 * family/task on this same client and repeat under their original locks before
 * mutating data. An early diagnostic cannot authorize subsequent erasure. */
export const unresolvedAccountingQuery = `WITH unresolved AS (
 SELECT least(u.created_at,original_hold.created_at) AS started_at FROM creator.ai_usage u
 LEFT JOIN creator.ai_cost_hold original_hold ON original_hold.creator_id=u.creator_id AND (
  original_hold.id=nullif(to_jsonb(u)->>'creator_hold_id','')::uuid
  OR (u.category='provider_unknown' AND u.provider='unreconciled' AND u.model='expired-cost-hold' AND original_hold.id::text=u.version_hash))
 WHERE u.creator_id=$1 AND u.cost_micros IS NULL
 /* usage family */
 UNION ALL
 SELECT h.created_at FROM creator.ai_cost_hold h
 WHERE h.creator_id=$1 AND h.state='held' AND h.expires_at<=clock_timestamp()
 /* hold family */
), original AS (SELECT min(started_at) AS started_at FROM unresolved), instant AS (SELECT clock_timestamp() AS at)
 SELECT original.started_at::text AS "startedAt",
 (original.started_at+$2::integer*interval '24 hours')::text AS "escalateAt",
 (original.started_at+$3::integer*interval '24 hours')::text AS "deadlineAt",
 CASE WHEN original.started_at IS NULL THEN NULL
  WHEN NOT isfinite(original.started_at) OR original.started_at>instant.at THEN 'unavailable'
  WHEN original.started_at+$3::integer*interval '24 hours'<=instant.at THEN 'breached'
  WHEN original.started_at+$2::integer*interval '24 hours'<=instant.at THEN 'escalated'
  ELSE 'pending' END AS stage
 FROM original CROSS JOIN instant`;

/** Original installed lineage only; hold-only usage keeps its family. */
export const unresolvedFamilyAccountingQuery = unresolvedAccountingQuery
  .replace(
    "/* usage family */",
    `AND ((u.thread_id=$4 AND u.fan_id=$5)
    OR u.creator_hold_id IN(SELECT a.creator_hold_id FROM creator.ai_generation_attempt a
      WHERE a.creator_id=$1 AND a.thread_id=$4 AND a.fan_id=$5))`,
  )
  .replace(
    "/* hold family */",
    `AND h.id IN(SELECT a.creator_hold_id FROM creator.ai_generation_attempt a
    WHERE a.creator_id=$1 AND a.thread_id=$4 AND a.fan_id=$5)`,
  );

export type AccountingUncertainty = Readonly<{
  startedAt: string | null;
  escalateAt: string | null;
  deadlineAt: string | null;
  stage: "pending" | "escalated" | "breached" | "unavailable" | null;
}>;

export async function unresolvedAccountingInTransaction(
  client: PoolClient,
  creatorId: string,
  family?: Readonly<{ threadId: string; fanId: string }>,
  signal?: AbortSignal,
): Promise<AccountingUncertainty> {
  signal?.throwIfAborted();
  const query = family
    ? unresolvedFamilyAccountingQuery
    : unresolvedAccountingQuery;
  const { rows } = await client.query<AccountingUncertainty>(query, [
    creatorId,
    accountingRetentionPolicy.unknownEscalationDays,
    accountingRetentionPolicy.unknownMaximumDays,
    ...(family ? [family.threadId, family.fanId] : []),
  ]);
  signal?.throwIfAborted();
  invariant(
    rows.length === 1,
    "accounting_uncertainty_time_unavailable",
    "The original unresolved accounting time is unavailable.",
  );
  return Object.freeze(rows[0]!);
}

export function requireResolvedAccounting(status: AccountingUncertainty): void {
  if (status.stage === null) return;
  const code =
    status.stage === "breached"
      ? "accounting_retention_breach"
      : status.stage === "escalated"
        ? "accounting_reconciliation_escalated"
        : status.stage === "pending"
          ? "accounting_reconciliation_required"
          : "accounting_uncertainty_time_unavailable";
  throw new DomainError(
    code,
    "Original provider costs require reconciliation by the responsible project owner before this deletion can complete.",
    503,
  );
}
