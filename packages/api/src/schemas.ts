import { z } from "zod";
import { identitySchemas, ReturnTargetSchema } from "./identity.ts";
import * as agent from "./agent/contracts.ts";
import * as commerce from "./commerce/contracts.ts";
import * as media from "./media.ts";
import * as calls from "./session.ts";
import { ConsentEnvelopeSchema } from "./consent.ts";

const namespacedSchemas = Object.fromEntries(
  [
    ["Agent", agent],
    ["Commerce", commerce],
    ["Media", media],
    ["Call", calls],
  ].flatMap(([prefix, values]) =>
    Object.entries(values as Record<string, unknown>)
      .filter(([, value]) => value instanceof z.ZodType)
      .map(([name, value]) => [
        String(prefix) + name.replace(/Schema$/u, ""),
        value as z.ZodType,
      ]),
  ),
);

export const AuthorKindSchema = z.enum([
  "fan",
  "ai",
  "approved_draft",
  "human_creator",
  "human_call",
  "human_broadcast",
  "human_reaction",
  "team",
  "system",
]);
export const ThreadControlSchema = z.enum([
  "ai_active",
  "human_active",
  "ai_paused",
  "closed",
  "blocked",
]);
export const SignedActTypeSchema = z.enum([
  "reply",
  "approved_draft",
  "broadcast",
  "reaction",
  "accept",
  "correction",
]);
export const IdSchema = z.uuid();
export const SendMessageSchema = z.strictObject({
  text: z.string().trim().min(1).max(10000),
  idempotencyKey: z.string().min(8).max(128),
  clientSequence: z.number().int().nonnegative(),
});
// Models propose content; they never supply authority, prices or obligations.
export const ModelProposalSchema = z.strictObject({
  text: z.string().min(1).max(20000),
  citations: z.array(IdSchema).max(4),
  refusalCode: z.string().max(100).optional(),
});
export const ControlCommandSchema = z.strictObject({
  idempotencyKey: z.string().min(8).max(128),
});
export const HumanReplySchema = z.strictObject({
  text: z.string().min(1).max(20000),
  signedActId: IdSchema,
  idempotencyKey: z.string().min(8).max(128),
});
export const SignedActCommandSchema = z.strictObject({
  actType: SignedActTypeSchema,
  subjectId: IdSchema,
  content: z.json(),
});
export const BeginSignedActSchema = z.strictObject({
  fanId: IdSchema.optional(),
  command: SignedActCommandSchema,
});
export const IdentityContinueSchema = z.strictObject({
  returnTo: ReturnTargetSchema,
});
export const IdentityRedirectSchema = z.strictObject({
  redirectUrl: z.url(),
  continuationId: IdSchema.optional(),
});
export const IdentityCapabilitiesSchema = z.strictObject({
  signInAvailable: z.boolean(),
  localAccountsAllowed: z.literal(false),
  mode: z.enum(["development", "pantopus", "unconfigured"]).optional(),
  developmentActors: z
    .array(z.strictObject({ id: IdSchema, label: z.string() }))
    .optional(),
});
export const SignedChallengeSchema = z.strictObject({
  challengeId: IdSchema,
  publicKey: z.strictObject({
    challenge: z.string(),
    rpId: z.string(),
    timeout: z.number().int(),
    userVerification: z.literal("required"),
    allowCredentials: z.array(
      z.strictObject({ id: z.string(), type: z.literal("public-key") }),
    ),
  }),
});
export const AssertionSchema = z.strictObject({
  id: z.string().min(1).max(2048),
  rawId: z.string().min(1).max(2048),
  type: z.literal("public-key"),
  response: z.strictObject({
    clientDataJSON: z.string().min(1).max(20000),
    authenticatorData: z.string().min(1).max(20000),
    signature: z.string().min(1).max(20000),
    userHandle: z.string().max(2048).optional(),
  }),
  clientExtensionResults: z.record(z.string(), z.json()),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});
