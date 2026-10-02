import { createServer } from "node:http";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
import { createConfiguredBackend } from "./integration.js";
import { DevelopmentIdentityAdapter } from "./modules/identity/development.js";
import { commerceSignedSubjects } from "./modules/commerce/registration.js";
import { createCommerceRuntime } from "./modules/commerce/runtime.js";
import { readCommerceEnvironment } from "./modules/commerce/environment.js";
import { configureGrowthForBackend } from "./modules/growth/configured.js";
import { createConversationRuntime } from "./modules/conversation/runtime.js";
import { createCommerceStudio } from "./modules/commerce/studio.js";
import { createContentStudio } from "./modules/content/integration.js";
import { mediaFeature } from "./modules/media/registration.js";
import { readMediaEnvironment } from "./modules/media/environment.js";
import { composeMediaHost, runtimeMediaDenials } from "./modules/media/host.js";
import { createDevelopmentTrust } from "./modules/trust/development.js";
import { createAgentDomain } from "./modules/agent/integration.js";
import { agentFeature } from "./modules/agent/feature.js";

// Production hosts inject genuine identity, W8 denials and provider dependencies
// into the same configured-host seam. Development identity is always explicit.
const config = readConfig();
const features: {
  growth: Awaited<ReturnType<typeof configureGrowthForBackend>>;
} = { growth: null };
if (config.identityAdapter === "development" && !config.identitySessionKey)
  throw new Error(
    "Development identity requires an explicit IDENTITY_SESSION_KEY.",
  );
const configured =
  config.identityAdapter === "development"
    ? await createConfiguredBackend({
        config,
        identity: new DevelopmentIdentityAdapter(
          config.allowedOrigin,
          process.env.NODE_ENV,
        ),
        guardrails: {
          checkSentence: async () => {
            throw new Error("AI generation is unconfigured.");
          },
        },
        signedSubjectPolicies: [commerceSignedSubjects],
        ...(process.env.TRUST_LOCAL_DEVELOPMENT === "true"
          ? { trust: createDevelopmentTrust }
          : {}),
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
          features.growth = await configureGrowthForBackend({
            ...runtime,
            assertAllowed: async (actor, creatorId) =>
              creatorId
                ? runtime.assertCreatorAllowed(actor, creatorId)
                : runtime.assertActorAllowed(actor),
          });
          const commerceConfiguration = readCommerceEnvironment(runtime.pool);
          const commerce = commerceConfiguration
            ? await createCommerceRuntime({
                ...runtime,
                ...commerceConfiguration,
              })
            : undefined;
          const conversation = createConversationRuntime(runtime);
          runtime.configureSignedSubjects(conversation.signedSubjectPolicies);
          const agent = createAgentDomain({ pool: runtime.pool, model: null });
          const content = runtime.assertScopeAllowedInTransaction
            ? await createCommerceStudio({
                assertScopeAllowedInTransaction:
                  runtime.assertScopeAllowedInTransaction,
                pool: runtime.pool,
                owners: {
                  commerce: commerce?.service,
                  conversation: runtime.conversation,
                  access: runtime.access,
                  profiles: runtime.identity?.profiles,
                },
                dependencies: {
                  assertAllowed: runtime.assertCreatorAllowed,
                  mediaPublication: mediaHost?.contentPublication,
                },
              })
            : createContentStudio({
                pool: runtime.pool,
                owners: {
                  commerce: commerce?.service,
                  conversation: runtime.conversation,
                  access: runtime.access,
                  profiles: runtime.identity?.profiles,
                },
                dependencies: {
                  assertAllowed: runtime.assertCreatorAllowed,
                  mediaPublication: mediaHost?.contentPublication,
                },
              });
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
            mediaHost?.feature() ?? mediaFeature({}),
            ...(commerce ? [commerce.feature] : []),
            ...(content ? content.features : []),
            ...(features.growth ? [features.growth.feature] : []),
          ];
        },
      })
    : undefined;
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
    if (configured) await configured.close();
    else await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  })();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
