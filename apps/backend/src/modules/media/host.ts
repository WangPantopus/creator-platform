import type { PoolClient } from "pg";
import type { SignedActCommand } from "@qelvora/api";
import type { FeatureRegistration } from "../../app.js";
import type { BackendRuntime } from "../../integration.js";
import {
  ProcessedMediaEvidenceSchema,
  type CreatorMediaPurpose,
  type MediaAsset,
  type MediaPolicy,
} from "../../../../../packages/api/src/media.js";
import { invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import { CreatorIdentityAuthority } from "../identity/creator-scope.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import { contentMediaAuthority } from "../content/media.js";
import { contentPublicationMedia } from "../content/w6-publication.js";
import type {
  ContentPublicationMedia,
  ContentService,
} from "../content/service.js";
import { MediaService, type MediaAuthority } from "./service.js";
import {
  CreatorMediaService,
  type CreatorMediaAuthority,
  type CreatorMediaReadScope,
} from "./creator-service.js";
import {
  CreatorMediaTickets,
  MediaTickets,
  PrivateMediaStorage,
} from "./storage.js";
import { mediaFeature } from "./registration.js";
import { AvailabilityService } from "../session/availability.js";
import type { MediaInteractiveEnvironment } from "./environment.js";
import type { AccountCallMetadata } from "../session/account-call-metadata.js";
import { isConfiguredBackendRuntime } from "../../integration.js";
import type { InteractiveCallControl } from "../session/interactive-control.js";
import {
  holdCurrentRequestSession,
  assertHeldCurrentRequestSession,
} from "../identity/request-authority.js";

/** W3 proves a fan's read against its own delivered message on the held client. */
export type RecordingPublicationPort = (
  scope: ThreadScope,
  recording: Readonly<{
    asset: MediaAsset;
    command: SignedActCommand;
    signedActId: string;
  }>,
  client: PoolClient,
) => Promise<boolean>;

/** W8's held denials on the caller's non-owner transaction. `true` denies. */
export type MediaDenials = Readonly<{
  creatorActor: (
    actor: Actor,
    creatorId: string,
    client: PoolClient,
  ) => Promise<void>;
  thread: (scope: ThreadScope, client: PoolClient) => Promise<boolean>;
  creator: (
    scope: CreatorMediaReadScope,
    client: PoolClient,
  ) => Promise<boolean>;
}>;
const issuedDenials = new WeakMap<MediaDenials, BackendRuntime>();

/** Only the canonical host's real W8 held-client checks can enable media.
 * Issued interactive scopes supply identity; no worker Actor is constructed. */
export function runtimeMediaDenials(
  runtime: BackendRuntime,
  authority: InteractiveCallControl,
): MediaDenials | null {
  const thread = runtime.assertScopeAllowedInTransaction;
  const creator = runtime.assertCreatorAllowedInTransaction;
  const audience = runtime.audienceIdentity;
  if (
    !thread ||
    !creator ||
    !audience ||
    !isConfiguredBackendRuntime(runtime) ||
    !authority.isFor(runtime.database)
  )
    return null;
  const bookend = async (client: PoolClient) => {
    await authority.assertDenialAuthority(client);
    await runtime.assertRestoredInTransaction!(client);
  };
  const checkThread = async (scope: ThreadScope, client: PoolClient) => {
    assertThreadScope(scope);
    const held = await holdCurrentRequestSession(client, scope.actorAccountId);
    await bookend(client);
    await thread(
      held.actor,
      scope.creatorId,
      scope.threadId,
      {
        creatorAccountId: scope.creatorAccountId,
        fanAccountId: scope.fanAccountId,
      },
      client,
    );
    await bookend(client);
    await assertHeldCurrentRequestSession(held, client);
    return false;
  };
  const denials: MediaDenials = Object.freeze({
    creatorActor: async (actor, creatorId, client) => {
      const held = await holdCurrentRequestSession(client, actor.accountId);
      invariant(
        held.actor === actor,
        "media_current_actor_required",
        "Media requires the Actor from this current request.",
      );
      await bookend(client);
      await creator(held.actor, creatorId, client);
      await bookend(client);
      await assertHeldCurrentRequestSession(held, client);
    },
    thread: checkThread,
    creator: async (scope, client) => {
      const held = await holdCurrentRequestSession(
        client,
        "accountId" in scope ? scope.accountId : scope.actorAccountId,
      );
      await bookend(client);
      if ("accountId" in scope)
        await creator(held.actor, scope.creatorId, client);
      else if ("threadId" in scope) return checkThread(scope, client);
      else await audience.authorizeInTransaction(scope, client);
      await bookend(client);
      await assertHeldCurrentRequestSession(held, client);
      return false;
    },
  });
  issuedDenials.set(denials, runtime);
  return denials;
}

export type MediaHost = Readonly<{
  media: MediaService;
  creatorMedia: CreatorMediaService;
  creatorIdentity: CreatorIdentityAuthority;
  availability: AvailabilityService;
  /** W5 consumes this as ContentDependencies.mediaPublication. */
  contentPublication: ContentPublicationMedia;
  /** Once, after the host constructs W5's ContentService with contentPublication. */
  bindContent(content: ContentService): void;
  /** Once, after W3 prepares its recording association. */
  bindRecordingPublication(port: RecordingPublicationPort): void;
  /** Call after binding. A surface is mounted only when its consumer is real:
   * thread recordings need W3's association, creator media needs W5 content. */
  feature(accountCalls?: AccountCallMetadata): FeatureRegistration;
}>;

async function actorOf(
  scope: CreatorMediaReadScope,
  client: PoolClient,
): Promise<Actor> {
  return (
    await holdCurrentRequestSession(
      client,
      "accountId" in scope ? scope.accountId : scope.actorAccountId,
    )
  ).actor;
}

/** Interactive composition of W6 human media. Parsing, scanning and content
 * credentials stay in the ingestion worker; this process only stores bytes,
 * issues tickets and serves verified files under current authority. */
export function composeMediaHost(input: {
  runtime: BackendRuntime;
  environment: MediaInteractiveEnvironment;
  denials: MediaDenials;
  development: boolean;
}): MediaHost {
  const { runtime, environment, denials } = input;
  invariant(
    issuedDenials.get(denials) === runtime &&
      isConfiguredBackendRuntime(runtime),
    "media_denial_unconfigured",
    "Media requires its original current denial producer.",
  );
  const storage = new PrivateMediaStorage(environment.storageRoot);
  let recordingPublication: RecordingPublicationPort | undefined;
  let content: ReturnType<typeof contentMediaAuthority> | undefined;

  const threadAuthority: MediaAuthority = {
    // Only human replies have an implemented thread producer/consumer. Fan
    // attachments stay unavailable until a product consumer and policy exist.
    async policy(_scope, purpose): Promise<MediaPolicy | null> {
      return purpose === "human_reply"
        ? environment.policy.thread("human_reply")
        : null;
    },
    denied: (scope, client) => denials.thread(scope, client),
    // Fan playback needs W3's exact delivered association; unbound fails closed.
    currentRecordingPublication: async (scope, recording, client) =>
      recordingPublication
        ? recordingPublication(scope, recording, client)
        : false,
  };
  const media = new MediaService(
    runtime.database,
    storage,
    new MediaTickets(environment.ticketSecret, environment.ticketOrigin),
    threadAuthority,
  );

  const creatorRestriction = runtime.assertCreatorAllowedInTransaction;
  invariant(
    creatorRestriction,
    "creator_denial_unconfigured",
    "Creator operations require their current held denial authority.",
  );
  const creatorIdentity = new CreatorIdentityAuthority(runtime.pool, {
    mode: input.development ? "development" : "pantopus",
    assertAllowed: denials.creatorActor,
  });
  const availability = new AvailabilityService(
    runtime.database,
    creatorIdentity,
    async (scope, client) => {
      const denied =
        "accountId" in scope
          ? await denials.creator(scope, client)
          : await denials.thread(scope, client);
      invariant(!denied, "scope_revoked", "This scope is closed.");
    },
  );
  // W5's object authority takes (client, actor, creatorId, ...). Keep the
  // issued scope for the same held client so its publication check reuses it.
  const scopes = new WeakMap<PoolClient, CreatorMediaReadScope>();
  const objectAuthority = () => {
    invariant(
      content,
      "creator_media_content_unconfigured",
      "Creator media is awaiting its content authority.",
    );
    return content;
  };
  const creatorAuthority: CreatorMediaAuthority = {
    async policy(scope, objectId, purpose, operation, client) {
      scopes.set(client, scope);
      return objectAuthority().policy(
        client,
        await actorOf(scope, client),
        scope.creatorId,
        objectId,
        purpose,
        operation,
      );
    },
    denied: (scope, client) => denials.creator(scope, client),
    async currentAssetRead(scope, objectId, asset, client) {
      scopes.set(client, scope);
      return objectAuthority().currentAssetRead(
        client,
        await actorOf(scope, client),
        scope.creatorId,
        objectId,
        asset,
      );
    },
    async currentPublication(scope, objectId, asset, client) {
      scopes.set(client, scope);
      return objectAuthority().currentPublication(
        client,
        await actorOf(scope, client),
        scope.creatorId,
        objectId,
        asset,
      );
    },
  };
  const creatorMedia = new CreatorMediaService(
    creatorIdentity,
    runtime.database,
    storage,
    new CreatorMediaTickets(environment.ticketSecret, environment.ticketOrigin),
    creatorAuthority,
    runtime.audienceIdentity,
  );
  const limits = async (
    _client: PoolClient,
    _creatorId: string,
    purpose: CreatorMediaPurpose,
  ) => environment.policy.creator(purpose);

  return Object.freeze({
    media,
    creatorMedia,
    creatorIdentity,
    availability,
    contentPublication: contentPublicationMedia(creatorIdentity, creatorMedia),
    bindContent(service: ContentService) {
      invariant(
        !content,
        "creator_media_content_bound",
        "Creator media content authority is already configured.",
      );
      content = contentMediaAuthority(
        service,
        limits,
        async (client, _actor, _creatorId, objectId, signedActId, asset) => {
          const scope = scopes.get(client);
          invariant(
            scope,
            "media_scope_required",
            "Current media authority is required on this transaction.",
          );
          return creatorMedia.publicationMatches(
            scope,
            client,
            objectId,
            signedActId,
            ProcessedMediaEvidenceSchema.parse({
              assetId: asset.id,
              version: asset.version,
              sha256: asset.sha256,
              bytes: asset.bytes,
              mimeType: asset.mimeType,
              durationMs: asset.durationMs,
            }),
          );
        },
      );
    },
    bindRecordingPublication(port: RecordingPublicationPort) {
      invariant(
        !recordingPublication,
        "recording_publication_bound",
        "Recording publication authority is already configured.",
      );
      recordingPublication = port;
    },
    feature: (accountCalls) =>
      mediaFeature({
        availability,
        ...(accountCalls ? { accountCalls } : {}),
        ...(recordingPublication ? { media } : {}),
        ...(content ? { creatorMedia } : {}),
      }),
  });
}
