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
} from "./modules/content/integration.js";
import { mediaFeature } from "./modules/media/registration.js";
import { readMediaEnvironment } from "./modules/media/environment.js";
import { composeMediaHost, runtimeMediaDenials } from "./modules/media/host.js";
import {
  createDevelopmentTrust,
  developmentTrustActors,
} from "./modules/trust/development.js";
import { agentFeature } from "./modules/agent/feature.js";
import { DomainError } from "./core/errors.js";
import { InteractiveCallControl } from "./modules/session/interactive-control.js";
import { AccountCallMetadata } from "./modules/session/account-call-metadata.js";

// Production hosts inject genuine identity, W8 denials and provider dependencies
// into the same configured-host seam. Development identity is always explicit.
const config = readConfig();
function canonicalDevelopmentIdentity() {
  const identity = new DevelopmentIdentityAdapter(
    config.allowedOrigin,
    process.env.NODE_ENV,
  );
  if (process.env.TRUST_LOCAL_DEVELOPMENT === "true") {
    const labels = new Map(
      developmentTrustActors.map((actor) => [actor.id, actor.label]),
    );
    // Labels describe existing synthetic accounts; the real Ops membership
    // check and canonical session issuer still decide every permission.
    for (const actor of identity.developmentActors)
      actor.label = labels.get(actor.id) ?? actor.label;
  }
  return identity;
}
const features: {
  growth: Awaited<ReturnType<typeof configureGrowthForBackend>>;
  close: (() => void)[];
} = { growth: null, close: [] };
if (config.identityAdapter === "development" && !config.identitySessionKey)
  throw new Error(
    "Development identity requires an explicit IDENTITY_SESSION_KEY.",
  );
const configured =
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
          ? { trust: createDevelopmentTrust }
          : {}),
        registerFeatures: async (runtime) => {
          const accountCalls = await AccountCallMetadata.prepare(runtime);
          const mediaEnvironment = readMediaEnvironment();
          const mediaDenials = runtimeMediaDenials(runtime);
          // The development host consumes W8's 0082 held try-fence. A code
          // callback alone cannot advertise media while its real producer is
          // absent. Registry activation and custody remain with W8.
          const mediaAuthorityReady =
            mediaEnvironment && mediaDenials
              ? (
                  await runtime.pool.query<{ ready: boolean }>(
                    "SELECT to_regprocedure('creator_trust.interactive_denial(text,uuid,uuid)') IS NOT NULL AS ready",
                  )
                ).rows[0]?.ready === true
              : false;
          const mediaHost =
            mediaEnvironment && mediaDenials && mediaAuthorityReady
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
          // W3 composes conversations, Creator AI and commerce together so
          // fan generation uses one model, journal, allowance and trial path.
          const host = await composeConversationHost(
            runtime,
            config,
            mediaHost
              ? {
                  media: mediaHost.media,
                  bindRecordingPublication: mediaHost.bindRecordingPublication,
                }
              : {},
          );
          features.close.push(() => host.close());
          const { commerce, conversation, agent } = host;
          // Preparing the genuine graph does not configure a provider, worker
          // purpose or arrival policy. The calls feature remains unmounted
          // until those separate producers exist; no request Actor is invented.
          const callControl = await InteractiveCallControl.prepare(runtime);
          process.stdout.write(
            callControl
              ? "Call control: prepared; calling awaits provider, worker and policy composition.\n"
              : "Call control: unavailable; canonical held request authority is not activated.\n",
          );
          runtime.configureSignedSubjects(conversation.signedSubjectPolicies);
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
              assertAllowedInTransaction: async (client, actor, creatorId) => {
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
            },
            ...(features.growth && runtime.identity
              ? {
                  growth: {
                    service: features.growth.service,
                    signing: runtime.identity.signing,
                    follows: { follows: features.growth.contentFollows },
                  },
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
            mediaHost?.feature(accountCalls) ?? mediaFeature({ accountCalls }),
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
    for (const close of features.close) close();
    if (configured) await configured.close();
    else await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  })();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
