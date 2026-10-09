/**
 * Lane 5 scenario host: the real backend on a real PostgreSQL, for the
 * workflows in tests/scenarios/lane-5. Run it with
 *   sh tests/scenarios/lane-5/run-host.sh
 * after tests/scenarios/lane-5/setup.sh has built the disposable database.
 *
 * It composes the same real modules apps/backend/src/server.ts composes for
 * these workflows: identity sessions, signed acts, the content service and its
 * routes through composeContentHost, audience and membership recognition, the
 * growth runtime (relay, notification engine and its worker loop) and the real
 * `creator_trust` denial callbacks over the real denial functions. This file is
 * also the wiring the integrator copies into server.ts for WP 5.2.
 *
 * What it leaves out, and a scenario therefore cannot prove: the later
 * migration waves the stock trust runtime insists on (restoration gate,
 * privacy export), the reply reviewer (a reply stays pending until a decision
 * is recorded) and the conversation and commerce hosts. Fakes, all at the
 * outer edge: the development identity provider (a longer list of synthetic
 * accounts) and the push gateway, a recorder on port 56453 that stands in for
 * APNs and FCM (the real adapters need Apple and Google credentials, WP 5.3).
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createConfiguredBackend } from "../../../apps/backend/src/integration.js";
import { readConfig } from "../../../apps/backend/src/config.js";
import { createGrowthAPIPool } from "../../../apps/backend/src/db/growth-api-pool.js";
import { DevelopmentIdentityAdapter } from "../../../apps/backend/src/modules/identity/development.js";
import { ContentService } from "../../../apps/backend/src/modules/content/service.js";
import {
  contentFeature,
  contentSignedSubjects,
} from "../../../apps/backend/src/modules/content/registration.js";
import { composeContentHost } from "../../../apps/backend/src/modules/content/integration.js";
import { contentNoticeOwner } from "../../../apps/backend/src/modules/content/notices.js";
import { configureGrowthForBackend } from "../../../apps/backend/src/modules/growth/configured.js";
import { composeNotificationOwners } from "../../../apps/backend/src/modules/growth/owners.js";
import {
  DeliveryFailure,
  type DeliveryProvider,
} from "../../../apps/backend/src/modules/growth/notifications.js";
import {
  trustAudienceRestrictionInTransaction,
  trustContentRestrictionInTransaction,
  trustCreatorFanRestrictionInTransaction,
  trustScopeRestrictionInTransaction,
} from "../../../apps/backend/src/modules/trust/scope-restriction.js";
import { actorId, ACTOR_COUNT } from "./ids.mjs";

if (process.env.NODE_ENV !== "development")
  throw new Error("The scenario host runs only with NODE_ENV=development.");
const config = readConfig();
const database = new URL(config.databaseUrl ?? "");
if (
  database.hostname !== "127.0.0.1" ||
  !/creator_foundation_lane5/u.test(database.pathname)
)
  throw new Error(
    "The scenario host uses only the lane 5 disposable database.",
  );

class ScenarioIdentity extends DevelopmentIdentityAdapter {
  override readonly developmentActors = Object.freeze(
    Array.from({ length: ACTOR_COUNT }, (_unused, index) =>
      Object.freeze({ id: actorId(index), label: `Scenario actor ${index}` }),
    ),
  );
}

// The fake push gateway: records what would reach APNs or FCM, and can be told
// to be down so a scenario can watch the engine retry.
const sent: Record<string, unknown>[] = [];
let gatewayDown = false;
const provider: DeliveryProvider = {
  async send(input) {
    // A real provider rechecks lease, owner state and controls right before
    // external bytes; the engine supplies that check.
    await input.beforeSubmit();
    if (gatewayDown) throw new DeliveryFailure(1);
    sent.push({
      channel: input.channel,
      accountId: input.accountId,
      notificationId: input.notificationId,
      sender: input.sender,
      preview: input.preview,
      destination: input.destination,
      authorship: input.authorship,
      entries: input.entries ?? null,
    });
    return { providerRef: `fake-gateway:${randomUUID()}` };
  },
};
const gateway = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.method === "GET" && req.url === "/sent") {
    res.end(JSON.stringify(sent));
  } else if (req.method === "DELETE" && req.url === "/sent") {
    sent.length = 0;
    res.end("{}");
  } else if (req.method === "PUT" && req.url === "/down") {
    gatewayDown = true;
    res.end("{}");
  } else if (req.method === "PUT" && req.url === "/up") {
    gatewayDown = false;
    res.end("{}");
  } else {
    res.statusCode = 404;
    res.end("{}");
  }
});
gateway.listen(56453, "127.0.0.1");

const growthAPIPool = await createGrowthAPIPool(config.databaseUrl);
let growth: Awaited<ReturnType<typeof configureGrowthForBackend>> = null;
const backend = await createConfiguredBackend({
  config,
  identity: new ScenarioIdentity(config.allowedOrigin, "development"),
  guardrails: {
    checkSentence: async () => {
      throw new Error("AI generation is not part of the lane 5 scenarios.");
    },
  },
  assertScopeAllowedInTransaction: trustScopeRestrictionInTransaction(),
  assertAudienceAllowed: trustAudienceRestrictionInTransaction(),
  registerFeatures: async (runtime, onClose) => {
    if (!runtime.audienceIdentity || !runtime.identity)
      throw new Error("Audience identity is required.");
    // Growth first, as in server.ts. Its notification owner needs the content
    // service, which needs growth's relay: the owner is bound once both exist.
    const late: { contentOwner?: ReturnType<typeof contentNoticeOwner> } = {};
    growth = await configureGrowthForBackend({
      ...runtime,
      pool: growthAPIPool ?? runtime.pool,
      assertAllowed: (actor, creatorId) =>
        creatorId
          ? runtime.assertCreatorAllowed(actor, creatorId)
          : runtime.assertActorAllowed(actor),
      provider,
      owners: {
        notificationState: composeNotificationOwners({
          content: async (event, recipient, custody) =>
            late.contentOwner
              ? late.contentOwner(event, recipient, custody)
              : {
                  retryable: true,
                  available: false,
                  authorized: false,
                  version: 0,
                  creatorName: "",
                  authorKind: "system",
                  safePreview: "",
                  destination: "/notifications",
                },
        }),
      },
    });
    if (!growth) throw new Error("Growth is not enabled.");
    const stopGrowth = growth;
    onClose(() => stopGrowth.close());
    const composition = composeContentHost({
      pool: runtime.pool,
      owners: {
        conversation: runtime.conversation,
        access: runtime.access,
        profiles: runtime.identity.profiles,
      },
      dependencies: {
        assertAllowed: runtime.assertCreatorAllowed,
        assertAllowedInTransaction: trustContentRestrictionInTransaction(),
      },
      tenure: { audienceIdentity: runtime.audienceIdentity },
      creatorTenure: {
        holdCreatorFanNegativeAuthority:
          trustCreatorFanRestrictionInTransaction(),
      },
      notices: { relay: growth.relay },
    });
    const content = new ContentService(runtime.pool, composition.dependencies);
    composition.bindContent(content);
    late.contentOwner = contentNoticeOwner({ pool: runtime.pool, content });
    runtime.configureSignedSubjects([contentSignedSubjects(content)]);
    return [contentFeature(content), growth.feature];
  },
});

(growth as { start(): void } | null)?.start();
backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(`lane 5 scenario host listening on ${config.port}\n`),
);
const stop = () =>
  void backend.close().then(async () => {
    gateway.close();
    await growthAPIPool?.end();
    process.exit(0);
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
