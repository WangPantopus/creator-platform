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
import { DomainError, invariant } from "../../core/errors.js";
import { withRequestContextRestore } from "./request-context.js";

const creatorScopeBrand: unique symbol = Symbol("CreatorScope");

/** Process-local ownership, never a serialized worker credential or fan scope. */
export type CreatorScope = Readonly<{
  [creatorScopeBrand]: true;
  creatorId: string;
  accountId: string;
  development: boolean;
}>;
export type CreatorRequirement = "owned" | "verified";
export type CreatorRestriction = (
  actor: Actor,
  creatorId: string,
  client: PoolClient,
) => Promise<void>;

export class CreatorIdentityAuthority {
  private readonly issued = new WeakSet<object>();
  constructor(
    private readonly pool: Pool,
    private readonly configuration: Readonly<{
      mode: "development" | "pantopus";
      assertAllowed: CreatorRestriction;
    }>,
  ) {}

  async open(
    actor: Actor,
    creatorId: string,
    requirement: CreatorRequirement = "owned",
  ): Promise<CreatorScope> {
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    const scope = Object.freeze({
      [creatorScopeBrand]: true as const,
      creatorId: IdSchema.parse(creatorId),
      accountId: IdSchema.parse(actor.accountId),
      development: this.configuration.mode === "development",
    });
    this.assertRequest(scope.accountId);
    await identityTransaction(this.pool, scope.accountId, async (client) => {
      await this.authorize(client, scope, requirement);
    });
    this.issued.add(scope);
    return scope;
  }

  /** Recheck current session, ownership and restriction while holding the
   * creator row through the domain commit. Pending owners may work on drafts;
   * named acts/publication additionally require verified, recovered identity. */
  async withCreator<T>(
    scope: CreatorScope,
    work: (client: PoolClient) => Promise<T>,
    requirement: CreatorRequirement = "owned",
  ): Promise<T> {
    invariant(
      this.issued.has(scope),
      "creator_scope_required",
      "A current issued creator scope is required.",
    );
    this.assertRequest(scope.accountId);
    return identityTransaction(this.pool, scope.accountId, async (client) => {
      await this.authorize(client, scope, requirement);
      return work(client);
    });
  }

  /** Join an already-open domain transaction; the caller retains responsibility
   * for commit/rollback. This must run before domain locks or effects, on the
   * same configured non-owner client used for publication. */
  async authorizeInTransaction(
    scope: CreatorScope,
    client: PoolClient,
    requirement: CreatorRequirement = "owned",
  ): Promise<void> {
    invariant(
      this.issued.has(scope),
      "creator_scope_required",
      "A current issued creator scope is required.",
    );
    this.assertRequest(scope.accountId);
    await client.query("SELECT set_config('app.account_id',$1,true)", [
      scope.accountId,
    ]);
    await assertCurrentSession(client, scope.accountId);
    await this.authorize(client, scope, requirement);
  }

  private assertRequest(accountId: string) {
    const current = requestAuthority.getStore();
    if (!current || current.accountId !== accountId)
      throw new DomainError(
        "creator_session_required",
        "Reopen this creator operation with your current account.",
        401,
      );
  }

  private async authorize(
    client: PoolClient,
    scope: CreatorScope,
    requirement: CreatorRequirement,
  ) {
    this.assertRequest(scope.accountId);
    const held = await holdCurrentRequestSession(client, scope.accountId);
    invariant(
      requirement === "owned" || requirement === "verified",
      "creator_requirement_invalid",
      "This creator operation is unavailable.",
    );
    await client.query("SELECT set_config('app.creator_id',$1,true)", [
      scope.creatorId,
    ]);
    // Hold current negative authority before the positive creator lease.
    await withRequestContextRestore(
      async () => {
        await this.configuration.assertAllowed(
          held.actor,
          scope.creatorId,
          client,
        );
        await assertHeldCurrentRequestSession(held, client);
      },
      () =>
        client.query(
          "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
          [scope.creatorId, scope.accountId],
        ),
    );
    const creator = (
      await client.query<{
        verification: string;
        recovery_required: boolean;
      }>(
        "SELECT verification,recovery_required FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
        [scope.creatorId, scope.accountId],
      )
    ).rows[0];
    if (!creator)
      throw new DomainError(
        "creator_unavailable",
        "This creator operation is unavailable.",
        404,
      );
    if (requirement === "verified")
      invariant(
        creator.verification === "verified" && !creator.recovery_required,
        "creator_verification_required",
        "Current creator verification and signing recovery are required.",
      );
    await assertHeldCurrentRequestSession(held, client);
  }
}
