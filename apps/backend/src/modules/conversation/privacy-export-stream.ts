import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AuthorKind } from "@qelvora/api";
import { canonical } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import type { PrivacyHook } from "../trust/contracts.js";
import type { PrivacyExportStream } from "../trust/privacy-export.js";
import { generationJournalInstalled } from "../agent/generation-journal.js";
import {
  conversationAuthorLabel,
  type ConversationPrivacyFamily,
  type ConversationPrivacyInput,
} from "./privacy.js";
import { writeConversationExportRows } from "./privacy-export-rows.js";

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
  const flush = async () => {
    if (!buffered) return;
    await assertCurrent();
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
    let client: PoolClient | undefined;
    try {
      await assertCurrent();
      client = await input.pool.connect();
      signal.throwIfAborted();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
      await client.query(
        "SET LOCAL timezone='UTC'; SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='5s'",
      );
      invariant(
        !(await generationJournalInstalled(client)) || input.accounting,
        "conversation_accounting_unavailable",
        "Installed accounting requires its complete prepared export port.",
      );
      await write('{"schemaVersion":2,"threadExports":[');
      let first = true;
      for (const family of sorted(families)) {
        signal.throwIfAborted();
        const held = client;
        const assertFamily = async () => {
          signal.throwIfAborted();
          await input.authority.assertFamily(held, job, family);
          signal.throwIfAborted();
        };
        await assertFamily();
        const thread = (
          await held.query(
            `SELECT t.id,t.creator_id,t.fan_id,t.control,t.control_epoch,t.revision,t.deleted_at,t.off_the_record,t.intro_shared,t.memory_revision,t.human_active_until,t.last_activity_at,t.session_started_at,t.last_reminder_at,cp.display_name
             FROM creator.thread t JOIN creator.creator_profile cp ON cp.id=t.creator_id
             WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 FOR SHARE OF t`,
            [family.threadId, family.creatorId, family.fanId],
          )
        ).rows[0];
        invariant(
          thread,
          "privacy_family_unavailable",
          "The actual verified family is unavailable.",
        );
        await write(`${first ? "" : ","}{"thread":${JSON.stringify(thread)}`);
        first = false;
        const counts: Record<string, unknown> = {};
        if (input.accounting) {
          await write(',"accounting":');
          counts.accounting = await input.accounting.exportMetadataTo(
            held,
            job,
            family,
            write,
            signal,
          );
        }
        if (input.lineage) {
          await write(',"lineage":');
          counts.lineage = await input.lineage.exportMetadataTo(
            held,
            family,
            write,
            assertFamily,
            signal,
          );
        }
        if (input.recordings) {
          await write(',"recordings":');
          counts.recordings = await input.recordings.exportMetadataTo(
            held,
            family,
            write,
            assertFamily,
            signal,
          );
        }
        for (const [name, table, projection, key] of [
          [
            "messages",
            "message",
            'id,author_kind AS "authorKind",text,delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,version,signed_act_id AS "signedActId",signed_content_hash AS "signedContentHash",author_account_id AS "authorAccountId",citations,team_member AS member,off_the_record AS "offTheRecord",created_at AS "createdAt"',
            "lpad(sequence::text,10,'0')||':'||id::text",
          ],
          [
            "memories",
            "memory",
            "id,kind,text,state,semantic_key,provenance_message_id,sensitive_category,edited_by_fan,created_at",
            "id::text",
          ],
          [
            "audit",
            "thread_audit",
            "id,reader_account_id,role,read_at",
            "id::text",
          ],
          [
            "consents",
            "processor_consent",
            "id,version,providers,consented_at,withdrawn_at",
            "id::text",
          ],
          [
            "memoryConsents",
            "memory_consent",
            "id,item_id,item_hash,category,consented_at,withdrawn_at",
            "id::text",
          ],
          [
            "usageDays",
            "conversation_usage_day",
            "day,seconds,companion_seconds",
            "day::text",
          ],
          [
            "events",
            "event",
            "id,cursor,type,payload,actor_account_id,created_at,published_at",
            "lpad(cursor::text,10,'0')||':'||id::text",
          ],
          [
            "exclusions",
            "memory_exclusion",
            "semantic_key,normalized_text",
            "semantic_key",
          ],
          [
            "generations",
            "generation",
            "id,fan_message_id,ai_message_id,grant_id,reservation_id,epoch,last_sequence,state,context_revision,accepted_at,first_visible_at,completed_at,failure_code",
            "id::text",
          ],
        ] as const) {
          await write(`,${JSON.stringify(name)}:`);
          counts[name] = await writeConversationExportRows({
            client: held,
            family,
            table,
            projection,
            key,
            write,
            signal,
            assertCurrent: assertFamily,
            ...(name === "messages"
              ? {
                  map: (row: Record<string, unknown>) => ({
                    ...row,
                    authorLabel: conversationAuthorLabel(
                      row.authorKind as AuthorKind,
                      thread.display_name,
                      typeof row.member === "string" ? row.member : null,
                    ),
                  }),
                }
              : {}),
          });
        }
        await assertFamily();
        await write(`,"sourceCounts":${JSON.stringify(counts)}}`);
      }
      await write("]}");
      await flush();
      await assertCurrent();
      for (const family of sorted(families)) {
        signal.throwIfAborted();
        await input.authority.assertFamily(client, job, family);
      }
      signal.throwIfAborted();
      await client.query("COMMIT");
      committed = true;
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
