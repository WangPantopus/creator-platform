import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { RequestHandler } from "express";

const buckets = [50, 100, 300, 500, 1000, 2500, 4000, 10000];
export class TrustTelemetry {
  readonly startedAt = new Date();
  private readonly values = new Map<string, number>();
  private readonly durations = new Map<
    string,
    { count: number; sum: number; buckets: number[] }
  >();
  private readonly lag = monitorEventLoopDelay({ resolution: 20 });
  constructor(
    readonly environment: string,
    readonly release: string,
    readonly write: (line: string) => void = (line) =>
      process.stdout.write(line + "\n"),
  ) {
    this.lag.enable();
  }
  observe(name: string, value: number) {
    if (/^[a-z_]{1,60}$/.test(name) && Number.isFinite(value))
      this.values.set(name, value);
  }
  increment(name: string, amount = 1) {
    if (/^[a-z_]{1,60}$/.test(name) && Number.isFinite(amount) && amount >= 0)
      this.values.set(name, (this.values.get(name) ?? 0) + amount);
  }
  middleware(): RequestHandler {
    return (req, res, next) => {
      if (res.locals.trustInstrumented) return next();
      res.locals.trustInstrumented = true;
      const start = performance.now();
      const incoming = req.header("x-correlation-id");
      const correlation =
        incoming && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(incoming)
          ? incoming
          : randomUUID();
      res.locals.correlationId = correlation;
      res.setHeader("X-Correlation-Id", correlation);
      res.setHeader("X-Request-Id", randomUUID());
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.on("finish", () => {
        const route = String(req.route?.path ?? "unmatched");
        const duration = performance.now() - start;
        const key = `${req.method}:${route}:${Math.floor(res.statusCode / 100)}xx`;
        const measure = this.durations.get(key) ?? {
          count: 0,
          sum: 0,
          buckets: buckets.map(() => 0),
        };
        measure.count++;
        measure.sum += duration;
        buckets.forEach((b, i) => {
          if (duration <= b) measure.buckets[i] = (measure.buckets[i] ?? 0) + 1;
        });
        if (this.durations.size < 120 || this.durations.has(key))
          this.durations.set(key, measure);
        this.write(
          JSON.stringify({
            timestamp: new Date().toISOString(),
            level: res.statusCode >= 500 ? "error" : "info",
            environment: this.environment,
            release: this.release,
            correlationId: correlation,
            method: req.method,
            route,
            status: res.statusCode,
            errorCode: res.locals.errorCode ?? null,
            failureClass: res.locals.failureClass ?? null,
            durationMs: Math.round(duration * 100) / 100,
          }),
        );
      });
      next();
    };
  }
  snapshot() {
    return {
      environment: this.environment,
      release: this.release,
      startedAt: this.startedAt,
      uptimeSeconds: process.uptime(),
      memoryBytes: process.memoryUsage(),
      eventLoopLagMs: {
        p95: this.lag.percentile(95) / 1e6,
        p99: this.lag.percentile(99) / 1e6,
      },
      signals: Object.fromEntries(this.values),
      http: Object.fromEntries(this.durations),
    };
  }
  close() {
    this.lag.disable();
  }
}
