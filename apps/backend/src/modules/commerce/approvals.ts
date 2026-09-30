import type { PoolClient } from "pg";
import { z } from "zod";
import type { SignedActCommand } from "@qelvora/api";
import {
  CreateReplyDraft,
  EditReplyDraft,
  ApproveReplyDraft,
  replyDraftApprovalCommand,
  type ReplyDraft,
} from "../../../../../packages/api/src/commerce/approval.js";
import { Database } from "../../db/database.js";
import { invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { contentHash } from "../../core/canonical.js";
import type { ThreadScope } from "../access/scope.js";
import { consumeSignedAct } from "../identity/signed-acts.js";
import type { SignedSubjectPolicy } from "../identity/subjects.js";

type DraftRow = {
  id: string;
  thread_id: string;
  source_message_id: string;
  source_message_version: number;
  text: string;
  version: number;
};
function draft(row: DraftRow): ReplyDraft {
  return {
    id: row.id,
    threadId: row.thread_id,
    sourceMessageId: row.source_message_id,
    sourceMessageVersion: row.source_message_version,
    text: row.text,
    version: row.version,
    approval: null,
  };
}

/** W4 owns Approval; W3 calls the two delivery methods in its publication tx.
 * Enable only after W8 registers/applies schema-approval.sql. No AI is generated
 * here: a draft starts from a genuine durable AI message on the exact thread.
 */
export class CommerceApprovals {
  constructor(private readonly db: Database) {}

  async sources(scope: ThreadScope, raw: unknown) {
    const input = z
      .strictObject({
        beforeSequence: z.coerce.number().int().positive().optional(),
      })
      .parse(raw);
    return this.db.withThread(scope, async (client) => {
      await this.lockThread(client, scope);
      const rows = (
        await client.query<{
          id: string;
          version: number;
          text: string;
          sequence: number;
        }>(
          `SELECT id,version,text,sequence FROM creator.message
         WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND author_kind='ai'
         AND delivery_state IN('delivered','interrupted') AND length(btrim(text)) BETWEEN 1 AND 8000
         AND ($4::integer IS NULL OR sequence<$4) ORDER BY sequence DESC LIMIT 21`,
          [
            scope.threadId,
            scope.creatorId,
            scope.fanId,
            input.beforeSequence ?? null,
          ],
        )
      ).rows;
      return {
        items: rows.slice(0, 20),
        nextSequence: rows.length > 20 ? rows[19]!.sequence : null,
      };
    });
  }

  private async lockThread(client: PoolClient, scope: ThreadScope) {
    invariant(
      scope.authority === "creator" || scope.authority === "triage",
      "draft_authority_required",
      "Only the creator or an authorized drafter can review this draft.",
    );
    const found = await client.query(
      `SELECT 1 FROM creator.thread t JOIN creator.creator_profile cp ON cp.id=t.creator_id
       WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 AND t.deleted_at IS NULL
       AND cp.verification='verified' AND NOT cp.recovery_required
       AND (cp.account_id=$4 OR EXISTS(SELECT 1 FROM creator.team_membership tm
         WHERE tm.creator_id=t.creator_id AND tm.account_id=$4 AND tm.revoked_at IS NULL AND 'drafter'=ANY(tm.roles)))
       FOR UPDATE OF t`,
      [scope.threadId, scope.creatorId, scope.fanId, scope.actorAccountId],
    );
    invariant(
      found.rowCount === 1,
      "draft_unavailable",
      "This draft is unavailable.",
    );
  }
  private async current(client: PoolClient, scope: ThreadScope, id: string) {
    const row = (
      await client.query<DraftRow>(
        "SELECT * FROM creator.commerce_reply_draft WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR UPDATE",
        [id, scope.threadId, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    invariant(row, "draft_unavailable", "This draft is unavailable.");
    return row;
  }
  async read(scope: ThreadScope, id: string): Promise<ReplyDraft> {
    return this.db.withThread(scope, async (client) => {
      await this.lockThread(client, scope);
      const row = await this.current(client, scope, id);
      const approval = (
        await client.query<{
          id: string;
          approved_at: Date;
          invalidated_at: Date | null;
          delivered_message_id: string | null;
        }>(
          `SELECT a.id,a.approved_at,coalesce(a.invalidated_at,CASE WHEN a.creator_epoch<>cp.commerce_approval_epoch OR a.key_epoch<>pc.commerce_approval_epoch THEN greatest(cp.commerce_approval_changed_at,pc.commerce_approval_changed_at) END) AS invalidated_at,a.delivered_message_id
           FROM creator.commerce_approval a JOIN creator.creator_profile cp ON cp.id=a.creator_id
           JOIN creator.signed_act sa ON sa.id=a.signed_act_id JOIN creator.passkey_credential pc ON pc.id=sa.credential_id
           WHERE a.draft_id=$1 AND a.draft_version=$2 AND a.creator_id=$3 AND a.fan_id=$4 ORDER BY a.approved_at DESC,a.id DESC LIMIT 1`,
          [id, row.version, scope.creatorId, scope.fanId],
        )
      ).rows[0];
      return {
        ...draft(row),
        approval: approval
          ? {
              id: approval.id,
              approvedAt: approval.approved_at.toISOString(),
              invalidatedAt: approval.invalidated_at?.toISOString() ?? null,
              deliveredMessageId: approval.delivered_message_id,
            }
          : null,
      };
    });
  }
  async create(scope: ThreadScope, raw: unknown) {
    const input = CreateReplyDraft.parse(raw);
    return this.db.withThread(scope, (client) =>
      idempotent(
        client,
        scope,
        "commerce.draft.create",
        input.idempotencyKey,
        input,
        async () => {
          await this.lockThread(client, scope);
          const source = (
            await client.query<{ text: string }>(
              "SELECT text FROM creator.message WHERE id=$1 AND version=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5 AND author_kind='ai' AND delivery_state IN ('delivered','interrupted') AND length(btrim(text)) BETWEEN 1 AND 8000 FOR SHARE",
              [
                input.sourceMessageId,
                input.sourceMessageVersion,
                scope.threadId,
                scope.creatorId,
                scope.fanId,
              ],
            )
          ).rows[0];
          invariant(
            source,
            "ai_draft_source_required",
            "Choose an existing AI answer from this conversation.",
          );
          const row = (
            await client.query<DraftRow>(
              "INSERT INTO creator.commerce_reply_draft(thread_id,creator_id,fan_id,source_message_id,source_message_version,text) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
              [
                scope.threadId,
                scope.creatorId,
                scope.fanId,
                input.sourceMessageId,
                input.sourceMessageVersion,
                source.text,
              ],
            )
          ).rows[0]!;
          return draft(row);
        },
      ),
    );
  }
  async edit(scope: ThreadScope, id: string, raw: unknown) {
    const input = EditReplyDraft.parse(raw);
    return this.db.withThread(scope, (client) =>
      idempotent(
        client,
        scope,
        "commerce.draft.edit",
        input.idempotencyKey,
        { id, ...input },
        async () => {
          await this.lockThread(client, scope);
          const row = await this.current(client, scope, id);
          invariant(
            row.version === input.version,
            "draft_changed",
            "This draft changed. Refresh before saving; your text is kept.",
          );
          // The database trigger invalidates every unsent Approval on any edit,
          // including changing text back to a previously signed value.
          const edited = (
            await client.query<DraftRow>(
              "UPDATE creator.commerce_reply_draft SET text=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING *",
              [id, input.text],
            )
          ).rows[0]!;
          return draft(edited);
        },
      ),
    );
  }
  async approve(scope: ThreadScope, id: string, raw: unknown) {
    const input = ApproveReplyDraft.parse(raw);
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can personally approve this draft.",
    );
    return this.db.withThread(scope, (client) =>
      idempotent(
        client,
        scope,
        "commerce.draft.approve",
        input.idempotencyKey,
        { id, ...input },
        async () => {
          await this.lockThread(client, scope);
          const row = await this.current(client, scope, id);
          invariant(
            row.version === input.version,
            "draft_changed",
            "This draft changed. Review its current version before signing.",
          );
          const command = replyDraftApprovalCommand(draft(row));
          const hash = await consumeSignedAct(
            client,
            scope,
            input.signedActId,
            command,
          );
          const approval = (
            await client.query<{ id: string }>(
              `INSERT INTO creator.commerce_approval(draft_id,draft_version,thread_id,creator_id,fan_id,approver_account_id,signed_act_id,content_hash,text,command,creator_epoch,key_epoch)
             SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,cp.commerce_approval_epoch,pc.commerce_approval_epoch
             FROM creator.signed_act sa JOIN creator.creator_profile cp ON cp.id=sa.creator_id JOIN creator.passkey_credential pc ON pc.id=sa.credential_id WHERE sa.id=$7 RETURNING id`,
              [
                id,
                row.version,
                scope.threadId,
                scope.creatorId,
                scope.fanId,
                scope.actorAccountId,
                input.signedActId,
                hash,
                row.text,
                JSON.stringify(command),
              ],
            )
          ).rows[0]!;
          await client.query(
            "INSERT INTO creator.commerce_event(creator_id,fan_id,aggregate_id,aggregate_version,type,payload) VALUES($1,$2,$3,$4,'approval_recorded',$5) ON CONFLICT DO NOTHING",
            [
              scope.creatorId,
              scope.fanId,
              approval.id,
              1,
              JSON.stringify({ draftId: id, draftVersion: row.version }),
            ],
          );
          return { approvalId: approval.id, draftId: id, version: row.version };
        },
      ),
    );
  }
  async prepareDelivery(
    client: PoolClient,
    scope: ThreadScope,
    approvalId: string,
  ) {
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can publish an approved draft.",
    );
    const pointer = (
      await client.query<{ draft_id: string }>(
        "SELECT draft_id FROM creator.commerce_approval WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
        [approvalId, scope.threadId, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    invariant(pointer, "approval_unavailable", "This approval is unavailable.");
    const current = await this.current(client, scope, pointer.draft_id);
    const row = (
      await client.query<{
        text: string;
        signed_act_id: string;
        content_hash: string;
        command: SignedActCommand;
      }>(
        `SELECT a.text,a.signed_act_id,a.content_hash,a.command FROM creator.commerce_approval a
         JOIN creator.creator_profile cp ON cp.id=a.creator_id AND cp.account_id=a.approver_account_id
         JOIN creator.signed_act sa ON sa.id=a.signed_act_id AND sa.account_id=a.approver_account_id AND sa.creator_id=a.creator_id
         JOIN creator.passkey_credential pc ON pc.id=sa.credential_id AND pc.account_id=sa.account_id
         JOIN creator.signed_act_consumption used ON used.signed_act_id=sa.id AND used.account_id=sa.account_id
         WHERE a.id=$1 AND a.draft_version=$2 AND a.thread_id=$3 AND a.creator_id=$4 AND a.fan_id=$5
         AND a.approver_account_id=$6 AND a.invalidated_at IS NULL AND a.delivered_message_id IS NULL
         AND cp.verification='verified' AND NOT cp.recovery_required AND pc.revoked_at IS NULL
         AND a.creator_epoch=cp.commerce_approval_epoch AND a.key_epoch=pc.commerce_approval_epoch
         AND sa.act_type='approved_draft' AND sa.subject_id=a.thread_id AND sa.content_hash=a.content_hash
         FOR UPDATE OF a FOR SHARE OF cp,pc`,
        [
          approvalId,
          current.version,
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          scope.actorAccountId,
        ],
      )
    ).rows[0];
    invariant(
      row &&
        row.content_hash ===
          contentHash(replyDraftApprovalCommand(draft(current))) &&
        contentHash(row.command) === row.content_hash,
      "approval_invalidated",
      "This approval changed or creator authority was revoked. Review and sign again.",
    );
    return {
      text: row.text,
      signing: { id: row.signed_act_id, hash: row.content_hash },
      approvalId,
    };
  }
  async recordDelivery(
    client: PoolClient,
    scope: ThreadScope,
    approvalId: string,
    messageId: string,
  ) {
    const result = await client.query(
      "UPDATE creator.commerce_approval SET delivered_message_id=$2 WHERE id=$1 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5 AND invalidated_at IS NULL AND delivered_message_id IS NULL RETURNING id",
      [approvalId, messageId, scope.threadId, scope.creatorId, scope.fanId],
    );
    invariant(
      result.rowCount === 1,
      "approval_invalidated",
      "This approval is unavailable.",
    );
  }
}

export const commerceApprovalSignedSubjects: SignedSubjectPolicy = {
  name: "commerce_approval",
  async prepare(client, actor, creatorId, requested) {
    if (requested.actType !== "approved_draft") return null;
    invariant(
      requested.content &&
        typeof requested.content === "object" &&
        !Array.isArray(requested.content),
      "draft_required",
      "Choose the exact saved draft before signing.",
    );
    const approval = requested.content.approval;
    invariant(
      approval &&
        typeof approval === "object" &&
        !Array.isArray(approval) &&
        typeof approval.draftId === "string",
      "draft_required",
      "Choose the exact saved draft before signing.",
    );
    const thread = await client.query(
      `SELECT t.id FROM creator.thread t JOIN creator.creator_profile cp ON cp.id=t.creator_id
       WHERE t.id=$1 AND t.creator_id=$2 AND cp.account_id=$3 AND cp.verification='verified'
       AND NOT cp.recovery_required AND t.deleted_at IS NULL FOR SHARE OF t`,
      [requested.subjectId, creatorId, actor.accountId],
    );
    invariant(
      thread.rowCount === 1,
      "draft_unavailable",
      "This draft is unavailable.",
    );
    const row = (
      await client.query<DraftRow>(
        `SELECT d.* FROM creator.commerce_reply_draft d JOIN creator.creator_profile cp ON cp.id=d.creator_id
         JOIN creator.thread t ON t.id=d.thread_id AND t.creator_id=d.creator_id AND t.fan_id=d.fan_id
         WHERE d.id=$1 AND d.thread_id=$2 AND d.creator_id=$3 AND cp.account_id=$4
         AND cp.verification='verified' AND NOT cp.recovery_required AND t.deleted_at IS NULL FOR SHARE OF d`,
        [approval.draftId, requested.subjectId, creatorId, actor.accountId],
      )
    ).rows[0];
    invariant(row, "draft_unavailable", "This draft is unavailable.");
    return replyDraftApprovalCommand(draft(row));
  },
};
