import { createHash, randomUUID } from "node:crypto";
import { invariant } from "../../core/errors.js";
import type { PrivacyHook } from "../trust/contracts.js";
import type { PrivacyExportStream } from "../trust/privacy-export.js";
import { stageCommerceFinancial } from "./financial-export.js";
import {
  assertCommercePrivacyScope,
  type CommercePrivacyAuthority,
} from "./privacy-purpose.js";
import type { CommerceService } from "./service.js";

/** One actual financial snapshot, one pending chunk, and no external writer
 * callback. Trust owns durable staging, verification and publication. Iterator
 * cancellation rejects the pending write and drains the original SQL owner. */
export function commerceFinancialExportStream(
  service: CommerceService,
  authority: CommercePrivacyAuthority,
  input: Parameters<PrivacyHook["run"]>[0],
): PrivacyExportStream {
  invariant(
    input.signal && input.kind === "export",
    "privacy_lease_required",
    "Use the original export task and cancellation signal.",
  );
  const controller = new AbortController();
  const signal = AbortSignal.any([
    input.signal,
    controller.signal,
    AbortSignal.timeout(45_000),
  ]);
  const job = { ...input, signal };
  const snapshotRef = `commerce-export:${randomUUID()}`;
  const hash = createHash("sha256");
  let chunks = 0;
  let bytes = 0;
  let started = false;
  let settled = false;
  let exhausted = false;
  let failed = false;
  let failure: unknown;
  let checksum: string | undefined;
  let pending:
    | { sequence: number; data: Uint8Array; acknowledge(): void }
    | undefined;
  let rejectWrite: ((reason: unknown) => void) | undefined;
  let wake: (() => void) | undefined;
  let production: Promise<void> | undefined;
  const notify = () => {
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };
  const abort = () => {
    rejectWrite?.(signal.reason);
    notify();
  };
  const write = async (value: unknown) => {
    const encoded = Buffer.from(JSON.stringify(value) + "\n", "utf8");
    for (let offset = 0; offset < encoded.length; offset += 64 * 1024) {
      signal.throwIfAborted();
      const data = Buffer.from(encoded.subarray(offset, offset + 64 * 1024));
      invariant(
        bytes + data.length <= 1024 * 1024 * 1024,
        "artifact_too_large",
        "This complete export exceeds the protected artifact limit.",
      );
      await new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        rejectWrite = reject;
        pending = {
          sequence: chunks,
          data,
          acknowledge() {
            rejectWrite = undefined;
            resolve();
          },
        };
        hash.update(data);
        bytes += data.length;
        chunks++;
        notify();
      });
    }
  };
  const produce = async () => {
    signal.addEventListener("abort", abort, { once: true });
    try {
      signal.throwIfAborted();
      await authority.withPrivacyJob(job, async (scope) => {
        const { writer, manifest } = await stageCommerceFinancial(
          service,
          scope,
          job,
          async (sourceSignal) => {
            // The actual transaction's deadline also cancels pending delivery.
            const sourceAbort = () => controller.abort(sourceSignal.reason);
            sourceSignal.addEventListener("abort", sourceAbort, { once: true });
            const assertCurrent = async () => {
              sourceSignal.throwIfAborted();
              signal.throwIfAborted();
              assertCommercePrivacyScope(scope, service.pool, job);
            };
            try {
              await assertCurrent();
              await write({
                schemaVersion: 1,
                domain: "commerce",
                jobId: job.jobId,
                scope: job.scope,
                snapshotRef,
              });
            } catch (error) {
              sourceSignal.removeEventListener("abort", sourceAbort);
              throw error;
            }
            return {
              assertCurrent,
              async write(collection, rows) {
                await assertCurrent();
                await write({ collection, rows });
                await assertCurrent();
              },
              async abort() {
                sourceSignal.removeEventListener("abort", sourceAbort);
              },
              dispose() {
                sourceSignal.removeEventListener("abort", sourceAbort);
              },
            };
          },
        );
        // Every collection reached a real empty fetch and the original source
        // returned COMMIT before this footer. This is not an artifact receipt.
        try {
          await write({ complete: true, ...manifest });
        } finally {
          writer.dispose();
        }
      });
      signal.throwIfAborted();
    } catch (error) {
      failed = true;
      failure = error;
    } finally {
      signal.removeEventListener("abort", abort);
      settled = true;
      notify();
    }
  };
  const drain = async () => {
    await production;
    // A deliberate iterator stop may use its own abort reason. Original SQL
    // or cleanup failures still have to reach the coordinator after draining.
    if (failed && failure !== signal.reason) throw failure;
  };
  return {
    snapshotRef,
    contentType: "application/x-ndjson",
    chunks: {
      async *[Symbol.asyncIterator]() {
        invariant(
          !started,
          "export_already_started",
          "Consume this original financial snapshot once.",
        );
        started = true;
        production = produce();
        try {
          for (;;) {
            signal.throwIfAborted();
            if (failed) throw failure;
            if (pending) {
              const chunk = pending;
              yield { sequence: chunk.sequence, data: chunk.data };
              pending = undefined;
              chunk.acknowledge();
            } else if (settled) {
              exhausted = true;
              return;
            } else
              await new Promise<void>((resolve) => {
                wake = resolve;
              });
          }
        } finally {
          if (!exhausted)
            controller.abort(
              new Error("Financial export stopped before source exhaustion."),
            );
          await drain();
        }
      },
    },
    async finish() {
      signal.throwIfAborted();
      invariant(
        started && settled && exhausted && !failed,
        "export_source_incomplete",
        "Only the consumed and committed original financial source can complete.",
      );
      checksum ??= hash.digest("hex");
      return {
        complete: true,
        sourceExhausted: true,
        snapshotRef,
        chunks,
        bytes,
        sha256: checksum,
      };
    },
  };
}
