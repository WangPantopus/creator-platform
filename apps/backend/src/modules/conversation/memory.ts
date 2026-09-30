import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import type { ThreadScope } from "../access/scope.js";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import {
  MemoryProposalSchema,
  MemoryDecisionSchema,
  type MemoryItem,
} from "../../../../../packages/api/src/conversation/contracts.js";
import type { ThreadSnapshot } from "../agent/pipeline.js";

export interface SemanticExclusionPort {
  /** Retain only the canonical exclusion vector/reference, under the same scope
   * and transaction. This must use an existing embedding, with no provider call. */
  retain(
    scope: ThreadScope,
    client: PoolClient,
    item: { key: string; text: string },
  ): Promise<void>;
  matches(
    text: string,
    exclusions: readonly { key: string; text: string | null }[],
  ): Promise<boolean>;
}
const normalized = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const pair = (scope: ThreadScope) => [
  scope.threadId,
  scope.creatorId,
  scope.fanId,
];

export class MemoryService {
  constructor(
    private readonly db: Database,
    private readonly semantics?: SemanticExclusionPort,
  ) {}
  async context(scope: ThreadScope): Promise<ThreadSnapshot> {
    return this.db.withThread(scope, async (client) => {
      const thread = (
        await client.query(
          "SELECT revision,control_epoch,off_the_record,intro_shared FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL FOR UPDATE",
          pair(scope),
        )
      ).rows[0];
      invariant(
        thread,
        "thread_unavailable",
        "This conversation is unavailable.",
      );
      const exclusions = (
        await client.query<{ key: string; text: string | null }>(
          "SELECT semantic_key AS key,normalized_text AS text FROM creator.memory_exclusion WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 LIMIT 1001",
          pair(scope),
        )
      ).rows;
      invariant(
        exclusions.length <= 1000,
        "memory_exclusions_capacity",
        "Memory exclusions need a bounded processing job before this AI can continue.",
      );
      // Until a semantic matcher is configured, retained history after deletion is
      // conservatively omitted. Exact key comparison alone cannot stop paraphrases.
      const tail = (
        await client.query<{ id: string; author_kind: string; text: string }>(
          "SELECT id,author_kind,text FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND NOT off_the_record AND delivery_state IN ('accepted','delivered','interrupted') ORDER BY sequence DESC LIMIT 30",
          pair(scope),
        )
      ).rows.reverse();
      const messages: string[] = [];
      for (const row of tail) {
        if (
          exclusions.length &&
          (!this.semantics ||
            (await this.semantics.matches(row.text, exclusions)))
        )
          continue;
        messages.push(`${row.author_kind}: ${row.text}`);
      }
      const candidates =
        thread.off_the_record || (exclusions.length > 0 && !this.semantics)
          ? []
          : (
              await client.query<{ text: string }>(
                `SELECT m.text FROM creator.memory m LEFT JOIN creator.memory_consent c ON c.id=m.consent_id AND c.thread_id=m.thread_id AND c.creator_id=m.creator_id AND c.fan_id=m.fan_id AND c.withdrawn_at IS NULL
        WHERE m.thread_id=$1 AND m.creator_id=$2 AND m.fan_id=$3 AND m.state='remembered' AND (m.sensitive_category IS NULL OR c.id IS NOT NULL)
        AND NOT EXISTS(SELECT 1 FROM creator.memory_exclusion e WHERE e.thread_id=$1 AND e.creator_id=$2 AND e.fan_id=$3 AND e.semantic_key=m.semantic_key) ORDER BY m.created_at DESC LIMIT 100`,
                pair(scope),
              )
            ).rows.map((row) => row.text);
      const memory: string[] = [];
      for (const text of candidates) {
        if (
          exclusions.length &&
          (await this.semantics!.matches(text, exclusions))
        )
          continue;
        memory.push(text);
      }
      const profile =
        thread.intro_shared && !thread.off_the_record
          ? (
              await client.query(
                "SELECT intro FROM creator.fan_profile WHERE id=$1",
                [scope.fanId],
              )
            ).rows[0]
          : null;
      let intro: string | null = profile?.intro ?? null;
      if (
        intro &&
        exclusions.length &&
        (!this.semantics || (await this.semantics.matches(intro, exclusions)))
      )
        intro = null;
      const provenance = (
        await client.query<{ id: string }>(
          "SELECT id FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND author_kind='fan' ORDER BY sequence DESC LIMIT 1",
          pair(scope),
        )
      ).rows[0];
      invariant(
        provenance,
        "context_source_unavailable",
        "Send a message before assembling conversation context.",
      );
      return {
        revision: thread.revision,
        epoch: thread.control_epoch,
        offTheRecord: thread.off_the_record,
        intro,
        messages,
        memory,
        excludedKeys: exclusions.map((e) => e.key),
        provenanceMessageId: provenance.id,
      };
    });
  }
  async list(scope: ThreadScope) {
    return this.db.withThread(scope, async (client) => {
      const thread = (
        await client.query(
          "SELECT revision,off_the_record,intro_shared FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          pair(scope),
        )
      ).rows[0];
      const items = (
        await client.query<MemoryItem>(
          `SELECT id,kind,text,provenance_message_id AS "provenanceMessageId",sensitive_category AS "sensitiveCategory",state,edited_by_fan AS "editedByFan",created_at::text AS "createdAt" FROM creator.memory WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY created_at DESC,id LIMIT 100`,
          pair(scope),
        )
      ).rows;
      return {
        revision: thread.revision,
        offTheRecord: thread.off_the_record,
        introShared: thread.intro_shared,
        items,
      };
    });
  }
  async propose(scope: ThreadScope, raw: unknown): Promise<boolean> {
    return this.writeProposal(scope, MemoryProposalSchema.parse(raw));
  }
  async writeProposal(scope: ThreadScope, raw: unknown): Promise<boolean> {
    return (await this.writeProposals(scope, [raw])) > 0;
  }
  /** One extraction snapshot commits as one revision. Later fan changes invalidate
   * the entire batch, including candidates classified by a slow model call. */
  async writeProposals(
    scope: ThreadScope,
    raws: readonly unknown[],
  ): Promise<number> {
    invariant(
      raws.length <= 5,
      "memory_batch_large",
      "Shorten this memory proposal batch.",
    );
    const proposals = raws.map((raw) => MemoryProposalSchema.parse(raw));
    if (!proposals.length) return 0;
    const revision = proposals[0]!.expectedRevision;
    invariant(
      proposals.every((p) => p.expectedRevision === revision),
      "memory_batch_changed",
      "Memory proposals must use one current snapshot.",
    );
    return this.db.withThread(scope, async (client) => {
      const current = await client.query(
        "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND revision=$4 AND NOT off_the_record AND deleted_at IS NULL FOR UPDATE",
        [...pair(scope), revision],
      );
      if (!current.rowCount) return 0;
      const exclusions = (
        await client.query<{ key: string; text: string | null }>(
          "SELECT semantic_key AS key,normalized_text AS text FROM creator.memory_exclusion WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 LIMIT 1001",
          pair(scope),
        )
      ).rows;
      if (exclusions.length > 1000) return 0;
      let written = 0;
      for (const proposal of proposals) {
        const key = normalized(proposal.semanticKey);
        if (
          !key ||
          exclusions.some((e) => e.key === key || e.key === contentHash(key)) ||
          (exclusions.length &&
            (!this.semantics ||
              (await this.semantics.matches(proposal.text, exclusions))))
        )
          continue;
        const provenance = await client.query(
          "SELECT id FROM creator.message WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 AND author_kind='fan' AND NOT off_the_record",
          [proposal.provenanceMessageId, ...pair(scope)],
        );
        invariant(
          provenance.rowCount === 1,
          "provenance_unavailable",
          "The memory source is unavailable.",
        );
        const prior = await client.query(
          "SELECT id FROM creator.memory WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND semantic_key=$4",
          [...pair(scope), key],
        );
        if (prior.rowCount) continue;
        await client.query(
          "INSERT INTO creator.memory(thread_id,creator_id,fan_id,kind,text,semantic_key,provenance_message_id,thread_revision_at_write,sensitive_category,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'proposed')",
          [
            ...pair(scope),
            proposal.kind,
            proposal.text,
            key,
            proposal.provenanceMessageId,
            revision,
            proposal.sensitiveCategory ?? null,
          ],
        );
        written++;
      }
      if (written)
        await client.query(
          "UPDATE creator.thread SET revision=revision+1,memory_revision=memory_revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          pair(scope),
        );
      return written;
    });
  }
  async requestConsentOnce(
    scope: ThreadScope,
    item: {
      itemHash: string;
      text: string;
      category: string;
      expectedRevision: number;
      provenanceMessageId: string;
      question: string;
    },
  ) {
    // C05 currently omits the key/kind for sensitive items. Bind consent to this
    // immutable proposal hash; W2 must add canonical semantic metadata for full matching.
    await this.writeProposal(scope, {
      kind: "fact",
      text: item.text,
      semanticKey: item.itemHash,
      provenanceMessageId: item.provenanceMessageId,
      expectedRevision: item.expectedRevision,
      sensitiveCategory: item.category,
    });
  }
  async decide(scope: ThreadScope, memoryId: string, raw: unknown) {
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can manage their memory.",
    );
    const body = MemoryDecisionSchema.parse(raw);
    await this.db.withThread(scope, async (client) => {
      const current = await client.query(
        "SELECT off_the_record FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND revision=$4 FOR UPDATE",
        [...pair(scope), body.expectedRevision],
      );
      invariant(
        current.rowCount === 1,
        "memory_changed",
        "Memory changed. Refresh before making this change.",
      );
      const item = (
        await client.query(
          "SELECT * FROM creator.memory WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR UPDATE",
          [memoryId, ...pair(scope)],
        )
      ).rows[0];
      invariant(item, "memory_unavailable", "This memory is unavailable.");
      if (body.action === "delete") {
        const exclusionKey = contentHash(item.semantic_key);
        await this.semantics?.retain(scope, client, {
          key: exclusionKey,
          text: item.text,
        });
        await client.query(
          "INSERT INTO creator.memory_exclusion(thread_id,creator_id,fan_id,semantic_key,normalized_text) VALUES($1,$2,$3,$4,$5) ON CONFLICT(thread_id,semantic_key) DO NOTHING",
          [...pair(scope), exclusionKey, null],
        );
        await client.query(
          "UPDATE creator.memory_consent SET withdrawn_at=now() WHERE item_id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 AND withdrawn_at IS NULL",
          [memoryId, ...pair(scope)],
        );
        await client.query(
          "DELETE FROM creator.memory WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND kind='summary'",
          pair(scope),
        );
        await client.query(
          "DELETE FROM creator.memory WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
          [memoryId, ...pair(scope)],
        );
      } else {
        invariant(
          !current.rows[0].off_the_record,
          "off_the_record",
          "Turn off off-the-record before saving memory.",
        );
        if (
          body.action === "accept" &&
          item.sensitive_category &&
          !item.consent_id
        ) {
          const consent = (
            await client.query<{ id: string }>(
              "INSERT INTO creator.memory_consent(thread_id,creator_id,fan_id,account_id,item_id,item_hash,category) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
              [
                ...pair(scope),
                scope.actorAccountId,
                item.id,
                contentHash({
                  text: item.text,
                  key: item.semantic_key,
                  category: item.sensitive_category,
                }),
                item.sensitive_category,
              ],
            )
          ).rows[0]!;
          await client.query(
            "UPDATE creator.memory SET consent_id=$1 WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5",
            [consent.id, memoryId, ...pair(scope)],
          );
        }
        invariant(
          body.action !== "edit" || body.text,
          "memory_text_required",
          "Enter what you want remembered.",
        );
        invariant(
          body.action !== "resolve" ||
            (item.kind === "open_loop" && item.state === "remembered"),
          "memory_not_open",
          "Only an agreed open loop can be resolved.",
        );
        // An edit to sensitive content needs a new explicit per-item acceptance.
        if (body.action === "edit" && item.consent_id)
          await client.query(
            "UPDATE creator.memory_consent SET withdrawn_at=now() WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
            [item.consent_id, ...pair(scope)],
          );
        await client.query(
          "UPDATE creator.memory SET text=$1,state=$2,edited_by_fan=edited_by_fan OR $3,consent_id=CASE WHEN $4 THEN NULL ELSE consent_id END,sensitive_category=CASE WHEN $4 THEN coalesce(sensitive_category,'sensitive_unspecified') ELSE sensitive_category END WHERE id=$5 AND thread_id=$6 AND creator_id=$7 AND fan_id=$8",
          [
            body.action === "edit" ? body.text : item.text,
            body.action === "resolve"
              ? "resolved"
              : body.action === "edit"
                ? "proposed"
                : "remembered",
            body.action === "edit",
            body.action === "edit",
            memoryId,
            ...pair(scope),
          ],
        );
      }
      await client.query(
        "UPDATE creator.thread SET revision=revision+1,memory_revision=memory_revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        pair(scope),
      );
    });
    return this.list(scope);
  }
  async delete(scope: ThreadScope, memoryId: string) {
    const current = await this.list(scope);
    await this.decide(scope, memoryId, {
      action: "delete",
      expectedRevision: current.revision,
    });
  }
}
