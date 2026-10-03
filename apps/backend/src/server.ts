import { createServer } from "node:http";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createConfiguredBackend } from "./integration.js";
import { DevelopmentIdentityAdapter } from "./modules/identity/development.js";
import { commerceSignedSubjects } from "./modules/commerce/registration.js";
import { configureGrowthForBackend } from "./modules/growth/configured.js";
import { composeConversationHost } from "./modules/conversation/host.js";
import { createCommerceStudio } from "./modules/commerce/studio.js";
import {
  composeContentHost,
  createContentStudio,
  createCurrentContentPostEntryReader,
} from "./modules/content/integration.js";
import type { CurrentPostEntryReader } from "./modules/growth/entry-context.js";
import { mediaFeature } from "./modules/media/registration.js";
import { readMediaEnvironment } from "./modules/media/environment.js";
import { composeMediaHost, runtimeMediaDenials } from "./modules/media/host.js";
import {
  createDevelopmentTrust,
  developmentTrustActors,
} from "./modules/trust/development.js";
import { agentFeature } from "./modules/agent/feature.js";
import {
  DevelopmentLicenseVerifier,
  developmentSyntheticJournalPolicy,
} from "./modules/agent/development-license.js";
import { contentPublicProjection } from "./modules/growth/content.js";
import { canonicalConversationHomePage } from "./modules/growth/home.js";
import { canonicalHomePage } from "./modules/growth/home-composition.js";
import { canonicalPassAccess } from "./modules/growth/integration.js";
import { createGrowthAPIPool } from "./db/growth-api-pool.js";
import { DomainError } from "./core/errors.js";
import { domainPrivacyTaskAuthorityInTransaction } from "./modules/trust/domain-privacy-authority.js";
import type { ConversationPrivacyOwnerPorts } from "./modules/trust/privacy-consumers.js";
import { createTrustReplyReviewer } from "./modules/trust/reply-review.js";
import { InteractiveCallControl } from "./modules/session/interactive-control.js";
import { AccountCallMetadata } from "./modules/session/account-call-metadata.js";

// Production hosts inject genuine identity, W8 denials and provider dependencies
// into the same configured-host seam. Development identity is always explicit.
const config = readConfig();
function canonicalDevelopmentIdentity() {
  return new DevelopmentIdentityAdapter(
    config.allowedOrigin,
    process.env.NODE_ENV,
    process.env.TRUST_LOCAL_DEVELOPMENT === "true"
      ? developmentTrustActors
      : [],
  );
}

const features: {
  growth: Awaited<ReturnType<typeof configureGrowthForBackend>>;
  conversationPrivacy?: ConversationPrivacyOwnerPorts;
  commerce?: import("./modules/commerce/service.js").CommerceService;
  close: (() => void | Promise<void>)[];
} = { growth: null, close: [] };
if (config.identityAdapter === "development" && !config.identitySessionKey)
  throw new Error(
    "Development identity requires an explicit IDENTITY_SESSION_KEY.",
  );
