import type { Pool } from "pg";
import type { TrustTelemetry } from "./telemetry.js";

/** Aggregate cluster statistics only. The caller keeps its existing non-owner
 * pool/grants; unavailable views never become successful zero-valued samples. */
export class PostgresWalObserver {
  private stopped = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  constructor(
    readonly pool: Pool,
    readonly telemetry: TrustTelemetry,
  ) {}
  async start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.telemetry.observe("wal_sample_available", 0);
    this.telemetry.increment("wal_sample_errors", 0);
    this.running = this.sample();
    await this.running;
    this.running = undefined;
    this.schedule();
  }
  private schedule() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.running = this.sample().finally(() => {
        this.running = undefined;
        this.schedule();
      });
    }, 15_000);
    this.timer.unref();
  }
  private async sample() {
    try {
      const result = await this.pool.query<Record<string, unknown>>(`SELECT
        w.wal_records,w.wal_bytes,w.wal_buffers_full,
        extract(epoch FROM w.stats_reset) AS stats_reset_epoch,
        a.archived_count,a.failed_count,
        current_setting('archive_mode') IN ('on','always') AS archive_enabled
        FROM pg_stat_wal w CROSS JOIN pg_stat_archiver a`);
      const row = result.rows[0];
      if (result.rows.length !== 1 || !row)
        throw new Error("wal_snapshot_unavailable");
      const signals = {
        wal_records_total: counter(row.wal_records),
        wal_bytes_total: counter(row.wal_bytes),
        wal_buffers_full_total: counter(row.wal_buffers_full),
        wal_archived_total: counter(row.archived_count),
        wal_archive_failures_total: counter(row.failed_count),
        wal_stats_reset_epoch_seconds: timestamp(row.stats_reset_epoch),
        wal_archive_enabled: flag(row.archive_enabled),
        wal_sampled_at_epoch_seconds: Date.now() / 1000,
      };
      for (const [name, value] of Object.entries(signals))
        this.telemetry.observe(name, value);
      this.telemetry.increment("wal_samples_completed");
      this.telemetry.observe("wal_sample_available", 1);
    } catch {
      this.telemetry.increment("wal_sample_errors");
      this.telemetry.observe("wal_sample_available", 0);
    }
  }
  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.running;
  }
}

function counter(value: unknown) {
  if (
    !(
      typeof value === "number" ||
      (typeof value === "string" && /^\d+$/.test(value))
    )
  )
    throw new Error("wal_snapshot_unavailable");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0)
    throw new Error("wal_snapshot_unavailable");
  return result;
}
function flag(value: unknown) {
  if (value !== true && value !== false)
    throw new Error("wal_snapshot_unavailable");
  return value ? 1 : 0;
}
function timestamp(value: unknown) {
  if (
    !(
      typeof value === "number" ||
      (typeof value === "string" && /^\d+(\.\d+)?$/.test(value))
    )
  )
    throw new Error("wal_snapshot_unavailable");
  const result = Number(value);
  if (
    !Number.isFinite(result) ||
    result <= 0 ||
    result > Date.now() / 1000 + 60
  )
    throw new Error("wal_snapshot_unavailable");
  return result;
}
