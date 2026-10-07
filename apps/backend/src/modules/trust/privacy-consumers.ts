import type { Pool, PoolClient } from "pg";
import type { PrivacyHook } from "./contracts.js";
import { identityPrivacyHook } from "./identity-privacy-hook.js";
import { conversationPrivacyAuthority } from "./conversation-privacy-authority.js";
import {
  conversationPrivacyHook,
  type ConversationPrivacyRetention,
  type ConversationPrivacyInput,
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
import { commerceFinancialExportStream } from "../commerce/financial-export-stream.js";
import {
  privacyTaskAuthority,
  privacyTaskAuthorityInTransaction,
  restoredPrivacyTaskAuthorityInTransaction,
} from "./privacy-authority.js";
import {
  createCommercePrivacyAuthority,
  type CommercePrivacyConfiguration,
} from "../commerce/privacy-purpose.js";
import { DomainError, invariant } from "../../core/errors.js";
import { PreparedConversationPrivacyCursor } from "../conversation/privacy-export-cursor.js";
import { PreparedGenerationProvenancePurge } from "../conversation/generation-provenance-privacy.js";
import { trustPrivacyHook } from "./own-privacy-hook.js";
import { mediaPrivacyHook } from "./media-privacy-hook.js";
import { growthPrivacyHook } from "../growth/lifecycle.js";
import type { GrowthService } from "../growth/service.js";
import { contentPrivacyHook } from "../content/privacy.js";
import type { ContentPrivacyExport } from "../content/privacy-export.js";
import { domainPrivacyTaskAuthorityInTransaction } from "./domain-privacy-authority.js";
import { prepareGenerationAccountingRetention } from "./generation-accounting-retention.js";
import { PreparedPrivacyAccountingBoundary } from "./accounting-boundary.js";
import type { PrivacyArtifactStore } from "./privacy-export.js";
import type { TrustWorker } from "./worker.js";
import type { AgentRepository } from "../agent/repository.js";
import type { PreparedUsageRetention } from "../agent/usage-retention.js";

// Registration belongs to the exact hooks installed in the original worker.
// Copies, domain names and a second pool with the same URL are not evidence.
const registrations = new WeakMap<
  PrivacyHook[],
  {
    pool: Pool;
    coordinator: Pool;
    worker?: TrustWorker;
    hooks: {
      hook: PrivacyHook;
      domain: PrivacyHook["domain"];
      run: PrivacyHook["run"];
    }[];
    agent: () => AgentPrivacyOwnerPorts | undefined;
  }
>();

/** Called only by the owning runtime as it installs its original worker. */
export function installPrivacyConsumers(worker: TrustWorker): void {
  const original = registrations.get(worker.privacyHooks);
  if (!original) return;
  invariant(
    !original.worker && original.coordinator === worker.pool,
    "privacy_consumers_unregistered",
    "Privacy consumers belong to one original Trust worker.",
  );
  original.worker = worker;
}

export function assertPrivacyConsumersRegistered(
  worker: TrustWorker,
  pool: Pool,
  accounting?: {
    repository: AgentRepository;
    retention: PreparedUsageRetention;
  },
): void {
  const original = registrations.get(worker.privacyHooks);
  invariant(
    original &&
      original.worker === worker &&
      original.pool === pool &&
      original.coordinator === worker.pool &&
      original.hooks.length === worker.privacyHooks.length &&
      original.hooks.every(
        ({ hook, domain, run }, index) =>
          worker.privacyHooks[index] === hook &&
          hook.domain === domain &&
          hook.run === run,
      ),
    "privacy_consumers_unregistered",
    "The original accounting privacy consumers must remain installed in this host's Trust worker.",
  );
  if (accounting) {
    const agent = original.agent();
    invariant(
      agent?.service.repository === accounting.repository,
      "agent_lifecycle_composition_mismatch",
      "Accounting expiry must use the Agent repository registered for privacy.",
    );
    agent.lifecycle.assertRepository(accounting.repository);
    agent.lifecycle.assertUsageRetention(accounting.retention);
  }
}

/** Actual host owners and reviewed registration only. W8 supplies its original
 * task/family authority when binding them; the host cannot replace that port. */
export type GenerationAccountingPreparation = Omit<
  Parameters<typeof prepareGenerationAccountingRetention>[0],
  "pool" | "configuration"
> & {
  configuration: Omit<
    Parameters<typeof prepareGenerationAccountingRetention>[0]["configuration"],
    "authority"
  >;
};

export type ConversationPrivacyOwnerPorts = Omit<
  ConversationPrivacyInput,
  "pool" | "authority" | "retention" | "deletionReceipts"
> & {
  /** Real prepared W2 owners and independently reviewed0233 custody. The
   * coordinator supplies its own actual authority, never a caller substitute. */
  cursorPreparation?: Omit<
    Parameters<typeof PreparedConversationPrivacyCursor.prepare>[0],
    "pool" | "authority" | "lineage" | "recordings"
  >;
  /** Actual independently reviewed0217 definition/effective custody. The
   * coordinator fixes its own original pool/task authority at preparation. */
  provenancePurgePreparation?: Omit<
    Parameters<typeof PreparedGenerationProvenancePurge.prepare>[0],
    "pool" | "authority"
  >;
  accountingPreparation?: GenerationAccountingPreparation;
};

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
  /** The same protected store owned by the original Trust coordinator. */
  privacyArtifacts?: PrivacyArtifactStore;
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
  /** Original W2 source prepared by this host with W8's actual held-task port. */
  agentExport?: PreparedAgentPrivacyExport;
  commerce?: CommerceService;
  /** Trust starts before the canonical Commerce graph. Resolve only its
   * actual service at task execution; no eager replacement owner is created. */
  commerceOwner?: () => CommerceService | undefined;
  /** Exact registered job fence/function custody; absent configuration never issues a financial export scope. */
  commercePrivacy?: CommercePrivacyConfiguration;
  commerceArtifacts?: import("../commerce/financial-export.js").FinancialExportSink;
  growth?: GrowthService;
  content?: {
    purposePool: Pool;
    retention?: Parameters<typeof contentPrivacyHook>[1];
    revokeSources?: Parameters<typeof contentPrivacyHook>[2];
    /** Genuine prepared W5 owner, bound to this exact non-owner pool. The
     * coordinator supplies original task/restoration authority below; neither
     * its returned IDs nor this port expand non-account family ownership. */
    exporter?: ContentPrivacyExport;
  };
  media?: Omit<
    Parameters<typeof mediaPrivacyHook>[0],
    "runtime" | "coordinator" | "assertRestoredInTransaction"
  >;
  additional?: PrivacyHook[];
}) {
  input = { ...input };
  const verify = privacyTaskAuthority(input.coordinatorPool);
  const conversationAuthority = conversationPrivacyAuthority(
    input.runtimePool,
    input.coordinatorPool,
    input.assertRestoredInTransaction,
  );
  const prepareBoundary = async (signal: AbortSignal | undefined) => {
    invariant(
      input.assertRestoredInTransaction,
      "accounting_boundary_unconfigured",
      "Original held restoration authority is required for accounting privacy.",
    );
    return PreparedPrivacyAccountingBoundary.prepare({
      pool: input.runtimePool,
      authority: conversationAuthority,
      assertRestoredInTransaction: input.assertRestoredInTransaction,
      artifacts: input.privacyArtifacts,
      signal,
    });
  };
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
        job.signal?.throwIfAborted();
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
        let exportCursor = owners?.exportCursor;
        let provenancePurge = owners?.provenancePurge;
        let accounting = owners?.accounting;
        let financial = owners?.generationCostPrivacyReconciliation;
        if (owners?.accountingPreparation) {
          invariant(
            !accounting &&
              !financial &&
              (!owners.cursorPreparation ||
                (owners.cursorPreparation.journal ===
                  owners.accountingPreparation.journal &&
                  owners.cursorPreparation.usageRetention ===
                    owners.accountingPreparation.usageRetention)),
            "conversation_accounting_composition_mismatch",
            "Export and deletion must use the same original accounting owners.",
          );
          const prepared = await prepareGenerationAccountingRetention({
            ...owners.accountingPreparation,
            pool: input.runtimePool,
            configuration: {
              ...owners.accountingPreparation.configuration,
              authority: conversationAuthority,
            },
          });
          accounting = prepared.accounting;
          financial = prepared.financial;
          job.signal?.throwIfAborted();
        }
        if (
          job.kind === "delete" &&
          !provenancePurge &&
          owners?.provenancePurgePreparation
        ) {
          provenancePurge = await PreparedGenerationProvenancePurge.prepare({
            ...owners.provenancePurgePreparation,
            pool: input.runtimePool,
            authority: conversationAuthority,
          });
        }
        if (
          job.kind === "export" &&
          !exportCursor &&
          owners?.cursorPreparation
        ) {
          invariant(
            owners.lineage && owners.recordings,
            "conversation_export_unconfigured",
            "Complete export requires its actual prepared source owners.",
          );
          exportCursor = await PreparedConversationPrivacyCursor.prepare({
            ...owners.cursorPreparation,
            pool: input.runtimePool,
            authority: conversationAuthority,
            lineage: owners.lineage,
            recordings: owners.recordings,
          });
        }
        if (exportCursor && owners?.accountingPreparation)
          exportCursor.assertAccounting(
            owners.accountingPreparation.journal,
            owners.accountingPreparation.usageRetention,
          );
        return conversationPrivacyHook({
          ...owners,
          ...(accounting ? { accounting } : {}),
          ...(financial
            ? { generationCostPrivacyReconciliation: financial }
            : {}),
          ...(exportCursor ? { exportCursor } : {}),
          ...(provenancePurge ? { provenancePurge } : {}),
          ...(job.kind === "delete" && accounting
            ? { deletionReceipts: await prepareBoundary(job.signal) }
            : {}),
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
        owner.lifecycle.assertRepository(owner.service.repository);
        const exportSnapshot = owner.privacyExportSnapshot ?? input.agentExport;
        exportSnapshot?.assertHostPool(input.runtimePool);
        const accountingBoundary = owner.service.repository.usageJournal
          ? await prepareBoundary(job.signal)
          : undefined;
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
            accountingBoundary?.agentBoundary.bind(accountingBoundary),
          ),
          owner.artifacts,
          Boolean(exportSnapshot),
          exportSnapshot,
        ).run(job);
      },
    });
  invariant(
    !(input.commerce && input.commerceOwner),
    "commerce_privacy_owner_ambiguous",
    "Commerce privacy requires one original owner graph.",
  );
  if (input.commerce || input.commerceOwner) {
    hooks.push({
      domain: "commerce",
      async run(job) {
        const service = input.commerceOwner
          ? input.commerceOwner()
          : input.commerce;
        if (!service)
          throw new DomainError(
            "domain_hook_unavailable",
            "The original Commerce privacy owner is unavailable.",
            503,
          );
        const purpose = createCommercePrivacyAuthority(
          service.pool,
          input.commercePrivacy,
          input.assertRestoredInTransaction,
        );
        await verify(job);
        if (job.kind === "export" && !input.commerceArtifacts) {
          return {
            receipt: {
              schemaVersion: 1,
              domain: "commerce",
              jobId: job.jobId,
              scope: job.scope,
            },
            stream: commerceFinancialExportStream(service, purpose, job),
          };
        }
        const result = await commercePrivacyHook(
          service,
          purpose,
          input.commerceArtifacts,
        ).run(job);
        await verify(job);
        return result;
      },
    });
  }
  if (input.growth) {
    const restore = input.assertRestoredInTransaction;
    hooks.push(
      growthPrivacyHook(input.growth, undefined, async (client, job) => {
        if (!restore)
          throw new DomainError(
            "privacy_commit_fence_unavailable",
            "Current held restoration authority is required.",
            503,
          );
        return domainPrivacyTaskAuthorityInTransaction(
          client,
          job,
          "growth",
          restore,
        );
      }),
    );
  }
  if (input.content) {
    const owner = contentPrivacyHook(
      input.content.purposePool,
      input.content.retention,
      input.content.revokeSources,
      (client, job) =>
        restoredPrivacyTaskAuthorityInTransaction(
          client,
          job,
          input.assertRestoredInTransaction,
        ),
      input.content.exporter,
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
  if (
    input.agent &&
    input.conversation &&
    (input.commerce || input.commerceOwner) &&
    input.assertRestoredInTransaction
  ) {
    const agent = input.agent;
    registrations.set(hooks, {
      pool: input.runtimePool,
      coordinator: input.coordinatorPool,
      hooks: hooks.map((hook) => ({
        hook,
        domain: hook.domain,
        run: hook.run,
      })),
      agent: typeof agent === "function" ? agent : () => agent,
    });
  }
  return hooks;
}
