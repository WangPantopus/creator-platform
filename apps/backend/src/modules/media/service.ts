import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  MediaAssetSchema,
  MediaSignSchema,
  UploadRequestSchema,
  ProcessedMediaEvidenceSchema,
  type MediaAsset,
  type MediaPolicy,
  type MediaPurpose,
  type ProcessedMediaEvidence,
} from "../../../../../packages/api/src/media.js";
import type { ThreadScope } from "../access/scope.js";
import type { Database } from "../../db/database.js";
import { invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { consumeSignedAct } from "../identity/signed-acts.js";
import { contentHash } from "../../core/canonical.js";
import type { SignedActCommand } from "@qelvora/api";
import { MediaTickets, PrivateMediaStorage } from "./storage.js";

export interface MediaAuthority {
  /** W4/W5/W2 supply current audience/purpose authorization and content-specific limits. */
  policy(
    scope: ThreadScope,
    purpose: MediaPurpose,
    operation: "upload" | "read",
    client: PoolClient,
  ): Promise<MediaPolicy | null>;
  denied(scope: ThreadScope, client: PoolClient): Promise<boolean>;
  /** Must validate the stored W2 license revision in this transaction on every read/range request. */
  syntheticAuthorized?(
    scope: ThreadScope,
    asset: MediaAsset,
    client: PoolClient,
  ): Promise<boolean>;
  /** A Note binds W5's real content object, never an invented fan thread. */
  signingSubject?(
    scope: ThreadScope,
    asset: MediaAsset,
    client: PoolClient,
  ): Promise<{ actType: "broadcast"; subjectId: string } | null>;
}
type AssetRow = {
  id: string;
  owner_account_id: string;
  creator_id: string;
  fan_id: string;
  thread_id: string;
  purpose: MediaPurpose;
  state: MediaAsset["state"];
  version: number;
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
  provenance: MediaAsset["provenance"];
  max_duration_ms: number;
  max_bytes: number;
};
export function assetView(row: AssetRow): MediaAsset {
  return MediaAssetSchema.parse({
    id: row.id,
    threadId: row.thread_id,
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
export class MediaService {
  readonly chunkBytes = 1024 * 1024;
  constructor(
    readonly db: Database,
    readonly storage: PrivateMediaStorage,
    readonly tickets: MediaTickets,
    private readonly authority: MediaAuthority,
  ) {}
  private async allowed(scope: ThreadScope, client: PoolClient) {
    invariant(
      scope.authority !== "triage",
      "media_participant_required",
      "This media is available only to its participants.",
    );
    invariant(
      (await this.authority.denied(scope, client)) === false,
      "media_revoked",
      "This media is no longer available.",
    );
  }
  async row(
    scope: ThreadScope,
    client: PoolClient,
    id: string,
    lock = false,
  ): Promise<AssetRow> {
    await this.allowed(scope, client);
    const rows = await client.query<AssetRow>(
      `SELECT * FROM creator.media_asset WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 ${lock ? "FOR UPDATE" : ""}`,
      [id, scope.threadId, scope.creatorId, scope.fanId],
    );
    const row = rows.rows[0];
    invariant(
      row &&
        !["revoked", "deleted"].includes(row.state) &&
        row.expires_at > new Date(),
      "media_unavailable",
      "This media is unavailable.",
    );
    invariant(
      await this.authority.policy(scope, row.purpose, "read", client),
      "media_access_denied",
      "This media is unavailable.",
    );
    if (row.purpose === "ai_audio")
      invariant(
        row.provenance?.c2paVerified === true &&
          row.provenance.watermarkVerified === true &&
          row.provenance.spokenLabelVerified === true &&
          (await this.authority.syntheticAuthorized?.(
            scope,
            assetView(row),
            client,
          )) === true,
        "ai_audio_license_unavailable",
        "AI voice authorization changed.",
      );
    return row;
  }
  /** Trusted provider ingestion still uses the canonical deny/purpose/retention policy. */
  async ingestionPolicy(scope: ThreadScope, client: PoolClient) {
    await this.allowed(scope, client);
    const policy = await this.authority.policy(
      scope,
      "ai_audio",
      "upload",
      client,
    );
    invariant(
      policy &&
        Number.isSafeInteger(policy.maxBytes) &&
        policy.maxBytes > 0 &&
        policy.maxBytes <= 268_435_456 &&
        Number.isSafeInteger(policy.maxDurationMs) &&
        policy.maxDurationMs > 0 &&
        policy.maxDurationMs <= 3_600_000 &&
        Number.isSafeInteger(policy.retentionSeconds) &&
        policy.retentionSeconds > 0,
      "ai_audio_policy_unavailable",
      "AI voice is not available yet.",
    );
    return policy;
  }
  async begin(scope: ThreadScope, input: unknown) {
    const body = UploadRequestSchema.parse(input);
    // Synthetic and room recordings must enter only through licensed/provider ingestion, never client upload.
    invariant(
      !["ai_audio", "call_recording"].includes(body.purpose),
      "provider_media_required",
      "This media requires an authorized provider.",
    );
    if (
      [
        "human_note",
        "human_reply",
        "source_audio",
        "interview_audio",
        "post_photo",
      ].includes(body.purpose)
    )
      invariant(
        scope.authority === "creator",
        "creator_required",
        "Only the creator can record this media.",
      );
    return this.db.withThread(scope, async (client) => {
      await this.allowed(scope, client);
      const policy = await this.authority.policy(
        scope,
        body.purpose,
        "upload",
        client,
      );
      invariant(
        policy,
        "media_policy_unavailable",
        "Uploading is not available for this content.",
      );
      invariant(
        Number.isSafeInteger(policy.maxBytes) &&
          policy.maxBytes > 0 &&
          policy.maxBytes <= 268435456 &&
          Number.isSafeInteger(policy.maxDurationMs) &&
          policy.maxDurationMs > 0 &&
          policy.maxDurationMs <= 3_600_000 &&
          Number.isSafeInteger(policy.retentionSeconds) &&
          policy.retentionSeconds > 0,
        "media_policy_unavailable",
        "The content's media policy is unavailable.",
      );
      const maxDurationMs =
        body.purpose === "human_note"
          ? Math.min(policy.maxDurationMs, 60_000)
          : policy.maxDurationMs;
      invariant(
        body.bytes <= policy.maxBytes &&
          (!body.durationMs || body.durationMs <= maxDurationMs),
        "media_limit_exceeded",
        "This recording or file exceeds the content limit.",
      );
      invariant(
        body.purpose !== "post_photo" || body.mimeType.startsWith("image/"),
        "media_type_invalid",
        "Choose a supported photo.",
      );
      invariant(
        ![
          "human_note",
          "human_reply",
          "source_audio",
          "interview_audio",
        ].includes(body.purpose) || body.mimeType.startsWith("audio/"),
        "media_type_invalid",
        "This content requires an audio recording.",
      );
      invariant(
        !body.mimeType.startsWith("audio/") || body.durationMs,
        "duration_required",
        "A recording duration is required.",
      );
      const asset = await idempotent(
        client,
        scope,
        "media.begin",
        body.idempotencyKey,
        body,
        async () => {
          const row = await client.query<AssetRow>(
            `INSERT INTO creator.media_asset(id,thread_id,creator_id,fan_id,owner_account_id,purpose,state,mime_type,bytes,input_sha256,duration_ms,max_duration_ms,max_bytes,expires_at) VALUES($1,$2,$3,$4,$5,$6,'uploading',$7,$8,$9,$10,$11,$12,now()+make_interval(secs=>$13)) RETURNING *`,
            [
              randomUUID(),
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              scope.actorAccountId,
              body.purpose,
              body.mimeType,
              body.bytes,
              body.sha256,
              body.durationMs ?? null,
              maxDurationMs,
              policy.maxBytes,
              policy.retentionSeconds,
            ],
          );
          return assetView(row.rows[0]!);
        },
      );
      return {
        asset,
        chunkBytes: this.chunkBytes,
        ...this.tickets.issue({
          assetId: asset.id,
          creatorId: scope.creatorId,
          fanId: scope.fanId,
          accountId: scope.actorAccountId,
          operation: "upload",
          version: asset.version,
        }),
      };
    });
  }
  async read(scope: ThreadScope, id: string) {
    return this.db.withThread(scope, async (client) =>
      assetView(await this.row(scope, client, id)),
    );
  }
  async resume(scope: ThreadScope, id: string) {
    return this.db.withThread(scope, async (client) => {
      const row = await this.row(scope, client, id);
      invariant(
        row.owner_account_id === scope.actorAccountId &&
          row.state === "uploading",
        "upload_unavailable",
        "This upload cannot be resumed.",
      );
      return {
        asset: assetView(row),
        chunkBytes: this.chunkBytes,
        ...this.tickets.issue({
          assetId: id,
          creatorId: scope.creatorId,
          fanId: scope.fanId,
          accountId: scope.actorAccountId,
          operation: "upload",
          version: row.version,
        }),
      };
    });
  }
  async chunk(
    scope: ThreadScope,
    id: string,
    token: string,
    offset: number,
    bytes: Buffer,
  ) {
    const ticket = this.tickets.verify(
      token,
      scope.actorAccountId,
      id,
      "upload",
    );
    invariant(
      Number.isSafeInteger(offset) &&
        offset >= 0 &&
        bytes.length > 0 &&
        bytes.length <= this.chunkBytes,
      "chunk_invalid",
      "The upload chunk is invalid.",
    );
    return this.db.withThread(scope, async (client) => {
      const row = await this.row(scope, client, id, true);
      invariant(
        row.owner_account_id === scope.actorAccountId &&
          row.version === ticket.version &&
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
      const updated = await client.query<AssetRow>(
        "UPDATE creator.media_asset SET uploaded_bytes=$1 WHERE id=$2 AND creator_id=$3 AND fan_id=$4 RETURNING *",
        [offset + bytes.length, id, scope.creatorId, scope.fanId],
      );
      return assetView(updated.rows[0]!);
    });
  }
  async finish(scope: ThreadScope, id: string) {
    return this.db.withThread(scope, async (client) => {
      const row = await this.row(scope, client, id, true);
      invariant(
        row.owner_account_id === scope.actorAccountId,
        "upload_owner_required",
        "Only the uploader can finish this file.",
      );
      if (row.state !== "uploading") return assetView(row);
      invariant(
        Number(row.uploaded_bytes) === Number(row.bytes),
        "upload_incomplete",
        "The upload is incomplete.",
      );
      // Digest is checked in the isolated worker; interactive requests never parse media.
      const updated = await client.query<AssetRow>(
        "UPDATE creator.media_asset SET state='quarantined',job_available_at=now() WHERE id=$1 AND creator_id=$2 AND fan_id=$3 RETURNING *",
        [id, scope.creatorId, scope.fanId],
      );
      return assetView(updated.rows[0]!);
    });
  }
  async sign(scope: ThreadScope, id: string, input: unknown) {
    const body = MediaSignSchema.parse(input);
    return this.db.withThread(scope, async (client) =>
      idempotent(
        client,
        scope,
        "media.sign",
        body.idempotencyKey,
        { id, ...body },
        async () => {
          const row = await this.row(scope, client, id, true);
          invariant(
            row.state === "ready" &&
              row.version === body.version &&
              ["human_note", "human_reply"].includes(row.purpose) &&
              !row.signed_act_id,
            "media_not_signable",
            "This exact recording cannot be signed.",
          );
          const command = await this.command(scope, client, row);
          await consumeSignedAct(client, scope, body.signedActId, command);
          const updated = await client.query<AssetRow>(
            "UPDATE creator.media_asset SET signed_act_id=$1,job_available_at=now(),manifest_pending=true WHERE id=$2 AND creator_id=$3 AND fan_id=$4 RETURNING *",
            [body.signedActId, id, scope.creatorId, scope.fanId],
          );
          return { asset: assetView(updated.rows[0]!), command };
        },
      ),
    );
  }
  private async command(
    scope: ThreadScope,
    client: PoolClient,
    row: AssetRow,
  ): Promise<SignedActCommand> {
    invariant(
      scope.authority === "creator" &&
        row.owner_account_id === scope.actorAccountId &&
        row.state === "ready" &&
        ["human_note", "human_reply"].includes(row.purpose),
      "media_not_signable",
      "This recording cannot be signed by this account.",
    );
    const subject =
      row.purpose === "human_reply"
        ? { actType: "reply" as const, subjectId: scope.threadId }
        : await this.authority.signingSubject?.(scope, assetView(row), client);
    invariant(
      subject,
      "media_signing_subject_unavailable",
      "Note signing requires its actual Studio content object.",
    );
    return {
      ...subject,
      content: {
        mediaAssetId: row.id,
        version: row.version,
        sha256: row.output_sha256!,
        mimeType: row.mime_type,
        durationMs: row.duration_ms,
        bytes: Number(row.bytes),
      },
    };
  }
  async signingCommand(scope: ThreadScope, id: string) {
    return this.db.withThread(scope, async (client) =>
      this.command(scope, client, await this.row(scope, client, id)),
    );
  }
  /** W3 associates already-signed audio in its own transaction, without consuming its act twice. */
  async publishedRecording(
    scope: ThreadScope,
    client: PoolClient,
    expected: ProcessedMediaEvidence,
  ) {
    const proof = ProcessedMediaEvidenceSchema.parse(expected);
    const row = await this.row(scope, client, proof.assetId, true);
    invariant(
      scope.authority === "creator" &&
        scope.actorAccountId === scope.creatorAccountId &&
        row.owner_account_id === scope.actorAccountId &&
        row.purpose === "human_reply" &&
        row.state === "ready" &&
        row.version === proof.version &&
        row.output_sha256 === proof.sha256 &&
        Number(row.bytes) === proof.bytes &&
        row.mime_type === proof.mimeType &&
        row.duration_ms === proof.durationMs &&
        row.signed_act_id &&
        row.provenance?.c2paVerified === true &&
        row.provenance.processedMediaSha256 === proof.sha256 &&
        row.provenance.signedActId === row.signed_act_id,
      "media_publication_unavailable",
      "This exact signed recording is not ready for delivery.",
    );
    const command = await this.command(scope, client, row);
    const published = await client.query(
      "SELECT sa.id FROM creator.signed_act sa JOIN creator.signed_act_consumption sac ON sac.signed_act_id=sa.id AND sac.account_id=sa.account_id JOIN creator.signed_publication sp ON sp.signed_act_id=sa.id AND sp.account_id=sa.account_id WHERE sa.id=$1 AND sa.account_id=$2 AND sa.creator_id=$3 AND sa.act_type=$4 AND sa.subject_id=$5 AND sa.content_hash=$6 AND sp.command=$7::jsonb AND sp.withdrawn_at IS NULL",
      [
        row.signed_act_id,
        scope.actorAccountId,
        scope.creatorId,
        command.actType,
        command.subjectId,
        contentHash(command),
        JSON.stringify(command),
      ],
    );
    invariant(
      published.rowCount === 1,
      "media_publication_unavailable",
      "The recording's exact publication signature is unavailable.",
    );
    return { asset: assetView(row), command, signedActId: row.signed_act_id };
  }
  async playback(scope: ThreadScope, id: string) {
    return this.db.withThread(scope, async (client) => {
      const row = await this.row(scope, client, id);
      invariant(
        row.state === "ready",
        "media_processing",
        "This media is still processing.",
      );
      if (
        row.owner_account_id !== scope.actorAccountId &&
        ["human_note", "human_reply"].includes(row.purpose)
      )
        invariant(
          row.signed_act_id && row.provenance?.c2paVerified === true,
          "media_provenance_pending",
          "This recording is awaiting its signature and content credentials.",
        );
      return {
        asset: assetView(row),
        ...this.tickets.issue(
          {
            assetId: id,
            creatorId: scope.creatorId,
            fanId: scope.fanId,
            accountId: scope.actorAccountId,
            operation: "play",
            version: row.version,
          },
          60,
        ),
      };
    });
  }
  async download(scope: ThreadScope, id: string, token: string) {
    const ticket = this.tickets.verify(token, scope.actorAccountId, id, "play");
    const current = await this.playback(scope, id);
    invariant(
      current.asset.version === ticket.version,
      "media_version_changed",
      "Request a new media link.",
    );
    return {
      asset: current.asset,
      file: this.storage.file(id, "output"),
      size: await this.storage.size(id),
    };
  }
  /** An already-open response must also stop when current access or the asset version changes. */
  async assertPlaybackCurrent(scope: ThreadScope, id: string, version: number) {
    const current = await this.playback(scope, id);
    invariant(
      current.asset.version === version,
      "media_version_changed",
      "This media is no longer available.",
    );
  }
  async revoke(scope: ThreadScope, id: string) {
    await this.db.withThread(scope, async (client) => {
      // Cleanup remains retryable after access expiry or a lost deletion response.
      invariant(
        scope.authority !== "triage",
        "media_participant_required",
        "Only a participant can remove this media.",
      );
      const row = (
        await client.query<AssetRow>(
          "SELECT * FROM creator.media_asset WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR UPDATE",
          [id, scope.threadId, scope.creatorId, scope.fanId],
        )
      ).rows[0];
      invariant(row, "media_unavailable", "This media is unavailable.");
      invariant(
        row.owner_account_id === scope.actorAccountId ||
          scope.authority === "creator",
        "media_owner_required",
        "Only the media owner can remove this asset.",
      );
      if (["revoked", "deleted"].includes(row.state)) return;
      await client.query(
        "UPDATE creator.media_asset SET state='revoked',version=version+1,job_available_at=now(),delete_pending=true WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
        [id, scope.creatorId, scope.fanId],
      );
    });
    // A worker that was parsing may still have files open. Deletion is acknowledged only by the durable worker.
  }
  static digest(bytes: Buffer) {
    return createHash("sha256").update(bytes).digest("hex");
  }
}
