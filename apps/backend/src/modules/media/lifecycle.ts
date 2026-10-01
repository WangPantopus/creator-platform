import type { PrivacyHook } from "../trust/contracts.js";
import type { ThreadScope } from "../access/scope.js";
import type { PoolClient } from "pg";
import type { MediaService } from "./service.js";
import type { SessionService } from "../session/service.js";
import { withDeadline } from "./deadline.js";
import {
  validateProviderState,
  validateRecordingDeletion,
} from "../session/provider.js";

type PrivacyInput = Parameters<PrivacyHook["run"]>[0];
/** W8 installs one media-domain task covering both actual stores. A failure in
 * either contribution keeps the parent pending while the other can still drain. */
export function combineMediaPrivacyHooks(input: {
  threadAndCalls: PrivacyHook;
  creatorOwned: PrivacyHook;
}): PrivacyHook {
  if (
    input.threadAndCalls === input.creatorOwned ||
    input.threadAndCalls.domain !== "media" ||
    input.creatorOwned.domain !== "media"
  )
    throw new Error("media_lifecycle_composition_invalid");
  return {
    domain: "media",
    async run(job) {
      const results: Partial<
        Record<keyof typeof input, Awaited<ReturnType<PrivacyHook["run"]>>>
      > = {};
      const failures: unknown[] = [];
      for (const key of ["creatorOwned", "threadAndCalls"] as const) {
        try {
          const result = await input[key].run(job);
          if (
            result.receipt.jobId !== job.jobId ||
            result.receipt.verified !== true
          )
            throw new Error("media_lifecycle_contribution_unconfirmed");
          results[key] = result;
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length)
        throw new AggregateError(failures, "media_lifecycle_incomplete");
      const creator = results.creatorOwned!;
      const thread = results.threadAndCalls!;
      return {
        receipt: {
          jobId: job.jobId,
          verified: true,
          creatorOwned: creator.receipt,
          threadAndCalls: thread.receipt,
        },
        ...(creator.data !== undefined || thread.data !== undefined
          ? {
              data: { creatorOwned: creator.data, threadAndCalls: thread.data },
            }
          : {}),
        retained: [...(creator.retained ?? []), ...(thread.retained ?? [])],
      };
    },
  };
}
/** W8 must verify these family references against the current privacy task; they confer no interactive authority. */
export type MediaLifecycleScope = Pick<
  ThreadScope,
  "threadId" | "creatorId" | "fanId" | "actorAccountId"
>;
type ArchiveAsset = {
  id: string;
  /** Expected digest only; partial uploads have no verified whole-file hash. */
  sha256: string | null;
  mimeType: string;
  storageKind: "input" | "output" | null;
  state: string;
  declaredOrProcessedBytes: number;
  uploadedBytes: number;
  processedSha256: string | null;
  inspectStorageKinds: readonly [
    "input",
    "processed",
    "output",
    "manifest",
    "thumbnail",
  ];
};
type AssetRow = {
  id: string;
  input_sha256: string;
  output_sha256: string | null;
  mime_type: string;
  state: string;
  bytes: number;
  uploaded_bytes: number;
  provenance: Record<string, unknown> | null;
};
const batchSize = 64;
function archiveAsset(asset: AssetRow): ArchiveAsset {
  const delivered =
    asset.provenance?.c2paVerified === true
      ? typeof asset.provenance.fileSha256 === "string"
        ? asset.provenance.fileSha256
        : null
      : asset.output_sha256;
  return {
    id: asset.id,
    sha256: asset.output_sha256
      ? delivered
      : Number(asset.uploaded_bytes) === Number(asset.bytes)
        ? asset.input_sha256
        : null,
    mimeType: asset.mime_type,
    storageKind: asset.output_sha256
      ? "output"
      : Number(asset.uploaded_bytes) > 0
        ? "input"
        : null,
    state: asset.state,
    declaredOrProcessedBytes: Number(asset.bytes),
    uploadedBytes: Number(asset.uploaded_bytes),
    processedSha256: asset.output_sha256,
    // The protected adapter must inspect/archive every actual retained variant;
    // state and expected digest never assert that a deleted/rejected file exists.
    inspectStorageKinds: [
      "input",
      "processed",
      "output",
      "manifest",
      "thumbnail",
    ],
  };
}
function verifiedArchive(archive: {
  archiveReference: string;
  verified: true;
}) {
  if (
    archive?.verified !== true ||
    typeof archive.archiveReference !== "string" ||
    !archive.archiveReference.trim() ||
    archive.archiveReference.length > 2000
  )
    throw new Error("binary_media_export_unconfirmed");
  return archive;
}
export function createMediaPrivacyHook(input: {
  media: MediaService;
  sessions?: SessionService;
  /** Exhaust current-job owned family pages; arrays remain compatible. */
  scopesFor: (
    job: PrivacyInput,
  ) => Promise<
    Iterable<MediaLifecycleScope> | AsyncIterable<MediaLifecycleScope>
  >;
  /** Validate current job/account/family in the transaction, with scoped non-owner RLS.
   * Interactive Database.withThread cannot authorize cleanup after account/thread revocation. */
  withLifecycleScope?: <T>(
    job: PrivacyInput,
    scope: MediaLifecycleScope,
    work: (client: PoolClient) => Promise<T>,
  ) => Promise<T>;
  exportArchive?: (
    job: PrivacyInput,
    assets: ArchiveAsset[],
    /** Archive must include approved session/scheduling/consent/evidence data plus actual eligible binaries. */
    scopes: readonly MediaLifecycleScope[],
  ) => Promise<{ archiveReference: string; verified: true }>;
  /** Consume every page before returning a verified protected archive. Each scope also
   * requires approved session/scheduling/consent/evidence metadata, including scopes with no assets. */
  exportArchiveStream?: (
    job: PrivacyInput,
    pages: AsyncIterable<{
      scope: MediaLifecycleScope;
      assets: ArchiveAsset[];
    }>,
  ) => Promise<{ archiveReference: string; verified: true }>;
  /** W8 supplies approved retention/hold rules and performs authorized metadata/audit cleanup.
   * A media file deletion alone cannot acknowledge an account-data deletion. */
  applyRetention?: (
    job: PrivacyInput,
    scope: MediaLifecycleScope,
  ) => Promise<{
    verified: true;
    retained: NonNullable<Awaited<ReturnType<PrivacyHook["run"]>>["retained"]>;
  }>;
}): PrivacyHook {
  return {
    domain: "media",
    async run(job) {
      const withScope = input.withLifecycleScope;
      if (!withScope) throw new Error("media_lifecycle_authority_unconfigured");
      const transaction = <T>(
        scope: MediaLifecycleScope,
        work: (client: PoolClient) => Promise<T>,
      ) => withScope(job, scope, work);
      const scopes = await input.scopesFor(job);
      if (
        job.kind === "export" &&
        !input.exportArchiveStream &&
        Array.isArray(scopes) &&
        scopes.length > 1000
      )
        throw new Error("media_lifecycle_batch_required");
      const exported: ArchiveAsset[] = [];
      const legacyScopes: MediaLifecycleScope[] = [];
      if (job.kind === "export" && input.exportArchiveStream) {
        let assets = 0;
        let complete = false;
        const pages = async function* () {
          for await (const scope of scopes) {
            let cursor: string | null = null;
            do {
              const rows: AssetRow[] = await transaction(
                scope,
                async (client) =>
                  (
                    await client.query<AssetRow>(
                      "SELECT id,input_sha256,output_sha256,mime_type,state,bytes,uploaded_bytes,provenance FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND state<>'deleted' AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4",
                      [scope.creatorId, scope.fanId, cursor, batchSize],
                    )
                  ).rows,
              );
              assets += rows.length;
              yield { scope, assets: rows.map(archiveAsset) };
              if (rows.length < batchSize) break;
              cursor = rows[rows.length - 1]!.id;
            } while (true);
          }
          complete = true;
        };
        const archive = verifiedArchive(
          await input.exportArchiveStream(job, pages()),
        );
        if (!complete) throw new Error("binary_media_export_incomplete");
        return {
          receipt: {
            jobId: job.jobId,
            assets,
            archiveReference: archive.archiveReference,
            verified: true,
          },
        };
      }
      let assetsDeleted = 0;
      let roomsDeleted = 0;
      const retained: NonNullable<
        Awaited<ReturnType<PrivacyHook["run"]>>["retained"]
      > = [];
      for await (const scope of scopes) {
        if (job.kind === "export") {
          if (legacyScopes.length >= 1000)
            throw new Error("media_lifecycle_batch_required");
          legacyScopes.push(scope);
        }
        if (job.kind === "delete")
          await transaction(scope, async (client) => {
            // Deny the whole family before a bounded cleanup page can fail/retry.
            await client.query(
              "UPDATE creator.media_asset SET state='revoked',version=version+1,delete_pending=true,job_available_at=now() WHERE creator_id=$1 AND fan_id=$2 AND state NOT IN('revoked','deleted')",
              [scope.creatorId, scope.fanId],
            );
            await client.query(
              "UPDATE creator.call_session SET revoked_at=COALESCE(revoked_at,now()),document=(document-'creatorSummaryNote'-'summarySources')||jsonb_build_object('summary',NULL,'summaryState','deleted') WHERE creator_id=$1 AND fan_id=$2",
              [scope.creatorId, scope.fanId],
            );
          });
        if (job.kind === "export") {
          const assets = await transaction(
            scope,
            async (client) =>
              (
                await client.query<AssetRow>(
                  "SELECT id,input_sha256,output_sha256,mime_type,state,bytes,uploaded_bytes,provenance FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND state<>'deleted' ORDER BY id LIMIT 1001",
                  [scope.creatorId, scope.fanId],
                )
              ).rows,
          );
          exported.push(...assets.map(archiveAsset));
          if (exported.length > 1000)
            throw new Error("media_lifecycle_batch_required");
          continue;
        }
        let assetCursor: string | null = null;
        while (true) {
          const assets: Array<{ id: string }> = await transaction(
            scope,
            async (client) => {
              const rows = await client.query<{ id: string }>(
                "SELECT id FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND state<>'deleted' AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4 FOR UPDATE",
                [scope.creatorId, scope.fanId, assetCursor, batchSize],
              );
              await client.query(
                "UPDATE creator.media_asset SET state='revoked',version=version+1,delete_pending=true,job_available_at=now() WHERE creator_id=$1 AND fan_id=$2 AND id=ANY($3::uuid[]) AND state NOT IN('revoked','deleted')",
                [scope.creatorId, scope.fanId, rows.rows.map((row) => row.id)],
              );
              return rows.rows;
            },
          );
          for (const asset of assets) {
            await transaction(scope, async (client) => {
              // Lock current lease/state, not the earlier page's observation. A worker
              // cannot begin new file work between this check and the tombstone.
              const current = (
                await client.query<{
                  state: string;
                  job_lease_until: Date | null;
                }>(
                  "SELECT state,job_lease_until FROM creator.media_asset WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
                  [asset.id, scope.creatorId, scope.fanId],
                )
              ).rows[0];
              if (!current || current.state === "deleted") return;
              if (
                current.state !== "revoked" ||
                (current.job_lease_until &&
                  current.job_lease_until > new Date())
              )
                throw new Error("media_processing_drain_pending");
              await input.media.storage.delete(asset.id);
              await client.query(
                "UPDATE creator.media_asset SET state='deleted',delete_pending=false,manifest_pending=false,provenance=NULL,waveform='[]',job_lease_until=NULL,job_available_at=NULL,failure_code=NULL WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND state='revoked'",
                [asset.id, scope.creatorId, scope.fanId],
              );
            });
            assetsDeleted++;
          }
          if (assets.length < batchSize) break;
          assetCursor = assets[assets.length - 1]!.id;
        }
        await transaction(scope, async (client) => {
          const pending = await client.query(
            "SELECT 1 FROM creator.call_effect WHERE creator_id=$1 AND fan_id=$2 AND completed_at IS NULL AND (lease_until>now() OR failure_code='external_effect_unconfirmed') AND kind IN('ensure_room','sync_recording','generate_summary') LIMIT 1",
            [scope.creatorId, scope.fanId],
          );
          if (pending.rowCount) throw new Error("call_effect_drain_pending");
        });
        let roomCursor: string | null = null;
        while (true) {
          const rooms: Array<{ id: string; room_id: string }> =
            await transaction(
              scope,
              async (client) =>
                (
                  await client.query<{ id: string; room_id: string }>(
                    "SELECT id,room_id FROM creator.call_session WHERE creator_id=$1 AND fan_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4",
                    [scope.creatorId, scope.fanId, roomCursor, batchSize],
                  )
                ).rows,
            );
          for (const room of rooms) {
            if (!input.sessions)
              throw new Error("call_deletion_provider_unconfigured");
            await withDeadline(
              input.sessions.provider.closeRoom(room.room_id),
              5000,
            );
            const deletion = validateRecordingDeletion(
              await withDeadline(
                input.sessions.provider.deleteRecording(
                  room.room_id,
                  `${job.idempotencyKey}:${room.id}`,
                ),
                5000,
              ),
            );
            const truth = validateProviderState(
              await withDeadline(
                input.sessions.provider.state(room.room_id),
                5000,
              ),
            );
            if (!truth.closed || truth.recording)
              throw new Error("call_deletion_unconfirmed");
            await transaction(scope, async (client) => {
              await client.query(
                "SELECT id FROM creator.call_session WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
                [room.id, scope.creatorId, scope.fanId],
              );
              await client.query(
                "INSERT INTO creator.call_event(session_id,creator_id,fan_id,type,payload,actor_account_id) SELECT $1,$2,$3,'privacy_recording_deleted',$4::jsonb,$5 WHERE NOT EXISTS(SELECT 1 FROM creator.call_event WHERE session_id=$1 AND creator_id=$2 AND fan_id=$3 AND type='privacy_recording_deleted' AND payload->>'jobId'=$4::jsonb->>'jobId')",
                [
                  room.id,
                  scope.creatorId,
                  scope.fanId,
                  JSON.stringify({
                    jobId: job.jobId,
                    reference: deletion.reference,
                  }),
                  scope.actorAccountId,
                ],
              );
            });
            roomsDeleted++;
          }
          if (rooms.length < batchSize) break;
          roomCursor = rooms[rooms.length - 1]!.id;
        }
        await transaction(scope, async (client) => {
          const pending = await client.query(
            "SELECT 1 FROM creator.media_asset WHERE creator_id=$1 AND fan_id=$2 AND (state<>'deleted' OR delete_pending OR manifest_pending OR job_lease_until>now()) LIMIT 1",
            [scope.creatorId, scope.fanId],
          );
          if (pending.rowCount)
            throw new Error("media_processing_drain_pending");
        });
        if (!input.applyRetention)
          throw new Error("media_retention_policy_unconfigured");
        const result = await input.applyRetention(job, scope);
        if (result?.verified !== true)
          throw new Error("media_retention_unconfirmed");
        retained.push(...result.retained);
      }
      if (job.kind === "export") {
        if (!input.exportArchive)
          throw new Error("binary_media_export_unconfigured");
        const archive = verifiedArchive(
          await input.exportArchive(job, exported, legacyScopes),
        );
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
