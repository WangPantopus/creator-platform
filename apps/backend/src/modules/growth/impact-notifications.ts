import { formatCopy } from "@qelvora/copy";
import { z } from "zod";
import type { GrowthOwners } from "./contracts.js";
import type { NotificationReadFacts } from "./notification-custody.js";
import { weeklyImpactBinding } from "./weekly-impact.js";

/** Genuine owner/current recipient authority reads the exact closed digest
 * inside its actual purpose/denial scope. No fan text/identity enters previews. */
export interface WeeklyImpactNoticeReader {
  current(
    input: { creatorId: string; accountId: string; window: string },
    facts: NotificationReadFacts,
  ): Promise<{
    creatorId: string;
    accountId: string;
    window: string;
    creatorName: string;
    peopleHelped: number;
    thanksCount: number;
  } | null>;
}
const CurrentImpact = z.strictObject({
  creatorId: z.uuid(),
  accountId: z.uuid(),
  window: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  creatorName: z.string().min(1).max(80),
  peopleHelped: z.int().min(0).max(2147483647),
  thanksCount: z.int().min(0).max(2147483647),
});

export function weeklyImpactNotificationState(
  reader?: WeeklyImpactNoticeReader,
): GrowthOwners["notificationState"] {
  return async (event, recipient, custody) => {
    const unavailable = {
      available: false,
      authorized: false,
      version: 0,
      creatorName: "",
      authorKind: "system" as const,
      safePreview: "",
      destination: "/studio/impact",
    };
    if (event.type !== "weekly_impact")
      return { ...unavailable, retryable: true };
    let binding;
    try {
      binding = weeklyImpactBinding(event);
    } catch {
      // Preserve a legacy authoritative row as unavailable without letting a
      // former event shape break the rest of the current inbox.
      return {
        ...unavailable,
        authorized: true,
        version: event.aggregateVersion,
      };
    }
    if (
      recipient.role !== "creator" ||
      recipient.accountId !== binding.accountId
    )
      return unavailable;
    if (!reader || !custody) return { ...unavailable, retryable: true };
    const supplied = await custody.withCurrent((facts) => {
      if (
        facts.creatorId !== binding.creatorId ||
        facts.accountId !== binding.accountId ||
        facts.eventId !== event.id ||
        facts.aggregateId !== event.aggregateId
      )
        throw new Error("impact_notification_custody_unavailable");
      return reader.current(
        {
          creatorId: binding.creatorId,
          accountId: binding.accountId,
          window: binding.window,
        },
        facts,
      );
    });
    if (!supplied) return unavailable;
    const current = CurrentImpact.parse(supplied);
    if (
      current.creatorId !== binding.creatorId ||
      current.accountId !== binding.accountId ||
      current.window !== binding.window
    )
      return unavailable;
    return {
      ...unavailable,
      available: true,
      authorized: true,
      version: 1,
      creatorName: current.creatorName,
      safePreview: formatCopy("growthWeeklyImpactSummary", {
        people: current.peopleHelped,
        thanks: current.thanksCount,
      }),
    };
  };
}
