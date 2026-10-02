import { createServer } from "node:http";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createConfiguredBackend } from "./integration.js";
import { DevelopmentIdentityAdapter } from "./modules/identity/development.js";
import { commerceSignedSubjects } from "./modules/commerce/registration.js";
import { configureGrowthForBackend } from "./modules/growth/configured.js";
import { composeConversationHost } from "./modules/conversation/host.js";
import { createCommerceStudio } from "./modules/commerce/studio.js";
import { createContentStudio } from "./modules/content/integration.js";
import { mediaFeature } from "./modules/media/registration.js";
import { readMediaEnvironment } from "./modules/media/environment.js";
import { composeMediaHost, runtimeMediaDenials } from "./modules/media/host.js";
import {
  DevelopmentLicenseVerifier,
  developmentSyntheticJournalPolicy,
} from "./modules/agent/development-license.js";
import { agentFeature } from "./modules/agent/feature.js";
import {
  createDevelopmentTrust,
  developmentTrustActors,
} from "./modules/trust/development.js";
import { contentPublicProjection } from "./modules/growth/content.js";
import { canonicalConversationHomePage } from "./modules/growth/home.js";
import { canonicalPassAccess } from "./modules/growth/integration.js";
import { DomainError } from "./core/errors.js";
import { copy } from "@qelvora/copy";
import { createGrowthAPIPool } from "./db/growth-api-pool.js";

// Production hosts inject genuine identity, W8 denials and provider dependencies
// into the same configured-host seam. Development identity is always explicit.
const config = readConfig();
const features: {
  growth: Awaited<ReturnType<typeof configureGrowthForBackend>>;
  close: (() => void)[];
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
          identity: new DevelopmentIdentityAdapter(
            config.allowedOrigin,
            process.env.NODE_ENV,
            process.env.TRUST_LOCAL_DEVELOPMENT === "true"
              ? developmentTrustActors
              : [],
          ),
          ...(process.env.TRUST_LOCAL_DEVELOPMENT === "true"
            ? { trust: (runtime) => createDevelopmentTrust(runtime) }
            : {}),
          guardrails: {
            checkSentence: async () => {
              throw new Error("AI generation is unconfigured.");
            },
          },
          signedSubjectPolicies: [commerceSignedSubjects],
          registerFeatures: async (runtime) => {
            const mediaEnvironment = readMediaEnvironment();
            const mediaDenials = runtimeMediaDenials(runtime);
            const mediaHost =
              mediaEnvironment && mediaDenials
                ? composeMediaHost({
                    runtime,
                    environment: mediaEnvironment,
                    denials: mediaDenials,
                    development: true,
                  })
                : undefined;
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
            runtime.configureSignedSubjects(conversation.signedSubjectPolicies);
            const contentDependencies = {
              mediaPublication: mediaHost?.contentPublication,
              assertAllowed: runtime.assertCreatorAllowed,
              follows: async (
                ...args: Parameters<
                  NonNullable<
                    import("./modules/content/service.js").ContentDependencies["follows"]
                  >
                >
              ) => {
                if (!features.growth)
                  throw new DomainError(
                    "content_delivery_unconfigured",
                    copy.growthErrorContentEffectUnconfigured,
                    503,
                  );
                return features.growth.contentFollows(...args);
              },
              effect: async (
                ...args: Parameters<ReturnType<typeof contentPublicProjection>>
              ): Promise<{ reference: string }> => {
                if (!features.growth || !runtime.identity)
                  throw new DomainError(
                    "content_delivery_unconfigured",
                    copy.growthErrorContentEffectUnconfigured,
                    503,
                  );
                return contentPublicProjection(
                  features.growth.service,
                  content.content,
                  runtime.identity.signing,
                )(...args);
              },
            };
            const content = runtime.assertScopeAllowedInTransaction
              ? await createCommerceStudio({
                  assertScopeAllowedInTransaction:
                    runtime.assertScopeAllowedInTransaction,
                  pool: growthAPIPool ?? runtime.pool,
                  owners: {
                    commerce: commerce?.service,
                    conversation: runtime.conversation,
                    access: runtime.access,
                    profiles: runtime.identity?.profiles,
                  },
                  dependencies: contentDependencies,
                })
              : createContentStudio({
                  pool: growthAPIPool ?? runtime.pool,
                  owners: {
                    commerce: commerce?.service,
                    conversation: runtime.conversation,
                    access: runtime.access,
                    profiles: runtime.identity?.profiles,
                  },
                  dependencies: contentDependencies,
                });
            mediaHost?.bindContent(content.content);
            runtime.configureSignedSubjects(
              Array.isArray(content.signedSubjects)
                ? content.signedSubjects
                : [content.signedSubjects],
            );
            features.growth = await configureGrowthForBackend({
              ...runtime,
              pool: growthAPIPool ?? runtime.pool,
              assertAllowed: async (actor, creatorId) =>
                creatorId
                  ? runtime.assertCreatorAllowed(actor, creatorId)
                  : runtime.assertActorAllowed(actor),
              owners: runtime.identity
                ? {
                    homePage: canonicalConversationHomePage(
                      conversation.feature,
                      runtime.access,
                      runtime.database,
                      runtime.identity.signing,
                      async (creatorId) => {
                        const row = (
                          await runtime.pool.query(
                            "SELECT handle FROM creator.creator_profile WHERE id=$1",
                            [creatorId],
                          )
                        ).rows[0];
                        return row?.handle ?? null;
                      },
                    ),
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
            return [
              conversation.registration,
              agentFeature({
                domain: agent,
                pool: runtime.pool,
                development: config.identityAdapter === "development",
              }),
              mediaHost?.feature() ?? mediaFeature({}),
              ...(commerce ? [commerce.feature] : []),
              ...(content ? content.features : []),
              ...(features.growth ? [features.growth.feature] : []),
            ];
          },
        })
      : undefined;
} catch (error) {
  await growthAPIPool?.end();
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
const shutdown = () => {
  void (async () => {
    await features.growth?.close();
    for (const close of features.close) close();
    if (configured) await configured.close();
    else await new Promise<void>((resolve) => server.close(() => resolve()));
    await growthAPIPool?.end();
    process.exit(0);
  })();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
