import { z } from "zod";
import { ApiError } from "./client.ts";
import * as C from "./content.ts";
import * as S from "./studio.ts";
import { SignedActCommandSchema } from "./schemas.ts";

/** The caller supplies its current W1 session; commands never replay automatically. */
export class ContentStudioClient {
  constructor(
    private readonly baseUrl: string,
    private readonly session: () => Promise<
      { accountId: string; token: string } | undefined
    >,
    private readonly transport: typeof fetch = fetch,
  ) {}
  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    query?: Record<string, unknown>,
  ) {
    const before = await this.session();
    if (!before)
      throw new ApiError(401, {
        error: { code: "session_required", message: "Continue with Pantopus." },
      });
    z.uuid().parse(before.accountId);
    const url = new URL(path, this.baseUrl);
    for (const [name, value] of Object.entries(query ?? {}))
      if (value !== undefined) url.searchParams.set(name, String(value));
    const response = await this.transport(url, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${before.token}`,
        ...(body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "x-qelvora-expected-account": before.accountId,
            }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const value: unknown = await response.json();
    if (!response.ok) throw new ApiError(response.status, value);
    if ((await this.session())?.accountId !== before.accountId)
      throw new ApiError(401, {
        error: {
          code: "session_account_changed",
          message: "Refresh the current account before continuing.",
        },
      });
    return schema.parse(value);
  }
  private path(creatorId: string, suffix = "", domain = "content") {
    return `/v1/${domain}/${z.uuid().parse(creatorId)}${suffix}`;
  }
  private id(value: string) {
    return z.uuid().parse(value);
  }
  list(
    creatorId: string,
    query: z.input<typeof C.ContentPage> = {},
    studio = false,
  ) {
    return this.request(
      this.path(creatorId, studio ? "/studio" : ""),
      C.ContentList,
      undefined,
      C.ContentPage.parse(query),
    );
  }
  get(creatorId: string, id: string, studio = false) {
    return this.request(
      this.path(creatorId, `/${this.id(id)}${studio ? "/studio" : ""}`),
      C.ContentView,
    );
  }
  save(creatorId: string, input: z.input<typeof C.SaveContent>) {
    return this.request(
      this.path(creatorId, "/drafts"),
      C.ContentResult,
      C.SaveContent.parse(input),
    );
  }
  review(creatorId: string, id: string) {
    return this.request(
      this.path(creatorId, `/${this.id(id)}/review`),
      z.strictObject({ command: SignedActCommandSchema, view: C.ContentView }),
    );
  }
  publish(
    creatorId: string,
    id: string,
    input: z.input<typeof C.PublishContent>,
  ) {
    return this.request(
      this.path(creatorId, `/${this.id(id)}/publish`),
      C.ContentResult,
      C.PublishContent.parse(input),
    );
  }
  teamPublish(
    creatorId: string,
    id: string,
    input: z.input<typeof C.ContentVersionCommand>,
  ) {
    return this.request(
      this.path(creatorId, `/${this.id(id)}/team-publish`),
      C.ContentResult,
      C.ContentVersionCommand.parse(input),
    );
  }
  lifecycle(
    creatorId: string,
    id: string,
    action: "unpublish" | "archive",
    input: z.input<typeof C.ContentVersionCommand>,
  ) {
    return this.request(
      this.path(creatorId, `/${this.id(id)}/${action}`),
      C.ContentResult,
      C.ContentVersionCommand.parse(input),
    );
  }
  reply(creatorId: string, id: string, input: z.input<typeof C.ReplyToNote>) {
    return this.request(
      this.path(creatorId, `/${this.id(id)}/replies`),
      C.ContentReplyReviewResult,
      C.ReplyToNote.parse(input),
    );
  }
  replies(
    creatorId: string,
    query: z.input<typeof C.ContentReplyPage> = {},
    studio = false,
  ) {
    return this.request(
      this.path(creatorId, studio ? "/studio/replies" : "/replies"),
      C.ContentReplyList,
      undefined,
      C.ContentReplyPage.parse(query),
    );
  }
  reviewReply(
    creatorId: string,
    id: string,
    input: z.input<typeof C.ContentVersionCommand>,
  ) {
    return this.request(
      this.path(creatorId, `/replies/${this.id(id)}/review`),
      C.ContentReplyReviewResult,
      C.ContentVersionCommand.parse(input),
    );
  }
  markReplyRead(
    creatorId: string,
    id: string,
    input: z.input<typeof C.ContentVersionCommand>,
  ) {
    return this.request(
      this.path(creatorId, `/replies/${this.id(id)}/read`),
      C.ContentReplyReadResult,
      C.ContentVersionCommand.parse(input),
    );
  }
  consent(
    creatorId: string,
    id: string,
    input: z.input<typeof C.QuoteConsent>,
  ) {
    return this.request(
      this.path(creatorId, `/replies/${this.id(id)}/consent`),
      C.ContentConsentResult,
      C.QuoteConsent.parse(input),
    );
  }
  withdrawReply(
    creatorId: string,
    id: string,
    input: z.input<typeof C.ContentVersionCommand>,
  ) {
    return this.request(
      this.path(creatorId, `/replies/${this.id(id)}/withdraw`),
      C.ContentWithdrawResult,
      C.ContentVersionCommand.parse(input),
    );
  }
  react(creatorId: string, id: string, input: z.input<typeof C.ReactToReply>) {
    return this.request(
      this.path(creatorId, `/replies/${this.id(id)}/reaction`),
      C.ContentReactionResult,
      C.ReactToReply.parse(input),
    );
  }
  preference(creatorId: string) {
    return this.request(this.path(creatorId, "/mute"), C.ContentPreference);
  }
  mute(creatorId: string, muted: boolean) {
    return this.request(
      this.path(creatorId, "/mute"),
      C.ContentMuteCommand,
      C.ContentMuteCommand.parse({ muted }),
    );
  }
  thanks(creatorId: string, input: z.input<typeof C.ThanksCommand>) {
    return this.request(
      this.path(creatorId, "/thanks"),
      C.ContentRevisionResult,
      C.ThanksCommand.parse(input),
    );
  }
  myThanks(creatorId: string, query: z.input<typeof C.ContentThanksQuery>) {
    return this.request(
      this.path(creatorId, "/thanks"),
      C.ContentThanksView,
      undefined,
      C.ContentThanksQuery.parse(query),
    );
  }
  thanksFeed(creatorId: string) {
    return this.request(
      this.path(creatorId, "/studio/thanks"),
      C.ContentThanksFeed,
    );
  }
  liveCatalog(creatorId: string) {
    return this.request(
      this.path(creatorId, "/studio/live"),
      C.ContentLiveCatalog,
    );
  }
  runScheduled(creatorId: string) {
    return this.request(
      this.path(creatorId, "/studio/scheduled/run"),
      C.ContentScheduledResult,
      {},
    );
  }
  runEffects(creatorId: string) {
    return this.request(
      this.path(creatorId, "/studio/effects/run"),
      C.ContentEffectsResult,
      {},
    );
  }
  workspace() {
    return this.request("/v1/studio/session", S.StudioSession);
  }
  audiences(creatorId: string) {
    return this.request(
      this.path(creatorId, "/audiences", "studio"),
      S.StudioAudiences,
    );
  }
  team(creatorId: string) {
    return this.request(this.path(creatorId, "/team", "studio"), S.StudioTeam);
  }
  threadEntries(
    creatorId: string,
    query: z.input<typeof C.ContentReplyPage> = {},
  ) {
    return this.request(
      this.path(creatorId, "/threads", "studio"),
      S.StudioThreadEntries,
      undefined,
      C.ContentPage.pick({ cursor: true, limit: true }).parse(query),
    );
  }
  invite(creatorId: string, input: z.input<typeof S.StudioInvite>) {
    return this.request(
      this.path(creatorId, "/team/invite", "studio"),
      S.StudioInvitation,
      S.StudioInvite.parse(input),
    );
  }
}
