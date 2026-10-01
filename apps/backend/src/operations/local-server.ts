import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import pg from "pg";
import { z } from "zod";
import { TrustService } from "../modules/trust/service.js";
import { TrustStore } from "../modules/trust/store.js";
import { TrustWorker } from "../modules/trust/worker.js";
import { createPrivacyConsumers } from "../modules/trust/privacy-consumers.js";
import { ConversationService } from "../modules/conversation/service.js";
import { createConversationRuntime } from "../modules/conversation/runtime.js";
import { AgentRepository } from "../modules/agent/repository.js";
import { AgentService } from "../modules/agent/service.js";
import { AgentPipeline } from "../modules/agent/pipeline.js";
import { AgentLifecycle } from "../modules/agent/lifecycle.js";
import { createApp } from "../app.js";
import { SignedActService } from "../modules/identity/signed-acts.js";
import { PasskeyService } from "../modules/identity/passkeys.js";
import { createCommerceRuntime } from "../modules/commerce/runtime.js";
import { readCommerceEnvironment } from "../modules/commerce/environment.js";
import { commerceSignedSubjects } from "../modules/commerce/registration.js";
import { createContentStudio } from "../modules/content/integration.js";
import { createTrustRouter } from "../modules/trust/router.js";
import { TrustTelemetry, failureClass } from "./telemetry.js";
import { Readiness } from "./readiness.js";
import { DomainError } from "../core/errors.js";
import { AccessService } from "../modules/access/scope.js";
import { Database } from "../db/database.js";
import { SessionService } from "../modules/identity/sessions.js";
import { DevelopmentIdentityAdapter } from "../modules/identity/development.js";
import { IdentityProfiles } from "../modules/identity/profiles.js";
import {
  IdentityContinueSchema,
  IdentityCompletionSchema,
  SessionSchema,
} from "@qelvora/api";
import { trustScopeRestriction } from "../modules/trust/scope-restriction.js";
import { PrivacyDomains } from "../modules/trust/contracts.js";
import { GrowthDatabase } from "../modules/growth/database.js";
import { GrowthService } from "../modules/growth/service.js";
import { unavailableOwners } from "../modules/growth/contracts.js";
import { attachRealtime } from "../realtime/gateway.js";

// Explicit local harness, never imported by production bootstrap. No production identity fallback.
if (
  process.env.W8_LOCAL_DEVELOPMENT !== "true" ||
  process.env.NODE_ENV === "production"
)
  throw new Error(
    "This harness requires W8_LOCAL_DEVELOPMENT=true outside production.",
  );
const port = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .parse(process.env.PORT ?? 4108);
const origin = z.url().parse(process.env.WEB_ORIGIN ?? "http://localhost:3008");
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw new Error("Local web origin must be loopback.");
const databaseUrl = process.env.W8_DATABASE_URL;
const workerUrl = process.env.W8_WORKER_DATABASE_URL;
const conversationUrl = process.env.W8_CONVERSATION_DATABASE_URL;
if (!databaseUrl || !workerUrl || !conversationUrl)
  throw new Error("Provide three isolated W8 non-owner connection URLs.");
