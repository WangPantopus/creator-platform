import { randomUUID } from "node:crypto";
import express, {
  type Request,
  type Response,
  type NextFunction,
  type Router,
} from "express";
import { ZodError } from "zod";
import {
  BeginSignedActSchema,
  IdSchema,
  IdentityContinueSchema,
  IdentityRedirectSchema,
  VerifySignedActSchema,
  createOpenApi,
} from "@qelvora/api";
import { DomainError } from "./core/errors.js";
import type { BackendConfig } from "./config.js";
import {
  resolveActor,
  type PantopusIdentityAdapter,
} from "./modules/identity/adapter.js";
import type { AccessService } from "./modules/access/scope.js";
import type { ConversationService } from "./modules/conversation/service.js";
import type { SignedActService } from "./modules/identity/signed-acts.js";
import {
  createIdentityRouter,
  type IdentityRuntime,
} from "./modules/identity/router.js";
import { requestAuthority } from "./modules/identity/request-authority.js";
import { createCommerceRouter } from "./modules/commerce/router.js";
import { createW6Router } from "./modules/media/router.js";

export type FeatureRegistration = {
  name: string;
  path: string;
  router: (authority: {
    actorFor: (
      req: Request,
    ) => Promise<import("./modules/identity/adapter.js").Actor>;
    scopeFor: (
      req: Request,
    ) => Promise<import("./modules/access/scope.js").ThreadScope>;
  }) => Router;
};

