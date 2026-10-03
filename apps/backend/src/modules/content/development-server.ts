/** Explicit loopback W5 host. Synthetic actors cannot be enabled in production. */
import { randomBytes } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import pg from "pg";
import { createGrowthAPIPool } from "../../db/growth-api-pool.js";
import {
  createConfiguredBackend,
  type BackendRuntime,
} from "../../integration.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { ContentService } from "./service.js";
import { contentFeature, contentSignedSubjects } from "./registration.js";
import { StudioService } from "../studio/service.js";
import { studioFeature } from "../studio/registration.js";
import { CommerceService } from "../commerce/service.js";
import {
  CommerceFulfillmentPlans,
  FULFILLMENT_PLAN_MIGRATION,
  FULFILLMENT_PLAN_SCHEMA_SHA256,
} from "../commerce/fulfillment-plans.js";
import { SIGNATURE_READ_FENCE_MIGRATION } from "../identity/signature-read-fence.js";
import {
  commerceFeature,
  commerceSignedSubjects,
} from "../commerce/registration.js";
import { AgentRepository } from "../agent/repository.js";
import { AgentService } from "../agent/service.js";
import { AgentPipeline } from "../agent/pipeline.js";
import { modelFromEnvironment } from "../agent/model.js";
import { SourceService } from "../sources/service.js";
import { createAgentRouter } from "../agent/router.js";
import { DomainError } from "../../core/errors.js";
import { composeContentHost } from "./integration.js";
import { configureGrowthForBackend } from "../growth/configured.js";
import { canonicalCoreContentFollows } from "../growth/core-follows.js";
import { contentPublicProjection } from "../growth/content.js";
import { prepareTrustReplyReviewer } from "../trust/reply-review.js";
import { createDevelopmentTrust } from "../trust/development.js";
import { createAgentDomain } from "../agent/integration.js";
import { canonicalConversationHome } from "../growth/home.js";
import { createConversationRuntime } from "../conversation/runtime.js";

const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3005",
  url = process.env.DATABASE_URL,
  apiPort = Number(process.env.W5_API_PORT ?? 4105);
if (
  process.env.NODE_ENV !== "development" ||
  !url ||
  new URL(url).hostname !== "127.0.0.1" ||
  new URL(url).port !== "55435" ||
  new URL(url).pathname !== "/creator_w5" ||
  !["localhost", "127.0.0.1"].includes(new URL(webOrigin).hostname) ||
  ![
    ["3005", 4105],
    ["30055", 41055],
  ].some(
    ([webPort, port]) =>
      new URL(webOrigin).port === webPort && apiPort === port,
  )
)
  throw new Error(
    "W5 requires its isolated loopback database and an explicit3005/4105 or30055/41055 host pair.",
  );
class W5DevelopmentIdentity extends DevelopmentIdentityAdapter {
  override readonly developmentActors = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      label: "W5 development creator",
    },
    {
      id: "10000000-0000-4000-8000-000000000002",
      label: "W5 development fan one",
    },
    {
      id: "10000000-0000-4000-8000-000000000003",
      label: "W5 development fan two",
    },
    {
      id: "10000000-0000-4000-8000-000000000004",
      label: "W5 development triage team",
    },
  ];
}
const identity = new W5DevelopmentIdentity(webOrigin, "development");
const sessionKeyFile =
  process.env.W5_SESSION_KEY_FILE ?? "/private/tmp/creator-w5-session-key";
try {
  await writeFile(sessionKeyFile, randomBytes(32).toString("base64"), {
    flag: "wx",
    mode: 0o600,
  });
} catch (failure) {
  if ((failure as NodeJS.ErrnoException).code !== "EEXIST") throw failure;
}
if ((await stat(sessionKeyFile)).mode & 0o077)
  throw new Error("W5 session key must be readable only by its owner.");
const sessionKey = (await readFile(sessionKeyFile, "utf8")).trim();
const currency = process.env.COMMERCE_CURRENCY;
if (!currency)
  throw new Error("Explicit development commerce currency is required.");