for (const url of [databaseUrl, workerUrl, conversationUrl]) {
  const parsed = new URL(url);
  if (
    !["localhost", "127.0.0.1"].includes(parsed.hostname) ||
    parsed.pathname !== "/creator_w8"
  )
    throw new Error("The local harness only connects to loopback creator_w8.");
}
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 8,
  connectionTimeoutMillis: 2000,
  statement_timeout: 5000,
});
const workerPool = new pg.Pool({
  connectionString: workerUrl,
  max: 2,
  connectionTimeoutMillis: 2000,
  statement_timeout: 5000,
});
const conversationPool = new pg.Pool({
  connectionString: conversationUrl,
  max: 4,
  connectionTimeoutMillis: 2000,
});
// Privacy-only producer connections. No growth HTTP route, sender or scheduler
// is enabled by an export, and neither role gains new grants.
const growthPools: pg.Pool[] = [];
let growthService: GrowthService | undefined;
if (
  process.env.W8_GROWTH_WORKER_DATABASE_URL &&
  process.env.W8_GROWTH_ENCRYPTION_KEY
) {
  const workerAddress = new URL(process.env.W8_GROWTH_WORKER_DATABASE_URL);
  if (
    !["localhost", "127.0.0.1"].includes(workerAddress.hostname) ||
    workerAddress.pathname !== "/creator_w8" ||
    workerAddress.username !== "growth_worker"
  )
    throw new Error(
      "Growth privacy requires the isolated non-owner growth worker.",
    );
  const runtimeAddress = new URL(workerAddress);
  runtimeAddress.username = "growth_runtime";
  const growthRuntimePool = new pg.Pool({
    connectionString: runtimeAddress.toString(),
    max: 1,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
  });
  const growthWorkerPool = new pg.Pool({
    connectionString: workerAddress.toString(),
    max: 2,
    connectionTimeoutMillis: 2000,
    statement_timeout: 5000,
  });
  growthPools.push(growthRuntimePool, growthWorkerPool);
  const growthDatabase = new GrowthDatabase(
    growthRuntimePool,
    growthWorkerPool,
  );
  await growthDatabase.ready();
  growthService = new GrowthService(
    growthDatabase,
    unavailableOwners,
    Buffer.from(
      z
        .string()
        .regex(/^[a-f0-9]{64}$/i)
        .parse(process.env.W8_GROWTH_ENCRYPTION_KEY),
      "hex",
    ),
  );
}
const store = new TrustStore(pool);
await store.assertRole();
const db: Database = new Database(conversationPool, undefined, (...scope) =>
  trustScopeRestriction(service, workerPool)(...scope),
);
await db.assertRuntimeRole();
const access: AccessService = new AccessService(
  conversationPool,
  undefined,
  (...scope) => trustScopeRestriction(service, workerPool)(...scope),
);
const nativeIdentity = new SessionService(
  conversationPool,
  new DevelopmentIdentityAdapter(origin, "development"),
  process.env.W8_LOCAL_SESSION_KEY
    ? Buffer.from(process.env.W8_LOCAL_SESSION_KEY, "hex")
    : randomBytes(32),
);
const nativeProfiles = new IdentityProfiles(conversationPool);
const sessions = new Map<
  string,
  { accountId: string; adultEligible: boolean; expiresAt: number }
