import type { Database } from "../../db/database.js";
import type { ThreadScope } from "../access/scope.js";
import { invariant } from "../../core/errors.js";

export class MemoryService {
  constructor(private readonly db: Database) {}
  async context(scope: ThreadScope): Promise<{
    revision: number;
    messages: readonly string[];
    memory: readonly string[];
  }> {
    return this.db.withThread(scope, async (client) => {
      // One consistent transaction snapshot: locking the thread also serializes deletes.
      const thread = await client.query<{ revision: number }>(
        "SELECT revision FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL FOR UPDATE",
        [scope.threadId, scope.creatorId, scope.fanId],
      );
      invariant(
        thread.rows[0],
        "thread_unavailable",
        "This conversation is unavailable.",
      );
      const messages = await client.query<{
        author_kind: string;
        text: string;
      }>(
        "SELECT author_kind,text FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY sequence DESC LIMIT 30",
        [scope.threadId, scope.creatorId, scope.fanId],
      );
      const memory = await client.query<{ text: string }>(
        `SELECT m.text FROM creator.memory m WHERE m.thread_id=$1 AND m.creator_id=$2 AND m.fan_id=$3 AND m.sensitive_category IS NULL
        AND NOT EXISTS(SELECT 1 FROM creator.memory_exclusion e WHERE e.thread_id=$1 AND e.creator_id=$2 AND e.fan_id=$3 AND e.semantic_key=m.semantic_key) ORDER BY m.id`,
        [scope.threadId, scope.creatorId, scope.fanId],
      );
      return {
        revision: thread.rows[0].revision,
        messages: messages.rows
          .reverse()
          .map((row) => `${row.author_kind}: ${row.text}`),
        memory: memory.rows.map((row) => row.text),
      };
    });
  }
  async delete(scope: ThreadScope, memoryId: string): Promise<void> {
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can delete their memory.",
    );
    await this.db.withThread(scope, async (client) => {
      await client.query(
        "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
        [scope.threadId, scope.creatorId, scope.fanId],
      );
      const removed = await client.query<{ semantic_key: string }>(
        "DELETE FROM creator.memory WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 RETURNING semantic_key",
        [memoryId, scope.threadId, scope.creatorId, scope.fanId],
      );
      if (!removed.rows[0]) return;
      await client.query(
        "INSERT INTO creator.memory_exclusion(thread_id,creator_id,fan_id,semantic_key) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
        [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          removed.rows[0].semantic_key,
        ],
      );
      await client.query(
        "UPDATE creator.thread SET revision=revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        [scope.threadId, scope.creatorId, scope.fanId],
      );
    });
  }
  async writeProposal(
    scope: ThreadScope,
    proposal: {
      kind: "fact" | "summary" | "open_loop";
      text: string;
      semanticKey: string;
      provenanceMessageId: string;
      expectedRevision: number;
      sensitiveCategory?: string;
    },
  ): Promise<boolean> {
    // A null consent identifier is never treated as permission to save a sensitive fact.
    invariant(
      proposal.sensitiveCategory === undefined,
      "sensitive_memory_disabled",
      "Sensitive memory requires per-item consent support.",
    );
    return this.db.withThread(scope, async (client) => {
      const current = await client.query(
        "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND revision=$4 AND deleted_at IS NULL FOR UPDATE",
        [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          proposal.expectedRevision,
        ],
      );
      if (current.rowCount !== 1) return false;
      const excluded = await client.query(
        "SELECT semantic_key FROM creator.memory_exclusion WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND semantic_key=$4",
        [scope.threadId, scope.creatorId, scope.fanId, proposal.semanticKey],
      );
      if (excluded.rowCount) return false;
      await client.query(
        "INSERT INTO creator.memory(thread_id,creator_id,fan_id,kind,text,semantic_key,provenance_message_id,thread_revision_at_write) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          proposal.kind,
          proposal.text,
          proposal.semanticKey,
          proposal.provenanceMessageId,
          proposal.expectedRevision,
        ],
      );
      await client.query(
        "UPDATE creator.thread SET revision=revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        [scope.threadId, scope.creatorId, scope.fanId],
      );
      return true;
    });
  }
}
