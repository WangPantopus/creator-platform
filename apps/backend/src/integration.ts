import { createServer } from "node:http";
import pg from "pg";
import { createApp, type FeatureRegistration } from "./app.js";
import type { BackendConfig } from "./config.js";
import { Database } from "./db/database.js";
import {
  AccessService,
  type ScopeRestriction,
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
import { DomainError } from "./core/errors.js";

export type BackendRuntime = {
  pool: pg.Pool;
  database: Database;
  access: AccessService;
  conversation: ConversationService;
  identity: import("./modules/identity/router.js").IdentityRuntime | undefined;
};
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
  registerFeatures?: (
    runtime: BackendRuntime,
  ) => Promise<readonly FeatureRegistration[]>;
  assertActorAllowed?: (
    actor: import("./modules/identity/adapter.js").Actor,
  ) => Promise<void>;
  assertScopeAllowed?: ScopeRestriction;
  trust?:
    | TrustConfiguration
    | ((runtime: BackendRuntime) => Promise<TrustConfiguration>);
}) {
  if (!input.config.featureEnabled || !input.config.databaseUrl)
    throw new Error(
      "Enable the feature and provide a non-owner runtime DATABASE_URL.",
    );
  if (input.trust && input.identity.mode === "development")
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
  const pool = new pg.Pool({
    connectionString: input.config.databaseUrl,
    max: 20,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  let trust: Awaited<ReturnType<typeof createTrustRuntime>> | undefined;
  const assertScopeAllowed: ScopeRestriction = async (...scope) => {
    await input.assertScopeAllowed?.(...scope);
    await trust?.assertScopeAllowed(...scope);
  };
  const assertActorAllowed = async (
    actor: import("./modules/identity/adapter.js").Actor,
  ) => {
    await input.assertActorAllowed?.(actor);
    await trust?.assertActorAllowed(actor);
  };
  const database = new Database(pool, undefined, assertScopeAllowed);
  try {
    await database.assertRuntimeRole();
  } catch (error) {
    await pool.end();
    throw error;
  }
  const access = new AccessService(pool, undefined, assertScopeAllowed);
  const conversation = new ConversationService(
    database,
    access,
    input.guardrails,
  );
  const signing = new SignedActService(
    pool,
    input.config.rpId,
    input.config.passkeyOrigins ?? [input.config.allowedOrigin],
    undefined,
    input.signedSubjectPolicies,
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
        profiles: new IdentityProfiles(pool),
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
  };
  try {
    if (input.trust) {
      const configuration =
        typeof input.trust === "function"
          ? await input.trust(backendRuntime)
          : input.trust;
      trust = await createTrustRuntime({
        ...configuration,
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
          return resolveActor(sessions ?? input.identity, token);
        },
      });
    }
    features = (await input.registerFeatures?.(backendRuntime)) ?? [];
  } catch (error) {
    await trust?.stop();
    await pool.end();
    throw error;
  }
  const server = createServer(
    createApp(input.config, {
      identity: sessions ?? input.identity,
      ...(platformIdentity ? { platformIdentity } : {}),
      access,
      conversation,
      signing,
      generationAvailable: false,
      features,
      ...(trust ? { trustRouter: trust.router } : {}),
      assertActorAllowed,
    }),
  );
  const sockets = attachRealtime(
    server,
    sessions ?? input.identity,
    access,
    conversation,
    input.config.allowedOrigin,
    {
      assertActorAllowed,
      ...(sessions
        ? { resolveSession: (token: string) => sessions.resolve(token) }
        : {}),
    },
  );
  await trust?.start();
  return {
    server,
    pool,
    identity: platformIdentity,
    trust,
    close: async () => {
      for (const connection of sockets.clients)
        connection.close(1001, "Server shutdown");
      await trust?.stop();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.end();
    },
  };
}