>();
const actors = {
  fan: {
    accountId: "10000000-0000-4000-8000-000000000001",
    adultEligible: true,
  },
  other_fan: {
    accountId: "10000000-0000-4000-8000-000000000002",
    adultEligible: true,
  },
  creator: {
    accountId: "10000000-0000-4000-8000-000000000003",
    adultEligible: true,
  },
  safety: {
    accountId: "10000000-0000-4000-8000-000000000004",
    adultEligible: true,
  },
  appeals: {
    accountId: "10000000-0000-4000-8000-000000000005",
    adultEligible: true,
  },
  verification: {
    accountId: "10000000-0000-4000-8000-000000000006",
    adultEligible: true,
  },
} as const;
const service: TrustService = new TrustService(store, {
  async evidence(actor, input) {
    if (!input.creatorId) return { items: [] };
    if (input.requestId)
      throw new DomainError(
        "commerce_unavailable",
        "Request and payment evidence is not connected.",
        503,
      );
    const profile = await conversationPool.query<{ id: string }>(
      "SELECT id FROM creator.fan_profile WHERE account_id=$1",
      [actor.accountId],
    );
    if (!profile.rows[0])
      throw new DomainError(
        "fan_scope_required",
        "A fan scope is needed to report this message.",
      );
    const scope = await access.openThread(
      actor,
      input.creatorId,
      profile.rows[0].id,
      false,
    );
    if (scope.authority !== "fan")
      throw new DomainError(
        "fan_scope_required",
        "You can report only your own conversation.",
      );
    await service.assertAllowed(actor, scope.creatorId, scope.threadId);
    const items = input.messageId
      ? await db.withThread(scope, async (client) => {
          const row = (
            await client.query<{
              id: string;
              author_kind: "ai";
              text: string;
              created_at: string;
              thread_id: string;
            }>(
              "SELECT id,author_kind,text,created_at,thread_id FROM creator.message WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND thread_id=$4 AND author_kind='ai'",
              [input.messageId, scope.creatorId, scope.fanId, scope.threadId],
            )
          ).rows[0];
          if (!row)
            throw new DomainError(
              "message_unavailable",
              "This AI message is unavailable.",
              404,
            );
          return [
            {
              ...row,
              category: "reported_ai_message",
              creator_name: scope.creatorName,
            },
          ];
        })
      : [];
    return {
      creatorId: scope.creatorId,
      creatorName: scope.creatorName,
      subjectAccountId: scope.creatorAccountId,
      items,
    };
  },
  async verifyPrivacy(_actor, input) {
    if (input.proof !== "LOCAL DEVELOPMENT")
      throw new DomainError(
        "local_confirmation_required",
        "Type LOCAL DEVELOPMENT for this synthetic account.",
        401,
      );
    return {
      verifiedAt: new Date(),
      reference: "synthetic-local-confirmation",
    };
  },
  async privacyOwnership(actor) {
    const profiles = await nativeProfiles.view(actor);
    return {
      creatorIds: profiles.creator ? [profiles.creator.id as string] : [],
      reference: "w1-current-own-profile:" + (profiles.creator?.version ?? 0),
    };
  },
  async authorizePrivacyScope(actor, input) {
    const fan = (
      await conversationPool.query<{ id: string }>(
        "SELECT id FROM creator.fan_profile WHERE account_id=$1",
        [actor.accountId],
      )
    ).rows[0];
    if (!fan || !input.creatorId)
      throw new DomainError(
        "scope_unavailable",
        "This data scope is unavailable.",
        404,
      );
    const scope = await access.openThread(
      actor,
      input.creatorId,
      fan.id,
      false,
    );
    if (input.threadId && input.threadId !== scope.threadId)
      throw new DomainError(
        "scope_unavailable",
        "This data scope is unavailable.",
        404,
      );
  },
});
const conversation = new ConversationService(db, access, {
  checkSentence: async () => {
    throw new DomainError(
      "model_unconfigured",
      "The model provider is not connected.",
      503,
    );
  },
});
const conversationRuntime = createConversationRuntime({
  database: db,
  access,
  conversation,
});
const agentRepository = new AgentRepository(conversationPool);
const agentService = new AgentService(
  agentRepository,
  new AgentPipeline(agentRepository, null),
);
const commerceConfiguration = readCommerceEnvironment(conversationPool);
const commerceRuntime = commerceConfiguration
  ? createCommerceRuntime({
      pool: conversationPool,
      database: db,
      access,
      ...commerceConfiguration,
    })
  : undefined;
const contentRuntime = commerceRuntime
  ? createContentStudio({
      pool: conversationPool,
      owners: {
        commerce: commerceRuntime.service,
        conversation,
        access,
        agent: agentService,
        profiles: nativeProfiles,
      },
      dependencies: {
        assertAllowed: (actor, creatorId) =>
          service.assertAllowed(actor, creatorId),
      },
    })
  : undefined;
const privacyHooks = createPrivacyConsumers({
  runtimePool: conversationPool,
  coordinatorPool: workerPool,
  agent: {
    service: agentService,
    lifecycle: new AgentLifecycle(agentRepository, null),
  },
  commerce: commerceRuntime?.service,
  growth: growthService,
});
const telemetry = new TrustTelemetry(
  "local-development",
  process.env.RELEASE_REVISION ?? "uncommitted-w8",
);
const poolError = () => telemetry.increment("database_connection_errors");
for (const current of [pool, workerPool, conversationPool, ...growthPools])
  current.on("error", poolError);
