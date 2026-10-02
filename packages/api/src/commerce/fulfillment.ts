import { z } from "zod";

/** Public reference only. The original recipients and consent stay private. */
export const CommerceFulfillmentPlanRef = z.strictObject({
  id: z.uuid(),
  revision: z.int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/u),
});
export const CreateCommerceFulfillmentPlan = z
  .strictObject({
    contentId: z.uuid(),
    contentVersion: z.int().positive(),
    audience: z.enum(["public", "matched_group"]),
    requests: z
      .array(
        z.strictObject({
          packetId: z.uuid(),
          packetVersion: z.int().positive(),
          commitmentVersion: z.int().positive(),
        }),
      )
      .min(2)
      .max(100),
    idempotencyKey: z.string().min(8).max(128),
  })
  .refine(
    (v) =>
      new Set(v.requests.map((r) => r.packetId)).size === v.requests.length,
    "Choose each original request once.",
  );
export const CommerceReviewAttestationCommand = z.strictObject({
  actType: z.literal("reply"),
  subjectId: z.uuid(),
  content: z.strictObject({
    kind: z.literal("commerce_review_attestation"),
    packetId: z.uuid(),
    packetVersion: z.int().positive(),
    commitmentId: z.uuid(),
    commitmentVersion: z.int().positive(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/u),
    acceptanceId: z.uuid(),
    captureId: z.uuid(),
    captureHash: z.string().regex(/^[a-f0-9]{64}$/u),
    statement: z.literal("I reviewed the submitted request."),
  }),
});
export const SubmitCommerceReviewAttestation = z.strictObject({
  packetVersion: z.int().positive(),
  commitmentVersion: z.int().positive(),
  signedActId: z.uuid(),
  idempotencyKey: z.string().min(8).max(128),
});
export type CommerceFulfillmentPlanReference = z.infer<
  typeof CommerceFulfillmentPlanRef
>;
