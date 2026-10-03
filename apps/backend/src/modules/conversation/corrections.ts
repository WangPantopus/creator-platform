import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import { registeredMigration } from "../../db/reviewed-migration.js";
import { invariant } from "../../core/errors.js";
import { idempotent } from "../../core/idempotency.js";
import { appendFrame } from "../../core/outbox.js";
import type { Actor } from "../identity/adapter.js";
import {
  consumeCreatorSignedAct,
  type SignedSubjectPolicy,
} from "../identity/subjects.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import {
  ConversationCorrectionCommandSchema,
  ConversationCorrectionInputSchema,
} from "../../../../../packages/api/src/conversation/contracts.js";

const correctionSource = Object.freeze({
  path: "apps/backend/src/modules/conversation/migrations/pending_w3_correction_signature.sql",
  owner: "W3",
  name: "w3_correction_signature",
  checksum: "5c94b94a7287a5c4a149da454117c30be40367034b9930ac11e168e5b6a4b3e0",
});
type Command = ReturnType<typeof ConversationCorrectionCommandSchema.parse>;

/** A correction is a new creator-signed attachment to an exact AI original.
 * Preparation does not apply SQL, issue a passkey assertion or disclose private
 * publication content. W1/W8 supply the canonical signing and denial custody. */
export class ConversationCorrections {
  private constructor(
    private readonly db: Database,
    private readonly access: AccessService,
  ) {}
  static async prepare(input: {
    database: Database;
    access: AccessService;
    migrationVersion: string;
  }) {
    if (!input.access.threadScopeInTransactionAvailable) return undefined;
    const migration = await registeredMigration(correctionSource);
    if (!migration || input.migrationVersion !== migration.version)
      return undefined;
    const installed = (
      await input.database.pool.query(
        "SELECT to_regclass('creator.schema_migration') AS migration,to_regclass('creator.conversation_feedback') AS lineage",
      )
    ).rows[0];
    if (!installed?.migration || !installed.lineage) return undefined;
    const registered = await input.database.pool.query(
      "SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
      [input.migrationVersion, migration.checksum],
    );
    if (registered.rowCount !== 1) return undefined;
    const exact = await input.database.pool.query(
      `SELECT 1 FROM pg_constraint WHERE conrelid='creator.message'::regclass
       AND conname='message_correction_exact_version_family' AND contype='f' AND convalidated`,
    );
    const unique = (
      await input.database.pool.query(
        "SELECT indisunique,indisvalid FROM pg_index WHERE indexrelid=to_regclass('creator.message_correction_signed_act')",
      )
    ).rows[0];
    invariant(
      exact.rowCount === 1 && unique?.indisunique && unique.indisvalid,
      "correction_schema_unavailable",
      "The registered exact-version correction schema is required.",
    );
    await input.database.assertRuntimeRole();
    return new ConversationCorrections(input.database, input.access);
  }
  private async original(
    client: PoolClient,
    scope: ThreadScope,
    command: Command,
  ) {
    invariant(
      scope.authority === "creator" &&
        command.content.creatorId === scope.creatorId &&
        command.content.fanId === scope.fanId &&
        command.content.threadId === scope.threadId,
      "correction_scope_invalid",
      "Only the current creator can correct this exact conversation reply.",
    );
    const original = await client.query(
      `SELECT id FROM creator.message WHERE id=$4 AND thread_id=$1 AND creator_id=$2 AND fan_id=$3
       AND version=$5 AND author_kind='ai' AND delivery_state IN('delivered','interrupted') AND length(trim(text))>0 FOR SHARE`,
      [
        scope.threadId,
        scope.creatorId,
        scope.fanId,
        command.subjectId,
        command.content.messageVersion,
      ],
    );
    invariant(
      original.rowCount === 1,
      "correction_original_changed",
      "Review the exact delivered AI original before signing its correction.",
    );
  }
  signedSubjectPolicy(): SignedSubjectPolicy {
    return {
      name: "conversation.correction",
      prepare: async (client, actor, creatorId, requested) => {
        if (
          requested.actType !== "correction" ||
          typeof requested.content !== "object" ||
          requested.content === null ||
          Array.isArray(requested.content) ||
          requested.content.kind !== "conversation_correction"
        )
          return null;
        const command = ConversationCorrectionCommandSchema.parse(requested);
        invariant(
          command.content.creatorId === creatorId,
          "correction_scope_invalid",
          "The correction must belong to this creator.",
        );
        const scope = await this.access.openThreadInTransaction(
          client,
          actor,
          creatorId,
          command.content.fanId,
          true,
          "write",
        );
        await this.original(client, scope, command);
        return command;
      },
    };
  }
  async deliver(
    actor: Actor,
    creatorId: string,
    fanId: string,
    originalId: string,
    raw: unknown,
  ) {
    const body = ConversationCorrectionInputSchema.parse(raw);
    invariant(
      body.command.subjectId === originalId &&
        body.command.content.creatorId === creatorId &&
        body.command.content.fanId === fanId,
      "correction_scope_invalid",
      "The correction's reviewed destination changed.",
    );
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
        scope.authority === "creator",
        "creator_required",
        "Only the creator can publish a correction.",
      );
      const response = await idempotent(
        client,
        scope,
        "conversation_correction",
        body.idempotencyKey,
        body,
        async () => {
          await this.original(client, scope, body.command);
          const active = await client.query(
            "SELECT id FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('queued','generating') LIMIT 1",
            [scope.threadId, scope.creatorId, scope.fanId],
          );
          invariant(
            !active.rowCount,
            "reply_in_progress",
            "Wait for the current reply before attaching this correction.",
          );
          const hash = await consumeCreatorSignedAct(
            client,
            actor,
            creatorId,
            body.signedActId,
            body.command,
          );
          const sequence = (
            await client.query<{
              message_sequence: number;
              control_epoch: number;
            }>(
              "UPDATE creator.thread SET message_sequence=message_sequence+1,revision=revision+1 WHERE id=$1 AND creator_id=$2 AND fan_id=$3 AND deleted_at IS NULL RETURNING message_sequence,control_epoch",
              [scope.threadId, scope.creatorId, scope.fanId],
            )
          ).rows[0];
          invariant(
            sequence,
            "thread_unavailable",
            "This conversation is unavailable.",
          );
          const id = randomUUID();
          await client.query(
            `INSERT INTO creator.message(id,thread_id,creator_id,fan_id,author_kind,author_account_id,text,delivery_state,control_epoch,sequence,signed_act_id,signed_content_hash,signed_command,corrects_message_id,corrects_message_version,off_the_record)
           VALUES($1,$2,$3,$4,'human_creator',$5,$6,'delivered',$7,$8,$9,$10,$11,$12,$13,(SELECT off_the_record FROM creator.thread WHERE id=$2 AND creator_id=$3 AND fan_id=$4))`,
            [
              id,
              scope.threadId,
              creatorId,
              fanId,
              actor.accountId,
              body.command.content.text,
              sequence.control_epoch,
              sequence.message_sequence,
              body.signedActId,
              hash,
              JSON.stringify(body.command),
              originalId,
              body.command.content.messageVersion,
            ],
          );
          await appendFrame(client, scope, {
            epoch: sequence.control_epoch,
            kind: "delivered",
            messageId: id,
            authorKind: "human_creator",
            text: body.command.content.text,
            generationId: null,
            sequence: 0,
          });
          return {
            messageId: id,
            threadId: scope.threadId,
            originalMessageId: originalId,
            originalVersion: body.command.content.messageVersion,
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
}
