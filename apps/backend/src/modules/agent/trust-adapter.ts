import type { EffectHook, PrivacyHook } from "../trust/contracts.js";
import type { CreatorScope } from "./repository.js";
import type { AgentService } from "./service.js";
import type { AgentLifecycle } from "./lifecycle.js";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";

/** W1/W8 supply authoritative job and case projections; HTTP fields cannot mint these scopes. */
export interface AgentTrustAuthority {
  privacyCreators(
    input: Parameters<PrivacyHook["run"]>[0],
  ): Promise<readonly CreatorScope[]>;
  verifiedNotice(
    input: Parameters<EffectHook["run"]>[0],
  ): Promise<{ scope: CreatorScope; reference: string }>;
}
export function agentPrivacyHook(
  service: AgentService,
  lifecycle: AgentLifecycle,
  authority: AgentTrustAuthority,
): PrivacyHook {
  return {
    domain: "agent",
    async run(input) {
      const scopes = await authority.privacyCreators(input);
      invariant(
        scopes.length <= 100,
        "privacy_scope_large",
        "Split this account operation into bounded creator jobs.",
      );
      if (input.scope === "thread") {
        invariant(
          !scopes.length,
          "privacy_scope_invalid",
          "Thread jobs cannot erase creator-wide AI state.",
        );
        return {
          receipt: {
            domain: "agent",
            jobId: input.jobId,
            threadData: "not_stored_by_agent",
          },
        };
      }
      for (const scope of scopes)
        invariant(
          scope.accountId === input.accountId &&
            (!input.creatorId || scope.creatorId === input.creatorId) &&
            !scope.development,
          "privacy_scope_invalid",
          "The verified privacy job does not match creator ownership.",
        );
      if (input.kind === "export") {
        const data = [];
        for (const scope of scopes) data.push(await service.export(scope));
        return {
          receipt: {
            domain: "agent",
            jobId: input.jobId,
            exportedCreators: data.length,
          },
          data,
        };
      }
      const receipts = [];
      for (const scope of scopes)
        receipts.push(
          await lifecycle.purge(
            scope,
            contentHash({
              key: input.idempotencyKey,
              creatorId: scope.creatorId,
            }),
          ),
        );
      return {
        receipt: {
          domain: "agent",
          jobId: input.jobId,
          purgedCreators: receipts.length,
          receipts,
        },
      };
    },
  };
}
export function agentNoticeHook(
  type: "pause_creator" | "revoke_license" | "suspend_account",
  lifecycle: AgentLifecycle,
  authority: AgentTrustAuthority,
): EffectHook {
  return {
    type,
    async run(input) {
      const verified = await authority.verifiedNotice(input);
      invariant(
        verified.reference &&
          input.creatorId === verified.scope.creatorId &&
          !verified.scope.development,
        "notice_scope_invalid",
        "A verified current creator notice is required.",
      );
      const receipt = await lifecycle.pauseNotice(verified.scope, {
        jobId: input.idempotencyKey,
        reason: type === "revoke_license" ? "license_revoked" : "suspension",
        verifiedNoticeReference: verified.reference,
      });
      return { receipt };
    },
  };
}
