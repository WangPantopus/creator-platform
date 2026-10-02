import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canonical } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import type { PrivacyHook } from "../trust/contracts.js";
import type { PrivacyExportStream } from "../trust/privacy-export.js";
import {
  fenceConversationPrivacyTask,
  type ConversationPrivacyFamily,
  type ConversationPrivacyInput,
} from "./privacy.js";
import { PreparedConversationPrivacyCursor } from "./privacy-export-cursor.js";
import { writeConversationPrivacyCursor } from "./privacy-export-cursor-rows.js";

type Job = Parameters<PrivacyHook["run"]>[0];
const sorted = (families: readonly ConversationPrivacyFamily[]) =>
  [...families].sort((a, b) => a.threadId.localeCompare(b.threadId));

/** One actual leased job, one held MVCC source snapshot and one pending chunk.
 * The coordinator owns encrypted durable storage, verification and task ACK.
 * Source exhaustion is attested only after every page is consumed. */
export function conversationPrivacyExportStream(
  input: ConversationPrivacyInput,
  job: Job,
  families: readonly ConversationPrivacyFamily[],
  parentSignal: AbortSignal,
): PrivacyExportStream {
  const cursor = input.exportCursor;
  invariant(
    cursor instanceof PreparedConversationPrivacyCursor,
    "conversation_export_unconfigured",
    "The actual complete READ COMMITTED source cursor is required.",
  );
  cursor.assertRuntime(input);
  const snapshotRef = `conversation-export:${randomUUID()}`;
  const controller = new AbortController();
  const signal = AbortSignal.any([
    parentSignal,
    controller.signal,
    AbortSignal.timeout(45_000),
  ]);
  const scopeSnapshot = canonical(sorted(families));
  const assertCurrent = async () => {
    signal.throwIfAborted();
    invariant(
      canonical(sorted(await input.authority.families(job))) === scopeSnapshot,
      "privacy_authority_changed",
      "The actual leased conversation family set changed.",
    );
    signal.throwIfAborted();
  };
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(64 * 1024);
  let buffered = 0;
  let chunks = 0;
  let bytes = 0;
  let started = false;
  let committed = false;
  let exhausted = false;
  let failed = false;
  let failure: unknown;
  let pending: { sequence: number; data: Uint8Array; ack(): void } | undefined;
  let wake: (() => void) | undefined;
  let rejectWrite: ((error: unknown) => void) | undefined;
  let resolveDone!: () => void;
  let client: PoolClient | undefined;
  let clientReleased = false;
  let discardClient = false;
  const releaseClient = (destroy = false) => {
    if (client && !clientReleased) {
      clientReleased = true;
      cursor.forget(client);
      client.release(destroy);
    }
  };
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
    releaseClient(true);
    notify();
  };
  signal.addEventListener("abort", abort, { once: true });
  const flush = async () => {
    if (!buffered) return;
    await assertCurrent();
    invariant(
      client && !clientReleased,
      "export_source_incomplete",
      "The actual held export client is required.",
    );
    await cursor.assertCurrent(client, job, families);
    const data = Buffer.from(buffer.subarray(0, buffered));
    buffered = 0;
    invariant(
      bytes + data.length <= 1024 * 1024 * 1024,
      "export_too_large",
      "Split this complete export into bounded protected jobs.",
    );
    await new Promise<void>((resolve, reject) => {
      signal.throwIfAborted();
      rejectWrite = reject;
      pending = {
        sequence: chunks,
        data,
        ack() {
          rejectWrite = undefined;
          resolve();
        },
      };
      hash.update(data);
      bytes += data.length;
      chunks++;
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
    try {
      await assertCurrent();
      client = await input.pool.connect();
      signal.throwIfAborted();
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      await client.query(
        "SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='1s'; SET LOCAL idle_in_transaction_session_timeout='5s'",
      );
      await client.query(
        `SELECT set_config('app.account_id','',true),set_config('app.identity_session_id','',true),
         set_config('app.creator_id','',true),set_config('app.fan_id','',true),
         set_config('generation.scope_nonce','',true),set_config('generation.terminal_nonce','',true)`,
      );
      await cursor.open(client, job, families);
      const held = client;
      await writeConversationPrivacyCursor({
        next: () => cursor.next(held, job, families),
        write,
        families,
        signal,
      });
      await cursor.close(client, job, families);
      await flush();
      await assertCurrent();
      await cursor.assertCurrent(client, job, families);
      await fenceConversationPrivacyTask(input.authority, client, job);
      signal.throwIfAborted();
      await client.query("COMMIT");
      signal.throwIfAborted();
      committed = true;
    } catch (error) {
      failed = true;
      failure = error;
      if (client && !clientReleased)
        await client.query("ROLLBACK").catch(() => {
          discardClient = true;
        });
    } finally {
      releaseClient(discardClient);
      signal.removeEventListener("abort", abort);
      resolveDone();
      notify();
    }
  };
  let checksum: string | undefined;
  return {
    snapshotRef,
    contentType: "application/octet-stream",
    chunks: {
      async *[Symbol.asyncIterator]() {
        invariant(
          !started,
          "export_already_started",
          "Consume this actual source snapshot once.",
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
            } else if (committed || failed) {
              if (failed)
                throw failure ?? new Error("Conversation export source failed");
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
              new Error(
                "Conversation export consumption stopped before exhaustion",
              ),
            );
          await done;
        }
      },
    },
    async finish() {
      invariant(
        started && exhausted && committed && !failed,
        "export_source_incomplete",
        "Only the complete consumed source snapshot can attest completion.",
      );
      await assertCurrent();
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
