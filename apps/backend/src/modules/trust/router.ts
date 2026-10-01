import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z, ZodError } from "zod";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import {
  ClaimInput,
  DecisionInput,
  ReportInput,
  PrivacyInput,
  AppealInput,
  EffectRetryInput,
  BlockInput,
  Queue,
} from "./contracts.js";
import type { TrustService } from "./service.js";
import type { Readiness } from "../../operations/readiness.js";
import {
  failureClass,
  type TrustTelemetry,
} from "../../operations/telemetry.js";

export type TrustRouterOptions = {
  service: TrustService;
  actor: (req: Request) => Promise<Actor>;
  origin: string;
  readiness: Readiness;
  telemetry: TrustTelemetry;
  localDevelopment: boolean;
  crisisResources: {
    region: string;
    name: string;
    url: string;
    phone?: string;
  }[];
};
export function createTrustRouter(options: TrustRouterOptions) {
  const crisisResources = z
    .array(
      z.strictObject({
        region: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(160),
        url: z
          .url()
          .max(1000)
          .refine((value) => {
            const url = new URL(value);
            return url.protocol === "https:" && !url.username && !url.password;
          }, "Help resources need a reviewed HTTPS link."),
        phone: z.string().trim().min(1).max(80).optional(),
      }),
    )
    .max(100)
    .parse(options.crisisResources);
  const router = express.Router();
  router.use(options.telemetry.middleware());
  router.use((req, res, next) => {
    const origin = req.header("origin");
    if (origin && origin !== options.origin)
      return next(
        new DomainError("origin_denied", "This origin is not allowed."),
      );
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.is("application/json")
    )
      return next(
        new DomainError("json_required", "Send this action as JSON.", 415),
      );
    if (origin === options.origin) {
      res.setHeader("Access-Control-Allow-Origin", options.origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Correlation-Id, X-Expected-Account-Id",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  });
  router.use(express.json({ limit: "64kb" }));
  const id = (req: Request) => z.uuid().parse(req.params.id);
  const actor = async (req: Request) => {
    const current = await options.actor(req);
    const expected = req.get("X-Expected-Account-Id");
    if (expected && z.uuid().parse(expected) !== current.accountId)
      throw new DomainError(
        "session_account_changed",
        "Your account changed. Reopen this page before taking this action.",
        409,
      );
    // Preserve personal support/appeals/privacy progress after a denial while
    // preventing a suspended operations account from reading or deciding cases.
    if (
      req.path.startsWith("/v1/trust/operations/") ||
      req.path === "/v1/trust/cases" ||
      (/^\/v1\/trust\/cases\/[^/]+(?:\/|$)/u.test(req.path) &&
        !req.path.endsWith("/appeals"))
    )
      await options.service.assertAllowed(current);
    return current;
  };
  router.get("/health/live", (_req, res) => res.json({ alive: true }));
  router.get("/health/ready", async (_req, res) => {
    const state = await options.readiness.inspect();
    res.status(state.ready ? 200 : 503).json(state);
  });
  router.get("/v1/trust/capabilities", (_req, res) =>
    res.json({
      localDevelopment: options.localDevelopment,
      identityMode: options.localDevelopment
        ? "synthetic_local"
        : "configured_adapter",
      actorVerification: options.service.dependencies.verifyPrivacy
        ? "configured"
        : "unavailable",
      verificationMethod: options.localDevelopment
        ? "local_confirmation"
        : (options.service.dependencies.privacyVerificationMethod ??
          "external_receipt"),
      privacyDomains: [
        "identity",
        "conversation",
        "agent",
        "commerce",
        "content",
        "media",
        "growth",
        "trust",
      ],
    }),
  );
  router.get("/v1/trust/help", (_req, res) =>
    res.json({
      protocolVersion: "crisis-v1",
      resources: crisisResources,
      emergencyMessage:
        "If you are in immediate danger, contact local emergency services. An AI cannot provide emergency help.",
      paidRouting: false,
    }),
  );
  router.get("/v1/trust/status", async (_req, res) => {
    const readiness = await options.readiness.inspect();
    const incidents = (
      await options.service.store.pool.query(
        "SELECT id,component,state,public_message,updated_at,resolved_at FROM creator_trust.service_incident ORDER BY updated_at DESC LIMIT 20",
      )
    ).rows;
    res.json({ ...readiness, incidents });
  });
  router.get("/v1/trust/session", async (req, res) => {
    const current = await actor(req);
    res.json({
      accountId: current.accountId,
      adultEligible: current.adultEligible,
      localDevelopment: options.localDevelopment,
    });
  });
  router.post("/v1/trust/reports", async (req, res) =>
    res
      .status(201)
      .json(
        await options.service.report(
          await actor(req),
          ReportInput.parse(req.body),
        ),
      ),
  );
  router.get("/v1/trust/cases", async (req, res) => {
    const query = z
      .strictObject({
        queue: Queue.default("safety"),
        cursor: z
          .string()
          .regex(/^\d{1,15}$/)
          .optional(),
        number: z.coerce.number().int().positive().max(1e12).optional(),
      })
      .parse(req.query);
    res.json(
      await options.service.queue(
        await actor(req),
        query.queue,
        query.cursor,
        query.number,
      ),
    );
  });
  router.post("/v1/trust/cases/:id/access", async (req, res) => {
    const input = ClaimInput.parse(req.body);
    res.json(
      await options.service.claim(
        await actor(req),
        id(req),
        input.purpose,
        input.minutes,
        res.locals.correlationId as string,
      ),
    );
  });
  router.get("/v1/trust/cases/:id", async (req, res) =>
    res.json(
      await options.service.detail(
        await actor(req),
        id(req),
        res.locals.correlationId as string,
      ),
    ),
  );
  router.post("/v1/trust/cases/:id/decisions", async (req, res) =>
    res.json(
      await options.service.decide(
        await actor(req),
        id(req),
        DecisionInput.parse(req.body),
        res.locals.correlationId as string,
      ),
    ),
  );
  router.get("/v1/trust/my-cases", async (req, res) =>
    res.json(await options.service.ownCases(await actor(req))),
  );
  router.post("/v1/trust/cases/:id/effects/retry", async (req, res) =>
    res.json(
      await options.service.retryEffects(
        await actor(req),
        id(req),
        EffectRetryInput.parse(req.body),
        res.locals.correlationId as string,
      ),
    ),
  );
  router.post("/v1/trust/cases/:id/appeals", async (req, res) =>
    res.json(
      await options.service.appeal(
        await actor(req),
        id(req),
        AppealInput.parse(req.body),
      ),
    ),
  );
  router.post("/v1/trust/blocks", async (req, res) =>
    res.json(
      await options.service.block(await actor(req), BlockInput.parse(req.body)),
    ),
  );
  router.get("/v1/trust/inbox", async (req, res) =>
    res.json(await options.service.inbox(await actor(req))),
  );
  router.get("/v1/trust/access-history", async (req, res) =>
    res.json(await options.service.accessHistory(await actor(req))),
  );
  router.get("/v1/trust/operations/audits", async (req, res) =>
    res.json(await options.service.opsAudits(await actor(req))),
  );
  router.post("/v1/trust/privacy/jobs", async (req, res) =>
    res
      .status(202)
      .json(
        await options.service.privacy(
          await actor(req),
          PrivacyInput.parse(req.body),
        ),
      ),
  );
  router.get("/v1/trust/privacy/jobs", async (req, res) =>
    res.json(await options.service.privacyJobs(await actor(req))),
  );
  router.get("/v1/trust/privacy/jobs/:id", async (req, res) =>
    res.json(await options.service.privacyJob(await actor(req), id(req))),
  );
  router.post("/v1/trust/privacy/jobs/:id/retry", async (req, res) =>
    res.json(await options.service.retryPrivacy(await actor(req), id(req))),
  );
  router.get("/v1/trust/privacy/jobs/:id/download", async (req, res) => {
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="creator-data.json"',
    );
    res.json(await options.service.exportData(await actor(req), id(req)));
  });
  router.get("/v1/trust/operations/metrics", async (req, res) => {
    const current = await actor(req);
    await options.service.store.actor(current, async (client) => {
      const permitted = (
        await client.query(
          "SELECT supervisor FROM creator_trust.ops_member WHERE account_id=$1 AND expires_at>now() AND revoked_at IS NULL",
          [current.accountId],
        )
      ).rows[0];
      if (!permitted?.supervisor)
        throw new DomainError(
          "supervisor_required",
          "Metrics need an authorized supervisor.",
        );
    });
    res.json(options.telemetry.snapshot());
  });
  router.post("/v1/trust/feedback", async (req, res) => {
    const input = z
      .strictObject({
        consent: z.literal(true),
        cohort: z.enum(["expert", "companion", "blend", "unspecified"]),
        useful: z.boolean(),
        authorshipClear: z.boolean(),
        comment: z.string().trim().max(2000).optional(),
      })
      .parse(req.body);
    const current = await actor(req);
    await options.service.store.actor(current, (client) =>
      client.query(
        "INSERT INTO creator_trust.feedback(account_id,consent_version,cohort,useful,authorship_clear,comment) VALUES($1,'pilot-feedback-v1',$2,$3,$4,$5)",
        [
          current.accountId,
          input.cohort,
          input.useful,
          input.authorshipClear,
          input.comment ?? null,
        ],
      ),
    );
    res.status(201).json({ saved: true, retentionDays: 90 });
  });
  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      void _next;
      res.locals.failureClass = failureClass(error);
      const value =
        error instanceof DomainError
          ? error
          : error instanceof ZodError || error instanceof SyntaxError
            ? new DomainError(
                "invalid_request",
                "Check the required fields and try again.",
                400,
              )
            : new DomainError(
                "service_unavailable",
                "This service is unavailable. Try again using the same action.",
                503,
              );
      res.locals.errorCode = value.code;
      res.status(value.status).json({
        error: {
          code: value.code,
          message: value.message,
          correlationId: res.locals.correlationId,
        },
      });
    },
  );
  return router;
}
