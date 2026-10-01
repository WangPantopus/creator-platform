import type { PoolClient } from "pg";
import type { PrivacyHook } from "../trust/contracts.js";
import type { CreatorMediaService } from "./creator-service.js";
import type { CreatorMediaWorkerScope } from "./creator-worker.js";

type PrivacyInput = Parameters<PrivacyHook["run"]>[0];
export type CreatorArchiveAsset = {
  id: string;
  objectId: string;
  state: string;
  mimeType: string;
  declaredOrProcessedBytes: number;
  uploadedBytes: number;
  declaredInputSha256: string;
  processedSha256: string | null;
  deliveredSha256: string | null;
  /** Enumerate every actually retained variant, including partial uploads. Do not
   * treat an expected digest as the hash of a partial/nonexistent file. */
  inspectStorageKinds: readonly ["input", "processed", "output", "manifest"];
};
type Row = {
  id: string;
  object_id: string;
  state: string;
  mime_type: string;
  bytes: number;
  uploaded_bytes: number;
  input_sha256: string;
  output_sha256: string | null;
  provenance: Record<string, unknown> | null;
};
/** W8 composes this with thread/call lifecycle in ONE media domain task. It is
 * never a replacement for whole-account content/consent/identity/financial export. */
export function createCreatorMediaPrivacyHook(input: {
  media: CreatorMediaService;
  /** Complete owned creator-family enumeration from the current privacy job. */
  scopesFor: (
    job: PrivacyInput,
  ) => Promise<
    Iterable<CreatorMediaWorkerScope> | AsyncIterable<CreatorMediaWorkerScope>
  >;
  /** Current job/task/account/family and scoped non-owner authority, independent of HTTP sessions. */
  transaction: <T>(
    job: PrivacyInput,
    scope: CreatorMediaWorkerScope,
    work: (client: PoolClient) => Promise<T>,
  ) => Promise<T>;
  exportArchive?: (
    job: PrivacyInput,
    pages: AsyncIterable<{
      scope: CreatorMediaWorkerScope;
      assets: CreatorArchiveAsset[];
    }>,
  ) => Promise<{ verified: true; archiveReference: string }>;
  applyRetention?: (
    job: PrivacyInput,
    scope: CreatorMediaWorkerScope,
  ) => Promise<{
    verified: true;
    retained: NonNullable<Awaited<ReturnType<PrivacyHook["run"]>>["retained"]>;
  }>;
}): PrivacyHook {
  return {
    domain: "media",
    async run(job) {
      const scopes = await input.scopesFor(job);
      const transaction = <T>(
        scope: CreatorMediaWorkerScope,
        work: (client: PoolClient) => Promise<T>,
      ) => input.transaction(job, scope, work);
      if (job.kind === "export") {
        if (!input.exportArchive)
          throw new Error("binary_creator_media_export_unconfigured");
        let complete = false;
        let assets = 0;
        const pages = async function* () {
          for await (const scope of scopes) {
            let cursor: string | null = null;
            while (true) {
              const rows: Row[] = await transaction(
                scope,
                async (client) =>
                  (
                    await client.query<Row>(
                      "SELECT id,object_id,state,mime_type,bytes,uploaded_bytes,input_sha256,output_sha256,provenance FROM creator.creator_media_asset WHERE creator_id=$1 AND owner_account_id=$2 AND state<>'deleted' AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 64",
                      [scope.creatorId, scope.ownerAccountId, cursor],
                    )
                  ).rows,
              );
              assets += rows.length;
              yield {
                scope,
                assets: rows.map(
                  (row): CreatorArchiveAsset => ({
                    id: row.id,
                    objectId: row.object_id,
                    state: row.state,
                    mimeType: row.mime_type,
                    declaredOrProcessedBytes: Number(row.bytes),
                    uploadedBytes: Number(row.uploaded_bytes),
                    declaredInputSha256: row.input_sha256,
                    processedSha256: row.output_sha256,
                    deliveredSha256:
                      row.provenance?.c2paVerified === true &&
                      typeof row.provenance.fileSha256 === "string"
                        ? row.provenance.fileSha256
                        : row.output_sha256,
                    inspectStorageKinds: [
                      "input",
                      "processed",
                      "output",
                      "manifest",
                    ],
                  }),
                ),
              };
              if (rows.length < 64) break;
              cursor = rows[rows.length - 1]!.id;
            }
          }
          complete = true;
        };
        const archive = await input.exportArchive(job, pages());
        if (
          !complete ||
          archive?.verified !== true ||
          typeof archive.archiveReference !== "string" ||
          !archive.archiveReference.trim() ||
          archive.archiveReference.length > 2000
        )
          throw new Error("binary_creator_media_export_unconfirmed");
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
      const retained: NonNullable<
        Awaited<ReturnType<PrivacyHook["run"]>>["retained"]
      > = [];
      for await (const scope of scopes) {
        // Invalidate the whole owned family before any bounded page can fail.
        await transaction(scope, async (client) => {
          await client.query(
            "UPDATE creator.creator_media_asset SET state='revoked',version=version+1,access_epoch=access_epoch+1,delete_pending=true,job_available_at=now() WHERE creator_id=$1 AND owner_account_id=$2 AND state NOT IN('revoked','deleted')",
            [scope.creatorId, scope.ownerAccountId],
          );
        });
        let cursor: string | null = null;
        while (true) {
          const rows: Array<{ id: string }> = await transaction(
            scope,
            async (client) =>
              (
                await client.query<{ id: string }>(
                  "SELECT id FROM creator.creator_media_asset WHERE creator_id=$1 AND owner_account_id=$2 AND state<>'deleted' AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 64",
                  [scope.creatorId, scope.ownerAccountId, cursor],
                )
              ).rows,
          );
          for (const row of rows) {
            await transaction(scope, async (client) => {
              const current = (
                await client.query<{
                  state: string;
                  job_lease_until: Date | null;
                }>(
                  "SELECT state,job_lease_until FROM creator.creator_media_asset WHERE id=$1 AND creator_id=$2 AND owner_account_id=$3 FOR UPDATE",
                  [row.id, scope.creatorId, scope.ownerAccountId],
                )
              ).rows[0];
              if (!current || current.state === "deleted") return;
              if (
                current.state !== "revoked" ||
                (current.job_lease_until &&
                  current.job_lease_until > new Date())
              )
                throw new Error("creator_media_processing_drain_pending");
              await input.media.storage.delete(row.id);
              await client.query(
                "UPDATE creator.creator_media_asset SET state='deleted',delete_pending=false,manifest_pending=false,job_lease_until=NULL,job_token=NULL,job_available_at=NULL,provenance=NULL,waveform='[]',failure_code=NULL WHERE id=$1 AND creator_id=$2 AND owner_account_id=$3 AND state='revoked'",
                [row.id, scope.creatorId, scope.ownerAccountId],
              );
            });
            assetsDeleted++;
          }
          if (rows.length < 64) break;
          cursor = rows[rows.length - 1]!.id;
        }
        await transaction(scope, async (client) => {
          const pending = await client.query(
            "SELECT 1 FROM creator.creator_media_asset WHERE creator_id=$1 AND owner_account_id=$2 AND (state<>'deleted' OR delete_pending OR manifest_pending OR job_lease_until>now()) LIMIT 1",
            [scope.creatorId, scope.ownerAccountId],
          );
          if (pending.rowCount)
            throw new Error("creator_media_processing_drain_pending");
        });
        if (!input.applyRetention)
          throw new Error("creator_media_retention_policy_unconfigured");
        const result = await input.applyRetention(job, scope);
        if (result?.verified !== true)
          throw new Error("creator_media_retention_unconfirmed");
        retained.push(...result.retained);
      }
      return {
        retained,
        receipt: { jobId: job.jobId, assetsDeleted, verified: true },
      };
    },
  };
}
