import type { Request } from "express";
import type { Pool, PoolClient } from "pg";
import type { Actor } from "../modules/identity/adapter.js";
import {
  TrustService,
  type TrustDependencies,
} from "../modules/trust/service.js";
import { TrustStore } from "../modules/trust/store.js";
import { privacyOwnershipScope } from "../modules/trust/privacy-ownership.js";
import { TrustWorker } from "../modules/trust/worker.js";
import {
  createTrustRouter,
  type TrustRouterOptions,
} from "../modules/trust/router.js";
import {
  PrivacyDomains,
  type PrivacyHook,
  type EffectHook,
} from "../modules/trust/contracts.js";
import { Readiness, type Probe } from "./readiness.js";
import { DomainError } from "../core/errors.js";
import { TrustTelemetry } from "./telemetry.js";
import {
  trustScopeRestriction,
  trustScopeRestrictionInTransaction,
  trustAudienceRestrictionInTransaction,
  trustCreatorRestrictionInTransaction,
  trustContentRestrictionInTransaction,
  trustPublicPacketDenial,
  trustPublicCreatorDenial,
  trustCreatorFanRestrictionInTransaction,
  type TrustPublicPacketTuple,
} from "../modules/trust/scope-restriction.js";
import type { ScopeRestriction } from "../modules/access/scope.js";
import type { PrivacyArtifactStore } from "../modules/trust/privacy-export.js";

