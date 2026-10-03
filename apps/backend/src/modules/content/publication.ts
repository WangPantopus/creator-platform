import type { PoolClient } from "pg";
import { z } from "zod";
import {
  ContentDocument,
  type ContentBody,
} from "../../../../../packages/api/src/content.js";
import {
  ProcessedMediaEvidenceSchema,
  type ProcessedMediaEvidence,
} from "../../../../../packages/api/src/media.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import type {
  PublicationIdentityAuthority,
  PublicationTask,
  PublicationTaskScope,
} from "../identity/publication-scope.js";
import { publicationCommand } from "./service.js";
import type { PublicationMedia } from "../media/publication.js";

/** Structurally matches W6's actual PublicationMedia export. The host supplies
 * that owner implementation using the same W1 issuer; no Actor is constructed.
 */
export type ContentScheduledMedia = PublicationMedia;

export type ContentPublicationDependencies = {
  identity: PublicationIdentityAuthority;
  media?: ContentScheduledMedia;
  /** Current quote consent, packet/group fulfillment eligibility, live state
   * and displayed audience count require their own purpose projections. W1's
   * publication scope alone grants none of those authorities.
   */
  assertPublicationAllowed?: (
    client: PoolClient,
    scope: PublicationTaskScope,
    document: ContentBody,
  ) => Promise<void>;
  /** W4 may atomically fulfill only an actual published public/group answer.
   * It must use its own reviewed purpose grant and this exact held scope.
   */
  publishedPacket?: (
    client: PoolClient,
    scope: PublicationTaskScope,
    document: ContentBody,
  ) => Promise<void>;
};

type PendingIndex = {
  id: string;
  creator_id: string;
  version: number;
  kind: string;
  state: string;
  scheduled_at: Date | null;
  packet_id: string | null;
  audience: unknown;
  due: boolean;
};

/** Complete an already authorized exact publication. The separate W1 issuer
 * holds current publisher/creator/signature/denial authority through commit.
 * This worker neither creates sessions nor signs or substitutes a publisher.
 */
export class ContentPublicationWorker {
  constructor(private readonly dependencies: ContentPublicationDependencies) {}

