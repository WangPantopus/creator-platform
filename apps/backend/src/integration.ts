import { createServer } from "node:http";
import express, { type Router } from "express";
import pg from "pg";
import { createApp, type FeatureRegistration } from "./app.js";
import type { BackendConfig } from "./config.js";
import { Database } from "./db/database.js";
import {
  AccessService,
  type ScopeRestriction,
  type ScopeRestrictionInTransaction,
} from "./modules/access/scope.js";
import { ConversationService } from "./modules/conversation/service.js";
import type { GuardrailProvider } from "./modules/agent/providers.js";
import type { PantopusIdentityAdapter } from "./modules/identity/adapter.js";
import { SignedActService } from "./modules/identity/signed-acts.js";
import { SessionService } from "./modules/identity/sessions.js";
import { IdentityProfiles } from "./modules/identity/profiles.js";
import { PasskeyService } from "./modules/identity/passkeys.js";
import { attachRealtime } from "./realtime/gateway.js";
import type { SignedSubjectPolicy } from "./modules/identity/subjects.js";
import { createTrustRuntime } from "./operations/runtime.js";
import { resolveActor } from "./modules/identity/adapter.js";
import { requestAuthority } from "./modules/identity/request-authority.js";
import { DomainError } from "./core/errors.js";
import { trustIdentityAuthority } from "./modules/trust/identity-authority.js";
import {
  AudienceIdentityAuthority,
  type AudienceRestriction,
} from "./modules/identity/audience-scope.js";

export type BackendRuntime = {
  prepareUsageAccounting?: () => Promise<
    | import("./modules/trust/usage-accounting-host.js").HostUsageAccounting
    | undefined
  >;
  pool: pg.Pool;
  database: Database;
  access: AccessService;
  conversation: ConversationService;
  identity: import("./modules/identity/router.js").IdentityRuntime | undefined;
  audienceIdentity?: AudienceIdentityAuthority;
  assertScopeAllowedInTransaction?: ScopeRestrictionInTransaction;
  assertCreatorAllowedInTransaction?: (
    actor: import("./modules/identity/adapter.js").Actor,
    creatorId: string,
    client: pg.PoolClient,
  ) => Promise<void>;
  assertRestoredInTransaction?: (client: pg.PoolClient) => Promise<void>;
  assertGenerationWorkerRestoredInTransaction?: (
    client: pg.PoolClient,
  ) => Promise<void>;
  assertContentAllowedInTransaction?: (
    client: pg.PoolClient,
    actor: import("./modules/identity/adapter.js").Actor,
    creatorId: string,
  ) => Promise<void>;
  holdPublicPacketNegativeAuthority?: (
    client: pg.PoolClient,
    actor: import("./modules/identity/adapter.js").Actor,
    tuple: import("./modules/trust/scope-restriction.js").TrustPublicPacketTuple,
  ) => Promise<boolean>;
  holdPublicCreatorNegativeAuthority?: (
    client: pg.PoolClient,
    creatorId: string,
  ) => Promise<boolean>;
  holdCreatorFanNegativeAuthority?: (
    client: pg.PoolClient,
    actor: import("./modules/identity/adapter.js").Actor,
    tuple: { creatorId: string; fanId: string },
  ) => Promise<void>;
  assertActorAllowed: (
    actor: import("./modules/identity/adapter.js").Actor,
  ) => Promise<void>;
  assertScopeAllowed: ScopeRestriction;
  assertCreatorAllowed: (
    actor: import("./modules/identity/adapter.js").Actor,
    creatorId: string,
  ) => Promise<void>;
  configureSignedSubjects: (policies: readonly SignedSubjectPolicy[]) => void;
};
const issuedRuntimes = new WeakMap<
  BackendRuntime,
  Readonly<{
    pool: BackendRuntime["pool"];
    database: BackendRuntime["database"];
    access: BackendRuntime["access"];
    conversation: BackendRuntime["conversation"];
    identity: BackendRuntime["identity"];
    restored: BackendRuntime["assertRestoredInTransaction"];
    denied: BackendRuntime["assertScopeAllowedInTransaction"];
    creatorDenied: BackendRuntime["assertCreatorAllowedInTransaction"];
    contentDenied: BackendRuntime["assertContentAllowedInTransaction"];
    audience: BackendRuntime["audienceIdentity"];
  }>
>();
/** Genuine complete host graph only; clones or replaced authority callbacks
 * cannot prepare a family-discovery purpose. Recheck at every bookend. */
