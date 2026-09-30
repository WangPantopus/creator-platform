import type { Request } from "express";
import type { Pool } from "pg";
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
import { trustScopeRestriction } from "../modules/trust/scope-restriction.js";
import type { ScopeRestriction } from "../modules/access/scope.js";

/** W1 mounts this runtime in the canonical backend; no development identity fallback. */
export async function createTrustRuntime(options: {
  environment: "review" | "staging" | "production";
  release: string;
  origin: string;
  apiPool: Pool;
  workerPool: Pool;
  actor: (request: Request) => Promise<Actor>;
  dependencies: TrustDependencies;
  privacyHooks: PrivacyHook[];
  effectHooks: EffectHook[];
  probes: Probe[];
  restoreReady: () => Promise<boolean>;
  crisisResources: TrustRouterOptions["crisisResources"];
}) {
  const origin = new URL(options.origin);
  if (
    origin.protocol !== "https:" ||
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
  const store = new TrustStore(options.apiPool);
  await store.assertRole();
  await new TrustStore(options.workerPool).assertRole(true);
  const service = new TrustService(store, options.dependencies);
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
      ...options.probes.filter((probe) => !providerNames.includes(probe.name)),
    ],
    options.environment,
    options.release,
  );
  // Registered hooks establish availability only; probes must check the actual
  // owner/provider readiness. A registration alone never proves completion.
  const worker = new TrustWorker(
    options.workerPool,
    options.privacyHooks,
    options.effectHooks,
    (name, value) =>
      ["worker_errors", "privacy_retry"].includes(name)
        ? telemetry.increment(name, value)
        : telemetry.observe(name, value),
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
    localDevelopment: false,
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
    assertActorAllowed,
    assertScopeAllowed,
    privacyOwnershipScope: privacyOwnershipScope(options.workerPool),
    start: () => worker.start(),
    stop: async () => {
      await worker.stop();
      options.apiPool.off("error", poolError);
      options.workerPool.off("error", poolError);
      telemetry.close();
    },
  };
}
