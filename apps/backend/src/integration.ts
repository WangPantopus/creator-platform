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
import type { Actor } from "./modules/identity/adapter.js";
import { DomainError } from "./core/errors.js";

export type BackendRuntime = {
  pool: pg.Pool;
  database: Database;
  access: AccessService;
  conversation: ConversationService;
  signing: SignedActService;
  identity: import("./modules/identity/router.js").IdentityRuntime | undefined;
  assertActorAllowed: (actor: Actor) => Promise<void>;
  assertScopeAllowed: ScopeRestriction;
  assertCreatorAllowed: (actor: Actor, creatorId: string) => Promise<void>;
};

/** Pantopus host imports this seam; adapter code is never inferred from a session token. */
export async function createConfiguredBackend(input: {
  config: BackendConfig;
  identity: PantopusIdentityAdapter;
  guardrails: GuardrailProvider;
  signedSubjectPolicies?: readonly SignedSubjectPolicy[];
  registerFeatures?: (
    runtime: BackendRuntime,
  ) => Promise<readonly FeatureRegistration[]>;
  assertActorAllowed?: (actor: Actor) => Promise<void>;
  assertScopeAllowed?: ScopeRestriction;
  /** Creator actions need their actual creator denial, separate from a thread. */
  assertCreatorAllowed?: (actor: Actor, creatorId: string) => Promise<void>;
}) {
  if (!input.config.featureEnabled || !input.config.databaseUrl)
    throw new Error(
      "Enable the feature and provide a non-owner runtime DATABASE_URL.",
    );
  if (
    input.identity.mode !== "development" &&
    !(input.assertActorAllowed && input.assertScopeAllowed)
  )
    throw new Error(
      "Configured identity requires both trust denial callbacks.",
    );
  const assertActorAllowed = async (actor: Actor) => {
    await input.assertActorAllowed?.(actor);
  };
  const assertScopeAllowed: ScopeRestriction = async (...scope) => {
    await input.assertScopeAllowed?.(...scope);
  };
  const assertCreatorAllowed = async (actor: Actor, creatorId: string) => {
    await assertActorAllowed(actor);
    if (input.assertCreatorAllowed)
      await input.assertCreatorAllowed(actor, creatorId);
    else if (input.identity.mode !== "development")
      throw new DomainError(
        "creator_denial_unconfigured",
        "Creator actions require their current trust authority.",
        503,
      );
  };
  const pool = new pg.Pool({
    connectionString: input.config.databaseUrl,
    max: 20,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });
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
  try {
    features =
      (await input.registerFeatures?.({
        pool,
        database,
        access,
        conversation,
        signing,
        identity: platformIdentity,
        assertActorAllowed,
        assertScopeAllowed,
        assertCreatorAllowed,
      })) ?? [];
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
