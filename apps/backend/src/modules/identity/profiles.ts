import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  CreatorProfileInputSchema,
  FanProfileInputSchema,
  ProofInputSchema,
  ProofSubmitSchema,
  TeamInviteSchema,
  TeamRolesUpdateInputSchema,
} from "@qelvora/api";
import type { Actor } from "./adapter.js";
import { identityTransaction } from "./transaction.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { CreatorRestriction } from "./creator-scope.js";
import type { AudienceRestriction } from "./audience-scope.js";
import { withRequestContextRestore } from "./request-context.js";
import {
  holdCurrentRequestSession,
  assertHeldCurrentRequestSession,
} from "./request-authority.js";

const handle = (value: string) => value.replace(/^@/u, "").toLowerCase();
export interface VerificationDecision {
  proofId: string;
  accountId: string;
  reviewerAccountId: string;
  caseId: string;
  decision: "approved" | "rejected" | "revoked";
  reason: string;
}
/** The original saved proof projection, shared by create, submit and read.
 * Review evidence must distinguish an unsubmitted challenge from its saved
 * post; no case or historical evidence is rewritten by this projection. */
export interface CreatorProofProjection {
  id: string;
  code: string;
  platform: "instagram" | "youtube";
  accountUrl: string;
  postUrl: string | null;
  expiresAt: Date;
  state: "challenge" | "pending" | "approved" | "rejected" | "revoked";
  reason: string | null;
}
export class IdentityProfiles {
  constructor(
    private readonly pool: Pool,
    private readonly team?: Readonly<{
      assertCreatorAllowed: CreatorRestriction;
      /** Invitation grants Team roles; this checks current participant negatives. */
      assertInvitationAllowed?: AudienceRestriction;
    }>,
  ) {}
  async view(actor: Actor) {
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const fan = await client.query(
        "SELECT id,handle,intro,version FROM creator.fan_profile WHERE account_id=$1",
        [actor.accountId],
      );
      const creator = await client.query(
        'SELECT id,handle,display_name AS "displayName",verification,version FROM creator.creator_profile WHERE account_id=$1',
        [actor.accountId],
      );
      const teams = await client.query(
        'SELECT creator_id AS "creatorId",roles FROM creator.team_membership WHERE account_id=$1 AND revoked_at IS NULL ORDER BY creator_id LIMIT 100',
        [actor.accountId],
      );
      return {
        fan: fan.rows[0] ?? null,
        creator: creator.rows[0] ?? null,
        teams: teams.rows,
      };
    });
  }
  private async unique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new DomainError(
          "handle_taken",
          "That handle is already in use. Choose another.",
          409,
        );
      throw error;
    }
  }
  async saveFan(actor: Actor, input: unknown) {
    const body = FanProfileInputSchema.parse(input);
    return this.unique(() =>
      identityTransaction(this.pool, actor.accountId, async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [actor.accountId],
        );
        const result = await client.query(
          "INSERT INTO creator.fan_profile(account_id,handle,intro) VALUES($1,$2,$3) ON CONFLICT(account_id) DO UPDATE SET handle=excluded.handle,intro=excluded.intro,version=creator.fan_profile.version+1 RETURNING id,handle,intro,version",
          [actor.accountId, handle(body.handle), body.intro],
        );
        return result.rows[0];
      }),
    );
  }
  async saveCreator(actor: Actor, input: unknown) {
    const body = CreatorProfileInputSchema.parse(input);
    return this.unique(() =>
      identityTransaction(this.pool, actor.accountId, async (client) => {
        const result = await client.query(
          "INSERT INTO creator.creator_profile(account_id,handle,display_name,verification) VALUES($1,$2,$3,'pending') ON CONFLICT(account_id) DO UPDATE SET handle=excluded.handle,display_name=excluded.display_name,version=creator.creator_profile.version+1 RETURNING id,handle,display_name AS \"displayName\",verification,version",
          [actor.accountId, handle(body.handle), body.displayName],
        );
        return result.rows[0];
      }),
    );
  }
  async requireCreator(client: PoolClient, actor: Actor, creatorId: string) {
    const result = await client.query(
      "SELECT id,verification,recovery_required FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR UPDATE",
      [creatorId, actor.accountId],
    );
    invariant(
      result.rows[0],
      "creator_required",
      "Only this creator can perform this action.",
    );
    return result.rows[0];
  }
  async beginProof(actor: Actor, creatorId: string, input: unknown) {
    const body = ProofInputSchema.parse(input);
    const url = new URL(body.accountUrl);
    const permitted =
      body.platform === "instagram"
        ? ["instagram.com", "www.instagram.com"]
        : ["youtube.com", "www.youtube.com"];
    invariant(
      url.protocol === "https:" &&
        permitted.includes(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
      "proof_account_invalid",
      "Use the public HTTPS account URL for the selected platform.",
    );
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      await this.requireCreator(client, actor, creatorId);
      const code = randomBytes(6).toString("hex").toUpperCase();
      const result = await client.query<CreatorProofProjection>(
        'INSERT INTO creator.creator_proof(account_id,creator_id,code,platform,account_url,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval \'24 hours\') RETURNING id,code,platform,account_url AS "accountUrl",post_url AS "postUrl",expires_at AS "expiresAt",state,reason',
        [actor.accountId, creatorId, code, body.platform, url.href],
      );
      return result.rows[0];
    });
  }
  async submitProof(actor: Actor, proofId: string, input: unknown) {
    const body = ProofSubmitSchema.parse(input);
    const url = new URL(body.postUrl);
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const proof = await client.query(
        "SELECT * FROM creator.creator_proof WHERE id=$1 AND account_id=$2 AND expires_at>now() FOR UPDATE",
        [proofId, actor.accountId],
      );
      const row = proof.rows[0];
      invariant(
        row,
        "proof_expired",
        "This proof challenge expired. Create a new one.",
      );
      const expected =
        row.platform === "instagram"
          ? ["instagram.com", "www.instagram.com"]
          : ["youtube.com", "www.youtube.com", "youtu.be"];
      invariant(
        url.protocol === "https:" &&
          expected.includes(url.hostname) &&
          !url.username &&
          !url.password &&
          !url.hash,
        "proof_post_invalid",
        "Use a public post URL on the selected platform.",
      );
      invariant(
        ["challenge", "pending"].includes(row.state),
        "proof_reviewed",
        "This proof has already been reviewed.",
      );
      invariant(
        row.state !== "pending" || row.post_url === url.href,
        "proof_submission_changed",
        "This proof is already awaiting review. Create a new challenge to submit a different post.",
      );
      const result = await client.query<CreatorProofProjection>(
        'UPDATE creator.creator_proof SET post_url=$1,state=\'pending\',submitted_at=coalesce(submitted_at,now()) WHERE id=$2 RETURNING id,code,platform,account_url AS "accountUrl",post_url AS "postUrl",expires_at AS "expiresAt",state,reason',
        [url.href, proofId],
      );
      return result.rows[0];
    });
  }
  async proof(actor: Actor, creatorId: string) {
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      await this.requireCreator(client, actor, creatorId);
      const result = await client.query<CreatorProofProjection>(
        'SELECT id,code,platform,account_url AS "accountUrl",post_url AS "postUrl",expires_at AS "expiresAt",state,reason FROM creator.creator_proof WHERE creator_id=$1 AND account_id=$2 ORDER BY expires_at DESC LIMIT 1',
        [creatorId, actor.accountId],
      );
      if (!result.rows[0])
        throw new DomainError(
          "proof_not_found",
          "Create an external proof challenge first.",
          404,
        );
      return result.rows[0];
    });
  }
  /** W8 supplies a purpose-scoped review authorizer; no public client can approve itself. */
  async reviewProof(
    input: VerificationDecision,
    authorize: (input: VerificationDecision) => Promise<boolean>,
  ) {
    invariant(
      await authorize(input),
      "review_authority_required",
      "A scoped verification review is required.",
    );
    return identityTransaction(this.pool, input.accountId, async (client) => {
      const proof = await client.query(
        "SELECT * FROM creator.creator_proof WHERE id=$1 AND account_id=$2 FOR UPDATE",
        [input.proofId, input.accountId],
      );
      const row = proof.rows[0];
      invariant(row, "proof_not_found", "This proof is unavailable.");
      if (row.review_case_id === input.caseId && row.state === input.decision)
        return { done: true as const };
      invariant(
        input.decision === "revoked" || row.state === "pending",
        "proof_state_changed",
        "This proof is no longer pending.",
      );
      if (input.decision === "approved")
        invariant(
          new Date(row.expires_at).getTime() > Date.now(),
          "proof_expired",
          "Create fresh external proof before approval.",
        );
      await client.query(
        "UPDATE creator.creator_proof SET state=$1,code='',reviewed_at=now(),reviewer_account_id=$2,review_case_id=$3,reason=$4 WHERE id=$5",
        [
          input.decision,
          input.reviewerAccountId,
          input.caseId,
          input.reason,
          input.proofId,
        ],
      );
      const status =
        input.decision === "approved" ? "verified" : input.decision;
      const changed = await client.query(
        "UPDATE creator.creator_profile SET verification=$1,version=version+1 WHERE id=$2 AND account_id=$3 RETURNING version",
        [status, row.creator_id, input.accountId],
      );
      await client.query(
        "UPDATE creator.signed_verification SET creator_revoked=$1 WHERE creator_id=$2",
        [status !== "verified", row.creator_id],
      );
      await client.query(
        "INSERT INTO creator.identity_event(account_id,kind,aggregate_id,version) VALUES($1,'creator_verification_changed',$2,$3)",
        [input.accountId, row.creator_id, changed.rows[0].version],
      );
      return { done: true as const };
    });
  }
  async invite(actor: Actor, creatorId: string, input: unknown) {
    const body = TeamInviteSchema.parse(input);
    const assertAllowed = this.team?.assertCreatorAllowed;
    if (typeof assertAllowed !== "function")
      throw new DomainError(
        "team_authority_unconfigured",
        "Current creator authority is unavailable for this team.",
        503,
      );
    invariant(
      body.accountId !== actor.accountId,
      "team_creator_identity",
      "The creator does not need a team invitation.",
    );
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const held = await holdCurrentRequestSession(client, actor.accountId);
      invariant(
        held.actor === actor,
        "current_request_actor_required",
        "Reopen this team with your current account.",
      );
      await client.query("SELECT set_config('app.creator_id',$1,true)", [
        creatorId,
      ]);
      await assertAllowed(actor, creatorId, client);
      await assertHeldCurrentRequestSession(held, client);
      const creator = await this.requireCreator(client, actor, creatorId);
      invariant(
        creator.verification === "verified" && !creator.recovery_required,
        "creator_verification_required",
        "Current creator verification and signing recovery are required.",
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`team:${creatorId}:${body.accountId}`],
      );
      const member = await client.query(
        "SELECT 1 FROM creator.team_membership WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL",
        [creatorId, body.accountId],
      );
      invariant(
        member.rowCount === 0,
        "team_member_exists",
        "This account already belongs to the team. Review its current roles instead.",
      );
      const roles = [...new Set(body.roles)].sort();
      const pending = await client.query(
        'SELECT id,creator_id AS "creatorId",account_id AS "accountId",roles,expires_at AS "expiresAt",false AS accepted FROM creator.team_invitation WHERE creator_id=$1 AND account_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 2 FOR UPDATE',
        [creatorId, body.accountId],
      );
      if (
        pending.rows.length > 1 ||
        (pending.rows[0] &&
          [...new Set(pending.rows[0].roles)].sort().join("|") !==
            roles.join("|"))
      )
        throw new DomainError(
          "team_invitation_exists",
          "Current invitations have different or conflicting roles. Remove them before choosing new roles.",
          409,
        );
      // The lock covers both the read and insert. Retries of a pending invite
      // preserve its original ID/expiry, including concurrent direct/API callers.
      const invitation =
        pending.rows[0] ??
        (
          await client.query(
            'INSERT INTO creator.team_invitation(creator_id,account_id,roles,expires_at) VALUES($1,$2,$3,now()+interval \'7 days\') RETURNING id,creator_id AS "creatorId",account_id AS "accountId",roles,expires_at AS "expiresAt",false AS accepted',
            [creatorId, body.accountId, roles],
          )
        ).rows[0];
      await assertAllowed(actor, creatorId, client);
      await assertHeldCurrentRequestSession(held, client);
      return invitation;
    });
  }
  async acceptInvite(actor: Actor, invitationId: string) {
    const assertAllowed = this.team?.assertInvitationAllowed;
    if (!assertAllowed)
      throw new DomainError(
        "team_authority_unconfigured",
        "Current invitation authority is unavailable for this team.",
        503,
      );
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const held = await holdCurrentRequestSession(client, actor.accountId);
      invariant(
        held.actor === actor,
        "current_request_actor_required",
        "Reopen this invitation with your current account.",
      );
      const target = await client.query<{
        creator_id: string;
        creator_account_id: string;
        fan_id: string;
      }>(
        `SELECT i.creator_id,c.account_id AS creator_account_id,f.id AS fan_id
         FROM creator.team_invitation i
         JOIN creator.creator_profile c ON c.id=i.creator_id
         JOIN creator.fan_profile f ON f.account_id=i.account_id
         WHERE i.id=$1 AND i.account_id=$2`,
        [invitationId, actor.accountId],
      );
      const family = target.rows[0];
      invariant(
        family,
        "invitation_unavailable",
        "This team invitation is unavailable.",
      );
      const context = () =>
        client.query(
          "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
          [family.creator_id, family.fan_id, actor.accountId],
        );
      const assertRecipientAllowed = () =>
        withRequestContextRestore(async () => {
          await assertAllowed(
            actor,
            family.creator_id,
            {
              fanId: family.fan_id,
              fanAccountId: actor.accountId,
              creatorAccountId: family.creator_account_id,
            },
            client,
          );
          await assertHeldCurrentRequestSession(held, client);
        }, context);
      await context();
      // Original participant negatives precede positive creator/fan leases.
      await assertRecipientAllowed();
      // Reuse the existing Identity owner-row lock discipline: only this real
      // stored creator account is used temporarily for its own RLS lease. No
      // owner Actor/session is constructed, and recipient context is restored
      // before Team work. Unknown settlement escapes without another query.
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        family.creator_account_id,
      ]);
      const creator = await withRequestContextRestore(
        () =>
          client.query(
            "SELECT 1 FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required FOR SHARE",
            [family.creator_id, family.creator_account_id],
          ),
        context,
      );
      invariant(
        creator.rowCount === 1,
        "invitation_unavailable",
        "This team invitation is unavailable.",
      );
      const fan = await client.query(
        "SELECT 1 FROM creator.fan_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
        [family.fan_id, actor.accountId],
      );
      invariant(
        fan.rowCount === 1,
        "invitation_unavailable",
        "This team invitation is unavailable.",
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`team:${family.creator_id}:${actor.accountId}`],
      );
      const invitation = await client.query(
        "SELECT *,expires_at>clock_timestamp() AS unexpired FROM creator.team_invitation WHERE id=$1 AND account_id=$2 AND creator_id=$3 AND revoked_at IS NULL FOR UPDATE",
        [invitationId, actor.accountId, family.creator_id],
      );
      const row = invitation.rows[0];
      invariant(
        row,
        "invitation_unavailable",
        "This team invitation is unavailable.",
      );
      const roles = TeamRolesUpdateInputSchema.shape.roles.parse(row.roles);
      const membership = (
        await client.query<{ roles: unknown; revoked_at: Date | null }>(
          "SELECT roles,revoked_at FROM creator.team_membership WHERE creator_id=$1 AND account_id=$2 FOR UPDATE",
          [family.creator_id, actor.accountId],
        )
      ).rows[0];
      if (row.accepted_at) {
        invariant(
          membership &&
            membership.revoked_at === null &&
            [...TeamRolesUpdateInputSchema.shape.roles.parse(membership.roles)]
              .sort()
              .join() === [...roles].sort().join(),
          "team_acceptance_changed",
          "This team membership changed. Reopen the team to review its current access.",
        );
        await assertRecipientAllowed();
        await assertHeldCurrentRequestSession(held, client);
        return { done: true as const };
      }
      invariant(
        row.unexpired === true,
        "invitation_unavailable",
        "This team invitation is unavailable.",
      );
      invariant(
        !membership || membership.revoked_at !== null,
        "team_member_exists",
        "You already belong to this team. Reopen it to review your current roles.",
      );
      await client.query(
        "INSERT INTO creator.team_membership(creator_id,account_id,roles) VALUES($1,$2,$3) ON CONFLICT(creator_id,account_id) DO UPDATE SET roles=excluded.roles,revoked_at=NULL",
        [family.creator_id, actor.accountId, [...roles].sort()],
      );
      const accepted = await client.query(
        "UPDATE creator.team_invitation SET accepted_at=clock_timestamp() WHERE id=$1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp() RETURNING id",
        [invitationId],
      );
      invariant(
        accepted.rowCount === 1,
        "invitation_unavailable",
        "This team invitation is unavailable.",
      );
      await assertRecipientAllowed();
      await assertHeldCurrentRequestSession(held, client);
      return { done: true as const };
    });
  }
  async removeMember(actor: Actor, creatorId: string, accountId: string) {
    const assertAllowed = this.team?.assertCreatorAllowed;
    if (!assertAllowed)
      throw new DomainError(
        "team_authority_unconfigured",
        "Current creator authority is unavailable for this team.",
        503,
      );
    invariant(
      accountId !== actor.accountId,
      "team_creator_identity",
      "The creator's identity cannot be removed through team membership.",
    );
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const held = await holdCurrentRequestSession(client, actor.accountId);
      invariant(
        held.actor === actor,
        "current_request_actor_required",
        "Reopen this team with your current account.",
      );
      await client.query("SELECT set_config('app.creator_id',$1,true)", [
        creatorId,
      ]);
      // Refuse an unrelated account before asking for creator-only denial
      // authority. This metadata read grants nothing; requireCreator repeats
      // ownership under its row lock after the negative authority is held.
      const owned = await client.query(
        "SELECT 1 FROM creator.creator_profile WHERE id=$1 AND account_id=$2",
        [creatorId, actor.accountId],
      );
      invariant(
        owned.rowCount === 1,
        "creator_required",
        "Only this creator can perform this action.",
      );
      await assertAllowed(actor, creatorId, client);
      await assertHeldCurrentRequestSession(held, client);
      await this.requireCreator(client, actor, creatorId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`team:${creatorId}:${accountId}`],
      );
      await client.query(
        "UPDATE creator.team_membership SET revoked_at=clock_timestamp() WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL",
        [creatorId, accountId],
      );
      await client.query(
        "UPDATE creator.team_invitation SET revoked_at=clock_timestamp() WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL",
        [creatorId, accountId],
      );
      await assertAllowed(actor, creatorId, client);
      await assertHeldCurrentRequestSession(held, client);
      return { done: true as const };
    });
  }

  /** Roles do not issue creator identity or authorize a named personal act. */
  async updateMemberRoles(
    actor: Actor,
    creatorId: string,
    accountId: string,
    input: unknown,
  ) {
    const body = TeamRolesUpdateInputSchema.parse(input);
    const assertAllowed = this.team?.assertCreatorAllowed;
    if (typeof assertAllowed !== "function")
      throw new DomainError(
        "team_authority_unconfigured",
        "Current creator authority is unavailable for this team.",
        503,
      );
    invariant(
      accountId !== actor.accountId,
      "team_creator_identity",
      "The creator's identity cannot be replaced by team roles.",
    );
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      const held = await holdCurrentRequestSession(client, actor.accountId);
      invariant(
        held.actor === actor,
        "current_request_actor_required",
        "Reopen this team with your current account.",
      );
      await client.query("SELECT set_config('app.creator_id',$1,true)", [
        creatorId,
      ]);
      // Actual same-client restoration/creator negatives precede positive locks.
      await assertAllowed(actor, creatorId, client);
      await assertHeldCurrentRequestSession(held, client);
      const creator = await this.requireCreator(client, actor, creatorId);
      invariant(
        creator.verification === "verified" && !creator.recovery_required,
        "creator_verification_required",
        "Current creator verification and signing recovery are required.",
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`team:${creatorId}:${accountId}`],
      );
      const membership = (
        await client.query<{ roles: unknown }>(
          "SELECT roles FROM creator.team_membership WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL FOR UPDATE",
          [creatorId, accountId],
        )
      ).rows[0];
      if (!membership)
        throw new DomainError(
          "team_member_unavailable",
          "This member no longer has access. Refresh the team before continuing.",
          409,
        );
      const roles = TeamRolesUpdateInputSchema.shape.roles.parse(
        membership.roles,
      );
      const same = (left: readonly string[], right: readonly string[]) =>
        [...left].sort().join("|") === [...right].sort().join("|");
      if (!same(roles, body.roles)) {
        if (!same(roles, body.expectedRoles))
          throw new DomainError(
            "team_roles_changed",
            "This member's roles changed. Refresh the team and review them before saving.",
            409,
          );
        await client.query(
          "UPDATE creator.team_membership SET roles=$3 WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL",
          [creatorId, accountId, [...body.roles].sort()],
        );
      }
      // Also on a retry: an unaccepted invitation must not restore old roles.
      await client.query(
        "UPDATE creator.team_invitation SET revoked_at=clock_timestamp() WHERE creator_id=$1 AND account_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL",
        [creatorId, accountId],
      );
      await assertAllowed(actor, creatorId, client);
      await assertHeldCurrentRequestSession(held, client);
      return { done: true as const };
    });
  }
}
