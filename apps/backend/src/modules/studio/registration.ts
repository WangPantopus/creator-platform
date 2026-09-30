import { Router } from "express";
import { z } from "zod";
import type { FeatureRegistration } from "../../app.js";
import type { StudioService } from "./service.js";

export function studioFeature(service: StudioService): FeatureRegistration {
  return {
    name: "studio",
    path: "/v1/studio",
    router: ({ actorFor }) => {
      const router = Router(),
        id = (value: unknown) => z.uuid().parse(value);
      router.get("/session", async (req, res) =>
        res.json(await service.session(await actorFor(req))),
      );
      router.post("/invitations/:id/accept", async (req, res) =>
        res.json(
          await service.acceptInvitation(
            await actorFor(req),
            id(req.params.id),
          ),
        ),
      );
      router.post("/:creatorId/team/invite", async (req, res) =>
        res.json(
          await service.inviteByHandle(
            await actorFor(req),
            id(req.params.creatorId),
            req.body,
          ),
        ),
      );
      router.get("/:creatorId/corrections", async (req, res) =>
        res.json(
          await service.correctionRevision(
            await actorFor(req),
            id(req.params.creatorId),
          ),
        ),
      );
      router.get("/:creatorId/audiences", async (req, res) =>
        res.json(
          await service.audiences(
            await actorFor(req),
            id(req.params.creatorId),
          ),
        ),
      );
      router.get("/:creatorId/queue", async (req, res) =>
        res.json(
          await service.queue(
            await actorFor(req),
            id(req.params.creatorId),
            req.query,
          ),
        ),
      );
      router.get("/:creatorId/packets/:packetId", async (req, res) =>
        res.json(
          await service.packet(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.packetId),
          ),
        ),
      );
      router.post("/:creatorId/packets/:packetId/decide", async (req, res) =>
        res.json(
          await service.decide(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.packetId),
            req.body,
          ),
        ),
      );
      router.get("/:creatorId/packets/:packetId/deliveries", async (req, res) =>
        res.json(
          await service.deliveries(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.packetId),
          ),
        ),
      );
      router.post("/:creatorId/packets/:packetId/deliver", async (req, res) =>
        res.json(
          await service.deliver(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.packetId),
            req.body,
          ),
        ),
      );
      router.get("/:creatorId/team", async (req, res) =>
        res.json(
          await service.team(await actorFor(req), id(req.params.creatorId)),
        ),
      );
      router.get("/:creatorId/threads/:fanId", async (req, res) =>
        res.json(
          await service.thread(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.fanId),
          ),
        ),
      );
      for (const operation of ["takeover", "handback", "pause"])
        router.post(
          `/:creatorId/threads/:fanId/${operation}`,
          async (req, res) =>
            res.json(
              await service.control(
                await actorFor(req),
                id(req.params.creatorId),
                id(req.params.fanId),
                operation,
                req.body,
              ),
            ),
        );
      router.post("/:creatorId/threads/:fanId/reply", async (req, res) =>
        res.json(
          await service.humanReply(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.fanId),
            req.body,
          ),
        ),
      );
      router.get("/:creatorId/threads/:fanId/draft", async (req, res) =>
        res.json(
          await service.replyDraft(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.fanId),
          ),
        ),
      );
      router.post("/:creatorId/threads/:fanId/draft", async (req, res) =>
        res.json(
          await service.saveReplyDraft(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.fanId),
            req.body,
          ),
        ),
      );
      router.post("/:creatorId/threads/:fanId/send-draft", async (req, res) =>
        res.json(
          await service.sendSavedReply(
            await actorFor(req),
            id(req.params.creatorId),
            id(req.params.fanId),
            req.body,
          ),
        ),
      );
      router.post("/:creatorId/corrections", async (req, res) =>
        res.json(
          await service.correction(
            await actorFor(req),
            id(req.params.creatorId),
            req.body,
          ),
        ),
      );
      return router;
    },
  };
}
