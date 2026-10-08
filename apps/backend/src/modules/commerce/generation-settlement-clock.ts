import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";

export const generationSettlementClockSource = Object.freeze({
  owner: "W4",
  name: "w4_generation_settlement_clock",
  path: "apps/backend/src/modules/commerce/schema-generation-settlement-clock.sql",
  checksum: "542b271ee29a5fdede8eaa77620301854026831955b717229cb055bda5bf4296",
});

/** Original reservation metadata only, after the real W8 family fence and
 * W4 disposition. UTC calendar arithmetic preserves leap-day/month boundaries
 * independently of the connection's timezone. No NOW()-based retention clock. */
export const knownGenerationRetentionQuery = `SELECT g.id AS "generationId",
 r.original_settled_at::text AS "settledAt",
 ((r.original_settled_at AT TIME ZONE 'UTC' + make_interval(months => $5::integer)) AT TIME ZONE 'UTC')::text AS "accountingUntil",
 r.settlement_ref AS "financialDispositionReference"
 FROM creator.generation g JOIN creator.commerce_allowance_reservation r
 ON r.creator_id=g.creator_id AND r.fan_id=g.fan_id AND r.grant_id=g.grant_id AND r.key='generation:'||g.id::text
 WHERE g.thread_id=$1 AND g.creator_id=$2 AND g.fan_id=$3 AND g.id=ANY($4::uuid[])
 AND (g.reservation_id IS NULL OR g.reservation_id=r.id)
 AND r.state IN('consumed','released') AND r.cost_policy_version IS NOT NULL
 AND r.original_settled_at IS NOT NULL AND isfinite(r.original_settled_at)
 AND r.settled_units IS NOT NULL AND r.output_delivered IS NOT NULL
 AND r.settlement_ref ~ '^[a-f0-9]{64}$'
 ORDER BY g.id FOR SHARE OF g,r`;

/** Metadata only. The original financial owner still authorizes settlement;
 * a date never supplies a receipt, accepted task or permission to erase it. */
export const generationSettlementClockCatalogueQuery = `SELECT
 pg_get_functiondef(p.oid) AS definition,
 pg_get_triggerdef(t.oid) AS trigger,
 pg_get_constraintdef(k.oid) AS constraint,
 (pg_get_userbyid(c.relowner)='creator_owner' AND c.relkind='r'
  AND c.relrowsecurity AND c.relforcerowsecurity
  AND a.atttypid='timestamptz'::regtype AND NOT a.attnotnull AND NOT a.attisdropped
  AND a.attidentity='' AND a.attgenerated='' AND a.attacl IS NULL
  AND NOT EXISTS(SELECT FROM pg_attrdef d WHERE d.adrelid=c.oid AND d.adnum=a.attnum)
  AND pg_get_userbyid(p.proowner)='creator_owner' AND NOT p.prosecdef
  AND p.provolatile='v' AND p.prokind='f' AND l.lanname='plpgsql'
  AND p.proconfig=ARRAY['search_path=pg_catalog']
  AND (SELECT count(*)=1 AND bool_and(g.grantee=p.proowner AND g.grantor=p.proowner
    AND g.privilege_type='EXECUTE' AND NOT g.is_grantable)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g)
  AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=23
  AND t.tgqual IS NULL AND t.tgnargs=0 AND t.tgattr=''::int2vector
  AND k.contype='c' AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred
 ) AS ready
 FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='original_settled_at'
 JOIN pg_proc p ON p.oid=to_regprocedure('creator.commerce_allowance_settlement_clock()')
 JOIN pg_language l ON l.oid=p.prolang
 JOIN pg_trigger t ON t.tgrelid=c.oid AND t.tgfoid=p.oid AND t.tgname='commerce_allowance_settlement_clock'
 JOIN pg_constraint k ON k.conrelid=c.oid AND k.conname='commerce_allowance_settlement_clock'
 WHERE c.oid=to_regclass('creator.commerce_allowance_reservation')`;

// Exact PostgreSQL definitions of the held source, checked in closed review.
export const generationSettlementClockDefinitions = Object.freeze({
  definition:
    "8cbe0fbd70a52fa5b1f591af5f4a8cc0582ee66b5ecd0ee59846bd9f426ab848",
  trigger: "8b807625a039d2e5c217dd9095595d89f728c4c5e7d4e788083ffe0d03901a65",
  constraint:
    "79d339388e420475b0feda0f0453d0b7bd2e8fb95af908395246af7ac325e1c4",
});

export async function assertGenerationSettlementClock(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
): Promise<void> {
  await assertRegisteredMigration(
    client,
    generationSettlementClockSource,
    signal,
  );
  const { rows } = await client.query<{
    definition: string;
    trigger: string;
    constraint: string;
    ready: boolean;
  }>(generationSettlementClockCatalogueQuery);
  signal?.throwIfAborted();
  invariant(
    rows.length === 1 &&
      rows[0]?.ready === true &&
      Object.entries(generationSettlementClockDefinitions).every(
        ([key, expected]) =>
          createHash("sha256")
            .update(
              rows[0]![
                key as keyof typeof generationSettlementClockDefinitions
              ],
            )
            .digest("hex") === expected,
      ),
    "generation_settlement_clock_unavailable",
    "Original financial settlement time requires its registered source and unchanged custody.",
  );
}
