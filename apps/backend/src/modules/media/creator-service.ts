import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { SignedActCommand } from "@qelvora/api";
import {
  CreatorMediaAssetSchema,
  CreatorMediaUploadRequestSchema,
  CreatorMediaPolicyViewSchema,
  ProcessedMediaEvidenceSchema,
  PlaybackFileSchema,
  type CreatorMediaAsset,
  type CreatorMediaPurpose,
  type MediaPolicy,
  type ProcessedMediaEvidence,
  type PlaybackFile,
} from "../../../../../packages/api/src/media.js";
import type {
  CreatorIdentityAuthority,
  CreatorScope,
} from "../identity/creator-scope.js";
import type {
  AudienceIdentityAuthority,
  AudienceScope,
} from "../identity/audience-scope.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import { invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { contentHash } from "../../core/canonical.js";
import {
  CreatorMediaTickets,
  CreatorMediaPublicationBindingSchema,
  PrivateMediaStorage,
  type CreatorMediaPublicationBinding,
} from "./storage.js";
import { announceMediaJob } from "./jobs.js";

export type CreatorMediaReadScope = CreatorScope | ThreadScope | AudienceScope;
export interface CreatorMediaAuthority {
  /** W5/W2 validate the real object, current purpose/audience/consent and approved limits. */
  policy(
    scope: CreatorMediaReadScope,
    objectId: string,
    purpose: CreatorMediaPurpose,
    operation: "upload" | "read",
    client: PoolClient,
  ): Promise<MediaPolicy | null>;
  denied(scope: CreatorMediaReadScope, client: PoolClient): Promise<boolean>;
  /** Owners must still have current object/purpose authority. For audience reads,
   * W5 requires this exact asset/version/SHA in the current published revision,
   * genuine publication binding and current audience grants in this same client.
   * Retain current object/grant row locks through commit, before W6 asset locks. */
  currentAssetRead(
    scope: CreatorMediaReadScope,
    objectId: string,
    asset: CreatorMediaAsset,
    client: PoolClient,
  ): Promise<boolean>;
  /** W5 returns the exact current published revision/act under the same object
   * lock after checking this asset and audience. Required for audience tickets;
   * this read authority does not grant Team an owner scope or mutation access. */
  currentPublication?(
    scope: CreatorMediaReadScope,
    objectId: string,
    asset: CreatorMediaAsset,
    client: PoolClient,
  ): Promise<CreatorMediaPublicationBinding | null>;
}
export type CreatorAssetRow = {
  id: string;
  creator_id: string;
  object_id: string;
  owner_account_id: string;
  purpose: CreatorMediaPurpose;
  state: CreatorMediaAsset["state"];
  version: number;
  access_epoch: number;
  mime_type: string;
  bytes: number;
  uploaded_bytes: number;
  duration_ms: number | null;
  input_sha256: string;
  output_sha256: string | null;
  waveform: number[];
  signed_act_id: string | null;
  expires_at: Date;
  failure_code: string | null;
  provenance: CreatorMediaAsset["provenance"];
  max_duration_ms: number;
  max_bytes: number;
};
export function creatorAssetView(row: CreatorAssetRow): CreatorMediaAsset {
  return CreatorMediaAssetSchema.parse({
    id: row.id,
    creatorId: row.creator_id,
    objectId: row.object_id,
    ownerAccountId: row.owner_account_id,
    purpose: row.purpose,
    state: row.state,
    version: row.version,
    mimeType: row.mime_type,
    bytes: Number(row.bytes),
    uploadedBytes: Number(row.uploaded_bytes),
    durationMs: row.duration_ms,
    sha256: row.output_sha256 ?? row.input_sha256,
    waveform: row.waveform,
    signedActId: row.signed_act_id,
    expiresAt: row.expires_at.toISOString(),
    failureCode: row.failure_code,
    provenance: row.provenance,
  });
}
function creatorJob(row: CreatorAssetRow) {
  return {
    kind: "creator" as const,
    assetId: row.id,
    creatorId: row.creator_id,
    ownerAccountId: row.owner_account_id,
  };
}
function isAudience(scope: CreatorMediaReadScope): scope is AudienceScope {
  return "kind" in scope && scope.kind === "audience";
}
function account(scope: CreatorMediaReadScope) {
  return "accountId" in scope ? scope.accountId : scope.actorAccountId;
}
function verifiedProvenance(row: CreatorAssetRow) {
  const provenance = row.provenance;
  return Boolean(
    row.signed_act_id &&
      provenance?.c2paVerified === true &&
      provenance.assetId === row.id &&
      provenance.assetVersion === row.version &&
      provenance.creatorId === row.creator_id &&
      provenance.objectId === row.object_id &&
      provenance.accountId === row.owner_account_id &&
      provenance.signedActId === row.signed_act_id &&
      provenance.processedMediaSha256 === row.output_sha256 &&
      provenance.processedMediaBytes === Number(row.bytes) &&
      provenance.processedMediaMimeType === row.mime_type &&
      provenance.processedMediaDurationMs === row.duration_ms &&
      typeof provenance.fileSha256 === "string" &&
      /^[a-f0-9]{64}$/u.test(provenance.fileSha256) &&
      typeof provenance.fileBytes === "number" &&
      Number.isSafeInteger(provenance.fileBytes) &&
      provenance.fileBytes > 0 &&
      provenance.fileVariant === "credentialed" &&
      provenance.fileBytes <= Number(row.max_bytes),
  );
}
function playbackFile(row: CreatorAssetRow): PlaybackFile {
  if (row.provenance?.c2paVerified === true) {
    invariant(
      verifiedProvenance(row),
      "media_provenance_pending",
      "This media's exact content credentials are unavailable.",
    );
    return PlaybackFileSchema.parse({
      variant: "credentialed",
      sha256: row.provenance.fileSha256,
      bytes: row.provenance.fileBytes,
    });
  }
  return PlaybackFileSchema.parse({
    variant: "processed",
    sha256: row.output_sha256,
    bytes: Number(row.bytes),
  });
}
export class CreatorMediaService {
  readonly chunkBytes = 1024 * 1024;
  constructor(
    readonly identity: CreatorIdentityAuthority,
    readonly db: Database,
    readonly storage: PrivateMediaStorage,
    readonly tickets: CreatorMediaTickets,
    private readonly authority: CreatorMediaAuthority,
    readonly audienceIdentity?: AudienceIdentityAuthority,
  ) {}
  transaction<T>(
    scope: CreatorMediaReadScope,
    work: (client: PoolClient) => Promise<T>,
  ) {
    if ("accountId" in scope) return this.identity.withCreator(scope, work);
    if (isAudience(scope)) {
      invariant(
        this.audienceIdentity,
        "media_audience_unconfigured",
        "Content playback is awaiting its current audience authority.",
      );
      return this.audienceIdentity.withAudience(scope, work);
    }
    invariant(
      scope.authority !== "triage",
      "media_participant_required",
      "This media is unavailable.",
    );
    return this.db.withThread(scope, work);
  }
  private async allowed(scope: CreatorMediaReadScope, client: PoolClient) {
    invariant(
      (await this.authority.denied(scope, client)) === false,
      "media_revoked",
      "This media is no longer available.",
    );
  }
  async row(
    scope: CreatorMediaReadScope,
    client: PoolClient,
    id: string,
    lock = false,
  ): Promise<CreatorAssetRow> {
    await this.allowed(scope, client);
    const row = (
      await client.query<CreatorAssetRow>(
        "SELECT * FROM creator.creator_media_asset WHERE id=$1 AND creator_id=$2",
        [id, scope.creatorId],
      )
    ).rows[0];
    invariant(
      row &&
        !["revoked", "deleted"].includes(row.state) &&
        row.expires_at > new Date(),
      "media_unavailable",
      "This media is unavailable.",
    );
    invariant(
      await this.authority.policy(
        scope,
        row.object_id,
        row.purpose,
        "read",
        client,
      ),
      "media_access_denied",
      "This media is unavailable.",
    );
    invariant(
      (await this.authority.currentAssetRead(
        scope,
        row.object_id,
        creatorAssetView(row),
        client,
      )) === true,
      "media_access_denied",
      "This exact media is no longer available in the current content.",
    );
    if (!lock) return row;
    // W5/W2 object/current-role locks precede asset locks. Reconcile a racing
    // processor/revocation after acquiring the asset lock; never apply an earlier read.
    const current = (
      await client.query<CreatorAssetRow>(
        "SELECT * FROM creator.creator_media_asset WHERE id=$1 AND creator_id=$2 FOR UPDATE",
        [id, scope.creatorId],
      )
    ).rows[0];
    invariant(
      current &&
        contentHash(creatorAssetView(current)) ===
          contentHash(creatorAssetView(row)),
      "media_version_changed",
      "This media changed. Refresh before continuing.",
    );
    return current;
  }
  private async configuredUploadPolicy(
    scope: CreatorScope,
    client: PoolClient,
    objectId: string,
    purpose: CreatorMediaPurpose,
  ): Promise<MediaPolicy> {
    await this.allowed(scope, client);
    const policy = await this.authority.policy(
      scope,
      objectId,
      purpose,
      "upload",
      client,
    );
    invariant(
      policy &&
        Number.isSafeInteger(policy.maxBytes) &&
        policy.maxBytes > 0 &&
        policy.maxBytes <= 268435456 &&
        Number.isSafeInteger(policy.maxDurationMs) &&
        policy.maxDurationMs >= 0 &&
        (purpose === "post_photo" || policy.maxDurationMs > 0) &&
        policy.maxDurationMs <= 3600000 &&
        Number.isSafeInteger(policy.retentionSeconds) &&
        policy.retentionSeconds > 0 &&
        typeof policy.allowTranscript === "boolean",
      "media_policy_unavailable",
      "The content's media policy is unavailable.",
    );
    return {
      ...policy,
      maxDurationMs:
        purpose === "human_note"
          ? Math.min(60000, policy.maxDurationMs)
          : policy.maxDurationMs,
    };
  }
  /** Resolve real current saved-object policy without creating an upload. */
  async uploadPolicy(scope: CreatorScope, input: unknown) {
    const body = CreatorMediaUploadRequestSchema.pick({
      objectId: true,
      purpose: true,
    }).parse(input);
    return this.transaction(scope, async (client) => {
      await this.identity.authorizeInTransaction(
        scope,
        client,
        ["human_note", "post_audio"].includes(body.purpose)
          ? "verified"
          : "owned",
      );
      const policy = await this.configuredUploadPolicy(
        scope,
        client,
        body.objectId,
        body.purpose,
      );
      return CreatorMediaPolicyViewSchema.parse({
        creatorId: scope.creatorId,
        objectId: body.objectId,
        purpose: body.purpose,
        maxBytes: policy.maxBytes,
        maxDurationMs: policy.maxDurationMs,
      });
    });
  }
  async begin(scope: CreatorScope, input: unknown) {
    const body = CreatorMediaUploadRequestSchema.parse(input);
    return this.transaction(scope, async (client) => {
      await this.identity.authorizeInTransaction(
        scope,
        client,
        ["human_note", "post_audio"].includes(body.purpose)
          ? "verified"
          : "owned",
      );
      const policy = await this.configuredUploadPolicy(
        scope,
        client,
        body.objectId,
        body.purpose,
      );
      const maxDuration = policy.maxDurationMs;
      const audio = body.mimeType.startsWith("audio/");
      invariant(
        (body.purpose === "post_photo"
          ? body.mimeType.startsWith("image/")
          : audio) &&
          (audio ? body.durationMs : body.durationMs === undefined) &&
          body.bytes <= policy.maxBytes &&
          (!body.durationMs || body.durationMs <= maxDuration),
        "media_limit_exceeded",
        "Choose a supported file within this content's limit.",
      );
      const asset = await idempotent(
        client,
        { actorAccountId: scope.accountId, threadId: null },
        "media.creator.begin",
        body.idempotencyKey,
        { creatorId: scope.creatorId, ...body },
        async () => {
          const row = (
            await client.query<CreatorAssetRow>(
              "INSERT INTO creator.creator_media_asset(id,creator_id,object_id,owner_account_id,purpose,state,mime_type,bytes,input_sha256,duration_ms,max_duration_ms,max_bytes,expires_at) VALUES($1,$2,$3,$4,$5,'uploading',$6,$7,$8,$9,$10,$11,now()+make_interval(secs=>$12)) RETURNING *",
              [
                randomUUID(),
                scope.creatorId,
                body.objectId,
                scope.accountId,
                body.purpose,
                body.mimeType,
                body.bytes,
                body.sha256,
                body.durationMs ?? null,
                maxDuration,
                policy.maxBytes,
                policy.retentionSeconds,
              ],
            )
          ).rows[0]!;
          return creatorAssetView(row);
        },
      );
      const currentRow = await this.row(scope, client, asset.id);
      const current = creatorAssetView(currentRow);
      return {
        asset: current,
        chunkBytes: this.chunkBytes,
        ...this.tickets.issue({
          assetId: asset.id,
          objectId: current.objectId,
          creatorId: scope.creatorId,
          accountId: scope.accountId,
          operation: "upload",
          version: current.version,
          accessEpoch: currentRow.access_epoch,
        }),
      };
    });
  }
  async read(scope: CreatorMediaReadScope, id: string) {
    return this.transaction(scope, async (client) => {
      const row = await this.row(scope, client, id);
      // Repeat a wakeup lost during an ingestion restart; the lease dedupes.
      const pending = await client.query(
        "SELECT 1 FROM creator.creator_media_asset WHERE id=$1 AND creator_id=$2 AND job_available_at<=now() AND (job_lease_until IS NULL OR job_lease_until<now()) AND (state IN('quarantined','processing') OR manifest_pending OR delete_pending)",
        [row.id, row.creator_id],
      );
      if (pending.rowCount) await announceMediaJob(client, creatorJob(row));
      return creatorAssetView(row);
    });
  }
  async resume(scope: CreatorScope, id: string) {
    return this.transaction(scope, async (client) => {
      const row = await this.row(scope, client, id);
      invariant(
        row.owner_account_id === scope.accountId && row.state === "uploading",
        "upload_unavailable",
        "This upload cannot be resumed.",
      );
      return {
        asset: creatorAssetView(row),
        chunkBytes: this.chunkBytes,
        ...this.tickets.issue({
          assetId: id,
          objectId: row.object_id,
          creatorId: scope.creatorId,
          accountId: scope.accountId,
          operation: "upload",
          version: row.version,
          accessEpoch: row.access_epoch,
        }),
      };
    });
  }
  async chunk(
    scope: CreatorScope,
    id: string,
    token: string,
    offset: number,
    bytes: Buffer,
  ) {
    const ticket = this.tickets.verify(token, scope, id, "upload");
    invariant(
      Number.isSafeInteger(offset) &&
        offset >= 0 &&
        bytes.length > 0 &&
        bytes.length <= this.chunkBytes,
      "chunk_invalid",
      "The upload chunk is invalid.",
    );
    return this.transaction(scope, async (client) => {
      const row = await this.row(scope, client, id, true);
      invariant(
        row.owner_account_id === scope.accountId &&
          row.object_id === ticket.objectId &&
          row.version === ticket.version &&
          row.access_epoch === ticket.accessEpoch &&
          row.state === "uploading",
        "upload_unavailable",
        "This upload is unavailable.",
      );
      invariant(
        offset === Number(row.uploaded_bytes),
        "upload_offset_conflict",
        "Refresh the upload position before retrying.",
      );
      invariant(
        offset + bytes.length <= Number(row.bytes),
        "upload_size_invalid",
        "The file is larger than declared.",
      );
      await this.storage.putChunk(id, offset, bytes);
      const updated = await client.query<CreatorAssetRow>(
        "UPDATE creator.creator_media_asset SET uploaded_bytes=$3 WHERE id=$1 AND creator_id=$2 RETURNING *",
        [id, scope.creatorId, offset + bytes.length],
      );
      return creatorAssetView(updated.rows[0]!);
    });
  }
  async finish(scope: CreatorScope, id: string) {
    return this.transaction(scope, async (client) => {
      const row = await this.row(scope, client, id, true);
      invariant(
        row.owner_account_id === scope.accountId,
        "upload_owner_required",
        "Only the uploader can finish this file.",
      );
      if (row.state !== "uploading") return creatorAssetView(row);
      invariant(
        Number(row.uploaded_bytes) === Number(row.bytes),
        "upload_incomplete",
        "The upload is incomplete.",
      );
      const updated = await client.query<CreatorAssetRow>(
        "UPDATE creator.creator_media_asset SET state='quarantined',job_available_at=now() WHERE id=$1 AND creator_id=$2 RETURNING *",
        [id, scope.creatorId],
      );
      await announceMediaJob(client, creatorJob(updated.rows[0]!));
      return creatorAssetView(updated.rows[0]!);
    });
  }
  async revoke(scope: CreatorScope, id: string) {
    await this.transaction(scope, async (client) => {
      const row = (
        await client.query<CreatorAssetRow>(
          "SELECT * FROM creator.creator_media_asset WHERE id=$1 AND creator_id=$2 FOR UPDATE",
          [id, scope.creatorId],
        )
      ).rows[0];
      invariant(
        row && row.owner_account_id === scope.accountId,
        "media_owner_required",
        "Only the media owner can remove this asset.",
      );
      if (["revoked", "deleted"].includes(row.state)) return;
      await client.query(
        "UPDATE creator.creator_media_asset SET state='revoked',version=version+1,delete_pending=true,job_available_at=now() WHERE id=$1 AND creator_id=$2",
        [id, scope.creatorId],
      );
      await announceMediaJob(client, creatorJob(row));
    });
  }
  /** W5 review/publish use this exact processed snapshot in their current transaction. */
  async evidence(
    scope: CreatorScope,
    client: PoolClient,
    objectId: string,
    id: string,
  ) {
    await this.identity.authorizeInTransaction(scope, client, "verified");
    const row = await this.row(scope, client, id, true);
    invariant(
      row.object_id === objectId &&
        row.owner_account_id === scope.accountId &&
        row.state === "ready",
      "media_not_ready",
      "This content's exact media is still processing.",
    );
    return ProcessedMediaEvidenceSchema.parse({
      assetId: row.id,
      version: row.version,
      sha256: row.output_sha256,
      bytes: Number(row.bytes),
      mimeType: row.mime_type,
      durationMs: row.duration_ms,
    });
  }
  /** W5 consumes once, then binds that genuine publication to immutable media in the same transaction. */
  async attachPublication(
    scope: CreatorScope,
    client: PoolClient,
    objectId: string,
    signedActId: string,
    command: SignedActCommand,
    evidence: readonly ProcessedMediaEvidence[],
  ) {
    await this.identity.authorizeInTransaction(scope, client, "verified");
    const content = command.content;
    invariant(
      command.subjectId === objectId &&
        ["broadcast", "reply"].includes(command.actType) &&
        content !== null &&
        typeof content === "object" &&
        !Array.isArray(content) &&
        content.kind === "content_publication" &&
        content.creatorId === scope.creatorId &&
        Array.isArray(content.mediaEvidence) &&
        contentHash(content.mediaEvidence) === contentHash(evidence) &&
        evidence.length <= 64 &&
        new Set(evidence.map((item) => item.assetId)).size === evidence.length,
      "media_signature_mismatch",
      "The exact content and media review changed.",
    );
    const publication = await client.query(
      "SELECT sa.id FROM creator.signed_act sa JOIN creator.signed_act_consumption sac ON sac.signed_act_id=sa.id AND sac.account_id=sa.account_id JOIN creator.signed_publication sp ON sp.signed_act_id=sa.id AND sp.account_id=sa.account_id WHERE sa.id=$1 AND sa.account_id=$2 AND sa.creator_id=$3 AND sa.subject_id=$4 AND sa.content_hash=$5 AND sp.command=$6::jsonb AND sp.withdrawn_at IS NULL AND sa.act_type=$7",
      [
        signedActId,
        scope.accountId,
        scope.creatorId,
        objectId,
        contentHash(command),
        JSON.stringify(command),
        command.actType,
      ],
    );
    invariant(
      publication.rowCount === 1,
      "media_signature_mismatch",
      "This exact publication signature is unavailable.",
    );
    for (const expected of [...evidence].sort((a, b) =>
      a.assetId.localeCompare(b.assetId),
    )) {
      const proof = ProcessedMediaEvidenceSchema.parse(expected);
      const current = await this.evidence(
        scope,
        client,
        objectId,
        proof.assetId,
      );
      const asset = await this.row(scope, client, proof.assetId);
      invariant(
        ["human_note", "post_photo", "post_audio"].includes(asset.purpose),
        "media_publication_purpose_invalid",
        "Source and interview audio require their own reviewed purpose authority.",
      );
      invariant(
        contentHash(current) === contentHash(proof),
        "media_version_changed",
        "This content's exact media changed.",
      );
      await client.query(
        "INSERT INTO creator.creator_media_publication(asset_id,creator_id,object_id,account_id,signed_act_id,evidence,command_hash) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(asset_id,signed_act_id) DO NOTHING",
        [
          proof.assetId,
          scope.creatorId,
          objectId,
          scope.accountId,
          signedActId,
          JSON.stringify(proof),
          contentHash(command),
        ],
      );
      await client.query(
        "UPDATE creator.creator_media_asset SET signed_act_id=$3,manifest_pending=true,job_available_at=now() WHERE id=$1 AND creator_id=$2 AND signed_act_id IS NULL",
        [proof.assetId, scope.creatorId, signedActId],
      );
      await announceMediaJob(client, {
        kind: "creator",
        assetId: proof.assetId,
        creatorId: scope.creatorId,
        ownerAccountId: scope.accountId,
      });
    }
  }
  /** W5 withdraws/unpublishes the real content in this same transaction and its
   * current object policy denies readers. Invalidate tickets without changing the
   * signed processed snapshot or deleting media permitted in a future revision.
   * Owner erasure/expiry uses the separate durable revoke/delete path. */
  async withdraw(scope: CreatorScope, client: PoolClient, objectId: string) {
    await this.identity.authorizeInTransaction(scope, client, "owned");
    await client.query(
      "SELECT id FROM creator.creator_media_asset WHERE creator_id=$1 AND object_id=$2 AND owner_account_id=$3 ORDER BY id FOR UPDATE",
      [scope.creatorId, objectId, scope.accountId],
    );
    await client.query(
      "UPDATE creator.creator_media_asset SET access_epoch=access_epoch+1 WHERE creator_id=$1 AND object_id=$2 AND owner_account_id=$3 AND state NOT IN('revoked','deleted')",
      [scope.creatorId, objectId, scope.accountId],
    );
  }
  async readyForPublication(
    scope: CreatorScope,
    client: PoolClient,
    objectId: string,
    expected: ProcessedMediaEvidence,
    signedActId: string,
  ) {
    const proof = ProcessedMediaEvidenceSchema.parse(expected);
    const current = await this.evidence(scope, client, objectId, proof.assetId);
    if (contentHash(current) !== contentHash(proof)) return false;
    if (
      !(await this.publicationMatches(
        scope,
        client,
        objectId,
        signedActId,
        proof,
      ))
    )
      return false;
    const row = await this.row(scope, client, proof.assetId);
    return verifiedProvenance(row);
  }
  /** W5 calls inside its already-authorized transaction/current object lock.
   * Current reuse association is distinct from the original C2PA recording act;
   * do not call row/currentAssetRead here, which would recurse into W5 policy. */
  async publicationMatches(
    scope: CreatorMediaReadScope,
    client: PoolClient,
    objectId: string,
    signedActId: string,
    expected: ProcessedMediaEvidence,
  ) {
    if ("accountId" in scope)
      await this.identity.authorizeInTransaction(scope, client, "owned");
    else if (isAudience(scope)) {
      invariant(
        this.audienceIdentity,
        "media_audience_unconfigured",
        "Content playback is awaiting its current audience authority.",
      );
      await this.audienceIdentity.authorizeInTransaction(scope, client);
    } else {
      assertThreadScope(scope);
      invariant(
        scope.authority !== "triage",
        "media_participant_required",
        "This media is unavailable.",
      );
    }
    await this.allowed(scope, client);
    const proof = ProcessedMediaEvidenceSchema.parse(expected);
    const result = await client.query(
      "SELECT 1 FROM creator.creator_media_publication p JOIN creator.signed_verification sv ON sv.id=p.signed_act_id AND sv.account_id=p.account_id AND sv.creator_id=p.creator_id AND sv.content_hash=p.command_hash WHERE p.asset_id=$1 AND p.creator_id=$2 AND p.object_id=$3 AND p.signed_act_id=$4 AND p.evidence=$5::jsonb AND NOT sv.withdrawn AND NOT sv.creator_revoked AND sv.act_type IN('broadcast','reply')",
      [
        proof.assetId,
        scope.creatorId,
        objectId,
        signedActId,
        JSON.stringify(proof),
      ],
    );
    return result.rowCount === 1;
  }
  async playback(scope: CreatorMediaReadScope, id: string) {
    return this.transaction(scope, async (client) => {
      const row = await this.row(scope, client, id);
      invariant(
        row.state === "ready",
        "media_processing",
        "This media is still processing.",
      );
      if (row.owner_account_id !== account(scope))
        invariant(
          verifiedProvenance(row),
          "media_provenance_pending",
          "This media is awaiting its signature and content credentials.",
        );
      const publication = await this.playbackPublication(scope, client, row);
      const fileProof = playbackFile(row);
      const actual = await this.storage.openPlayback(id, fileProof);
      await actual.handle.close();
      return {
        asset: creatorAssetView(row),
        playbackFile: fileProof,
        ...this.tickets.issue(
          {
            assetId: id,
            objectId: row.object_id,
            accountId: account(scope),
            creatorId: scope.creatorId,
            ...("accountId" in scope ? {} : { fanId: scope.fanId }),
            ...(isAudience(scope) ? { audience: true as const } : {}),
            operation: "play",
            version: row.version,
            accessEpoch: row.access_epoch,
            ...(publication ? { publication } : {}),
            playbackFile: fileProof,
          },
          60,
        ),
      };
    });
  }
  private async playbackPublication(
    scope: CreatorMediaReadScope,
    client: PoolClient,
    row: CreatorAssetRow,
  ): Promise<CreatorMediaPublicationBinding | null> {
    if (row.owner_account_id === account(scope)) return null;
    const result = CreatorMediaPublicationBindingSchema.safeParse(
      await this.authority.currentPublication?.(
        scope,
        row.object_id,
        creatorAssetView(row),
        client,
      ),
    );
    invariant(
      result.success,
      "media_publication_unavailable",
      "This media requires its current published revision.",
    );
    invariant(
      await this.publicationMatches(
        scope,
        client,
        row.object_id,
        result.data.signedActId,
        ProcessedMediaEvidenceSchema.parse({
          assetId: row.id,
          version: row.version,
          sha256: row.output_sha256!,
          bytes: Number(row.bytes),
          mimeType: row.mime_type,
          durationMs: row.duration_ms,
        }),
      ),
      "media_publication_unavailable",
      "This media requires its exact current publication.",
    );
    return result.data;
  }
  async download(scope: CreatorMediaReadScope, id: string, token: string) {
    const ticket = this.tickets.verify(
      token,
      {
        accountId: account(scope),
        creatorId: scope.creatorId,
        ...("accountId" in scope ? {} : { fanId: scope.fanId }),
        ...(isAudience(scope) ? { audience: true as const } : {}),
      },
      id,
      "play",
    );
    const current = await this.transaction(scope, async (client) => {
      const row = await this.row(scope, client, id);
      invariant(
        row.state === "ready" &&
          (row.owner_account_id === account(scope) || verifiedProvenance(row)),
        "media_not_ready",
        "This media is unavailable.",
      );
      invariant(
        row.version === ticket.version &&
          row.object_id === ticket.objectId &&
          row.access_epoch === ticket.accessEpoch,
        "media_version_changed",
        "Request a new media link.",
      );
      const publication = await this.playbackPublication(scope, client, row);
      invariant(
        contentHash(publication) === contentHash(ticket.publication ?? null),
        "media_publication_changed",
        "Request a new media link for the current publication.",
      );
      const fileProof = playbackFile(row);
      invariant(
        contentHash(fileProof) === contentHash(ticket.playbackFile),
        "media_file_changed",
        "Request a new media link for the current file.",
      );
      return {
        asset: creatorAssetView(row),
        accessEpoch: row.access_epoch,
        publication,
        playbackFile: fileProof,
      };
    });
    return {
      ...current,
      ...(await this.storage.openPlayback(id, current.playbackFile)),
    };
  }
  async assertPlaybackCurrent(
    scope: CreatorMediaReadScope,
    id: string,
    version: number,
    accessEpoch: number,
    publication: CreatorMediaPublicationBinding | null = null,
    expected?: PlaybackFile,
  ) {
    await this.transaction(scope, async (client) => {
      const row = await this.row(scope, client, id);
      invariant(
        row.state === "ready" &&
          row.version === version &&
          row.access_epoch === accessEpoch &&
          (row.owner_account_id === account(scope) || verifiedProvenance(row)),
        "media_version_changed",
        "This media is no longer available.",
      );
      invariant(
        contentHash(await this.playbackPublication(scope, client, row)) ===
          contentHash(publication),
        "media_publication_changed",
        "This media is no longer in the same published revision.",
      );
      invariant(
        expected && contentHash(playbackFile(row)) === contentHash(expected),
        "media_file_changed",
        "This media is no longer the same file.",
      );
    });
  }
}