const readiness = new Readiness(
  [
    {
      name: "database",
      required: true,
      run: async () => {
        await store.assertRole();
        return { state: "available", code: "non_owner_rls_verified" };
      },
    },
    {
      name: "identity",
      required: true,
      run: async () => ({
        state: "development",
        code: "synthetic_local_accounts",
      }),
    },
    ...["model", "payments", "calls", "voice", "push"].map((name) => ({
      name,
      required: true,
      run: async () => ({
        state: "unavailable" as const,
        code: "adapter_unconfigured",
      }),
    })),
    ...PrivacyDomains.map((domain) => ({
      name: `privacy_${domain}`,
      required: true,
      run: async () => ({
        state: "unavailable" as const,
        code: privacyHooks.some((hook) => hook.domain === domain)
          ? "export_hook_registered_retention_gated"
          : "owner_hook_unconfigured",
      }),
    })),
  ],
  "local-development",
  telemetry.release,
);
const app = express();
app.use(telemetry.middleware());
app.disable("x-powered-by");
app.use((req, res, next) => {
  if (req.header("origin") && req.header("origin") !== origin)
    return res.status(403).json({
      error: {
        code: "origin_denied",
        message: "This origin is not allowed.",
        correlationId: res.locals.correlationId,
      },
    });
  res.setHeader("Cache-Control", "no-store");
  next();
});
// Reuse W1's canonical session implementation for the isolated native demonstration.
// The ephemeral encryption key intentionally invalidates these synthetic sessions on restart.
app.use("/v1/identity", express.json({ limit: "8kb" }));
app.get("/v1/identity/capabilities", (_req, res) =>
  res.json({
    signInAvailable: true,
    localAccountsAllowed: false,
    mode: "development",
    developmentActors: nativeIdentity.developmentActors,
  }),
);
app.post("/v1/identity/continue", async (req, res) =>
  res.json(
    await nativeIdentity.beginSession(IdentityContinueSchema.parse(req.body)),
  ),
);
const nativeToken = (req: express.Request) => {
  const token = req.header("authorization")?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token)
    throw new DomainError(
      "session_required",
      "Continue with your account.",
      401,
    );
  return token;
};
const nativeView = async (token: string) => {
  const resolved = await nativeIdentity.resolve(token);
  return SessionSchema.parse({
    ...(await nativeProfiles.view(resolved.actor)),
    accountId: resolved.actor.accountId,
    adultEligible: true,
    sessionId: resolved.sessionId,
    expiresAt: resolved.expiresAt,
    mode: "development",
  });
};
app.post("/v1/identity/complete", async (req, res) => {
  const result = await nativeIdentity.complete(req.body);
  try {
    res.json(
      IdentityCompletionSchema.parse({
        token: result.token,
        returnTo: result.returnTo,
        session: await nativeView(result.token),
      }),
    );
  } catch (error) {
    await nativeIdentity.logout(result.token);
    throw error;
  }
});
app.get("/v1/identity/session", async (req, res) =>
  res.json(await nativeView(nativeToken(req))),
);
app.post("/v1/identity/fan-profile", async (req, res) =>
  res.json(
    await nativeProfiles.saveFan(
      await nativeIdentity.resolveSession(nativeToken(req)),
      req.body,
    ),
  ),
);
app.post("/v1/identity/refresh", async (req, res) =>
  res.json(await nativeIdentity.refresh(nativeToken(req))),
);
app.post("/v1/identity/logout", async (req, res) =>
  res.json(await nativeIdentity.logout(nativeToken(req))),
);
app.post("/v1/identity/revoke-sessions", async (req, res) =>
  res.json(await nativeIdentity.logout(nativeToken(req), true)),
);
app.post(
  "/v1/trust/dev/session",
  express.json({ limit: "2kb" }),
  (req, res) => {
    if (req.header("origin") && req.header("origin") !== origin)
      return res
        .status(403)
        .json({ error: { message: "This origin is not allowed." } });
    const selected = z
      .enum([
        "fan",
        "other_fan",
        "creator",
        "safety",
        "appeals",
        "verification",
      ])
      .safeParse(req.body?.actor);
    if (!selected.success)
      return res
        .status(400)
        .json({ error: { message: "Choose a synthetic local actor." } });
    for (const [token, session] of sessions)
      if (session.expiresAt < Date.now()) sessions.delete(token);
    if (sessions.size >= 100)
      return res
        .status(429)
        .json({ error: { message: "Too many local sessions." } });
    const token = randomUUID();
    sessions.set(token, {
      ...actors[selected.data],
      expiresAt: Date.now() + 3600_000,
    });
    res.setHeader("Cache-Control", "no-store");
    return res.json({ token, expiresInSeconds: 3600, localDevelopment: true });
  },
);
app.use(
  createTrustRouter({
    service,
    origin,
    telemetry,
    readiness,
    localDevelopment: true,
    crisisResources: [],
    actor: async (req) => {
      const token = req
        .header("authorization")
        ?.match(/^Bearer ([^\s]+)$/i)?.[1];
      const session = token ? sessions.get(token) : undefined;
      if (!session && token) return nativeIdentity.resolveSession(token);
      if (!session || session.expiresAt < Date.now())
        throw new DomainError(
          "session_required",
          "Continue with your account to use this service.",
          401,
        );
      return Object.freeze({
        accountId: session.accountId,
        adultEligible: session.adultEligible,
      });
    },
  }),
);
// The actual W3 feature uses W1's same session and W8's current pair denial.
// Provider consent/generation remain unavailable without approved configuration.
const signing = new SignedActService(
  conversationPool,
  "localhost",
  origin,
  undefined,
  [
    commerceSignedSubjects,
    ...(contentRuntime ? [contentRuntime.signedSubjects] : []),
  ],
);
app.use(
  createApp(
    {
      port,
      featureEnabled: true,
      databaseUrl: conversationUrl,
      allowedOrigin: origin,
      rpId: "localhost",
    },
    {
      identity: nativeIdentity,
      telemetry,
      platformIdentity: {
        sessions: nativeIdentity,
        profiles: nativeProfiles,
        signing,
        passkeys: new PasskeyService(
          conversationPool,
          "localhost",
          [origin],
          "Creator Platform",
        ),
      },
      signing,
      access,
      conversation,
      features: [
        conversationRuntime.registration,
        ...(commerceRuntime ? [commerceRuntime.feature] : []),
        ...(contentRuntime?.features ?? []),
      ],
      assertActorAllowed: (actor) => service.assertAllowed(actor),
    },
  ),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    void _next;
    const value =
      error instanceof DomainError
        ? error
        : new DomainError(
            "identity_unavailable",
            "This local account action could not complete.",
            503,
          );
    res.locals.errorCode = value.code;
    res.locals.failureClass = failureClass(error);
    res.status(value.status).json({
      error: {
        code: value.code,
        message: value.message,
        correlationId: res.locals.correlationId,
      },
    });
  },
);
const worker = new TrustWorker(workerPool, privacyHooks, [], (signal, value) =>
  ["worker_errors", "privacy_retry"].includes(signal)
    ? telemetry.increment(signal, value)
    : telemetry.observe(signal, value),
);
await worker.start();
const server = createServer(app);
const sockets = attachRealtime(
  server,
  nativeIdentity,
  access,
  conversation,
  origin,
  {
    assertActorAllowed: (actor) => service.assertAllowed(actor),
    resolveSession: (token) => nativeIdentity.resolve(token),
    telemetry,
  },
);
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5000;
server.listen(port, "127.0.0.1", () =>
  process.stdout.write(
    `W8 synthetic local API on ${port}; ${privacyHooks.length} privacy consumers registered, external providers and retention remain gated.\n`,
  ),
);
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  for (const connection of sockets.clients)
    connection.close(1001, "Server shutdown");
  const drain = setTimeout(() => {
    for (const connection of sockets.clients) connection.terminate();
  }, 5000);
  drain.unref();
  await worker.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  clearTimeout(drain);
  telemetry.close();
  await Promise.all([
    pool.end(),
    workerPool.end(),
    conversationPool.end(),
    ...growthPools.map((current) => current.end()),
  ]);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
