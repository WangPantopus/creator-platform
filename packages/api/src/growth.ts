import { z } from "zod";

/** Current signed-in post metadata. This reference grants no body read,
 * processor consent, generation source or continuing permission. */
export const PostEntryContextSchema = z.strictObject({
  source: z.literal("post"),
  creatorId: z.uuid(),
  contentId: z.uuid(),
  version: z.int().positive().max(2147483647),
  title: z.string().max(180),
  destination: z
    .string()
    .regex(/^\/creators\/[a-z0-9_]{3,30}\/posts\/[0-9a-f-]{36}$/u),
});
export type PostEntryContext = z.infer<typeof PostEntryContextSchema>;
export const PostEntryContextResponseSchema = z.strictObject({
  context: PostEntryContextSchema,
});
