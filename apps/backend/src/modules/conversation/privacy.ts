import type { Pool, PoolClient } from "pg";
import type { PrivacyHook } from "../trust/contracts.js";
import { invariant } from "../../core/errors.js";
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
function authorLabel(kind: AuthorKind, name: string, member: string | null) {
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
  assertFamily(
    client: PoolClient,
    job: Job,
    family: ConversationPrivacyFamily,
  ): Promise<void>;
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
  "exportMetadata" | "sealGeneration" | "purgeFamily"
>;

export function conversationPrivacyHook(input: {
  pool: Pool;
  authority: ConversationPrivacyAuthority;
  retention?: ConversationPrivacyRetention;
  lineage?: ConversationLineage;
  recordings?: ConversationRecordings;
  accounting?: ConversationAccountingLifecycle;
  /** Exact prepared W4 port; original-policy evidence precedes journal purge.
   * Finite reviewed retention and expiry remain W8's separate responsibility. */
  generationCostPrivacyReconciliation?: GenerationCostPrivacyReconciliation;
}): PrivacyHook {
  return {
    domain: "conversation",
    async run(job) {
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
      const recordingSchema = await input.pool.query(
        "SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('creator.message') AND attname='recording_asset_id' AND NOT attisdropped",
      );
      invariant(
        recordingSchema.rowCount === 0 || input.recordings,
        "conversation_recordings_unavailable",
        "This data request needs the prepared recording association adapter.",
      );
      const families = await input.authority.families(job);
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
      const client = await input.pool.connect();
      const data: unknown[] = [];
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
        await client.query("BEGIN");
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
          invariant(
            (job.creatorId === null || job.creatorId === family.creatorId) &&
              (job.threadId === null || job.threadId === family.threadId),
            "privacy_scope_mismatch",
            "This conversation is outside the verified data request.",
          );
          await input.authority.assertFamily(client, job, family);
          await client.query(
            "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true),set_config('app.account_id',$3,true)",
            [family.creatorId, family.fanId, job.accountId],
          );
          const pair = [family.threadId, family.creatorId, family.fanId];
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
          if (job.kind === "export") {
            const messages = (
              await client.query(
                `SELECT id,author_kind AS "authorKind",text,delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,version,signed_act_id AS "signedActId",signed_content_hash AS "signedContentHash",author_account_id AS "authorAccountId",citations,team_member AS member,off_the_record AS "offTheRecord",created_at AS "createdAt" FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY sequence LIMIT 2001`,
                pair,
              )
            ).rows;
            const memories = (
              await client.query(
                "SELECT id,kind,text,state,semantic_key,provenance_message_id,sensitive_category,edited_by_fan,created_at FROM creator.memory WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY created_at,id LIMIT 2001",
                pair,
              )
            ).rows;
            const audit = (
              await client.query(
                "SELECT reader_account_id,role,read_at FROM creator.thread_audit WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY read_at,id LIMIT 2001",
                pair,
              )
            ).rows;
            const consents = (
              await client.query(
                "SELECT version,providers,consented_at,withdrawn_at FROM creator.processor_consent WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY consented_at,id LIMIT 2001",
                pair,
              )
            ).rows;
            const memoryConsents = (
              await client.query(
                "SELECT id,item_id,item_hash,category,consented_at,withdrawn_at FROM creator.memory_consent WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY consented_at,id LIMIT 2001",
                pair,
              )
            ).rows;
            const usageDays = (
              await client.query(
                "SELECT day,seconds,companion_seconds FROM creator.conversation_usage_day WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY day LIMIT 2001",
                pair,
              )
            ).rows;
            const events = (
              await client.query(
                "SELECT id,cursor,type,payload,actor_account_id,created_at,published_at FROM creator.event WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY cursor LIMIT 2001",
                pair,
              )
            ).rows;
            const exclusions = (
              await client.query(
                "SELECT semantic_key,normalized_text FROM creator.memory_exclusion WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY semantic_key LIMIT 2001",
                pair,
              )
            ).rows;
            const generations = (
              await client.query(
                "SELECT id,fan_message_id,ai_message_id,grant_id,reservation_id,epoch,last_sequence,state,context_revision,accepted_at,first_visible_at,completed_at,failure_code FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY accepted_at,id LIMIT 2001",
                pair,
              )
            ).rows;
            invariant(
              [
                messages,
                memories,
                audit,
                consents,
                memoryConsents,
                usageDays,
                events,
                exclusions,
                generations,
              ].every((rows) => rows.length <= 2000),
              "bounded_subjob_required",
              "This export needs a paginated conversation subjob.",
            );
            data.push({
              thread,
              ...(input.accounting
                ? {
                    accounting: await input.accounting.exportMetadata(
                      client,
                      job,
                      family,
                    ),
                  }
                : {}),
              ...(input.lineage
                ? {
                    lineage: await input.lineage.exportMetadata(client, family),
                  }
                : {}),
              ...(input.recordings
                ? {
                    recordings: await input.recordings.exportMetadata(
                      client,
                      family,
                    ),
                  }
                : {}),
              messages: messages.map((message) => ({
                ...message,
                authorLabel: authorLabel(
                  message.authorKind,
                  thread.display_name,
                  message.member,
                ),
              })),
              memories,
              audit,
              consents,
              memoryConsents,
              usageDays,
              events,
              exclusions,
              generations,
            });
            invariant(
              Buffer.byteLength(JSON.stringify(data), "utf8") <= 8_000_000,
              "bounded_subjob_required",
              "This export needs a smaller conversation subjob.",
            );
            await input.authority.assertFamily(client, job, family);
            continue;
          }
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
            const accounting = await input.accounting.purgeFamily(
              client,
              job,
              family,
            );
            accountingReceipts.push(accounting.receipt);
            retained.push(...accounting.retained);
          }
          // Tombstoned thread remains as the minimal family identifier. Denial is
          // already immediate through W8; content and replay payloads are purged.
          await client.query(
            "UPDATE creator.thread SET deleted_at=coalesce(deleted_at,now()),control='closed',control_epoch=control_epoch+1,revision=revision+1,processor_consent_version=NULL,intro_shared=false WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL",
            pair,
          );
          await client.query(
            "DELETE FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          await client.query(
            "DELETE FROM creator.memory WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          await client.query(
            "DELETE FROM creator.memory_consent WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          await client.query(
            "DELETE FROM creator.memory_exclusion WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          await client.query(
            "DELETE FROM creator.processor_consent WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          await client.query(
            "DELETE FROM creator.event WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          await client.query(
            "DELETE FROM creator.thread_audit WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          await client.query(
            "DELETE FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND NOT(id=ANY($4::uuid[]))",
            [...pair, keep.map((record) => record.messageId)],
          );
          await client.query(
            "DELETE FROM creator.conversation_relationship WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
            pair,
          );
          for (const table of [
            "conversation_presence_client",
            "conversation_presence",
            "conversation_usage_day",
          ] as const)
            await client.query(
              `DELETE FROM creator.${table} WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3`,
              pair,
            );
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
        await client.query("COMMIT");
        return {
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
          ...(job.kind === "export" ? { data } : {}),
          retained,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