const groupMinimumText = process.env.W5_GROUP_MINIMUM_RECIPIENTS;
if (
  groupMinimumText !== undefined &&
  (!/^(?:[2-9]|[1-9][0-9]|100)$/u.test(groupMinimumText) ||
    Number(groupMinimumText) > 100)
)
  throw new Error("W5 group minimum must be the explicit founder choice2–100.");
let content: ContentService;
let studio: StudioService;
const features: {
  growth: Awaited<ReturnType<typeof configureGrowthForBackend>>;
  agentPool?: pg.Pool;
  growthPool?: pg.Pool;
} = { growth: null };
const agentDatabaseUrl = process.env.W5_AGENT_DATABASE_URL;
if (agentDatabaseUrl) {
  const configured = new URL(agentDatabaseUrl),
    database = new URL(url);
  if (
    configured.hostname !== database.hostname ||
    configured.port !== database.port ||
    configured.pathname !== database.pathname ||
    configured.username !== "creator_runtime"
  )
    throw new Error(
      "W5 AI requires its canonical runtime on the same database.",
    );
} else if (process.env.GROWTH_ENABLED === "true")
  throw new Error("W5 Growth composition requires W5_AGENT_DATABASE_URL.");
const model = modelFromEnvironment();
const agentPoolFor = (runtime: BackendRuntime) => {
  if (features.agentPool) return features.agentPool;
  if (!agentDatabaseUrl) return runtime.pool;
  features.agentPool = new pg.Pool({
    connectionString: agentDatabaseUrl,
    max: 2,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  return features.agentPool;
};
const backend = await createConfiguredBackend({
  config: {
    port: apiPort,
    featureEnabled: true,
    databaseUrl: url,
    allowedOrigin: webOrigin,
    rpId: "localhost",
    identityAdapter: "development",
    identitySessionKey: process.env.IDENTITY_SESSION_KEY ?? sessionKey,
    passkeyOrigins: [webOrigin],
  },
  identity,
  trust: (runtime) =>
    createDevelopmentTrust(runtime, {
      agent: createAgentDomain({ pool: agentPoolFor(runtime), model }),
    }),
  guardrails: {
    checkSentence: async () => {
      throw new DomainError(
        "model_unconfigured",
        "The model provider is not connected.",
        503,
      );
    },
  },
  signedSubjectPolicies: [
    commerceSignedSubjects,
    {
      name: "content",
      requiresFinalization: true,
      prepare: (...args) => contentSignedSubjects(content).prepare(...args),
      finalizeBeforeCommit: (...args) =>
        contentSignedSubjects(content).finalizeBeforeCommit!(...args),
    },
  ],
  registerFeatures: async (runtime) => {
    const growthPool = await createGrowthAPIPool(url);
    if (growthPool) features.growthPool = growthPool;
    const conversation = createConversationRuntime(runtime);
    runtime.configureSignedSubjects(conversation.signedSubjectPolicies);
    const agentPool = agentPoolFor(runtime);
    const repository = new AgentRepository(agentPool),
      agent = new AgentService(
        repository,
        new AgentPipeline(repository, model),
      ),
      sources = new SourceService(repository);
    const commerce = new CommerceService(
      runtime.pool,
      runtime.database,
      runtime.access,
      { currency, limitOptions: [], passEnabled: false },
    );
    const growth = await configureGrowthForBackend({
      ...runtime,
      pool: growthPool ?? runtime.pool,
      assertAllowed: (actor, creatorId) =>
        creatorId
          ? runtime.assertCreatorAllowed(actor, creatorId)
          : runtime.assertActorAllowed(actor),
      owners: runtime.identity
        ? {
            home: canonicalConversationHome(
              conversation.feature,
              runtime.access,
              runtime.database,
              runtime.identity.signing,
            ),
          }
        : {},
    });
    features.growth = growth;
    if (!runtime.assertContentAllowedInTransaction)
      throw new DomainError(
        "content_denial_unconfigured",
        "Configure the current caller-held content denial authority.",
        503,
      );
    let groupPublication:
      | import("./group-publication.js").ContentGroupPublicationOwners
      | undefined;
    if (groupMinimumText !== undefined) {
      if (!runtime.assertScopeAllowedInTransaction)
        throw new DomainError(
          "fulfillment_plans_unconfigured",
          "Current original-recipient denial authority is unavailable.",
          503,
        );
      try {
        const plans = await CommerceFulfillmentPlans.prepare({
          database: runtime.database,
          access: runtime.access,
          assertScopeAllowedInTransaction:
            runtime.assertScopeAllowedInTransaction,
          minimumRecipients: Number(groupMinimumText),
          migration: {
            version: FULFILLMENT_PLAN_MIGRATION,
            checksum: FULFILLMENT_PLAN_SCHEMA_SHA256,
          },
          signatureMigration: {
            version: SIGNATURE_READ_FENCE_MIGRATION,
            checksum:
              "157640de84f22d6d638d788dfe04314fd193efaed80a829f288bec7cbcb815b5",
          },
        });
        groupPublication = {
          database: runtime.database,
          access: runtime.access,
          plans,
          conversations: runtime.conversation,
        };
      } catch (error) {
        if (
          !(error instanceof DomainError) ||
          error.status !== 503 ||
          ![
            "fulfillment_plans_unconfigured",
            "signature_read_unconfigured",
          ].includes(error.code)
        )
          throw error;
        process.stderr.write(
          `W5 group publication unavailable: ${error.code}.\n`,
        );
      }
    }
    const composition = composeContentHost({
      pool: runtime.pool,
      owners: {
        commerce,
        conversation: runtime.conversation,
        access: runtime.access,
        agent,
        profiles: runtime.identity?.profiles,
      },
      dependencies: {
        assertAllowed: runtime.assertCreatorAllowed,
        assertAllowedInTransaction: runtime.assertContentAllowedInTransaction,
        reviewReply: await prepareTrustReplyReviewer(runtime),
      },
      sources: { service: sources, repository },
      ...(groupPublication ? { groupPublication } : {}),
      ...(runtime.audienceIdentity
        ? { tenure: { audienceIdentity: runtime.audienceIdentity } }
        : {}),
      ...(runtime.holdCreatorFanNegativeAuthority
        ? {
            creatorTenure: {
              holdCreatorFanNegativeAuthority:
                runtime.holdCreatorFanNegativeAuthority,
            },
          }
        : {}),
      ...(growth && runtime.identity
        ? {
            followReaders: {
              // No W8 activation receipt exists on the fresh canonical57 DB.
              // The actual producer stays unavailable; never read Growth from
              // a different transaction and treat its Boolean as held access.
              follows: canonicalCoreContentFollows(),
            },
            publicProjection: (actor, effect) =>
              contentPublicProjection(
                growth.service,
                content,
                runtime.identity!.signing,
              )(actor, effect),
          }
        : {}),
      ...(runtime.assertScopeAllowedInTransaction
        ? {
            assertScopeAllowedInTransaction:
              runtime.assertScopeAllowedInTransaction,
          }
        : {}),
    });
    content = new ContentService(runtime.pool, composition.dependencies);
    composition.bindContent(content);
    studio = new StudioService(content, composition.owners);
    return [
      conversation.registration,
      contentFeature(content),
      studioFeature(studio),
      commerceFeature(commerce),
      ...(growth ? [growth.feature] : []),
      {
        name: "agent",
        path: "/v1/agent",
        router: ({ actorFor }) =>
          createAgentRouter({
            service: agent,
            sources,
            development: true,
            resolveActor: actorFor,
          }),
      },
    ];
  },
});
features.growth?.start();
// Development identity is interactive only. Background publication must be
// mounted with W1's separate activated purpose issuer and W8's held denial.
// Never synthesize a development creator session to sweep stored signatures.
if (process.env.W5_CONTENT_WORKER === "1")
  process.stderr.write(
    "W5 publication worker unavailable: the separate W1/W8 purpose authority is not configured in this host.\n",
  );
backend.server.listen(apiPort, "127.0.0.1", () =>
  process.stdout.write(
    `W5 API${apiPort} · persisted non-owner RLS · synthetic development actors · genuine W1 passkeys required; provider-dependent paths unavailable until configured.\n`,
  ),
);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  void (async () => {
    await features.growth?.close();
    await features.growthPool?.end();
    await features.agentPool?.end();
    await backend.close();
    process.exit(0);
  })();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
