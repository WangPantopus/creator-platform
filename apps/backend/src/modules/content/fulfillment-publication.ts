import type { Pool } from "pg";
import { z } from "zod";
import { ContentDocument } from "../../../../../packages/api/src/content.js";
import {
  ProcessedMediaEvidenceSchema,
  type ProcessedMediaEvidence,
} from "../../../../../packages/api/src/media.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { CommerceFulfillmentPublicationWorker } from "../commerce/fulfillment-publication-worker.js";
import type {
  PublicationIdentityAuthority,
  PublicationTask,
} from "../identity/publication-scope.js";
import type { PublicationMedia } from "../media/publication.js";
import { publicationCommand } from "./service.js";

type PendingAnswer = {
  id: string;
  creator_id: string;
  version: number;
  kind: string;
  state: string;
  scheduled_at: Date | null;
  packet_id: string | null;
  audience: unknown;
  published_at: Date | null;
  withdrawn_at: Date | null;
};

export type ContentFulfillmentPublicationConfiguration = Readonly<{
  workerPool: Pool;
  identity: PublicationIdentityAuthority;
  /** Actual approved policy, matching the immutable original plan. No default. */
  minimumRecipients: number;
  media?: PublicationMedia;
}>;

/** Completes only a genuine pending group answer. W1 owns the original task,
 * held client and sole final COMMIT; W4 owns recipients and delivery; W3 owns
 * neutral System output. Preparing this consumer does not activate any purpose
 * or replace the ordinary worker's refusal of non-null planRef documents.
 */
export class ContentFulfillmentPublicationWorker {
  private constructor(
    private readonly identity: PublicationIdentityAuthority,
    private readonly fulfillment: CommerceFulfillmentPublicationWorker,
    private readonly media: PublicationMedia | undefined,
  ) {}

  static async prepare(
    configuration: ContentFulfillmentPublicationConfiguration,
  ) {
    const minimum = z
      .int()
      .min(2)
      .max(100)
      .safeParse(configuration.minimumRecipients);
    if (!minimum.success)
      throw new DomainError(
        "fulfillment_minimum_unconfigured",
        "An approved fulfillment minimum is not configured.",
        503,
      );
    const fulfillment = await CommerceFulfillmentPublicationWorker.prepare({
      workerPool: configuration.workerPool,
      identity: configuration.identity,
      minimumRecipients: minimum.data,
    });
    return new ContentFulfillmentPublicationWorker(
      configuration.identity,
      fulfillment,
      configuration.media,
    );
  }

