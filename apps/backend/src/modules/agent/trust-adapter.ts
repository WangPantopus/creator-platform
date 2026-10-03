import { agentPrivacyTransaction } from "./privacy-transaction.js";
import { createHash } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { privacyOwnershipScope } from "../trust/privacy-ownership.js";
import type { EffectHook, PrivacyHook } from "../trust/contracts.js";
import type { CreatorScope } from "./repository.js";
import type { AgentService } from "./service.js";
import type { AgentLifecycle } from "./lifecycle.js";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import { agentExportStream } from "./privacy-stream.js";
import type { PreparedAgentPrivacyExport } from "./privacy-export-snapshot.js";

/** W1/W8 supply authoritative job and case projections; HTTP fields cannot mint these scopes. */
export interface AgentTrustAuthority {
  /** Actual W8 task, cancellation, restoration and COMMIT custody on the
   * owner's held client, including genuinely empty families. */
  assertPrivacyTaskInTransaction(
    client: PoolClient,
    input: Parameters<PrivacyHook["run"]>[0],
  ): Promise<readonly string[]>;
  /** Actual completed W8 conversation task/artifact or disposition receipt,
   * revalidated on this job's held agent client. No registration flag suffices. */
  accountingBoundary?(
    input: Parameters<PrivacyHook["run"]>[0],
    client: PoolClient,
    scopes: readonly CreatorScope[],
  ): Promise<{ reference: string }>;
  privacyCreators(
    input: Parameters<PrivacyHook["run"]>[0],
  ): Promise<readonly CreatorScope[]>;
  verifiedNotice(
    input: Parameters<EffectHook["run"]>[0],
    type: "agent.pause" | "agent.revoke_license",
  ): Promise<{ scope: CreatorScope; reference: string }>;
}
/** Uses the worker role and immutable W8 ownership snapshot, never profile absence.
 * The lease/current job must still authorize this exact kind/scope/account. */
