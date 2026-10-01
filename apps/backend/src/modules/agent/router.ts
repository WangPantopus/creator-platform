import {
  Router,
  type Request,
  type NextFunction,
  type Response,
} from "express";
import { z, ZodError } from "zod";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import { SourceService } from "../sources/service.js";
import { AgentService } from "./service.js";
import type { CreatorScope } from "./repository.js";
import type { ShadowReplay } from "./shadow.js";
import { EvaluationRequest } from "../../../../../packages/api/src/agent/contracts.js";
import { once } from "node:events";

export function createAgentRouter(input: {
  service: AgentService;
  sources: SourceService;
  resolveActor: (req: Request) => Promise<Actor>;
  development: boolean;
  shadow?: ShadowReplay;
}) {
  const router = Router();
  router.use((req, _res, next) => {
    void input
      .resolveActor(req)
      .then((actor) => {
        if (!actor.adultEligible)
          throw new DomainError(
            "adult_eligibility_required",
            "Adult eligibility is required.",
          );
        _res.locals.actor = actor;
        next();
      }, next)
      .catch(next);
  });
  const scope = (req: Request, res: Response): CreatorScope => ({
    creatorId: z.uuid().parse(req.params.creatorId),
    accountId: (res.locals.actor as Actor).accountId,
    development: input.development,
  });
  const key = (req: Request) => req.header("Idempotency-Key") ?? "";
  const signal = (res: Response) => {
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    return controller.signal;
  };
  router.get("/:creatorId/state", async (req, res) =>
    res.json(await input.service.read(scope(req, res))),
  );
  router.get("/:creatorId/versions", async (req, res) => {
    const before =
      req.query.before === undefined
        ? null
        : z.coerce.number().int().positive().parse(req.query.before);
    res.json(await input.service.versions(scope(req, res), before));
  });
  router.get("/:creatorId/comparisons", async (req, res) => {
    const items = await input.service.repository.transaction(
      scope(req, res),
      async (client) => {
        await client.query(
          "UPDATE creator.ai_shadow_evaluation SET state='failed',error='Comparison interrupted. Run it again.',updated_at=now() WHERE creator_id=$1 AND state='running' AND updated_at<now()-interval '10 minutes'",
          [req.params.creatorId],
        );
        return (
          await client.query(
            'SELECT id,fingerprint,live_version_id AS "liveVersionId",results,state,error,created_at AS "createdAt" FROM creator.ai_shadow_evaluation WHERE creator_id=$1 ORDER BY created_at DESC LIMIT 10',
            [req.params.creatorId],
          )
        ).rows;
      },
    );
    res.json({ available: Boolean(input.shadow), items });
  });
  router.post("/:creatorId/comparisons", async (req, res) => {
    await input.service.read(scope(req, res));
    if (!input.shadow)
      throw new DomainError(
        "shadow_feed_unconfigured",
        "Connect the privacy-safe recent conversation feed before comparing versions.",
        503,
      );
    const body = EvaluationRequest.parse(req.body);
    res
      .status(202)
      .json(
        await input.shadow.start(
          scope(req, res),
          key(req),
          body.expectedRevision,
        ),
      );
  });
  router.put("/:creatorId/draft", async (req, res) =>
    res.json(await input.service.draft(scope(req, res), key(req), req.body)),
  );
  router.put("/:creatorId/interview", async (req, res) =>
    res.json(
      await input.service.interview(scope(req, res), key(req), req.body),
    ),
  );
  router.put("/:creatorId/status", async (req, res) =>
    res.json(await input.service.status(scope(req, res), key(req), req.body)),
  );
  router.post("/:creatorId/sources", async (req, res) =>
    res.json(await input.sources.create(scope(req, res), key(req), req.body)),
  );
  router.get("/:creatorId/sources/:sourceId", async (req, res) =>
    res.json(
      await input.sources.review(
        scope(req, res),
        z.uuid().parse(req.params.sourceId),
      ),
    ),
  );
  router.post("/:creatorId/sources/:sourceId", async (req, res) =>
    res.json(
      await input.sources.act(
        scope(req, res),
        z.uuid().parse(req.params.sourceId),
        key(req),
        req.body,
      ),
    ),
  );
  router.put("/:creatorId/sources/:sourceId", async (req, res) =>
    res.json(
      await input.sources.revise(
        scope(req, res),
        z.uuid().parse(req.params.sourceId),
        key(req),
        req.body,
      ),
    ),
  );
  router.post("/:creatorId/sponsors", async (req, res) =>
    res.json(await input.service.sponsor(scope(req, res), key(req), req.body)),
  );
  router.post("/:creatorId/license", async (req, res) =>
    res.json(await input.service.license(scope(req, res), key(req), req.body)),
  );
  router.post("/:creatorId/corrections", async (req, res) =>
    res.json(
      await input.service.correction(scope(req, res), key(req), req.body),
    ),
  );
  router.post("/:creatorId/style-card", async (req, res) =>
    res.json(
      await input.service.styleCard(
        scope(req, res),
        key(req),
        req.body,
        signal(res),
      ),
    ),
  );
  router.post("/:creatorId/preview", async (req, res) =>
    res.json(
      await input.service.preview(scope(req, res), req.body, signal(res)),
    ),
  );
  router.post("/:creatorId/evaluations", async (req, res) =>
    res
      .status(202)
      .json(await input.service.evaluate(scope(req, res), key(req), req.body)),
  );
  router.post("/:creatorId/evaluations/cancel", async (req, res) => {
    await input.service.read(scope(req, res));
    res.json(await input.service.cancelEvaluation(scope(req, res)));
  });
  router.post("/:creatorId/publish", async (req, res) =>
    res.json(await input.service.publish(scope(req, res), key(req), req.body)),
  );
  router.post("/:creatorId/pause", async (req, res) =>
    res.json(await input.service.pause(scope(req, res), key(req))),
  );
  router.post("/:creatorId/versions/:versionId/rollback", async (req, res) =>
    res.json(
      await input.service.rollback(
        scope(req, res),
        key(req),
        z.uuid().parse(req.params.versionId),
      ),
    ),
  );
  router.get("/:creatorId/export", async (req, res) => {
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=creator-ai-export.json",
    );
    const abort = signal(res);
    res.type("application/json");
    await input.service.exportTo(
      scope(req, res),
      async (part) => {
        abort.throwIfAborted();
        if (!res.write(part)) await once(res, "drain", { signal: abort });
      },
      abort,
    );
    res.end();
  });
  router.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      void next;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const fault =
        error instanceof DomainError
          ? error
          : error instanceof ZodError || error instanceof SyntaxError
            ? new DomainError(
                "invalid_request",
                "Check the fields and try again.",
                400,
              )
            : new DomainError(
                "service_unavailable",
                "This AI service is unavailable. Your saved draft is safe.",
                503,
              );
      res
        .status(fault.status)
        .json({ error: { code: fault.code, message: fault.message } });
    },
  );
  return router;
}
