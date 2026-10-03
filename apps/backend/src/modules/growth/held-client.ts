import type { PoolClient } from "pg";

/** Retains the original borrowed client through rollback or physical shutdown.
 * Cleanup supplies no session, purpose, ownership or privacy authority. */
export class GrowthHeldClient {
  private transactionStarted = false;
  private uncertain = false;
  private transportFailure: Error | undefined;
  private shutdown: Promise<void> | undefined;
  private shutdownFailure: unknown;
  private shutdownFailed = false;
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
    if (this.shutdown) throw new Error("growth_client_closed");
  }

  async begin(sql = "BEGIN") {
    this.assertCurrent();
    if (this.client.pipeline)
      throw new Error("growth_nonpipeline_client_required");
    this.uncertain = true;
    await this.client.query(sql);
    this.transactionStarted = true;
    this.assertCurrent();
    this.uncertain = false;
  }

  async commit() {
    this.assertCurrent();
    this.uncertain = true;
    await this.client.query("COMMIT");
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

  async close(input: { destroy?: boolean; failure?: unknown } = {}) {
    const errors: unknown[] = [];
    if (input.destroy || this.uncertain || this.signal?.aborted) this.destroy();
    try {
      if (this.transactionStarted && !this.shutdown) {
        try {
          await this.client.query("ROLLBACK");
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
