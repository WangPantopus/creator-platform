import { copy } from "@qelvora/copy";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { EventEnvelope, type GrowthEvent } from "./contracts.js";
import type { GrowthService } from "./service.js";
import { requireAccountNotificationSchema } from "./account-notifications.js";
import { leasedNotificationCustody } from "./notification-custody.js";

export const Producer = z.enum([
  "agent",
  "conversation",
  "commerce",
  "content",
  "calls",
  "retention",
  "trust",
]);
export type GrowthProducer = z.infer<typeof Producer>;

/** A UUID derived from a key, so an owner can name the same event again. */
export function stableUuid(key: string) {
  const hex = createHash("sha256").update(key).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** A producer owns scope, recipients and mapping. Never expose these callbacks to HTTP. */
export interface GrowthEventSource {
  producer: GrowthProducer;
  pending(
    limit: number,
  ): Promise<readonly { id: string; event: GrowthEvent | null }[]>;
  acknowledge(id: string): Promise<void>;
}
/** Host enumeration returns currently authorized scopes, not client IDs. */
export type GrowthEventSources =
  | readonly GrowthEventSource[]
  | (() => Promise<readonly GrowthEventSource[]>);

/** Commit to the W7 inbox before acknowledging the owner outbox. Restarts are safe. */
export class GrowthRelay {
  constructor(private readonly service: GrowthService) {}

  /** Owner-effect retry keys choose the original event once, even across concurrent retries. */
  async enqueueOnce(
    producer: GrowthProducer,
    id: string,
    creatorId: string,
    build: () => Promise<GrowthEvent>,
  ) {
    const owner = Producer.parse(producer);
    z.uuid().parse(id);
    z.uuid().parse(creatorId);
    return this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
          [`growth.relay:${id}`],
        );
        const prior = (
          await client.query(
            "SELECT producer,creator_id FROM growth.producer_relay WHERE id=$1",
            [id],
          )
        ).rows[0];
        if (prior) {
          if (prior.producer !== owner || prior.creator_id !== creatorId)
            throw new DomainError(
              "producer_event_conflict",
              copy.growthErrorProducerEventConflict,
              409,
            );
          return { queued: false };
        }
        const event = EventEnvelope.parse(await build());
        if (event.id !== id || event.creatorId !== creatorId)
          throw new DomainError(
            "producer_event_conflict",
            copy.growthErrorProducerEventConflict2,
            409,
          );
        const retained = await this.service.erasure.event(client, event);
        if (!retained) return { queued: false };
        await client.query(
          "INSERT INTO growth.producer_relay(id,producer,creator_id,envelope,envelope_hash) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            owner,
            creatorId,
            retained,
            contentHash({ producer: owner, event }),
          ],
        );
        return { queued: true };
      },
    );
  }

  async enqueue(producer: GrowthProducer, input: unknown) {
    const owner = Producer.parse(producer),
      event = EventEnvelope.parse(input);
    if (event.creatorId === null) {
      if (owner !== "commerce")
        throw new DomainError(
          "producer_event_conflict",
          copy.growthErrorProducerEventConflict,
          409,
        );
      await requireAccountNotificationSchema(this.service.db.worker);
    }
    const hash = contentHash({ producer: owner, event });
    return this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        const retained = await this.service.erasure.event(client, event);
        if (!retained) return { queued: false };
        const inserted =
          event.creatorId === null
            ? await client.query(
                "INSERT INTO growth.producer_relay(id,producer,creator_id,account_id,envelope,envelope_hash) VALUES($1,$2,NULL,$3,$4,$5) ON CONFLICT DO NOTHING",
                [event.id, owner, event.accountId, retained, hash],
              )
            : await client.query(
                "INSERT INTO growth.producer_relay(id,producer,creator_id,envelope,envelope_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
                [event.id, owner, event.creatorId, retained, hash],
              );
        const prior = (
          await client.query(
            "SELECT envelope_hash FROM growth.producer_relay WHERE id=$1",
            [event.id],
          )
        ).rows[0];
        if (prior?.envelope_hash !== hash)
          throw new DomainError(
            "producer_event_conflict",
            copy.growthErrorProducerEventConflict3,
            409,
          );
        return { queued: true, inserted: Boolean(inserted.rowCount) };
      },
    );
  }

  /** Queue one event for a whole audience, in chunks of at most 500 recipients
   * (the envelope's cap). Safe to call again after a crash, from two requests at
   * once, or after the audience changed: each chunk is its own short
   * transaction (the erasure fence takes one lock per recipient), serialized per
   * subject, and queues only recipients no earlier chunk of this subject holds.
   * Chunk ids are derived from their recipients, so replaying a chunk is a
   * no-op. Returns how many recipients were newly queued. */
  async enqueueRecipients(
    producer: GrowthProducer,
    input: {
      type: Exclude<GrowthEvent["type"], "spending_reminder">;
      creatorId: string;
      aggregateId: string;
      aggregateVersion: number;
      causationId: string;
      correlationId: string;
      occurredAt: string;
      recipients: readonly { accountId: string; role: "fan" | "creator" }[];
    },
  ) {
    const owner = Producer.parse(producer);
    z.uuid().parse(input.creatorId);
    z.uuid().parse(input.aggregateId);
    const wanted = [
      ...new Map(
        input.recipients.map((r) => [`${r.role}:${r.accountId}`, r]),
      ).values(),
    ].sort((a, b) => (a.accountId < b.accountId ? -1 : 1));
    let queued = 0;
    // Recipients this call has already dealt with, queued or erased, so a chunk
    // that stores nothing still lets the next pass move on.
    const handled = new Set<string>();
    for (let guard = 0; guard < 1000; guard++) {
      const progressed = await this.service.db.transaction(
        this.service.db.worker,
        async (client) => {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`growth.audience:${input.type}:${input.aggregateId}`],
          );
          const held = new Set(
            (
              await client.query<{ key: string }>(
                `SELECT (r->>'role')||':'||(r->>'accountId') AS key
                 FROM growth.producer_relay p, jsonb_array_elements(p.envelope->'recipients') r
                 WHERE p.producer=$1 AND p.creator_id=$2
                 AND p.envelope->>'type'=$3 AND p.envelope->>'aggregateId'=$4`,
                [owner, input.creatorId, input.type, input.aggregateId],
              )
            ).rows.map((row) => row.key),
          );
          const next = wanted
            .filter((r) => {
              const key = `${r.role}:${r.accountId}`;
              return !held.has(key) && !handled.has(key);
            })
            .slice(0, 500);
          if (!next.length) return false;
          for (const r of next) handled.add(`${r.role}:${r.accountId}`);
          const event = EventEnvelope.parse({
            id: stableUuid(
              `growth.audience:${input.type}:${input.aggregateId}:${next
                .map((r) => `${r.role}:${r.accountId}`)
                .join(",")}`,
            ),
            schemaVersion: 1,
            type: input.type,
            creatorId: input.creatorId,
            aggregateId: input.aggregateId,
            aggregateVersion: input.aggregateVersion,
            causationId: input.causationId,
            correlationId: input.correlationId,
            occurredAt: input.occurredAt,
            recipients: next,
          });
          const retained = await this.service.erasure.event(client, event);
          if (!retained) return true;
          const inserted = await client.query(
            "INSERT INTO growth.producer_relay(id,producer,creator_id,envelope,envelope_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
            [
              event.id,
              owner,
              input.creatorId,
              retained,
              contentHash({ producer: owner, event: retained }),
            ],
          );
          queued += inserted.rowCount ? retained.recipients.length : 0;
          return true;
        },
      );
      if (!progressed) return { queued };
    }
    throw new DomainError(
      "audience_too_large",
      copy.growthTheServiceIsUnavailablePleaseTryAgain,
      503,
    );
  }

  /** Has anything been queued for this subject yet? Lets an owner treat a later
   * edit as silent without keeping its own record. */
  async hasAudience(
    producer: GrowthProducer,
    creatorId: string,
    type: GrowthEvent["type"],
    aggregateId: string,
  ) {
    return (
      (
        await this.service.db.worker.query(
          "SELECT 1 FROM growth.producer_relay WHERE producer=$1 AND creator_id=$2 AND envelope->>'type'=$3 AND envelope->>'aggregateId'=$4 LIMIT 1",
          [
            Producer.parse(producer),
            z.uuid().parse(creatorId),
            type,
            z.uuid().parse(aggregateId),
          ],
        )
      ).rowCount === 1
    );
  }

  async pull(source: GrowthEventSource, limit = 50) {
    const bound = z.int().min(1).max(100).parse(limit);
    const pending = await source.pending(bound);
    if (pending.length > bound) throw new Error("producer_batch_exceeded");
    let acknowledged = 0;
    for (const item of pending) {
      z.uuid().parse(item.id);
      if (item.event) await this.enqueue(source.producer, item.event);
      await source.acknowledge(item.id);
      acknowledged++;
    }
    return { acknowledged };
  }

  async drain(limit = 25) {
    const bound = z.int().min(1).max(100).parse(limit),
      lease = randomUUID();
    const rows = await this.service.db.transaction(
      this.service.db.worker,
      async (client) =>
        (
          await client.query(
            `WITH due AS (SELECT r.id FROM growth.producer_relay r
              WHERE ((r.state='queued' AND r.available_at<=now()) OR (r.state='leased' AND r.lease_until<now()))
              AND NOT (r.producer='retention' AND r.envelope->>'type'='weekly_impact'
                AND NOT EXISTS(SELECT FROM growth.impact i WHERE i.creator_id=r.creator_id
                  AND r.envelope->>'occurredAt'=to_char(i.window_start+7,'YYYY-MM-DD')||'T00:00:00.000Z'))
              ORDER BY r.available_at,r.id LIMIT $1 FOR UPDATE SKIP LOCKED)
         UPDATE growth.producer_relay r SET state='leased',lease_id=$2,lease_until=now()+interval '60 seconds',attempts=attempts+1 FROM due WHERE r.id=due.id RETURNING r.*`,
            [bound, lease],
          )
        ).rows,
    );
    for (const row of rows) {
      try {
        const event = EventEnvelope.parse(row.envelope);
        await this.service.notifications.consume(
          row.envelope,
          event.creatorId === null || event.type === "weekly_impact"
            ? leasedNotificationCustody(
                this.service.db,
                this.service.erasure,
                event,
                event.creatorId === null
                  ? event.accountId
                  : event.recipients[0]!.accountId,
                { kind: "relay", id: row.id, leaseId: lease },
              )
            : undefined,
        );
        await this.service.db.worker.query(
          "UPDATE growth.producer_relay SET state='consumed',consumed_at=now(),lease_until=NULL,error_code=NULL WHERE id=$1 AND lease_id=$2 AND state='leased'",
          [row.id, lease],
        );
      } catch (error) {
        const permanent = error instanceof DomainError && error.status < 500;
        const unconfigured =
          error instanceof DomainError &&
          error.code === "notification_owner_unconfigured";
        await this.service.db.worker.query(
          "UPDATE growth.producer_relay SET state=$3,available_at=now()+($4*interval '1 second'),lease_until=NULL,error_code=$5 WHERE id=$1 AND lease_id=$2 AND state='leased'",
          [
            row.id,
            lease,
            permanent
              ? "dead"
              : unconfigured || row.attempts >= 8
                ? "blocked"
                : "queued",
            Math.min(3600, 15 * 2 ** row.attempts),
            permanent
              ? "invalid_owner_event"
              : unconfigured
                ? "owner_unconfigured"
                : "owner_unavailable",
          ],
        );
      }
    }
    return { claimed: rows.length };
  }

  /** Operator/host recovery after the missing owner becomes available. Original event is immutable. */
  async resume(producer: GrowthProducer, creatorId: string) {
    return (
      (
        await this.service.db.worker.query(
          "UPDATE growth.producer_relay SET state='queued',attempts=0,available_at=now(),lease_until=NULL,lease_id=NULL,error_code=NULL WHERE producer=$1 AND creator_id=$2 AND state='blocked' RETURNING id",
          [Producer.parse(producer), z.uuid().parse(creatorId)],
        )
      ).rowCount ?? 0
    );
  }
  /** Current host recovery for genuine portfolio notices; no creator scope is fabricated. */
  async resumeAccount(accountId: string) {
    const account = z.uuid().parse(accountId);
    await requireAccountNotificationSchema(this.service.db.worker);
    return (
      (
        await this.service.db.worker.query(
          "UPDATE growth.producer_relay SET state='queued',attempts=0,available_at=now(),lease_until=NULL,lease_id=NULL,error_code=NULL WHERE producer='commerce' AND creator_id IS NULL AND account_id=$1 AND state='blocked' RETURNING id",
          [account],
        )
      ).rowCount ?? 0
    );
  }
}
