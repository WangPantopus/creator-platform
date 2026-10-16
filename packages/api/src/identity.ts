import { z } from "zod";
import navigation from "../../../config/navigation.json" with { type: "json" };
const destinationPattern = new RegExp(navigation.pathPattern, "u");
const fanHandleExemptPattern = new RegExp(
  navigation.fanHandleExemptPathPattern,
  "u",
);
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
/** Account security, public status and independently guarded Ops membership
 * do not depend on enrolling a fan persona. Destination validation remains
 * mandatory; an invalid destination never receives this exception. */
export function requiresFanProfile(value: string): boolean {
  return (
    !validReturnTarget(value) ||
    !fanHandleExemptPattern.test(value.split("?")[0]!)
  );
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
/** An intro edit preserves the current handle and detects concurrent edits. */
export const FanIntroInputSchema = z.strictObject({
  intro: FanProfileInputSchema.shape.intro,
  expectedVersion: z.number().int().positive(),
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
  /** C1: "qelvora" is the Qelvora-owned sign-in (option D); "pantopus" stays
   * reserved for a Pantopus connect flow. Clients branch only on "development". */
  mode: z.enum(["development", "qelvora", "pantopus"]),
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
/** C1, the pilot sign-in (lane 1). Apple and Google ID tokens are verified by
 * the backend only; no provider token, subject or email reaches a client. */
export const IdentityProviderSchema = z.enum(["apple", "google"]);
export const IdentityProviderContinueSchema = z.strictObject({
  returnTo: ReturnTargetSchema,
  provider: IdentityProviderSchema,
  reauthenticate: z.boolean().optional(),
});
export const NativeSignInStartSchema = z.strictObject({
  provider: IdentityProviderSchema,
  platform: z.enum(["ios", "android"]),
  returnTo: ReturnTargetSchema.optional(),
  reauthenticate: z.boolean().optional(),
});
/** Single use, five minutes. iOS passes SHA-256(nonce) to Apple; Google takes it as is. */
export const NativeSignInNonceSchema = z.strictObject({
  continuationId: z.uuid(),
  nonce: z.string().min(32).max(128),
  expiresAt: z.iso.datetime(),
});
export const NativeSignInCompleteSchema = z.strictObject({
  continuationId: z.uuid(),
  provider: IdentityProviderSchema,
  idToken: z.string().min(1).max(8192),
  /** Apple only: kept encrypted so account deletion can revoke the grant at Apple. */
  authorizationCode: z.string().min(1).max(4096).optional(),
});
/** Platform age signals can only refuse: an adult report is never proof. */
export const PlatformAgeSignalSchema = z.strictObject({
  source: z.enum(["apple_declared_age_range", "google_play_age_signals"]),
  under18: z.boolean(),
});
export const AgeConfirmationInputSchema = z.strictObject({
  ageContinuationId: z.uuid(),
  birthDate: z.iso.date(),
  platformSignal: PlatformAgeSignalSchema.optional(),
});
export const AgeConfirmationRequiredSchema = z.strictObject({
  ageContinuationId: z.uuid(),
  expiresAt: z.iso.datetime(),
});
/** Flat rather than a union so every generated client can decode it. Exactly
 * one of completion and ageConfirmation is present, matching status. */
export const IdentitySignInResultSchema = z
  .strictObject({
    status: z.enum(["signed_in", "age_required"]),
    completion: IdentityCompletionSchema.nullable(),
    ageConfirmation: AgeConfirmationRequiredSchema.nullable(),
  })
  .refine(
    (value) =>
      (value.status === "signed_in") === (value.completion !== null) &&
      (value.status === "age_required") === (value.ageConfirmation !== null),
    "status must match exactly one of completion and ageConfirmation",
  );
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
  postUrl: z.string().nullable(),
  expiresAt: z.iso.datetime(),
  state: z.enum(["challenge", "pending", "approved", "rejected", "revoked"]),
  reason: z.string().nullable(),
});
export const TeamInviteSchema = z.strictObject({
  accountId: z.uuid(),
  roles: z.array(TeamRoleSchema).min(1).max(4),
});
const UniqueTeamRoles = z
  .array(TeamRoleSchema)
  .min(1)
  .max(4)
  .refine(
    (roles) => new Set(roles).size === roles.length,
    "Use distinct roles",
  );
/** Compare the roles actually reviewed by the creator before replacing them. */
export const TeamRolesUpdateInputSchema = z.strictObject({
  expectedRoles: UniqueTeamRoles,
  roles: UniqueTeamRoles,
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
/** "lost" retires a key and keeps its past signatures valid; "compromised"
 * (the default) revokes it and marks its past signatures revoked. */
export const KeyLossSchema = z.enum(["lost", "compromised"]);
export const PasskeyRevocationSchema = z.strictObject({
  credentialId: z.string().min(1).max(2048),
  loss: KeyLossSchema.optional(),
});
export const PasskeyRecoverySchema = z.strictObject({
  loss: KeyLossSchema.optional(),
});
export const PasskeysSchema = z.strictObject({
  credentials: z
    .array(
      z.strictObject({
        id: z.string(),
        createdAt: z.iso.datetime(),
        revoked: z.boolean(),
        /** A lost key: it cannot sign, and its past signatures stay valid. */
        retired: z.boolean(),
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
  FanIntroInput: FanIntroInputSchema,
  FanProfile: FanProfileSchema,
  CreatorProfileInput: CreatorProfileInputSchema,
  CreatorProfile: CreatorProfileSchema,
  Session: SessionSchema,
  IdentityCompletion: IdentityCompletionSchema,
  IdentityProviderContinue: IdentityProviderContinueSchema,
  NativeSignInStart: NativeSignInStartSchema,
  NativeSignInNonce: NativeSignInNonceSchema,
  NativeSignInComplete: NativeSignInCompleteSchema,
  AgeConfirmationInput: AgeConfirmationInputSchema,
  AgeConfirmationRequired: AgeConfirmationRequiredSchema,
  IdentitySignInResult: IdentitySignInResultSchema,
  SessionToken: SessionTokenSchema,
  Done: DoneSchema,
  ProofInput: ProofInputSchema,
  ProofSubmit: ProofSubmitSchema,
  Proof: ProofSchema,
  TeamInvite: TeamInviteSchema,
  TeamRolesUpdateInput: TeamRolesUpdateInputSchema,
  TeamInvitation: TeamInvitationSchema,
  PasskeyOptions: PasskeyOptionsSchema,
  PasskeyRegistration: PasskeyRegistrationSchema,
  PasskeyRevocation: PasskeyRevocationSchema,
  PasskeyRecovery: PasskeyRecoverySchema,
  Passkeys: PasskeysSchema,
  PublicSignature: PublicSignatureSchema,
};
