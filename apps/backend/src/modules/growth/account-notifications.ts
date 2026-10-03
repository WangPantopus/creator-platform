import type { Pool, PoolClient } from "pg";
import { copy, formatCopy } from "@qelvora/copy";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import type { GrowthOwners } from "./contracts.js";
import type { NotificationReadFacts } from "./notification-custody.js";

/** W4 reads its actual account-purpose scope. Its current result must recheck
 * opt-in, cap/version, currency/month and the original captured threshold.
 * A still-owned notice returns eligible=false after an opt-out or stale cap;
 * null means the current account cannot read that notice. The in-app record
 * remains authoritative even when optional delivery is no longer eligible.
 * Neither amounts nor a synthetic creator enter this notification boundary. */
export interface SpendingNotificationReader {
  current(
    input: { accountId: string; noticeId: string },
    facts: NotificationReadFacts,
  ): Promise<{
    accountId: string;
    noticeId: string;
    version: number;
    threshold: 50 | 100;
    eligible: boolean;
  } | null>;
}

const CurrentNotice = z.strictObject({
  accountId: z.uuid(),
  noticeId: z.uuid(),
  version: z.int().positive(),
  threshold: z.union([z.literal(50), z.literal(100)]),
  eligible: z.boolean(),
});

export function spendingNotificationState(
  owner?: SpendingNotificationReader,
): GrowthOwners["notificationState"] {
  return async (event, recipient, custody) => {
    const unavailable = {
      available: false,
      authorized: false,
      version: 0,
      creatorName: "",
      authorKind: "system" as const,
      safePreview: "",
      destination: "/commerce/spending",
    };
    if (event.type !== "spending_reminder")
      return { ...unavailable, retryable: true };
    // An existing v1 row stays safely unavailable. Never reinterpret its
    // creator as this fan's portfolio or let it break unrelated inbox rows.
    if (event.creatorId !== null)
      return {
        ...unavailable,
        authorized: true,
        version: event.aggregateVersion,
      };
    if (!owner || !custody) return { ...unavailable, retryable: true };
    if (recipient.role !== "fan" || recipient.accountId !== event.accountId)
      return unavailable;
    const supplied = await custody.withCurrent((facts) => {
      if (
        facts.accountId !== event.accountId ||
        facts.eventId !== event.id ||
        facts.aggregateId !== event.aggregateId
      )
        throw new DomainError(
          "notification_read_custody_unavailable",
          copy.growthErrorNotificationUnavailable,
          503,
        );
      return owner.current(
        { accountId: event.accountId, noticeId: event.aggregateId },
        facts,
      );
    });
    if (!supplied) return unavailable;
    const current = CurrentNotice.parse(supplied);
    if (
      current.accountId !== event.accountId ||
      current.noticeId !== event.aggregateId
    )
      return unavailable;
    if (!current.eligible || current.version < event.aggregateVersion)
      return { ...unavailable, authorized: true, version: current.version };
    return {
      ...unavailable,
      available: true,
      authorized: true,
      version: current.version,
      safePreview: formatCopy("growthSpendingLimitReached", {
        percent: current.threshold,
      }),
    };
  };
}

/** An unapplied proposal cannot turn an owner outbox acknowledgment into a
 * lost notification. Existing creator-scoped delivery remains usable. */
export async function requireAccountNotificationSchema(
  db: Pick<Pool | PoolClient, "query">,
) {
  const row = (
    await db.query(`SELECT
    EXISTS(SELECT FROM pg_attribute WHERE attrelid='growth.notification'::regclass AND attname='creator_id' AND NOT attnotnull AND NOT attisdropped)
    AND EXISTS(SELECT FROM pg_attribute WHERE attrelid='growth.producer_relay'::regclass AND attname='creator_id' AND NOT attnotnull AND NOT attisdropped)
    AND EXISTS(SELECT FROM pg_attribute WHERE attrelid='growth.producer_relay'::regclass AND attname='account_id' AND atttypid='uuid'::regtype AND NOT attisdropped)
    AND EXISTS(SELECT FROM pg_constraint WHERE conrelid='growth.notification'::regclass AND conname='notification_account_scope' AND convalidated)
    AND EXISTS(SELECT FROM pg_constraint WHERE conrelid='growth.producer_relay'::regclass AND conname='producer_relay_account_scope' AND convalidated)
    AND EXISTS(SELECT FROM pg_trigger WHERE tgrelid='growth.notification'::regclass AND tgname='notification_account_recipient' AND tgenabled='O' AND NOT tgisinternal)
    AS ready`)
  ).rows[0];
  if (!row?.ready)
    throw new DomainError(
      "growth_account_notification_migration_required",
      copy.growthErrorGrowthMigrationRequired,
      503,
    );
}