export const VerifySignedActSchema = z.strictObject({
  challengeId: IdSchema,
  assertion: AssertionSchema,
});
export const SignedActResultSchema = z.strictObject({ signedActId: IdSchema });
export const ErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});
export const HealthSchema = z.strictObject({
  status: z.literal("ok"),
  ready: z.boolean(),
  identity: z.enum(["configured", "unconfigured"]),
  database: z.enum(["configured", "unconfigured"]),
  featureEnabled: z.boolean(),
});
export const MessageSchema = z.strictObject({
  id: IdSchema,
  threadId: IdSchema,
  authorKind: AuthorKindSchema,
  text: z.string(),
  deliveryState: z.enum([
    "accepted",
    "generating",
    "delivered",
    "failed",
    "interrupted",
  ]),
  controlEpoch: z.number().int().nonnegative(),
  sequence: z.number().int().positive(),
  signedActId: IdSchema.nullable(),
});
export const AcceptedMessageSchema = z.strictObject({
  message: MessageSchema,
  // A durable grant-free platform safety response creates no generation job.
  generationId: IdSchema.nullable(),
});
export const FrameSchema = z.strictObject({
  threadId: IdSchema,
  cursor: z.number().int().positive(),
  epoch: z.number().int().nonnegative(),
  kind: z.enum(["accepted", "sentence", "control", "delivered", "interrupted"]),
  messageId: IdSchema,
  authorKind: AuthorKindSchema,
  text: z.string(),
  generationId: IdSchema.nullable(),
  sequence: z.number().int().nonnegative(),
  control: ThreadControlSchema.optional(),
});
export const SubscribeSchema = z.strictObject({
  kind: z.literal("subscribe"),
  creatorId: IdSchema,
  fanId: IdSchema,
  cursor: z.number().int().nonnegative(),
});
export const ThreadTimelineSchema = z.strictObject({
  threadId: IdSchema,
  creatorId: IdSchema,
  fanId: IdSchema,
  control: ThreadControlSchema,
  epoch: z.number().int().nonnegative(),
  cursor: z.number().int().nonnegative(),
  generationSequences: z.record(IdSchema, z.number().int().nonnegative()),
  messages: z.array(MessageSchema),
});

export type AuthorKind = z.infer<typeof AuthorKindSchema>;
export type ThreadControl = z.infer<typeof ThreadControlSchema>;
export type SignedActCommand = z.infer<typeof SignedActCommandSchema>;
export type Frame = z.infer<typeof FrameSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type ThreadTimeline = z.infer<typeof ThreadTimelineSchema>;
export type AcceptedMessage = z.infer<typeof AcceptedMessageSchema>;
export type Health = z.infer<typeof HealthSchema>;

export const publicSchemas = {
  ...namespacedSchemas,
  ConsentEnvelope: ConsentEnvelopeSchema,
  ...identitySchemas,
  AuthorKind: AuthorKindSchema,
  ThreadControl: ThreadControlSchema,
  SendMessage: SendMessageSchema,
  HumanReply: HumanReplySchema,
  ControlCommand: ControlCommandSchema,
  SignedActCommand: SignedActCommandSchema,
  BeginSignedAct: BeginSignedActSchema,
  IdentityContinue: IdentityContinueSchema,
  IdentityRedirect: IdentityRedirectSchema,
  IdentityCapabilities: IdentityCapabilitiesSchema,
  SignedChallenge: SignedChallengeSchema,
  VerifySignedAct: VerifySignedActSchema,
  SignedActResult: SignedActResultSchema,
  Error: ErrorSchema,
  Health: HealthSchema,
  Message: MessageSchema,
  AcceptedMessage: AcceptedMessageSchema,
  Frame: FrameSchema,
  Subscribe: SubscribeSchema,
  ThreadTimeline: ThreadTimelineSchema,
};
