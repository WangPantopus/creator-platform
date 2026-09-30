import { contentActorGuard } from "./actor-guard.js";
import { Router, type Request } from "express";
import { z } from "zod";
import type { FeatureRegistration } from "../../app.js";
import type { SignedSubjectPolicy } from "../identity/subjects.js";
import { ContentDocument } from "../../../../../packages/api/src/content.js";
import {
  ContentService,
  publicationCommand,
  reactionCommand,
} from "./service.js";
import { invariant } from "../../core/errors.js";

export function contentSignedSubjects(
  service: ContentService,
): SignedSubjectPolicy {
  return {
    name: "content",
    async prepare(client, actor, creatorId, requested) {
      const content = z
        .object({ kind: z.enum(["content_publication", "content_reaction"]) })
        .safeParse(requested.content);
      if (!content.success) return null;
      await service.assertCurrentAllowed(client, actor, creatorId);
      await service.role(client, actor, creatorId);
      if (content.data.kind === "content_reaction") {
        const input = z
          .object({
            replyVersion: z.int().positive(),
            reaction: z.enum(["heart", "thanks", "helpful"]),
          })
          .parse(requested.content);
        const reply = (
          await client.query(
            "SELECT r.id,r.version,r.content_id FROM creator.content_reply r JOIN creator.content_reply_review m ON m.reply_id=r.id AND m.creator_id=r.creator_id AND m.reply_version=r.version AND m.state='allowed' AND m.withdrawn_at IS NULL WHERE r.id=$1 AND r.creator_id=$2 AND r.withdrawn_at IS NULL",
            [requested.subjectId, creatorId],
          )
        ).rows[0];
        invariant(
          reply && reply.version === input.replyVersion,
          "reply_changed",
          "Refresh the current private reply before signing a reaction.",
        );
        return reactionCommand(
          creatorId,
          reply.id,
          reply.version,
          input.reaction,
        );
      }
      const row = await service.index(client, creatorId, requested.subjectId);
      invariant(
        row.state === "draft",
        "draft_changed",
        "Review and sign the current saved draft.",
      );
      const revision = (
        await client.query(
          "SELECT document FROM creator.content_revision WHERE content_id=$1 AND version=$2",
          [row.id, row.version],
        )
      ).rows[0];
      const document = ContentDocument.parse(revision?.document);
      await service.validatePublication(client, actor, row, document);
      return publicationCommand(row, document);
    },
  };
}
export function contentFeature(service: ContentService): FeatureRegistration {
  return {
    name: "content",
    path: "/v1/content",
    router: ({ actorFor }) => {
      const router = Router(),
        ids = (req: Request) => ({
          creatorId: z.uuid().parse(req.params.creatorId),
          id: z.uuid().parse(req.params.id),
        });
      router.use(contentActorGuard(actorFor));
      router.get("/:creatorId", async (req, res) =>
        res.json(
          await service.list(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
            req.query,
          ),
        ),
      );
      router.get("/:creatorId/studio/live", async (req, res) =>
        res.json(
          await service.liveCatalog(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
          ),
        ),
      );
      router.get("/:creatorId/studio", async (req, res) =>
        res.json(
          await service.list(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
            req.query,
            true,
          ),
        ),
      );
      router.post("/:creatorId/drafts", async (req, res) =>
        res.json(
          await service.save(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
            req.body,
          ),
        ),
      );
      router.get("/:creatorId/replies", async (req, res) =>
        res.json(
          await service.replies(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
            req.query,
          ),
        ),
      );
      router.get("/:creatorId/studio/replies", async (req, res) =>
        res.json(
          await service.replies(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
            req.query,
            true,
          ),
        ),
      );
      router.post("/:creatorId/replies/:id/review", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.retryReplyReview(
            await actorFor(req),
            p.creatorId,
            p.id,
            req.body,
          ),
        );
      });
      router.post("/:creatorId/replies/:id/read", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.markReplyRead(
            await actorFor(req),
            p.creatorId,
            p.id,
            req.body,
          ),
        );
      });
      router.post("/:creatorId/replies/:id/consent", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.consent(
            await actorFor(req),
            p.creatorId,
            p.id,
            req.body,
          ),
        );
      });
      router.post("/:creatorId/replies/:id/reaction", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.react(await actorFor(req), p.creatorId, p.id, req.body),
        );
      });
      router.post("/:creatorId/replies/:id/withdraw", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.withdrawReply(
            await actorFor(req),
            p.creatorId,
            p.id,
            req.body,
          ),
        );
      });
      router.get("/:creatorId/mute", async (req, res) =>
        res.json(
          await service.preference(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
          ),
        ),
      );
      router.post("/:creatorId/mute", async (req, res) =>
        res.json(
          await service.mute(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
            req.body,
          ),
        ),
      );
      router.post("/:creatorId/thanks", async (req, res) =>
        res.json(
          await service.thanks(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
            req.body,
          ),
        ),
      );
      router.get("/:creatorId/thanks", async (req, res) =>
        res.json(
          await service.myThanks(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
            req.query,
          ),
        ),
      );
      router.get("/:creatorId/studio/thanks", async (req, res) =>
        res.json(
          await service.thanksFeed(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
          ),
        ),
      );
      router.post("/:creatorId/studio/scheduled/run", async (req, res) =>
        res.json(
          await service.runScheduled(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
          ),
        ),
      );
      router.post("/:creatorId/studio/effects/run", async (req, res) =>
        res.json(
          await service.drainEffects(
            await actorFor(req),
            z.uuid().parse(req.params.creatorId),
          ),
        ),
      );
      router.get("/:creatorId/:id", async (req, res) => {
        const p = ids(req);
        res.json(await service.get(await actorFor(req), p.creatorId, p.id));
      });
      router.get("/:creatorId/:id/studio", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.get(await actorFor(req), p.creatorId, p.id, true),
        );
      });
      router.get("/:creatorId/:id/review", async (req, res) => {
        const p = ids(req);
        res.json(await service.review(await actorFor(req), p.creatorId, p.id));
      });
      router.post("/:creatorId/:id/publish", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.publish(
            await actorFor(req),
            p.creatorId,
            p.id,
            req.body,
          ),
        );
      });
      router.post("/:creatorId/:id/team-publish", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.publish(
            await actorFor(req),
            p.creatorId,
            p.id,
            req.body,
            true,
          ),
        );
      });
      router.post("/:creatorId/:id/unpublish", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.lifecycle(
            await actorFor(req),
            p.creatorId,
            p.id,
            "unpublish",
            req.body,
          ),
        );
      });
      router.post("/:creatorId/:id/archive", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.lifecycle(
            await actorFor(req),
            p.creatorId,
            p.id,
            "archive",
            req.body,
          ),
        );
      });
      router.post("/:creatorId/:id/replies", async (req, res) => {
        const p = ids(req);
        res.json(
          await service.reply(await actorFor(req), p.creatorId, p.id, req.body),
        );
      });
      return router;
    },
  };
}