export type ApplicationDependencies = {
  identity?: PantopusIdentityAdapter;
  access?: AccessService;
  conversation?: ConversationService;
  signing?: SignedActService;
  generationAvailable?: boolean;
  platformIdentity?: IdentityRuntime;
  features?: readonly FeatureRegistration[];
  /** Verified provider ingress must receive the original bytes before JSON/auth middleware. */
  stripeNotifications?: Router;
  storeNotifications?: Partial<Record<"apple" | "google", Router>>;
  assertActorAllowed?: (
    actor: import("./modules/identity/adapter.js").Actor,
  ) => Promise<void>;
};
export function createApp(
  config: BackendConfig,
  dependencies: ApplicationDependencies = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID();
    res.setHeader("X-Request-Id", res.locals.requestId as string);
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  if (dependencies.stripeNotifications)
    app.use(
      "/v1/commerce/provider-notifications/stripe",
      dependencies.stripeNotifications,
    );
  for (const provider of ["apple", "google"] as const) {
    const router = dependencies.storeNotifications?.[provider];
    if (router)
      app.use(`/v1/commerce/provider-notifications/${provider}`, router);
  }
  app.use(express.json({ limit: "64kb" }));
  if (dependencies.platformIdentity)
    app.use("/v1", async (req, _res, next) => {
      const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/u)?.[1];
      // Refresh and logout also accept an expired access window within refresh_until.
      if (
        !token ||
        [
          "/identity/refresh",
          "/identity/logout",
          "/identity/revoke-sessions",
        ].includes(req.path)
      ) {
        next();
        return;
      }
      const resolved =
        await dependencies.platformIdentity!.sessions.resolve(token);
      await dependencies.assertActorAllowed?.(resolved.actor);
      requestAuthority.run(
        { accountId: resolved.actor.accountId, sessionId: resolved.sessionId },
        next,
      );
    });
  app.get("/health", (_req, res) =>
    res.json({
      status: "ok",
      // Detailed deployment readiness is W8's /health/ready. This endpoint must
      // not advertise a development identity/database as a ready product.
      ready: false,
      foundationReady:
        config.featureEnabled &&
        Boolean(
          dependencies.identity &&
            dependencies.access &&
            dependencies.conversation,
        ),
      identity: dependencies.identity ? "configured" : "unconfigured",
      identityMode: dependencies.identity?.mode ?? "unconfigured",
      generation: dependencies.generationAvailable
        ? "configured"
        : "unconfigured",
      registeredFeatures: (dependencies.features ?? []).map(
        (feature) => feature.name,
      ),
      readinessEndpoint: "/health/ready",
      database: dependencies.access ? "configured" : "unconfigured",
      featureEnabled: config.featureEnabled,
    }),
  );
  app.get("/openapi.json", (_req, res) => res.json(createOpenApi()));
  app.get("/v1/identity/capabilities", (_req, res) =>
    res.json({
      signInAvailable: Boolean(dependencies.identity && config.featureEnabled),
      localAccountsAllowed: false,
      mode:
        dependencies.identity?.mode ??
        (dependencies.identity ? "pantopus" : "unconfigured"),
      ...(dependencies.identity?.mode === "development"
        ? { developmentActors: dependencies.identity.developmentActors }
        : {}),
    }),
  );
  app.post("/v1/identity/continue", async (req, res) => {
    const body = IdentityContinueSchema.parse(req.body);
    if (!dependencies.identity || !config.featureEnabled)
      throw new DomainError(
        "identity_unconfigured",
        "Pantopus sign-in is not connected yet.",
        503,
      );
    const result = await dependencies.identity.beginSession(body);
    if (
      !/^https:\/\//u.test(result.redirectUrl) &&
      !(
        dependencies.identity.mode === "development" &&
        ["localhost", "127.0.0.1"].includes(
          new URL(result.redirectUrl).hostname,
        )
      )
    )
      throw new DomainError(
        "identity_redirect_invalid",
        "The Pantopus sign-in redirect is unavailable.",
        503,
      );
    res.json(IdentityRedirectSchema.parse(result));
  });
  if (dependencies.platformIdentity && config.featureEnabled)
    app.use(
      "/v1/identity",
      createIdentityRouter(
        dependencies.platformIdentity,
        dependencies.assertActorAllowed,
      ),
    );
  const actorFor = async (req: Request) => {
    if (!config.featureEnabled)
      throw new DomainError(
        "feature_unavailable",
        "This app is not enabled yet.",
        503,
      );
    if (!dependencies.identity)
      throw new DomainError(
        "identity_unconfigured",
        "Pantopus sign-in is not connected yet.",
        503,
      );
    const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/u)?.[1];
    if (!token)
      throw new DomainError(
        "session_required",
        "Continue with Pantopus to use this app.",
        401,
      );
    const actor = await resolveActor(dependencies.identity, token);
    await dependencies.assertActorAllowed?.(actor);
    return actor;
  };
  const scopeFor = async (req: Request) => {
    const actor = await actorFor(req);
    if (!dependencies.access || !dependencies.conversation)
      throw new DomainError(
        "database_unconfigured",
        "The conversation service is not connected yet.",
        503,
      );
    return dependencies.access.openThread(
      actor,
      IdSchema.parse(req.params.creatorId),
      IdSchema.parse(req.params.fanId),
    );
  };
  app.get("/v1/threads/:creatorId/:fanId", async (req, res) => {
    const scope = await scopeFor(req);
    res.json(await dependencies.conversation!.read(scope));
  });
  app.post("/v1/threads/:creatorId/:fanId/messages", async (req, res) => {
    const scope = await scopeFor(req);
    if (!dependencies.generationAvailable)
      throw new DomainError(
        "model_unconfigured",
        "AI messaging is not connected yet.",
        503,
      );
    res.json(await dependencies.conversation!.send(scope, req.body));
  });
  app.post("/v1/threads/:creatorId/:fanId/takeover", async (req, res) => {
    const scope = await scopeFor(req);
    res.json(
      await dependencies.conversation!.changeControl(
        scope,
        "human_active",
        req.body,
      ),
    );
  });
  app.post("/v1/threads/:creatorId/:fanId/handback", async (req, res) => {
    const scope = await scopeFor(req);
    res.json(
      await dependencies.conversation!.changeControl(
        scope,
        "ai_active",
        req.body,
      ),
    );
  });
  app.post("/v1/threads/:creatorId/:fanId/human-replies", async (req, res) => {
    const scope = await scopeFor(req);
    res.json(await dependencies.conversation!.humanReply(scope, req.body));
  });
  app.post("/v1/identity/:creatorId/signed-acts/begin", async (req, res) => {
    const actor = await actorFor(req);
    if (!dependencies.signing)
      throw new DomainError(
        "signing_unconfigured",
        "Creator signing is not connected yet.",
        503,
      );
    const body = BeginSignedActSchema.parse(req.body);
    const creatorId = IdSchema.parse(req.params.creatorId);
    if (!body.fanId) {
      res.json(
        await dependencies.signing.beginSubject(actor, creatorId, body.command),
      );
      return;
    }
    if (!dependencies.access)
      throw new DomainError(
        "database_unconfigured",
        "Conversation authority is not connected.",
        503,
      );
    const scope = await dependencies.access.openThread(
      actor,
      creatorId,
      body.fanId,
    );
    if (
      scope.authority !== "creator" ||
      body.command.subjectId !== scope.threadId
    )
      throw new DomainError(
        "signed_subject_unavailable",
        "The creator cannot sign this subject.",
      );
    res.json(await dependencies.signing.begin(actor, creatorId, body.command));
  });
  app.post("/v1/identity/signed-acts/verify", async (req, res) => {
    const actor = await actorFor(req);
    if (!dependencies.signing)
      throw new DomainError(
        "signing_unconfigured",
        "Creator signing is not connected yet.",
        503,
      );
    const body = VerifySignedActSchema.parse(req.body);
    res.json(
      await dependencies.signing.verify(
        actor,
        body.challengeId,
        body.assertion,
      ),
    );
  });
  const registrations = dependencies.features ?? [];
  const names = new Set<string>();
  for (const feature of registrations) {
    if (
      names.has(feature.name) ||
      ![
        "/",
        "/v1/agent",
        "/v1/commerce",
        "/v1/w6",
        "/v1/growth",
        "/v1/content",
        "/v1/studio",
      ].includes(feature.path)
    )
      throw new Error("Invalid or duplicate feature registration.");
    names.add(feature.name);
    app.use(feature.path, feature.router({ actorFor, scopeFor }));
  }
  if (!names.has("commerce"))
    app.use("/v1/commerce", createCommerceRouter({ actorFor }));
  if (!names.has("media")) app.use("/v1/w6", createW6Router({ scopeFor }));
  app.use((_req, res) =>
    res.status(404).json({
      error: {
        code: "not_found",
        message: "This endpoint is unavailable.",
        requestId: res.locals.requestId as string,
      },
    }),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      void _next; // Express identifies error middleware by its four-argument signature.
      const domain =
        error instanceof DomainError
          ? error
          : error instanceof ZodError || error instanceof SyntaxError
            ? new DomainError(
                "invalid_request",
                "The request does not match the API contract.",
                400,
              )
            : new DomainError(
                "service_unavailable",
                "The service is unavailable. Please try again.",
                503,
              );
      res.status(domain.status).json({
        error: {
          code: domain.code,
          message: domain.message,
          requestId: res.locals.requestId as string,
        },
      });
    },
  );
  return app;
}
