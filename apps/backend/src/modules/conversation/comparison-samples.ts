import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import type { ShadowSample } from "../agent/shadow-samples.js";
import {
  ComparisonPolicySchema,
  type ComparisonPolicy,
} from "./comparison-consent.js";
import {
  comparisonSanitizerReference,
  sanitizeComparisonQuestion,
} from "./comparison-sanitizer.js";
import { PreparedComparisonSanitizerProvider } from "./comparison-provider.js";

/** The original Trust owner checks the current comparison policy, processor
 * policy and restrictions for this exact held family. No creator-scope or
 * feedback-consent alias can stand in for this separate use. */
export interface ComparisonUseAuthority {
  current(scope: ThreadScope, client: PoolClient): Promise<ComparisonPolicy>;
}

type Source = Readonly<{
  text: string;
  messageVersion: number;
  occurredAt: string;
  consentedAt: string;
  expiresAt: string;
  policy: ComparisonPolicy;
  hash: string;
}>;

/** Conversation alone reads the source and keeps its deletion mapping. This
 * class is not registered with Agent until original consent, current-read,
 * physical expiry and all cached-result invalidation owners are prepared. */
export class ConversationComparisonSamples {
  constructor(
    private readonly db: Database,
    private readonly authority: ComparisonUseAuthority,
    private readonly assertPrepared: (client: PoolClient) => Promise<void>,
    private readonly provider: PreparedComparisonSanitizerProvider,
  ) {
    provider.assertDatabase(db);
  }

  private async source(
    scope: ThreadScope,
    client: PoolClient,
    messageId: string,
  ): Promise<Source> {
    this.db.assertHeldThread(scope, client);
    invariant(
      scope.authority === "fan" && scope.actorAccountId === scope.fanAccountId,
      "comparison_owner_required",
      "Comparison questions require their original conversation owner.",
    );
    await this.assertPrepared(client);
    const policy = ComparisonPolicySchema.parse(
      await this.authority.current(scope, client),
    );
    const row = (
      await client.query<{
        text: string;
        version: number;
        occurred_at: Date;
        consented_at: Date;
        expires_at: Date;
      }>(
        `SELECT m.text,m.version,m.created_at AS occurred_at,c.consented_at,
        least(c.expires_at,m.created_at+interval '30 days') AS expires_at
       FROM creator.message m JOIN creator.thread t
        ON t.id=m.thread_id AND t.creator_id=m.creator_id AND t.fan_id=m.fan_id
       JOIN creator.conversation_comparison_consent c
        ON c.thread_id=t.id AND c.creator_id=t.creator_id AND c.fan_id=t.fan_id
       WHERE m.id=$4 AND m.thread_id=$1 AND m.creator_id=$2 AND m.fan_id=$3
        AND m.author_kind='fan' AND m.author_account_id=c.account_id AND c.account_id=$7
        AND m.delivery_state IN ('accepted','delivered') AND NOT m.off_the_record
        AND NOT t.off_the_record AND t.deleted_at IS NULL
        AND m.created_at>=clock_timestamp()-interval '7 days' AND m.created_at<=clock_timestamp()
        AND c.policy_version=$5 AND c.processor_policy_version=$6
        AND c.consented_at<=clock_timestamp() AND c.expires_at>clock_timestamp()
        AND t.processor_consent_version=$6 AND EXISTS(
         SELECT FROM creator.processor_consent p WHERE p.thread_id=t.id
          AND p.creator_id=t.creator_id AND p.fan_id=t.fan_id AND p.account_id=c.account_id
          AND p.version=$6 AND p.withdrawn_at IS NULL)
        AND NOT EXISTS(SELECT FROM creator.memory_exclusion e
         WHERE e.thread_id=t.id AND e.creator_id=t.creator_id AND e.fan_id=t.fan_id)`,
        [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          messageId,
          policy.version,
          policy.processorPolicyVersion,
          scope.fanAccountId,
        ],
      )
    ).rows[0];
    // Until the semantic exclusion owner is configured, any retained exclusion
    // excludes the entire thread. Matching only this message ID is insufficient.
    invariant(
      row,
      "comparison_question_unavailable",
      "This question is not currently available for AI comparisons.",
    );
    const value = {
      text: row.text,
      messageVersion: row.version,
      occurredAt: row.occurred_at.toISOString(),
      consentedAt: row.consented_at.toISOString(),
      expiresAt: row.expires_at.toISOString(),
      policy,
    };
    return Object.freeze({
      ...value,
      hash: contentHash({
        ...value,
        messageId,
        threadId: scope.threadId,
        creatorId: scope.creatorId,
        fanId: scope.fanId,
      }),
    });
  }

