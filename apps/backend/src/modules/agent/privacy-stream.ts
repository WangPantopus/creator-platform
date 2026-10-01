import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { invariant } from "../../core/errors.js";
import type { AgentService } from "./service.js";
import type { CreatorScope } from "./repository.js";
import { generationJournalInstalled } from "./generation-journal.js";

/** Structural consumer of W8's immutable3240da0 PrivacyExportStream, returned
 * by PrivacyHook.run. The coordinator owns durable storage/verification/ack. */
export type AgentPrivacyExportStream = {
  snapshotRef: string;
  contentType: "application/octet-stream";
  chunks: AsyncIterable<{ sequence: number; data: Uint8Array }>;
  finish(): Promise<{
    complete: true;
    sourceExhausted: true;
    snapshotRef: string;
    chunks: number;
    bytes: number;
    sha256: string;
  }>;
};

/** One MVCC source snapshot across every authoritative owned creator. One
 * pending chunk provides backpressure; closing the iterator rolls back. */
export function agentExportStream(
  service: AgentService,
  scopes: readonly CreatorScope[],
  assertCurrent: () => Promise<void>,
  parentSignal?: AbortSignal,
): AgentPrivacyExportStream {
  const snapshotRef = `agent-export:${randomUUID()}`;
  const controller = new AbortController();
  const signal = AbortSignal.any([
    controller.signal,
    AbortSignal.timeout(45_000),
    ...(parentSignal ? [parentSignal] : []),
  ]);
  const hash = createHash("sha256");
  let bytes = 0;
  let count = 0;
  let started = false;
  let complete = false;
  let exhausted = false;
  let failure: unknown;
  let failed = false;
  let pending:
    | { sequence: number; data: Uint8Array; ack: () => void }
    | undefined;
  let wake: (() => void) | undefined;
  let rejectWrite: ((error: unknown) => void) | undefined;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const notify = () => {
    const current = wake;
    wake = undefined;
    current?.();
  };
  const abort = () => {
    rejectWrite?.(signal.reason);
    notify();
  };
  signal.addEventListener("abort", abort, { once: true });
  const buffer = Buffer.alloc(64 * 1024);
  let buffered = 0;
  const flush = async () => {
    if (!buffered) return;
    signal.throwIfAborted();
    await assertCurrent();
    const data = Buffer.from(buffer.subarray(0, buffered));
    buffered = 0;
    invariant(
      bytes + data.length <= 1024 * 1024 * 1024,
      "export_too_large",
      "Split this data request into bounded jobs.",
    );
    await new Promise<void>((resolve, reject) => {
      rejectWrite = reject;
      pending = {
        sequence: count,
        data,
        ack: () => {
          rejectWrite = undefined;
          resolve();
        },
      };
      hash.update(data);
      bytes += data.length;
      count++;
      notify();
    });
  };
  const write = async (part: string) => {
    const encoded = Buffer.from(part, "utf8");
    for (let offset = 0; offset < encoded.length; ) {
      signal.throwIfAborted();
      const take = Math.min(buffer.length - buffered, encoded.length - offset);
      encoded.copy(buffer, buffered, offset, offset + take);
      buffered += take;
      offset += take;
      if (buffered === buffer.length) await flush();
    }
  };
  const produce = async () => {
    let client: PoolClient | undefined;
    try {
      signal.throwIfAborted();
      await assertCurrent();
      client = await service.repository.pool.connect();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await client.query(
        "SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'",
      );
      // Current W2 lineage hooks must be composed before a full-domain stream
      // could omit an account's fan relationships or acknowledge thread data.
      invariant(
        !(await generationJournalInstalled(client)),
        "thread_accounting_privacy_unconfigured",
        "Register complete fan-accounting privacy before exporting this installed lineage schema.",
      );
      await write('{"schemaVersion":2,"creatorExports":[');
      let first = true;
      for (const scope of [...scopes].sort((a, b) =>
        a.creatorId.localeCompare(b.creatorId),
      )) {
        signal.throwIfAborted();
        await assertCurrent();
        await client.query(
          "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
          [scope.creatorId, scope.accountId],
        );
        // Holds current ownership through source exhaustion. A missing profile
        // fails; a verified owned profile without AI configuration is explicit.
        const owner = await client.query(
          "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
          [scope.creatorId, scope.accountId],
        );
        invariant(
          owner.rowCount && !scope.development,
          "privacy_owner_changed",
          "The current owned creator must match this verified export.",
        );
        await write(
          `${first ? "" : ","}{"creatorId":${JSON.stringify(scope.creatorId)},"data":`,
        );
        await service.exportInTransaction(scope, client, write, signal);
        await write("}");
        first = false;
      }
      await write("]}");
      await flush();
      signal.throwIfAborted();
      await assertCurrent();
      await client.query("COMMIT");
      complete = true;
    } catch (error) {
      failed = true;
      failure = error;
      if (client) await client.query("ROLLBACK").catch(() => undefined);
    } finally {
      client?.release();
      signal.removeEventListener("abort", abort);
      resolveDone();
      notify();
    }
  };
  const chunks = {
    async *[Symbol.asyncIterator]() {
      invariant(
        !started,
        "export_already_started",
        "Consume this source snapshot once.",
      );
      started = true;
      void produce();
      try {
        for (;;) {
          signal.throwIfAborted();
          if (pending) {
            const item = pending;
            yield { sequence: item.sequence, data: item.data };
            pending = undefined;
            item.ack();
          } else if (complete || failed) {
            if (failed) throw failure ?? new Error("Export source failed");
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
            new Error("Export consumption stopped before source exhaustion"),
          );
        await done;
      }
    },
  };
  let checksum: string | undefined;
  return {
    snapshotRef,
    contentType: "application/octet-stream",
    chunks,
    async finish() {
      invariant(
        started && exhausted && complete && !failed,
        "export_source_incomplete",
        "Only a fully consumed committed source snapshot can attest completion.",
      );
      signal.throwIfAborted();
      await assertCurrent();
      checksum ??= hash.digest("hex");
      return {
        complete: true,
        sourceExhausted: true,
        snapshotRef,
        chunks: count,
        bytes,
        sha256: checksum,
      };
    },
  };
}
