import type { Pool } from "pg";
import type { IdentityRuntime } from "../identity/router.js";
import type { AccessService } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import type { Evidence } from "./contracts.js";
import { identityTransaction } from "../identity/transaction.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { TrustDependencies } from "./service.js";
import { DomainError } from "../../core/errors.js";

/** Bind privacy to W1's freshly authenticated session, never a client timestamp.
 * Domain hooks still own erasure and preservation of closed-account job access.
 */
export function trustIdentityAuthority(
  pool: Pool,
  identity: IdentityRuntime,
  access: AccessService,
  database: Database,
): TrustDependencies {
  return {
    privacyVerificationMethod: "current_session",
    async evidence(actor, input) {
      if (input.requestId)
        throw new DomainError(
          "commerce_evidence_unavailable",
          "Request evidence is not connected yet.",
          503,
        );
      if (!input.creatorId) return { items: [] };
      const profiles = await identity.profiles.view(actor);
      if (!profiles.fan)
        throw new DomainError(
          "fan_scope_required",
          "A fan scope is needed to report this message.",
        );
      const scope = await access.openThread(
        actor,
        input.creatorId,
        profiles.fan.id as string,
        false,
      );
      if (scope.authority !== "fan")
        throw new DomainError(
          "fan_scope_required",
          "You can report only your own conversation.",
        );
      const items: Evidence[] = input.messageId
        ? await database.withThread(scope, async (client) => {
            const row = (
              await client.query<{
                id: string;
                author_kind: "ai";
                text: string;
                created_at: string;
                thread_id: string;
              }>(
                "SELECT id,author_kind,text,created_at,thread_id FROM creator.message WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND thread_id=$4 AND author_kind='ai'",
                [input.messageId, scope.creatorId, scope.fanId, scope.threadId],
              )
            ).rows[0];
            if (!row)
              throw new DomainError(
                "message_unavailable",
                "This AI message is unavailable.",
                404,
              );
            return [
              {
                ...row,
                category: "reported_ai_message",
                creator_name: scope.creatorName,
              },
            ];
          })
        : [];
      return {
        creatorId: scope.creatorId,
        creatorName: scope.creatorName,
        subjectAccountId: scope.creatorAccountId,
        items,
      };
    },
    async verifyPrivacy(actor) {
      const current = requestAuthority.getStore();
      if (
        !current ||
        current.accountId !== actor.accountId ||
        identity.sessions.mode !== "pantopus"
      )
        throw new DomainError(
          "fresh_verification_required",
          "Continue with Pantopus again before requesting data changes.",
          401,
        );
      return identityTransaction(pool, actor.accountId, async (client) => {
        const row = (
          await client.query<{ created_at: Date }>(
            "SELECT created_at FROM creator.identity_session WHERE id=$1 AND account_id=$2 AND mode='pantopus' AND revoked_at IS NULL AND expires_at>clock_timestamp()",
            [current.sessionId, actor.accountId],
          )
        ).rows[0];
        if (!row)
          throw new DomainError(
            "fresh_verification_required",
            "Continue with Pantopus again before requesting data changes.",
            401,
          );
        return {
          verifiedAt: row.created_at,
          reference: `w1-session:${current.sessionId}`,
        };
      });
    },
    async privacyOwnership(actor) {
      const profiles = await identity.profiles.view(actor);
      return {
        creatorIds: profiles.creator ? [profiles.creator.id as string] : [],
        reference: `w1-owned-profile:${profiles.creator?.version ?? 0}`,
      };
    },
    async authorizePrivacyScope(actor, input) {
      const profiles = await identity.profiles.view(actor);
      if (!profiles.fan || !input.creatorId)
        throw new DomainError(
          "scope_unavailable",
          "This data scope is unavailable.",
          404,
        );
      if (input.kind === "delete") {
        // Negative authority closes normal reads; it must not prevent a fan
        // erasing an already blocked relationship. Verify only family metadata
        // under W1's current actor/session and existing RLS, never message text.
        await identityTransaction(pool, actor.accountId, async (client) => {
          await client.query(
            "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
            [input.creatorId, profiles.fan.id],
          );
          const row = (
            await client.query<{ id: string }>(
              "SELECT t.id FROM creator.thread t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE t.creator_id=$1 AND t.fan_id=$2 AND f.account_id=$3",
              [input.creatorId, profiles.fan.id, actor.accountId],
            )
          ).rows[0];
          if (!row || (input.threadId && input.threadId !== row.id))
            throw new DomainError(
              "scope_unavailable",
              "This data scope is unavailable.",
              404,
            );
        });
        return;
      }
      const scope = await access.openThread(
        actor,
        input.creatorId,
        profiles.fan.id as string,
        false,
      );
      if (
        scope.authority !== "fan" ||
        (input.threadId && input.threadId !== scope.threadId)
      )
        throw new DomainError(
          "scope_unavailable",
          "This data scope is unavailable.",
          404,
        );
    },
  };
}
