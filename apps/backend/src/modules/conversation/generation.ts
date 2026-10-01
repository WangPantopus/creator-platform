import { randomUUID } from "node:crypto";
import type { Database } from "../../db/database.js";
import type { ThreadScope } from "../access/scope.js";
import type { ConversationService } from "./service.js";
import type { MemoryService } from "./memory.js";
import type {
  ApprovedSentence,
  ConversationContextPort,
} from "../agent/runtime.js";
import type { ThreadSnapshot } from "../agent/pipeline.js";
import { BoundedWorkerPool, workerBudgets } from "../../workers/pool.js";
import { invariant } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";

export interface ConversationGenerator {
  generate(
    scope: ThreadScope,
    text: string,
    context: ConversationContextPort,
    signal: AbortSignal,
    deliver: (sentence: ApprovedSentence) => Promise<void>,
  ): Promise<unknown>;
  extract?(
    scope: ThreadScope,
    snapshot: ThreadSnapshot,
    exchange: readonly string[],
    signal: AbortSignal,
  ): Promise<void>;
}
/** Durable jobs are creator.generation rows written by acceptance. A host's
 * generation pool may call recover with freshly authorized scopes after restart.
 * No anonymous worker or browser role can enumerate private conversations. */
export class ConversationGenerationProcessor {
  private readonly pool = new BoundedWorkerPool(workerBudgets.generation);
  private readonly pending = new Set<string>();
  private readonly active = new Map<string, AbortController>();
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
  interrupt(threadId: string) {
    this.active.get(threadId)?.abort();
  }
  close() {
    this.closed = true;
    for (const controller of this.active.values()) controller.abort();
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
    this.active.set(scope.threadId, controller);
    let emitted = 0;
    const context: ConversationContextPort = {
      current: (scope) => this.memory.context(scope),
      assertProcessorConsent: (scope) =>
        this.conversations.assertProcessorConsent(scope),
      assertDeliveryCurrent: async (current, expected) => {
        await this.db.withThread(
          current,
          async (client) => {
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
          },
          "read",
        );
      },
    };
    try {
      await this.generator.generate(
        scope,
        job.text,
        context,
        AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]),
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
      );
      invariant(
        emitted > 0,
        "empty_reply",
        "The model returned no approved response.",
      );
      await this.conversations.complete(scope, job.id, false, token);
      if (this.generator.extract) {
        const snapshot = await this.memory.context(scope);
        if (
          snapshot.epoch !== job.epoch ||
          snapshot.revision !== job.contextRevision + emitted
        )
          return;
        snapshot.provenanceMessageId = job.fan_message_id;
        const page = await this.conversations.read(scope);
        const answer = page.messages.find(
          (m) => m.id === job.ai_message_id && m.authorKind === "ai",
        );
        if (answer)
          await this.generator.extract(
            scope,
            snapshot,
            [job.text, answer.text],
            AbortSignal.timeout(10000),
          );
      }
    } catch {
      // Completion is fenced by the same row/epoch/token. A newer human boundary
      // already settled its reservation and must not be undone here.
      await this.conversations
        .complete(scope, job.id, true, token)
        .catch(() => undefined);
    } finally {
      if (this.active.get(scope.threadId) === controller)
        this.active.delete(scope.threadId);
    }
  }
}
