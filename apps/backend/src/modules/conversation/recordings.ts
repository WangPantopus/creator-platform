import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { IdSchema } from "@qelvora/api";
import type { Database } from "../../db/database.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { appendFrame } from "../../core/outbox.js";
import type { Actor } from "../identity/adapter.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import type { SignedSubjectPolicy } from "../identity/subjects.js";
import {
  assertThreadScope,
  type AccessService,
  type ThreadScope,
} from "../access/scope.js";
import type { MediaService } from "../media/service.js";
import {
  ConversationMessageSchema,
  ConversationRecordingCommandSchema,
  ConversationRecordingInputSchema,
  type ConversationMessage,
} from "../../../../../packages/api/src/conversation/contracts.js";
import { ProcessedMediaEvidenceSchema } from "../../../../../packages/api/src/media.js";
import type { ConversationPrivacyFamily } from "./privacy.js";
import { writeConversationExportRows } from "./privacy-export-rows.js";

const recordingSource = Object.freeze({
  path: "apps/backend/src/modules/conversation/migrations/pending_w3_recording_association.sql",
  owner: "W3",
  name: "w3_recording_association",
  checksum: "b61d50d7f85c0ef468e00a8d2d6b737b4d405a9349810c552f7d9df7f527c42e",
});
const correctionSource = Object.freeze({
  path: "apps/backend/src/modules/conversation/migrations/pending_w3_correction_signature.sql",
  owner: "W3",
  name: "w3_correction_signature",
  checksum: "5c94b94a7287a5c4a149da454117c30be40367034b9930ac11e168e5b6a4b3e0",
});
const unavailableCodes = new Set([
  "media_participant_required",
  "media_revoked",
  "media_unavailable",
  "media_access_denied",
  "media_publication_unavailable",
  "media_provenance_pending",
]);

/** Only an actual registered schema and exact W6 instance can enable associations.
 * W1 supplies the genuine selected-thread signing scope on its held client;
 * this class never issues it or consumes W6's signature a second time. */
