import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import { assertRegisteredMigration } from "../../db/reviewed-migration.js";

export const accountingRetentionIntegritySource = Object.freeze({
  owner: "W2",
  name: "w2_accounting_retention_integrity",
  path: "apps/backend/src/modules/agent/migrations/pending_w2_accounting_retention_integrity.sql",
  checksum: "d5a3067868f232f5fda69b11b6f57e642c2913061108edae4943010fe3457c89",
});

/** Narrow integrity metadata only. The existing original financial/task and
 * expiry authorities still determine the first disposition and every erasure. */
export const accountingRetentionIntegrityCatalogueQuery = `SELECT expected.name,
 pg_get_functiondef(p.oid) AS definition,pg_get_triggerdef(t.oid) AS trigger,
 CASE WHEN expected.constraint_name IS NOT NULL THEN pg_get_constraintdef(k.oid) END AS constraint,
 (pg_get_userbyid(c.relowner)='creator_owner' AND c.relkind='r'
  AND c.relrowsecurity AND c.relforcerowsecurity
  AND pg_get_userbyid(p.proowner)='creator_owner' AND NOT p.prosecdef
  AND p.provolatile='v' AND p.prokind='f' AND l.lanname='plpgsql'
  AND p.proconfig=ARRAY['search_path=pg_catalog']
  AND (SELECT count(*)=1 AND bool_and(g.grantee=p.proowner AND g.grantor=p.proowner
    AND g.privilege_type='EXECUTE' AND NOT g.is_grantable)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) g)
  AND t.tgenabled='O' AND NOT t.tgisinternal AND t.tgtype=19
  AND t.tgqual IS NULL AND t.tgnargs=0 AND t.tgattr=''::int2vector
  AND t.tgconstraint=0 AND NOT t.tgdeferrable AND NOT t.tginitdeferred
  AND (expected.constraint_name IS NULL OR
   (k.contype='c' AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred))
 ) AS ready
 FROM (VALUES
  ('usage','creator.ai_usage','ai_usage_retention_integrity','ai_usage_retention_finite'),
  ('hold','creator.ai_cost_hold','ai_cost_hold_original_clock',NULL)
 ) expected(name,relation,function_name,constraint_name)
 LEFT JOIN pg_class c ON c.oid=to_regclass(expected.relation)
 LEFT JOIN pg_proc p ON p.oid=to_regprocedure('creator.'||expected.function_name||'()')
 LEFT JOIN pg_language l ON l.oid=p.prolang
 LEFT JOIN pg_trigger t ON t.tgrelid=c.oid AND t.tgfoid=p.oid AND t.tgname=expected.function_name
 LEFT JOIN pg_constraint k ON k.conrelid=c.oid AND k.conname=expected.constraint_name
 ORDER BY expected.name`;

// Exact held PostgreSQL definitions captured in the closed source review.
export const accountingRetentionIntegrityDefinitions = Object.freeze({
  hold: Object.freeze({
    definition:
      "2543f589bd4e47977865edd3c143c44070820daaba43f902fcd4a29cfa37a1f0",
    trigger: "fb8a996be93c22f452fc108f8cda9d755d20ae48170abbb00e83df2b7cbc377c",
    constraint: null,
  }),
  usage: Object.freeze({
    definition:
      "921498df306ac21d20c3ba7b29f72800d1f464eba23b89a754f8fae1decdcd0f",
    trigger: "a82d8fa7e83a92d3cd310fbbcb9024c01431d30a3a5e4dc9ecae3646cb5d99b4",
    constraint:
      "a30b9424fd0498c5e5d367b123116d64a2d5a04c9df42a27ed31769d8f43b7ad",
  }),
});

export async function assertAccountingRetentionIntegrity(
  client: Pick<PoolClient, "query">,
  signal?: AbortSignal,
): Promise<void> {
  await assertRegisteredMigration(
    client,
    accountingRetentionIntegritySource,
    signal,
  );
  const { rows } = await client.query<{
    name: string;
    definition: string | null;
    trigger: string | null;
    constraint: string | null;
    ready: boolean | null;
  }>(accountingRetentionIntegrityCatalogueQuery);
  signal?.throwIfAborted();
  invariant(
    rows.length === 2 &&
      ["hold", "usage"].every((name, index) => {
        const row = rows[index];
        const expected =
          accountingRetentionIntegrityDefinitions[name as "hold" | "usage"];
        return (
          row?.name === name &&
          row.ready === true &&
          (["definition", "trigger", "constraint"] as const).every((key) =>
            expected[key] === null
              ? row[key] === null
              : typeof row[key] === "string" &&
                createHash("sha256").update(row[key]).digest("hex") ===
                  expected[key],
          )
        );
      }),
    "accounting_retention_integrity_unavailable",
    "Original accounting dates and retained costs require registered, unchanged integrity custody.",
  );
}
