import { z } from "zod";
import type { GrowthEventSource, GrowthEventSources } from "./relay.js";
import type { GrowthService } from "./service.js";
import { DomainError } from "../../core/errors.js";
import { copy } from "@qelvora/copy";

/** The canonical owner issues fresh scopes on each page. The cursor contains
 * only directory metadata; it cannot authorize a producer or its recipients. */
export interface GrowthSourceDirectory {
  page(input: { cursor: string | null; limit: number }): Promise<{
    sources: readonly GrowthEventSource[];
    nextCursor: string | null;
  }>;
}

/** Custody belongs to this worker's reserved scan namespace. Persisting the
 * checkpoint prevents frequent restarts from starving later directory pages. */
export interface GrowthSourceCheckpoint {
  load(): Promise<string | null>;
  save(cursor: string | null, expectedCursor: string | null): Promise<void>;
}

// One directory UUID only. Every scope and recipient is freshly issued;
// private text, serialized authority and credential-bearing cursors are refused.
const Cursor = z.uuid().nullable();

/** One bounded page per tick, rotating back only at explicit EOF. No actor or
 * ThreadScope is retained across ticks. A failed checkpoint never skips work. */
export function rotatingGrowthSources(
  directory: GrowthSourceDirectory,
  checkpoint: GrowthSourceCheckpoint,
  pageSize = 25,
): GrowthEventSources {
  const limit = z.int().min(1).max(100).parse(pageSize);
  let active = false;
  return async () => {
    if (active) throw new Error("producer_scan_already_running");
    active = true;
    try {
      const cursor = Cursor.parse(await checkpoint.load());
      const page = await directory.page({ cursor, limit });
      const next = Cursor.parse(page.nextCursor);
      if (page.sources.length > limit || (next !== null && next === cursor))
        throw new Error("producer_scope_page_invalid");
      // Each source still owns current-state authorization, durable pending
      // events and acknowledgment. Advancing discovery does not acknowledge
      // an event; failed sources remain discoverable on the following rotation.
      await checkpoint.save(next, cursor);
      return page.sources;
    } finally {
      active = false;
    }
  };
}

/** Worker-only encrypted directory metadata. Canonical producer authority still
 * comes from the directory, never from this checkpoint or its database role. */
export function databaseGrowthSourceCheckpoint(
  service: GrowthService,
  namespace = "owner-sources-v1",
): GrowthSourceCheckpoint {
  const name = z
    .string()
    .regex(/^[a-z0-9_-]{1,80}$/u)
    .parse(namespace);
  const record = z.strictObject({ namespace: z.literal(name), cursor: Cursor });
  let loadedGeneration: string | null = null;
  const read = (encrypted: string | null | undefined) =>
    encrypted ? record.parse(JSON.parse(service.open(encrypted))).cursor : null;
  async function requireSchema(client: import("pg").PoolClient) {
    const schema = await client.query(
      "SELECT to_regclass('growth.source_scan_checkpoint') IS NOT NULL AND (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='growth' AND table_name='source_scan_checkpoint' AND column_name IN ('generation','expires_at')) AS ready",
    );
    if (!schema.rows[0]?.ready)
      throw new DomainError(
        "growth_scan_migration_required",
        copy.growthErrorGrowthMigrationRequired,
        503,
      );
  }
  return {
    load: () =>
      service.db.transaction(service.db.worker, async (client) => {
        await requireSchema(client);
        await client.query(
          "UPDATE growth.source_scan_checkpoint SET encrypted_cursor=NULL,generation=generation+1,updated_at=now() WHERE namespace=$1 AND expires_at<=clock_timestamp() AND encrypted_cursor IS NOT NULL",
          [name],
        );
        const row = (
          await client.query<{
            encrypted_cursor: string | null;
            generation: string;
          }>(
            "SELECT encrypted_cursor,generation FROM growth.source_scan_checkpoint WHERE namespace=$1",
            [name],
          )
        ).rows[0];
        loadedGeneration = row?.generation ?? "0";
        return read(row?.encrypted_cursor);
      }),
    save: (cursor, expectedCursor) =>
      service.db.transaction(service.db.worker, async (client) => {
        const next = Cursor.parse(cursor),
          expected = Cursor.parse(expectedCursor);
        if (loadedGeneration === null)
          throw new Error("producer_scan_checkpoint_not_loaded");
        await requireSchema(client);
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`growth.source_scan:${name}`],
        );
        const row = (
          await client.query<{
            encrypted_cursor: string | null;
            generation: string;
          }>(
            "SELECT encrypted_cursor,generation FROM growth.source_scan_checkpoint WHERE namespace=$1 FOR UPDATE",
            [name],
          )
        ).rows[0];
        if (
          (row?.generation ?? "0") !== loadedGeneration ||
          read(row?.encrypted_cursor) !== expected
        )
          throw new Error("producer_scan_checkpoint_changed");
        await client.query(
          "INSERT INTO growth.source_scan_checkpoint(namespace,encrypted_cursor) VALUES($1,$2) ON CONFLICT(namespace) DO UPDATE SET encrypted_cursor=excluded.encrypted_cursor,generation=growth.source_scan_checkpoint.generation+1,updated_at=now(),expires_at=now()+interval '24 hours'",
          [
            name,
            service.seal(JSON.stringify({ namespace: name, cursor: next })),
          ],
        );
        loadedGeneration = null;
      }),
  };
}
