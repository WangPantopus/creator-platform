import { copy } from "@qelvora/copy";
import type { PoolClient } from "pg";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import {
  assertHeldCurrentRequestSession,
  holdCurrentRequestSession,
  requestAuthority,
} from "../identity/request-authority.js";

import {
  assertCoreFollowCatalog,
  type CoreFollowMigration,
} from "./core-follow-catalogue.js";
export type { CoreFollowMigration } from "./core-follow-catalogue.js";

// Preserve reservation0185 and the proposal's SQL. Only the actual executable
// registration plus its reviewed catalogue may select this descriptor.
const Migration = z.strictObject({
  version: z.string().regex(/^\d{4}_w7_core_follow_metadata$/u),
  checksum: z.string().regex(/^[a-f0-9]{64}$/u),
  functionDefinitionSha256: z.string().regex(/^[a-f0-9]{64}$/u),
});

function unavailable() {
  return new DomainError(
    "growth_core_follow_unconfigured",
    copy.growthErrorGrowthAuthorityRequired,
    503,
  );
}

/** Bounded Follow metadata on the real canonical core client. The caller must
 * first retain W1/W8's actual audience/family and negative gates on this same
 * transaction. This callback issues no Actor/scope/GUC or content permission.
 * W4's opaque source host separately enforces exact graph/pool custody. */
export function canonicalCoreContentFollows(registered?: CoreFollowMigration) {
  const migration = registered ? Migration.parse(registered) : null;
  return async (client: PoolClient, accountId: string, creatorId: string) => {
    z.uuid().parse(accountId);
    z.uuid().parse(creatorId);
    const authority = requestAuthority.getStore();
    if (!migration || !authority || authority.accountId !== accountId)
      throw unavailable();
    z.uuid().parse(authority.sessionId);
    const held = await holdCurrentRequestSession(client, accountId);
    const context = (
      await client.query<{
        account_id: string;
        creator_id: string;
        held: boolean;
        safe: boolean;
        fan: boolean;
      }>(
        `SELECT current_setting('app.account_id',true) AS account_id,
       current_setting('app.creator_id',true) AS creator_id,
       pg_current_xact_id_if_assigned() IS NOT NULL AND current_setting('transaction_isolation')='read committed' AS held,
       current_user='creator_runtime' AND NOT r.rolsuper AND NOT r.rolbypassrls
       AND NOT pg_has_role(current_user,'growth_runtime','MEMBER')
       AND NOT pg_has_role(current_user,'growth_worker','MEMBER')
       AND NOT EXISTS(SELECT FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname IN('growth','creator') AND c.relowner=r.oid) AS safe,
       EXISTS(SELECT FROM creator.fan_profile f WHERE f.account_id=$1) AS fan
       FROM pg_roles r WHERE r.rolname=current_user`,
        [accountId],
      )
    ).rows[0];
    if (
      context?.account_id !== accountId ||
      context.creator_id !== creatorId ||
      !context.held ||
      !context.safe ||
      !context.fan
    )
      throw unavailable();
    await assertHeldCurrentRequestSession(held, client);
    const session = await client.query<{ id: string | null }>(
      "SELECT current_setting('app.identity_session_id',true) AS id",
    );
    if (session.rows[0]?.id !== authority.sessionId) throw unavailable();
    await assertCoreFollowCatalog(client, migration);
    const row = (
      await client.query<{ following: boolean | null }>(
        "SELECT creator_growth_metadata.core_follow($1::uuid,$2::uuid,$3::uuid) AS following",
        [authority.sessionId, accountId, creatorId],
      )
    ).rows[0];
    if (typeof row?.following !== "boolean") throw unavailable();
    await assertHeldCurrentRequestSession(held, client);
    return row.following;
  };
}
