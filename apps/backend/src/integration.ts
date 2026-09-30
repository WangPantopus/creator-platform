import { createServer } from "node:http";
import type { Router } from "express";
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
  registerFeatures?: (runtime: {
    pool: pg.Pool;
    database: Database;
    access: AccessService;
    conversation: ConversationService;
    identity:
      | import("./modules/identity/router.js").IdentityRuntime
      | undefined;
    configureSignedSubjects: (policies: readonly SignedSubjectPolicy[]) => void;
  }) => Promise<readonly FeatureRegistration[]>;
  assertActorAllowed?: (
    actor: import("./modules/identity/adapter.js").Actor,
  ) => Promise<void>;
  assertScopeAllowed?: ScopeRestriction;
}) {
  if (!input.config.featureEnabled || !input.config.databaseUrl)
    throw new Error(
      "Enable the feature and provide a non-owner runtime DATABASE_URL.",
    );
  const pool = new pg.Pool({
    connectionString: input.config.databaseUrl,
    max: 20,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
  const database = new Database(pool, undefined, input.assertScopeAllowed);
  try {
    await database.assertRuntimeRole();
  } catch (error) {
    await pool.end();
    throw error;
  }
  const access = new AccessService(pool, undefined, input.assertScopeAllowed);
  const conversation = new ConversationService(
    database,
    access,
    input.guardrails,
  );
  const subjects = [...(input.signedSubjectPolicies ?? [])];
  let featuresConfigured = false;
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
  try {
    features =
      (await input.registerFeatures?.({
        pool,
        database,
        access,
        conversation,
        identity: platformIdentity,
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
      })) ?? [];
    featuresConfigured = true;
  } catch (error) {
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
      ...(input.stripeNotifications
        ? { stripeNotifications: input.stripeNotifications }
        : {}),
      ...(input.storeNotifications
        ? { storeNotifications: input.storeNotifications }
        : {}),
      ...(input.assertActorAllowed
        ? { assertActorAllowed: input.assertActorAllowed }
        : {}),
    }),
  );
  const sockets = attachRealtime(
    server,
    sessions ?? input.identity,
    access,
    conversation,
    input.config.allowedOrigin,
    {
      ...(input.assertActorAllowed
        ? { assertActorAllowed: input.assertActorAllowed }
        : {}),
      ...(sessions
        ? { resolveSession: (token: string) => sessions.resolve(token) }
        : {}),
    },
  );
  return {
    server,
    pool,
    identity: platformIdentity,
    close: async () => {
      for (const connection of sockets.clients)
        connection.close(1001, "Server shutdown");
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await pool.end();
    },
  };
}
