/** Isolated W2 launcher. Canonical W1 sessions and W3 conversations share the
 * actual runtime pool; missing licensing/policy/journal never enables delivery. */
import {
  createConfiguredBackend,
  type BackendRuntime,
} from "../../integration.js";
import { readConfig } from "../../config.js";
import { DevelopmentIdentityAdapter } from "../identity/development.js";
import { createConversationRuntime } from "../conversation/runtime.js";
import { modelFromEnvironment } from "./model.js";
import { createAgentDomain } from "./integration.js";
import { agentFeature } from "./feature.js";
import { startDevelopmentIngestion } from "../ingestion/development-lifetime.js";
import { DevelopmentLicenseVerifier } from "./development-license.js";
import { createDevelopmentTrust } from "../trust/development.js";
import {
  composeContentHost,
  createContentStudio,
} from "../content/integration.js";

if (
  process.env.NODE_ENV !== "development" ||
  process.env.W2_DEVELOPMENT_MODE !== "true"
)
  throw new Error("Explicit loopback W2 development mode is required.");
const dbUrl = process.env.W2_DATABASE_URL;
if (!dbUrl)
  throw new Error("Set W2_DATABASE_URL to a non-owner W2 database role.");
const webOrigin = process.env.WEB_ORIGIN ?? "http://127.0.0.1:3002";
const origin = new URL(webOrigin);
if (
  origin.hostname !== "127.0.0.1" ||
  origin.protocol !== "http:" ||
  origin.origin !== webOrigin
)
  throw new Error("W2 Studio requires an exact 127.0.0.1 HTTP origin.");
const identity = new DevelopmentIdentityAdapter(webOrigin, "development");
const model = modelFromEnvironment();
if (!process.env.IDENTITY_SESSION_KEY)
  throw new Error("Set a private development IDENTITY_SESSION_KEY.");
const config = readConfig({
  ...process.env,
  DATABASE_URL: dbUrl,
  CREATOR_FEATURE_ENABLED: "true",
  IDENTITY_ADAPTER: "development",
  WEB_ORIGIN: webOrigin,
  PASSKEY_RP_ID: "127.0.0.1",
  PASSKEY_ORIGINS: webOrigin,
  PORT: process.env.PORT ?? "4102",
});
let domain: ReturnType<typeof createAgentDomain> | undefined;
let conversations: ReturnType<typeof createConversationRuntime> | undefined;
// Trust is prepared before feature registration. Both consume this exact
// owner instance so privacy and pause effects cannot drift from Studio.
const prepareDomain = (runtime: BackendRuntime) => {
  if (domain) return domain;
  const licenseVerifier =
    process.env.W2_DEVELOPMENT_SYNTHETIC_LICENSING === "true"
      ? DevelopmentLicenseVerifier.create(runtime.pool, {
          environment: process.env.NODE_ENV,
          enabled: process.env.W2_DEVELOPMENT_SYNTHETIC_LICENSING,
          identityMode: identity.mode,
          webOrigin,
        })
      : undefined;
  domain = createAgentDomain({
    pool: runtime.pool,
    model,
    ...(licenseVerifier ? { licenseVerifier } : {}),
  });
  return domain;
};
const backend = await createConfiguredBackend({
  config,
  identity,
  guardrails: {
    checkSentence: async () => {
      throw new Error("Licensed fan generation is unconfigured.");
    },
  },
  ...(process.env.TRUST_LOCAL_DEVELOPMENT === "true"
    ? {
        trust: (runtime: BackendRuntime) =>
          createDevelopmentTrust(runtime, {
            // Restoration must bind to the same validated W2 endpoint used
            // by readConfig, rather than an unrelated ambient DATABASE_URL.
            env: { ...process.env, DATABASE_URL: dbUrl },
            agent: prepareDomain(runtime),
            consumers: {
              assertRestoredInTransaction: runtime.assertRestoredInTransaction,
            },
          }),
      }
    : {}),
  registerFeatures: async (runtime) => {
    // Opt-in labeled licensing for fictional development creators only.
    domain = prepareDomain(runtime);
    await domain.service.repository.assertRuntimeRole();
    conversations = createConversationRuntime(runtime);
    const composition = composeContentHost({
      pool: runtime.pool,
      owners: {
        conversation: runtime.conversation,
        access: runtime.access,
        agent: domain.service,
        profiles: runtime.identity?.profiles,
      },
      dependencies: {
        assertAllowed: runtime.assertCreatorAllowed,
        assertAllowedInTransaction: runtime.assertContentAllowedInTransaction,
      },
      sources: {
        service: domain.sources,
        repository: domain.service.repository,
      },
      ...(runtime.assertScopeAllowedInTransaction
        ? {
            assertScopeAllowedInTransaction:
              runtime.assertScopeAllowedInTransaction,
          }
        : {}),
    });
    const studio = createContentStudio({
      pool: runtime.pool,
      owners: composition.owners,
      dependencies: composition.dependencies,
    });
    composition.bindContent(studio.content);
    runtime.configureSignedSubjects([
      ...conversations.signedSubjectPolicies,
      studio.signedSubjects,
    ]);
    return [
      conversations.registration,
      ...studio.features,
      agentFeature({ domain, pool: runtime.pool, development: true }),
    ];
  },
});
if (!domain) throw new Error("Creator AI composition is unavailable.");
const creatorId = process.env.W2_CREATOR_ID;
const accountId = process.env.W2_DEVELOPMENT_ACCOUNT_ID;
// A missing provider is a startup prerequisite, not a job to retry every second.
// The real worker still owns leases, authority, failures and provider receipts
// once the host has both priced configuration and its fictional creator tuple.
const ingestionConfigured = Boolean(
  model?.pricingConfigured && creatorId && accountId,
);
const ingesting = startDevelopmentIngestion(
  domain.ingestion,
  ingestionConfigured
    ? [{ creatorId: creatorId!, accountId: accountId!, development: true }]
    : [],
);
if (!ingestionConfigured)
  process.stdout.write(
    "W2 ingestion is disabled: priced provider or fictional creator configuration is unavailable.\n",
  );
backend.server.listen(config.port, "127.0.0.1", () =>
  process.stdout.write(
    "W2 development API listening on loopback; external fan publication is disabled.\n",
  ),
);
let stopping: Promise<void> | undefined;
const stop = () => {
  stopping ??= (async () => {
    const results = await Promise.allSettled([
      ingesting.close(),
      Promise.resolve().then(() => conversations?.close()),
    ]);
    let failed = results.some((result) => result.status === "rejected");
    try {
      await backend.close();
    } catch {
      failed = true;
    }
    if (failed)
      process.stderr.write(
        "Development host shutdown did not complete cleanly.\n",
      );
    process.exit(failed ? 1 : 0);
  })();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
