import { Client, type Pool, type PoolClient, type QueryConfig } from "pg";
import { DomainError } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";

// Installed pg supports a per-query read deadline. Its QueryConfig declaration
// omits that option, so retain the supported option in this structural type.
function control(
  client: PoolClient,
  text: string,
): QueryConfig & { query_timeout: number } {
  // pg uses the query override before its actual connection read budget.
  // Preserve a shorter positive original budget, including a numeric string
  // in the connection configuration, rather than extending it to this ceiling.
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
  private cancelling: Promise<void> | undefined;
  private sourcePid: number | undefined;
  private readonly cancellationFailures: unknown[] = [];
  private readonly aborted: Promise<never>;
  private rejectAbort!: (reason: unknown) => void;

  private readonly onError = (error: Error) => {
    this.transportFailure ??= error;
    this.discard = true;
  };
  private readonly abort = () => {
    this.discard = true;
    void this.cancelAndClose();
    this.rejectAbort(this.signal?.reason);
  };

  constructor(
    readonly client: PoolClient,
    private readonly signal?: AbortSignal,
    private readonly sourcePool?: Pool,
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

  /** A socket close alone does not interrupt a server waiting on a lock. The
   * optional original pool supplies only its existing cancellation credential;
   * the PID is observed on the actual held client before starting its work. */
  private cancelAndClose(): Promise<void> {
    return (this.cancelling ??= (async () => {
      try {
        if (this.sourcePool && this.sourcePid !== undefined) {
          const original = Number(
            this.sourcePool.options.connectionTimeoutMillis,
          );
          const controller = new Client({
            ...this.sourcePool.options,
            connectionTimeoutMillis:
              Number.isFinite(original) && original > 0
                ? Math.min(original, 1500)
                : 1500,
            statement_timeout: 1500,
            query_timeout: control(this.client, "").query_timeout,
            pipeline: false,
          });
          const onError = (error: Error) =>
            this.cancellationFailures.push(error);
          controller.on("error", onError);
          try {
            await controller.connect();
            const result = await controller.query<{ cancelled: boolean }>(
              "SELECT pg_cancel_backend($1) AS cancelled",
              [this.sourcePid],
            );
            if (result.rows[0]?.cancelled !== true)
              throw new DomainError(
                "content_privacy_cancel_unavailable",
                "The actual held privacy source could not be cancelled.",
                503,
              );
          } catch (error) {
            this.cancellationFailures.push(error);
          } finally {
            await controller.end().catch(onError);
            controller.removeListener("error", onError);
          }
        }
      } finally {
        await this.close();
      }
    })().catch((error: unknown) => {
      this.cancellationFailures.push(error);
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
    if (this.sourcePool) {
      const source = await this.run(() =>
        this.client.query(
          control(this.client, "SELECT pg_backend_pid() AS pid"),
        ),
      );
      const pid: unknown = source.rows[0]?.pid;
      if (typeof pid !== "number" || !Number.isSafeInteger(pid) || pid <= 0)
        throw new DomainError(
          "content_privacy_cancel_unavailable",
          "The original held source PID is required for cancellation.",
          503,
        );
      this.sourcePid = pid;
    }
    const result = await this.run(() =>
      this.client.query(control(this.client, "BEGIN")),
    );
    if (result.command !== "BEGIN")
      throw new DomainError(
        "content_privacy_begin_unavailable",
        "The original Content transaction could not begin.",
        503,
      );
    this.transaction = true;
    this.discard = false;
  }

  async commit(): Promise<void> {
    // Uncertain BEGIN/COMMIT cannot be followed by another SQL command.
    this.discard = true;
    const result = await this.run(() =>
      this.client.query(control(this.client, "COMMIT")),
    );
    if (result.command !== "COMMIT")
      throw new DomainError(
        "content_privacy_commit_unavailable",
        "The actual Content commit receipt is required.",
        503,
      );
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
          const result = await this.client.query(
            control(this.client, "ROLLBACK"),
          );
          if (result.command !== "ROLLBACK")
            throw new DomainError(
              "content_privacy_rollback_unavailable",
              "The actual Content rollback receipt is required.",
              503,
            );
          this.transaction = false;
        } catch (error) {
          this.discard = true;
          errors.push(error);
        }
      }
      this.discard ||= this.signal?.aborted === true;
      if (this.cancelling) await this.cancelling;
      if (this.discard || this.ending) await this.close();
      // Cancellation can arrive while an uncertain source close is pending.
      if (this.cancelling) await this.cancelling;
      errors.push(...this.cancellationFailures);
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
