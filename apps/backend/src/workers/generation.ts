import { setTimeout as delay } from "node:timers/promises";
import type { Pool } from "pg";
import { z } from "zod";
import { DomainError, invariant } from "../core/errors.js";
import { PreparedGenerationPipeline } from "../modules/agent/generation-pipeline.js";
import { CommerceGenerationSafetyTerminalSettlement } from "../modules/commerce/generation-safety-terminal-settlement.js";
import { PreparedGenerationConversationOutput } from "../modules/conversation/generation-output.js";
import { PreparedGenerationConversationTerminal } from "../modules/conversation/generation-terminal.js";
import { GenerationIdentityAuthority } from "../modules/identity/generation-scope.js";
import { GenerationTerminalAuthority } from "../modules/identity/generation-terminal.js";
import { requestAuthority } from "../modules/identity/request-authority.js";
import { GenerationTerminalRecovery } from "./generation-terminal.js";

type Owners = Readonly<{
  identity: GenerationIdentityAuthority;
  pipeline: PreparedGenerationPipeline;
  output: PreparedGenerationConversationOutput;
  terminal: GenerationTerminalAuthority;
  finalization: PreparedGenerationConversationTerminal;
  settlement: CommerceGenerationSafetyTerminalSettlement;
}>;

export type GenerationWorkerPass = Readonly<{
  completed: number;
  failed: number;
  /** Null means recovery stopped after an uncertain/partially committed pass. */
  recovered: number | null;
  skipped: number;
  /** Uncertain or denied work retains its original durable recovery path. */
  deferred: number;
  /** Operational codes only: no input, provider response or account metadata. */
  failures: readonly string[];
}>;

const code = (cause: unknown) =>
  cause instanceof DomainError ? cause.code : "generation_worker_unavailable";

/** Serial executor for the original one-connection generation authority. It
 * claims only when ready to execute; no accepted lease waits in a JS queue.
 * Provider I/O, durable output and final cost settlement remain owner work. */
export class GenerationWorker {
  private busy = false;
  private lifetime = false;
  private readonly recovery: GenerationTerminalRecovery;

  private constructor(private readonly owners: Owners) {
    this.recovery = new GenerationTerminalRecovery(
      owners.terminal,
      owners.finalization,
      owners.settlement,
    );
  }

  static async prepare(
    input: Owners & {
      workerPool: Pool;
      hostPool: Pool;
      signal?: AbortSignal;
    },
  ): Promise<GenerationWorker> {
    invariant(
      !requestAuthority.getStore() &&
        input.identity instanceof GenerationIdentityAuthority &&
        input.pipeline instanceof PreparedGenerationPipeline &&
        input.output instanceof PreparedGenerationConversationOutput &&
        input.terminal instanceof GenerationTerminalAuthority &&
        input.finalization instanceof PreparedGenerationConversationTerminal &&
        input.settlement instanceof CommerceGenerationSafetyTerminalSettlement,
      "generation_worker_unconfigured",
      "Use the prepared original generation owners outside request authority.",
    );
    input.identity.assertPool(input.workerPool);
    input.pipeline.assertComposition(input.identity, input.hostPool);
    input.output.assertComposition(input);
    input.terminal.assertPool(input.workerPool);
    input.terminal.assertGeneration(input.identity);
    input.finalization.assertComposition(
      input.identity,
      input.terminal,
      input.hostPool,
    );
    input.settlement.assertComposition(
      input.identity,
      input.terminal,
      input.hostPool,
    );
    // Metadata only, before any claim or provider call. A host cannot advertise
    // a worker while its original discovery/reconciliation catalogue is held.
    await input.identity.pendingTasks(1, input.signal);
    await input.terminal.pendingTerminalCursors(1, input.signal);
    return new GenerationWorker(
      Object.freeze({
        identity: input.identity,
        pipeline: input.pipeline,
        output: input.output,
        terminal: input.terminal,
        finalization: input.finalization,
        settlement: input.settlement,
      }),
    );
  }

  private async pass(
    signal: AbortSignal,
    limit: number,
  ): Promise<GenerationWorkerPass> {
    invariant(
      !requestAuthority.getStore() && !this.busy,
      "generation_worker_running",
      "Use one original worker pass outside request authority.",
    );
    const bounded = z.int().min(1).max(64).parse(limit);
    signal.throwIfAborted();
    this.busy = true;
    const result = {
      completed: 0,
      failed: 0,
      recovered: 0 as number | null,
      skipped: 0,
      deferred: 0,
      failures: [] as string[],
    };
    try {
      // An unresolved historical receipt must not block unrelated new work.
      // Each new claim and provider stage still verifies its own full custody.
      try {
        result.recovered = await this.recovery.recoverOnce(signal, bounded);
      } catch (cause) {
        signal.throwIfAborted();
        result.recovered = null;
        result.failures.push(code(cause));
      }
      const candidates = await this.owners.identity.pendingTasks(
        bounded,
        signal,
      );
      for (const id of candidates) {
        signal.throwIfAborted();
        try {
          const task = await this.owners.identity.claimTask(id, signal);
          if (!task) {
            result.skipped++;
            continue;
          }
          let failed = false;
          try {
            await this.owners.pipeline.generate(
              task,
              signal,
              this.owners.output,
            );
          } catch (cause) {
            // generate() awaits provider-usage cleanup before rejecting. Never
            // turn a lost append ACK or provider failure into guessed zero cost.
            signal.throwIfAborted();
            failed = true;
            result.failures.push(code(cause));
          }
          // Read the cursor through a fresh original purpose, including after
          // partial output or a lost ACK. Denial/expiry leaves it for recovery.
          const lastSequence = await this.owners.identity.withGeneration(
            task,
            async (_client, scope) => scope.lastSequence,
            signal,
          );
          await this.owners.terminal.withTerminal(
            { mode: "completion", task, lastSequence, failed },
            async (client, scope) => {
              await this.owners.finalization.finalizeInTransaction(
                client,
                scope,
              );
              await this.owners.settlement.settleInTransaction(client, scope);
            },
            signal,
          );
          // Only W1's successful final COMMIT can increment either counter.
          if (failed) result.failed++;
          else result.completed++;
        } catch (cause) {
          signal.throwIfAborted();
          result.deferred++;
          result.failures.push(code(cause));
        }
      }
      return Object.freeze({
        ...result,
        failures: Object.freeze(result.failures),
      });
    } finally {
      this.busy = false;
    }
  }

  async runOnce(
    signal: AbortSignal,
    limit = 20,
  ): Promise<GenerationWorkerPass> {
    invariant(
      !this.lifetime,
      "generation_worker_running",
      "This worker already has a running lifetime.",
    );
    return this.pass(signal, limit);
  }

  /** The owning host must abort and await this promise before closing pools.
   * No timeout race abandons an in-flight provider receipt or held COMMIT. */
  async run(
    signal: AbortSignal,
    onPass?: (result: GenerationWorkerPass) => void,
  ): Promise<void> {
    invariant(
      !this.lifetime && !this.busy && !requestAuthority.getStore(),
      "generation_worker_running",
      "This worker already has a running lifetime.",
    );
    this.lifetime = true;
    try {
      while (!signal.aborted) {
        const result = await this.pass(signal, 20);
        onPass?.(result);
        await delay(1000, undefined, { signal });
      }
    } catch (cause) {
      if (!signal.aborted) throw cause;
    } finally {
      this.lifetime = false;
    }
  }
}
