import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import { assertThreadScope } from "../access/scope.js";
import type { ConversationRecordings } from "../conversation/recordings.js";
import {
  ConversationMessageSchema,
  ConversationRecordingCommandSchema,
} from "../../../../../packages/api/src/conversation/contracts.js";
import { ProcessedMediaEvidenceSchema } from "../../../../../packages/api/src/media.js";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";

/** Consumes the actual prepared W3 association/W6 recording reader. No local
 * receipt, MIME claim or caller-supplied provenance can fulfill a voice mode. */
export class CommerceVoiceFulfillment {
  private constructor(
    private readonly database: Database,
    private readonly access: AccessService,
    private readonly recordings: ConversationRecordings,
  ) {}
  static async prepare(input: {
    database: Database;
    access: AccessService;
    recordings: ConversationRecordings;
  }) {
    input.recordings.assertRuntime(input.database, input.access);
    // W8's assigned composition preserves personal Approval as well as the
    // recording/correction guards. Standalone0058/0059 must never activate it.
    const composition = await input.database.pool.query(
      "SELECT version FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
      [
        "0060_w8_composed_signed_message",
        "43067f9a36218e49e84bc3597e466e73b2d288c12a446e2628e655a281dddecc",
      ],
    );
    if (composition.rowCount !== 1) return undefined;
    return new CommerceVoiceFulfillment(
      input.database,
      input.access,
      input.recordings,
    );
  }
  assertRuntime(database: Database, access: AccessService) {
    invariant(
      database === this.database && access === this.access,
      "voice_fulfillment_graph_mismatch",
      "Voice fulfillment requires the same canonical commerce and conversation runtime.",
    );
    this.recordings.assertRuntime(database, access);
  }
  async read(scope: ThreadScope, client: PoolClient, messageId: string) {
    assertThreadScope(scope);
    invariant(
      scope.authority === "creator" &&
        scope.actorAccountId === scope.creatorAccountId,
      "creator_required",
      "Only the creator can fulfill a personal voice request.",
    );
    const row = (
      await client.query(
        `SELECT id,thread_id AS "threadId",author_kind AS "authorKind",text,
         delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,
         signed_act_id AS "signedActId",author_account_id AS "authorAccountId",citations,
         created_at::text AS "createdAt",team_member AS member,off_the_record AS "offTheRecord",version,
         recording_asset_id,recording_evidence
         FROM creator.message WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR SHARE`,
        [messageId, scope.threadId, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    invariant(
      row?.authorKind === "human_creator" &&
        row.authorAccountId === scope.creatorAccountId &&
        row.deliveryState === "delivered" &&
        row.signedActId &&
        row.recording_asset_id,
      "signed_voice_delivery_required",
      "An actual creator-signed recording delivered to this conversation is required.",
    );
    const original = ProcessedMediaEvidenceSchema.parse(row.recording_evidence);
    invariant(
      original.assetId === row.recording_asset_id,
      "voice_delivery_changed",
      "The delivered recording association changed.",
    );
    // Hold current media through the fulfillment commit. W3's bounded reader
    // rechecks the exact original tuple, W6 provenance and private publication.
    const held = await client.query(
      "SELECT id FROM creator.media_asset WHERE id=$1 AND thread_id=$2 AND creator_id=$3 AND fan_id=$4 FOR SHARE",
      [original.assetId, scope.threadId, scope.creatorId, scope.fanId],
    );
    invariant(
      held.rowCount === 1,
      "signed_voice_delivery_required",
      "The delivered recording is unavailable.",
    );
    const command = ConversationRecordingCommandSchema.parse({
      actType: "reply",
      subjectId: scope.threadId,
      content: {
        mediaAssetId: original.assetId,
        version: original.version,
        sha256: original.sha256,
        mimeType: original.mimeType,
        durationMs: original.durationMs,
        bytes: original.bytes,
      },
    });
    const publication = await client.query(
      `SELECT sp.signed_act_id FROM creator.signed_publication sp
       JOIN creator.signed_act sa ON sa.id=sp.signed_act_id AND sa.account_id=sp.account_id
       JOIN creator.signed_act_consumption sac ON sac.signed_act_id=sa.id AND sac.account_id=sa.account_id
       WHERE sa.id=$1 AND sa.account_id=$2 AND sa.creator_id=$3 AND sa.act_type='reply'
       AND sa.subject_id=$4 AND sa.content_hash=$5 AND sp.command=$6::jsonb
       AND sp.withdrawn_at IS NULL FOR SHARE OF sp`,
      [
        row.signedActId,
        scope.creatorAccountId,
        scope.creatorId,
        scope.threadId,
        contentHash(command),
        JSON.stringify(command),
      ],
    );
    invariant(
      publication.rowCount === 1,
      "signed_voice_delivery_required",
      "The exact recording publication is unavailable.",
    );
    const view = {
      id: row.id,
      threadId: row.threadId,
      authorKind: row.authorKind,
      text: row.text,
      deliveryState: row.deliveryState,
      controlEpoch: row.controlEpoch,
      sequence: row.sequence,
      signedActId: row.signedActId,
      authorAccountId: row.authorAccountId,
      citations: row.citations,
      createdAt: row.createdAt,
      member: row.member,
      offTheRecord: row.offTheRecord,
      version: row.version,
    };
    const [current] = await this.recordings.enrich(scope, client, [
      ConversationMessageSchema.parse(view),
    ]);
    invariant(
      current?.recording?.state === "available" &&
        current.recording.asset.id === original.assetId &&
        current.recording.asset.signedActId === row.signedActId,
      "signed_voice_delivery_required",
      "The exact signed recording needs current media and publication authority.",
    );
    return {
      messageId: row.id as string,
      messageVersion: row.version as number,
      signedActId: row.signedActId as string,
      authorKind: "human_creator",
      kind: "voice_note",
      media: original,
      contentHash: contentHash({ media: original }),
    };
  }
}
