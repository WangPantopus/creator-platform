import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { GrowthService } from "./service.js";
import type { GrowthPrivacyHeldAuthority } from "./lifecycle.js";
import { GrowthHeldClient } from "./held-client.js";

/** Structural consumer of W8's published 3240da0 PrivacyExportStream port.
 * The protected W8 coordinator owns lease checks, storage and download authority. */
export type GrowthPrivacyExportStream = {
  snapshotRef: string;
  contentType: "application/x-ndjson";
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
type Source = {
  collection: string;
  creatorColumn?: "creator_id" | "id";
  sql: string;
  value: string | readonly string[];
  map?: (row: Record<string, unknown>) => unknown;
};
const sourceRowBytes = 256 * 1024;
const sourceFetchRows = 16;
const encodedRecordBytes = 512 * 1024;

/** W8's exact task/ownership/restoration proof is held on this worker client.
 * No source LIMIT/OFFSET, public artifact, device token or third-party Thanks. */
export function growthAccountExport(
  service: GrowthService,
  accountId: string,
  signal: AbortSignal,
  assertAuthority: GrowthPrivacyHeldAuthority,
): GrowthPrivacyExportStream {
  const snapshotRef = randomUUID();
  function sourcesFor(ownedCreators: readonly string[]): Source[] {
    const sources: Source[] = [
      ...[
        "follow",
        "preference",
        "notification",
        "share",
        "metric",
        "feedback",
        "prompt_choice",
        "entry_attribution",
      ].map((table) => ({
        collection: table,
        sql: `SELECT * FROM growth.${table} WHERE account_id=$1`,
        value: accountId,
      })),
      {
        collection: "invites",
        sql: "SELECT * FROM growth.invite WHERE created_by=$1",
        value: accountId,
      },
      {
        collection: "activation",
        sql: "SELECT * FROM growth.activation_job WHERE creator_account_id=$1",
        value: accountId,
      },
      {
        collection: "devices",
        sql: "SELECT installation_id,platform,permission,revoked_at,updated_at FROM growth.device WHERE account_id=$1",
        value: accountId,
      },
      {
        collection: "email",
        sql: "SELECT encrypted_address,verified_at,bounced_at,unsubscribed_at FROM growth.email WHERE account_id=$1",
        value: accountId,
        map: (row) => ({
          address: service.open(row.encrypted_address as string),
          verifiedAt: row.verified_at,
          bouncedAt: row.bounced_at,
          unsubscribedAt: row.unsubscribed_at,
        }),
      },
      {
        collection: "delivery",
        sql: "SELECT id,notification_id,channel,state,attempts,available_at FROM growth.delivery WHERE account_id=$1",
        value: accountId,
      },
      {
        collection: "deliveryReceipts",
        // A receipt belongs to the account through its original delivery.
        // Registration hashes identify devices and stay outside the export.
        sql: "SELECT receipt.delivery_id,receipt.state,receipt.provider_ref,receipt.updated_at FROM growth.provider_receipt receipt JOIN growth.delivery delivery ON delivery.id=receipt.delivery_id WHERE delivery.account_id=$1",
        value: accountId,
      },
      {
        collection: "insightSignals",
        sql: "SELECT id,creator_id,topic_key,window_start,unresolved,version FROM growth.insight_signal WHERE subject_key=$1",
        value: service.privacySubjectKey(accountId),
      },
      {
        collection: "thanks",
        sql: "SELECT creator_id,window_start,quote->>'id' AS id,quote->>'text' AS text,quote->>'displayName' AS display_name FROM growth.impact CROSS JOIN LATERAL jsonb_array_elements(consented_thanks) quote WHERE quote->>'subjectKey'=$1",
        value: service.privacySubjectKey(accountId),
      },
    ];
    if (ownedCreators.length > 0) {
      for (const table of [
        "creator_profile_fields",
        "content_public",
        "insight_snapshot",
        "insight_window",
        "recommendation",
        "instagram_reply",
        "experiment",
      ])
        sources.push({
          collection: table,
          creatorColumn: "creator_id",
          sql: `SELECT * FROM growth.${table} WHERE creator_id=ANY($1::uuid[])`,
          value: ownedCreators,
        });
      sources.push(
        {
          collection: "impact",
          creatorColumn: "creator_id",
          sql: "SELECT creator_id,window_start,unique_fans,ai_conversations,personal_replies,notes,thanks_count FROM growth.impact WHERE creator_id=ANY($1::uuid[])",
          value: ownedCreators,
        },
        {
          collection: "profile",
          creatorColumn: "id",
          sql: "SELECT id,document FROM growth.creator_public WHERE id=ANY($1::uuid[])",
          value: ownedCreators,
          map: (row) => ({ document: row.document }),
        },
      );
    }
    return sources;
  }
  const hash = createHash("sha256");
  let started = false,
    complete = false,
    chunks = 0,
    bytes = 0,
    sha256 = "";
  function* encode(record: unknown) {
    const encoded = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(encoded, "utf8") > encodedRecordBytes)
      throw new Error("growth_export_record_capacity");
    const buffer = Buffer.from(encoded, "utf8");
    for (let offset = 0; offset < buffer.length; offset += 512 * 1024) {
      signal.throwIfAborted();
      const data = buffer.subarray(offset, offset + 512 * 1024);
      hash.update(data);
      bytes += data.byteLength;
      yield { sequence: chunks++, data };
    }
  }
  async function* read() {
    signal.throwIfAborted();
    let client: PoolClient | undefined;
    let held: GrowthHeldClient | undefined;
    let failure: unknown;
    let sourceComplete = false;
    try {
      client = await service.db.worker.connect();
      held = new GrowthHeldClient(client, signal);
      await held.begin("BEGIN ISOLATION LEVEL READ COMMITTED READ WRITE");
      await client.query(
        "SELECT set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)",
      );
      // Current task/restoration custody comes before erasure/domain locks.
      const ownedCreators = await assertAuthority(client);
      const sources = sourcesFor(ownedCreators);
      signal.throwIfAborted();
      if (!(await service.erasure.subjects(client, [accountId], ownedCreators)))
        throw new Error("growth_data_erased");
      await assertAuthority(client);
      // One fixed-source SELECT snapshot spans every collection. Independent
      // READ COMMITTED bookends still see current lease/restoration state.
      // Both SQL and column names come solely from the internal list above.
      const query = sources
        .map(
          (source, index) => `
        SELECT ${index}::integer AS export_index,export_creator_id,
          CASE WHEN octet_length(convert_to(export_json::text,'UTF8')) <= ${sourceRowBytes}
            THEN export_json ELSE NULL END AS export_data
        FROM (SELECT ${source.creatorColumn ? `export_source.${source.creatorColumn}::text` : "NULL::text"} AS export_creator_id,
          row_to_json(export_source) AS export_json
          FROM (${source.sql.replaceAll("$1", `$${index + 1}`)}) export_source) bounded_source
      `,
        )
        .join(" UNION ALL ");
      await client.query(
        `DECLARE growth_export NO SCROLL CURSOR FOR ${query}`,
        sources.map((source) => source.value),
      );
      await assertAuthority(client);
      yield* encode({
        format: "growth-account-export-v1",
        snapshotRef,
        sources: sources.flatMap(({ collection, creatorColumn }) =>
          creatorColumn
            ? ownedCreators.map((creatorId) => ({ collection, creatorId }))
            : [{ collection }],
        ),
      });
      for (;;) {
        signal.throwIfAborted();
        await assertAuthority(client);
        const page = await client.query<{
          export_index: number;
          export_creator_id: string | null;
          export_data: Record<string, unknown> | null;
        }>(`FETCH FORWARD ${sourceFetchRows} FROM growth_export`);
        await assertAuthority(client);
        // Require an explicit empty FETCH, including after a short page.
        if (page.rows.length === 0) break;
        for (const row of page.rows) {
          const source = sources[row.export_index];
          if (!source) throw new Error("growth_export_source_invalid");
          const data = row.export_data;
          if (data === null) throw new Error("growth_export_record_capacity");
          if (
            source.creatorColumn &&
            !ownedCreators.includes(row.export_creator_id ?? "")
          )
            throw new Error("growth_export_source_invalid");
          yield* encode({
            collection: source.collection,
            ...(source.creatorColumn
              ? { creatorId: row.export_creator_id }
              : {}),
            data: source.map ? source.map(data) : data,
          });
        }
      }
      await client.query("CLOSE growth_export");
      signal.throwIfAborted();
      await assertAuthority(client);
      // W8's deferred trigger checks the exact binding and wall-clock lease
      // during this separate COMMIT. No completion survives a refused commit.
      await held.commit();
      signal.throwIfAborted();
      sha256 = hash.digest("hex");
      sourceComplete = true;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      // This dedicated export client is always destroyed, including early
      // iterator return. No incomplete source survives cleanup or is reused.
      await held?.close({ destroy: true, failure });
    }
    signal.throwIfAborted();
    complete = sourceComplete;
  }
  return {
    snapshotRef,
    contentType: "application/x-ndjson",
    chunks: {
      [Symbol.asyncIterator]() {
        if (started) throw new Error("growth_export_already_consumed");
        started = true;
        return read();
      },
    },
    async finish() {
      signal.throwIfAborted();
      if (!complete) throw new Error("growth_export_incomplete");
      return {
        complete: true,
        sourceExhausted: true,
        snapshotRef,
        chunks,
        bytes,
        sha256,
      };
    },
  };
}