const growthAPIPool = await createGrowthAPIPool(config.databaseUrl);
let configured: Awaited<ReturnType<typeof createConfiguredBackend>> | undefined;
try {
  configured =
    config.identityAdapter === "development"
      ? await createConfiguredBackend({
          config,
          identity: canonicalDevelopmentIdentity(),
          guardrails: {
            checkSentence: async () => {
              throw new Error("AI generation is unconfigured.");
            },
          },
          signedSubjectPolicies: [commerceSignedSubjects],
          ...(process.env.TRUST_LOCAL_DEVELOPMENT === "true"
            ? {
                trust: (
                  runtime: Parameters<typeof createDevelopmentTrust>[0],
                ) =>
                  createDevelopmentTrust(runtime, {
                    consumers: {
                      // Trust starts first. Resolve only the actual prepared
                      // conversation owners after the canonical host binds.
                      conversation: () => features.conversationPrivacy,
                      commerceOwner: () => features.commerce,
                      additional:
                        process.env.GROWTH_ENABLED === "true"
                          ? [
                              {
                                domain: "growth",
                                async run(job) {
                                  // Trust is composed first; resolve the actual
                                  // owner only after feature composition completes.
                                  if (!features.growth)
                                    throw new DomainError(
                                      "privacy_commit_fence_unavailable",
                                      "The actual Growth privacy owner is unavailable.",
                                      503,
                                    );
                                  return features.growth.privacyHook.run(job);
                                },
                              },
                            ]
                          : [],
                    },
                  }),
              }
            : {}),
          registerFeatures: async (runtime) => {
            const accountCalls = await AccountCallMetadata.prepare(runtime);
            const callControl = await InteractiveCallControl.prepare(runtime);
            const mediaEnvironment = readMediaEnvironment();
            const mediaDenials = callControl
              ? runtimeMediaDenials(runtime, callControl)
              : null;
            // The development host consumes W8's 0082 held try-fence. A code
            // callback alone cannot advertise media while its real producer is
            // absent. Registry activation and custody remain with W8.
            const mediaAuthorityReady = Boolean(callControl);
            const mediaHost =
              mediaEnvironment && mediaDenials && mediaAuthorityReady
                ? composeMediaHost({
                    runtime,
                    environment: mediaEnvironment,
                    denials: mediaDenials,
                    development: true,
                  })
                : undefined;
            // W3 composes conversations, Creator AI and commerce together so
            // fan generation uses one model, journal, allowance and trial path.
            const syntheticHost = {
              environment: process.env.NODE_ENV,
              enabled: process.env.W2_DEVELOPMENT_SYNTHETIC_LICENSING,
              identityMode: config.identityAdapter,
              webOrigin: config.allowedOrigin,
            };
            const licensing =
              process.env.W2_DEVELOPMENT_SYNTHETIC_LICENSING === "true"
                ? {
                    licenseVerifier: DevelopmentLicenseVerifier.create(
                      runtime.pool,
                      syntheticHost,
                    ),
                    journalPolicy:
                      developmentSyntheticJournalPolicy(syntheticHost),
                  }
                : {};
            const host = await composeConversationHost(runtime, config, {
              ...licensing,
              ...(mediaHost
                ? {
                    media: mediaHost.media,
                    bindRecordingPublication:
                      mediaHost.bindRecordingPublication,
                  }
                : {}),
            });
            features.close.push(() => host.close());
            const { commerce, conversation, agent } = host;
            features.commerce = commerce?.service;
            // Preparing the genuine graph does not configure a provider, worker
            // purpose or arrival policy. Calls remain unmounted until those
            // separate producers exist; no request Actor is invented.
            process.stdout.write(
              callControl
                ? "Call control: prepared; calling awaits provider, worker and policy composition.\n"
                : "Call control: unavailable; canonical held request authority is not activated.\n",
            );
            features.conversationPrivacy = host.privacy;
            runtime.configureSignedSubjects(conversation.signedSubjectPolicies);
            // Growth and Content share publication/follow composition. Resolve
            // the actual reader after the canonical Content service is bound,
            // before listeners start; no request can borrow a projection DTO.
            let postEntryReader: CurrentPostEntryReader | undefined;
            features.growth = await configureGrowthForBackend({
              ...runtime,
              pool: growthAPIPool ?? runtime.pool,
              postEntryReader: {
                current(input) {
                  if (!postEntryReader)
                    throw new DomainError(
                      "growth_entry_context_unconfigured",
                      "Current post context is unavailable. Reopen the post and try again.",
                      503,
                    );
                  return postEntryReader.current(input);
                },
              },
              privacyTaskAuthority: async (client, job) => {
                if (!runtime.assertRestoredInTransaction)
                  throw new DomainError(
                    "privacy_commit_fence_unavailable",
                    "Current held restoration authority is required.",
                    503,
                  );
                return domainPrivacyTaskAuthorityInTransaction(
                  client,
                  job,
                  "growth",
                  runtime.assertRestoredInTransaction,
                );
              },
              assertAllowed: async (actor, creatorId) =>
                creatorId
                  ? runtime.assertCreatorAllowed(actor, creatorId)
                  : runtime.assertActorAllowed(actor),
              owners: runtime.identity
                ? {
                    homePage: canonicalHomePage({
                      thread: canonicalConversationHomePage(
                        conversation.feature,
                        runtime.access,
                        runtime.database,
                        runtime.identity.signing,
                        async (creatorId) => {
                          const row = (
                            await runtime.pool.query<{ handle: string }>(
                              "SELECT handle FROM creator.creator_profile WHERE id=$1",
                              [creatorId],
                            )
                          ).rows[0];
                          return row?.handle ?? null;
                        },
                      ),
                    }),
                    ...(commerce
                      ? {
                          discoveryAccess: canonicalPassAccess(
                            commerce.service,
                          ),
                        }
                      : {}),
                  }
                : undefined,
            });
            const contentHost = composeContentHost({
              pool: runtime.pool,
              owners: {
                commerce: commerce?.service,
                conversation: runtime.conversation,
                access: runtime.access,
                profiles: runtime.identity?.profiles,
              },
              dependencies: {
                assertAllowed: runtime.assertCreatorAllowed,
                reviewReply: createTrustReplyReviewer(),
                assertAllowedInTransaction: async (
                  client,
                  actor,
                  creatorId,
                ) => {
                  if (
                    !runtime.assertRestoredInTransaction ||
                    !runtime.assertContentAllowedInTransaction
                  )
                    throw new DomainError(
                      "content_denial_unconfigured",
                      "Content requires current held denial authority.",
                      503,
                    );
                  await runtime.assertRestoredInTransaction(client);
                  await runtime.assertContentAllowedInTransaction(
                    client,
                    actor,
                    creatorId,
                  );
                },
                mediaPublication: mediaHost?.contentPublication,
                // Canonical content retains creator_runtime and actual held
                // scopes. Missing 0101 custody fails closed without Growth grants.
                ...(features.growth
                  ? { follows: features.growth.coreContentFollows }
                  : {}),
              },
              ...(features.growth && runtime.identity
                ? {
                    publicProjection: async (actor, effect) =>
                      contentPublicProjection(
                        features.growth!.service,
                        content.content,
                        runtime.identity!.signing,
                      )(actor, effect),
                  }
                : {}),
              assertScopeAllowedInTransaction:
                runtime.assertScopeAllowedInTransaction,
            });
            const content = runtime.assertScopeAllowedInTransaction
              ? await createCommerceStudio({
                  assertScopeAllowedInTransaction:
                    runtime.assertScopeAllowedInTransaction,
                  ...(commerce?.publicPacketRead
                    ? { publicPacketRead: commerce.publicPacketRead }
                    : {}),
                  pool: runtime.pool,
                  owners: contentHost.owners,
                  dependencies: contentHost.dependencies,
                })
              : createContentStudio({
                  pool: runtime.pool,
                  owners: contentHost.owners,
                  dependencies: contentHost.dependencies,
                });
            contentHost.bindContent(content.content);
            if (
              features.growth &&
              runtime.audienceIdentity &&
              runtime.assertRestoredInTransaction &&
              runtime.assertContentAllowedInTransaction
            )
              postEntryReader = createCurrentContentPostEntryReader(
                runtime,
                content.content,
              );
            mediaHost?.bindContent(content.content);
            runtime.configureSignedSubjects(
              Array.isArray(content.signedSubjects)
                ? content.signedSubjects
                : [content.signedSubjects],
            );
            return [
              conversation.registration,
              agentFeature({
                domain: agent,
                pool: runtime.pool,
                development: config.identityAdapter === "development",
              }),
              mediaHost?.feature(accountCalls) ??
                mediaFeature({ accountCalls }),
              ...(commerce ? [commerce.feature] : []),
              ...(content ? content.features : []),
              ...(features.growth ? [features.growth.feature] : []),
            ];
          },
        })
      : undefined;
} catch (error) {
  await Promise.allSettled([
    features.growth?.close(),
    ...features.close.map((close) => Promise.resolve().then(close)),
    growthAPIPool?.end(),
  ]);
  throw error;
}
features.growth?.start();
const server = configured?.server ?? createServer(createApp(config));
server.listen(
  {
    port: config.port,
    ...(config.identityAdapter === "development" ? { host: "127.0.0.1" } : {}),
  },
  () =>
    process.stdout.write(
      `Interactive API listening on ${config.port}; identity mode ${config.identityAdapter ?? "unconfigured"}.\n`,
    ),
);
let shutdownInFlight: Promise<void> | undefined;
const shutdown = () => {
  // Shell, watcher and OS signals can overlap. One shared cleanup must own
  // every worker/pool so a second signal cannot interrupt the first drain.
  shutdownInFlight ??= (async () => {
    let failed = false;
    const close = async (name: string, action: () => unknown) => {
      try {
        await action();
      } catch {
        failed = true;
        console.error(`Shutdown could not close ${name}.`);
      }
    };
    await close("Growth worker", () => features.growth?.close());
    for (const action of features.close) await close("feature workers", action);
    await close("configured backend", () =>
      configured
        ? configured.close()
        : new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
    );
    await close("Growth API pool", () => growthAPIPool?.end());
    process.exit(failed ? 1 : 0);
  })();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
