import { AvailabilityCommandSchema } from "../../../../../packages/api/src/session.js";
import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import type { ThreadScope } from "../access/scope.js";
import { DomainError, invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { validateZone } from "./service.js";
import type {
  CreatorIdentityAuthority,
  CreatorScope,
} from "../identity/creator-scope.js";

export const AvailabilitySchema = AvailabilityCommandSchema;
export type AvailabilityRestriction = (
  scope: CreatorScope | ThreadScope,
  client: PoolClient,
) => Promise<void>;
type Availability = {
  creatorId: string;
  version: number;
  timeZone: string;
  windows: Array<{ startsAt: string; endsAt: string }>;
};

/** Explicit dated windows avoid guessing recurring DST gaps or ambiguous wall times. */
export class AvailabilityService {
  constructor(
    readonly db: Database,
    readonly identity?: CreatorIdentityAuthority,
    private readonly assertAllowed?: AvailabilityRestriction,
  ) {}
  private transaction<T>(
    scope: CreatorScope | ThreadScope,
    work: (client: PoolClient) => Promise<T>,
  ) {
    const restricted = async (client: PoolClient) => {
      invariant(
        this.assertAllowed,
        "availability_denial_unconfigured",
        "Availability requires its current held scope authority.",
      );
      await this.assertAllowed(scope, client);
      return work(client);
    };
    if ("accountId" in scope) {
      invariant(
        this.identity,
        "availability_identity_unconfigured",
        "Creator availability is not connected yet.",
      );
      return this.identity.withCreator(scope, restricted, "verified");
    }
    return this.db.withThread(scope, restricted, "read");
  }
  async current(
    scope: Pick<ThreadScope, "creatorId">,
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
    return this.transaction(scope, (client) => this.current(scope, client));
  }
  async readCreator(scope: CreatorScope) {
    return this.transaction(scope, (client) => this.current(scope, client));
  }
  async saveCreator(scope: CreatorScope, input: unknown) {
    return this.saveScoped(scope, input);
  }
  async save(scope: ThreadScope, input: unknown) {
    invariant(
      scope.authority === "creator" &&
        scope.actorAccountId === scope.creatorAccountId,
      "creator_required",
      "Only the verified creator can edit availability.",
    );
    return this.saveScoped(scope, input);
  }
  private async saveScoped(scope: CreatorScope | ThreadScope, input: unknown) {
    const body = AvailabilitySchema.parse(input);
    const zone = validateZone(body.timeZone);
    const windows = body.windows
      .map((window) => ({
        startsAt: new Date(window.startsAt).toISOString(),
        endsAt: new Date(window.endsAt).toISOString(),
      }))
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    return this.transaction(scope, (client) =>
      idempotent(
        client,
        "accountId" in scope
          ? { actorAccountId: scope.accountId, threadId: null }
          : scope,
        "session.availability",
        body.idempotencyKey,
        "accountId" in scope ? { creatorId: scope.creatorId, ...body } : body,
        async () => {
          // Resolve an exact retry's committed receipt before checking whether
          // the original window has since passed. Only new commands may edit.
          if (
            !windows.every(
              (w, i) =>
                Date.parse(w.endsAt) > Date.parse(w.startsAt) &&
                Date.parse(w.startsAt) > Date.now() &&
                (i === 0 ||
                  Date.parse(w.startsAt) >= Date.parse(windows[i - 1]!.endsAt)),
            )
          )
            throw new DomainError(
              "availability_invalid",
              "Use future windows with positive length and no overlaps. Explicit UTC offsets distinguish daylight-saving occurrences.",
              422,
            );
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`call-schedule:${scope.creatorId}`],
          );
          const current = await this.current(scope, client);
          if ((current?.version ?? 0) !== body.expectedVersion)
            throw new DomainError(
              "availability_stale",
              "Availability changed. Refresh before saving.",
              409,
            );
          const version = body.expectedVersion + 1;
          await client.query(
            "INSERT INTO creator.call_availability(creator_id,creator_account_id,version,time_zone,windows) VALUES($1,$2,$3,$4,$5) ON CONFLICT(creator_id) DO UPDATE SET version=EXCLUDED.version,time_zone=EXCLUDED.time_zone,windows=EXCLUDED.windows,updated_at=now()",
            [
              scope.creatorId,
              "accountId" in scope ? scope.accountId : scope.creatorAccountId,
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
