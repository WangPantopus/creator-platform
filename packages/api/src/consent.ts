import { z } from "zod";

/** Metadata shared by domain-owned consent records. The domain defines purpose,
 * policy and withdrawal effects; this envelope never implies broad consent. */
export const ConsentEnvelopeSchema = z.strictObject({
  id: z.uuid(),
  schemaVersion: z.literal(1),
  actorAccountId: z.uuid(),
  occurredAt: z.iso.datetime(),
  purpose: z.string().regex(/^[a-z][a-z0-9_]{1,30}\.[a-z][a-z0-9_]{1,60}$/u),
  policyVersion: z.string().min(1).max(100),
  decision: z.enum(["grant", "withdraw"]),
  scope: z.strictObject({
    creatorId: z.uuid().optional(),
    threadId: z.uuid().optional(),
    subjectId: z.uuid().optional(),
  }),
});
export type ConsentEnvelope = z.infer<typeof ConsentEnvelopeSchema>;
