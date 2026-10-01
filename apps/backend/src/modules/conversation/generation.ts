import { randomUUID } from "node:crypto";
import { MemoryProposalSchema } from "../../../../../packages/api/src/conversation/contracts.js";
import type { Database } from "../../db/database.js";
import type { ThreadScope } from "../access/scope.js";
import type { ConversationService } from "./service.js";
import type { MemoryExclusionSnapshot, MemoryService } from "./memory.js";
import type {
  ApprovedSentence,
  ConversationContextPort,
} from "../agent/runtime.js";
import type { ThreadSnapshot } from "../agent/pipeline.js";
import { BoundedWorkerPool, workerBudgets } from "../../workers/pool.js";
import { invariant } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PoolClient } from "pg";
import type { PreparedGenerationJournal } from "../agent/generation-journal.js";

/** W2 journals only its own attempt/usage/fence rows in these callbacks.
 * Provider network calls begin after the admission transaction commits. */
export interface GenerationExecution {
  readonly generationId: string;
  readonly attemptId: string;
  admit<T>(journal: (client: PoolClient) => Promise<T>): Promise<T>;
  sealAdmission<T>(journal: (client: PoolClient) => Promise<T>): Promise<T>;
  /** One actual bounded snapshot for attributed classification after the held
   * transaction commits. Missing retained material must stay uncertain in W2. */
  memoryExclusions(
    assertAuthority: (client: PoolClient) => Promise<void>,
  ): Promise<MemoryExclusionSnapshot>;
  /** One classified extraction batch under this actual attempt's held fence.
   * The callback locks W2's current license/version/audience, with no provider I/O. */
  commitMemory(
    raws: readonly unknown[],
    assertAuthority: (client: PoolClient) => Promise<void>,
    /** Only this attempt's actual issued snapshot after W2 classified survivors. */
    exclusions?: MemoryExclusionSnapshot,
  ): Promise<{ written: number; revision: number | null }>;
}

export interface ConversationGenerator {
  /** The actual prepared journal used by this generator's AgentRepository. */
  readonly journal?: PreparedGenerationJournal;
  /** Canonical W2 readiness after every call has attributed pre-call custody. */
  readonly executionAttributed?: boolean;
  seal?(scope: ThreadScope, execution: GenerationExecution): Promise<void>;
  routeSafety?(
    scope: ThreadScope,
    text: string,
    context: ConversationContextPort,
    signal: AbortSignal,
    deliver: (sentence: {
      text: string;
      citations: [];
      authorKind: "ai";
      safety: true;
    }) => Promise<void>,
  ): Promise<boolean>;
  generate(
    scope: ThreadScope,
    text: string,
    context: ConversationContextPort,
    signal: AbortSignal,
    deliver: (sentence: ApprovedSentence) => Promise<void>,
    execution?: GenerationExecution,
  ): Promise<unknown>;
  extract?(
    scope: ThreadScope,
    snapshot: ThreadSnapshot,
    exchange: readonly string[],
    signal: AbortSignal,
    execution?: GenerationExecution,
  ): Promise<{ revision: number | null } | void>;
}
/** Durable jobs are creator.generation rows written by acceptance. A host's
 * generation pool may call recover with freshly authorized scopes after restart.
 * No anonymous worker or browser role can enumerate private conversations. */