/** W1 mounts this runtime in the canonical backend. Local mode is explicit. */
export async function createTrustRuntime(options: {
  environment: "local-development" | "review" | "staging" | "production";
  identityMode?: "development" | "pantopus";
  closePoolsOnStop?: boolean;
  release: string;
  origin: string;
  apiPool: Pool;
  workerPool: Pool;
  actor: (request: Request) => Promise<Actor>;
  dependencies: TrustDependencies;
  privacyHooks: PrivacyHook[];
  privacyArtifacts?: PrivacyArtifactStore;
  effectHooks: EffectHook[];
  probes: Probe[];
  restoreReady: () => Promise<boolean>;
  restoreReadyInTransaction?: (client: PoolClient) => Promise<boolean>;
  crisisResources: TrustRouterOptions["crisisResources"];
}) {
  const origin = new URL(options.origin);
  const localDevelopment = options.environment === "local-development";
  if (
    localDevelopment &&
    (process.env.NODE_ENV !== "development" ||
      process.env.TRUST_LOCAL_DEVELOPMENT !== "true" ||
      options.identityMode !== "development" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
  )
    throw new Error(
      "Local trust requires explicit development identity, NODE_ENV=development, TRUST_LOCAL_DEVELOPMENT=true and loopback.",
    );
  if (!localDevelopment && options.identityMode === "development")
    throw new Error("Deployed trust requires Pantopus identity.");
  if (
    (localDevelopment
      ? !["http:", "https:"].includes(origin.protocol)
      : origin.protocol !== "https:") ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  )
    throw new Error("Deployed trust requires one exact HTTPS origin.");
  if (!/^[a-f0-9]{40,64}$/.test(options.release))
    throw new Error("An immutable release revision is required.");
  if (
    new Set(options.privacyHooks.map((h) => h.domain)).size !==
      options.privacyHooks.length ||
    new Set(options.effectHooks.map((h) => h.type)).size !==
      options.effectHooks.length
  )
    throw new Error("Duplicate trust hook registrations.");
  if (
    options.privacyHooks.some((hook) => !PrivacyDomains.includes(hook.domain))
  )
    throw new Error("Unknown privacy domain registration.");
  const reservedProbes = [
    "trust_database",
    "restoration_denial",
    "privacy_domains",
    "privacy_authority",
  ];
  if (
    new Set(options.probes.map((probe) => probe.name)).size !==
      options.probes.length ||
    options.probes.some((probe) => reservedProbes.includes(probe.name))
  )
    throw new Error("Duplicate or reserved readiness probe.");
  const providerNames = [
    "identity",
    "model",
    "payments",
    "calls",
    "voice",
    "push",
  ];
  const providerProbes: Probe[] = providerNames.map((name) => {
    const supplied = options.probes.find((probe) => probe.name === name);
    return supplied
      ? { ...supplied, required: true }
      : {
          name,
          required: true,
          run: async () => ({
            state: "unavailable",
            code: "probe_unconfigured",
          }),
        };
  });
  const privacyProbeNames = PrivacyDomains.map((domain) => `privacy_${domain}`);
  const exportProbe = options.probes.find(
    (probe) => probe.name === "privacy_exports",
  );
  const exportReadiness: Probe =
    options.privacyArtifacts && options.dependencies.verifyExport && exportProbe
      ? { ...exportProbe, required: true }
      : {
          name: "privacy_exports",
          required: true,
          run: async () => ({
            state: "unavailable",
            code: "protected_storage_fresh_auth_and_owner_probe_required",
          }),
        };
  const privacyProbes: Probe[] = PrivacyDomains.map((domain) => {
    const name = `privacy_${domain}`;
    const supplied = options.probes.find((probe) => probe.name === name);
    if (options.privacyHooks.some((hook) => hook.domain === domain) && supplied)
      return { ...supplied, required: true };
    return {
      name,
      required: true,
      run: async () => ({
        state: "unavailable",
        code: supplied
          ? "domain_hook_unavailable"
          : "owner_readiness_unconfigured",
      }),
    };
  });
  const store = new TrustStore(options.apiPool);
  await store.assertRole();
  await new TrustStore(options.workerPool).assertRole(true);
  const service = new TrustService(
    store,
    options.dependencies,
    options.privacyArtifacts,
  );
  const telemetry = new TrustTelemetry(options.environment, options.release);
  const restored = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return (
        (await Promise.race([
          options.restoreReady(),
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), 2000);
            timer.unref();
          }),
        ])) === true
      );
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const poolError = () => telemetry.increment("database_connection_errors");
  options.apiPool.on("error", poolError);
  options.workerPool.on("error", poolError);
  const readiness = new Readiness(
    [
      {
        name: "trust_database",
        required: true,
        run: async () => {
          await store.assertRole();
          return { state: "available", code: "non_owner_rls_verified" };
        },
      },
      {
        name: "restoration_denial",
        required: true,
        run: async () => ({
          state: (await restored()) ? "available" : "unavailable",
          code: "tombstone_replay_gate",
        }),
      },
      {
        name: "privacy_domains",
        required: true,
        run: async () => ({
          state:
            options.privacyHooks.length === 8 ? "available" : "unavailable",
          code:
            options.privacyHooks.length === 8
              ? "all_hooks_registered"
              : "domain_hooks_missing",
        }),
      },
      {
        name: "privacy_authority",
        required: true,
        run: async () => ({
          state:
            options.dependencies.verifyPrivacy &&
            options.dependencies.authorizePrivacyScope &&
            options.dependencies.privacyOwnership
              ? "available"
              : "unavailable",
          code: "verified_scope_and_ownership_required",
        }),
      },
      ...providerProbes,
      ...privacyProbes,
      exportReadiness,
      ...options.probes.filter(
        (probe) =>
          !providerNames.includes(probe.name) &&
          probe.name !== "privacy_exports" &&
          !privacyProbeNames.includes(probe.name),
      ),
    ],
    options.environment,
    options.release,
  );
  // Each required domain probe checks actual role/authority/provider/policy
  // configuration without running an export or purge. Registration is separate.
  const worker = new TrustWorker(
    options.workerPool,
    options.privacyHooks,
    options.effectHooks,
    (name, value) =>
      ["worker_errors", "privacy_retry"].includes(name)
        ? telemetry.increment(name, value)
        : telemetry.observe(name, value),
    options.privacyArtifacts,
  );
  const router = createTrustRouter({
    service,
    origin: origin.origin,
    actor: async (request) => {
      if (!(await restored()))
        throw new DomainError(
          "restoration_pending",
          "Restored data remains unavailable until deletion controls have been reapplied.",
          503,
        );
      return options.actor(request);
    },
    readiness,
    telemetry,
    localDevelopment,
    localActorSelection: false,
    crisisResources: options.crisisResources,
  });
  // Pass these into W1's configured backend. Restoration denial must cover
  // conversation/realtime entrypoints as well as the trust router.
  const assertActorAllowed = async (actor: Actor) => {
    if (!(await restored()))
      throw new DomainError(
        "restoration_pending",
        "Restored data remains unavailable until deletion controls have been reapplied.",
        503,
      );
    await service.assertAllowed(actor);
  };
  const restrictScope = trustScopeRestriction(service, options.workerPool);
  const restrictInTransaction = trustScopeRestrictionInTransaction();
  const restrictAudience = trustAudienceRestrictionInTransaction();
  const restrictCreator = trustCreatorRestrictionInTransaction();
  const restrictContent = trustContentRestrictionInTransaction();
  const restrictPacket = trustPublicPacketDenial();
  const restrictPublicCreator = trustPublicCreatorDenial();
  const restrictCreatorFan = trustCreatorFanRestrictionInTransaction();
  const assertRestored = async () => {
    if (!(await restored()))
      throw new DomainError(
        "restoration_pending",
        "This restored environment is unavailable while recovery is verified.",
        503,
      );
  };
  const assertRestoredInTransaction = async (client: PoolClient) => {
    // The general gate may include external replay/reconciliation custody. A
    // held-client port is additionally mandatory; no pool check or owner actor
    // substitutes for currentness on this transaction.
    await assertRestored();
    let ready = false;
    try {
      ready = (await options.restoreReadyInTransaction?.(client)) === true;
    } catch {
      ready = false;
    }
    if (!ready)
      throw new DomainError(
        "restoration_pending",
        "Current recovery authority is unavailable for this transaction.",
        503,
      );
  };
  const assertScopeAllowed: ScopeRestriction = async (
    actor,
    creatorId,
    threadId,
    participants,
  ) => {
    if (!(await restored()))
      throw new DomainError(
        "restoration_pending",
        "Restored data remains unavailable until deletion controls have been reapplied.",
        503,
      );
    await restrictScope(actor, creatorId, threadId, participants);
  };
  return {
    router,
    service,
    readiness,
    telemetry,
    worker,
    trafficReady: restored,
    assertActorAllowed,
    assertScopeAllowed,
    assertRestoredInTransaction,
    /** W1 calls this before private nonce creation and at its bookends. This
     * is restoration only; SQL0093 runs from W1's actual private claim/read. */
    assertGenerationWorkerRestoredInTransaction: async (client: PoolClient) => {
      await client.query("SAVEPOINT w8_generation_restoration");
      try {
        const bound = (
          await client.query<{
            login: string;
            role: string;
            account: string | null;
            session: string | null;
          }>(`SELECT session_user AS login,current_user AS role,
          nullif(current_setting('app.account_id',true),'') AS account,
          nullif(current_setting('app.identity_session_id',true),'') AS session`)
        ).rows[0];
        if (
          !bound ||
          bound.login !== "creator_generation_worker" ||
          bound.role !== bound.login ||
          bound.account !== null ||
          bound.session !== null
        )
          throw new DomainError(
            "generation_restoration_unavailable",
            "Current generation recovery authority is unavailable.",
            503,
          );
        await assertRestoredInTransaction(client);
      } catch (error) {
        await client.query("ROLLBACK TO SAVEPOINT w8_generation_restoration");
        throw error;
      } finally {
        await client.query("RELEASE SAVEPOINT w8_generation_restoration");
      }
    },
    assertContentAllowedInTransaction: async (
      client: PoolClient,
      actor: Actor,
      creatorId: string,
    ) => {
      await assertRestoredInTransaction(client);
      await restrictContent(client, actor, creatorId);
    },
    holdPublicPacketNegativeAuthority: async (
      client: PoolClient,
      actor: Actor,
      tuple: TrustPublicPacketTuple,
    ) => {
      await assertRestoredInTransaction(client);
      return restrictPacket(client, actor, tuple);
    },
    holdPublicCreatorNegativeAuthority: async (
      client: PoolClient,
      creatorId: string,
    ) => {
      await assertRestoredInTransaction(client);
      return restrictPublicCreator(client, creatorId);
    },
    holdCreatorFanNegativeAuthority: async (
      client: PoolClient,
      actor: Actor,
      tuple: { creatorId: string; fanId: string },
    ) => {
      await assertRestoredInTransaction(client);
      await restrictCreatorFan(client, actor, tuple);
    },
    assertScopeAllowedInTransaction: async (
      ...scope: Parameters<typeof restrictInTransaction>
    ) => {
      await assertRestoredInTransaction(scope[4]);
      await restrictInTransaction(...scope);
    },
    assertAudienceAllowed: async (
      ...scope: Parameters<typeof restrictAudience>
    ) => {
      await assertRestoredInTransaction(scope[3]);
      await restrictAudience(...scope);
    },
    assertCreatorAllowedInTransaction: async (
      ...scope: Parameters<typeof restrictCreator>
    ) => {
      await assertRestoredInTransaction(scope[2]);
      await restrictCreator(...scope);
    },
    privacyOwnershipScope: privacyOwnershipScope(options.workerPool),
    start: async () => {
      if (await restored()) await worker.start();
    },
    stop: async () => {
      await worker.stop();
      options.apiPool.off("error", poolError);
      options.workerPool.off("error", poolError);
      telemetry.close();
      if (options.closePoolsOnStop)
        await Promise.all([options.apiPool.end(), options.workerPool.end()]);
    },
  };
}