export class ConversationRecordings {
  private constructor(
    private readonly db: Database,
    private readonly access: AccessService,
    private readonly media: MediaService,
  ) {}
  assertRuntime(database: Database, access: AccessService) {
    invariant(
      database === this.db &&
        access === this.access &&
        this.media.db.pool === database.pool,
      "recording_runtime_mismatch",
      "Recordings require their actual prepared conversation and media runtime.",
    );
  }
  assertPool(pool: Database["pool"]) {
    invariant(
      pool === this.db.pool && this.media.db.pool === pool,
      "recording_pool_mismatch",
      "Recording reads require their actual prepared database pool.",
    );
  }
  static async prepare(input: {
    database: Database;
    access: AccessService;
    media: MediaService;
    migrationVersion: string;
    correctionMigrationVersion: string;
  }): Promise<ConversationRecordings | undefined> {
    invariant(
      input.media.db.pool === input.database.pool,
      "recording_pool_mismatch",
      "Media and conversation association must use the same actual pool.",
    );
    if (!input.access.threadScopeInTransactionAvailable) return undefined;
    const recording = await registeredMigration(recordingSource);
    const correction = await registeredMigration(correctionSource);
    if (
      !recording ||
      !correction ||
      input.migrationVersion !== recording.version ||
      input.correctionMigrationVersion !== correction.version
    )
      return undefined;
    const schema = (
      await input.database.pool.query(
        "SELECT to_regclass('creator.schema_migration') AS migration,to_regclass('creator.media_asset') AS media",
      )
    ).rows[0];
    if (!schema?.migration || !schema.media) return undefined;
    const installed = await input.database.pool.query(
      "SELECT version FROM creator.schema_migration WHERE (version=$1 AND checksum=$2) OR (version=$3 AND checksum=$4)",
      [
        input.migrationVersion,
        recording.checksum,
        input.correctionMigrationVersion,
        correction.checksum,
      ],
    );
    if (installed.rowCount !== 2) return undefined;
    const columns = await input.database.pool.query(
      "SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('creator.message') AND attname=ANY($1::text[]) AND NOT attisdropped",
      [["recording_asset_id", "recording_evidence", "signed_command"]],
    );
    const constraints = await input.database.pool.query(
      "SELECT conname FROM pg_constraint WHERE conrelid=to_regclass('creator.message') AND conname=ANY($1::text[]) AND convalidated",
      [["message_recording_family", "message_recording_pair"]],
    );
    const indexes = await input.database.pool.query(
      "SELECT 1 FROM pg_index WHERE indexrelid IN(to_regclass('creator.message_recording_signed_act'),to_regclass('creator.message_recording_asset_occurrence')) AND indisunique AND indisvalid",
    );
    invariant(
      columns.rowCount === 3 &&
        constraints.rowCount === 2 &&
        indexes.rowCount === 2,
      "recording_schema_unavailable",
      "The registered exact recording association schema is required.",
    );
    const custody = await input.database.pool.query(
      "SELECT 1 FROM pg_class WHERE oid IN(to_regclass('creator.message'),to_regclass('creator.media_asset')) AND relrowsecurity AND relforcerowsecurity AND relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)",
    );
    invariant(
      custody.rowCount === 2,
      "unsafe_recording_role",
      "Recording associations require non-owner forced row security.",
    );
    await input.database.assertRuntimeRole();
    return new ConversationRecordings(
      input.database,
      input.access,
      input.media,
    );
  }
  signedSubjectPolicy(): SignedSubjectPolicy {
    return {
      name: "conversation.recording",
      prepare: async (client, actor, creatorId, requested, threadScope) => {
        if (
          requested.actType !== "reply" ||
          typeof requested.content !== "object" ||
          requested.content === null ||
          Array.isArray(requested.content) ||
          !("mediaAssetId" in requested.content)
        )
          return null;
        const command = ConversationRecordingCommandSchema.parse(requested);
        invariant(
          threadScope,
          "recording_scope_required",
          "Select this conversation before signing its recording.",
        );
        assertThreadScope(threadScope);
        invariant(
          threadScope.authority === "creator" &&
            threadScope.actorAccountId === actor.accountId &&
            threadScope.creatorAccountId === actor.accountId &&
            threadScope.creatorId === creatorId &&
            command.subjectId === threadScope.threadId,
          "recording_scope_invalid",
          "Only the current creator can sign this exact conversation recording.",
        );
        await assertCurrentSession(client, actor.accountId);
        const active = await client.query(
          "SELECT 1 FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL AND control='human_active' FOR UPDATE",
          [threadScope.threadId, threadScope.creatorId, threadScope.fanId],
        );
        invariant(
          active.rowCount === 1,
          "takeover_required",
          "Take over this conversation before signing its recording.",
        );
        const current = await this.media.signingCommandInTransaction(
          threadScope,
          client,
          ProcessedMediaEvidenceSchema.parse({
            assetId: command.content.mediaAssetId,
            version: command.content.version,
            sha256: command.content.sha256,
            mimeType: command.content.mimeType,
            durationMs: command.content.durationMs,
            bytes: command.content.bytes,
          }),
        );
        return ConversationRecordingCommandSchema.parse(current);
      },
    };
  }
  async deliver(actor: Actor, creatorId: string, fanId: string, raw: unknown) {
    const body = ConversationRecordingInputSchema.parse(raw);
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const scope = await this.access.openThreadInTransaction(
        client,
        actor,
        creatorId,
        fanId,
        true,
        "write",
      );
      invariant(
        scope.authority === "creator" &&
          scope.actorAccountId === scope.creatorAccountId,
        "creator_required",
        "Only the current creator can deliver this recording.",
      );
      const response = await idempotent(
        client,
        scope,
        "conversationRecording",
        body.idempotencyKey,
        body,
        async () => {
          await assertCurrentSession(client, actor.accountId);
          const thread = (
            await client.query<{ control_epoch: number; control: string }>(
              "SELECT control_epoch,control FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL FOR UPDATE",
              [scope.threadId, creatorId, fanId],
            )
          ).rows[0];
          invariant(
            thread?.control === "human_active",
            "takeover_required",
            "The creator must take over before delivering a recording in this conversation.",
          );
          const recording = await this.media.publishedRecording(
            scope,
            client,
            body.evidence,
          );
          const command = ConversationRecordingCommandSchema.parse(
            recording.command,
          );
          invariant(
            command.subjectId === scope.threadId &&
              recording.signedActId === body.signedActId,
            "recording_signature_changed",
            "Review this exact signed recording before delivering it.",
          );
          const hash = contentHash(command);
          const key = await client.query(
            "SELECT 1 FROM creator.signed_act sa JOIN creator.passkey_credential pc ON pc.id=sa.credential_id AND pc.account_id=sa.account_id WHERE sa.id=$1 AND sa.account_id=$2 AND sa.creator_id=$3 AND pc.revoked_at IS NULL FOR SHARE OF pc",
            [body.signedActId, actor.accountId, creatorId],
          );
          invariant(
            key.rowCount === 1,
            "recording_signature_changed",
            "The recording's current signing key is unavailable.",
          );
          const sequence = (
            await client.query<{ message_sequence: number }>(
              "UPDATE creator.thread SET message_sequence=message_sequence+1,revision=revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 RETURNING message_sequence",
              [scope.threadId, creatorId, fanId],
            )
          ).rows[0];
          invariant(
            sequence,
            "thread_unavailable",
            "This conversation is unavailable.",
          );
          const id = randomUUID();
          await client.query(
            `INSERT INTO creator.message(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence,signed_act_id,signed_content_hash,signed_command,recording_asset_id,recording_evidence,off_the_record)
           VALUES($1,$2,$3,$4,'human_creator',$5,'','delivered',$6,$7,$8,$9,$10,$11,$12,(SELECT off_the_record FROM creator.thread WHERE id=$2 AND creator_id=$3 AND fan_id=$4))`,
            [
              id,
              scope.threadId,
              creatorId,
              fanId,
              actor.accountId,
              thread.control_epoch,
              sequence.message_sequence,
              body.signedActId,
              hash,
              JSON.stringify(command),
              body.evidence.assetId,
              JSON.stringify(body.evidence),
            ],
          );
          await appendFrame(client, scope, {
            epoch: thread.control_epoch,
            kind: "delivered",
            messageId: id,
            authorKind: "human_creator",
            text: "",
            generationId: null,
            sequence: 0,
          });
          return {
            messageId: id,
            threadId: scope.threadId,
            signedActId: body.signedActId,
          };
        },
      );
      await client.query("COMMIT");
      return response;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  /** Current ready/version/provenance/private publication is rechecked in the
   * existing bounded page transaction. Revoked/expired media stays unavailable. */
  async enrich(
    scope: ThreadScope,
    client: PoolClient,
    messages: readonly ConversationMessage[],
  ): Promise<ConversationMessage[]> {
    assertThreadScope(scope);
    const ids = messages.map((message) => IdSchema.parse(message.id));
    invariant(
      ids.length <= 100 && new Set(ids).size === ids.length,
      "recording_page_invalid",
      "Recording reads require a bounded distinct message page.",
    );
    if (!ids.length) return [];
    const rows = await client.query<{
      id: string;
      version: number;
      signed_act_id: string | null;
      recording_asset_id: string | null;
      recording_evidence: unknown;
    }>(
      "SELECT id,version,signed_act_id,recording_asset_id,recording_evidence FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND id=ANY($4::uuid[])",
      [scope.threadId, scope.creatorId, scope.fanId, ids],
    );
    invariant(
      rows.rowCount === ids.length,
      "recording_page_changed",
      "The current recording message page changed.",
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    const result: ConversationMessage[] = [];
    for (const message of messages) {
      const row = byId.get(message.id)!;
      invariant(
        row.version === message.version &&
          row.signed_act_id === message.signedActId,
        "recording_page_changed",
        "The current recording message identity changed.",
      );
      if (!row.recording_asset_id) {
        result.push({ ...message, recording: null });
        continue;
      }
      const evidence = ProcessedMediaEvidenceSchema.parse(
        row.recording_evidence,
      );
      invariant(
        evidence.assetId === row.recording_asset_id,
        "recording_evidence_changed",
        "The stored recording identity changed.",
      );
      let recording: ConversationMessage["recording"] = {
        state: "unavailable",
      };
      if (scope.authority === "creator" || scope.authority === "fan") {
        try {
          const current = await this.media.publishedRecordingRead(
            scope,
            client,
            evidence,
          );
          invariant(
            current.signedActId === row.signed_act_id &&
              current.asset.mimeType === "audio/mp4" &&
              current.asset.durationMs !== null &&
              current.asset.durationMs > 0,
            "media_publication_unavailable",
            "This exact delivered recording is unavailable.",
          );
          recording = {
            state: "available",
            asset: current.asset,
          };
        } catch (error) {
          if (
            !(error instanceof DomainError) ||
            !unavailableCodes.has(error.code)
          )
            throw error;
        }
      }
      result.push(ConversationMessageSchema.parse({ ...message, recording }));
    }
    return result;
  }
  /** W6's media authority asks, on its caller's held client, whether this
   * exact signed recording is delivered in this scope's own thread family.
   * Only one delivered creator message with the same processed evidence and
   * signed command qualifies; an asset hash or signature alone never does. */
  async currentPublication(
    scope: ThreadScope,
    recording: Readonly<{
      asset: Readonly<{
        id: string;
        version: number;
        sha256: string;
        bytes: number;
        mimeType: string;
        durationMs: number | null;
      }>;
      command: unknown;
      signedActId: string;
    }>,
    client: PoolClient,
  ): Promise<boolean> {
    assertThreadScope(scope);
    const rows = (
      await client.query<{
        recording_evidence: unknown;
        signed_command: unknown;
      }>(
        "SELECT recording_evidence,signed_command FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND recording_asset_id=$4 AND signed_act_id=$5 AND author_kind='human_creator' AND delivery_state='delivered' LIMIT 2",
        [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          IdSchema.parse(recording.asset.id),
          IdSchema.parse(recording.signedActId),
        ],
      )
    ).rows;
    if (rows.length !== 1) return false;
    const stored = ProcessedMediaEvidenceSchema.safeParse(
      rows[0]!.recording_evidence,
    );
    const { asset } = recording;
    return (
      stored.success &&
      stored.data.assetId === asset.id &&
      stored.data.version === asset.version &&
      stored.data.sha256 === asset.sha256 &&
      stored.data.bytes === asset.bytes &&
      stored.data.mimeType === asset.mimeType &&
      stored.data.durationMs === asset.durationMs &&
      contentHash(rows[0]!.signed_command) === contentHash(recording.command)
    );
  }
  /** W8 checks its actual leased family on this same client before this read. */
  async exportMetadata(client: PoolClient, family: ConversationPrivacyFamily) {
    const rows = (
      await client.query(
        "SELECT id,recording_asset_id,recording_evidence,signed_act_id FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND recording_asset_id IS NOT NULL ORDER BY sequence LIMIT 2001",
        [family.threadId, family.creatorId, family.fanId],
      )
    ).rows;
    invariant(
      rows.length <= 2000,
      "bounded_subjob_required",
      "This export needs a paginated recording association subjob.",
    );
    return rows;
  }
  async exportMetadataTo(
    client: PoolClient,
    family: ConversationPrivacyFamily,
    write: (part: string) => Promise<void>,
    assertCurrent: () => Promise<void>,
    signal: AbortSignal,
  ) {
    return writeConversationExportRows({
      client,
      family,
      write,
      assertCurrent,
      signal,
      table: "message",
      key: "lpad(sequence::text,10,'0')||':'||id::text",
      projection: "id,recording_asset_id,recording_evidence,signed_act_id",
      predicate: "recording_asset_id IS NOT NULL",
    });
  }
}
