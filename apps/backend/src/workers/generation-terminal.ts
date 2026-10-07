import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { DomainError, invariant } from "../core/errors.js";
import { CommerceGenerationSafetyTerminalSettlement } from "../modules/commerce/generation-safety-terminal-settlement.js";
import { PreparedGenerationConversationTerminal } from "../modules/conversation/generation-terminal.js";
import { GenerationTerminalAuthority } from "../modules/identity/generation-terminal.js";
import { requestAuthority } from "../modules/identity/request-authority.js";

/** Original accepted-work recovery only. No interactive ThreadScope, provider
 * execution, worker claim, input read or caller-created financial receipt. */
export class GenerationTerminalRecovery {
  private running = false;
  private lifetime = false;

  constructor(
    private readonly terminal: GenerationTerminalAuthority,
    private readonly output: PreparedGenerationConversationTerminal,
    private readonly settlement: CommerceGenerationSafetyTerminalSettlement,
  ) {
    invariant(
      terminal instanceof GenerationTerminalAuthority &&
        output instanceof PreparedGenerationConversationTerminal &&
        settlement instanceof CommerceGenerationSafetyTerminalSettlement,
      "generation_terminal_recovery_unconfigured",
      "Use the genuine prepared original terminal, conversation and financial owners.",
    );
  }

  /** The original selector's observed cursor is passed unchanged to W1.
   * Discovery is not authority; W1 rechecks it on the actual retained client.
   * Each counted result follows W1's actual COMMIT, including its own final
   * journal/financial, restoration, currentness and private cleanup fences. */
  async recoverOnce(signal: AbortSignal, limit = 20): Promise<number> {
    invariant(
      !requestAuthority.getStore() && !this.running,
      "generation_terminal_worker_required",
      "Use one original recovery pass outside interactive request authority.",
    );
    const bounded = z.int().min(1).max(64).parse(limit);
    signal.throwIfAborted();
    this.running = true;
    try {
      const candidates = await this.terminal.pendingTerminalCursors(
        bounded,
        signal,
      );
      let committed = 0;
      const failures: unknown[] = [];
      for (const candidate of candidates) {
        if (signal.aborted && failures.length) break;
        signal.throwIfAborted();
        try {
          await this.terminal.withTerminal(
            {
              mode: "reconciliation",
              generationId: candidate.generationId,
              lastSequence: candidate.lastSequence,
            },
            async (client, scope) => {
              await this.output.finalizeInTransaction(client, scope);
              await this.settlement.settleInTransaction(client, scope);
            },
            signal,
          );
          committed++;
        } catch (cause) {
          // Each original transaction has finished its own cleanup. An unknown
          // old receipt must not starve every later terminal candidate forever.
          // Abort still retains any incurred/cleanup failure for the host.
          if (signal.aborted && !failures.length) throw cause;
          failures.push(cause);
        }
      }
      if (failures.length)
        throw new DomainError(
          "generation_terminal_recovery_incomplete",
          "Some original terminal receipts still require reconciliation.",
          503,
          { cause: new AggregateError(failures) },
        );
      return committed;
    } finally {
      this.running = false;
    }
  }

  /** An owning host must await this lifetime and abort it before closing its
   * original pool. A failed/uncertain pass escapes; it never becomes a success,
   * another provider attempt or a guessed zero-output settlement. */
  async run(signal: AbortSignal): Promise<void> {
    invariant(
      !this.lifetime,
      "generation_terminal_recovery_running",
      "This original recovery lifetime is already running.",
    );
    this.lifetime = true;
    try {
      while (!signal.aborted) {
        await this.recoverOnce(signal);
        try {
          await delay(1_000, undefined, { signal });
        } catch (cause) {
          if (!signal.aborted) throw cause;
        }
      }
    } finally {
      this.lifetime = false;
    }
  }
}
