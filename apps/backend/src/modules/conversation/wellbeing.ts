import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import type { ThreadScope } from "../access/scope.js";
import { invariant } from "../../core/errors.js";
import { formatCopy } from "@qelvora/copy";

/** W2 supplies the current verified live mode under the same transaction. */
export type ConversationMode = (
  scope: ThreadScope,
  client: PoolClient,
) => Promise<"expert" | "companion" | "blend">;
export class ConversationWellbeing {
  constructor(
    private readonly db: Database,
    private readonly mode?: ConversationMode,
  ) {}
  async presence(scope: ThreadScope, active: boolean, clientId: string) {
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can record their conversation time.",
    );
    await this.db.withThread(scope, async (client) => {
      const pair = [scope.threadId, scope.creatorId, scope.fanId];
      const thread = (
        await client.query(
          "SELECT control FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
          pair,
        )
      ).rows[0]!;
      await client.query(
        "SELECT set_config('app.w3_presence_time',clock_timestamp()::text,true)",
      );
      await client.query("SELECT set_config('TimeZone','UTC',true)");
      const query = (sql: string, values: unknown[]) =>
        client.query(
          sql.replaceAll(
            "now()",
            "current_setting('app.w3_presence_time')::timestamptz",
          ),
          values,
        );
      await query(
        "DELETE FROM creator.conversation_presence_client WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND (until_at<now() OR (client_id=$4 AND $5::boolean))",
        [...pair, clientId, !active],
      );
      if (active && thread.control === "ai_active") {
        const clients = (
          await query(
            "SELECT client_id FROM creator.conversation_presence_client WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 LIMIT 33",
            pair,
          )
        ).rows;
        invariant(
          clients.length < 32 ||
            clients.some((row) => row.client_id === clientId),
          "presence_limit",
          "Too many active conversation devices. Close an unused conversation and retry.",
        );
        await query(
          "INSERT INTO creator.conversation_presence_client(thread_id,creator_id,fan_id,client_id,until_at) VALUES($1,$2,$3,$4,now()+interval '40 seconds') ON CONFLICT(thread_id,client_id) DO UPDATE SET until_at=excluded.until_at",
          [...pair, clientId],
        );
      }
      const nextUntil = (
        await query(
          "SELECT max(until_at) AS until FROM creator.conversation_presence_client WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND until_at>=now()",
          pair,
        )
      ).rows[0]!.until;
      const mode =
        thread.control === "ai_active"
          ? await this.mode?.(scope, client)
          : undefined;
      const companion = mode === "companion" || mode === "blend";
      // Concurrent devices share one aggregate lock. Credit only the observed,
      // server-timed interval; an expired foreground lease resets continuity.
      const previous = (
        await query(
          "SELECT last_at::text AS start,until_at>=now() AS current,last_companion FROM creator.conversation_presence WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
          pair,
        )
      ).rows[0];
      if (previous?.current && thread.control === "ai_active") {
        await query(
          `INSERT INTO creator.conversation_usage_day(thread_id,creator_id,fan_id,day,seconds,companion_seconds)
          SELECT $1,$2,$3,(d AT TIME ZONE 'UTC')::date,
            extract(epoch FROM least(now(),d+interval '1 day')-greatest($4::timestamptz,d)),
            CASE WHEN $5::boolean THEN extract(epoch FROM least(now(),d+interval '1 day')-greatest($4::timestamptz,d)) ELSE 0 END
          FROM generate_series(date_trunc('day',$4::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',interval '1 day') d
          ON CONFLICT(thread_id,day) DO UPDATE SET
            seconds=least(86400,conversation_usage_day.seconds+excluded.seconds),
            companion_seconds=least(86400,conversation_usage_day.seconds+excluded.seconds,conversation_usage_day.companion_seconds+excluded.companion_seconds)`,
          [...pair, previous.start, previous.last_companion && companion],
        );
      }
      await query(
        `INSERT INTO creator.conversation_presence(thread_id,creator_id,fan_id,last_at,until_at,last_companion)
        VALUES($1,$2,$3,now(),coalesce($5::timestamptz,now()-interval '1 microsecond'),$4)
        ON CONFLICT(thread_id) DO UPDATE SET
          continuous_seconds=CASE WHEN $6::boolean AND conversation_presence.until_at>=now() THEN conversation_presence.continuous_seconds+least(40,greatest(0,extract(epoch FROM now()-conversation_presence.last_at))) ELSE 0 END,
          reminder_seconds=CASE WHEN $6::boolean AND conversation_presence.until_at>=now() THEN conversation_presence.reminder_seconds ELSE 0 END,
          last_at=now(),until_at=excluded.until_at,last_companion=excluded.last_companion`,
        [
          ...pair,
          companion,
          thread.control === "ai_active" ? nextUntil : null,
          thread.control === "ai_active" && nextUntil !== null,
        ],
      );
    });
    return this.usage(scope);
  }
  /** The caller holds the thread lock. A speaker/consent boundary ends every
   * foreground lease, while preserving daily totals and the once-a-day signal. */
  async boundary(scope: ThreadScope, client: PoolClient): Promise<void> {
    const values = [scope.threadId, scope.creatorId, scope.fanId];
    await client.query(
      "DELETE FROM creator.conversation_presence_client WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
      values,
    );
    await client.query(
      "UPDATE creator.conversation_presence SET continuous_seconds=0,reminder_seconds=0,last_at=clock_timestamp(),until_at=clock_timestamp()-interval '1 microsecond',last_companion=false WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
      values,
    );
  }
  async usage(scope: ThreadScope) {
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can view their conversation time.",
    );
    return this.db.withThread(scope, async (client) => {
      const days = (
        await client.query(
          'SELECT day::text AS day,seconds,"companion_seconds" AS "companionSeconds" FROM creator.conversation_usage_day WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND day >= (now() AT TIME ZONE \'UTC\')::date-6 ORDER BY day LIMIT 7',
          [scope.threadId, scope.creatorId, scope.fanId],
        )
      ).rows;
      return {
        timezone: "UTC",
        days,
        modeAvailable: Boolean(this.mode),
        measurement:
          "Estimated foreground time with the AI; overlapping devices count once.",
      };
    });
  }
  /** Called before creating a new generation, after its fan message. */
  async notices(scope: ThreadScope, client: PoolClient): Promise<string[]> {
    const pair = [scope.threadId, scope.creatorId, scope.fanId];
    const presence = (
      await client.query(
        "SELECT * FROM creator.conversation_presence WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND until_at>=now() FOR UPDATE",
        pair,
      )
    ).rows[0];
    if (!presence) return [];
    const lines: string[] = [];
    if (presence.continuous_seconds - presence.reminder_seconds >= 10800) {
      lines.push(formatCopy("longSession", { name: scope.creatorName }));
      await client.query(
        "UPDATE creator.conversation_presence SET reminder_seconds=continuous_seconds WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
        pair,
      );
      await client.query(
        "UPDATE creator.thread SET last_reminder_at=now() WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        pair,
      );
    }
    const daily = (
      await client.query(
        "SELECT day::text,companion_seconds FROM creator.conversation_usage_day WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND day=(now() AT TIME ZONE 'UTC')::date",
        pair,
      )
    ).rows[0];
    const mode = this.mode ? await this.mode(scope, client) : null;
    if (
      (mode === "companion" || mode === "blend") &&
      daily?.companion_seconds >= 5400 &&
      (presence.daily_signal_day?.toISOString?.().slice(0, 10) ??
        presence.daily_signal_day) !== daily.day
    ) {
      lines.push(
        "Time with this AI today · 90 minutes. Take a break whenever you like.",
      );
      await client.query(
        "UPDATE creator.conversation_presence SET daily_signal_day=$4 WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
        [...pair, daily.day],
      );
    }
    return lines;
  }
}
