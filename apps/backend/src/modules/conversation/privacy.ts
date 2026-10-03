import type { Pool, PoolClient } from "pg";
import type { PrivacyHook } from "../trust/contracts.js";
import { DomainError, invariant } from "../../core/errors.js";
import { copy } from "@qelvora/copy";
import type { AuthorKind } from "@qelvora/api";
import type { ConversationRecordings } from "./recordings.js";
import type { ConversationLineage } from "./lineage.js";
import { generationJournalInstalled } from "../agent/generation-journal.js";
import type { GenerationAccountingLifecycle } from "../agent/journal-privacy.js";
import type {
  GenerationCostPrivacyReconciliation,
  GenerationPrivacyJob,
} from "../commerce/generation-privacy.js";
import { z } from "zod";
import { conversationPrivacyExportStream } from "./privacy-export-stream.js";
import { PreparedConversationPrivacyCursor } from "./privacy-export-cursor.js";
import {
  assertConversationPrivacyPool,
  cancelConversationPrivacyBackend,
  conversationPrivacyCause,
  conversationPrivacyReadUncertain,
} from "./privacy-cancellation.js";

type Job = Parameters<PrivacyHook["run"]>[0];
function financialJob(job: Job): GenerationPrivacyJob {
  const leased = (value: Job): value is GenerationPrivacyJob =>
    typeof value.leaseToken === "string" &&
    z.uuid().safeParse(value.leaseToken).success;
  invariant(
    leased(job),
    "privacy_lease_required",
    "Financial deletion requires the actual current leased privacy job.",
  );
  // Preserve the actual job object. W4/W8 recheck its lease and family on the
  // same client; a parsed token does not grant or replace lifecycle authority.
  return job;
}
export function conversationAuthorLabel(
  kind: AuthorKind,
  name: string,
  member: string | null,
) {
  const fill = (value: string) =>
    value
      .replaceAll("{name}", name)
      .replaceAll("{member}", member ?? "Authorized team member");
  switch (kind) {
    case "ai":
      return fill(copy.aiAuthor);
    case "approved_draft":
      return fill(copy.approvedAuthor);
    case "team":
      return fill(copy.teamAuthor);
    case "human_call":
      return fill(copy.callAuthor);
    case "human_broadcast":
      return `Note from ${name}`;
    case "human_reaction":
      return fill(copy.reaction);
    case "fan":
      return "You";
    case "system":
      return "Conversation update";
    case "human_creator":
      return name;
    default:
      throw new Error(
        "Disabled authorship cannot be exported as an active sender.",
      );
  }
}
export type ConversationPrivacyFamily = {
  threadId: string;
  creatorId: string;
  fanId: string;
};
/** W8 verifies the immutable job/ownership snapshot and leases a bounded subjob.
 * These are lifecycle scopes, never fabricated interactive ThreadScopes. */
export interface ConversationPrivacyAuthority {
  families(job: Job): Promise<readonly ConversationPrivacyFamily[]>;
  /** W8's actual task lock and deferred commit-currentness check, on this same
   * held domain client and before family locks. No separate-pool substitute. */
  fenceTaskInTransaction(client: PoolClient, job: Job): Promise<void>;
  assertFamily(
    client: PoolClient,
    job: Job,
    family: ConversationPrivacyFamily,
  ): Promise<void>;
}
export async function fenceConversationPrivacyTask(
  authority: ConversationPrivacyAuthority,
  client: PoolClient,
  job: Job,
) {
  if (!authority.fenceTaskInTransaction || !job.signal)
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "This data request needs the actual held task-lease commit barrier.",
      503,
    );
  job.signal.throwIfAborted();
  await authority.fenceTaskInTransaction(client, job);
  job.signal.throwIfAborted();
}
export interface ConversationPrivacyRetention {
  retainedMessages(
    client: PoolClient,
    job: Job,
    family: ConversationPrivacyFamily,
  ): Promise<
    readonly {
      messageId: string;
      until: string;
      reason: string;
    }[]
  >;
  settleGeneration?(
    client: PoolClient,
    job: Job,
    family: ConversationPrivacyFamily,
    generation: {
      id: string;
      reservationId: string | null;
      grantId: string;
      visible: boolean;
    },
  ): Promise<void>;
}

