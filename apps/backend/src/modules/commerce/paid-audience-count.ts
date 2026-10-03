import { z } from "zod";
import type { PoolClient } from "pg";
import type { CommerceService } from "./service.js";
import { ContentAudience } from "../../../../../packages/api/src/content.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import { invariant } from "../../core/errors.js";
import { PAID_COVERAGE_MIGRATION_VERSION } from "./paid-coverage.js";

export type PaidAudienceCountAuthority = (
  client: PoolClient,
  creatorId: string,
) => Promise<void>;

/** W5 audience-count metadata only. This snapshot conveys no permission, lease
 * or recipient identity; publication and actual viewing still authorize each
 * real recipient through their current canonical audience producer. */
export async function createCommercePaidAudienceCount(input: {
  service: CommerceService;
  migration: { version: string; checksum: string };
  assertCreatorAllowed: PaidAudienceCountAuthority;
}) {
  invariant(
    input.migration.version === PAID_COVERAGE_MIGRATION_VERSION &&
      /^[a-f0-9]{64}$/u.test(input.migration.checksum) &&
      typeof input.assertCreatorAllowed === "function",
    "audience_count_unconfigured",
    "Paid audience count needs canonical metadata custody and held creator authority.",
  );
  const ready = await input.service.pool.query<{ ready: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
     AND EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname='creator' AND p.proname='commerce_paid_audience_count'
       AND pg_get_function_identity_arguments(p.oid)='c uuid, tiers uuid[]' AND p.prosecdef
       AND r.rolname='creator_commerce_count' AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
       AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND 'search_path=pg_catalog'=ANY(p.proconfig)
       AND NOT pg_has_role(current_user,r.oid,'MEMBER') AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS ready`,
    [input.migration.version, input.migration.checksum],
  );
  invariant(
    ready.rows[0]?.ready,
    "audience_count_unconfigured",
    "The narrow canonical count projection is not installed.",
  );
  return async (
    client: PoolClient,
    creatorId: string,
    rawAudience: unknown,
  ): Promise<number | null> => {
    z.uuid().parse(creatorId);
    const audience = ContentAudience.parse(rawAudience);
    if (audience.kind !== "members" && audience.kind !== "tiers") return null;
    const caller = (
      await client.query<{ account: string | null }>(
        "SELECT nullif(current_setting('app.account_id',true),'') AS account",
      )
    ).rows[0]?.account;
    invariant(
      caller && z.uuid().safeParse(caller).success,
      "audience_count_scope_required",
      "The real creator account is required.",
    );
    await assertCurrentSession(client, caller);
    await input.assertCreatorAllowed(client, creatorId);
    const owner = await client.query(
      "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required FOR SHARE",
      [creatorId, caller],
    );
    invariant(
      owner.rowCount === 1,
      "creator_unavailable",
      "Current creator authority is required for an audience count.",
    );
    const retained = (
      await client.query<{ account: string }>(
        "SELECT current_setting('app.account_id',true) AS account",
      )
    ).rows[0]?.account;
    invariant(
      retained === caller,
      "audience_count_scope_required",
      "The real count caller changed.",
    );
    const result = (
      await client.query<{ count: string | null }>(
        "SELECT creator.commerce_paid_audience_count($1,$2) AS count",
        [
          creatorId,
          audience.kind === "tiers" ? [...new Set(audience.ids)] : null,
        ],
      )
    ).rows[0]?.count;
    if (result === null || result === undefined) return null;
    const count = Number(result);
    invariant(
      Number.isSafeInteger(count) && count >= 0,
      "audience_count_reconciliation_required",
      "The complete audience count needs reconciliation.",
    );
    return count;
  };
}
