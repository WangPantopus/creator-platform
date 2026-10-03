import type { PoolClient } from "pg";
import type { Database } from "../../db/database.js";
import { invariant } from "../../core/errors.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";
import type { ApprovedSentence } from "../agent/runtime.js";
import type { ConversationPrivacyFamily } from "./privacy.js";
import type { ConversationRecordings } from "./recordings.js";
import type { ConversationLineageProjection } from "./lineage-projection.js";
import { IdentityIntroOffers } from "../identity/intro-offers.js";
import { IdSchema } from "@qelvora/api";
import {
  ConversationMessageSchema,
  ReplyFeedbackInputSchema,
  ReplyFeedbackPolicySchema,
  ReplyFeedbackResultSchema,
  ConversationIntroOfferSchema,
  type ReplyFeedbackPolicy,
  type ConversationMessage,
} from "../../../../../packages/api/src/conversation/contracts.js";

const lineageChecksum =
  "1044700d59b9dbb2d2b36d890496de0be6fb3d53c4409504f3c7693906866c35";
const feedbackChecksum =
  "08cb6f37c12ca3131b2e307a237569aa4d104fc627566e619a39fa18a1814d11";

/** W8 supplies a current approved notice and the actual retention expiry.
 * No duration, marketing use or policy approval is invented by W3. */
