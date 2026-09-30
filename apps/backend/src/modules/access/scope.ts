import type { Pool, PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import { PostgresIdentityRead, type IdentityRead } from "../identity/read.js";
import { DomainError, invariant } from "../../core/errors.js";
import { assertCurrentSession } from "../identity/request-authority.js";

export type ScopeRestriction = (
  actor: Actor,
  creatorId: string,
  threadId: string,
  participants: Readonly<{ fanAccountId: string; creatorAccountId: string }>,
) => Promise<void>;

const threadScopeBrand: unique symbol = Symbol("ThreadScope");
const issued = new WeakSet<object>();
export type ThreadScope = Readonly<{
  [threadScopeBrand]: true;
  threadId: string;
  creatorId: string;
  fanId: string;
  fanAccountId: string;
  actorAccountId: string;
  creatorAccountId: string;
  creatorName: string;
  authority: "fan" | "creator" | "triage";
}>;
export function assertThreadScope(scope: ThreadScope): void {
  invariant(
    issued.has(scope),
    "scope_required",
    "A verified thread scope is required.",
  );
}

export class AccessService {
  constructor(
    private readonly pool: Pool,
    private readonly identity: IdentityRead = new PostgresIdentityRead(),
    private readonly assertAllowed?: ScopeRestriction,
  ) {}
  async openThread(
    actor: Actor,
    creatorId: string,
    fanId: string,
    auditOpen = true,
  ): Promise<ThreadScope> {
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        actor.accountId,
      ]);
      await assertCurrentSession(client, actor.accountId);
      const pair = await this.identity.threadAuthority(
        actor,
        creatorId,
        fanId,
        client,
      );
      if (!pair)
        throw new DomainError(
          "thread_unavailable",
          "This conversation is unavailable.",
          404,
        );
      const authority =
        pair.fanAccountId === actor.accountId
          ? "fan"
          : pair.creatorAccountId === actor.accountId && pair.verified
            ? "creator"
            : pair.triage && pair.verified
              ? "triage"
              : null;
      invariant(
        authority,
        "thread_unavailable",
        "This conversation is unavailable.",
      );
      await client.query(
        "SELECT set_config('app.creator_id', $1, true), set_config('app.fan_id', $2, true)",
        [creatorId, fanId],
      );
      const row = await client.query<{ id: string }>(
        "SELECT id FROM creator.thread WHERE creator_id = $1 AND fan_id = $2 AND deleted_at IS NULL",
        [creatorId, fanId],
      );
      const thread = row.rows[0];
      if (!thread)
        throw new DomainError(
          "thread_unavailable",
          "This conversation is unavailable.",
          404,
        );
      await this.assertAllowed?.(actor, creatorId, thread.id, {
        fanAccountId: pair.fanAccountId,
        creatorAccountId: pair.creatorAccountId,
      });
      if (authority !== "fan" && auditOpen)
        await client.query(
          "INSERT INTO creator.thread_audit (thread_id, creator_id, fan_id, reader_account_id, role) VALUES ($1,$2,$3,$4,$5)",
          [thread.id, creatorId, fanId, actor.accountId, authority],
        );
      await client.query("COMMIT");
      const scope = Object.freeze({
        [threadScopeBrand]: true as const,
        threadId: thread.id,
        creatorId,
        fanId,
        fanAccountId: pair.fanAccountId,
        actorAccountId: actor.accountId,
        creatorAccountId: pair.creatorAccountId,
        creatorName: pair.creatorName,
        authority,
      });
      issued.add(scope);
      return scope;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Called by conversation through the access API, inside the acceptance transaction. */
  async reserveAllowance(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<string> {
    assertThreadScope(scope);
    const eligible = await client.query<{ id: string }>(
      `SELECT id FROM creator.access_grant WHERE creator_id = $1 AND fan_id = $2
      AND 'ai_message' = ANY(capabilities) AND state = 'active' AND valid_from <= now() AND valid_until > now()
      AND used + reserved < allowance ORDER BY valid_until, id LIMIT 1 FOR UPDATE`,
      [scope.creatorId, scope.fanId],
    );
    const grant = eligible.rows[0];
    invariant(
      grant,
      "ai_access_unavailable",
      "AI messaging is unavailable in this conversation.",
    );
    const updated = await client.query(
      `UPDATE creator.access_grant SET reserved = reserved + 1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND used + reserved < allowance RETURNING id`,
      [grant.id, scope.creatorId, scope.fanId],
    );
    invariant(
      updated.rowCount === 1,
      "allowance_unavailable",
      "The message allowance is unavailable.",
    );
    return grant.id;
  }
  async settleAllowance(
    scope: ThreadScope,
    client: PoolClient,
    grantId: string,
    consumed: boolean,
  ): Promise<void> {
    assertThreadScope(scope);
    await client.query(
      "UPDATE creator.access_grant SET reserved=reserved-1, used=used+$4 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND reserved > 0",
      [grantId, scope.creatorId, scope.fanId, consumed ? 1 : 0],
    );
  }
}
