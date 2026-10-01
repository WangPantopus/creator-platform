import { copy, formatCopy } from "@qelvora/copy";
import { createHash, randomUUID } from "node:crypto";
import { DomainError } from "../../core/errors.js";
import { canonical } from "../../core/canonical.js";
import {
  Destination,
  EventEnvelope,
  Preferences,
  defaultPreferences,
  type GrowthOwners,
  type NotificationKind,
  type NotificationPreferences,
  type NotificationState,
} from "./contracts.js";
import type { GrowthDatabase } from "./database.js";
import type { GrowthErasure } from "./erasure.js";

const authorKinds: Record<
  NotificationKind,
  readonly NotificationState["authorKind"][]
> = {
  ai_reply: ["ai"],
  approved_draft: ["approved_draft"],
  personal_reply: ["human_creator", "human_call"],
  request_status: ["system"],
  call_reminder: ["system"],
  answered_publicly: ["system"],
  content_match: ["system"],
  announcement: ["human_broadcast", "team"],
  creator_offer: ["human_creator"],
  slot_change: ["system"],
  new_packet: ["system"],
  commitment_due: ["system"],
  guardrail: ["system"],
  pool_share: ["system"],
  note: ["human_broadcast"],
  reaction: ["human_reaction"],
  public_answer: ["system"],
  spending_reminder: ["system"],
  weekly_impact: ["system"],
};
const roles: Record<NotificationKind, readonly string[]> = {
  ai_reply: ["fan"],
  approved_draft: ["fan"],
  personal_reply: ["fan"],
  request_status: ["fan"],
  call_reminder: ["fan", "creator"],
  answered_publicly: ["fan"],
  content_match: ["fan"],
  announcement: ["fan"],
  creator_offer: ["fan"],
  slot_change: ["fan"],
  new_packet: ["creator", "team"],
  commitment_due: ["creator"],
  guardrail: ["creator", "ops"],
  pool_share: ["creator"],
  note: ["fan"],
  reaction: ["fan"],
  public_answer: ["fan"],
  spending_reminder: ["fan"],
  weekly_impact: ["creator"],
};
export function present(type: NotificationKind, state: NotificationState) {
  if (!authorKinds[type].includes(state.authorKind))
    throw new DomainError(
      "notification_author_mismatch",
      copy.growthErrorNotificationAuthorMismatch,
      409,
    );
  if (type === "content_match" && !state.contentMatchConsent)
    throw new DomainError(
      "content_match_consent_required",
      copy.growthErrorContentMatchConsentRequired,
    );
  const name = state.creatorName;
  let sender: string = copy.growthSystem;
  switch (type) {
    case "ai_reply":
      sender = formatCopy("aiAuthor", { name });
      break;
    case "approved_draft":
      sender = formatCopy("approvedNotification", { name });
      break;
    case "personal_reply":
    case "creator_offer":
      sender = name;
      break;
    case "announcement":
      sender =
        state.authorKind === "team"
          ? state.teamName
            ? formatCopy("teamAuthor", { name, member: state.teamName })
            : formatCopy("growthCreatorTeam", { name })
          : formatCopy("noteAudience", {
              name,
              audience: state.audienceLabel ?? copy.growthFollowers,
            });
      break;
    case "note":
      if (!state.audienceLabel)
        throw new DomainError(
          "audience_label_required",
          copy.growthErrorAudienceLabelRequired,
          409,
        );
      sender = formatCopy("noteAudience", {
        name,
        audience: state.audienceLabel,
      });
      break;
    case "reaction":
      sender = formatCopy("reaction", { name });
      break;
  }
  // These types never accept a preview carrying financial or private source material.
  const restrictedPreviewTypes: NotificationKind[] = [
    "request_status",
    "call_reminder",
    "answered_publicly",
    "content_match",
    "public_answer",
    "guardrail",
    "pool_share",
    "spending_reminder",
  ];
  let preview = state.safePreview.slice(0, 240);
  if (restrictedPreviewTypes.includes(type))
    preview = preview.replace(
      /(?:[$€£¥]\s*[\d,.]+|\b[\d,.]+\s*(?:USD|EUR|GBP)\b)/giu,
      copy.growthAmountHidden,
    );
  if (
    type === "call_reminder" &&
    !["scheduled", "joinable"].includes(state.status ?? "")
  )
    return null;
  // Provider queues cannot prevent a late lock-screen delivery; keep call copy safe.
  if (type === "call_reminder") preview = copy.growthCallUpdate;
  return {
    sender,
    preview,
    destination: Destination.parse(state.destination),
    authorship:
      state.authorKind === "ai"
        ? ("ai" as const)
        : state.authorKind === "approved_draft"
          ? ("approved" as const)
          : state.authorKind.startsWith("human")
            ? ("human" as const)
            : ("system" as const),
  };
}
export interface DeliveryProvider {
  send(input: {
    channel: "push" | "email";
    accountId: string;
    notificationId: string;
    idempotencyKey: string;
    /** Actual held email delivery lease, used for durable provider receipts. */
    deliveryIds?: string[];
    leaseId?: string;
    sender: string;
    preview: string;
    destination: string;
    authorship: "human" | "ai" | "approved" | "system";
    entries?: {
      sender: string;
      preview: string;
      destination: string;
      authorship: "human" | "ai" | "approved" | "system";
    }[];
  }): Promise<{ providerRef: string }>;
}
export class DeliveryFailure extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    readonly permanent = false,
  ) {
    super("delivery_unavailable");
  }
}
/** A bounded device batch made durable progress; it did not fail delivery. */
export class DeliveryProgress extends Error {
  constructor() {
    super("delivery_pending_devices");
  }
}
class QuietDelivery extends DeliveryFailure {
  constructor() {
    super(900);
  }
}
export function quietNow(preferences: NotificationPreferences, now: Date) {
  if (preferences.quietStart === null || preferences.quietEnd === null)
    return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: preferences.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const minute =
    Number(parts.find((p) => p.type === "hour")?.value) * 60 +
    Number(parts.find((p) => p.type === "minute")?.value);
  const start = preferences.quietStart,
    end = preferences.quietEnd;
  return (
    start === end ||
    (start < end
      ? minute >= start && minute < end
      : minute >= start || minute < end)
  );
}
export class Notifications {
  constructor(
    private readonly db: GrowthDatabase,
    private readonly owners: GrowthOwners,
    private readonly erasure: GrowthErasure,
    private readonly provider?: DeliveryProvider,
  ) {}
  async consume(input: unknown) {
    const event = EventEnvelope.parse(input);
    const envelopeHash = createHash("sha256")
      .update(canonical(event))
      .digest("hex");
    // Owner authorization is checked before any durable recipient record exists.
    const states = await Promise.all(
      event.recipients.map(async (recipient) => ({
        recipient,
        state: await this.owners.notificationState(event, recipient),
      })),
    );
    if (states.some(({ state }) => state.retryable))
      throw new DomainError(
        "notification_owner_unconfigured",
        copy.growthErrorNotificationOwnerUnconfigured,
        503,
      );
    return this.db.transaction(this.db.worker, async (client) => {
      const retained = await this.erasure.event(client, event);
      if (!retained) return { duplicate: false, created: 0 };
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [event.id],
      );
      const prior = await client.query(
        "SELECT envelope_hash FROM growth.event_inbox WHERE id=$1",
        [event.id],
      );
      if (prior.rowCount) {
        if (prior.rows[0].envelope_hash !== envelopeHash)
          throw new DomainError(
            "event_id_conflict",
            copy.growthErrorEventIdConflict,
            409,
          );
        return { duplicate: true, created: 0 };
      }
      await client.query(
        "INSERT INTO growth.event_inbox(id,envelope,envelope_hash) VALUES($1,$2,$3)",
        [event.id, retained, envelopeHash],
      );
      let created = 0;
      for (const { recipient, state } of states) {
        if (
          !retained.recipients.some(
            (r) =>
              r.accountId === recipient.accountId && r.role === recipient.role,
          ) ||
          !state.available ||
          !state.authorized ||
          state.version < event.aggregateVersion ||
          !roles[event.type].includes(recipient.role)
        )
          continue;
        const view = present(event.type, state);
        if (!view) continue;
        const result = await client.query(
          "INSERT INTO growth.notification(event_id,account_id,creator_id,role,type,sender,preview,destination) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id",
          [
            event.id,
            recipient.accountId,
            event.creatorId,
            recipient.role,
            event.type,
            view.sender,
            view.preview,
            view.destination,
          ],
        );
        if (!result.rowCount) continue;
        created++;
        for (const channel of ["push", "email"])
          await client.query(
            "INSERT INTO growth.delivery(notification_id,account_id,channel,available_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
            [
              result.rows[0].id,
              recipient.accountId,
              channel,
              channel === "email"
                ? digestDue(recipient.role, new Date())
                : new Date(),
            ],
          );
      }
      return { duplicate: false, created };
    });
  }
  async drain(limit = 25) {
    const boundedLimit = Math.min(Math.max(limit, 1), 100);
    let claimed = 0;
    for (let batch = 0; batch < boundedLimit; batch++) {
      const leaseId = randomUUID();
      const jobs = await this.db.transaction(
        this.db.worker,
        async (client) =>
          (
            await client.query(
              `WITH picked AS (SELECT id FROM growth.delivery WHERE channel='push' AND ((state='queued' AND available_at<=now()) OR (state='leased' AND lease_until<now())) ORDER BY available_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      UPDATE growth.delivery d SET state='leased',lease_until=now()+interval '60 seconds',lease_id=$2,attempts=attempts+1 FROM picked WHERE d.id=picked.id RETURNING d.*`,
              [1, leaseId],
            )
          ).rows,
      );
      const job = jobs[0];
      if (!job) break;
      claimed++;
      try {
        const result = await this.db.worker.query(
          `SELECT n.*,e.envelope,p.document AS preference FROM growth.notification n JOIN growth.event_inbox e ON e.id=n.event_id LEFT JOIN growth.preference p ON p.account_id=n.account_id WHERE n.id=$1`,
          [job.notification_id],
        );
        const notification = result.rows[0];
        const event = EventEnvelope.parse(notification.envelope);
        const recipient = event.recipients.find(
          (r) => r.accountId === job.account_id,
        );
        if (!recipient) throw new Error("recipient_missing");
        const state = await this.owners.notificationState(event, recipient);
        if (state.retryable) throw new Error("notification_owner_unconfigured");
        const prefs = (notification.preference ??
          defaultPreferences) as NotificationPreferences;
        const channel = job.channel as "push" | "email";
        const disabled =
          channel === "push"
            ? prefs.disabledPushTypes
            : prefs.disabledEmailTypes;
        if (
          !state.available ||
          !state.authorized ||
          state.version < event.aggregateVersion ||
          !prefs[channel] ||
          prefs.mutedCreators.includes(event.creatorId) ||
          disabled.includes(event.type)
        ) {
          await this.finish(job.id, leaseId, "suppressed");
          continue;
        }
        if (quietNow(prefs, new Date())) {
          await this.db.worker.query(
            "UPDATE growth.delivery SET state='queued',available_at=now()+interval '15 minutes',attempts=greatest(0,attempts-1),lease_until=NULL WHERE id=$1 AND lease_id=$2",
            [job.id, leaseId],
          );
          continue;
        }
        const view = present(event.type, state);
        if (!view) {
          await this.finish(job.id, leaseId, "suppressed");
          continue;
        }
        if (!this.provider) throw new Error("provider_unconfigured");
        await this.db.transaction(this.db.worker, async (client) => {
          const retained = await this.erasure.event(client, event);
          if (!retained?.recipients.some((r) => r.accountId === job.account_id))
            return;
          if (
            !(
              await client.query(
                "SELECT 1 FROM growth.delivery WHERE id=$1 AND lease_id=$2 AND state='leased' AND lease_until>clock_timestamp() FOR NO KEY UPDATE",
                [job.id, leaseId],
              )
            ).rowCount
          )
            return;
          // Account controls use this same erasure fence. Read preferences
          // after acquiring it and hold it through provider submission so a
          // completed opt-out/mute cannot be bypassed by an earlier read.
          const currentPrefs = Preferences.parse(
            (
              await client.query(
                "SELECT document FROM growth.preference WHERE account_id=$1",
                [job.account_id],
              )
            ).rows[0]?.document ?? defaultPreferences,
          );
          if (
            !currentPrefs.push ||
            currentPrefs.mutedCreators.includes(event.creatorId) ||
            currentPrefs.disabledPushTypes.includes(event.type)
          ) {
            await client.query(
              "UPDATE growth.delivery SET state='suppressed',lease_until=NULL WHERE id=$1 AND lease_id=$2 AND state='leased'",
              [job.id, leaseId],
            );
            return;
          }
          if (quietNow(currentPrefs, new Date())) {
            await client.query(
              "UPDATE growth.delivery SET state='queued',available_at=now()+interval '15 minutes',attempts=greatest(0,attempts-1),lease_until=NULL WHERE id=$1 AND lease_id=$2 AND state='leased'",
              [job.id, leaseId],
            );
            return;
          }
          const delivered = await this.provider!.send({
            channel,
            accountId: job.account_id,
            notificationId: notification.id,
            idempotencyKey: job.id,
            sender: view.sender,
            preview: currentPrefs.hideSensitive
              ? copy.growthHiddenUpdate
              : view.preview,
            destination: view.destination,
            authorship: view.authorship,
          });
          await client.query(
            "UPDATE growth.delivery SET state='sent',provider_ref=$3,lease_until=NULL,last_error=NULL WHERE id=$1 AND lease_id=$2",
            [job.id, leaseId, delivered.providerRef],
          );
        });
      } catch (error) {
        if (error instanceof DeliveryProgress) {
          await this.db.worker.query(
            "UPDATE growth.delivery SET state='queued',attempts=greatest(0,attempts-1),available_at=now()+interval '1 second',lease_until=NULL,last_error=NULL WHERE id=$1 AND lease_id=$2 AND state='leased'",
            [job.id, leaseId],
          );
          continue;
        }
        await this.db.worker.query(
          "UPDATE growth.delivery SET state=$3,available_at=now()+($4*interval '1 second'),lease_until=NULL,last_error='delivery_unavailable' WHERE id=$1 AND lease_id=$2 AND state='leased'",
          [
            job.id,
            leaseId,
            job.attempts >= 8 ||
            (error instanceof DeliveryFailure && error.permanent)
              ? "dead"
              : "queued",
            Math.max(
              error instanceof DeliveryFailure ? error.retryAfterSeconds : 0,
              Math.min(3600, 15 * 2 ** job.attempts),
            ),
          ],
        );
      }
    }
    return {
      claimed: claimed + (await this.drainEmail(boundedLimit)),
    };
  }
  private async drainEmail(limit: number) {
    let claimed = 0;
    for (let batch = 0; batch < limit; batch++) {
      const leaseId = randomUUID();
      const jobs = await this.db.transaction(this.db.worker, async (client) => {
        const candidate = (
          await client.query(
            "SELECT * FROM growth.delivery WHERE channel='email' AND ((state='queued' AND available_at<=now()) OR (state='leased' AND lease_until<now())) ORDER BY available_at LIMIT 1 FOR UPDATE SKIP LOCKED",
          )
        ).rows[0];
        if (!candidate) return [];
        if (
          !(
            await client.query(
              "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked",
              [candidate.account_id],
            )
          ).rows[0].locked
        )
          return [];
        const digestId = candidate.digest_id ?? randomUUID();
        const picked = (
          await client.query(
            `SELECT id FROM growth.delivery WHERE channel='email' AND account_id=$1 AND ((digest_id=$2) OR (digest_id IS NULL AND available_at<=$3)) AND ((state='queued' AND available_at<=now()) OR (state='leased' AND lease_until<now())) ORDER BY available_at,id LIMIT 100 FOR UPDATE SKIP LOCKED`,
            [candidate.account_id, digestId, candidate.available_at],
          )
        ).rows.map((row) => row.id);
        return (
          await client.query(
            "UPDATE growth.delivery SET state='leased',digest_id=$2,lease_id=$3,lease_until=now()+interval '120 seconds',attempts=attempts+1 WHERE id=ANY($1::uuid[]) RETURNING *",
            [picked, digestId, leaseId],
          )
        ).rows;
      });
      if (!jobs.length) break;
      claimed += jobs.length;
      const eligible: typeof jobs = [];
      const eligibleEvents: ReturnType<typeof EventEnvelope.parse>[] = [];
      const entries: NonNullable<
        Parameters<DeliveryProvider["send"]>[0]["entries"]
      > = [];
      try {
        for (const job of jobs) {
          const row = (
            await this.db.worker.query(
              "SELECT n.*,e.envelope,p.document AS preference FROM growth.notification n JOIN growth.event_inbox e ON e.id=n.event_id LEFT JOIN growth.preference p ON p.account_id=n.account_id WHERE n.id=$1",
              [job.notification_id],
            )
          ).rows[0];
          const event = EventEnvelope.parse(row.envelope),
            recipient = event.recipients.find(
              (r) => r.accountId === job.account_id,
            );
          if (!recipient) {
            await this.finish(job.id, leaseId, "suppressed");
            continue;
          }
          const state = await this.owners.notificationState(event, recipient),
            prefs = Preferences.parse(row.preference ?? defaultPreferences);
          if (state.retryable)
            throw new Error("notification_owner_unconfigured");
          if (
            !state.available ||
            !state.authorized ||
            state.version < event.aggregateVersion ||
            !prefs.email ||
            prefs.mutedCreators.includes(event.creatorId) ||
            prefs.disabledEmailTypes.includes(event.type)
          ) {
            await this.finish(job.id, leaseId, "suppressed");
            continue;
          }
          const view = present(event.type, state);
          if (!view) {
            await this.finish(job.id, leaseId, "suppressed");
            continue;
          }
          if (quietNow(prefs, new Date())) throw new QuietDelivery();
          eligible.push(job);
          eligibleEvents.push(event);
          entries.push(view);
        }
        if (!entries.length) continue;
        if (!this.provider) throw new DeliveryFailure(60);
        await this.db.transaction(this.db.worker, async (client) => {
          await this.erasure.lockEvents(client, eligibleEvents);
          const current = await client.query(
            "SELECT id FROM growth.delivery WHERE id=ANY($1::uuid[]) AND lease_id=$2 AND state='leased' AND lease_until>clock_timestamp() FOR NO KEY UPDATE",
            [eligible.map((job) => job.id), leaseId],
          );
          // Purge may have completed while owners were being read. Rebuild on the next lease.
          if (current.rowCount !== eligible.length) return;
          const currentPrefs = Preferences.parse(
            (
              await client.query(
                "SELECT document FROM growth.preference WHERE account_id=$1",
                [jobs[0]!.account_id],
              )
            ).rows[0]?.document ?? defaultPreferences,
          );
          const sendingJobs: typeof jobs = [];
          const sendingEntries: typeof entries = [];
          for (let index = 0; index < eligible.length; index++) {
            const job = eligible[index]!,
              event = eligibleEvents[index]!;
            if (
              !currentPrefs.email ||
              currentPrefs.mutedCreators.includes(event.creatorId) ||
              currentPrefs.disabledEmailTypes.includes(event.type)
            ) {
              await client.query(
                "UPDATE growth.delivery SET state='suppressed',lease_until=NULL WHERE id=$1 AND lease_id=$2 AND state='leased'",
                [job.id, leaseId],
              );
              continue;
            }
            sendingJobs.push(job);
            sendingEntries.push({
              ...entries[index]!,
              preview: currentPrefs.hideSensitive
                ? copy.growthHiddenUpdate
                : entries[index]!.preview,
            });
          }
          if (!sendingEntries.length) return;
          if (quietNow(currentPrefs, new Date())) throw new QuietDelivery();
          const first = sendingEntries[0]!;
          const result = await this.provider!.send({
            channel: "email",
            accountId: jobs[0]!.account_id,
            notificationId: sendingJobs[0]!.notification_id,
            idempotencyKey: jobs[0]!.digest_id,
            deliveryIds: sendingJobs.map((job) => job.id),
            leaseId,
            sender: copy.growthYourUpdates,
            preview: first.preview,
            destination: "/notifications",
            authorship: "system",
            entries: sendingEntries,
          });
          await client.query(
            "UPDATE growth.delivery SET state='sent',provider_ref=$3,lease_until=NULL,last_error=NULL WHERE id=ANY($1::uuid[]) AND lease_id=$2",
            [sendingJobs.map((job) => job.id), leaseId, result.providerRef],
          );
        });
      } catch (error) {
        if (error instanceof QuietDelivery) {
          await this.db.worker.query(
            "UPDATE growth.delivery SET state='queued',attempts=greatest(0,attempts-1),available_at=now()+interval '15 minutes',lease_until=NULL WHERE id=ANY($1::uuid[]) AND lease_id=$2 AND state='leased'",
            [jobs.map((job) => job.id), leaseId],
          );
          continue;
        }
        await this.db.worker.query(
          "UPDATE growth.delivery SET state=CASE WHEN attempts>=8 OR $3 THEN 'dead' ELSE 'queued' END,available_at=now()+($4*interval '1 second'),lease_until=NULL,last_error='delivery_unavailable' WHERE id=ANY($1::uuid[]) AND lease_id=$2 AND state='leased'",
          [
            jobs.map((job) => job.id),
            leaseId,
            error instanceof DeliveryFailure && error.permanent,
            Math.max(
              error instanceof DeliveryFailure ? error.retryAfterSeconds : 60,
              Math.min(3600, 15 * 2 ** Number(jobs[0]?.attempts ?? 1)),
            ),
          ],
        );
      }
    }
    return claimed;
  }
  private async finish(id: string, leaseId: string, state: string) {
    await this.db.worker.query(
      "UPDATE growth.delivery SET state=$3,lease_until=NULL WHERE id=$1 AND lease_id=$2",
      [id, leaseId, state],
    );
  }
  async listCurrent(
    rows: {
      id: string;
      event_id: string;
      account_id: string;
      sender: string;
      preview: string;
      destination: string;
      type: string;
      read_at: string | null;
      created_at: string;
    }[],
  ) {
    const output = [];
    const envelopes = (
      await this.db.worker.query(
        "SELECT id,envelope FROM growth.event_inbox WHERE id=ANY($1::uuid[])",
        [rows.map((row) => row.event_id)],
      )
    ).rows;
    const byId = new Map(envelopes.map((row) => [row.id, row.envelope]));
    for (const row of rows) {
      const raw = byId.get(row.event_id);
      if (!raw) continue;
      const event = EventEnvelope.parse(raw);
      const recipient = event.recipients.find(
        (r) => r.accountId === row.account_id,
      );
      if (!recipient) continue;
      const state = await this.owners.notificationState(event, recipient);
      if (state.retryable)
        throw new DomainError(
          "notification_owner_unconfigured",
          copy.growthErrorNotificationOwnerUnconfigured2,
          503,
        );
      if (!state.authorized) continue;
      const current = state.available ? present(event.type, state) : null;
      output.push({
        id: row.id,
        type: row.type,
        sender: current?.sender ?? row.sender,
        authorKind: state.available ? state.authorKind : "system",
        creatorName: state.creatorName,
        preview: current?.preview ?? copy.growthUpdateUnavailable,
        destination: current?.destination ?? "/notifications",
        readAt: row.read_at,
        createdAt: row.created_at,
      });
    }
    return output;
  }
}

function digestDue(role: string, now: Date) {
  const due = new Date(now);
  due.setUTCHours(0, 0, 0, 0);
  due.setUTCDate(
    due.getUTCDate() + (role === "fan" ? (8 - due.getUTCDay()) % 7 || 7 : 1),
  );
  return due;
}