  async run(task: PublicationTask) {
    return this.identity.withPublication(
      task,
      async (client, scope) => {
        // The actual original sorted thread/packet/commitment leases precede
        // every W5 object positive. IDs supplied by a caller grant no delivery.
        const recipients = await this.fulfillment.recipients(client, scope);
        const original = await this.identity.originalInTransaction(
          scope,
          client,
        );
        invariant(
          recipients && original.document.planRef && scope.signedActId,
          "fulfillment_publication_original_required",
          "The actual signed original fulfillment plan is required.",
        );
        if (
          original.document.aiUseIntent ||
          original.document.showAudienceCount
        )
          throw new DomainError(
            "publication_projection_unconfigured",
            "Current publication permissions are not connected.",
            503,
          );
        // A planned answer cannot be scheduled or carry a quote/live session.
        // Its schema checks the exact public or single matched-group audience.
        if (!original.document.media.length || !this.media)
          throw new DomainError(
            "publication_media_unconfigured",
            "Current media readiness is not connected.",
            503,
          );
        const media = this.media;
        await media.prepare(client, scope);
        const acquired = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
          [`content:${scope.contentId}`],
        );
        if (acquired.rows[0]?.acquired !== true)
          throw new DomainError(
            "publication_busy",
            "This publication is busy. Try again later.",
            503,
          );
        const row = (
          await client.query<PendingAnswer>(
            "SELECT id,creator_id,version,kind,state,scheduled_at,packet_id,audience,published_at,withdrawn_at FROM creator.content_index WHERE id=$1 AND creator_id=$2 AND version=$3 FOR UPDATE NOWAIT",
            [scope.contentId, scope.creatorId, scope.version],
          )
        ).rows[0];
        invariant(
          row?.state === "media_pending" &&
            row.published_at === null &&
            row.withdrawn_at === null,
          "publication_task_changed",
          "The current publication task changed.",
        );
        const revision = (
          await client.query<{ document: unknown }>(
            "SELECT document FROM creator.content_revision WHERE content_id=$1 AND creator_id=$2 AND version=$3",
            [scope.contentId, scope.creatorId, scope.version],
          )
        ).rows[0];
        const publication = (
          await client.query<{
            author_account_id: string;
            author_kind: string;
            signed_act_id: string | null;
            media_evidence: unknown;
            published_at: Date | null;
          }>(
            "SELECT author_account_id,author_kind,signed_act_id,media_evidence,published_at FROM creator.content_publication WHERE content_id=$1 AND creator_id=$2 AND version=$3",
            [scope.contentId, scope.creatorId, scope.version],
          )
        ).rows[0];
        const document = ContentDocument.parse(revision?.document);
        const evidence = z
          .array(ProcessedMediaEvidenceSchema)
          .max(10)
          .parse(publication?.media_evidence);
        invariant(
          publication?.author_account_id === scope.publisherAccountId &&
            publication.author_kind === "human_creator" &&
            publication.signed_act_id === scope.signedActId &&
            publication.published_at === null &&
            document.kind === row.kind &&
            document.packetId === row.packet_id &&
            row.scheduled_at === null &&
            document.scheduledAt === null &&
            contentHash(document.audience) === contentHash(row.audience) &&
            contentHash(document) === contentHash(original.document) &&
            contentHash(evidence) === contentHash(original.mediaEvidence) &&
            contentHash(publicationCommand(row, document, evidence)) ===
              scope.commandHash,
          "publication_command_changed",
          "The exact stored original publication command is required.",
        );
        const current = new Map<string, ProcessedMediaEvidence>();
        for (const attachment of [...document.media].sort((a, b) =>
          a.assetId.localeCompare(b.assetId),
        ))
          current.set(
            attachment.assetId,
            ProcessedMediaEvidenceSchema.parse(
              await media.evidence(client, scope, attachment),
            ),
          );
        invariant(
          evidence.length === document.media.length &&
            current.size === evidence.length &&
            evidence.every(
              (item) =>
                current.has(item.assetId) &&
                contentHash(current.get(item.assetId)) === contentHash(item),
            ),
          "media_version_changed",
          "The complete original processed media is required.",
        );
        for (const item of [...evidence].sort((a, b) =>
          a.assetId.localeCompare(b.assetId),
        ))
          if (!(await media.ready(client, scope, item)))
            throw new DomainError(
              "publication_media_pending",
              "The actual publication media is not ready. Try again later.",
              503,
            );
        await this.identity.authorizeInTransaction(scope, client);
        const published = await client.query(
          "UPDATE creator.content_index SET state='published',published_at=now() WHERE id=$1 AND creator_id=$2 AND version=$3 AND state='media_pending' AND published_at IS NULL AND withdrawn_at IS NULL AND scheduled_at IS NULL",
          [scope.contentId, scope.creatorId, scope.version],
        );
        const recorded = await client.query(
          "UPDATE creator.content_publication SET published_at=now() WHERE content_id=$1 AND creator_id=$2 AND version=$3 AND author_account_id=$4 AND signed_act_id=$5 AND published_at IS NULL",
          [
            scope.contentId,
            scope.creatorId,
            scope.version,
            scope.publisherAccountId,
            scope.signedActId,
          ],
        );
        invariant(
          published.rowCount === 1 && recorded.rowCount === 1,
          "publication_task_changed",
          "The original pending publication changed.",
        );
        await client.query(
          "INSERT INTO creator.content_effect(creator_id,content_id,version,type) VALUES($1,$2,$3,'published')",
          [scope.creatorId, scope.contentId, scope.version],
        );
        for (const recipient of recipients) {
          const output = await this.fulfillment.recipientLink(
            client,
            scope,
            recipient,
          );
          await this.fulfillment.recordDelivery(
            client,
            scope,
            recipient,
            output,
          );
        }
        // Visible success is returned only after W1's actual COMMIT settles.
        return {
          state: "published" as const,
          contentId: scope.contentId,
          version: scope.version,
        };
      },
      async (client, scope) => {
        await this.media!.finalize(client, scope);
        await this.fulfillment.finalFence(client, scope);
        // W1 retains its LAST genuine signature gate and sole COMMIT. No owner
        // callback or SQL is submitted by this consumer after that finalizer.
      },
    );
  }
}
