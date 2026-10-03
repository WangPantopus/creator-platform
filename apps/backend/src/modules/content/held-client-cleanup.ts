import type { PoolClient, QueryConfig } from "pg";
import { querySettlementUncertain } from "../../core/query-settlement.js";

// Installed pg supports a per-query read deadline. Its QueryConfig declaration
// omits that option, so retain the supported option in this structural type.
function control(text: string): QueryConfig & { query_timeout: number } {
  return { text, query_timeout: 1500 };
}

/** Settlement only: this wrapper issues no task, actor or export permission.
 * The original borrowed client stays held until rollback or socket close ends.
 */
export class ContentHeldClient {
  private transaction = false;
  private discard = false;
  private settled = false;
  private transportFailure: unknown;
  private closeFailure: unknown;
  private ending: Promise<void> | undefined;
  private readonly aborted: Promise<never>;
  private rejectAbort!: (reason: unknown) => void;

  private readonly onError = (error: Error) => {
    this.transportFailure ??= error;
    this.discard = true;
  };
  private readonly abort = () => {
    this.discard = true;
    void this.close();
    this.rejectAbort(this.signal?.reason);
  };

  constructor(
    readonly client: PoolClient,
    private readonly signal?: AbortSignal,
  ) {
    this.aborted = new Promise<never>((_, reject) => {
      this.rejectAbort = reject;
    });
    // An abort can arrive between operations. Keep its rejection handled while
    // the finalizer awaits this same original client's close.
    void this.aborted.catch(() => {});
    client.on("error", this.onError);
    signal?.addEventListener("abort", this.abort, { once: true });
    if (signal?.aborted) this.abort();
  }

  private close(): Promise<void> {
    return (this.ending ??= this.client.end().catch((error: unknown) => {
      this.closeFailure = error;
    }));
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    this.signal?.throwIfAborted();
    if (this.settled || this.ending || this.client.pipeline)
      throw new Error("The original non-pipelined Content client is required.");
    try {
      const result = await Promise.race([operation(), this.aborted]);
      this.signal?.throwIfAborted();
      if (this.transportFailure !== undefined) throw this.transportFailure;
      return result;
    } catch (error) {
      this.discard ||= querySettlementUncertain(error);
      throw error;
    }
  }

  async begin(): Promise<void> {
    this.discard = true;
    await this.run(() => this.client.query(control("BEGIN")));
    this.transaction = true;
    this.discard = false;
  }

  async commit(): Promise<void> {
    // Uncertain BEGIN/COMMIT cannot be followed by another SQL command.
    this.discard = true;
    await this.run(() => this.client.query(control("COMMIT")));
    this.transaction = false;
    this.discard = false;
  }

  async settle(failure?: unknown): Promise<void> {
    if (this.settled) throw new Error("Content client was already settled.");
    this.settled = true;
    const errors: unknown[] = [];
    this.discard ||=
      this.signal?.aborted === true || querySettlementUncertain(failure);
    try {
      if (this.transaction && !this.discard) {
        try {
          await this.client.query(control("ROLLBACK"));
          this.transaction = false;
        } catch (error) {
          this.discard = true;
          errors.push(error);
        }
      }
      this.discard ||= this.signal?.aborted === true;
      if (this.discard || this.ending) await this.close();
      for (const error of [this.transportFailure, this.closeFailure])
        if (error !== undefined && !errors.includes(error)) errors.push(error);
    } finally {
      this.signal?.removeEventListener("abort", this.abort);
      this.client.removeListener("error", this.onError);
      try {
        this.client.release(this.discard);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(
        failure === undefined ? errors : [failure, ...errors],
        "Original Content operation and client settlement failed.",
      );
  }
}
