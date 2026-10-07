import { describe, expect, it } from "vitest";
import { DomainError } from "../src/core/errors.js";
import { GenerationTerminalRecovery } from "../src/workers/generation-terminal.js";
import {
  GenerationWorker,
  type GenerationWorkerPass,
} from "../src/workers/generation.js";

/** Exercise only the real lifetime scheduler with a controlled pass boundary.
 * No owners, scopes, tasks, provider responses or financial receipts are faked;
 * these checks cannot qualify preparation or a real generation. */
function lifetime(
  signal: AbortSignal,
  pass: () => Promise<GenerationWorkerPass>,
  onPass?: (result: GenerationWorkerPass) => void,
) {
  const state = { lifetime: false, busy: false, pass };
  const done = Reflect.apply(GenerationWorker.prototype.run, state, [
    signal,
    onPass,
  ]) as Promise<void>;
  return { state, done };
}

describe("generation host abort and drain", () => {
  it("accepts only the original cooperative abort as a clean stop", async () => {
    const controller = new AbortController();
    const host = lifetime(controller.signal, async () => {
      controller.abort();
      controller.signal.throwIfAborted();
      throw new Error("unreachable");
    });
    await expect(host.done).resolves.toBeUndefined();
    expect(host.state.lifetime).toBe(false);
  });

  it("awaits incurred cleanup after abort and preserves its failure", async () => {
    const controller = new AbortController();
    let rejectCleanup!: (cause: unknown) => void;
    const cleanup = new Promise<never>((_resolve, reject) => {
      rejectCleanup = reject;
    });
    const host = lifetime(controller.signal, () => cleanup);
    let settled = false;
    void host.done.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    controller.abort();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(host.state.lifetime).toBe(true);
    const failure = new DomainError(
      "generation_usage_completion_unavailable",
      "Original incurred usage cleanup failed.",
      503,
    );
    rejectCleanup(failure);
    await expect(host.done).rejects.toBe(failure);
    expect(host.state.lifetime).toBe(false);
  });

  it("retains a pass observer failure that races with shutdown", async () => {
    const controller = new AbortController();
    const failure = new Error("observer failed");
    const host = lifetime(
      controller.signal,
      async () => ({
        completed: 0,
        failed: 0,
        recovered: 0,
        skipped: 0,
        deferred: 0,
        failures: [],
      }),
      () => {
        controller.abort();
        throw failure;
      },
    );
    await expect(host.done).rejects.toBe(failure);
  });

  it("does not start a pass for a preaborted host", async () => {
    const controller = new AbortController();
    controller.abort();
    const host = lifetime(controller.signal, async () => {
      throw new Error("Pass must not start");
    });
    await expect(host.done).resolves.toBeUndefined();
    expect(host.state.lifetime).toBe(false);
  });
});

describe("terminal recovery scheduling", () => {
  // The controlled terminal port always rejects before issuing any scope.
  // This tests candidate scheduling and failure retention, not settlement.
  const candidates = [
    { generationId: "00000000-0000-4000-8000-000000000001", lastSequence: 0 },
    { generationId: "00000000-0000-4000-8000-000000000002", lastSequence: 3 },
  ];

  it("attempts later candidates after an earlier original transaction fails", async () => {
    const failures = [new Error("unknown receipt"), new Error("stale cursor")];
    const attempted: unknown[] = [];
    const state = {
      running: false,
      terminal: {
        pendingTerminalCursors: async () => candidates,
        withTerminal: async (intent: unknown) => {
          attempted.push(intent);
          throw failures[attempted.length - 1];
        },
      },
    };
    const done = Reflect.apply(
      GenerationTerminalRecovery.prototype.recoverOnce,
      state,
      [new AbortController().signal],
    ) as Promise<number>;
    const failure = await done.catch((cause: unknown) => cause);
    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe(
      "generation_terminal_recovery_incomplete",
    );
    expect(((failure as Error).cause as AggregateError).errors).toEqual(
      failures,
    );
    expect(attempted).toEqual(
      candidates.map((candidate) => ({ mode: "reconciliation", ...candidate })),
    );
    expect(state.running).toBe(false);
  });

  it("stops on abort without replacing an original cleanup failure", async () => {
    const controller = new AbortController();
    const failure = new Error("original rollback failed");
    let attempted = 0;
    const state = {
      running: false,
      terminal: {
        pendingTerminalCursors: async () => candidates,
        withTerminal: async () => {
          attempted++;
          controller.abort();
          throw failure;
        },
      },
    };
    const done = Reflect.apply(
      GenerationTerminalRecovery.prototype.recoverOnce,
      state,
      [controller.signal],
    ) as Promise<number>;
    await expect(done).rejects.toBe(failure);
    expect(attempted).toBe(1);
    expect(state.running).toBe(false);
  });

  it("advances past a full unresolved batch and retries it on the next sweep", async () => {
    const backlog = Array.from({ length: 81 }, (_, index) => ({
      generationId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      lastSequence: 0,
    }));
    const cursors: (string | undefined)[] = [];
    const attempted: string[] = [];
    const state = {
      running: false,
      terminal: {
        pendingTerminalCursors: async (
          limit: number,
          _signal: AbortSignal,
          after?: string,
        ) => {
          cursors.push(after);
          return backlog
            .filter((candidate) => !after || candidate.generationId > after)
            .slice(0, limit);
        },
        withTerminal: async (intent: { generationId: string }) => {
          attempted.push(intent.generationId);
          throw new Error("Unresolved original receipt; no scope issued");
        },
      },
    };
    for (let i = 0; i < 6; i++) {
      const pass = Reflect.apply(
        GenerationTerminalRecovery.prototype.recoverOnce,
        state,
        [new AbortController().signal, 20],
      ) as Promise<number>;
      await expect(pass).rejects.toMatchObject({
        code: "generation_terminal_recovery_incomplete",
      });
    }
    expect(cursors).toEqual([
      undefined,
      backlog[19]!.generationId,
      backlog[39]!.generationId,
      backlog[59]!.generationId,
      backlog[79]!.generationId,
      undefined,
    ]);
    expect(attempted.slice(0, 81)).toEqual(
      backlog.map((candidate) => candidate.generationId),
    );
    expect(attempted.slice(81)).toEqual(
      backlog.slice(0, 20).map((candidate) => candidate.generationId),
    );
  });

  it("keeps the last observed page position when discovery fails", async () => {
    const position = candidates[0]!.generationId;
    const failure = new Error("Discovery transport unavailable");
    const state = {
      running: false,
      afterGenerationId: position,
      terminal: {
        pendingTerminalCursors: async () => {
          throw failure;
        },
      },
    };
    const pass = Reflect.apply(
      GenerationTerminalRecovery.prototype.recoverOnce,
      state,
      [new AbortController().signal],
    ) as Promise<number>;
    await expect(pass).rejects.toBe(failure);
    expect(state.afterGenerationId).toBe(position);
    expect(state.running).toBe(false);
  });
});
