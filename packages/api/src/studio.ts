import { z } from "zod";
import { TeamRoleSchema } from "./identity.ts";
import {
  ContentKey,
  ContentVersionCommand,
  PublishContent,
} from "./content.ts";

/** C08 Studio commands preserve the producing domain's authority and versions. */
export const StudioInvite = z.strictObject({
  handle: z
    .string()
    .trim()
    .regex(/^@?[a-zA-Z0-9_]{3,30}$/u),
  roles: z.array(TeamRoleSchema).min(1).max(4),
});
export const StudioQueueQuery = z.strictObject({
  cursor: z.uuid().optional(),
  filter: z.enum(["all", "due", "decide", "more_info"]).default("all"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const StudioSaveReplyDraft = z.strictObject({
  text: z.string().max(20000),
  expectedVersion: z.int().nonnegative(),
  idempotencyKey: ContentKey,
});
export const StudioSendReplyDraft = PublishContent;
export const StudioCorrection = z.strictObject({
  idempotencyKey: ContentKey,
  expectedRevision: z.int().nonnegative(),
  paraphrasedPrompt: z.string().min(5).max(1000),
  rule: z.string().min(5).max(500),
  unacceptableAnswer: z.string().max(3000),
});
export const StudioRevision = z.strictObject({
  revision: z.int().nonnegative(),
});
export const StudioDraftVersion = z.strictObject({
  version: z.int().positive(),
});
export const StudioReplyDraft = z.strictObject({
  text: z.string(),
  version: z.int().nonnegative(),
  sentMessageId: z.uuid().nullable(),
});
export const StudioSession = z.strictObject({
  creators: z.array(
    z.strictObject({
      id: z.uuid(),
      display_name: z.string(),
      handle: z.string(),
      verification: z.string(),
      owned: z.boolean(),
      roles: z.array(TeamRoleSchema),
      memberHandle: z.string().nullable(),
      viewerAccountId: z.uuid(),
    }),
  ),
  invitations: z.array(
    z.strictObject({
      id: z.uuid(),
      creatorId: z.uuid(),
      creatorName: z.string(),
      roles: z.array(TeamRoleSchema),
      expiresAt: z.iso.datetime({ offset: true }),
    }),
  ),
  serverTime: z.iso.datetime({ offset: true }),
});
export const StudioAudiences = z.strictObject({
  audienceCountsAvailable: z.boolean(),
  tiers: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
  groups: z.array(z.strictObject({ id: z.uuid(), name: z.string() })),
});
export const StudioInvitation = z.object({
  id: z.uuid(),
  roles: z.array(TeamRoleSchema),
  creatorId: z.uuid().optional(),
  accountId: z.uuid().optional(),
  expiresAt: z.iso.datetime({ offset: true }).optional(),
  accepted: z.boolean().optional(),
});
// The producing domains own these projections. JSON preserves their current
// shapes without declaring competing W5 packet, settlement or thread records.
export const StudioCommerceProjection = z
  .json()
  .describe(
    "Current canonical W2 correction, W3 conversation or W4 commerce projection; never a W5 settlement or conversation record.",
  );
export const StudioTeam = z.strictObject({
  members: z.array(
    z.strictObject({
      account_id: z.uuid(),
      roles: z.array(TeamRoleSchema),
      revoked_at: z.iso.datetime({ offset: true }).nullable(),
      handle: z.string().nullable(),
    }),
  ),
  invitations: z.array(
    z.strictObject({
      id: z.uuid(),
      account_id: z.uuid(),
      handle: z.string().nullable(),
      roles: z.array(TeamRoleSchema),
      expires_at: z.iso.datetime({ offset: true }),
      accepted_at: z.iso.datetime({ offset: true }).nullable(),
      revoked_at: z.iso.datetime({ offset: true }).nullable(),
    }),
  ),
});
export const StudioControlCommand = z.strictObject({
  idempotencyKey: ContentKey,
});
export const StudioThreadEntries = z.strictObject({
  items: z.array(
    z.strictObject({
      fanId: z.uuid(),
      handle: z.string(),
      sources: z.array(z.enum(["note_reply", "request"])),
      updatedAt: z.iso.datetime({ offset: true }),
    }),
  ),
  nextCursor: z.uuid().nullable(),
  coverage: z.literal("notes_and_requests"),
});
export const studioSchemas = {
  StudioInvite,
  StudioQueueQuery,
  StudioSaveReplyDraft,
  StudioSendReplyDraft,
  StudioCorrection,
  StudioRevision,
  StudioDraftVersion,
  StudioReplyDraft,
  StudioSession,
  StudioAudiences,
  StudioInvitation,
  StudioCommerceProjection,
  StudioTeam,
  StudioControlCommand,
  StudioThreadEntries,
};
// Keep the exact publication version command available to Studio consumers.
export { ContentVersionCommand };
