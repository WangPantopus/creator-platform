import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { canonical } from "../../core/canonical.js";
import type { GrowthService } from "./service.js";
import type { Retention } from "./retention.js";
import { EventEnvelope, type GrowthEvent } from "./contracts.js";
import { GrowthRelay } from "./relay.js";
import type { CurrentThanksTarget } from "../content/integration.js";
import { contentThanksWindow } from "../content/thanks-projection.js";

const week = 7 * 86400000;
async function withinDeadline<T>(signal: AbortSignal, work: () => Promise<T>) {
  signal.throwIfAborted();
  let cancel: () => void = () => {};
  try {
    return await new Promise<T>((resolve, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener("abort", cancel, { once: true });
      signal.throwIfAborted();
      work().then(resolve, reject);
    });
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}
const Candidate = z.strictObject({
  creatorId: z.uuid(),
  accountId: z.uuid(),
  /** Actual eligibility start, not an invented backdated publication. */
  eligibleFrom: z.iso.datetime(),
});
const Counts = z.strictObject({
  creatorId: z.uuid(),
  accountId: z.uuid(),
  window: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  uniqueFans: z.int().min(0).max(2147483647),
  aiConversations: z.int().min(0).max(2147483647),
  personalReplies: z.int().min(0).max(2147483647),
  notes: z.int().min(0).max(2147483647),
});

/** Fresh observations of W7's actual leased job, not positive W1/W8 purpose
 * authority. The owner must obtain its genuine task/denial/privacy scope on
 * its actual client, finish inside this callback and retain no client/scope. */
export interface WeeklyImpactTask {
  withCurrent<T>(
    read: (
      facts: Readonly<{
        kind: "weekly_impact";
        client: PoolClient;
        pool: Pool;
        jobId: string;
        leaseId: string;
        leaseUntil: string;
        creatorId: string;
        accountId: string;
        from: string;
        until: string;
        signal: AbortSignal;
      }>,
    ) => Promise<T>,
  ): Promise<T>;
}
export interface WeeklyImpactSource {
  /** Canonical directory: currently verified/recovered eligible creators.
   * IDs/cursor alone never grant aggregate or Thanks read authority. */
  page(input: {
    cursor: string | null;
    limit: number;
    from: Date;
    until: Date;
    signal: AbortSignal;
  }): Promise<{
    creators: readonly z.infer<typeof Candidate>[];
    nextCursor: string | null;
  }>;
  collect(task: WeeklyImpactTask): Promise<unknown>;
}

/** The host supplies actual approved owner aggregates and W5 current-target
 * authority. Missing ports cannot produce a zero count or a consented quote. */
export function canonicalWeeklyImpactSource(input: {
  page: WeeklyImpactSource["page"];
  counts(task: WeeklyImpactTask): Promise<z.infer<typeof Counts>>;
  thanksPool: Pool;
  thanksTarget: CurrentThanksTarget;
}): WeeklyImpactSource {
  return {
    page: input.page,
    async collect(task) {
      const counts = Counts.parse(await input.counts(task));
      return task.withCurrent(async (facts) => {
        if (
          counts.creatorId !== facts.creatorId ||
          counts.accountId !== facts.accountId ||
          counts.window !== facts.from.slice(0, 10)
        )
          throw new Error("impact_owner_binding_changed");
        const thanks = await contentThanksWindow(
          input.thanksPool,
          facts.creatorId,
          new Date(facts.from),
          new Date(facts.until),
          input.thanksTarget,
          facts.signal,
        );
        return {
          creatorId: counts.creatorId,
          window: counts.window,
          uniqueFans: counts.uniqueFans,
          aiConversations: counts.aiConversations,
          personalReplies: counts.personalReplies,
          notes: counts.notes,
          ...thanks,
        };
      });
    },
  };
}

export function weeklyImpactID(creatorId: string, window: string) {
  const hex = createHash("sha256")
    .update(`growth.weekly-impact-v1:${creatorId}:${window}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Exact most-recent closed Monday-to-Monday UTC window, no clock advance. */
function closedWindow() {
  const until = new Date();
  until.setUTCHours(0, 0, 0, 0);
  until.setUTCDate(until.getUTCDate() - ((until.getUTCDay() + 6) % 7));
  return { from: new Date(until.valueOf() - week), until };
}

export function weeklyImpactBinding(input: unknown) {
  const event = EventEnvelope.parse(input);
  const until = new Date(event.occurredAt),
    from = new Date(until.valueOf() - week),
    window = from.toISOString().slice(0, 10);
  if (
    event.type !== "weekly_impact" ||
    event.creatorId === null ||
    event.aggregateVersion !== 1 ||
    event.recipients.length !== 1 ||
    event.recipients[0]!.role !== "creator" ||
    until.getUTCDay() !== 1 ||
    until.toISOString() !==
      `${until.toISOString().slice(0, 10)}T00:00:00.000Z` ||
    until.valueOf() > Date.now() ||
    event.id !== weeklyImpactID(event.creatorId, window) ||
    event.aggregateId !== event.id ||
    event.causationId !== event.id ||
    event.correlationId !== event.creatorId
  )
    throw new Error("impact_job_binding_invalid");
  return {
    event,
    creatorId: event.creatorId,
    accountId: event.recipients[0]!.accountId,
    from,
    until,
    window,
  };
}

export interface WeeklyImpactLease {
  event: GrowthEvent;
  leaseId: string;
}

/** Existing relay rows are the durable jobs. Pending Impact jobs cannot enter
 * the notification relay until their matching digest exists. Collection and
 * publication use separate short transactions; no source/provider I/O occurs
 * under a W7 row lock. A crash retains either the lease or the ready digest. */
export class WeeklyImpact {
  private cursor: string | null = null;
  private scanWindow: string | null = null;
  private scanned = false;
  private active = false;
  private readonly relay: GrowthRelay;
  constructor(
    private readonly service: GrowthService,
    private readonly retention: Retention,
  ) {
    this.relay = new GrowthRelay(service);
  }
  private task(
    lease: WeeklyImpactLease,
    signal: AbortSignal,
  ): WeeklyImpactTask {
    const binding = weeklyImpactBinding(lease.event);
    return {
      withCurrent: (read) =>
        this.service.db.transaction(
          this.service.db.worker,
          async (client) => {
            const current = async () => {
              const row = (
                await client.query<{ envelope: unknown; lease_until: Date }>(
                  "SELECT envelope,lease_until FROM growth.producer_relay WHERE id=$1 AND producer='retention' AND lease_id=$2 AND state='leased' AND lease_until>clock_timestamp()",
                  [binding.event.id, lease.leaseId],
                )
              ).rows[0];
              if (
                !row ||
                canonical(EventEnvelope.parse(row.envelope)) !==
                  canonical(binding.event) ||
                !(await this.service.erasure.accountRetained(
                  client,
                  binding.accountId,
                ))
              )
                throw new Error("impact_job_lease_unavailable");
              return row;
            };
            const row = await current();
            // An assigned actual xid is a custody observation, never a scope.
            await client.query("SELECT pg_current_xact_id()");
            const facts = Object.freeze({
              kind: "weekly_impact" as const,
              client,
              pool: this.service.db.worker,
              jobId: binding.event.id,
              leaseId: lease.leaseId,
              leaseUntil: new Date(row.lease_until).toISOString(),
              creatorId: binding.creatorId,
              accountId: binding.accountId,
              from: binding.from.toISOString(),
              until: binding.until.toISOString(),
              signal,
            });
            const result = await withinDeadline(signal, () => read(facts));
            signal.throwIfAborted();
            await current();
            return result;
          },
          signal,
        ),
    };
  }
  async tick(source?: WeeklyImpactSource) {
    if (!source) return { configured: false, scheduled: 0, completed: 0 };
    if (this.active) throw new Error("impact_tick_already_running");
    this.active = true;
    let scheduled = 0,
      completed = 0;
    let scanFailure: { error: unknown } | undefined;
    try {
      const { from, until } = closedWindow(),
        window = from.toISOString().slice(0, 10);
      if (this.scanWindow !== window) {
        this.scanWindow = window;
        this.cursor = null;
        this.scanned = false;
      }
      try {
        if (!this.scanned) {
          const signal = AbortSignal.timeout(30000);
          const page = await withinDeadline(signal, () =>
            source.page({
              cursor: this.cursor,
              limit: 25,
              from: new Date(from),
              until: new Date(until),
              signal,
            }),
          );
          const next = z.uuid().nullable().parse(page.nextCursor);
          if (
            page.creators.length > 25 ||
            (next !== null && next === this.cursor) ||
            (next !== null && next !== page.creators.at(-1)?.creatorId)
          )
            throw new Error("impact_directory_page_invalid");
          let previous = this.cursor;
          for (const candidate of page.creators) {
            const creator = Candidate.parse(candidate);
            if (previous !== null && creator.creatorId <= previous)
              throw new Error("impact_directory_page_invalid");
            previous = creator.creatorId;
            if (new Date(creator.eligibleFrom).valueOf() >= until.valueOf())
              continue;
            const id = weeklyImpactID(creator.creatorId, window);
            const result = await this.relay.enqueue("retention", {
              id,
              schemaVersion: 1,
              type: "weekly_impact",
              creatorId: creator.creatorId,
              aggregateId: id,
              aggregateVersion: 1,
              causationId: id,
              correlationId: creator.creatorId,
              occurredAt: until.toISOString(),
              recipients: [{ accountId: creator.accountId, role: "creator" }],
            });
            if (result.queued && result.inserted) scheduled++;
          }
          this.cursor = next;
          this.scanned = next === null;
        }
      } catch (error) {
        // Directory recovery must not starve already durable closed jobs.
        // Preserve the cursor for an idempotent retry and report the failure
        // after draining the existing lease, without inventing candidates.
        scanFailure = { error };
      }
      const leaseId = randomUUID();
      const jobs = await this.service.db.transaction(
        this.service.db.worker,
        async (client) =>
          (
            await client.query<{
              envelope: unknown;
              id: string;
              attempts: number;
            }>(
              `WITH picked AS (SELECT r.id FROM growth.producer_relay r
            WHERE r.producer='retention' AND r.envelope->>'type'='weekly_impact'
            AND ((r.state='queued' AND r.available_at<=now()) OR (r.state='leased' AND r.lease_until<now()))
            AND NOT EXISTS(SELECT FROM growth.impact i WHERE i.creator_id=r.creator_id
              AND r.envelope->>'occurredAt'=to_char(i.window_start+7,'YYYY-MM-DD')||'T00:00:00.000Z')
            ORDER BY r.available_at,r.id LIMIT 1 FOR UPDATE SKIP LOCKED)
          UPDATE growth.producer_relay r SET state='leased',lease_id=$1,lease_until=now()+interval '45 seconds',attempts=attempts+1
          FROM picked WHERE r.id=picked.id RETURNING r.id,r.envelope,r.attempts`,
              [leaseId],
            )
          ).rows,
      );
      for (const job of jobs) {
        try {
          const { event } = weeklyImpactBinding(job.envelope);
          const lease = { event, leaseId };
          const signal = AbortSignal.timeout(30000);
          const impact = await withinDeadline(signal, () =>
            source.collect(this.task(lease, signal)),
          );
          await this.retention.recordImpact(impact, lease);
          completed++;
        } catch {
          await this.service.db.worker.query(
            "UPDATE growth.producer_relay SET state=$3,available_at=now()+($4*interval '1 second'),lease_id=NULL,lease_until=NULL,error_code='impact_source_unavailable' WHERE id=$1 AND lease_id=$2 AND state='leased'",
            [
              job.id,
              leaseId,
              job.attempts >= 8 ? "blocked" : "queued",
              Math.min(3600, 15 * 2 ** job.attempts),
            ],
          );
        }
      }
      if (scanFailure) throw scanFailure.error;
      return { configured: true, scheduled, completed };
    } finally {
      this.active = false;
    }
  }
}