export function createAgentTrustAuthority(
  workerPool: Pool,
  ownerScope: (creatorId: string) => Promise<CreatorScope>,
  assertPrivacyTaskInTransaction: AgentTrustAuthority["assertPrivacyTaskInTransaction"],
  accountingBoundary?: AgentTrustAuthority["accountingBoundary"],
): AgentTrustAuthority {
  const ownership = privacyOwnershipScope(workerPool);
  return {
    assertPrivacyTaskInTransaction,
    ...(accountingBoundary ? { accountingBoundary } : {}),
    async privacyCreators(input) {
      z.uuid().parse(input.jobId);
      z.uuid().parse(input.accountId);
      z.uuid().parse(input.leaseToken);
      invariant(
        input.idempotencyKey === `${input.jobId}:agent`,
        "privacy_authority_invalid",
        "The exact leased agent task is required.",
      );
      const job = (
        await workerPool.query(
          `SELECT j.scope FROM creator_trust.privacy_job j JOIN creator_trust.privacy_task t ON t.job_id=j.id
         WHERE j.id=$1 AND j.account_id=$2 AND j.kind=$3 AND j.scope=$4
         AND j.creator_id IS NOT DISTINCT FROM $5::uuid AND j.thread_id IS NOT DISTINCT FROM $6::uuid
         AND j.verified_at IS NOT NULL AND j.verification_ref IS NOT NULL
         AND t.domain='agent' AND t.state='running' AND t.lease_until>now() AND t.lease_token=$7`,
          [
            input.jobId,
            input.accountId,
            input.kind,
            input.scope,
            input.creatorId,
            input.threadId,
            input.leaseToken,
          ],
        )
      ).rows[0];
      invariant(
        job,
        "privacy_authority_changed",
        "The verified privacy job is no longer current.",
      );
      if (job.scope === "thread") return [];
      invariant(
        job.scope === "account",
        "privacy_scope_unavailable",
        "Creator-wide AI removal requires verified account ownership.",
      );
      const ids = await ownership(input);
      invariant(
        ids !== null,
        "privacy_ownership_required",
        "This job has no verified pre-deletion ownership snapshot.",
      );
      return ids.map((creatorId) => ({
        creatorId,
        accountId: input.accountId,
        development: false,
      }));
    },
    async verifiedNotice(input, type) {
      z.uuid().parse(input.leaseToken);
      invariant(
        input.idempotencyKey === input.effectId,
        "notice_authority_invalid",
        "The exact leased case effect is required.",
      );
      const intent = (
        await workerPool.query(
          `SELECT c.creator_id,e.type,e.input FROM creator_trust.effect e JOIN creator_trust.safety_case c ON c.id=e.case_id
         WHERE e.id=$1 AND e.case_id=$2 AND e.actor_account_id=$3 AND c.creator_id=$4
         AND e.type=$5 AND e.state='running' AND e.lease_until>now() AND e.lease_token=$6
         AND c.state='action_pending' AND c.version=e.decision_version AND c.decision_account_id=e.actor_account_id`,
          [
            input.effectId,
            input.caseId,
            input.actorAccountId,
            input.creatorId,
            type,
            input.leaseToken,
          ],
        )
      ).rows[0];
      invariant(
        intent,
        "notice_authority_changed",
        "The verified case action is no longer current.",
      );
      invariant(
        contentHash(intent.input) ===
          contentHash({
            creatorId: input.creatorId,
            requestId: input.requestId,
            reason: input.reason,
            ...(input.amountMinor === undefined
              ? {}
              : { amountMinor: input.amountMinor }),
          }),
        "notice_authority_changed",
        "The case effect payload changed.",
      );
      const scope = await ownerScope(intent.creator_id);
      invariant(
        !scope.development && scope.creatorId === input.creatorId,
        "notice_scope_invalid",
        "Current creator ownership is required.",
      );
      return {
        scope,
        reference: `${input.caseId}:${input.effectId}:${intent.type}`,
      };
    },
  };
}
export interface AgentExportArtifactSink {
  begin(input: {
    jobId: string;
    creatorId: string;
    accountId: string;
    idempotencyKey: string;
  }): Promise<{
    write(part: string): Promise<void>;
    complete(input: {
      bytes: number;
      sha256: string;
    }): Promise<{ reference: string }>;
    abort(): Promise<void>;
  }>;
}
export function agentPrivacyHook(
  service: AgentService,
  lifecycle: AgentLifecycle,
  authority: AgentTrustAuthority,
  artifacts?: AgentExportArtifactSink,
  coordinatorStream = false,
  exportSnapshot?: PreparedAgentPrivacyExport,
): PrivacyHook {
  const boundary = authority.accountingBoundary?.bind(authority);
  return {
    domain: "agent",
    async run(input) {
      invariant(
        input.signal &&
          typeof authority.assertPrivacyTaskInTransaction === "function",
        "privacy_commit_fence_unavailable",
        "The actual cancellable held-client Agent lifecycle authority is required.",
      );
      const scopes = await authority.privacyCreators(input);
      invariant(
        scopes.length <= 100,
        "privacy_scope_large",
        "Split this account operation into bounded creator jobs.",
      );
      input.signal?.throwIfAborted();
      let accountingReference: string | undefined;
      let lineage = false;
      const assertBoundary = boundary
        ? (client: PoolClient) => boundary(input, client, scopes)
        : undefined;
      const assertTask = async (client: PoolClient) => {
        invariant(
          typeof authority.assertPrivacyTaskInTransaction === "function",
          "privacy_commit_fence_unavailable",
          "The actual held lifecycle task and restoration authority are required.",
        );
        input.signal?.throwIfAborted();
        const current = await authority.assertPrivacyTaskInTransaction(
          client,
          input,
        );
        invariant(
          contentHash([...current].sort()) ===
            contentHash(scopes.map((scope) => scope.creatorId).sort()),
          "privacy_authority_changed",
          "This held task's immutable creator ownership must match the original scopes.",
        );
        input.signal?.throwIfAborted();
      };
      await agentPrivacyTransaction(
        service.repository.pool,
        input.signal,
        async (accountingClient) => {
          await service.repository.assertRuntimeRoleInTransaction(
            accountingClient,
          );
          input.signal?.throwIfAborted();
          await assertTask(accountingClient);
          lineage = await lifecycle.assertAccountingClient(accountingClient);
          if (lineage) {
            invariant(
              assertBoundary,
              "thread_accounting_privacy_unconfigured",
              "Complete the actual conversation accounting task before acknowledging agent privacy.",
            );
            accountingReference = (await assertBoundary(accountingClient))
              .reference;
            invariant(
              accountingReference,
              "accounting_boundary_incomplete",
              "The durable conversation accounting boundary is required.",
            );
            invariant(
              (await assertBoundary(accountingClient)).reference ===
                accountingReference,
              "accounting_boundary_changed",
              "The completed accounting boundary changed.",
            );
          }
          input.signal?.throwIfAborted();
          await assertTask(accountingClient);
        },
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
            threadData: lineage
              ? "handled_by_conversation"
              : "not_stored_by_agent",
            ...(accountingReference
              ? { accountingBoundaryReference: accountingReference }
              : {}),
          },
          ...(input.kind === "export" ? { data: [] } : {}),
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
      const assertCurrent = async () => {
        const current = await authority.privacyCreators(input);
        invariant(
          contentHash(current) === contentHash(scopes),
          "privacy_authority_changed",
          "The verified owner scope changed.",
        );
      };
      if (input.kind === "export") {
        if (coordinatorStream)
          return {
            receipt: {
              domain: "agent",
              jobId: input.jobId,
              exportScopeCreators: scopes.length,
              ...(accountingReference
                ? { accountingBoundaryReference: accountingReference }
                : {}),
            },
            stream: agentExportStream(
              service,
              scopes,
              assertCurrent,
              assertTask,
              input.signal,
              assertBoundary
                ? {
                    assertCurrent: assertBoundary,
                    assertCustody: (client) =>
                      lifecycle.assertAccountingClient(client),
                  }
                : undefined,
              exportSnapshot
                ? { prepared: exportSnapshot, job: input }
                : undefined,
            ),
          };
        invariant(
          !lineage,
          "thread_accounting_privacy_unconfigured",
          "Installed accounting lineage requires the coordinator's complete held-snapshot export stream.",
        );
        if (scopes.length)
          invariant(
            artifacts,
            "privacy_artifact_unconfigured",
            "Connect the protected export artifact store before completing this data request.",
          );
        const data = [];
        for (const scope of scopes) {
          await assertCurrent();
          const sink = await artifacts!.begin({
            jobId: input.jobId,
            creatorId: scope.creatorId,
            accountId: scope.accountId,
            idempotencyKey: contentHash({
              jobId: input.jobId,
              creatorId: scope.creatorId,
            }),
          });
          const hash = createHash("sha256");
          let bytes = 0;
          try {
            await agentPrivacyTransaction(
              service.repository.pool,
              input.signal,
              async (client) => {
                await service.repository.assertRuntimeRoleInTransaction(client);
                input.signal?.throwIfAborted();
                await assertTask(client);
                await client.query(
                  "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
                  [scope.creatorId, scope.accountId],
                );
                const snapshotClient = client;
                await service.exportInTransaction(
                  scope,
                  client,
                  async (part) => {
                    await assertTask(snapshotClient);
                    await assertCurrent();
                    hash.update(part);
                    bytes += Buffer.byteLength(part);
                    await sink.write(part);
                  },
                  input.signal!,
                );
                await assertCurrent();
                await assertTask(client);
              },
              "REPEATABLE READ",
            );
            const sha256 = hash.digest("hex");
            const artifact = await sink.complete({ bytes, sha256 });
            invariant(
              artifact.reference,
              "export_artifact_incomplete",
              "The complete protected export artifact is required.",
            );
            data.push({
              creatorId: scope.creatorId,
              ...artifact,
              bytes,
              sha256,
              mediaType: "application/json",
            });
          } catch (error) {
            try {
              await sink.abort();
            } catch (cleanup) {
              throw new AggregateError(
                [error, cleanup],
                "Agent export source and artifact cleanup failed",
              );
            }
            throw error;
          }
        }
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
            assertCurrent,
            assertTask,
            assertBoundary,
            input.signal,
          ),
        );
      return {
        receipt: {
          domain: "agent",
          jobId: input.jobId,
          purgedCreators: receipts.length,
          receipts,
        },
        retained: receipts.flatMap((receipt) => receipt.retained),
      };
    },
  };
}
export function agentNoticeHook(
  type: "agent.pause" | "agent.revoke_license",
  lifecycle: AgentLifecycle,
  authority: AgentTrustAuthority,
  settleDeparture: (
    input: Parameters<EffectHook["run"]>[0],
  ) => Promise<{ complete: boolean; receipt: Record<string, unknown> }>,
): EffectHook {
  return {
    type,
    async run(input) {
      const verified = await authority.verifiedNotice(input, type);
      invariant(
        verified.reference &&
          input.creatorId === verified.scope.creatorId &&
          !verified.scope.development,
        "notice_scope_invalid",
        "A verified current creator notice is required.",
      );
      const receipt = await lifecycle.pauseNotice(verified.scope, {
        jobId: input.effectId,
        reason:
          type === "agent.revoke_license" ? "license_revoked" : "suspension",
        verifiedNoticeReference: verified.reference,
      });
      const settlement = await settleDeparture(input);
      invariant(
        settlement.complete,
        "commerce_lifecycle_pending",
        "Generation is denied; commitment settlement remains pending.",
      );
      const current = await authority.verifiedNotice(input, type);
      invariant(
        contentHash(current) === contentHash(verified),
        "notice_authority_changed",
        "The case effect changed during settlement.",
      );
      return { receipt: { ...receipt, settlement: settlement.receipt } };
    },
  };
}
