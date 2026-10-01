import type { PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import { ContentAudience } from "../../../../../packages/api/src/content.js";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import type { VerifiedGroupAudience } from "./audience.js";

/** Current identity/pair denials must remain held through the content read/write.
 * This is a configured-host producer, never a caller-supplied permission. */
export type ContentAudienceAuthority = (
  client: PoolClient,
  actor: Actor,
  creatorId: string,
  fanId: string,
) => Promise<void>;
export type ContentGroupAudienceReader = (
  client: PoolClient,
  actor: Actor,
  creatorId: string,
  fanId: string,
) => Promise<VerifiedGroupAudience>;

/** W5 owns publication, quoting and content state. W4 decides only current paid
 * audience rights; public/follower authority belongs to its existing producers.
 * Do not derive group rights from arbitrary catalog JSON or grant UUIDs. */
export async function commerceContentAudience(
  client: PoolClient,
  actor: Actor,
  creatorId: string,
  rawAudience: unknown,
  assertAllowed: ContentAudienceAuthority,
  groups?: ContentGroupAudienceReader,
): Promise<boolean> {
  const audience = ContentAudience.parse(rawAudience);
  if (
    !actor.adultEligible ||
    audience.kind === "public" ||
    audience.kind === "followers"
  )
    return false;
  z.uuid().parse(creatorId);
  await assertCurrentSession(client, actor.accountId);
  const context = (
    await client.query<{
      account_id: string | null;
      creator_id: string | null;
      fan_id: string | null;
    }>(
      "SELECT current_setting('app.account_id',true) AS account_id,current_setting('app.creator_id',true) AS creator_id,current_setting('app.fan_id',true) AS fan_id",
    )
  ).rows[0]!;
  invariant(
    context.account_id === actor.accountId,
    "audience_scope_required",
    "Current account authority is required for this audience.",
  );
  const fan = (
    await client.query<{ id: string }>(
      "SELECT id FROM creator.fan_profile WHERE account_id=$1 FOR SHARE",
      [actor.accountId],
    )
  ).rows[0];
  if (!fan) return false;
  await assertAllowed(client, actor, creatorId, fan.id);
  await client.query(
    "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
    [creatorId, fan.id],
  );
  // Restore pair context on successful return. If any read/guard fails, the
  // owning transaction must roll back; never continue an aborted transaction.
  let eligible: boolean;
  if (audience.kind === "groups") {
    const current = groups
      ? await groups(client, actor, creatorId, fan.id)
      : undefined;
    const ids = current
      ? z.array(z.uuid()).max(1000).parse(current.groupIds)
      : [];
    eligible = Boolean(
      current &&
        current.revision &&
        current.validUntil > new Date() &&
        audience.ids.some((id) => ids.includes(id)),
    );
  } else {
    const memberships = (
      await client.query<{ tier_id: string }>(
        `SELECT m.tier_id FROM creator.commerce_membership m
         JOIN creator.access_grant g ON g.id=m.grant_id AND g.creator_id=m.creator_id AND g.fan_id=m.fan_id
         WHERE m.creator_id=$1 AND m.fan_id=$2 AND m.state IN('active','grace','cancelled')
           AND m.period_start<=now()
           AND CASE WHEN m.state='grace' THEN coalesce(m.grace_end,m.period_end) ELSE m.period_end END>now()
           AND g.source='membership' AND g.state='active' AND g.valid_from<=now() AND g.valid_until>now()
         ORDER BY m.tier_id,m.id LIMIT 1001 FOR SHARE OF m,g`,
        [creatorId, fan.id],
      )
    ).rows;
    invariant(
      memberships.length <= 1000,
      "audience_reconciliation_required",
      "Current membership audience needs reconciliation.",
    );
    eligible =
      audience.kind === "members"
        ? memberships.length > 0
        : memberships.some((m) => audience.ids.includes(m.tier_id));
  }
  await client.query(
    "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
    [context.creator_id ?? "", context.fan_id ?? ""],
  );
  return eligible;
}