  private async sameSource(
    scope: ThreadScope,
    client: PoolClient,
    messageId: string,
    expected: Source,
  ) {
    const current = await this.source(scope, client, messageId);
    invariant(
      current.hash === expected.hash,
      "comparison_question_changed",
      "The question or its consent changed. Refresh the comparison.",
    );
  }

  async produce(
    scope: ThreadScope,
    messageId: string,
    signal: AbortSignal,
  ): Promise<ShadowSample | null> {
    assertThreadScope(scope);
    z.uuid().parse(messageId);
    signal.throwIfAborted();
    invariant(
      /^[a-f0-9]{64}$/u.test(this.provider.modelFingerprint),
      "comparison_model_unavailable",
      "The comparison sanitizer is unavailable.",
    );
    const sanitizerReference = comparisonSanitizerReference(
      this.provider.modelFingerprint,
    );
    const initial = await this.db.withThread(
      scope,
      async (client) => {
        const source = await this.source(scope, client, messageId);
        const cached = (
          await client.query<{
            id: string;
            paraphrased_prompt: string;
            sanitizer_reference: string;
          }>(
            `SELECT id,paraphrased_prompt,sanitizer_reference FROM creator.conversation_comparison_sample
         WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND message_id=$4
          AND message_version=$5 AND source_hash=$6 AND split_part(sanitizer_reference,':',1)=$7
          AND expires_at>clock_timestamp()`,
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              messageId,
              source.messageVersion,
              source.hash,
              sanitizerReference,
            ],
          )
        ).rows[0];
        this.db.finalizeHeldThreadBeforeCommit(scope, client, async () => {
          signal.throwIfAborted();
          await this.sameSource(scope, client, messageId, source);
        });
        return { source, cached };
      },
      "read",
      signal,
    );
    if (initial.cached) {
      signal.throwIfAborted();
      return Object.freeze({
        sampleId: initial.cached.id,
        occurredAt: initial.source.occurredAt,
        paraphrasedPrompt: initial.cached.paraphrased_prompt,
        sanitizerReference: initial.cached.sanitizer_reference,
      });
    }
    const operation = this.provider.operation({
      scope,
      signal,
      sourceHash: initial.source.hash,
      assertSource: (client) =>
        this.sameSource(scope, client, messageId, initial.source),
    });
    const sanitized = await sanitizeComparisonQuestion(
      initial.source.text,
      operation,
    );
    if (!sanitized) return null;
    operation.signal.throwIfAborted();
    const completedReference = operation.completedReference(
      sanitized.sanitizerReference,
    );
    return this.db.withThread(
      scope,
      async (client) => {
        await this.sameSource(scope, client, messageId, initial.source);
        const id = randomUUID();
        const source = initial.source;
        await client.query(
          `INSERT INTO creator.conversation_comparison_sample
         (id,thread_id,creator_id,fan_id,account_id,policy_version,processor_policy_version,
          message_id,message_version,source_hash,paraphrased_prompt,sanitizer_reference,occurred_at,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT DO NOTHING`,
          [
            id,
            scope.threadId,
            scope.creatorId,
            scope.fanId,
            scope.fanAccountId,
            source.policy.version,
            source.policy.processorPolicyVersion,
            messageId,
            source.messageVersion,
            source.hash,
            sanitized.paraphrase,
            completedReference,
            source.occurredAt,
            source.expiresAt,
          ],
        );
        // Concurrent genuine attempts may have paid for different paraphrases.
        // Preserve the first committed sample's immutable identity and text.
        const stored = (
          await client.query<{
            id: string;
            paraphrased_prompt: string;
            sanitizer_reference: string;
          }>(
            `SELECT id,paraphrased_prompt,sanitizer_reference FROM creator.conversation_comparison_sample
         WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND message_id=$4
          AND message_version=$5 AND source_hash=$6 AND split_part(sanitizer_reference,':',1)=$7
          AND expires_at>clock_timestamp()`,
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              messageId,
              source.messageVersion,
              source.hash,
              sanitizerReference,
            ],
          )
        ).rows[0];
        invariant(
          stored,
          "comparison_question_changed",
          "The comparison question changed. Refresh it.",
        );
        this.db.finalizeHeldThreadBeforeCommit(scope, client, async () => {
          operation.signal.throwIfAborted();
          await this.sameSource(scope, client, messageId, source);
        });
        return Object.freeze({
          sampleId: stored.id,
          occurredAt: source.occurredAt,
          paraphrasedPrompt: stored.paraphrased_prompt,
          sanitizerReference: stored.sanitizer_reference,
        });
      },
      "write",
      signal,
    );
  }
}