export class ConversationGenerationProcessor {
  private readonly pool = new BoundedWorkerPool(workerBudgets.generation);
  private readonly pending = new Set<string>();
  private readonly active = new Map<
    string,
    { controller: AbortController; epoch: number }
  >();
  private readonly retries = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly again = new Map<
    string,
    {
      scope: ThreadScope;
      authority: ReturnType<typeof requestAuthority.getStore>;
    }
  >();
  private closed = false;
  constructor(
    private readonly db: Database,
    private readonly conversations: ConversationService,
    private readonly memory: MemoryService,
    private readonly generator: ConversationGenerator,
  ) {}
  interrupt(threadId: string, beforeEpoch?: number) {
    const current = this.active.get(threadId);
    // A replayed old control receipt cannot abort a newer accepted attempt.
    if (current && (beforeEpoch === undefined || current.epoch < beforeEpoch))
      current.controller.abort();
  }
  close() {
    this.closed = true;
    for (const { controller } of this.active.values()) controller.abort();
    for (const timer of this.retries.values()) clearTimeout(timer);
    this.retries.clear();
    this.again.clear();
  }
  schedule(scope: ThreadScope) {
    if (this.closed) return;
    if (this.pending.has(scope.threadId)) {
      // A handback/new accepted message can arrive before the previous worker
      // finishes aborting. Keep one latest authorized wakeup, not another queue.
      this.again.set(scope.threadId, {
        scope,
        authority: requestAuthority.getStore(),
      });
      return;
    }
    const timer = this.retries.get(scope.threadId);
    if (timer) {
      clearTimeout(timer);
      this.retries.delete(scope.threadId);
    } else if (this.pending.size + this.retries.size >= 64) return;
    this.pending.add(scope.threadId);
    let retryAfter: number | undefined;
    void this.pool
      .enqueue(scope, async () => {
        if (!this.closed) retryAfter = await this.recover(scope);
      })
      .catch(() => undefined)
      .finally(() => {
        this.pending.delete(scope.threadId);
        const next = this.again.get(scope.threadId);
        this.again.delete(scope.threadId);
        if (this.closed) return;
        if (next) {
          if (next.authority)
            requestAuthority.run(next.authority, () =>
              this.schedule(next.scope),
            );
          else this.schedule(next.scope);
        } else if (retryAfter !== undefined) {
          // A fresh page after a process restart may see the crashed worker's
          // unexpired lease. Wake at its expiry and recheck current authority;
          // do not require a second browser reload to recover durable work.
          const retry = setTimeout(() => {
            this.retries.delete(scope.threadId);
            this.schedule(scope);
          }, retryAfter);
          retry.unref();
          this.retries.set(scope.threadId, retry);
        }
      });
  }
  async recover(scope: ThreadScope): Promise<number | undefined> {
    const token = randomUUID();
    const job = await this.db.withThread(
      scope,
      async (client) => {
        await client.query(
          "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
          [scope.threadId, scope.creatorId, scope.fanId],
        );
        const row = (
          await client.query<{
            id: string;
            last_sequence: number;
            text: string;
            epoch: number;
            fan_message_id: string;
            ai_message_id: string;
          }>(
            `SELECT g.id,g.last_sequence,g.epoch,g.fan_message_id,g.ai_message_id,m.text FROM creator.generation g JOIN creator.message m ON m.id=g.fan_message_id AND m.thread_id=g.thread_id AND m.creator_id=g.creator_id AND m.fan_id=g.fan_id WHERE g.thread_id=$1 AND g.creator_id=$2 AND g.fan_id=$3 AND g.state IN('queued','generating') AND (g.lease_until IS NULL OR g.lease_until<now()) ORDER BY g.accepted_at LIMIT 1 FOR UPDATE OF g`,
            [scope.threadId, scope.creatorId, scope.fanId],
          )
        ).rows[0];
        if (!row) {
          const waiting = (
            await client.query<{ retry_after: number }>(
              `SELECT LEAST(60000,GREATEST(1,ceil(extract(epoch FROM (lease_until-clock_timestamp()))*1000)))::integer AS retry_after FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('queued','generating') AND lease_until>clock_timestamp() ORDER BY lease_until LIMIT 1`,
              [scope.threadId, scope.creatorId, scope.fanId],
            )
          ).rows[0];
          return waiting ? { retryAfter: waiting.retry_after } : null;
        }
        const claimed = await client.query<{ context_revision: number }>(
          "UPDATE creator.generation SET worker_token=$1,lease_until=now()+interval '60 seconds',state='generating',context_revision=(SELECT revision FROM creator.thread WHERE id=$3 AND creator_id=$4 AND fan_id=$5) WHERE id=$2 AND thread_id=$3 AND creator_id=$4 AND fan_id=$5 RETURNING context_revision",
          [token, row.id, scope.threadId, scope.creatorId, scope.fanId],
        );
        return { ...row, contextRevision: claimed.rows[0]!.context_revision };
      },
      "write",
    );
    if (!job) return;
    if ("retryAfter" in job) return job.retryAfter;
    // A crashed stream with visible text is terminal. Never append a newly
    // generated continuation to its old immutable delivered prefix.
    if (job.last_sequence > 0) {
      await this.conversations.complete(scope, job.id, true, token);
      return;
    }
    const controller = new AbortController();
    this.active.set(scope.threadId, { controller, epoch: job.epoch });
    let emitted = 0;
    let expectedRevision = job.contextRevision;
    let admissionsOpen = true;
    let extractingMemory = false;
    let memorySignal: AbortSignal | undefined;
    let memoryBatchCommitted = false;
    let memoryExclusionsRequested = false;
    let memoryExclusions: MemoryExclusionSnapshot | undefined;
    let memoryBatchReceipt:
      | { written: number; revision: number | null }
      | undefined;
    const generationSignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(45000),
    ]);
    const fence = async <T>(
      journal: (client: PoolClient) => Promise<T>,
      seal: boolean,
    ): Promise<T> => {
      if (seal) admissionsOpen = false;
      else {
        generationSignal.throwIfAborted();
        invariant(
          admissionsOpen,
          "generation_admission_closed",
          "Provider admission is closed.",
        );
      }
      return this.db.withThread(
        scope,
        async (client) => {
          if (!seal) {
            generationSignal.throwIfAborted();
            invariant(
              admissionsOpen,
              "generation_admission_closed",
              "Provider admission is closed.",
            );
          }
          const current = await client.query(
            `SELECT g.id FROM creator.generation g JOIN creator.thread t
           ON t.id=g.thread_id AND t.creator_id=g.creator_id AND t.fan_id=g.fan_id
           WHERE g.id=$4 AND g.thread_id=$1 AND g.creator_id=$2 AND g.fan_id=$3
           AND g.worker_token=$5 AND g.lease_until>clock_timestamp() AND g.state='generating'
           AND g.epoch=$6 AND t.control_epoch=$6 AND t.control='ai_active'
           AND t.revision=$7 AND g.last_sequence=$8 FOR UPDATE OF g`,
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              job.id,
              token,
              job.epoch,
              expectedRevision + emitted,
              emitted,
            ],
          );
          invariant(
            current.rowCount === 1,
            "generation_interrupted",
            "The generation attempt changed before provider admission.",
          );
          await this.conversations.assertProcessorConsentInTransaction(
            scope,
            client,
          );
          const result = await journal(client);
          if (!seal) {
            generationSignal.throwIfAborted();
            invariant(
              admissionsOpen,
              "generation_admission_closed",
              "Provider admission is closed.",
            );
          }
          return result;
        },
        "write",
      );
    };
    const execution: GenerationExecution = {
      generationId: job.id,
      attemptId: token,
      admit: (journal) => fence(journal, false),
      sealAdmission: (journal) => fence(journal, true),
      memoryExclusions: async (assertAuthority) => {
        invariant(
          extractingMemory &&
            !memoryBatchCommitted &&
            !memoryExclusionsRequested &&
            emitted > 0,
          "memory_admission_closed",
          "This attempt's memory exclusions are not available.",
        );
        memorySignal!.throwIfAborted();
        memoryExclusionsRequested = true;
        const snapshot = await fence(async (client) => {
          invariant(
            extractingMemory,
            "memory_admission_closed",
            "This attempt's memory exclusions are not available.",
          );
          memorySignal!.throwIfAborted();
          await assertAuthority(client);
          const current = await this.memory.exclusionSnapshotInTransaction(
            scope,
            client,
            expectedRevision + emitted,
          );
          invariant(
            extractingMemory,
            "memory_admission_closed",
            "This attempt's memory exclusions are not available.",
          );
          memorySignal!.throwIfAborted();
          return current;
        }, false);
        memoryExclusions = snapshot;
        return snapshot;
      },
      commitMemory: async (raws, assertAuthority, exclusions) => {
        invariant(
          extractingMemory && !memoryBatchCommitted && emitted > 0,
          "memory_admission_closed",
          "This attempt's memory batch is not available.",
        );
        memorySignal!.throwIfAborted();
        invariant(
          !exclusions || exclusions === memoryExclusions,
          "memory_exclusions_invalid",
          "Use this attempt's actual classified exclusion snapshot.",
        );
        invariant(
          raws.length <= 5,
          "memory_batch_large",
          "Shorten this memory proposal batch.",
        );
        const proposals = raws.map((raw) => MemoryProposalSchema.parse(raw));
        const before = expectedRevision + emitted;
        invariant(
          proposals.every(
            (proposal) =>
              proposal.expectedRevision === before &&
              proposal.provenanceMessageId === job.fan_message_id,
          ),
          "memory_batch_changed",
          "Memory proposals must use this attempt's exact current source and snapshot.",
        );
        memoryBatchCommitted = true;
        const receipt = await fence(async (client) => {
          invariant(
            extractingMemory,
            "memory_admission_closed",
            "This attempt's memory batch is not available.",
          );
          memorySignal!.throwIfAborted();
          await assertAuthority(client);
          const result = await this.memory.writeProposalsInTransaction(
            scope,
            client,
            proposals,
            exclusions,
          );
          invariant(
            result.revision === null ||
              result.revision === before ||
              result.revision === before + 1,
            "memory_changed",
            "The memory extraction revision changed.",
          );
          const current = await client.query(
            `SELECT g.id FROM creator.generation g JOIN creator.thread t
             ON t.id=g.thread_id AND t.creator_id=g.creator_id AND t.fan_id=g.fan_id
             WHERE g.id=$4 AND g.thread_id=$1 AND g.creator_id=$2 AND g.fan_id=$3
             AND g.worker_token=$5 AND g.lease_until>clock_timestamp() AND g.state='generating'
             AND g.epoch=$6 AND t.control_epoch=$6 AND t.control='ai_active' AND NOT t.off_the_record
             AND t.revision=$7 AND g.last_sequence=$8`,
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              job.id,
              token,
              job.epoch,
              result.revision ?? before,
              emitted,
            ],
          );
          invariant(
            current.rowCount === 1,
            "generation_interrupted",
            "The generation attempt changed before the memory batch committed.",
          );
          invariant(
            extractingMemory,
            "memory_admission_closed",
            "This attempt's memory batch is not available.",
          );
          memorySignal!.throwIfAborted();
          return result;
        }, false);
        memoryBatchReceipt = receipt;
        if (receipt.revision !== null)
          expectedRevision = receipt.revision - emitted;
        return receipt;
      },
    };
    const context: ConversationContextPort = {
      current: (scope) => this.memory.context(scope),
      assertProcessorConsent: (scope) =>
        this.conversations.assertProcessorConsent(scope),
      assertDeliveryCurrent: async (current, expected) => {
        await this.db.withThread(current, async (client) => {
          const row = (
            await client.query(
              "SELECT t.control,t.control_epoch,t.revision,t.processor_consent_version,g.worker_token,g.lease_until FROM creator.thread t JOIN creator.generation g ON g.thread_id=t.id AND g.creator_id=t.creator_id AND g.fan_id=t.fan_id WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 AND g.id=$4",
              [scope.threadId, scope.creatorId, scope.fanId, job.id],
            )
          ).rows[0];
          invariant(
            row &&
              row.control === "ai_active" &&
              row.control_epoch === expected.epoch &&
              row.revision === expected.revision + emitted &&
              row.worker_token === token &&
              row.lease_until > new Date() &&
              row.processor_consent_version,
            "generation_interrupted",
            "The conversation changed during generation.",
          );
        });
      },
    };
    try {
      await this.generator.generate(
        scope,
        job.text,
        context,
        generationSignal,
        async (sentence) => {
          const frame = await this.conversations.releaseApprovedSentence(
            scope,
            job.id,
            sentence,
            emitted + 1,
            token,
          );
          invariant(
            frame,
            "generation_interrupted",
            "The conversation changed during generation.",
          );
          emitted++;
        },
        execution,
      );
      invariant(
        emitted > 0,
        "empty_reply",
        "The model returned no approved response.",
      );
      if (this.generator.extract) {
        const snapshot = await this.memory.context(scope);
        const memoryCurrent =
          snapshot.epoch === job.epoch &&
          snapshot.revision === job.contextRevision + emitted &&
          !snapshot.offTheRecord;
        snapshot.provenanceMessageId = job.fan_message_id;
        const page = await this.conversations.read(scope);
        const answer = page.messages.find(
          (m) => m.id === job.ai_message_id && m.authorKind === "ai",
        );
        if (answer && memoryCurrent) {
          extractingMemory = true;
          memorySignal = AbortSignal.any([
            generationSignal,
            AbortSignal.timeout(10000),
          ]);
          let receipt: { revision: number | null } | void;
          try {
            receipt = await this.generator.extract(
              scope,
              snapshot,
              [job.text, answer.text],
              memorySignal,
              execution,
            );
          } finally {
            extractingMemory = false;
          }
          if (receipt?.revision !== null && receipt?.revision !== undefined) {
            invariant(
              memoryBatchReceipt
                ? receipt.revision === memoryBatchReceipt.revision
                : receipt.revision === job.contextRevision + emitted,
              "memory_changed",
              "The memory extraction revision changed.",
            );
            expectedRevision = receipt.revision - emitted;
          }
        }
      }
      await this.generator.seal?.(scope, execution);
      admissionsOpen = false;
      await this.conversations.complete(scope, job.id, false, token);
    } catch {
      admissionsOpen = false;
      await this.generator.seal?.(scope, execution).catch(() => undefined);
      // Completion is fenced by the same row/epoch/token. A newer human boundary
      // already settled its reservation and must not be undone here.
      await this.conversations
        .complete(scope, job.id, true, token)
        .catch(() => undefined);
    } finally {
      admissionsOpen = false;
      if (this.active.get(scope.threadId)?.controller === controller)
        this.active.delete(scope.threadId);
    }
  }
}
