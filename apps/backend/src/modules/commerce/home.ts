import type { PoolClient } from "pg";
import { z } from "zod";
import { copy } from "@qelvora/copy";
import type { Actor } from "../identity/adapter.js";
import type { AccessService } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import type { HomeEntry } from "../growth/contracts.js";
import type { CommerceService } from "./service.js";
import { DomainError, invariant } from "../../core/errors.js";

const Position = z.strictObject({
  version: z.literal(1),
  fanId: z.uuid(),
  activityAt: z.iso.datetime(),
  packetId: z.uuid(),
});
const pageSize = 50;
const activity =
  "to_char(p.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"')";
export type CommerceHomeEntry = HomeEntry & { cursor: string };
function encodePosition(position: z.infer<typeof Position>) {
  return Buffer.from(JSON.stringify(Position.parse(position))).toString(
    "base64url",
  );
}

/** W8 holds the actual account's current denials on the directory transaction,
 * before any family is resolved. Family reads separately use issued W1 scopes.
 * Missing authority is unavailable, never an empty successful Home. */
export type CommerceHomeAccountAuthority = (
  client: PoolClient,
  actor: Actor,
) => Promise<void>;

/** Actual fan-owned request metadata with full-precision keyset pagination.
 * No text, disclosure, amount, bank/store reference, signature or approval is
 * selected. A directory pointer grants nothing: every result is reauthorized
 * in its genuine family through Access and Database before it is returned. */
export async function createCommerceHomePage(input: {
  service: CommerceService;
  access: AccessService;
  database: Database;
  migration: { version: string; checksum: string };
  assertAccountAllowed: CommerceHomeAccountAuthority;
}) {
  invariant(
    input.database.pool === input.service.pool &&
      input.access.isForPool(input.service.pool) &&
      input.access.threadScopeInTransactionAvailable &&
      input.database.threadScopeInTransactionAvailable &&
      typeof input.assertAccountAllowed === "function" &&
      input.migration.version === "0166_w4_fan_request_page_index" &&
      /^[a-f0-9]{64}$/u.test(input.migration.checksum),
    "commerce_home_unconfigured",
    "Home requests need the canonical activity index and held current account authority.",
  );
  await input.database.assertRuntimeRole();
  const ready = (
    await input.service.pool.query<{ ready: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND EXISTS(SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
        JOIN pg_namespace n ON n.oid=idx.relnamespace
        WHERE n.nspname='creator' AND idx.relname='commerce_packet_home_activity'
         AND i.indrelid='creator.commerce_packet'::regclass AND i.indisvalid AND i.indisready
         AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=3
         AND pg_get_indexdef(i.indexrelid,1,true)='fan_id'
         AND pg_get_indexdef(i.indexrelid,2,true)='updated_at'
         AND pg_get_indexdef(i.indexrelid,3,true)='id'
         AND i.indoption='0 3 3'::int2vector) AS ready`,
      [input.migration.version, input.migration.checksum],
    )
  ).rows[0]?.ready;
  invariant(
    ready,
    "commerce_home_unconfigured",
    "The exact bounded request activity index is not installed.",
  );
  return async (
    actor: Actor,
    cursor?: string,
  ): Promise<{
    entries: CommerceHomeEntry[];
    nextCursor: string | null;
    order: "activity";
  }> => {
    let position: z.infer<typeof Position> | undefined;
    if (cursor !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]{1,256}$/u.test(cursor)) throw new Error();
        position = Position.parse(
          JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
        );
      } catch {
        throw new DomainError(
          "commerce_home_cursor_invalid",
          "Refresh Home before continuing through requests.",
          400,
        );
      }
    }
    const directory = await input.service.account(actor, async (client) => {
      await input.assertAccountAllowed(client, actor);
      const fan = (
        await client.query<{ id: string }>(
          "SELECT id FROM creator.fan_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0];
      invariant(
        fan && (!position || position.fanId === fan.id),
        "commerce_home_cursor_invalid",
        "Use Home for your current account.",
      );
      const rows = (
        await client.query<{
          id: string;
          creator_id: string;
          fan_id: string;
          thread_id: string;
          activity_at: string;
        }>(
          `SELECT p.id,p.creator_id,p.fan_id,p.thread_id,${activity} AS activity_at
           FROM creator.commerce_packet p WHERE p.fan_id=$1
           ${position ? "AND (p.updated_at,p.id)<($2::timestamptz,$3::uuid)" : ""}
           ORDER BY p.updated_at DESC,p.id DESC LIMIT ${pageSize + 1}`,
          position
            ? [fan.id, position.activityAt, position.packetId]
            : [fan.id],
        )
      ).rows;
      await input.assertAccountAllowed(client, actor);
      return { fanId: fan.id, rows };
    });
    const candidates = directory.rows.slice(0, pageSize);
    const entries: CommerceHomeEntry[] = [];
    for (const candidate of candidates) {
      try {
        const scope = await input.access.openThread(
          actor,
          candidate.creator_id,
          candidate.fan_id,
          false,
        );
        invariant(
          scope.authority === "fan" && scope.threadId === candidate.thread_id,
          "commerce_home_scope_invalid",
          "This request is outside your current conversation.",
        );
        const row = await input.database.withThread(
          scope,
          async (client) =>
            (
              await client.query<{
                state: string;
                payment_state: string;
                commitment_state: string | null;
                creator_name: string;
                activity_at: string;
              }>(
                `SELECT p.state,p.payment_state,c.state AS commitment_state,cp.display_name AS creator_name,
                 ${activity} AS activity_at FROM creator.commerce_packet p
                 JOIN creator.creator_profile cp ON cp.id=p.creator_id AND cp.account_id=$5
                 LEFT JOIN creator.commerce_commitment c ON c.packet_id=p.id AND c.creator_id=p.creator_id AND c.fan_id=p.fan_id
                 WHERE p.id=$1 AND p.thread_id=$2 AND p.creator_id=$3 AND p.fan_id=$4
                  AND cp.verification='verified' AND NOT cp.recovery_required AND p.state<>'draft'`,
                [
                  candidate.id,
                  scope.threadId,
                  scope.creatorId,
                  scope.fanId,
                  scope.creatorAccountId,
                ],
              )
            ).rows[0],
          "read",
        );
        // A pointer which moved during current family authorization belongs to
        // the next fresh Home visit, not this page's older keyset position.
        if (!row || row.activity_at !== candidate.activity_at) continue;
        const state =
          row.payment_state === "unknown"
            ? "confirming payment"
            : (row.commitment_state ?? row.state).replaceAll("_", " ");
        entries.push({
          id: candidate.id,
          creatorId: scope.creatorId,
          creatorName: row.creator_name,
          label: copy.growthSystem,
          preview: `${copy.requestUpdate} · ${state}`,
          destination: `/commerce/status?packetId=${candidate.id}`,
          updatedAt: row.activity_at,
          kind: "request",
          cursor: encodePosition({
            version: 1,
            fanId: directory.fanId,
            activityAt: candidate.activity_at,
            packetId: candidate.id,
          }),
        });
      } catch (error) {
        // A deleted or denied family can briefly remain in the directory.
        // Infrastructure/authority failures must remain visible to the host.
        if (error instanceof DomainError && error.code === "thread_unavailable")
          continue;
        throw error;
      }
    }
    const last = candidates.at(-1);
    return {
      entries,
      nextCursor:
        directory.rows.length > pageSize && last
          ? encodePosition({
              version: 1,
              fanId: directory.fanId,
              activityAt: last.activity_at,
              packetId: last.id,
            })
          : null,
      order: "activity",
    };
  };
}