export interface ReplyFeedbackAuthority {
  current(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<ReplyFeedbackPolicy | null>;
  consent(
    scope: ThreadScope,
    client: PoolClient,
    policyVersion: string,
  ): Promise<{
    policy: ReplyFeedbackPolicy;
    expiresAt: string;
  }>;
}

export class ConversationLineage {
  private introOffers?: IdentityIntroOffers;
  configureIntroOffers(introOffers: IdentityIntroOffers) {
    invariant(
      !this.introOffers && introOffers instanceof IdentityIntroOffers,
      "intro_offer_unconfigured",
      "Intro offers require their actual prepared account authority.",
    );
    introOffers.assertPool(this.db.pool);
    this.introOffers = introOffers;
  }
  async pendingIntroOffer(scope: ThreadScope) {
    assertThreadScope(scope);
    invariant(
      scope.authority === "fan" && this.introOffers,
      "intro_offer_unavailable",
      "Your intro offer is unavailable. Try again.",
    );
    return this.db.withThread(scope, async (client) =>
      ConversationIntroOfferSchema.parse(
        await this.introOffers!.pendingInTransaction(scope, client),
      ),
    );
  }
  async acknowledgeIntroOffer(scope: ThreadScope, offerId: string) {
    assertThreadScope(scope);
    invariant(
      scope.authority === "fan" && this.introOffers,
      "intro_offer_unavailable",
      "Your intro offer is unavailable. Try again.",
    );
    return this.db.withThread(
      scope,
      async (client) => {
        await this.introOffers!.acknowledgeInTransaction(
          scope,
          client,
          IdSchema.parse(offerId),
        );
        return { acknowledged: true as const };
      },
      "write",
    );
  }
  private recordings?: ConversationRecordings;
  configureRecordings(recordings: ConversationRecordings) {
    invariant(
      !this.recordings,
      "recordings_already_configured",
      "Recording lineage is already configured.",
    );
    recordings.assertPool(this.db.pool);
    this.recordings = recordings;
  }
  private constructor(
    private readonly db: Database,
    private readonly feedbackAuthority?: ReplyFeedbackAuthority,
    private readonly feedbackConsentReady = false,
  ) {}
  assertPool(pool: Database["pool"]) {
    invariant(
      pool === this.db.pool,
      "lineage_pool_mismatch",
      "Message lineage requires its actual prepared database pool.",
    );
  }
  projection(): ConversationLineageProjection {
    return Object.freeze({
      assertPool: this.assertPool.bind(this),
      project: this.project.bind(this),
      enrich: this.enrich.bind(this),
    });
  }
  /** The host passes W8's real allocated versions/checksums. Catalog readiness
   * and registered bytes are checked before new columns are ever queried. */
  static async prepare(input: {
    database: Database;
    migrationVersion: string;
    feedbackMigration?: { version: string; checksum: string };
    feedbackAuthority?: ReplyFeedbackAuthority;
  }): Promise<ConversationLineage | undefined> {
    const { pool } = input.database;
    const relation = (
      await pool.query(
        "SELECT to_regclass('creator.schema_migration') AS migration,to_regclass('creator.conversation_feedback') AS feedback",
      )
    ).rows[0];
    if (!relation?.migration || !relation.feedback) return undefined;
    const base = (
      await pool.query<{ ready: boolean }>(
        `SELECT count(*)=5 AS ready FROM information_schema.columns
         WHERE table_schema='creator' AND table_name='message'
         AND (column_name,data_type) IN (('citations','ARRAY'),('off_the_record','boolean'),
          ('team_member','text'),('version','integer'),('created_at','timestamp with time zone'))`,
      )
    ).rows[0];
    if (!base?.ready) return undefined;
    const migration = await pool.query(
      "SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
      [input.migrationVersion, lineageChecksum],
    );
    if (migration.rowCount !== 1) return undefined;
    const table = (
      await pool.query(
        "SELECT c.relrowsecurity,c.relforcerowsecurity,c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user) AS owns FROM pg_class c WHERE c.oid=to_regclass('creator.conversation_feedback')",
      )
    ).rows[0];
    invariant(
      table?.relrowsecurity && table.relforcerowsecurity && !table.owns,
      "unsafe_feedback_role",
      "Feedback requires a non-owner role with enforced row security.",
    );
    await input.database.assertRuntimeRole();
    let authority: ReplyFeedbackAuthority | undefined;
    let consentReady = false;
    if (input.feedbackMigration?.checksum === feedbackChecksum) {
      const consent = await pool.query(
        "SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2",
        [input.feedbackMigration.version, input.feedbackMigration.checksum],
      );
      const columns = await pool.query(
        "SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('creator.conversation_feedback') AND attname=ANY($1::text[]) AND NOT attisdropped",
        [["consent_policy_version", "consented_at", "expires_at"]],
      );
      if (consent.rowCount === 1 && columns.rowCount === 3) {
        consentReady = true;
        authority = input.feedbackAuthority;
      }
    }
    return new ConversationLineage(input.database, authority, consentReady);
  }
  /** Called only after W8 has verified the job/family on this same client.
   * Lifecycle family identifiers never become interactive ThreadScopes. */
  async exportMetadata(client: PoolClient, family: ConversationPrivacyFamily) {
    const pair = [family.threadId, family.creatorId, family.fanId];
    const messages = (
      await client.query(
        `SELECT id,agent_version_id,agent_version_hash,corrects_message_id,corrects_message_version,signed_command
       FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY sequence LIMIT 2001`,
        pair,
      )
    ).rows;
    const feedback = (
      await client.query(
        `SELECT message_id,message_version,account_id,rating,agent_version_id,agent_version_hash,created_at,updated_at${this.feedbackConsentReady ? ",consent_policy_version,consented_at,expires_at" : ""}
       FROM creator.conversation_feedback WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY message_id,account_id LIMIT 2001`,
        pair,
      )
    ).rows;
    invariant(
      messages.length <= 2000 && feedback.length <= 2000,
      "bounded_subjob_required",
      "This export needs a paginated lineage subjob.",
    );
    return { messages, feedback };
  }
  async prepareDeletion(
    client: PoolClient,
    family: ConversationPrivacyFamily,
    retainedMessageIds: readonly string[],
  ) {
    const pair = [family.threadId, family.creatorId, family.fanId];
    const links = (
      await client.query<{ corrects_message_id: string }>(
        "SELECT corrects_message_id FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND id=ANY($4::uuid[]) AND corrects_message_id IS NOT NULL LIMIT 2001",
        [...pair, retainedMessageIds],
      )
    ).rows;
    const kept = new Set(retainedMessageIds);
    invariant(
      links.length <= 2000 &&
        links.every((link) => kept.has(link.corrects_message_id)),
      "retention_scope_invalid",
      "Authorized correction retention must include its exact original target.",
    );
    const count = (
      await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM (SELECT 1 FROM creator.conversation_feedback WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 LIMIT 2001) bounded",
        pair,
      )
    ).rows[0];
    invariant(
      Number(count?.count) <= 2000,
      "bounded_subjob_required",
      "This deletion needs a bounded feedback subjob.",
    );
    await client.query(
      "DELETE FROM creator.conversation_feedback WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3",
      pair,
    );
  }
  async pinApproved(
    scope: ThreadScope,
    client: PoolClient,
    messageId: string,
    sentence: ApprovedSentence,
  ) {
    assertThreadScope(scope);
    const written = await client.query(
      `UPDATE creator.message SET agent_version_id=$5,agent_version_hash=$6
       WHERE id=$4 AND thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND author_kind='ai'
       AND ((agent_version_id IS NULL AND agent_version_hash IS NULL AND text='') OR
         (agent_version_id=$5 AND agent_version_hash=$6)) RETURNING id`,
      [
        scope.threadId,
        scope.creatorId,
        scope.fanId,
        messageId,
        sentence.versionId,
        sentence.versionHash,
      ],
    );
    invariant(
      written.rowCount === 1,
      "reply_version_changed",
      "This reply's approved version changed.",
    );
  }
  async policy(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<ReplyFeedbackPolicy | null> {
    assertThreadScope(scope);
    if (scope.authority !== "fan" || !this.feedbackAuthority) return null;
    const policy = await this.feedbackAuthority.current(scope, client);
    return policy ? ReplyFeedbackPolicySchema.parse(policy) : null;
  }
  /** Studio can supply its actual bounded page IDs without inventing metadata
   * absent from its older Message type. This reads only the prepared schema on
   * its existing scoped client, retaining page order and complete visibility. */
  async project(
    scope: ThreadScope,
    client: PoolClient,
    messageIds: readonly string[],
  ): Promise<ConversationMessage[]> {
    assertThreadScope(scope);
    invariant(
      messageIds.length <= 100 &&
        new Set(messageIds).size === messageIds.length,
      "bounded_lineage_required",
      "Load a bounded distinct message page.",
    );
    for (const id of messageIds) IdSchema.parse(id);
    if (!messageIds.length) return [];
    const rows = await client.query(
      `SELECT id,thread_id AS "threadId",author_kind AS "authorKind",text,
       delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,
       signed_act_id AS "signedActId",author_account_id AS "authorAccountId",citations,
       created_at::text AS "createdAt",team_member AS member,off_the_record AS "offTheRecord",version
       FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3
       AND id=ANY($4::uuid[]) ORDER BY array_position($4::uuid[],id)`,
      [scope.threadId, scope.creatorId, scope.fanId, messageIds],
    );
    invariant(
      rows.rowCount === messageIds.length,
      "lineage_page_changed",
      "Refresh this conversation's current visible message page.",
    );
    return this.enrich(
      scope,
      client,
      rows.rows.map((row) => ConversationMessageSchema.parse(row)),
    );
  }
  async enrich(
    scope: ThreadScope,
    client: PoolClient,
    messages: readonly ConversationMessage[],
  ): Promise<ConversationMessage[]> {
    assertThreadScope(scope);
    invariant(
      messages.length <= 100,
      "bounded_lineage_required",
      "Load a bounded message page.",
    );
    if (!messages.length) return [];
    const rows = await client.query<{
      id: string;
      agent_version_id: string | null;
      agent_version_hash: string | null;
      corrects_message_id: string | null;
      corrects_message_version: number | null;
    }>(
      "SELECT id,agent_version_id,agent_version_hash,corrects_message_id,corrects_message_version FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND id=ANY($4::uuid[])",
      [
        scope.threadId,
        scope.creatorId,
        scope.fanId,
        messages.map((message) => message.id),
      ],
    );
    const versions = new Map(rows.rows.map((row) => [row.id, row]));
    const feedback =
      this.feedbackConsentReady && scope.authority === "fan"
        ? await client.query<{
            message_id: string;
            rating: "helpful" | "not_helpful";
          }>(
            "SELECT message_id,rating FROM creator.conversation_feedback WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND account_id=$4 AND message_id=ANY($5::uuid[]) AND consent_policy_version IS NOT NULL AND expires_at>now()",
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              scope.actorAccountId,
              messages.map((message) => message.id),
            ],
          )
        : { rows: [] };
    const ratings = new Map(
      feedback.rows.map((row) => [row.message_id, row.rating]),
    );
    const enriched = messages.map((message) => {
      const row = versions.get(message.id);
      return {
        ...message,
        agentVersion:
          row?.agent_version_id && row.agent_version_hash
            ? { id: row.agent_version_id, hash: row.agent_version_hash }
            : null,
        feedback: ratings.get(message.id) ?? null,
        correction:
          row?.corrects_message_id && row.corrects_message_version
            ? {
                originalMessageId: row.corrects_message_id,
                originalVersion: row.corrects_message_version,
              }
            : null,
      };
    });
    return this.recordings
      ? this.recordings.enrich(scope, client, enriched)
      : enriched;
  }
  async feedback(scope: ThreadScope, messageId: string, raw: unknown) {
    assertThreadScope(scope);
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can respond to their reply.",
    );
    const body = ReplyFeedbackInputSchema.parse(raw);
    return this.db.withThread(
      scope,
      async (client) => {
        const current = await client.query(
          `SELECT id FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND id=$4
         AND version=$5 AND agent_version_id=$6 AND agent_version_hash=$7 AND author_kind='ai'
         AND delivery_state IN('delivered','interrupted') AND length(trim(text))>0 FOR SHARE`,
          [
            scope.threadId,
            scope.creatorId,
            scope.fanId,
            messageId,
            body.messageVersion,
            body.agentVersion.id,
            body.agentVersion.hash,
          ],
        );
        invariant(
          current.rowCount === 1,
          "reply_feedback_unavailable",
          "This exact delivered AI reply is unavailable.",
        );
        if (body.rating === null) {
          await client.query(
            "DELETE FROM creator.conversation_feedback WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND message_id=$4 AND account_id=$5",
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              messageId,
              scope.actorAccountId,
            ],
          );
          return ReplyFeedbackResultSchema.parse({
            rating: null,
            introOffer: null,
          });
        }
        invariant(
          this.feedbackAuthority,
          "feedback_unavailable",
          "Feedback is not available yet.",
        );
        const consent = await this.feedbackAuthority.consent(
          scope,
          client,
          body.policyVersion!,
        );
        const policy = ReplyFeedbackPolicySchema.parse(consent.policy);
        invariant(
          policy.version === body.policyVersion &&
            Number.isFinite(Date.parse(consent.expiresAt)) &&
            Date.parse(consent.expiresAt) > Date.now(),
          "feedback_consent_changed",
          "Review the current feedback notice before sending.",
        );
        await client.query(
          `INSERT INTO creator.conversation_feedback(thread_id,creator_id,fan_id,message_id,message_version,account_id,rating,agent_version_id,agent_version_hash,consent_policy_version,consented_at,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11)
         ON CONFLICT(message_id,account_id) DO UPDATE SET rating=EXCLUDED.rating,consent_policy_version=EXCLUDED.consent_policy_version,consented_at=EXCLUDED.consented_at,expires_at=EXCLUDED.expires_at,updated_at=now()`,
          [
            scope.threadId,
            scope.creatorId,
            scope.fanId,
            messageId,
            body.messageVersion,
            scope.actorAccountId,
            body.rating,
            body.agentVersion.id,
            body.agentVersion.hash,
            policy.version,
            consent.expiresAt,
          ],
        );
        // Await the owner's operation inside this original write. A response
        // only records eligibility; the actual Save/Skip has its own receipt.
        const introOffer =
          body.rating === "helpful" && this.introOffers
            ? await this.introOffers.afterHelpfulInTransaction(scope, client, {
                messageId,
                messageVersion: body.messageVersion,
                agentVersionId: body.agentVersion.id,
                agentVersionHash: body.agentVersion.hash,
              })
            : null;
        return ReplyFeedbackResultSchema.parse({
          rating: body.rating,
          introOffer,
        });
      },
      "write",
    );
  }
}
