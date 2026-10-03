import type { Pool, PoolClient } from "pg";
import type { PrivacyHook } from "./contracts.js";
import { identityPrivacyHook } from "./identity-privacy-hook.js";
import { conversationPrivacyAuthority } from "./conversation-privacy-authority.js";
import {
  conversationPrivacyHook,
  type ConversationPrivacyRetention,
} from "../conversation/privacy.js";
import {
  agentPrivacyHook,
  createAgentTrustAuthority,
  type AgentExportArtifactSink,
} from "../agent/trust-adapter.js";
import type { AgentService } from "../agent/service.js";
import type { AgentLifecycle } from "../agent/lifecycle.js";
import type { PreparedAgentPrivacyExport } from "../agent/privacy-export-snapshot.js";
import type { CommerceService } from "../commerce/service.js";
import { commercePrivacyHook } from "../commerce/operations.js";
import {
  privacyTaskAuthority,
  privacyTaskAuthorityInTransaction,
} from "./privacy-authority.js";
import {
  createCommercePrivacyAuthority,
  type CommercePrivacyConfiguration,
} from "../commerce/privacy-purpose.js";
import { DomainError, invariant } from "../../core/errors.js";
import { trustPrivacyHook } from "./own-privacy-hook.js";
import { mediaPrivacyHook } from "./media-privacy-hook.js";
import type { GrowthService } from "../growth/service.js";
import { contentPrivacyHook } from "../content/privacy.js";

export type ConversationPrivacyOwnerPorts = Omit<
  Parameters<typeof conversationPrivacyHook>[0],
  "pool" | "authority" | "retention"
>;

export type AgentPrivacyOwnerPorts = Readonly<{
  service: AgentService;
  lifecycle: AgentLifecycle;
  artifacts?: AgentExportArtifactSink;
  /** Genuine reviewed single-source cursor on this host's original pool. */
  privacyExportSnapshot?: PreparedAgentPrivacyExport;
}>;

/** Install actual owner hooks, leaving unavailable providers/policies explicit.
 * Domain services use their own non-owner pools; the coordinator never obtains
 * SELECT on peer private tables or an interactive grant. */
