import type { Pool, PoolClient } from "pg";
import { IdSchema } from "@qelvora/api";
import type { Actor } from "./adapter.js";
import { identityTransaction } from "./transaction.js";
import {
  assertCurrentSession,
  requestAuthority,
  holdCurrentRequestSession,
  assertHeldCurrentRequestSession,
} from "./request-authority.js";
import { invariant } from "../../core/errors.js";

const audienceScopeBrand: unique symbol = Symbol("AudienceScope");

/** Identity for a content audience read, never object eligibility, a thread,
 * creator mutation authority, or a serialized worker credential. */
export type AudienceScope = Readonly<{
  [audienceScopeBrand]: true;
  kind: "audience";
  creatorId: string;
  fanId: string;
  actorAccountId: string;
  creatorAccountId: string;
  fanAccountId: string;
  development: boolean;
}>;

export type AudienceRestriction = (
  actor: Actor,
  creatorId: string,
  participants: Readonly<{
    fanId: string;
    fanAccountId: string;
    creatorAccountId: string;
  }>,
  client: PoolClient,
) => Promise<void>;

export class AudienceIdentityAuthority {
  private readonly issued = new WeakSet<object>();

  constructor(
    private readonly pool: Pool,
    private readonly configuration: Readonly<{
      mode: "development" | "pantopus";
      assertAllowed: AudienceRestriction;
    }>,
  ) {
    invariant(
      (configuration.mode === "development" ||
        configuration.mode === "pantopus") &&
        typeof configuration.assertAllowed === "function",
      "audience_denial_unconfigured",
      "Content audience reads require their current denial authority.",
    );
  }

  async open(actor: Actor, creatorId: string): Promise<AudienceScope> {
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    const accountId = IdSchema.parse(actor.accountId);
    const currentCreatorId = IdSchema.parse(creatorId);
    this.assertRequest(accountId);
    const scope = await identityTransaction(
      this.pool,
      accountId,
      async (client) => {
        const family = (
          await client.query<{ fan_id: string; creator_account_id: string }>(
            `SELECT f.id AS fan_id,c.account_id AS creator_account_id
           FROM creator.fan_profile f CROSS JOIN creator.creator_profile c
           WHERE f.account_id=$1 AND c.id=$2
           AND c.verification='verified' AND NOT c.recovery_required`,
            [accountId, currentCreatorId],
          )
        ).rows[0];
        invariant(
          family,
          "audience_unavailable",
          "This content is unavailable.",
        );
        const candidate: AudienceScope = Object.freeze({
          [audienceScopeBrand]: true as const,
          kind: "audience" as const,
          creatorId: currentCreatorId,
          fanId: IdSchema.parse(family.fan_id),
          actorAccountId: accountId,
          creatorAccountId: IdSchema.parse(family.creator_account_id),
          fanAccountId: accountId,
          development: this.configuration.mode === "development",
        });
        await this.authorize(candidate, client);
        return candidate;
      },
    );
    this.issued.add(scope);
    return scope;
  }

  async withAudience<T>(
    scope: AudienceScope,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    this.assertIssued(scope);
    this.assertRequest(scope.actorAccountId);
    return identityTransaction(
      this.pool,
      scope.actorAccountId,
      async (client) => {
        await this.authorize(scope, client);
        return work(client);
      },
    );
  }

  /** Call before object/asset locks on the same non-owner domain transaction.
   * The caller retains commit/rollback; all identity/denial locks last to commit. */
  async authorizeInTransaction(
    scope: AudienceScope,
    client: PoolClient,
  ): Promise<void> {
    this.assertIssued(scope);
    this.assertRequest(scope.actorAccountId);
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      scope.actorAccountId,
    ]);
    await assertCurrentSession(client, scope.actorAccountId);
    await this.authorize(scope, client);
  }

  private assertIssued(scope: AudienceScope) {
    invariant(
      this.issued.has(scope),
      "audience_scope_required",
      "A current issued audience scope is required.",
    );
  }

  private assertRequest(accountId: string) {
    const current = requestAuthority.getStore();
    invariant(
      current && current.accountId === accountId,
      "audience_session_required",
      "Reopen this content with your current account.",
    );
  }

  private async authorize(scope: AudienceScope, client: PoolClient) {
    this.assertRequest(scope.actorAccountId);
    const held = await holdCurrentRequestSession(client, scope.actorAccountId);
    await assertCurrentSession(client, scope.actorAccountId);
    await client.query(
      "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
      [scope.creatorId, scope.fanId, scope.actorAccountId],
    );
    // Hold genuine negative keys before positive profile/family leases.
    try {
      await this.configuration.assertAllowed(
        held.actor,
        scope.creatorId,
        {
          fanId: scope.fanId,
          fanAccountId: scope.fanAccountId,
          creatorAccountId: scope.creatorAccountId,
        },
        client,
      );
      await assertHeldCurrentRequestSession(held, client);
    } finally {
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
        [scope.creatorId, scope.fanId, scope.actorAccountId],
      );
    }
    // Public profile SELECT does not grant its owner-only UPDATE RLS required
    // by FOR SHARE. Lock only this already-resolved creator row under its
    // actual owner, then restore the audience account before any domain work.
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      scope.creatorAccountId,
    ]);
    const creator = await client.query(
      "SELECT 1 FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required FOR SHARE",
      [scope.creatorId, scope.creatorAccountId],
    );
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      scope.actorAccountId,
    ]);
    invariant(
      creator.rowCount === 1,
      "audience_unavailable",
      "This content is unavailable.",
    );
    const fan = await client.query(
      "SELECT 1 FROM creator.fan_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
      [scope.fanId, scope.actorAccountId],
    );
    invariant(
      fan.rowCount === 1,
      "audience_unavailable",
      "This content is unavailable.",
    );
  }
}
