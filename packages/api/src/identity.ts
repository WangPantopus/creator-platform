import { z } from "zod";
import navigation from "../../../config/navigation.json" with { type: "json" };
const destinationPattern = new RegExp(navigation.pathPattern, "u");
const literalQueryValues: Readonly<Record<string, string>> =
  navigation.literalQueryValues;

/** C11: paths are data, never arbitrary redirect URLs or callback credentials. */
export function validReturnTarget(value: string): boolean {
  if (value.length > 2048 || /[%\\#\s]/u.test(value)) return false;
  const [path, query, extra] = value.split("?");
  if (extra !== undefined || !path || !destinationPattern.test(path))
    return false;
  if (query === undefined) return true;
  const entries = query.split("&").map((field) => field.split("="));
  const names = new Set(entries.map(([key]) => key));
  if (entries.length < 1 || entries.length > 2 || names.size !== entries.length)
    return false;
  return entries.every(([key, value]) => {
    if (
      !key ||
      value === undefined ||
      entries.some((pair) => pair.length !== 2)
    )
      return false;
    const scope =
      navigation.queryParameters[
        key as keyof typeof navigation.queryParameters
      ];
    return (
      !!scope &&
      new RegExp(scope, "u").test(path) &&
      (literalQueryValues[key] !== undefined
        ? value === literalQueryValues[key]
        : value === value.toLowerCase() && z.uuid().safeParse(value).success)
    );
  });
}
export const ReturnTargetSchema = z
  .string()
  .refine(
    validReturnTarget,
    "A registered application destination is required",
  );
export const CompleteIdentitySchema = z.strictObject({
  continuationId: z.uuid(),
  code: z.string().min(1).max(4096),
  state: z.string().min(32).max(128).optional(),
});
export const FanProfileInputSchema = z.strictObject({
  handle: z
    .string()
    .trim()
    .regex(/^@?[a-zA-Z0-9_]{3,30}$/u),
  intro: z.string().trim().max(240).default(""),
});
export const FanProfileSchema = z.strictObject({
  id: z.uuid(),
  handle: z.string(),
  intro: z.string(),
  version: z.number().int().positive(),
});
export const TeamRoleSchema = z.enum([
  "triage",
  "drafter",
  "publisher",
  "scheduler",
]);
export const CreatorProfileInputSchema = z.strictObject({
  handle: FanProfileInputSchema.shape.handle,
  displayName: z.string().trim().min(1).max(80),
});
export const CreatorProfileSchema = z.strictObject({
  id: z.uuid(),
  handle: z.string(),
  displayName: z.string(),
  verification: z.enum(["pending", "verified", "rejected", "revoked"]),
  version: z.number().int().positive(),
});
export const SessionSchema = z.strictObject({
  accountId: z.uuid(),
  adultEligible: z.literal(true),
  sessionId: z.uuid(),
  expiresAt: z.iso.datetime(),
  mode: z.enum(["development", "pantopus"]),
  fan: FanProfileSchema.nullable(),
  creator: CreatorProfileSchema.nullable(),
  teams: z
    .array(
      z.strictObject({ creatorId: z.uuid(), roles: z.array(TeamRoleSchema) }),
    )
    .max(100),
});
export type Session = z.infer<typeof SessionSchema>;
export const IdentityCompletionSchema = z.strictObject({
  token: z.string(),
  returnTo: ReturnTargetSchema,
  session: SessionSchema,
});
export const SessionTokenSchema = z.strictObject({
  token: z.string(),
  expiresAt: z.iso.datetime(),
});
export const DoneSchema = z.strictObject({ done: z.literal(true) });
export const ProofInputSchema = z.strictObject({
  platform: z.enum(["instagram", "youtube"]),
  accountUrl: z.url().max(2048),
});
export const ProofSubmitSchema = z.strictObject({ postUrl: z.url().max(2048) });
export const ProofSchema = z.strictObject({
  id: z.uuid(),
  code: z.string(),
  platform: z.enum(["instagram", "youtube"]),
  accountUrl: z.string(),
  expiresAt: z.iso.datetime(),
  state: z.enum(["challenge", "pending", "approved", "rejected", "revoked"]),
  reason: z.string().nullable(),
});
export const TeamInviteSchema = z.strictObject({
  accountId: z.uuid(),
  roles: z.array(TeamRoleSchema).min(1).max(4),
});
export const TeamInvitationSchema = z.strictObject({
  id: z.uuid(),
  creatorId: z.uuid(),
  accountId: z.uuid(),
  roles: z.array(TeamRoleSchema),
  expiresAt: z.iso.datetime(),
  accepted: z.boolean(),
});
export const PasskeyOptionsSchema = z.strictObject({
  challengeId: z.uuid(),
  options: z.json(),
});
export const PasskeyRegistrationSchema = z.strictObject({
  challengeId: z.uuid(),
  credential: z.json(),
});
export const PasskeyRevocationSchema = z.strictObject({
  credentialId: z.string().min(1).max(2048),
});
export const PasskeysSchema = z.strictObject({
  credentials: z
    .array(
      z.strictObject({
        id: z.string(),
        createdAt: z.iso.datetime(),
        revoked: z.boolean(),
      }),
    )
    .max(100),
  recoveryRequired: z.boolean(),
});
export const PublicSignatureSchema = z.strictObject({
  signedActId: z.uuid(),
  creatorName: z.string(),
  actType: z.string(),
  contentHash: z.string(),
  verifiedAt: z.iso.datetime(),
  status: z.enum(["valid", "key_revoked", "creator_revoked", "withdrawn"]),
  content: z.json().nullable(),
  contentAvailable: z.boolean(),
  explanation: z.string(),
});
export const identitySchemas = {
  CompleteIdentity: CompleteIdentitySchema,
  FanProfileInput: FanProfileInputSchema,
  FanProfile: FanProfileSchema,
  CreatorProfileInput: CreatorProfileInputSchema,
  CreatorProfile: CreatorProfileSchema,
  Session: SessionSchema,
  IdentityCompletion: IdentityCompletionSchema,
  SessionToken: SessionTokenSchema,
  Done: DoneSchema,
  ProofInput: ProofInputSchema,
  ProofSubmit: ProofSubmitSchema,
  Proof: ProofSchema,
  TeamInvite: TeamInviteSchema,
  TeamInvitation: TeamInvitationSchema,
  PasskeyOptions: PasskeyOptionsSchema,
  PasskeyRegistration: PasskeyRegistrationSchema,
  PasskeyRevocation: PasskeyRevocationSchema,
  Passkeys: PasskeysSchema,
  PublicSignature: PublicSignatureSchema,
};
