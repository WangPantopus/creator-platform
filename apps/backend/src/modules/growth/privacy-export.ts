import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { GrowthService } from "./service.js";

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
  creatorId?: string;
  sql: string;
  value: string;
  map?: (row: Record<string, unknown>) => unknown;
};

/** Called only after W8's current leased task/ownership proof has been verified.
 * No source LIMIT/OFFSET, public artifact, device token or third-party Thanks. */
export function growthAccountExport(
  service: GrowthService,
  accountId: string,
  ownedCreators: readonly string[],
  signal: AbortSignal,
): GrowthPrivacyExportStream {
  const snapshotRef = randomUUID();
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
  for (const creatorId of [...new Set(ownedCreators)].sort()) {
    for (const table of [
      "content_public",
      "insight_snapshot",
      "insight_window",
      "recommendation",
      "instagram_reply",
      "experiment",
    ])
      sources.push({
        collection: table,
        creatorId,
        sql: `SELECT * FROM growth.${table} WHERE creator_id=$1`,
        value: creatorId,
      });
    sources.push(
      {
        collection: "impact",
        creatorId,
        sql: "SELECT creator_id,window_start,unique_fans,ai_conversations,personal_replies,notes,thanks_count FROM growth.impact WHERE creator_id=$1",
        value: creatorId,
      },
      {
        collection: "profile",
        creatorId,
        sql: "SELECT document FROM growth.creator_public WHERE id=$1",
        value: creatorId,
      },
    );
  }
  const hash = createHash("sha256");
  let started = false,
    complete = false,
    chunks = 0,
    bytes = 0,
    sha256 = "";
  function* encode(record: unknown) {
    const buffer = Buffer.from(`${JSON.stringify(record)}\n`, "utf8");
    // A large JSON row can span chunks; concatenation retains valid NDJSON.
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
    let released = false;
    const destroy = () => {
      if (client && !released) {
        released = true;
        // Closing the dedicated connection also releases every session fence,
        // including when the consumer is paused or abandons an aborted iterator.
        client.release(true);
      }
    };
    try {
      client = await service.db.worker.connect();
      signal.addEventListener("abort", destroy, { once: true });
      signal.throwIfAborted();
      await client.query("SET statement_timeout='5000'");
      await client.query("SET lock_timeout='2000'");
      await service.erasure.lockExportSnapshot(
        client,
        accountId,
        ownedCreators,
      );
      signal.throwIfAborted();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      if (!(await service.erasure.subjects(client, [accountId], ownedCreators)))
        throw new Error("growth_data_erased");
      yield* encode({
        format: "growth-account-export-v1",
        snapshotRef,
        sources: sources.map(({ collection, creatorId }) => ({
          collection,
          ...(creatorId ? { creatorId } : {}),
        })),
      });
      for (let index = 0; index < sources.length; index++) {
        signal.throwIfAborted();
        const source = sources[index]!;
        // Names/SQL come only from the internal fixed source list above.
        const cursor = `growth_export_${index}`;
        await client.query(
          `DECLARE ${cursor} NO SCROLL CURSOR FOR ${source.sql}`,
          [source.value],
        );
        for (;;) {
          signal.throwIfAborted();
          const page = await client.query(`FETCH FORWARD 100 FROM ${cursor}`);
          // Explicit EOF, including after a short nonempty page, for every source.
          if (page.rows.length === 0) break;
          for (const row of page.rows)
            yield* encode({
              collection: source.collection,
              ...(source.creatorId ? { creatorId: source.creatorId } : {}),
              data: source.map ? source.map(row) : row,
            });
        }
        await client.query(`CLOSE ${cursor}`);
      }
      signal.throwIfAborted();
      await client.query("COMMIT");
      signal.throwIfAborted();
      sha256 = hash.digest("hex");
      complete = true;
    } finally {
      signal.removeEventListener("abort", destroy);
      destroy();
    }
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
