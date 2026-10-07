import type { PoolClient, QueryConfig } from "pg";
import { querySettlementUncertain } from "../../core/query-settlement.js";

// Bound control response reads without extending a shorter original pg budget.
// The installed pg runtime supports this option despite QueryConfig omitting it.
function control(
  client: PoolClient,
  text: string,
): QueryConfig & { query_timeout: number } {
  const original = (
      client as PoolClient & {
        connectionParameters?: { query_timeout?: unknown };
      }
    ).connectionParameters?.query_timeout,
    budget =
      typeof original === "number" || typeof original === "string"
        ? Number(original)
        : NaN;
  return {
    text,
    query_timeout:
      Number.isFinite(budget) && budget > 0 ? Math.min(budget, 1500) : 1500,
  };
}

/** Retains the original borrowed client through rollback or physical shutdown.
 * Cleanup supplies no session, purpose, ownership or privacy authority. */
export class GrowthHeldClient {
  private transactionStarted = false;
  private uncertain = false;
  private transportFailure: Error | undefined;
  private shutdown: Promise<void> | undefined;
  private shutdownFailure: unknown;
  private shutdownFailed = false;
  private closing: Promise<void> | undefined;
  private readonly onError = (error: Error) => {
    this.transportFailure ??= error;
    this.destroy();
  };
  private readonly onAbort = () => this.destroy();

  constructor(
    readonly client: PoolClient,
    private readonly signal?: AbortSignal,
  ) {
    client.on("error", this.onError);
    signal?.addEventListener("abort", this.onAbort, { once: true });
    if (signal?.aborted) this.destroy();
  }

  assertCurrent() {
    this.signal?.throwIfAborted();
    if (this.transportFailure) throw this.transportFailure;
    if (this.shutdown || this.closing) throw new Error("growth_client_closed");
  }

  async begin(sql = "BEGIN") {
    this.assertCurrent();
    if (this.client.pipeline)
      throw new Error("growth_nonpipeline_client_required");
    this.uncertain = true;
    const result = await this.client.query(control(this.client, sql));
    if (result.command !== "BEGIN")
      throw new Error("growth_begin_receipt_required");
    this.transactionStarted = true;
    this.assertCurrent();
    this.uncertain = false;
  }

  async commit() {
    this.assertCurrent();
    this.uncertain = true;
    const result = await this.client.query(control(this.client, "COMMIT"));
    if (result.command !== "COMMIT")
      throw new Error("growth_commit_receipt_required");
    this.transactionStarted = false;
    this.assertCurrent();
    this.uncertain = false;
  }

  private destroy() {
    this.uncertain = true;
    if (this.shutdown) return;
    // pg's non-pipeline end interrupts an active query. Await the same shutdown
    // in close before releasing pool custody or attesting export completion.
    try {
      this.shutdown = this.client.end().catch((error: unknown) => {
        this.shutdownFailed = true;
        this.shutdownFailure = error;
      });
    } catch (error) {
      this.shutdownFailed = true;
      this.shutdownFailure = error;
      this.shutdown = Promise.resolve();
    }
  }

  close(input: { destroy?: boolean; failure?: unknown } = {}) {
    // A worker may settle while its enclosing session is still held. The
    // outer finalizer awaits the same receipt without releasing twice.
    return (this.closing ??= this.settle(input));
  }

  private async settle(input: { destroy?: boolean; failure?: unknown }) {
    const errors: unknown[] = [];
    if (
      input.destroy ||
      this.uncertain ||
      this.signal?.aborted ||
      querySettlementUncertain(input.failure)
    )
      this.destroy();
    try {
      if (this.transactionStarted && !this.shutdown) {
        try {
          const result = await this.client.query(
            control(this.client, "ROLLBACK"),
          );
          if (result.command !== "ROLLBACK")
            throw new Error("growth_rollback_receipt_required");
          this.transactionStarted = false;
        } catch (error) {
          errors.push(error);
          this.destroy();
        }
      }
      if (this.shutdown) await this.shutdown;
      if (this.transportFailure && !errors.includes(this.transportFailure))
        errors.push(this.transportFailure);
      if (this.shutdownFailed) errors.push(this.shutdownFailure);
    } finally {
      this.signal?.removeEventListener("abort", this.onAbort);
      this.client.removeListener("error", this.onError);
      try {
        this.client.release(this.shutdown !== undefined);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(
        input.failure === undefined ? errors : [input.failure, ...errors],
        "Growth held-client cleanup failed",
      );
  }
}
