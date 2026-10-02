import type { Pool, PoolClient } from "pg";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import { canonical } from "../../core/canonical.js";
import { copy } from "@qelvora/copy";
import type { GrowthDatabase } from "./database.js";
import type { GrowthErasure } from "./erasure.js";
import { EventEnvelope, type GrowthEvent } from "./contracts.js";
import { requestAuthority } from "../identity/request-authority.js";

export type NotificationReadFacts = Readonly<
  {
    client: PoolClient;
    pool: Pool;
    accountId: string;
    creatorId: string | null;
    eventId: string;
    aggregateId: string;
  } & (
    | { kind: "interactive"; actor: Actor; notificationId: string }
    | {
        kind: "relay" | "delivery";
        jobId: string;
        leaseId: string;
        leaseUntil: string;
      }
  )
>;

/** Negative custody only. W1/W8's genuine purpose issuer and the owner's
 * current authorization still decide whether private rows may be read.
 * These are fresh observations, not locks across another owner's denial
 * gates. The owner must recheck its genuine purpose before and after its read.
 * The reader must finish inside this callback and never retain its client,
 * perform provider I/O, or turn these identifiers into an Actor/owner scope. */
export interface NotificationReadCustody {
  withCurrent<T>(
    read: (facts: NotificationReadFacts) => Promise<T>,
  ): Promise<T>;
}

const unavailable = () =>
  new DomainError(
    "notification_read_custody_unavailable",
    copy.growthErrorNotificationUnavailable,
    503,
  );

export function interactiveNotificationCustody(
  db: GrowthDatabase,
  actor: Actor,
  notificationId: string,
  event: GrowthEvent,
): NotificationReadCustody {
  return {
    withCurrent: (read) =>
      db.transaction(db.runtime, async (client) => {
        const authority = requestAuthority.getStore();
        if (
          !authority ||
          authority.accountId !== actor.accountId ||
          !actor.adultEligible
        )
          throw unavailable();
        await client.query("SELECT set_config('app.account_id',$1,true)", [
          actor.accountId,
        ]);
        if (
          !(
            await client.query(
              "SELECT id FROM creator.identity_session WHERE id=$1 AND account_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp()",
              [authority.sessionId, actor.accountId],
            )
          ).rowCount
        )
          throw unavailable();
        const row = (
          await client.query(
            "SELECT id,event_id,account_id,creator_id,type FROM growth.notification WHERE id=$1 AND account_id=$2",
            [notificationId, actor.accountId],
          )
        ).rows[0];
        if (
          !row ||
          row.event_id !== event.id ||
          row.creator_id !== event.creatorId ||
          row.type !== event.type ||
          !event.recipients.some((r) => r.accountId === actor.accountId)
        )
          throw unavailable();
        return read(
          Object.freeze({
            kind: "interactive",
            actor,
            client,
            pool: db.runtime,
            accountId: actor.accountId,
            creatorId: event.creatorId,
            eventId: event.id,
            aggregateId: event.aggregateId,
            notificationId,
          }),
        );
      }),
  };
}

export function leasedNotificationCustody(
  db: GrowthDatabase,
  erasure: GrowthErasure,
  event: GrowthEvent,
  accountId: string,
  job: { kind: "relay" | "delivery"; id: string; leaseId: string },
): NotificationReadCustody {
  return {
    withCurrent: (read) =>
      db.transaction(db.worker, async (client) => {
        if (
          !(event.creatorId === null
            ? event.accountId === accountId
            : event.type === "weekly_impact" &&
              event.recipients.some(
                (r) => r.accountId === accountId && r.role === "creator",
              )) ||
          !(await erasure.accountRetained(client, accountId))
        )
          throw unavailable();
        const sql =
          job.kind === "relay"
            ? "SELECT lease_until,envelope FROM growth.producer_relay WHERE id=$1 AND lease_id=$2 AND state='leased' AND lease_until>clock_timestamp()"
            : "SELECT d.lease_until,e.envelope FROM growth.delivery d JOIN growth.notification n ON n.id=d.notification_id JOIN growth.event_inbox e ON e.id=n.event_id WHERE d.id=$1 AND d.lease_id=$2 AND d.account_id=$3 AND n.account_id=$3 AND d.state='leased' AND d.lease_until>clock_timestamp()";
        const row = (
          await client.query(
            sql,
            job.kind === "relay"
              ? [job.id, job.leaseId]
              : [job.id, job.leaseId, accountId],
          )
        ).rows[0];
        if (
          !row ||
          canonical(EventEnvelope.parse(row.envelope)) !== canonical(event)
        )
          throw unavailable();
        return read(
          Object.freeze({
            kind: job.kind,
            client,
            pool: db.worker,
            accountId,
            creatorId: event.creatorId,
            eventId: event.id,
            aggregateId: event.aggregateId,
            jobId: job.id,
            leaseId: job.leaseId,
            leaseUntil: new Date(row.lease_until).toISOString(),
          }),
        );
      }),
  };
}
