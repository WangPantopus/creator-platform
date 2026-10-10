import { z } from "zod";

/** Creator-authored public words. Identity, verification and AI state remain
 * with their existing owners. Limits match the C8 public projection. */
const profileWords = {
  biography: z
    .string()
    .max(600)
    .refine((value) => !value.includes("\0")),
  category: z
    .string()
    .max(60)
    .refine((value) => !value.includes("\0")),
  photoCaption: z
    .string()
    .max(100)
    .refine((value) => !value.includes("\0")),
};
export const CreatorProfileFieldsInputSchema = z.strictObject({
  version: z.int().min(0).max(2147483646),
  ...profileWords,
});
export const CreatorProfileFieldsSchema = z.strictObject({
  version: z.int().min(0).max(2147483647),
  ...profileWords,
});
export type CreatorProfileFields = z.infer<typeof CreatorProfileFieldsSchema>;

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
