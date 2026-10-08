import { z } from "zod";
import record from "../../../../../docs/operations/W8-approved-retention-20261002.json" with { type: "json" };

/** The product owner's decision, not provider evidence or privacy registration.
 * Build/source execution read the same checked-in functional policy record. */
const approved = z
  .object({
    version: z.literal("w8-product-retention-20261007-v2"),
    detachedKnownAIAccounting: z.object({
      retainCalendarMonths: z.literal(12),
      from: z.literal("original-settlement"),
      detachAccountIdentityAndPrivateText: z.literal(true),
      preserveOriginalAmountsAndReferences: z.literal(true),
    }),
    unresolvedAIAccounting: z.object({
      status: z.literal("approved-product-policy"),
      escalationAfterDays: z.literal(30),
      operator: z.literal("project-owner"),
      maximumUnresolvedPeriod: z.object({
        days: z.literal(90),
        from: z.literal("original-durable-unknown-cost-record"),
        restartOnRetryRestorationOrDeletion: z.literal(false),
      }),
      preserveUnknownStateAndReservationCeiling: z.literal(true),
    }),
  })
  .parse(record);

export const accountingRetentionPolicy = Object.freeze({
  version: approved.version,
  knownCalendarMonths: approved.detachedKnownAIAccounting.retainCalendarMonths,
  unknownEscalationDays: approved.unresolvedAIAccounting.escalationAfterDays,
  unknownMaximumDays:
    approved.unresolvedAIAccounting.maximumUnresolvedPeriod.days,
  unknownOperator: approved.unresolvedAIAccounting.operator,
});
