import type { Pool, PoolClient } from "pg";
import type { PrivacyHook } from "../trust/contracts.js";
import { invariant } from "../../core/errors.js";
import { copy } from "@qelvora/copy";
import type { AuthorKind } from "@qelvora/api";

type Job = Parameters<PrivacyHook["run"]>[0];
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
  settleGeneration(
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

export function conversationPrivacyHook(input: {
  pool: Pool;
  authority: ConversationPrivacyAuthority;
  retention?: ConversationPrivacyRetention;
}): PrivacyHook {
  return {
    domain: "conversation",
    async run(job) {
      const families = await input.authority.families(job);
      invariant(
        families.length <= 100 &&
          new Set(families.map((family) => family.threadId)).size ===
            families.length,
        "bounded_subjob_required",
        "This data request needs a bounded conversation subjob.",
      );
      invariant(
        job.kind !== "delete" || input.retention,
        "conversation_retention_unavailable",
        "Conversation deletion needs the verified dispute-retention and allowance adapters.",
      );
      const client = await input.pool.connect();
      const data: unknown[] = [];
      const retained: {
        category: string;
        until: string | null;
        reason: string;
      }[] = [];
      try {
        await client.query("BEGIN");
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
              "SELECT t.id,t.creator_id,t.fan_id,t.control,t.control_epoch,t.revision,t.deleted_at,cp.display_name FROM creator.thread t JOIN creator.creator_profile cp ON cp.id=t.creator_id WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 FOR UPDATE OF t",
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
                `SELECT id,author_kind AS "authorKind",text,delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,version,signed_act_id AS "signedActId",signed_content_hash AS "signedContentHash",citations,team_member AS member,off_the_record AS "offTheRecord",created_at AS "createdAt" FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY sequence LIMIT 2001`,
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
            invariant(
              [
                messages,
                memories,
                audit,
                consents,
                memoryConsents,
                usageDays,
              ].every((rows) => rows.length <= 2000),
              "bounded_subjob_required",
              "This export needs a paginated conversation subjob.",
            );
            data.push({
              thread,
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
            });
            invariant(
              Buffer.byteLength(JSON.stringify(data), "utf8") <= 8_000_000,
              "bounded_subjob_required",
              "This export needs a smaller conversation subjob.",
            );
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
              `SELECT id,reservation_id AS "reservationId",grant_id AS "grantId",last_sequence>0 AS visible FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('queued','generating') FOR UPDATE`,
              pair,
            )
          ).rows;
          for (const generation of generations)
            await input.retention!.settleGeneration(
              client,
              job,
              family,
              generation,
            );
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
            "DELETE FROM creator.idempotency_key WHERE operation IN('send','fan_reply','human_reply','takeover','handback','pause') AND coalesce(response->'message'->>'threadId',response->>'threadId')=$1",
            [family.threadId],
          );
          for (const record of keep)
            retained.push({
              category: "packet_and_delivery_dispute_evidence",
              until: record.until,
              reason: record.reason,
            });
        }
        await client.query("COMMIT");
        return {
          receipt: {
            schemaVersion: 1,
            domain: "conversation",
            jobId: job.jobId,
            idempotencyKey: job.idempotencyKey,
            processedThreads: families.length,
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
