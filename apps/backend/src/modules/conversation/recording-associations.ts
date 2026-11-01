import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { invariant } from "../../core/errors.js";
import type { AccessService } from "../access/scope.js";
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
/** Read-only ownership of the registered recording associations. Preparing
 * privacy exports does not grant signing, delivery, storage, or playback. */
export class PreparedConversationRecordingAssociations {
  private constructor(private readonly db: Database) {}

  assertPool(pool: Database["pool"]) {
    invariant(
      pool === this.db.pool,
      "recording_pool_mismatch",
      "Recording reads require their actual prepared database pool.",
    );
  }

  static async prepare(input: {
    database: Database;
    access: AccessService;
    migrationVersion: string;
    correctionMigrationVersion: string;
  }): Promise<PreparedConversationRecordingAssociations | undefined> {
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
    return new PreparedConversationRecordingAssociations(input.database);
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
