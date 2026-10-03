import { z } from "zod";

/** Historical delivery metadata, never publication access or signing authority.
 * The destination is derived locally; no supplied URL or private body is used. */
export const ConversationSystemLinkSchema = z.strictObject({
  kind: z.literal("published_answer"),
  creatorId: z.uuid(),
  contentId: z.uuid(),
  contentVersion: z.int().positive(),
  label: z.literal("Answered publicly."),
});
export type ConversationSystemLink = z.infer<
  typeof ConversationSystemLinkSchema
>;
