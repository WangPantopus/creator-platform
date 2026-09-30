import { z } from "zod";
import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import type { ThreadScope } from "../access/scope.js";
import { invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { validateZone } from "./service.js";

export const AvailabilitySchema = z.strictObject({
  timeZone: z.string().min(1).max(80),
  windows: z
    .array(
      z.strictObject({
        startsAt: z.iso.datetime({ offset: true }),
        endsAt: z.iso.datetime({ offset: true }),
      }),
    )
    .max(64),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(128),
});
type Availability = {
  creatorId: string;
  version: number;
  timeZone: string;
  windows: Array<{ startsAt: string; endsAt: string }>;
};

/** Explicit dated windows avoid guessing recurring DST gaps or ambiguous wall times. */
export class AvailabilityService {
  constructor(readonly db: Database) {}
  async current(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<Availability | null> {
    const row = (
      await client.query<{
        version: number;
        time_zone: string;
        windows: Availability["windows"];
      }>(
        "SELECT version,time_zone,windows FROM creator.call_availability WHERE creator_id=$1",
        [scope.creatorId],
      )
    ).rows[0];
    return row
      ? {
          creatorId: scope.creatorId,
          version: row.version,
          timeZone: row.time_zone,
          windows: row.windows,
        }
      : null;
  }
  async read(scope: ThreadScope) {
    return this.db.withThread(scope, (client) => this.current(scope, client));
  }
  async save(scope: ThreadScope, input: unknown) {
    invariant(
      scope.authority === "creator" &&
        scope.actorAccountId === scope.creatorAccountId,
      "creator_required",
      "Only the verified creator can edit availability.",
    );
    const body = AvailabilitySchema.parse(input);
    const zone = validateZone(body.timeZone);
    const windows = body.windows
      .map((window) => ({
        startsAt: new Date(window.startsAt).toISOString(),
        endsAt: new Date(window.endsAt).toISOString(),
      }))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    invariant(
      windows.every(
        (w, i) =>
          Date.parse(w.endsAt) > Date.parse(w.startsAt) &&
          Date.parse(w.startsAt) > Date.now() &&
          (i === 0 ||
            Date.parse(w.startsAt) >= Date.parse(windows[i - 1]!.endsAt)),
      ),
      "availability_invalid",
      "Use future windows with positive length and no overlaps. Explicit UTC offsets distinguish daylight-saving occurrences.",
    );
    return this.db.withThread(scope, (client) =>
      idempotent(
        client,
        scope,
        "session.availability",
        body.idempotencyKey,
        body,
        async () => {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`call-schedule:${scope.creatorId}`],
          );
          const current = await this.current(scope, client);
          invariant(
            (current?.version ?? 0) === body.expectedVersion,
            "availability_stale",
            "Availability changed. Refresh before saving.",
          );
          const version = body.expectedVersion + 1;
          await client.query(
            "INSERT INTO creator.call_availability(creator_id,creator_account_id,version,time_zone,windows) VALUES($1,$2,$3,$4,$5) ON CONFLICT(creator_id) DO UPDATE SET version=EXCLUDED.version,time_zone=EXCLUDED.time_zone,windows=EXCLUDED.windows,updated_at=now()",
            [
              scope.creatorId,
              scope.creatorAccountId,
              version,
              zone,
              JSON.stringify(windows),
            ],
          );
          return {
            creatorId: scope.creatorId,
            version,
            timeZone: zone,
            windows,
          };
        },
      ),
    );
  }
  async covers(
    scope: ThreadScope,
    start: string,
    end: string,
    client: PoolClient,
  ) {
    const current = await this.current(scope, client);
    return Boolean(
      current?.windows.some(
        (w) =>
          Date.parse(w.startsAt) <= Date.parse(start) &&
          Date.parse(w.endsAt) >= Date.parse(end),
      ),
    );
  }
}
