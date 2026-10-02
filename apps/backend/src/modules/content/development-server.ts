/** Explicit loopback W5 host. Synthetic actors cannot be enabled in production. */
import { randomBytes } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
import pg from "pg";
import { createConfiguredBackend } from "../../integration.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { ContentService } from "./service.js";
import { contentFeature, contentSignedSubjects } from "./registration.js";
import { StudioService } from "../studio/service.js";
import { studioFeature } from "../studio/registration.js";
import { CommerceService } from "../commerce/service.js";
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
import { canonicalContentFollows } from "../growth/integration.js";
import { createTrustReplyReviewer } from "../trust/reply-review.js";
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
let content: ContentService;
let studio: StudioService;
const features: {
  growth: Awaited<ReturnType<typeof configureGrowthForBackend>>;
  agentPool?: pg.Pool;
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
      prepare: (...args) => contentSignedSubjects(content).prepare(...args),
    },
  ],
  registerFeatures: async (runtime) => {
    const conversation = createConversationRuntime(runtime);
    runtime.configureSignedSubjects(conversation.signedSubjectPolicies);
    const agentPool = agentDatabaseUrl
      ? new pg.Pool({
          connectionString: agentDatabaseUrl,
          max: 2,
          connectionTimeoutMillis: 5000,
          statement_timeout: 5000,
        })
      : runtime.pool;
    if (agentPool !== runtime.pool) features.agentPool = agentPool;
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
              async (creatorId) => {
                const current = await runtime.pool.query<{ handle: string }>(
                  "SELECT handle FROM growth.creator_public WHERE id=$1 AND verified AND state='published'",
                  [creatorId],
                );
                return current.rows[0]?.handle ?? null;
              },
            ),
          }
        : {},
    });
    features.growth = growth;
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
        reviewReply: createTrustReplyReviewer(),
      },
      sources: { service: sources, repository },
      ...(growth && runtime.identity
        ? {
            growth: {
              service: growth.service,
              signing: runtime.identity.signing,
              follows: { follows: canonicalContentFollows() },
            },
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
const stop = () => {
  void (async () => {
    await features.growth?.close();
    await features.agentPool?.end();
    await backend.close();
    process.exit(0);
  })();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
