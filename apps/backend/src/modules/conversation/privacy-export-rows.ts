import type { PoolClient } from "pg";
import type { ConversationPrivacyFamily } from "./privacy.js";
import { invariant } from "../../core/errors.js";

type ExportTable =
  | "message"
  | "memory"
  | "thread_audit"
  | "processor_consent"
  | "memory_consent"
  | "conversation_usage_day"
  | "event"
  | "memory_exclusion"
  | "generation"
  | "conversation_feedback";

/** Source-owned SQL projections only. This is a reader of an already verified
 * family on the caller's held snapshot; it never issues a ThreadScope. */
export async function writeConversationExportRows(input: {
  client: PoolClient;
  family: ConversationPrivacyFamily;
  table: ExportTable;
  projection: string;
  key: string;
  predicate?: string;
  write(part: string): Promise<void>;
  assertCurrent(): Promise<void>;
  signal: AbortSignal;
  map?: (row: Record<string, unknown>) => unknown;
}) {
  const pair = [
    input.family.threadId,
    input.family.creatorId,
    input.family.fanId,
  ];
  let cursor: string | null = null;
  let first = true;
  let count = 0;
  await input.write("[");
  for (;;) {
    input.signal.throwIfAborted();
    await input.assertCurrent();
    const page: { cursor: string; document: Record<string, unknown> }[] = (
      await input.client.query<{
        cursor: string;
        document: Record<string, unknown>;
      }>(
        `SELECT (${input.key}) COLLATE "C" AS cursor,
         (SELECT row_to_json(projected) FROM (SELECT ${input.projection}) projected) AS document
         FROM creator.${input.table} WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3
         ${input.predicate ? `AND (${input.predicate})` : ""}
         AND ($4::text IS NULL OR (${input.key}) COLLATE "C">$4::text COLLATE "C")
         ORDER BY cursor LIMIT 50`,
        [...pair, cursor],
      )
    ).rows;
    if (!page.length) break;
    for (const row of page) {
      input.signal.throwIfAborted();
      await input.write(
        `${first ? "" : ","}${JSON.stringify(input.map ? input.map(row.document) : row.document)}`,
      );
      first = false;
      count++;
      invariant(
        Number.isSafeInteger(count),
        "export_too_large",
        "Export row counts must remain exact.",
      );
    }
    cursor = page[page.length - 1]!.cursor;
  }
  input.signal.throwIfAborted();
  await input.assertCurrent();
  await input.write("]");
  return count;
}
