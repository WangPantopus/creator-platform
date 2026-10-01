import type { Pool, PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import { PostgresIdentityRead, type IdentityRead } from "../identity/read.js";
import { DomainError, invariant } from "../../core/errors.js";
import {
  assertCurrentSession,
  requestAuthority,
} from "../identity/request-authority.js";

export type ScopeRestriction = (
  actor: Actor,
  creatorId: string,
  threadId: string,
  participants: Readonly<{ fanAccountId: string; creatorAccountId: string }>,
) => Promise<void>;

export type ScopeRestrictionInTransaction = (
  ...scope: [...Parameters<ScopeRestriction>, client: PoolClient]
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

/** W4 implements weighted reservations; W3 supplies its durable generation identity. */
export interface GenerationAllowance {
  reserve(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
  ): Promise<string>;
  settle(
    scope: ThreadScope,
    client: PoolClient,
    generationId: string,
    grantId: string,
    consumed: boolean,
  ): Promise<void>;
}

export class AccessService {
  private generationAllowance?: GenerationAllowance;
  configureGenerationAllowance(allowance: GenerationAllowance) {
    invariant(
      !this.generationAllowance,
      "allowance_already_configured",
      "Generation allowance is already configured.",
    );
    this.generationAllowance = allowance;
  }
  constructor(
    private readonly pool: Pool,
    private readonly identity: IdentityRead = new PostgresIdentityRead(),
    private readonly assertAllowed?: ScopeRestriction,
    private readonly assertAllowedInTransaction?: ScopeRestrictionInTransaction,
  ) {}
  get threadScopeInTransactionAvailable() {
    return typeof this.assertAllowedInTransaction === "function";
  }
  async openThread(
    actor: Actor,
    creatorId: string,
    fanId: string,
    auditOpen = true,
  ): Promise<ThreadScope> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const scope = await this.issueThreadScope(
        client,
        actor,
        creatorId,
        fanId,
        auditOpen,
        false,
      );
      await client.query("COMMIT");
      return scope;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  /** Issue the same canonical scope on a caller-held transaction. The caller
   * retains commit/rollback. This is request authority, never a worker proof. */
  async openThreadInTransaction(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    fanId: string,
    auditOpen = true,
    lockMode: "read" | "write" = "read",
  ): Promise<ThreadScope> {
    const request = requestAuthority.getStore();
    invariant(
      request && request.accountId === actor.accountId,
      "thread_session_required",
      "Reopen this conversation with your current account.",
    );
    if (!this.threadScopeInTransactionAvailable)
      throw new DomainError(
        "thread_denial_unconfigured",
        "This operation requires current denial authority on its transaction.",
        503,
      );
    if (lockMode !== "read" && lockMode !== "write")
      throw new DomainError(
        "thread_lock_invalid",
        "The conversation operation is unavailable.",
        400,
      );
    return this.issueThreadScope(
      client,
      actor,
      creatorId,
      fanId,
      auditOpen,
      true,
      lockMode,
    );
  }
  private async issueThreadScope(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    fanId: string,
    auditOpen: boolean,
    heldClient: boolean,
    lockMode: "read" | "write" = "read",
  ): Promise<ThreadScope> {
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
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
    if (heldClient) {
      const currentThread = await client.query(
        `SELECT 1 FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL FOR ${lockMode === "write" ? "UPDATE" : "SHARE"}`,
        [thread.id, creatorId, fanId],
      );
      invariant(
        currentThread.rowCount === 1,
        "thread_unavailable",
        "This conversation is unavailable.",
      );
      // Use only server-resolved owners for the two narrow RLS-compatible
      // profile locks, then restore the actual request account. No owner Actor
      // is created and no owner-scoped domain work runs here.
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        pair.creatorAccountId,
      ]);
      const currentCreator = await client.query(
        "SELECT 1 FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND ($3='fan' OR (verification='verified' AND NOT recovery_required)) FOR SHARE",
        [creatorId, pair.creatorAccountId, authority],
      );
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        pair.fanAccountId,
      ]);
      const currentFan = await client.query(
        "SELECT 1 FROM creator.fan_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
        [fanId, pair.fanAccountId],
      );
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        actor.accountId,
      ]);
      invariant(
        currentCreator.rowCount === 1 && currentFan.rowCount === 1,
        "thread_unavailable",
        "This conversation is unavailable.",
      );
      if (authority === "triage") {
        const membership = await client.query(
          "SELECT 1 FROM creator.team_membership WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL AND 'triage'=ANY(roles) FOR SHARE",
          [creatorId, actor.accountId],
        );
        invariant(
          membership.rowCount === 1,
          "thread_unavailable",
          "This conversation is unavailable.",
        );
      }
    }
    const participants = {
      fanAccountId: pair.fanAccountId,
      creatorAccountId: pair.creatorAccountId,
    };
    if (heldClient) {
      try {
        await this.assertAllowedInTransaction!(
          actor,
          creatorId,
          thread.id,
          participants,
          client,
        );
      } finally {
        await client.query(
          "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
          [creatorId, fanId, actor.accountId],
        );
      }
    } else {
      await this.assertAllowed?.(actor, creatorId, thread.id, participants);
    }
    if (authority !== "fan" && auditOpen)
      await client.query(
        "INSERT INTO creator.thread_audit (thread_id, creator_id, fan_id, reader_account_id, role) VALUES ($1,$2,$3,$4,$5)",
        [thread.id, creatorId, fanId, actor.accountId, authority],
      );
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
  }

  /** Called by conversation through the access API, inside the acceptance transaction. */
  async reserveAllowance(
    scope: ThreadScope,
    client: PoolClient,
    generationId?: string,
  ): Promise<string> {
    assertThreadScope(scope);
    if (this.generationAllowance) {
      invariant(
        generationId,
        "generation_required",
        "A durable generation identity is required.",
      );
      return this.generationAllowance.reserve(scope, client, generationId);
    }
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
    generationId?: string,
  ): Promise<void> {
    assertThreadScope(scope);
    if (this.generationAllowance) {
      invariant(
        generationId,
        "generation_required",
        "A durable generation identity is required.",
      );
      return this.generationAllowance.settle(
        scope,
        client,
        generationId,
        grantId,
        consumed,
      );
    }
    await client.query(
      "UPDATE creator.access_grant SET reserved=reserved-1, used=used+$4 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND reserved > 0",
      [grantId, scope.creatorId, scope.fanId, consumed ? 1 : 0],
    );
  }
}
