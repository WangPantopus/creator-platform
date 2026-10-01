import { z } from "zod";
import { IdSchema, MessageSchema } from "../schemas.ts";

// Use W3's exact namespaced contract without adding it to shared C03/generation.
export {
  ConversationCorrectionCommandSchema,
  ConversationCorrectionInputSchema,
} from "./contracts.ts";
import { ConversationCorrectionInputSchema } from "./contracts.ts";
export type ConversationCorrectionInput = z.infer<
  typeof ConversationCorrectionInputSchema
>;

// Bounded projection of W3's actual message readback. Other producer fields
// (citations, provider lineage and feedback) are not authority for this editor.
export const ConversationCorrectionMessageSchema = z.object({
  ...MessageSchema.pick({
    id: true,
    threadId: true,
    authorKind: true,
    text: true,
    deliveryState: true,
    signedActId: true,
    authorAccountId: true,
  }).shape,
  version: z.number().int().positive(),
  correction: z
    .strictObject({
      originalMessageId: IdSchema,
      originalVersion: z.number().int().positive(),
    })
    .nullable()
    .optional(),
});
export const ConversationCorrectionReceiptSchema = z.strictObject({
  messageId: IdSchema,
  threadId: IdSchema,
  originalMessageId: IdSchema,
  originalVersion: z.number().int().positive(),
  signedActId: IdSchema,
});
