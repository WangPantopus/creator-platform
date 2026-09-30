import type { PrivacyHook } from "../trust/contracts.js";
import type { ThreadScope } from "../access/scope.js";
import type { MediaService } from "./service.js";
import type { SessionService } from "../session/service.js";
import { withDeadline } from "./deadline.js";
import { validateProviderState } from "../session/provider.js";

type PrivacyInput = Parameters<PrivacyHook["run"]>[0];
export function createMediaPrivacyHook(input: {
  media: MediaService;
  sessions?: SessionService;
  scopesFor: (job: PrivacyInput) => Promise<ThreadScope[]>;
  exportArchive?: (
    job: PrivacyInput,
    assets: Array<{ id: string; sha256: string; mimeType: string }>,
    /** Archive must include approved session/scheduling/consent/evidence data plus actual eligible binaries. */
    scopes: readonly ThreadScope[],
  ) => Promise<{ archiveReference: string; verified: true }>;
  /** W8 supplies approved retention/hold rules and performs authorized metadata/audit cleanup.
   * A media file deletion alone cannot acknowledge an account-data deletion. */
  applyRetention?: (
    job: PrivacyInput,
    scope: ThreadScope,
  ) => Promise<{
    verified: true;
    retained: NonNullable<Awaited<ReturnType<PrivacyHook["run"]>>["retained"]>;
  }>;
}): PrivacyHook {
  return {
    domain: "media",
    async run(job) {
      const scopes = await input.scopesFor(job);
      if (scopes.length > 1000)
        throw new Error("media_lifecycle_batch_required");
      const exported: Array<{ id: string; sha256: string; mimeType: string }> =
        [];
      let assetsDeleted = 0;
      let roomsDeleted = 0;
      const retained: NonNullable<
        Awaited<ReturnType<PrivacyHook["run"]>>["retained"]
      > = [];
      for (const scope of scopes) {
        const assets = await input.media.db.withThread(
          scope,
          async (client) => {
            const rows = await client.query<{
              id: string;
              output_sha256: string;
              mime_type: string;
              job_lease_until: Date | null;
            }>(
              "SELECT id,output_sha256,mime_type,job_lease_until FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND state<>'deleted' ORDER BY id LIMIT 1001",
              [scope.creatorId, scope.fanId],
            );
            if (rows.rows.length > 1000)
              throw new Error("media_lifecycle_batch_required");
            if (job.kind === "delete") {
              await client.query(
                "UPDATE creator.media_asset SET state='revoked',version=version+1,delete_pending=true,job_available_at=now() WHERE creator_id=$1 AND fan_id=$2 AND state NOT IN('revoked','deleted')",
                [scope.creatorId, scope.fanId],
              );
              await client.query(
                "UPDATE creator.call_session SET revoked_at=COALESCE(revoked_at,now()),document=(document-'creatorSummaryNote'-'summarySources')||jsonb_build_object('summary',NULL,'summaryState','deleted') WHERE creator_id=$1 AND fan_id=$2",
                [scope.creatorId, scope.fanId],
              );
            }
            return rows.rows;
          },
        );
        if (job.kind === "export") {
          exported.push(
            ...assets.map((asset) => ({
              id: asset.id,
              sha256: asset.output_sha256,
              mimeType: asset.mime_type,
            })),
          );
          if (exported.length > 1000)
            throw new Error("media_lifecycle_batch_required");
          continue;
        }
        for (const asset of assets) {
          // Retry after active parsing/egress ends; no premature deletion acknowledgment.
          if (asset.job_lease_until && asset.job_lease_until > new Date())
            throw new Error("media_processing_drain_pending");
          await input.media.storage.delete(asset.id);
          await input.media.db.withThread(scope, async (client) => {
            await client.query(
              "UPDATE creator.media_asset SET state='deleted',delete_pending=false,provenance=NULL,waveform='[]' WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state='revoked'",
              [asset.id, scope.creatorId, scope.fanId],
            );
          });
          assetsDeleted++;
        }
        const rooms = await input.media.db.withThread(scope, async (client) => {
          // Immediate token denial precedes any provider effect.
          await client.query(
            "UPDATE creator.call_session SET revoked_at=COALESCE(revoked_at,now()) WHERE creator_id=$1 AND fan_id=$2",
            [scope.creatorId, scope.fanId],
          );
          const pending = await client.query(
            "SELECT 1 FROM creator.call_effect WHERE creator_id=$1 AND fan_id=$2 AND completed_at IS NULL AND (lease_until>now() OR failure_code='external_effect_unconfirmed') AND kind IN('ensure_room','sync_recording','generate_summary') LIMIT 1",
            [scope.creatorId, scope.fanId],
          );
          if (pending.rowCount) throw new Error("call_effect_drain_pending");
          return (
            await client.query<{ id: string; room_id: string }>(
              "SELECT id,room_id FROM creator.call_session WHERE creator_id=$1 AND fan_id=$2 ORDER BY id LIMIT 1001",
              [scope.creatorId, scope.fanId],
            )
          ).rows;
        });
        if (rooms.length > 1000)
          throw new Error("media_lifecycle_batch_required");
        for (const room of rooms) {
          if (!input.sessions)
            throw new Error("call_deletion_provider_unconfigured");
          await withDeadline(
            input.sessions.provider.closeRoom(room.room_id),
            5000,
          );
          await withDeadline(
            input.sessions.provider.deleteRecording(
              room.room_id,
              `${job.idempotencyKey}:${room.id}`,
            ),
            5000,
          );
          const truth = validateProviderState(
            await withDeadline(
              input.sessions.provider.state(room.room_id),
              5000,
            ),
          );
          if (!truth.closed || truth.recording)
            throw new Error("call_deletion_unconfirmed");
          roomsDeleted++;
        }
        if (!input.applyRetention)
          throw new Error("media_retention_policy_unconfigured");
        const result = await input.applyRetention(job, scope);
        if (!result.verified) throw new Error("media_retention_unconfirmed");
        retained.push(...result.retained);
      }
      if (job.kind === "export") {
        if (!input.exportArchive)
          throw new Error("binary_media_export_unconfigured");
        const archive = await input.exportArchive(job, exported, scopes);
        return {
          receipt: {
            jobId: job.jobId,
            assets: exported.length,
            archiveReference: archive.archiveReference,
            verified: archive.verified,
          },
        };
      }
      return {
        retained,
        receipt: {
          jobId: job.jobId,
          assetsDeleted,
          roomsDeleted,
          verified: true,
        },
      };
    },
  };
}