/** W2's prepared lifecycle producer consumes W8's real family/job authority.
 * This port never creates an interactive or provider-admission ThreadScope. */
export type ConversationAccountingLifecycle = Pick<
  GenerationAccountingLifecycle,
  "exportMetadataTo" | "sealGeneration" | "purgeFamilyPaged"
>;

export type ConversationPrivacyInput = {
  pool: Pool;
  authority: ConversationPrivacyAuthority;
  retention?: ConversationPrivacyRetention;
  lineage?: ConversationLineage;
  recordings?: ConversationRecordings;
  accounting?: ConversationAccountingLifecycle;
  /** Distinct reviewed0206 source. Per-family readers cannot substitute for
   * the one READ COMMITTED cursor snapshot required by the real0087 fence. */
  exportCursor?: PreparedConversationPrivacyCursor;
  /** Exact prepared W4 port; original-policy evidence precedes journal purge.
   * Finite reviewed retention and expiry remain W8's separate responsibility. */
  generationCostPrivacyReconciliation?: GenerationCostPrivacyReconciliation;
};
export function conversationPrivacyHook(
  input: ConversationPrivacyInput,
): PrivacyHook {
  return {
    domain: "conversation",
    async run(job) {
      invariant(
        job.signal && z.uuid().safeParse(job.leaseToken).success,
        "privacy_lease_required",
        "Use the actual leased worker task and its cancellation signal.",
      );
      const signal = job.signal;
      signal.throwIfAborted();
      if (!input.authority.fenceTaskInTransaction)
        throw new DomainError(
          "privacy_commit_fence_unavailable",
          "This data request needs the actual held task-lease commit barrier.",
          503,
        );
      const lineageSchema = (
        await input.pool.query(
          "SELECT to_regclass('creator.conversation_feedback') AS relation",
        )
      ).rows[0]?.relation;
      invariant(
        !lineageSchema || input.lineage,
        "conversation_lineage_unavailable",
        "This data request needs the prepared lineage export and deletion adapter.",
      );
      input.recordings?.assertPool(input.pool);
      input.lineage?.assertPool(input.pool);
      const recordingSchema = await input.pool.query(
        "SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('creator.message') AND attname='recording_asset_id' AND NOT attisdropped",
      );
      invariant(
        recordingSchema.rowCount === 0 || input.recordings,
        "conversation_recordings_unavailable",
        "This data request needs the prepared recording association adapter.",
      );
      const families = await input.authority.families(job);
      signal.throwIfAborted();
      invariant(
        families.length <= 100 &&
          new Set(families.map((family) => family.threadId)).size ===
            families.length,
        "bounded_subjob_required",
        "This data request needs a bounded conversation subjob.",
      );
      invariant(
        job.kind !== "delete" ||
          (input.retention &&
            (input.retention.settleGeneration ||
              input.generationCostPrivacyReconciliation)),
        "conversation_retention_unavailable",
        "Conversation deletion needs the verified dispute-retention and allowance adapters.",
      );
      if (job.kind === "export") {
        invariant(
          input.exportCursor instanceof PreparedConversationPrivacyCursor,
          "conversation_export_unconfigured",
          "This complete export needs its actual prepared source cursor.",
        );
        input.exportCursor.assertRuntime(input);
        return {
          receipt: {
            schemaVersion: 2,
            domain: "conversation",
            jobId: job.jobId,
            idempotencyKey: job.idempotencyKey,
            sourceScopeThreads: families.length,
          },
          stream: conversationPrivacyExportStream(input, job, families, signal),
        };
      }
      assertConversationPrivacyPool(input.pool);
      const client = await input.pool.connect();
      let discardClient = false;
      let backendPid: number | undefined;
      let cancelling: Promise<void> | undefined;
      let destroying: Promise<void> | undefined;
      let phase: "pid" | "begin" | "work" | "commit" = "pid";
      let committed = false;
      const cancellationFailures: unknown[] = [];
      const transportFailures: unknown[] = [];
      let failed = false;
      let failure: unknown;
      let result: Awaited<ReturnType<PrivacyHook["run"]>> | undefined;
      const cleanupFailures: unknown[] = [];
      const transportError = (error: Error) => {
        transportFailures.push(error);
        discardClient = true;
      };
      client.on("error", transportError);
      const destroy = () => {
        discardClient = true;
        return (destroying ??= client.end().catch((error: unknown) => {
          cleanupFailures.push(error);
        }));
      };
      const abort = () => {
        if (cancelling) return;
        if (backendPid === undefined) {
          // Before an observed PID, close only this exact held source. Never
          // guess a backend or leave a delayed PID/BEGIN query uncancelled.
          cancelling = destroy();
          return;
        }
        // This PID belongs to the still-held deletion client. Cancellation
        // never releases its task locks or permits another pool borrower.
        cancelling = cancelConversationPrivacyBackend(input.pool, backendPid)
          .catch((error: unknown) => {
            cancellationFailures.push(error);
            discardClient = true;
          })
          // A healthy cancel does not prove that a stalled transport delivered
          // the original query's response. End the exact held source too.
          .finally(destroy);
      };
      signal.addEventListener("abort", abort, { once: true });
      const accountingReceipts: Record<string, unknown>[] = [];
      const financialDispositions: {
        threadId: string;
        financialDispositionReference: string;
      }[] = [];
      const retained: {
        category: string;
        until: string | null;
        reason: string;
      }[] = [];
      try {
        signal.throwIfAborted();
        backendPid = z
          .int()
          .positive()
          .max(2147483647)
          .parse(
            (
              await client.query<{ pid: number }>(
                "SELECT pg_backend_pid() AS pid",
              )
            ).rows[0]?.pid,
          );
        phase = "begin";
        signal.throwIfAborted();
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        phase = "work";
        await client.query(
          "SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'",
        );
        signal.throwIfAborted();
        await fenceConversationPrivacyTask(input.authority, client, job);
        const accountingInstalled = await generationJournalInstalled(client);
        const weightedInstalled = (
          await client.query<{ installed: boolean }>(
            "SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('creator.commerce_allowance_reservation') AND attname='cost_policy_version' AND NOT attisdropped) AS installed",
          )
        ).rows[0]?.installed;
        invariant(
          !accountingInstalled || input.accounting,
          "conversation_accounting_unavailable",
          "This data request needs the prepared generation-accounting lifecycle adapter.",
        );
        invariant(
          job.kind !== "delete" ||
            !(weightedInstalled || input.generationCostPrivacyReconciliation) ||
            (accountingInstalled &&
              input.accounting &&
              input.generationCostPrivacyReconciliation),
          "conversation_financial_custody_unavailable",
          "Weighted deletion requires the actual prepared generation journal and original-policy financial lifecycle.",
        );
        for (const family of families) {
          signal.throwIfAborted();
          invariant(
            (job.creatorId === null || job.creatorId === family.creatorId) &&
              (job.threadId === null || job.threadId === family.threadId),
            "privacy_scope_mismatch",
            "This conversation is outside the verified data request.",
          );
          await input.authority.assertFamily(client, job, family);
          signal.throwIfAborted();
          await client.query(
            "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
            [family.creatorId, family.fanId, job.accountId],
          );
          const pair = [family.threadId, family.creatorId, family.fanId];
          signal.throwIfAborted();
          const thread = (
            await client.query(
              "SELECT t.id,t.creator_id,t.fan_id,t.control,t.control_epoch,t.revision,t.deleted_at,t.off_the_record,t.intro_shared,t.memory_revision,t.human_active_until,t.last_activity_at,t.session_started_at,t.last_reminder_at,cp.display_name FROM creator.thread t JOIN creator.creator_profile cp ON cp.id=t.creator_id WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 FOR UPDATE OF t",
              pair,
            )
          ).rows[0];
          invariant(
            thread,
            "privacy_family_unavailable",
            "The verified conversation scope is unavailable.",
          );
          const keep = await input.retention!.retainedMessages(
            client,
            job,
            family,
          );
          invariant(
            keep.length <= 2000 &&
              new Set(keep.map((record) => record.messageId)).size ===
                keep.length &&
              keep.every(
                (record) =>
                  Number.isFinite(Date.parse(record.until)) &&
                  Date.parse(record.until) > Date.now() &&
                  record.reason.length > 0,
              ),
            "retention_scope_invalid",
            "Conversation retention requires exact unexpired dispute records.",
          );
          const retainedRows = await client.query(
            "SELECT id FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND id=ANY($4::uuid[])",
            [...pair, keep.map((record) => record.messageId)],
          );
          invariant(
            retainedRows.rowCount === keep.length,
            "retention_scope_invalid",
            "Retained records must belong to this exact conversation.",
          );
          await input.lineage?.prepareDeletion(
            client,
            family,
            keep.map((record) => record.messageId),
          );
          // The authority must split large families into content subjobs before
          // authorizing their purge. A single transaction must remain bounded.
          for (const table of [
            "message",
            "generation",
            "memory",
            "memory_consent",
            "memory_exclusion",
            "processor_consent",
            "event",
            "thread_audit",
            "conversation_presence_client",
            "conversation_usage_day",
          ] as const) {
            const count = await client.query<{ count: string }>(
              `SELECT count(*)::text AS count FROM (SELECT 1 FROM creator.${table} WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 LIMIT 2001) bounded`,
              pair,
            );
            invariant(
              Number(count.rows[0]!.count) <= 2000,
              "bounded_subjob_required",
              "This deletion needs a bounded conversation content subjob.",
            );
          }
          const generations = (
            await client.query<{
              id: string;
              reservationId: string | null;
              grantId: string;
              visible: boolean;
            }>(
              `SELECT id,reservation_id AS "reservationId",grant_id AS "grantId",last_sequence>0 AS visible FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND ($4::boolean OR state IN('queued','generating')) FOR UPDATE`,
              [
                ...pair,
                accountingInstalled ||
                  Boolean(input.generationCostPrivacyReconciliation),
              ],
            )
          ).rows;
          for (const generation of generations) {
            signal.throwIfAborted();
            await input.authority.assertFamily(client, job, family);
            await input.accounting?.sealGeneration(
              client,
              job,
              family,
              generation.id,
            );
            if (input.generationCostPrivacyReconciliation)
              await input.generationCostPrivacyReconciliation.settleGeneration(
                client,
                financialJob(job),
                family,
                generation,
              );
            else
              await input.retention!.settleGeneration!(
                client,
                job,
                family,
                generation,
              );
          }
          if (input.generationCostPrivacyReconciliation) {
            const disposition =
              await input.generationCostPrivacyReconciliation.disposition(
                client,
                financialJob(job),
                family,
              );
            invariant(
              /^[a-f0-9]{64}$/u.test(disposition.financialDispositionReference),
              "financial_disposition_unavailable",
              "Keep accounting custody until its actual original-policy disposition is complete.",
            );
            financialDispositions.push({
              threadId: family.threadId,
              financialDispositionReference:
                disposition.financialDispositionReference,
            });
            await input.authority.assertFamily(client, job, family);
          }
          if (input.accounting) {
            const accounting = await input.accounting.purgeFamilyPaged(
              client,
              job,
              family,
              signal,
            );
            accountingReceipts.push(accounting.receipt);
            retained.push(...accounting.retained);
          }
          // Tombstoned thread remains as the minimal family identifier. Denial is
          // already immediate through W8; content and replay payloads are purged.
          signal.throwIfAborted();
          await client.query(
            "UPDATE creator.thread SET deleted_at=coalesce(deleted_at,now()),control='closed',control_epoch=control_epoch+1,revision=revision+1,processor_consent_version=NULL,intro_shared=false WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL",
            pair,
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.memory WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.memory_consent WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.memory_exclusion WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.processor_consent WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.event WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.thread_audit WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND NOT(id=ANY($4::uuid[]))",
            [...pair, keep.map((record) => record.messageId)],
          );
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.conversation_relationship WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          for (const table of [
            "conversation_presence_client",
            "conversation_presence",
            "conversation_usage_day",
          ] as const) {
            signal.throwIfAborted();
            await client.query(
              `DELETE FROM creator.${table} WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3`,
              pair,
            );
          }
          signal.throwIfAborted();
          await client.query(
            "DELETE FROM creator.idempotency_key WHERE operation IN('send','fan_reply','human_reply','humanReply','team_reply','conversation_correction','takeover','handback','pause','control:human_active','control:ai_active','control:ai_paused') AND coalesce(response->'message'->>'threadId',response->>'threadId')=$1",
            [family.threadId],
          );
          for (const record of keep)
            retained.push({
              category: "packet_and_delivery_dispute_evidence",
              until: record.until,
              reason: record.reason,
            });
          await input.authority.assertFamily(client, job, family);
        }
        invariant(
          Buffer.byteLength(
            JSON.stringify({
              accountingReceipts,
              financialDispositions,
              retained,
            }),
            "utf8",
          ) <= 8_000_000,
          "bounded_subjob_required",
          "This receipt needs a smaller conversation subjob.",
        );
        signal.throwIfAborted();
        for (const family of families) {
          signal.throwIfAborted();
          await input.authority.assertFamily(client, job, family);
        }
        // This client's actual task remains current even for an empty family set.
        await fenceConversationPrivacyTask(input.authority, client, job);
        signal.throwIfAborted();
        signal.removeEventListener("abort", abort);
        await cancelling;
        if (cancellationFailures.length || transportFailures.length)
          throw new DomainError(
            "conversation_delete_cancel_unavailable",
            "The original deletion connection could not settle safely.",
            503,
          );
        signal.throwIfAborted();
        // All original family/financial/retention fences are already complete.
        // A later abort cannot cancel COMMIT or erase its actual receipt.
        phase = "commit";
        const receipt = await client.query("COMMIT");
        invariant(
          receipt.command === "COMMIT",
          "conversation_delete_commit_unavailable",
          "The original deletion did not return a commit receipt.",
        );
        committed = true;
        result = {
          receipt: {
            schemaVersion: 1,
            domain: "conversation",
            jobId: job.jobId,
            idempotencyKey: job.idempotencyKey,
            processedThreads: families.length,
            ...(accountingReceipts.length ? { accountingReceipts } : {}),
            ...(financialDispositions.length ? { financialDispositions } : {}),
            completedAt: new Date().toISOString(),
          },
          retained,
        };
      } catch (error) {
        failed = true;
        failure = error;
        signal.removeEventListener("abort", abort);
        // A delayed control query must finish and close before ROLLBACK.
        // Even an aborted or disconnected task retains this client until its
        // actual transaction has rolled back or its connection has ended.
        await cancelling;
        if (phase !== "work" || conversationPrivacyReadUncertain(error)) {
          discardClient = true;
          transportFailures.push(error);
        }
        if (
          discardClient ||
          cancellationFailures.length ||
          transportFailures.length
        ) {
          // An uncertain cancel has not proved that the server consumed it.
          // End this original session without queuing more cleanup SQL.
          discardClient = true;
        } else if (!committed) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackFailure) {
            discardClient = true;
            cleanupFailures.push(rollbackFailure);
          }
        }
      } finally {
        signal.removeEventListener("abort", abort);
        await cancelling;
        discardClient ||=
          cancellationFailures.length > 0 || transportFailures.length > 0;
        try {
          if (discardClient) await destroy();
        } catch (error) {
          cleanupFailures.push(error);
        } finally {
          try {
            client.release(discardClient);
          } catch (error) {
            cleanupFailures.push(error);
          } finally {
            client.removeListener("error", transportError);
          }
        }
      }
      if (
        cancellationFailures.length ||
        transportFailures.length ||
        cleanupFailures.length
      ) {
        const error = new DomainError(
          cancellationFailures.length
            ? "conversation_delete_cancel_unavailable"
            : committed
              ? "conversation_delete_release_unavailable"
              : "conversation_delete_rollback_unavailable",
          committed
            ? "Deletion committed but connection cleanup failed. Reconcile its actual receipt."
            : "Deletion could not settle safely; this task cannot complete.",
          503,
        );
        conversationPrivacyCause(
          error,
          new AggregateError(
            [
              ...new Set(
                [
                  ...(failed ? [failure] : []),
                  ...transportFailures,
                  ...cancellationFailures,
                  ...cleanupFailures,
                ].filter((cause) => cause !== undefined),
              ),
            ],
            "Original deletion and settlement failures.",
          ),
        );
        throw error;
      }
      if (failed) throw failure;
      invariant(
        result,
        "conversation_delete_incomplete",
        "Only the original completed deletion transaction can return a receipt.",
      );
      return result;
    },
  };
}