  async run(task: PublicationTask) {
    let finalMediaRequired = false;
    return this.dependencies.identity.withPublication(
      task,
      async (client, scope) => {
        // Capture only W1's complete original stored command on the actual
        // issued client/PID/full transaction, before W5's object positives.
        await this.dependencies.media?.prepare(client, scope);
        const acquired = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
          [`content:${scope.contentId}`],
        );
        if (!acquired.rows[0]?.acquired) return { state: "busy" as const };
        const row = (
          await client.query<PendingIndex>(
            "SELECT id,creator_id,version,kind,state,scheduled_at,packet_id,audience,scheduled_at IS NULL OR scheduled_at<=now() AS due FROM creator.content_index WHERE id=$1 AND creator_id=$2 AND version=$3 FOR UPDATE",
            [scope.contentId, scope.creatorId, scope.version],
          )
        ).rows[0];
        invariant(
          row && ["media_pending", "scheduled"].includes(row.state),
          "publication_task_changed",
          "The current publication task changed.",
        );
        if (row.state === "scheduled" && !row.due)
          return { state: "scheduled" as const };
        const revision = (
          await client.query<{ document: unknown }>(
            "SELECT document FROM creator.content_revision WHERE content_id=$1 AND creator_id=$2 AND version=$3",
            [scope.contentId, scope.creatorId, scope.version],
          )
        ).rows[0];
        const publication = (
          await client.query<{
            author_account_id: string;
            signed_act_id: string | null;
            media_evidence: unknown;
          }>(
            "SELECT author_account_id,signed_act_id,media_evidence FROM creator.content_publication WHERE content_id=$1 AND creator_id=$2 AND version=$3",
            [scope.contentId, scope.creatorId, scope.version],
          )
        ).rows[0];
        const document = ContentDocument.parse(revision?.document);
        if (document.planRef)
          throw new DomainError(
            "publication_fulfillment_unconfigured",
            "Current fulfillment for this answer is unavailable.",
            503,
          );
        const evidence = z
          .array(ProcessedMediaEvidenceSchema)
          .max(10)
          .parse(publication?.media_evidence);
        invariant(
          publication?.author_account_id === scope.publisherAccountId &&
            publication.signed_act_id === scope.signedActId &&
            document.kind === row.kind &&
            document.packetId === row.packet_id &&
            contentHash(document.audience) === contentHash(row.audience) &&
            (document.scheduledAt === null
              ? row.scheduled_at === null
              : row.scheduled_at?.getTime() ===
                Date.parse(document.scheduledAt)) &&
            contentHash(publicationCommand(row, document, evidence)) ===
              scope.commandHash,
          "publication_command_changed",
          "The exact stored publication command is required.",
        );
        const needsProjection = Boolean(
          document.quote ||
            document.packetId ||
            document.live ||
            document.showAudienceCount,
        );
        if (needsProjection && !this.dependencies.assertPublicationAllowed)
          throw new DomainError(
            "publication_projection_unconfigured",
            "Current publication permissions are not connected.",
            503,
          );
        await this.dependencies.assertPublicationAllowed?.(
          client,
          scope,
          document,
        );
        if (document.packetId && !this.dependencies.publishedPacket)
          throw new DomainError(
            "publication_fulfillment_unconfigured",
            "Current public request fulfillment is not connected.",
            503,
          );
        invariant(
          evidence.length === document.media.length,
          "media_version_changed",
          "The exact stored publication media is required.",
        );
        if (document.media.length) {
          const media = this.dependencies.media;
          if (!media)
            throw new DomainError(
              "publication_media_unconfigured",
              "Current media readiness is not connected.",
              503,
            );
          invariant(
            scope.signedActId,
            "media_signature_required",
            "Media requires its exact signed publication.",
          );
          const current = new Map<string, ProcessedMediaEvidence>();
          for (const attachment of [...document.media].sort((a, b) =>
            a.assetId.localeCompare(b.assetId),
          )) {
            current.set(
              attachment.assetId,
              ProcessedMediaEvidenceSchema.parse(
                await media.evidence(client, scope, attachment),
              ),
            );
          }
          invariant(
            current.size === evidence.length &&
              evidence.every(
                (item) =>
                  current.has(item.assetId) &&
                  contentHash(current.get(item.assetId)) === contentHash(item),
              ),
            "media_version_changed",
            "The publication's processed media changed.",
          );
          for (const item of evidence)
            if (!(await media.ready(client, scope, item)))
              return { state: "media_pending" as const };
          finalMediaRequired = true;
        } else
          invariant(
            row.state !== "media_pending",
            "media_version_changed",
            "The pending media publication has no media.",
          );
        await this.dependencies.identity.authorizeInTransaction(scope, client);
        if (!row.due) {
          await client.query(
            "UPDATE creator.content_index SET state='scheduled' WHERE id=$1 AND creator_id=$2 AND version=$3",
            [scope.contentId, scope.creatorId, scope.version],
          );
          return { state: "scheduled" as const };
        }
        await client.query(
          "UPDATE creator.content_index SET state='published',published_at=now() WHERE id=$1 AND creator_id=$2 AND version=$3",
          [scope.contentId, scope.creatorId, scope.version],
        );
        await client.query(
          "UPDATE creator.content_publication SET published_at=now() WHERE content_id=$1 AND creator_id=$2 AND version=$3",
          [scope.contentId, scope.creatorId, scope.version],
        );
        if (document.packetId)
          await this.dependencies.publishedPacket!(client, scope, document);
        for (const type of document.aiUseIntent
          ? ["published", "source_candidate"]
          : ["published"])
          await client.query(
            "INSERT INTO creator.content_effect(creator_id,content_id,version,type) VALUES($1,$2,$3,$4)",
            [scope.creatorId, scope.contentId, scope.version, type],
          );
        return { state: "published" as const };
      },
      async (client, scope) => {
        if (finalMediaRequired)
          await this.dependencies.media!.finalize(client, scope);
      },
    );
  }

  async runPending(limit = 20) {
    const tasks = await this.dependencies.identity.pendingTasks(limit);
    let published = 0,
      deferred = 0;
    const failures: string[] = [];
    for (const task of tasks) {
      try {
        if ((await this.run(task)).state === "published") published++;
        else deferred++;
      } catch (error) {
        failures.push(
          error instanceof DomainError ? error.code : "publication_unavailable",
        );
      }
    }
    return { published, deferred, failures };
  }
}

/** Serialized sweeps: an outage never overlaps a second publication attempt. */
export function startContentPublicationWorker(
  worker: ContentPublicationWorker,
  onFailure: (code: string) => void,
  intervalMs = 5000,
) {
  const delay = z.number().int().min(1000).max(60000).parse(intervalMs);
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void worker
      .runPending()
      .then((result) => result.failures.forEach(onFailure))
      .catch((error) =>
        onFailure(
          error instanceof DomainError ? error.code : "publication_unavailable",
        ),
      )
      .finally(() => {
        running = false;
      });
  }, delay);
  timer.unref();
  return () => clearInterval(timer);
}
