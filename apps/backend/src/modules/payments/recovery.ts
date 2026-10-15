import type { Pool } from "pg";
import type { PantopusIdentityAdapter } from "../identity/adapter.js";
import type { CommerceService } from "../commerce/service.js";
import { CommerceRecoveryWorker, type CommerceWorkIndex } from "./inbox.js";
import { DevelopmentCommerceWorkIndex } from "./development-work-index.js";

/**
 * The commerce scheduler: one recovery pass at a time, every `intervalMs`, so
 * that expiry, release, late-delivery refunds and crash recovery happen without
 * anyone tapping. A host starts it after its graph is composed and closes it on
 * shutdown; a pass that is running is awaited, never abandoned.
 */
export function createCommerceRecovery(input: {
  service: CommerceService;
  index: CommerceWorkIndex;
  /** A non-owner pool that may claim provider notifications; omit to rely on the due scan. */
  inbox?: Pool;
  intervalMs?: number;
  onError?: (cause: unknown) => void;
}) {
  const worker = new CommerceRecoveryWorker(
    input.inbox,
    input.service,
    input.index,
  );
  const intervalMs = input.intervalMs ?? 15_000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: Promise<void> | undefined;
  let closed = false;
  const run = () => {
    if (closed || pending) return;
    pending = worker
      .tick()
      .catch((cause: unknown) => input.onError?.(cause))
      .finally(() => {
        pending = undefined;
      });
  };
  return {
    worker,
    start() {
      if (closed || timer) return;
      run();
      timer = setInterval(run, intervalMs);
      timer.unref();
    },
    async close() {
      closed = true;
      if (timer) clearInterval(timer);
      await pending;
    },
  };
}

/** The development host's scheduler: scopes come from the development identity adapter. */
export async function createDevelopmentCommerceRecovery(input: {
  service: CommerceService;
  pool: Pool;
  identity: PantopusIdentityAdapter;
  inbox?: Pool;
  intervalMs?: number;
  report?: (line: string) => void;
}) {
  const report =
    input.report ?? ((line: string) => process.stderr.write(`${line}\n`));
  const index = await DevelopmentCommerceWorkIndex.create(
    input.pool,
    input.identity,
    report,
  );
  return createCommerceRecovery({
    service: input.service,
    index,
    ...(input.inbox ? { inbox: input.inbox } : {}),
    ...(input.intervalMs ? { intervalMs: input.intervalMs } : {}),
    onError: () =>
      report(
        JSON.stringify({
          event: "commerce_recovery_pass_failed",
          at: new Date().toISOString(),
        }),
      ),
  });
}
