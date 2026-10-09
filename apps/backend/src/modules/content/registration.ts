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
import type { Actor } from "../identity/adapter.js";
import { ThreadPresence } from "./thread-presence.js";
import { invariant } from "../../core/errors.js";

export function contentSignedSubjects(
  service: ContentService,
): SignedSubjectPolicy {
  return {
    name: "content",
    requiresFinalization: true,
    async finalizeBeforeCommit(
      client,
      actor,
      creatorId,
      canonical,
      finalization,
    ) {
      const body = z
        .object({ kind: z.string(), creatorId: z.uuid() })
        .parse(canonical.content);
      invariant(
        body.creatorId === creatorId,
        "publication_source_changed",
        "The exact signing creator is required.",
      );
      if (body.kind !== "content_publication") return;
      await service.publicationSources.finalize(client, actor, {
        stage: "signing_challenge",
        publicationSignedActId: null,
        challengeId: finalization.challengeId,
      });
    },
    async prepare(client, actor, creatorId, requested) {
      const content = z
        .object({ kind: z.enum(["content_publication", "content_reaction"]) })
        .safeParse(requested.content);
      if (!content.success) return null;
      await service.assertCurrentAllowed(client, actor, creatorId);
      if (content.data.kind === "content_publication") {
        await service.publicationSources.prepare(
          client,
          actor,
          creatorId,
          requested.subjectId,
        );
        await service.authorizeMedia(client, actor, creatorId);
      }
      await service.role(client, actor, creatorId);
      if (content.data.kind === "content_reaction") {
        await service.assertReplyReviewInstalled(client);
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
      const { mediaEvidence } = await service.validatePublication(
        client,
        actor,
        row,
        document,
      );
      if (document.planRef)
        await service.publicationSources.groupPositive(client, actor);
      return publicationCommand(row, document, mediaEvidence);
    },
  };
}
export function contentFeature(service: ContentService): FeatureRegistration {
  const presence = new ThreadPresence(service);
  /** WP 5.2: once the creator has her answer, finish her pending downstream
   * work (tell a Note's audience, tell a reacted-to fan) in the same session.
   * Never fails her request: anything that cannot finish stays pending. One
   * creator's runs queue behind each other so a burst of publishes cannot start
   * a burst of overlapping fan-outs that starve the connection pool the fans read
   * through. There is no background worker yet, so a Note or reaction effect that
   * failed for a passing reason (a lock timeout, a restart) is tried again by
   * this same session when its backoff is due, at most three times; after that
   * the Studio's effects run retries it. */
  const queued = new Map<string, Promise<void>>();
  const deliver = (actor: Actor, creatorId: string, attempt = 0) => {
    const run = (queued.get(creatorId) ?? Promise.resolve()).then(async () => {
      try {
        await service.drainEffects(actor, creatorId);
      } catch {
        /* pending effects are retried below or by the Studio's effects run */
      }
      if (attempt >= 3) return;
      try {
        const waitSeconds = await service.transaction(
          actor,
          creatorId,
          async (client) =>
            (
              await client.query<{ wait: number | null }>(
                "SELECT extract(epoch FROM (min(next_at)-now()))::float AS wait FROM creator.content_effect WHERE creator_id=$1 AND state<>'done' AND type IN('published','reaction')",
                [creatorId],
              )
            ).rows[0]?.wait ?? null,
        );
        if (waitSeconds !== null)
          setTimeout(
            () => void deliver(actor, creatorId, attempt + 1),
            Math.min(60_000, Math.max(1_000, waitSeconds * 1000 + 500)),
          ).unref();
      } catch {
        /* the Studio's effects run still retries it */
      }
    });
    queued.set(creatorId, run);
    void run.finally(() => {
      if (queued.get(creatorId) === run) queued.delete(creatorId);
    });
    return run;
  };
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
      // C4: the Notes and reactions this fan sees in their thread.
      router.get("/:creatorId/presence", async (req, res) =>
        res.json(
          await presence.read(
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
        const p = ids(req),
          actor = await actorFor(req);
        res.json(await service.react(actor, p.creatorId, p.id, req.body));
        await deliver(actor, p.creatorId);
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
      router.get("/:creatorId/reply-policy", async (req, res) =>
        res.json(
          await service.replyPolicy(
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
      router.post("/:creatorId/studio/scheduled/run", async (req, res) => {
        const actor = await actorFor(req),
          creatorId = z.uuid().parse(req.params.creatorId);
        res.json(await service.runScheduled(actor, creatorId));
        await deliver(actor, creatorId);
      });
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
        const p = ids(req),
          actor = await actorFor(req);
        res.json(await service.publish(actor, p.creatorId, p.id, req.body));
        await deliver(actor, p.creatorId);
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