export function createPrivacyConsumers(input: {
  runtimePool: Pool;
  coordinatorPool: Pool;
  /** Real current restoration on the owner's held client, never a pool check. */
  assertRestoredInTransaction?: (client: PoolClient) => Promise<void>;
  conversationRetention?: ConversationPrivacyRetention;
  /** Prepared owner instances; the coordinator fixes the pool, actual task
   * authority and reviewed retention after spreading these owner ports. */
  conversation?:
    | ConversationPrivacyOwnerPorts
    | (() => ConversationPrivacyOwnerPorts | undefined);
  /** Trust starts before W1 binds the actual canonical Agent owner graph.
   * Resolve that graph once per original claimed task, never a substitute. */
  agent?: AgentPrivacyOwnerPorts | (() => AgentPrivacyOwnerPorts | undefined);
  commerce?: CommerceService;
  /** Exact registered job fence/function custody; absent configuration never issues a financial export scope. */
  commercePrivacy?: CommercePrivacyConfiguration;
  commerceArtifacts?: import("../commerce/financial-export.js").FinancialExportSink;
  growth?: GrowthService;
  content?: {
    purposePool: Pool;
    retention?: Parameters<typeof contentPrivacyHook>[1];
    revokeSources?: Parameters<typeof contentPrivacyHook>[2];
  };
  media?: Omit<
    Parameters<typeof mediaPrivacyHook>[0],
    "runtime" | "coordinator" | "assertRestoredInTransaction"
  >;
  additional?: PrivacyHook[];
}) {
  const verify = privacyTaskAuthority(input.coordinatorPool);
  const conversationAuthority = conversationPrivacyAuthority(
    input.runtimePool,
    input.coordinatorPool,
    input.assertRestoredInTransaction,
  );
  const hooks: PrivacyHook[] = [
    trustPrivacyHook(input.coordinatorPool, input.assertRestoredInTransaction),
    identityPrivacyHook(
      input.runtimePool,
      input.coordinatorPool,
      input.assertRestoredInTransaction,
    ),
    {
      domain: "conversation",
      async run(job) {
        const owners =
          typeof input.conversation === "function"
            ? input.conversation()
            : input.conversation;
        if (typeof input.conversation === "function" && !owners)
          throw new DomainError(
            "conversation_privacy_unavailable",
            "Conversation privacy owners are not composed yet.",
            503,
          );
        return conversationPrivacyHook({
          ...owners,
          pool: input.runtimePool,
          authority: conversationAuthority,
          retention: input.conversationRetention,
        }).run(job);
      },
    },
    mediaPrivacyHook({
      runtime: input.runtimePool,
      coordinator: input.coordinatorPool,
      ...input.media,
      assertRestoredInTransaction: input.assertRestoredInTransaction,
    }),
  ];
  if (input.agent)
    hooks.push({
      domain: "agent",
      async run(job) {
        const owner =
          typeof input.agent === "function" ? input.agent() : input.agent;
        if (!owner)
          throw new DomainError(
            "agent_privacy_unavailable",
            "The actual Agent privacy owner is not composed yet.",
            503,
          );
        invariant(
          owner.service.repository.pool === input.runtimePool,
          "privacy_export_pool_mismatch",
          "Use the actual canonical Agent owner on this host's original pool.",
        );
        owner.privacyExportSnapshot?.assertHostPool(input.runtimePool);
        return agentPrivacyHook(
          owner.service,
          owner.lifecycle,
          createAgentTrustAuthority(
            input.coordinatorPool,
            async () => {
              throw new DomainError(
                "notice_authority_required",
                "Privacy consumers cannot issue operations action scopes.",
                503,
              );
            },
            async (client, job) => {
              if (!input.assertRestoredInTransaction)
                throw new DomainError(
                  "privacy_restoration_unconfigured",
                  "Current restoration on the held Agent lifecycle client is required.",
                  503,
                );
              await input.assertRestoredInTransaction(client);
              const owned = await privacyTaskAuthorityInTransaction(
                client,
                job,
              );
              await input.assertRestoredInTransaction(client);
              return owned;
            },
          ),
          owner.artifacts,
          Boolean(owner.privacyExportSnapshot),
          owner.privacyExportSnapshot,
        ).run(job);
      },
    });
  if (input.commerce) {
    const purpose = createCommercePrivacyAuthority(
      input.commerce.pool,
      input.commercePrivacy,
    );
    const authority = {
      async withPrivacyJob<T>(
        job: Parameters<PrivacyHook["run"]>[0],
        work: Parameters<typeof purpose.withPrivacyJob<T>>[1],
      ) {
        await verify(job);
        const result = await purpose.withPrivacyJob(job, work);
        await verify(job);
        return result;
      },
    };
    hooks.push(
      commercePrivacyHook(input.commerce, authority, input.commerceArtifacts),
    );
  }
  if (input.growth) {
    hooks.push({
      domain: "growth",
      async run(job) {
        await verify(job);
        throw new DomainError(
          "growth_held_authority_unavailable",
          "Growth privacy requires its reviewed same-client task and COMMIT integration.",
          503,
        );
      },
    });
  }
  if (input.content) {
    const owner = contentPrivacyHook(
      input.content.purposePool,
      input.content.retention,
      input.content.revokeSources,
    );
    hooks.push({
      domain: "content",
      async run(job) {
        await verify(job);
        const result = await owner.run(job);
        await verify(job);
        return result;
      },
    });
  }
  hooks.push(...(input.additional ?? []));
  if (new Set(hooks.map((hook) => hook.domain)).size !== hooks.length)
    throw new Error("Duplicate privacy consumer.");
  return hooks;
}
