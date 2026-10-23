import { copy } from "@qelvora/copy";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z, ZodError } from "zod";
import { DomainError } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type { GrowthService } from "./service.js";
import { Retention } from "./retention.js";
import { Engagement } from "./engagement.js";
import { GrowthExperiments } from "./experiments.js";
import type { PostEntryContext } from "./entry-context.js";

/** W1 mounts this router before its 404, supplies the canonical session resolver. */
export function createGrowthRouter(
  service: GrowthService,
  actorFor: (request: Request) => Promise<Actor>,
  options: {
    retention?: Retention;
    engagement?: Engagement;
    experiments?: GrowthExperiments;
    postEntryContext?: (
      actor: Actor,
      input: unknown,
    ) => Promise<PostEntryContext | null>;
  } = {},
) {
  const router = Router();
  const retention = options.retention ?? new Retention(service);
  const engagement = options.engagement ?? new Engagement(service);
  const experiments = options.experiments ?? new GrowthExperiments(service);
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const uuid = (value: unknown) => z.uuid().parse(value);
  router.get("/public/index", async (req, res) =>
    res.json(await service.publicIndex(String(req.query.after ?? ""))),
  );
  router.get("/public/creators", async (req, res) =>
    res.json(
      await service.discover(
        String(req.query.q ?? ""),
        String(req.query.category ?? ""),
        z.coerce
          .number()
          .int()
          .min(0)
          .max(1000)
          .parse(req.query.offset ?? 0),
        req.query.cursor === undefined
          ? undefined
          : z.string().min(1).max(2048).parse(req.query.cursor),
      ),
    ),
  );
  router.get("/public/creators/:handle", async (req, res) => {
    const creator = await service.creator(String(req.params.handle));
    if (!creator)
      throw new DomainError(
        "creator_unavailable",
        copy.growthThisCreatorIsUnavailable,
        404,
      );
    res.json({ creator, posts: await service.posts(creator.id) });
  });
  router.get("/public/creators/:handle/posts/:id", async (req, res) => {
    const value = await service.post(
      String(req.params.handle),
      uuid(req.params.id),
    );
    if (!value)
      throw new DomainError(
        "post_unavailable",
        copy.growthThisPostIsUnavailable,
        404,
      );
    res.json(value);
  });
  router.get("/public/invites/:id", async (req, res) => {
    const value = await service.invite(uuid(req.params.id));
    if (!value)
      throw new DomainError(
        "invite_unavailable",
        copy.growthErrorEntryUnavailable2,
        404,
      );
    res.json(value);
  });
  router.get("/public/shares/:id", async (req, res) => {
    const value = await service.share(uuid(req.params.id));
    if (!value)
      throw new DomainError(
        "share_unavailable",
        copy.growthErrorShareUnavailable,
        404,
      );
    res.json(value);
  });
  router.get("/public/shares/:id/export", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(await service.shareExport(uuid(req.params.id)));
  });
  router.post("/unsubscribe", async (req, res) =>
    res.json(
      await service.unsubscribe(
        z.strictObject({ token: z.string().min(32).max(64) }).parse(req.body)
          .token,
      ),
    ),
  );
  router.get("/discovery-access", async (req, res) =>
    res.json(
      await service.passDiscovery(
        await actorFor(req),
        req.query.creators === undefined
          ? undefined
          : z
              .string()
              .max(3699)
              .parse(req.query.creators)
              .split(",")
              .filter(Boolean),
      ),
    ),
  );
  router.get("/creators/:handle/posts/:id/context", async (req, res) => {
    const actor = await actorFor(req);
    const expectedAccount = req.get("x-qelvora-expected-account");
    if (expectedAccount && uuid(expectedAccount) !== actor.accountId)
      throw new DomainError(
        "growth_entry_session_required",
        copy.growthErrorGrowthAuthorityRequired,
        401,
      );
    if (!options.postEntryContext)
      throw new DomainError(
        "growth_entry_context_unconfigured",
        copy.growthThisDestinationIsUnavailableReconnectAndTryAgain,
        503,
      );
    const context = await options.postEntryContext(actor, {
      handle: String(req.params.handle),
      contentId: uuid(req.params.id),
    });
    if (!context)
      throw new DomainError(
        "post_unavailable",
        copy.growthThisPostIsUnavailable,
        404,
      );
    res.json({ context });
  });
  router.post("/engagement/:kind/claim", async (req, res) =>
    res.json(
      await engagement.claimPrompt(
        await actorFor(req),
        req.params.kind,
        z
          .strictObject({
            platform: z.enum(["web", "ios", "android"]),
            id: z.uuid(),
          })
          .parse(req.body).platform,
        z.uuid().parse(req.body.id),
      ),
    ),
  );
  router.put("/engagement/:kind/choice", async (req, res) => {
    const value = z
      .strictObject({
        id: z.uuid(),
        choice: z.enum(["later", "declined", "accepted"]),
      })
      .parse(req.body);
    res.json(
      await engagement.choosePrompt(
        await actorFor(req),
        req.params.kind,
        value.choice,
        value.id,
      ),
    );
  });
  router.get("/engagement", async (req, res) =>
    res.json({ choices: await engagement.choices(await actorFor(req)) }),
  );
  router.post("/entry", async (req, res) =>
    res.json(await engagement.attribute(await actorFor(req), req.body)),
  );
  router.post("/referrals", async (req, res) =>
    res
      .status(201)
      .json(await engagement.createReferral(await actorFor(req), req.body)),
  );
  router.delete("/invites/:id", async (req, res) =>
    res.json(
      await engagement.revokeInvite(await actorFor(req), uuid(req.params.id)),
    ),
  );
  router.get("/experiments/variant/:handle", async (req, res) =>
    res.json({
      variant: await experiments.variant(
        await actorFor(req),
        String(req.params.handle),
        z
          .enum(["creator_landing", "onboarding_message"])
          .parse(req.query.surface),
      ),
    }),
  );
  router.put("/experiments/:id/stop", async (req, res) =>
    res.json(await experiments.stop(await actorFor(req), uuid(req.params.id))),
  );
  router.get("/home", async (req, res) =>
    res.json(await service.home(await actorFor(req), req.query)),
  );
  router.put("/follow/:creatorId", async (req, res) =>
    res.json(
      await service.follow(
        await actorFor(req),
        uuid(req.params.creatorId),
        z.strictObject({ following: z.boolean() }).parse(req.body).following,
      ),
    ),
  );
  router.get("/follow/:creatorId", async (req, res) =>
    res.json(
      await service.following(await actorFor(req), uuid(req.params.creatorId)),
    ),
  );
  router.get("/notifications", async (req, res) =>
    res.json({ notifications: await service.inbox(await actorFor(req)) }),
  );
  router.get("/notifications/:id", async (req, res) =>
    res.json(
      await service.notification(await actorFor(req), uuid(req.params.id)),
    ),
  );
  router.put("/notifications/:id/read", async (req, res) =>
    res.json(await service.markRead(await actorFor(req), uuid(req.params.id))),
  );
  router.get("/preferences", async (req, res) =>
    res.json(await service.preferences(await actorFor(req))),
  );
  router.get("/preferences/creators", async (req, res) =>
    res.json({
      creators: await service.preferenceCreators(await actorFor(req)),
    }),
  );
  router.put("/preferences", async (req, res) =>
    res.json(await service.preferences(await actorFor(req), req.body)),
  );
  router.put("/devices", async (req, res) =>
    res.json(await service.registerDevice(await actorFor(req), req.body)),
  );
  router.delete("/devices/:id", async (req, res) =>
    res.json(
      await service.revokeDevice(
        await actorFor(req),
        uuid(req.params.id),
        req.body,
      ),
    ),
  );
  router.post("/shares", async (req, res) =>
    res
      .status(201)
      .json(
        await service.createShare(
          await actorFor(req),
          z.strictObject({ grantId: z.uuid() }).parse(req.body).grantId,
        ),
      ),
  );
  router.post("/invites", async (req, res) =>
    res
      .status(201)
      .json(await service.createInvite(await actorFor(req), req.body)),
  );
  router.get("/launch", async (req, res) =>
    res.json(await service.launchKit(await actorFor(req))),
  );
  router.get("/insights", async (req, res) =>
    res.json({ clusters: await service.insights(await actorFor(req)) }),
  );
  router.put("/recommendations", async (req, res) =>
    res.json(await service.recommendation(await actorFor(req), req.body)),
  );
  router.post("/recommendations/publish", async (req, res) =>
    res.json(
      await service.publishRecommendation(await actorFor(req), req.body),
    ),
  );
  router.get("/funnel", async (req, res) =>
    res.json(await service.funnel(await actorFor(req))),
  );
  router.get("/activation", async (req, res) =>
    res.json({
      activation: await retention.activation(await actorFor(req)),
    }),
  );
  router.get("/experiments", async (req, res) =>
    res.json({ experiments: await service.experiments(await actorFor(req)) }),
  );
  router.post("/experiments", async (req, res) =>
    res
      .status(201)
      .json(await service.proposeExperiment(await actorFor(req), req.body)),
  );
  router.get("/impact", async (req, res) =>
    res.json({
      impact: await retention.impact(await actorFor(req)),
    }),
  );
  router.post("/feedback", async (req, res) =>
    res.status(201).json(await service.feedback(await actorFor(req), req.body)),
  );
  // Domain outcomes are recorded via measure() by producers, never claimed by clients.
  router.use(
    (error: unknown, _req: Request, res: Response, next: NextFunction) => {
      void next;
      const value =
        error instanceof DomainError
          ? error
          : error instanceof ZodError
            ? new DomainError(
                "invalid_request",
                copy.growthErrorInvalidRequest,
                400,
              )
            : new DomainError(
                "growth_unavailable",
                copy.growthErrorGrowthUnavailable,
                503,
              );
      res
        .status(value.status)
        .json({ error: { code: value.code, message: value.message } });
    },
  );
  return router;
}
