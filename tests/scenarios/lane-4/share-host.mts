/**
 * Lane 4 share host: the real backend with growth's share-card answers from
 * commerce (`createCommerceShareOwners`), for tests/scenarios/lane-4. It runs
 * beside the lane 4 stack's backend, with that backend's own settings file and
 * database, on another port:
 *   PORT=56446 node --env-file=<backend settings> --import tsx tests/scenarios/lane-4/share-host.mts
 * (`share-host-control.mjs` starts and stops it for a scenario.) It needs the
 * stack's growth settings: `stack.mjs up --growth`.
 *
 * This is also the wiring the integrator copies into server.ts, where growth's
 * owners are composed:
 *   owners: { ..., ...createCommerceShareOwners({ service: commerce.service,
 *     access: runtime.access, database: runtime.database,
 *     signing: runtime.identity.signing, pool: runtime.pool }) }
 *
 * Fakes: the development identity. Nothing else is stood in for.
 */
import { createConfiguredBackend } from "../../../apps/backend/src/integration.js";
import { readConfig } from "../../../apps/backend/src/config.js";
import { createGrowthAPIPool } from "../../../apps/backend/src/db/growth-api-pool.js";
import { DevelopmentIdentityAdapter } from "../../../apps/backend/src/modules/identity/development.js";
import { configureGrowthForBackend } from "../../../apps/backend/src/modules/growth/configured.js";
import { CommerceService } from "../../../apps/backend/src/modules/commerce/service.js";
import { readCommerceEnvironment } from "../../../apps/backend/src/modules/commerce/environment.js";
import { createCommerceShareOwners } from "../../../apps/backend/src/modules/commerce/share-owners.js";
import {
  trustAudienceRestrictionInTransaction,
  trustScopeRestrictionInTransaction,
} from "../../../apps/backend/src/modules/trust/scope-restriction.js";

const config = readConfig();
const loopback = (url: string | undefined) =>
  Boolean(url && ["127.0.0.1", "localhost"].includes(new URL(url).hostname));
if (
  process.env.NODE_ENV !== "development" ||
  config.identityAdapter !== "development" ||
  !loopback(config.databaseUrl) ||
  process.env.GROWTH_ENABLED !== "true"
)
  throw new Error(
    "The share host runs only beside a loopback development backend with growth.",
  );

const growthAPIPool = await createGrowthAPIPool(config.databaseUrl);
let growth: Awaited<ReturnType<typeof configureGrowthForBackend>> = null;
const backend = await createConfiguredBackend({
  config,
  identity: new DevelopmentIdentityAdapter(
    config.allowedOrigin,
    process.env.NODE_ENV,
  ),
  guardrails: {
    checkSentence: async () => {
      throw new Error("AI generation is not part of the share scenarios.");
    },
  },
  assertScopeAllowedInTransaction: trustScopeRestrictionInTransaction(),
  assertAudienceAllowed: trustAudienceRestrictionInTransaction(),
  registerFeatures: async (runtime, onClose) => {
    if (!runtime.identity) throw new Error("Identity sessions are required.");
    const commerce = readCommerceEnvironment(runtime.pool);
    if (!commerce) throw new Error("The commerce settings are required.");
    const service = new CommerceService(
      runtime.pool,
      runtime.database,
      runtime.access,
      { ...commerce.policy, costAllowanceIntegrated: false },
      "payments" in commerce ? commerce.payments : undefined,
      runtime.assertActorAllowed,
    );
    growth = await configureGrowthForBackend({
      ...runtime,
      pool: growthAPIPool ?? runtime.pool,
      assertAllowed: (actor, creatorId) =>
        creatorId
          ? runtime.assertCreatorAllowed(actor, creatorId)
          : runtime.assertActorAllowed(actor),
      owners: createCommerceShareOwners({
        service,
        access: runtime.access,
        database: runtime.database,
        signing: runtime.identity.signing,
        pool: runtime.pool,
      }),
    });
    if (!growth) throw new Error("Growth is not enabled.");
    const stopGrowth = growth;
    onClose(() => stopGrowth.close());
    return [growth.feature];
  },
});

backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(`lane 4 share host listening on ${config.port}\n`),
);
const stop = () =>
  void backend.close().then(async () => {
    await growthAPIPool?.end();
    process.exit(0);
  });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
