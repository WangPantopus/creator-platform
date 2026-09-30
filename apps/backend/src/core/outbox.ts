import type { PoolClient } from "pg";
import { FrameSchema, type Frame } from "@qelvora/api";
import type { ThreadScope } from "../modules/access/scope.js";
import type { Database } from "../db/database.js";

/** The thread lock orders every boundary and every sentence on one durable channel. */
export async function appendFrame(
  client: PoolClient,
  scope: ThreadScope,
  frame: Omit<Frame, "threadId" | "cursor">,
): Promise<Frame> {
  const next = await client.query<{ event_cursor: number }>(
    "UPDATE creator.thread SET event_cursor=event_cursor+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 RETURNING event_cursor",
    [scope.threadId, scope.creatorId, scope.fanId],
  );
  const output = FrameSchema.parse({
    ...frame,
    threadId: scope.threadId,
    cursor: next.rows[0]!.event_cursor,
  });
  await client.query(
    "INSERT INTO creator.event(thread_id,creator_id,fan_id,cursor,type,payload,actor_account_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      scope.threadId,
      scope.creatorId,
      scope.fanId,
      output.cursor,
      output.kind,
      JSON.stringify(output),
      scope.actorAccountId,
    ],
  );
  return output;
}

export class OutboxRelay {
  constructor(private readonly db: Database) {}
  /** Consumers deduplicate by eventId; a crash after delivery safely replays the same event. */
  async relay(
    scope: ThreadScope,
    publish: (event: { eventId: string; frame: Frame }) => Promise<void>,
    limit = 64,
  ): Promise<number> {
    return this.db.withThread(scope, async (client) => {
      // Lock the aggregate first. Concurrent relay workers cannot publish later cursors first.
      await client.query(
        "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
        [scope.threadId, scope.creatorId, scope.fanId],
      );
      const pending = await client.query<{ id: string; payload: Frame }>(
        "SELECT id,payload FROM creator.event WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND published_at IS NULL ORDER BY cursor LIMIT $4 FOR UPDATE",
        [scope.threadId, scope.creatorId, scope.fanId, limit],
      );
      for (const event of pending.rows) {
        await publish({ eventId: event.id, frame: event.payload });
        await client.query(
          "UPDATE creator.event SET published_at=now() WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4",
          [event.id, scope.threadId, scope.creatorId, scope.fanId],
        );
      }
      return pending.rows.length;
    });
  }
}
