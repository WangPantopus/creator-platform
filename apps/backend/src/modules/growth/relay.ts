import { copy } from "@qelvora/copy";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import { EventEnvelope, type GrowthEvent } from "./contracts.js";
import type { GrowthService } from "./service.js";

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

/** A producer owns scope, recipients and mapping. Never expose these callbacks to HTTP. */
export interface GrowthEventSource {
  producer: GrowthProducer;
  pending(
    limit: number,
  ): Promise<readonly { id: string; event: GrowthEvent | null }[]>;
  acknowledge(id: string): Promise<void>;
}

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
    const hash = contentHash({ producer: owner, event });
    return this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        const retained = await this.service.erasure.event(client, event);
        if (!retained) return { queued: false };
        await client.query(
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
        return { queued: true };
      },
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
            `WITH due AS (SELECT id FROM growth.producer_relay WHERE (state='queued' AND available_at<=now()) OR (state='leased' AND lease_until<now()) ORDER BY available_at,id LIMIT $1 FOR UPDATE SKIP LOCKED)
         UPDATE growth.producer_relay r SET state='leased',lease_id=$2,lease_until=now()+interval '60 seconds',attempts=attempts+1 FROM due WHERE r.id=due.id RETURNING r.*`,
            [bound, lease],
          )
        ).rows,
    );
    for (const row of rows) {
      try {
        await this.service.notifications.consume(row.envelope);
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
}
