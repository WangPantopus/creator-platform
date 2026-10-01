import { copy } from "@qelvora/copy";
import { createHmac } from "node:crypto";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError } from "../../core/errors.js";
import type { GrowthService } from "./service.js";

export const ExperimentApproval = z
  .strictObject({
    id: z.uuid(),
    creatorId: z.uuid(),
    reference: z.string().trim().min(1).max(160),
    hypothesis: z.string().trim().min(12).max(800),
    successCriterion: z.string().trim().min(12).max(800),
    stopCriterion: z.string().trim().min(12).max(800),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    surface: z.enum(["creator_landing", "onboarding_message"]),
    variants: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[a-z0-9_-]{1,40}$/u),
          heading: z.string().trim().min(1).max(100),
          introduction: z.string().trim().min(1).max(400),
        }),
      )
      .min(2)
      .max(4),
  })
  .refine(
    (v) =>
      Date.parse(v.endsAt) > Date.parse(v.startsAt) &&
      new Set(v.variants.map((x) => x.id)).size === v.variants.length,
  );

/** Only a reviewed host adapter can approve. There is deliberately no activation HTTP endpoint. */
export class GrowthExperiments {
  constructor(
    private readonly service: GrowthService,
    private readonly enabled = false,
  ) {}
  async approve(input: unknown) {
    if (!this.enabled)
      throw new DomainError(
        "experiments_disabled",
        copy.growthErrorExperimentsDisabled,
        503,
      );
    const value = ExperimentApproval.parse(input);
    await this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        const draft = (
          await client.query(
            "SELECT * FROM growth.experiment WHERE id=$1 AND creator_id=$2 FOR UPDATE",
            [value.id, value.creatorId],
          )
        ).rows[0];
        if (!draft)
          throw new DomainError(
            "experiment_unavailable",
            copy.growthErrorExperimentUnavailable,
            404,
          );
        if (
          draft.hypothesis !== value.hypothesis ||
          draft.success_criterion !== value.successCriterion ||
          draft.stop_criterion !== value.stopCriterion
        )
          throw new DomainError(
            "experiment_review_changed",
            copy.growthErrorExperimentReviewChanged,
            409,
          );
        if (
          draft.state === "active" &&
          contentHash(draft.approved_document) === contentHash(value)
        )
          return;
        if (draft.state !== "draft")
          throw new DomainError(
            "experiment_review_changed",
            copy.growthErrorExperimentReviewChanged2,
            409,
          );
        await client.query(
          "UPDATE growth.experiment SET state='active',approved_at=now(),approval_reference=$3,approved_document=$4,starts_at=$5,ends_at=$6 WHERE id=$1 AND creator_id=$2",
          [
            value.id,
            value.creatorId,
            value.reference,
            value,
            value.startsAt,
            value.endsAt,
          ],
        );
      },
    );
    return { approved: true };
  }
  async variant(
    actor: Actor,
    handle: string,
    surface: "creator_landing" | "onboarding_message",
  ) {
    if (!this.enabled) return null;
    const creator = await this.service.creator(handle);
    if (!creator || creator.state !== "published") return null;
    return this.service.db.workerActor(actor, creator.id, async (client) => {
      // Hold the current account/session and erasure boundary through allocation.
      // Recheck the public creator after acquiring it; the earlier lookup can
      // become stale while waiting for a purge or publication transition.
      const row = (
        await client.query(
          "SELECT e.approved_document FROM growth.experiment e JOIN growth.creator_public c ON c.id=e.creator_id WHERE e.creator_id=$1 AND c.handle=$3 AND c.state='published' AND c.document->>'verified'='true' AND e.state='active' AND e.approved_at IS NOT NULL AND e.starts_at<=clock_timestamp() AND e.ends_at>clock_timestamp() AND e.approved_document->>'surface'=$2 ORDER BY e.approved_at,e.id LIMIT 1 FOR SHARE OF e,c",
          [creator.id, surface, handle],
        )
      ).rows[0];
      if (!row) return null;
      const approved = ExperimentApproval.parse(row.approved_document);
      const now = Date.now();
      if (
        approved.creatorId !== creator.id ||
        approved.surface !== surface ||
        Date.parse(approved.startsAt) > now ||
        Date.parse(approved.endsAt) <= now
      )
        return null;
      const index =
        createHmac("sha256", this.service.privacySubjectKey(actor.accountId))
          .update(approved.id)
          .digest()
          .readUInt32BE(0) % approved.variants.length;
      return { experimentId: approved.id, ...approved.variants[index]! };
    });
  }
  async stop(actor: Actor, id: string) {
    const creatorId = await this.service.requireCreator(actor);
    const result = await this.service.db.workerActor(
      actor,
      creatorId,
      (client) =>
        client.query(
          "UPDATE growth.experiment SET state='stopped' WHERE id=$1 AND creator_id=$2 AND state IN ('draft','active') RETURNING id",
          [z.uuid().parse(id), creatorId],
        ),
    );
    if (!result.rowCount)
      throw new DomainError(
        "experiment_unavailable",
        copy.growthErrorExperimentUnavailable,
        404,
      );
    return { stopped: true };
  }
}