export function isConfiguredBackendRuntime(runtime: BackendRuntime): boolean {
  const issued = issuedRuntimes.get(runtime);
  return (
    issued !== undefined &&
    issued.pool === runtime.pool &&
    issued.database === runtime.database &&
    issued.access === runtime.access &&
    issued.conversation === runtime.conversation &&
    issued.identity === runtime.identity &&
    issued.restored === runtime.assertRestoredInTransaction &&
    issued.denied === runtime.assertScopeAllowedInTransaction &&
    issued.creatorDenied === runtime.assertCreatorAllowedInTransaction &&
    issued.contentDenied === runtime.assertContentAllowedInTransaction &&
    issued.audience === runtime.audienceIdentity
  );
}

type TrustConfiguration = Omit<
  Parameters<typeof createTrustRuntime>[0],
  "actor" | "origin"
>;

/** Pantopus host imports this seam; adapter code is never inferred from a session token. */
export async function createConfiguredBackend(input: {
  config: BackendConfig;
  identity: PantopusIdentityAdapter;
  guardrails: GuardrailProvider;
  signedSubjectPolicies?: readonly SignedSubjectPolicy[];
  /** Construct with the separately configured INSERT-only notification role. */
  stripeNotifications?: Router;
  /** Each store router verifies its signed/OIDC signal before durable ingress. */
  storeNotifications?: Partial<Record<"apple" | "google", Router>>;
  registerFeatures?: (
    runtime: BackendRuntime,
    /** Register each acquired worker's original drain immediately. The host
     * awaits these even if later preparation fails, before closing its pools. */
    onClose: (close: () => void | Promise<void>) => void,
  ) => Promise<readonly FeatureRegistration[]>;
  assertActorAllowed?: (
    actor: import("./modules/identity/adapter.js").Actor,
  ) => Promise<void>;
  assertScopeAllowed?: ScopeRestriction;
  /** Genuine current denial on the caller-held non-owner core transaction. */
  assertScopeAllowedInTransaction?: ScopeRestrictionInTransaction;
  /** Held-client, purpose-specific content denial; never substitute a thread. */
  assertAudienceAllowed?: AudienceRestriction;
  assertCreatorAllowed?: (
    actor: import("./modules/identity/adapter.js").Actor,
    creatorId: string,
  ) => Promise<void>;
  trust?:
    | TrustConfiguration
    | ((runtime: BackendRuntime) => Promise<TrustConfiguration>);
}) {
  if (!input.config.featureEnabled || !input.config.databaseUrl)
    throw new Error(
      "Enable the feature and provide a non-owner runtime DATABASE_URL.",
    );
  if (
    input.trust &&
    input.identity.mode === "development" &&
    (process.env.NODE_ENV !== "development" ||
      process.env.TRUST_LOCAL_DEVELOPMENT !== "true" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(input.config.allowedOrigin).hostname,
      ))
  )
    throw new Error(
      "Deployed trust requires the configured Pantopus identity adapter.",
    );
  if (
    input.identity.mode !== "development" &&
    !input.trust &&
    !(input.assertActorAllowed && input.assertScopeAllowed)
  )
    throw new Error(
      "Configured identity requires both trust denial callbacks or a composed trust runtime.",
    );
  if (
    input.identity.mode !== "development" &&
    (!input.config.identitySessionKey ||
      (!input.trust &&
        typeof input.assertScopeAllowedInTransaction !== "function"))
  )
    throw new Error(
      "Configured identity requires canonical session custody and current caller-held trust denials.",
    );
  const pool = new pg.Pool({
    connectionString: input.config.databaseUrl,
    max: 20,
    connectionTimeoutMillis: 5000,
    // Original privacy owners retain this same pool and require bounded reads
    // through their held task/family callbacks, including catalogue checks.
    query_timeout: 5000,
    idleTimeoutMillis: 30000,
  });
  // pg removes failed idle clients before emitting; active queries still reject.
  // Errors and clients can contain connection/query secrets, so omit both.
  pool.on("error", () => {
    console.error("An idle database connection failed and was discarded.");
  });
  let trust: Awaited<ReturnType<typeof createTrustRuntime>> | undefined;
  const assertScopeAllowedInTransaction:
    | ScopeRestrictionInTransaction
    | undefined =
    input.trust || input.assertScopeAllowedInTransaction
      ? async (...scope) => {
          if (input.trust && !trust)
            throw new DomainError(
              "trust_unconfigured",
              "Current transaction denial authority is unavailable.",
              503,
            );
          await input.assertScopeAllowedInTransaction?.(...scope);
          await trust?.assertScopeAllowedInTransaction(...scope);
        }
      : undefined;
  const assertAudienceAllowed: AudienceRestriction | undefined =
    input.trust || input.assertAudienceAllowed
      ? async (...scope) => {
          if (input.trust && !trust)
            throw new DomainError(
              "trust_unconfigured",
              "Current audience denial authority is unavailable.",
              503,
            );
          await input.assertAudienceAllowed?.(...scope);
          await trust?.assertAudienceAllowed(...scope);
        }
      : undefined;
  const assertScopeAllowed: ScopeRestriction = async (...scope) => {
    if (
      !input.assertScopeAllowed &&
      !trust &&
      input.identity.mode !== "development"
    )
      throw new DomainError(
        "trust_unconfigured",
        "Current thread denial authority is unavailable.",
        503,
      );
    await input.assertScopeAllowed?.(...scope);
    await trust?.assertScopeAllowed(...scope);
  };
  const assertActorAllowed = async (
    actor: import("./modules/identity/adapter.js").Actor,
  ) => {
    if (
      !input.assertActorAllowed &&
      !trust &&
      input.identity.mode !== "development"
    )
      throw new DomainError(
        "trust_unconfigured",
        "Current account denial authority is unavailable.",
        503,
      );
    await input.assertActorAllowed?.(actor);
    await trust?.assertActorAllowed(actor);
  };
  const database = new Database(
    pool,
    undefined,
    assertScopeAllowed,
    assertScopeAllowedInTransaction,
  );
  try {
    await database.assertRuntimeRole();
  } catch (error) {
    await pool.end();
    throw error;
  }
  const access = new AccessService(
    pool,
    undefined,
    assertScopeAllowed,
    assertScopeAllowedInTransaction,
  );
  const conversation = new ConversationService(
    database,
    access,
    input.guardrails,
  );
  const subjects = [...(input.signedSubjectPolicies ?? [])];
  let featuresConfigured = false;
  const featureCleanup: (() => void | Promise<void>)[] = [];
  let acceptingCleanup = true;
  const onFeatureClose = (close: () => void | Promise<void>) => {
    if (!acceptingCleanup || typeof close !== "function")
      throw new Error("Register feature cleanup during host composition.");
    featureCleanup.push(close);
  };
  const signing = new SignedActService(
    pool,
    input.config.rpId,
    input.config.passkeyOrigins ?? [input.config.allowedOrigin],
    undefined,
    subjects,
  );
  const sessions = input.config.identitySessionKey
    ? new SessionService(
        pool,
        input.identity,
        Buffer.from(input.config.identitySessionKey, "base64"),
      )
    : undefined;
  const platformIdentity = sessions
    ? {
        sessions,
        profiles: new IdentityProfiles(pool, {
          ...(assertAudienceAllowed
            ? { assertInvitationAllowed: assertAudienceAllowed }
            : {}),
          assertCreatorAllowed: async (actor, creatorId, client) => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current creator denial authority is unavailable.",
                503,
              );
            await trust.assertCreatorAllowedInTransaction(
              actor,
              creatorId,
              client,
            );
          },
        }),
        passkeys: new PasskeyService(
          pool,
          input.config.rpId,
          input.config.passkeyOrigins ?? [input.config.allowedOrigin],
          "Creator Platform",
        ),
        signing,
      }
    : undefined;
  let features: readonly FeatureRegistration[];
  const backendRuntime: BackendRuntime = {
    pool,
    database,
    access,
    conversation,
    identity: platformIdentity,
    ...(assertAudienceAllowed && platformIdentity
      ? {
          audienceIdentity: new AudienceIdentityAuthority(pool, {
            mode: platformIdentity.sessions.mode,
            assertAllowed: assertAudienceAllowed,
          }),
        }
      : {}),
    assertActorAllowed,
    assertScopeAllowed,
    ...(assertScopeAllowedInTransaction
      ? {
          assertScopeAllowedInTransaction: assertScopeAllowedInTransaction,
        }
      : {}),
    ...(input.trust
      ? {
          prepareUsageAccounting: async () => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current accounting privacy registration is unavailable.",
                503,
              );
            return trust.prepareUsageAccounting(pool);
          },
          assertRestoredInTransaction: async (client: pg.PoolClient) => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current recovery authority is unavailable.",
                503,
              );
            await trust.assertRestoredInTransaction(client);
          },
          assertContentAllowedInTransaction: async (
            client: pg.PoolClient,
            actor: import("./modules/identity/adapter.js").Actor,
            creatorId: string,
          ) => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current content denial authority is unavailable.",
                503,
              );
            await trust.assertContentAllowedInTransaction(
              client,
              actor,
              creatorId,
            );
          },
          assertGenerationWorkerRestoredInTransaction: async (
            client: pg.PoolClient,
          ) => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current generation recovery authority is unavailable.",
                503,
              );
            await trust.assertGenerationWorkerRestoredInTransaction(client);
          },
          holdPublicPacketNegativeAuthority: async (
            client: pg.PoolClient,
            actor: import("./modules/identity/adapter.js").Actor,
            tuple: import("./modules/trust/scope-restriction.js").TrustPublicPacketTuple,
          ) => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current public request authority is unavailable.",
                503,
              );
            return trust.holdPublicPacketNegativeAuthority(
              client,
              actor,
              tuple,
            );
          },
          holdPublicCreatorNegativeAuthority: async (
            client: pg.PoolClient,
            creatorId: string,
          ) => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current public creator authority is unavailable.",
                503,
              );
            return trust.holdPublicCreatorNegativeAuthority(client, creatorId);
          },
          holdCreatorFanNegativeAuthority: async (
            client: pg.PoolClient,
            actor: import("./modules/identity/adapter.js").Actor,
            tuple: { creatorId: string; fanId: string },
          ) => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current creator/fan authority is unavailable.",
                503,
              );
            await trust.holdCreatorFanNegativeAuthority(client, actor, tuple);
          },
          assertCreatorAllowedInTransaction: async (
            actor: import("./modules/identity/adapter.js").Actor,
            creatorId: string,
            client: pg.PoolClient,
          ) => {
            if (!trust)
              throw new DomainError(
                "trust_unconfigured",
                "Current creator denial authority is unavailable.",
                503,
              );
            await trust.assertCreatorAllowedInTransaction(
              actor,
              creatorId,
              client,
            );
          },
        }
      : {}),
    assertCreatorAllowed: async (actor, creatorId) => {
      await assertActorAllowed(actor);
      if (input.assertCreatorAllowed)
        await input.assertCreatorAllowed(actor, creatorId);
      else if (!trust && input.identity.mode !== "development")
        throw new DomainError(
          "creator_denial_unconfigured",
          "Creator actions require their current trust authority.",
          503,
        );
      await trust?.service.assertAllowed(actor, creatorId);
    },
    configureSignedSubjects: (policies) => {
      if (featuresConfigured)
        throw new Error(
          "Signed subjects must be installed during host composition.",
        );
      for (const policy of policies) {
        if (subjects.some((current) => current.name === policy.name))
          throw new Error("Duplicate signed-subject registration.");
        subjects.push(policy);
      }
    },
  };
  let server: ReturnType<typeof createServer> | undefined;
  let sockets: ReturnType<typeof attachRealtime> | undefined;
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= (async () => {
      acceptingCleanup = false;
      const stopped = await Promise.allSettled([
        ...featureCleanup.map((action) => Promise.resolve().then(action)),
        new Promise<void>((resolve, reject) => {
          if (!server) return resolve();
          server.close((error) => {
            // A prepared standalone host may never open an HTTP listener.
            // Its database and Trust resources still need their original drain.
            if (
              error &&
              (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
            )
              reject(error);
            else resolve();
          });
        }),
        new Promise<void>((resolve, reject) => {
          if (!sockets) return resolve();
          for (const connection of sockets.clients)
            connection.close(1001, "Server shutdown");
          sockets.close((error) => (error ? reject(error) : resolve()));
        }),
      ]);
      const failures = stopped.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      // Preserve original authority and live pools through feature settlement.
      // A failed drain must not skip the remaining owners or hide its cause.
      issuedRuntimes.delete(backendRuntime);
      for (const action of [() => trust?.stop(), () => pool.end()]) {
        try {
          await action();
        } catch (cause) {
          failures.push(cause);
        }
      }
      if (failures.length)
        throw new AggregateError(
          failures,
          "Configured backend shutdown failed.",
        );
    })();
    return closing;
  };
  try {
    if (input.trust) {
      const configuration =
        typeof input.trust === "function"
          ? await input.trust(backendRuntime)
          : input.trust;
      try {
        if (
          (input.identity.mode === "development") !==
            (configuration.environment === "local-development") ||
          (configuration.environment === "local-development" &&
            configuration.identityMode !== "development")
        )
          throw new Error(
            "Trust environment must agree with the canonical identity mode.",
          );
        const privacyAuthority = platformIdentity
          ? trustIdentityAuthority(pool, platformIdentity, access, database)
          : {};
        trust = await createTrustRuntime({
          ...configuration,
          dependencies: {
            ...privacyAuthority,
            ...configuration.dependencies,
            privacyVerificationMethod: configuration.dependencies.verifyPrivacy
              ? (configuration.dependencies.privacyVerificationMethod ??
                "external_receipt")
              : privacyAuthority.privacyVerificationMethod,
          },
          origin: input.config.allowedOrigin,
          actor: async (request) => {
            const token =
              request.headers.authorization?.match(/^Bearer ([^\s]+)$/u)?.[1];
            if (!token)
              throw new DomainError(
                "session_required",
                "Continue with Pantopus to use this app.",
                401,
              );
            // The canonical middleware has already resolved this request. Keep
            // its exact actor and session instead of issuing a second identity.
            const original = requestAuthority.getStore();
            if (platformIdentity) {
              if (
                !original?.actor ||
                original.actor.accountId !== original.accountId ||
                original.actor.adultEligible !== true
              )
                throw new DomainError(
                  "current_request_actor_required",
                  "Reopen this action with your current signed-in account.",
                  401,
                );
              return original.actor;
            }
            if (original?.actor) return original.actor;
            return resolveActor(sessions ?? input.identity, token);
          },
        });
      } catch (cause) {
        // The configuration has transferred its resources, but a refused
        // runtime has no stop() owner yet. Settle every acquired resource and
        // preserve the preparation failure before the outer host closes core.
        const cleanup = await Promise.allSettled([
          ...(configuration.closePoolsOnStop
            ? [...new Set([configuration.apiPool, configuration.workerPool])]
                .filter((owned) => owned !== pool)
                .map((owned) => Promise.resolve().then(() => owned.end()))
            : []),
          Promise.resolve().then(() =>
            configuration.privacyArtifacts?.close?.(),
          ),
        ]);
        const failures = cleanup.flatMap((result) =>
          result.status === "rejected" ? [result.reason] : [],
        );
        if (failures.length)
          throw new AggregateError(
            [cause, ...failures],
            "Trust preparation and cleanup failed.",
          );
        throw cause;
      }
    }
    issuedRuntimes.set(
      backendRuntime,
      Object.freeze({
        pool: backendRuntime.pool,
        database: backendRuntime.database,
        access: backendRuntime.access,
        conversation: backendRuntime.conversation,
        identity: backendRuntime.identity,
        restored: backendRuntime.assertRestoredInTransaction,
        denied: backendRuntime.assertScopeAllowedInTransaction,
        creatorDenied: backendRuntime.assertCreatorAllowedInTransaction,
        contentDenied: backendRuntime.assertContentAllowedInTransaction,
        audience: backendRuntime.audienceIdentity,
      }),
    );
    features =
      (await input.registerFeatures?.(backendRuntime, onFeatureClose)) ?? [];
    acceptingCleanup = false;
    featuresConfigured = true;
    Object.freeze(subjects);
    const application = createApp(input.config, {
      identity: sessions ?? input.identity,
      ...(platformIdentity ? { platformIdentity } : {}),
      access,
      conversation,
      signing,
      generationAvailable: false,
      features,
      ...(trust
        ? { trustRouter: trust.router, telemetry: trust.telemetry }
        : {}),
      assertActorAllowed,
      ...(input.stripeNotifications
        ? { stripeNotifications: input.stripeNotifications }
        : {}),
      ...(input.storeNotifications
        ? { storeNotifications: input.storeNotifications }
        : {}),
    });
    // Fence the complete host before provider ingress, session issuance or any
    // domain router. Public help/readiness remain usable while recovery is closed.
    const host = express();
    if (trust)
      host.use(async (req, res, next) => {
        if (await trust!.trafficReady()) return next();
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        if (["GET", "HEAD"].includes(req.method)) {
          if (req.path === "/v1/identity/capabilities")
            return res.json({
              signInAvailable: false,
              localAccountsAllowed: false,
              mode: input.identity.mode ?? "pantopus",
              developmentActors: [],
            });
          if (
            [
              "/health/live",
              "/health/ready",
              "/v1/trust/help",
              "/v1/trust/status",
            ].includes(req.path)
          )
            return next();
        }
        return res.status(503).json({
          error: {
            code: "restoration_pending",
            message:
              "This restored environment is unavailable while recovery is verified.",
          },
        });
      });
    host.use(application);
    server = createServer(host);
    sockets = attachRealtime(
      server,
      sessions ?? input.identity,
      access,
      conversation,
      input.config.allowedOrigin,
      {
        assertActorAllowed,
        ...(trust ? { telemetry: trust.telemetry } : {}),
        ...(sessions
          ? { resolveSession: (token: string) => sessions.resolve(token) }
          : {}),
      },
    );
    await trust?.start();
    return { server, pool, identity: platformIdentity, trust, close };
  } catch (cause) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError(
        [cause, cleanup],
        "Configured backend startup and cleanup failed.",
      );
    }
    throw cause;
  }
}
