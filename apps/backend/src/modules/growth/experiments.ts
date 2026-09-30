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
        "Experiments await review.",
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
            "This proposal is unavailable.",
            404,
          );
        if (
          draft.hypothesis !== value.hypothesis ||
          draft.success_criterion !== value.successCriterion ||
          draft.stop_criterion !== value.stopCriterion
        )
          throw new DomainError(
            "experiment_review_changed",
            "Review the current hypothesis and criteria.",
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
            "A stopped or changed experiment needs a new proposal.",
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
    const row = (
      await this.service.db.worker.query(
        "SELECT approved_document FROM growth.experiment WHERE creator_id=$1 AND state='active' AND approved_at IS NOT NULL AND starts_at<=now() AND ends_at>now() AND approved_document->>'surface'=$2 ORDER BY approved_at,id LIMIT 1",
        [creator.id, surface],
      )
    ).rows[0];
    if (!row) return null;
    const approved = ExperimentApproval.parse(row.approved_document);
    const index =
      createHmac("sha256", this.service.privacySubjectKey(actor.accountId))
        .update(approved.id)
        .digest()
        .readUInt32BE(0) % approved.variants.length;
    return { experimentId: approved.id, ...approved.variants[index]! };
  }
  async stop(actor: Actor, id: string) {
    const creatorId = await this.service.requireCreator(actor);
    const result = await this.service.db.worker.query(
      "UPDATE growth.experiment SET state='stopped' WHERE id=$1 AND creator_id=$2 AND state IN ('draft','active') RETURNING id",
      [z.uuid().parse(id), creatorId],
    );
    if (!result.rowCount)
      throw new DomainError(
        "experiment_unavailable",
        "This proposal is unavailable.",
        404,
      );
    return { stopped: true };
  }
}
