import { createHash } from "node:crypto";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import {
  conversationAuthorLabel,
  type ConversationPrivacyFamily,
} from "./privacy.js";
import type { ConversationPrivacyCursorRow } from "./privacy-export-cursor.js";

// Ordinals match the fixed, independently reviewed0206 SELECT. Empty source
// collections remain explicit arrays, including families with no messages.
const Names = [
  "thread",
  "ai_generation_admission",
  "ai_generation_attempt",
  "ai_generation_receipt",
  "ai_usage",
  "receiptNotifications",
  "lineageMessages",
  "lineageFeedback",
  "recordings",
  "messages",
  "memories",
  "audit",
  "consents",
  "memoryConsents",
  "usageDays",
  "events",
  "exclusions",
  "generations",
] as const;
const Author = z.enum([
  "fan",
  "ai",
  "approved_draft",
  "human_creator",
  "human_call",
  "human_broadcast",
  "human_reaction",
  "team",
  "system",
]);
const Header = z
  .object({
    id: z.uuid(),
    creator_id: z.uuid(),
    fan_id: z.uuid(),
    display_name: z.string(),
  })
  .passthrough();

/** Serialize the one actual cursor, preserving the complete schema2 domain
 * shape. A short page never means EOF; source exhaustion requires an actual
 * empty fetch and every original family header. Application memory holds only
 * one16-row page, one row's encoded JSON and the caller's pending64KiB chunk. */
export async function writeConversationPrivacyCursor(input: {
  next(): Promise<ConversationPrivacyCursorRow[]>;
  write(part: string): Promise<void>;
  families: readonly ConversationPrivacyFamily[];
  signal: AbortSignal;
}): Promise<void> {
  const expected = [...input.families].sort((a, b) =>
    a.threadId.localeCompare(b.threadId),
  );
  let familyIndex = -1;
  let current: z.infer<typeof Header> | undefined;
  let collection = 0;
  let counts: number[] = [];
  let lastKey: Buffer | undefined;
  let accountingHash = createHash("sha256");
  let accountingBytes = 0;
  let accounting = false;
  let accountingReceipt: unknown;
  const write = async (part: string) => {
    input.signal.throwIfAborted();
    await input.write(part);
    if (accounting) {
      accountingHash.update(part, "utf8");
      accountingBytes += Buffer.byteLength(part, "utf8");
    }
  };
  const open = async (rank: number) => {
    if (rank === 1) {
      await write(',"accounting":');
      accounting = true;
      await write('{"schemaVersion":1,"records":{');
      await write(`${JSON.stringify(Names[rank])}:[`);
    } else if (rank <= 5) await write(`,${JSON.stringify(Names[rank])}:[`);
    else if (rank === 6) await write(',"lineage":{"messages":[');
    else if (rank === 7) await write(',"feedback":[');
    else await write(`,${JSON.stringify(Names[rank])}:[`);
    collection = rank;
    lastKey = undefined;
  };
  const close = async () => {
    await write("]");
    if (collection === 5) {
      await write("}}");
      accounting = false;
      accountingReceipt = {
        schemaVersion: 1,
        counts: Object.fromEntries(
          Names.slice(1, 6).map((name, i) => [name, counts[i + 1]!]),
        ),
        bytes: accountingBytes,
        sha256: accountingHash.digest("hex"),
      };
    } else if (collection === 7) await write("}");
  };
  const finishFamily = async () => {
    if (!current) return;
    while (collection < 17) {
      await close();
      await open(collection + 1);
    }
    await close();
    await write(
      `,"sourceCounts":${JSON.stringify({
        accounting: accountingReceipt,
        lineage: { messages: counts[6], feedback: counts[7] },
        recordings: counts[8],
        ...Object.fromEntries(
          Names.slice(9).map((name, i) => [name, counts[i + 9]]),
        ),
      })}}`,
    );
  };
  await write('{"schemaVersion":2,"threadExports":[');
  for (;;) {
    input.signal.throwIfAborted();
    const page = await input.next();
    if (page.length === 0) break;
    for (const row of page) {
      input.signal.throwIfAborted();
      if (row.collection === 0) {
        const family = expected[++familyIndex];
        const header = Header.parse(JSON.parse(row.document));
        invariant(
          family &&
            row.row_key === "" &&
            row.thread_id === family.threadId &&
            row.creator_id === family.creatorId &&
            row.fan_id === family.fanId &&
            header.id === family.threadId &&
            header.creator_id === family.creatorId &&
            header.fan_id === family.fanId,
          "conversation_export_family_changed",
          "Each original authorized family needs its exact source header.",
        );
        await finishFamily();
        current = header;
        counts = Array<number>(18).fill(0);
        accountingHash = createHash("sha256");
        accountingBytes = 0;
        accountingReceipt = undefined;
        await write(`${familyIndex === 0 ? "" : ","}{"thread":${row.document}`);
        await open(1);
      } else {
        const key = Buffer.from(row.row_key, "utf8");
        invariant(
          current &&
            row.thread_id === current.id &&
            row.creator_id === current.creator_id &&
            row.fan_id === current.fan_id &&
            row.collection >= collection &&
            (row.collection !== collection ||
              !lastKey ||
              Buffer.compare(key, lastKey) > 0),
          "conversation_export_source_changed",
          "Consume each fixed source collection once in its original byte order.",
        );
        while (collection < row.collection) {
          await close();
          await open(collection + 1);
        }
        let document = row.document;
        if (row.collection === 9) {
          // This fixed message projection has only32-bit integer fields.
          // Accounting/events retain raw source JSON instead of JS numbers.
          const message: Record<string, unknown> = JSON.parse(row.document);
          document = JSON.stringify({
            ...message,
            authorLabel: conversationAuthorLabel(
              Author.parse(message.authorKind),
              current.display_name,
              typeof message.member === "string" ? message.member : null,
            ),
          });
        }
        await write(`${counts[collection] === 0 ? "" : ","}${document}`);
        counts[collection]!++;
        invariant(
          Number.isSafeInteger(counts[collection]),
          "export_too_large",
          "Complete source counts must remain exact.",
        );
        lastKey = key;
      }
    }
  }
  invariant(
    familyIndex + 1 === expected.length,
    "conversation_export_source_incomplete",
    "Source exhaustion must include every original authorized family.",
  );
  await finishFamily();
  await write("]}");
}
