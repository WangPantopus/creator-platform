/** Explicit loopback W5 host. Synthetic actors cannot be enabled in production. */
import { randomBytes } from "node:crypto";
import { readFile, writeFile, stat } from "node:fs/promises";
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
import { ContentSources } from "./sources.js";
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
let contentSources: ContentSources;
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
    const repository = new AgentRepository(runtime.pool),
      agent = new AgentService(
        repository,
        new AgentPipeline(repository, model),
      ),
      sources = new SourceService(repository);
    content = new ContentService(runtime.pool, {
      assertAllowed: runtime.assertCreatorAllowed,
      follows: async (client, accountId, creatorId) =>
        Boolean(
          (
            await client.query(
              "SELECT 1 FROM growth.follow WHERE account_id=$1 AND creator_id=$2",
              [accountId, creatorId],
            )
          ).rowCount,
        ),
      revokeSource: (...args) => contentSources.revoke(...args),
      effect: async (actor, effect) => {
        if (effect.type === "source_candidate")
          return contentSources.candidate(actor, effect);
        if (effect.type === "source_revoke") {
          await contentSources.revoke(
            actor,
            effect.creatorId,
            effect.contentId,
            effect.version,
          );
          return { reference: `revoked:${effect.contentId}:${effect.version}` };
        }
        throw new DomainError(
          "content_distribution_unconfigured",
          "The current-state distribution producer is not connected.",
          503,
        );
      },
      thanksMessage: async (client, actor, creatorId, messageId) => {
        const fan = (
          await client.query(
            "SELECT id FROM creator.fan_profile WHERE account_id=$1",
            [actor.accountId],
          )
        ).rows[0];
        if (!fan) return null;
        await client.query("SELECT set_config('app.fan_id',$1,true)", [fan.id]);
        return (
          (
            await client.query(
              "SELECT thread_id FROM creator.message WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND author_kind IN('ai','human_creator','approved_draft','human_call','human_broadcast') AND delivery_state='delivered'",
              [messageId, creatorId, fan.id],
            )
          ).rows[0]?.thread_id ?? null
        );
      },
      publicPacket: async (client, _actor, creatorId, packetId) =>
        Boolean(
          (
            await client.query(
              "SELECT 1 FROM creator.commerce_packet p JOIN creator.commerce_commitment c ON c.packet_id=p.id JOIN creator.commerce_share_grant s ON s.packet_id=p.id JOIN creator.commerce_mode m ON m.id=p.mode_id WHERE p.id=$1 AND p.creator_id=$2 AND p.state='accepted' AND p.payment_state='captured' AND c.state='delivered' AND s.fan_choice AND s.creator_permission AND s.revoked_at IS NULL AND m.shareable AND m.state='offered'",
              [packetId, creatorId],
            )
          ).rowCount,
        ),
    });
    contentSources = new ContentSources(content, sources, repository);
    const commerce = new CommerceService(
      runtime.pool,
      runtime.database,
      runtime.access,
      {
        currency,
        limitOptions: [],
        passEnabled: false,
      },
    );
    studio = new StudioService(content, {
      commerce,
      conversation: runtime.conversation,
      access: runtime.access,
      agent,
      profiles: runtime.identity?.profiles,
    });
    return [
      conversation.registration,
      contentFeature(content),
      studioFeature(studio),
      commerceFeature(commerce),
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
let sweeping = false;
const worker =
  process.env.W5_CONTENT_WORKER === "1"
    ? setInterval(() => {
        if (sweeping) return;
        sweeping = true;
        void (async () => {
          for (const identityActor of identity.developmentActors) {
            const actor = await identity.resolveSession(
              `development:${identityActor.id}`,
            );
            const current = await studio.session(actor);
            for (const creator of current.creators)
              if (creator.owned && creator.verification === "verified") {
                await content.runScheduled(actor, creator.id);
                await content.drainEffects(actor, creator.id);
              }
          }
        })()
          .catch((failure) =>
            process.stderr.write(
              `W5 worker deferred: ${failure instanceof DomainError ? failure.code : "owner_unavailable"}\n`,
            ),
          )
          .finally(() => {
            sweeping = false;
          });
      }, 5000)
    : undefined;
backend.server.listen(apiPort, "127.0.0.1", () =>
  process.stdout.write(
    `W5 API${apiPort} · persisted non-owner RLS · synthetic development actors · genuine W1 passkeys required; provider-dependent paths unavailable until configured.\n`,
  ),
);
const stop = () => {
  if (worker) clearInterval(worker);
  void backend.close().then(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
