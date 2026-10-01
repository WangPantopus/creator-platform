import {
  AcceptedMessageSchema,
  FrameSchema,
  HealthSchema,
  HumanReplySchema,
  MessageSchema,
  SendMessageSchema,
  IdentityCapabilitiesSchema,
  IdentityContinueSchema,
  IdentityRedirectSchema,
  BeginSignedActSchema,
  SignedChallengeSchema,
  VerifySignedActSchema,
  SignedActResultSchema,
  type AcceptedMessage,
  type Frame,
  type Health,
  type Message,
} from "./schemas.ts";
import type { z } from "zod";
import {
  CompleteIdentitySchema,
  IdentityCompletionSchema,
  SessionSchema,
  SessionTokenSchema,
  DoneSchema,
  FanProfileInputSchema,
  FanProfileSchema,
  CreatorProfileInputSchema,
  CreatorProfileSchema,
  PasskeysSchema,
  PasskeyOptionsSchema,
  PasskeyRegistrationSchema,
  PasskeyRevocationSchema,
  PublicSignatureSchema,
} from "./identity.ts";
import {
  ConversationTimelineSchema,
  type ConversationTimeline,
} from "./conversation/contracts.ts";

export class CreatorApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly session: () => Promise<string | undefined>,
    private readonly transport: typeof fetch = fetch,
  ) {}
  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    authenticated = true,
  ): Promise<T> {
    const token = authenticated ? await this.session() : undefined;
    const response = await this.transport(new URL(path, this.baseUrl), {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new ApiError(response.status, await response.json());
    return schema.parse(await response.json());
  }
  health(): Promise<Health> {
    return this.request("/health", HealthSchema, undefined, false);
  }
  identityCapabilities() {
    return this.request(
      "/v1/identity/capabilities",
      IdentityCapabilitiesSchema,
      undefined,
      false,
    );
  }
  continueWithPantopus(body: z.input<typeof IdentityContinueSchema>) {
    return this.request(
      "/v1/identity/continue",
      IdentityRedirectSchema,
      IdentityContinueSchema.parse(body),
      false,
    );
  }
  completeIdentity(body: z.input<typeof CompleteIdentitySchema>) {
    return this.request(
      "/v1/identity/complete",
      IdentityCompletionSchema,
      CompleteIdentitySchema.parse(body),
      false,
    );
  }
  identitySession() {
    return this.request("/v1/identity/session", SessionSchema);
  }
  refreshSession() {
    return this.request("/v1/identity/refresh", SessionTokenSchema, {});
  }
  logout(all = false) {
    return this.request(
      `/v1/identity/${all ? "revoke-sessions" : "logout"}`,
      DoneSchema,
      {},
    );
  }
  saveFanProfile(body: z.input<typeof FanProfileInputSchema>) {
    return this.request(
      "/v1/identity/fan-profile",
      FanProfileSchema,
      FanProfileInputSchema.parse(body),
    );
  }
  saveCreatorProfile(body: z.input<typeof CreatorProfileInputSchema>) {
    return this.request(
      "/v1/identity/creator-profile",
      CreatorProfileSchema,
      CreatorProfileInputSchema.parse(body),
    );
  }
  passkeys() {
    return this.request("/v1/identity/passkeys", PasskeysSchema);
  }
  beginPasskey() {
    return this.request(
      "/v1/identity/passkeys/begin",
      PasskeyOptionsSchema,
      {},
    );
  }
  registerPasskey(body: z.input<typeof PasskeyRegistrationSchema>) {
    return this.request(
      "/v1/identity/passkeys/register",
      DoneSchema,
      PasskeyRegistrationSchema.parse(body),
    );
  }
  revokePasskey(credentialId: string) {
    return this.request(
      "/v1/identity/passkeys/revoke",
      DoneSchema,
      PasskeyRevocationSchema.parse({ credentialId }),
    );
  }
  recoverPasskeys() {
    return this.request("/v1/identity/passkeys/recovery", DoneSchema, {});
  }
  beginSignedAct(
    creatorId: string,
    body: z.input<typeof BeginSignedActSchema>,
  ) {
    return this.request(
      `/v1/identity/${encodeURIComponent(creatorId)}/signed-acts/begin`,
      SignedChallengeSchema,
      BeginSignedActSchema.parse(body),
    );
  }
  verifySignedAct(body: z.input<typeof VerifySignedActSchema>) {
    return this.request(
      "/v1/identity/signed-acts/verify",
      SignedActResultSchema,
      VerifySignedActSchema.parse(body),
    );
  }
  publicSignature(signedActId: string) {
    return this.request(
      `/v1/identity/signed-acts/${encodeURIComponent(signedActId)}`,
      PublicSignatureSchema,
      undefined,
      false,
    );
  }
  readThread(creatorId: string, fanId: string): Promise<ConversationTimeline> {
    return this.request(
      this.thread(creatorId, fanId),
      ConversationTimelineSchema,
    );
  }
  sendMessage(
    creatorId: string,
    fanId: string,
    body: z.input<typeof SendMessageSchema>,
  ): Promise<AcceptedMessage> {
    return this.request(
      `${this.thread(creatorId, fanId)}/messages`,
      AcceptedMessageSchema,
      SendMessageSchema.parse(body),
    );
  }
  takeover(
    creatorId: string,
    fanId: string,
    idempotencyKey: string,
  ): Promise<Frame> {
    return this.request(
      `${this.thread(creatorId, fanId)}/takeover`,
      FrameSchema,
      { idempotencyKey },
    );
  }
  handback(
    creatorId: string,
    fanId: string,
    idempotencyKey: string,
  ): Promise<Frame> {
    return this.request(
      `${this.thread(creatorId, fanId)}/handback`,
      FrameSchema,
      { idempotencyKey },
    );
  }
  sendHumanReply(
    creatorId: string,
    fanId: string,
    body: z.input<typeof HumanReplySchema>,
  ): Promise<Message> {
    return this.request(
      `${this.thread(creatorId, fanId)}/human-replies`,
      MessageSchema,
      HumanReplySchema.parse(body),
    );
  }
  private thread(creatorId: string, fanId: string): string {
    return `/v1/threads/${encodeURIComponent(creatorId)}/${encodeURIComponent(fanId)}`;
  }
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(`API request refused (${status})`);
  }
}
