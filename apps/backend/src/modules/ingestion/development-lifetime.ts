import type { CreatorScope } from "../agent/repository.js";
import type { IngestionWorker } from "./worker.js";

/** Only the explicitly configured development creators reach this scheduler.
 * The original worker retains every lease, provider and accounting decision.
 * close() drains its actual work before the host may close the database pool. */
export function startDevelopmentIngestion(
  worker: IngestionWorker,
  creators: readonly CreatorScope[],
) {
  const owners = creators.map((creator) => Object.freeze({ ...creator }));
  const controller = new AbortController();
  let pending: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  const tick = async () => {
    for (const creator of owners) {
      if (controller.signal.aborted) break;
      try {
        await worker.tick(creator, controller.signal);
      } catch (cause) {
        // Ingestion settles its own interrupted provider/job before returning.
        // A later database/receipt failure must not become a successful stop.
        if (controller.signal.aborted) {
          if (cause !== controller.signal.reason) throw cause;
          break;
        }
        process.stderr.write(
          "Development source processing is unavailable; inspect the saved source state.\n",
        );
      }
    }
  };
  const timer = owners.length
    ? setInterval(() => {
        if (pending || controller.signal.aborted) return;
        pending = tick();
        void pending.then(
          () => {
            pending = undefined;
          },
          () => {
            // Retain the rejected original work for close(), with an attached
            // rejection observer so an OS signal cannot cause an unhandled one.
            if (timer) clearInterval(timer);
          },
        );
      }, 1000)
    : undefined;
  timer?.unref();
  return {
    close(): Promise<void> {
      if (closing) return closing;
      if (timer) clearInterval(timer);
      controller.abort();
      closing = pending ?? Promise.resolve();
      return closing;
    },
  };
}
