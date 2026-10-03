import { z } from "zod";
import type { PoolClient } from "pg";
import { Database } from "../../db/database.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { ThreadScope } from "../access/scope.js";
import { assertCurrentSession } from "./request-authority.js";

const HelpfulReply = z.strictObject({
  messageId: z.uuid(),
  messageVersion: z.int().positive(),
  agentVersionId: z.uuid(),
  agentVersionHash: z.string().regex(/^[a-f0-9]{64}$/u),
});
export type HelpfulReplyIdentity = Readonly<z.infer<typeof HelpfulReply>>;
export type IntroOfferDecision = Readonly<{ offerId: string | null }>;
/** Actual W8 approved retention/use of this minimal account-level offer
 * acknowledgement. Existing feedback consent does not grant provider use of
 * an intro, marketing consent or an invented retention duration. */
export type IntroOfferPolicy = (
  scope: ThreadScope,
  client: PoolClient,
  consent: Readonly<{ policyVersion: string; expiresAt: string }>,
) => Promise<void>;

/** W3 invokes only after its actual explicit helpful feedback INSERT/UPDATE,
 * inside its original held write. No delivery/LLM heuristic or old feedback is
 * backfilled. A normal account profile edit remains available independently. */
export class IdentityIntroOffers {
  private constructor(
    private readonly database: Database,
    private readonly assertOfferAllowed: IntroOfferPolicy,
  ) {}

  static async prepare(input: {
    database: Database;
    assertOfferAllowed: IntroOfferPolicy;
  }): Promise<IdentityIntroOffers> {
    invariant(
      input.database instanceof Database &&
        input.database.threadScopeInTransactionAvailable &&
        typeof input.assertOfferAllowed === "function",
      "intro_offer_unconfigured",
      "Current intro offer authority is unavailable.",
    );
    const ready = (
      await input.database.pool.query<{ ready: boolean }>(
        `SELECT current_user='creator_runtime' AND session_user=current_user
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0056_w3_correction_feedback_lineage'
          AND checksum='1044700d59b9dbb2d2b36d890496de0be6fb3d53c4409504f3c7693906866c35')
         AND EXISTS(SELECT FROM creator.schema_migration WHERE version='0057_w3_feedback_consent'
          AND checksum='08cb6f37c12ca3131b2e307a237569aa4d104fc627566e619a39fa18a1814d11')
         AND (SELECT count(*)=2 FROM pg_class WHERE oid IN(to_regclass('creator.conversation_feedback'),
          to_regclass('creator.identity_event')) AND relrowsecurity AND relforcerowsecurity
          AND pg_get_userbyid(relowner)='creator_owner') AS ready`,
      )
    ).rows[0]?.ready;
    invariant(
      ready === true,
      "intro_offer_unconfigured",
      "Reviewed helpful-reply and account event custody is unavailable.",
    );
    return new IdentityIntroOffers(input.database, input.assertOfferAllowed);
  }

  assertPool(pool: Database["pool"]): void {
    invariant(
      pool === this.database.pool,
      "intro_offer_unconfigured",
      "Intro offers require their actual account and conversation pool.",
    );
  }

  private async contain<T>(
    scope: ThreadScope,
    client: PoolClient,
    work: () => Promise<T>,
  ): Promise<T> {
    try {
      return await this.database.withHeldThreadOperation(scope, client, work);
    } catch (error) {
      if (
        error instanceof z.ZodError ||
        (error &&
          typeof error === "object" &&
          "code" in error &&
          ["55P03", "57014", "55000", "42P01", "42703", "42501"].includes(
            String(error.code),
          ))
      )
        throw new DomainError(
          "intro_offer_unavailable",
          "Your intro offer is unavailable. Try again.",
          503,
        );
      throw error;
    }
  }

  /** Resume only the still-pending offer for this actual authorized reply
   * family. An expired/withdrawn feedback consent produces no offer. */
  async pendingInTransaction(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<IntroOfferDecision> {
    return this.contain(scope, client, () => this.readPending(scope, client));
  }
  private async readPending(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<IntroOfferDecision> {
    this.database.assertHeldThread(scope, client);
    if (
      scope.authority !== "fan" ||
      scope.actorAccountId !== scope.fanAccountId
    )
      return Object.freeze({ offerId: null });
    await assertCurrentSession(client, scope.actorAccountId);
    const row = (
      await client.query<{
        id: string;
        policy_version: string;
        expires_at: Date;
      }>(
        `SELECT e.id,f.consent_policy_version AS policy_version,f.expires_at
       FROM creator.identity_event e JOIN creator.conversation_feedback f
        ON f.message_id=e.aggregate_id AND f.message_version=e.version AND f.account_id=e.account_id
       JOIN creator.message m ON m.id=f.message_id AND m.thread_id=f.thread_id AND m.creator_id=f.creator_id AND m.fan_id=f.fan_id
       JOIN creator.fan_profile p ON p.id=f.fan_id AND p.account_id=e.account_id
       WHERE e.account_id=$1 AND e.kind='fan_intro_offer'
        AND NOT EXISTS(SELECT FROM creator.identity_event ack WHERE ack.account_id=e.account_id
         AND ack.kind='fan_intro_offer_acknowledged' AND ack.aggregate_id=e.id)
        AND f.thread_id=$2 AND f.creator_id=$3 AND f.fan_id=$4 AND f.rating='helpful'
        AND f.consent_policy_version IS NOT NULL AND f.consented_at IS NOT NULL AND f.expires_at>clock_timestamp()
        AND m.version=f.message_version AND m.agent_version_id=f.agent_version_id AND m.agent_version_hash=f.agent_version_hash
        AND m.author_kind='ai' AND m.delivery_state IN('delivered','interrupted')
       ORDER BY e.created_at,e.id LIMIT 1 FOR SHARE OF e,f,m NOWAIT`,
        [scope.actorAccountId, scope.threadId, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    if (!row) return Object.freeze({ offerId: null });
    await this.assertOfferAllowed(
      scope,
      client,
      Object.freeze({
        policyVersion: row.policy_version,
        expiresAt: row.expires_at.toISOString(),
      }),
    );
    await assertCurrentSession(client, scope.actorAccountId);
    this.database.assertHeldThread(scope, client);
    return Object.freeze({ offerId: z.uuid().parse(row.id) });
  }

  async afterHelpfulInTransaction(
    scope: ThreadScope,
    client: PoolClient,
    raw: HelpfulReplyIdentity,
  ): Promise<IntroOfferDecision> {
    return this.contain(scope, client, () =>
      this.recordHelpful(scope, client, raw),
    );
  }
  private async recordHelpful(
    scope: ThreadScope,
    client: PoolClient,
    raw: HelpfulReplyIdentity,
  ): Promise<IntroOfferDecision> {
    this.database.assertHeldThread(scope, client, "write");
    invariant(
      scope.authority === "fan" && scope.actorAccountId === scope.fanAccountId,
      "fan_required",
      "Only the fan can respond to their reply.",
    );
    const reply = HelpfulReply.parse(raw);
    await assertCurrentSession(client, scope.actorAccountId);
    const consent = (
      await client.query<{ policy_version: string; expires_at: Date }>(
        `SELECT f.consent_policy_version AS policy_version,f.expires_at
         FROM creator.conversation_feedback f JOIN creator.message m
          ON m.id=f.message_id AND m.thread_id=f.thread_id AND m.creator_id=f.creator_id AND m.fan_id=f.fan_id
         WHERE f.thread_id=$1 AND f.creator_id=$2 AND f.fan_id=$3 AND f.account_id=$4
          AND f.message_id=$5 AND f.message_version=$6 AND f.agent_version_id=$7 AND f.agent_version_hash=$8
          AND f.rating='helpful' AND f.consented_at IS NOT NULL AND f.consent_policy_version IS NOT NULL
          AND f.expires_at>clock_timestamp() AND f.consented_at<=clock_timestamp()
          AND f.xmin::text::bigint=(pg_current_xact_id()::text::numeric % 4294967296)::bigint
          AND m.version=f.message_version AND m.agent_version_id=f.agent_version_id AND m.agent_version_hash=f.agent_version_hash
          AND m.author_kind='ai' AND m.delivery_state IN('delivered','interrupted')
         FOR SHARE OF f,m NOWAIT`,
        [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          scope.actorAccountId,
          reply.messageId,
          reply.messageVersion,
          reply.agentVersionId,
          reply.agentVersionHash,
        ],
      )
    ).rows[0];
    invariant(
      consent && consent.expires_at instanceof Date,
      "intro_offer_unavailable",
      "An explicit current helpful reply is required.",
    );
    const policy = Object.freeze({
      policyVersion: consent.policy_version,
      expiresAt: consent.expires_at.toISOString(),
    });
    await this.assertOfferAllowed(scope, client, policy);
    // saveFan uses this exact account key before its profile write. A late
    // waiting lease would invert its order against the already held fan row.
    const lock = (
      await client.query<{ held: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS held",
        [scope.actorAccountId],
      )
    ).rows[0]?.held;
    if (!lock)
      throw new DomainError(
        "intro_offer_busy",
        "Your profile is changing. Try again.",
        503,
      );
    const existing = await client.query<{
      id: string;
      acknowledged: boolean;
      kind: string;
    }>(
      "SELECT e.id,e.kind,EXISTS(SELECT FROM creator.identity_event ack WHERE ack.account_id=e.account_id AND ack.kind='fan_intro_offer_acknowledged' AND ack.aggregate_id=e.id) AS acknowledged FROM creator.identity_event e WHERE e.account_id=$1 AND e.kind IN('fan_intro_offer','fan_intro_offer_suppressed') ORDER BY e.created_at,e.id LIMIT 1",
      [scope.actorAccountId],
    );
    const fan = (
      await client.query<{ filled: boolean }>(
        "SELECT length(trim(intro))>0 AS filled FROM creator.fan_profile WHERE id=$1 AND account_id=$2 FOR SHARE NOWAIT",
        [scope.fanId, scope.actorAccountId],
      )
    ).rows[0];
    invariant(
      fan,
      "intro_offer_unavailable",
      "Your current profile is unavailable.",
    );
    const prior = existing.rows[0];
    if (prior) {
      await this.assertOfferAllowed(scope, client, policy);
      // Only an explicit disposition may acknowledge the original offer.
      // A filled intro can mean a lost Save response, not a dismissed UI.
      return prior.kind === "fan_intro_offer" && !prior.acknowledged
        ? this.readPending(scope, client)
        : Object.freeze({ offerId: null });
    }
    this.database.assertHeldThread(scope, client, "write");
    const event = await client.query<{ id: string }>(
      `INSERT INTO creator.identity_event(account_id,kind,aggregate_id,version)
       VALUES($1,$2,$3,$4) RETURNING id`,
      [
        scope.actorAccountId,
        fan.filled ? "fan_intro_offer_suppressed" : "fan_intro_offer",
        reply.messageId,
        reply.messageVersion,
      ],
    );
    await this.assertOfferAllowed(scope, client, policy);
    await assertCurrentSession(client, scope.actorAccountId);
    this.database.assertHeldThread(scope, client, "write");
    return Object.freeze({
      offerId: fan.filled ? null : z.uuid().parse(event.rows[0]?.id),
    });
  }

  /** A returned decision is only committed eligibility. The UI explicitly
   * acknowledges its actual Save/Skip disposition; a lost response remains
   * the same pending offer instead of consuming an unseen one-time prompt. */
  async acknowledgeInTransaction(
    scope: ThreadScope,
    client: PoolClient,
    offerId: string,
  ): Promise<void> {
    return this.contain(scope, client, () =>
      this.acknowledge(scope, client, offerId),
    );
  }
  private async acknowledge(
    scope: ThreadScope,
    client: PoolClient,
    offerId: string,
  ): Promise<void> {
    this.database.assertHeldThread(scope, client, "write");
    invariant(
      scope.authority === "fan" && scope.actorAccountId === scope.fanAccountId,
      "fan_required",
      "Only the fan can respond to their intro offer.",
    );
    await assertCurrentSession(client, scope.actorAccountId);
    const lock = (
      await client.query<{ held: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS held",
        [scope.actorAccountId],
      )
    ).rows[0]?.held;
    if (!lock)
      throw new DomainError(
        "intro_offer_busy",
        "Your profile is changing. Try again.",
        503,
      );
    this.database.assertHeldThread(scope, client, "write");
    const result = await client.query<{ acknowledged: boolean }>(
      "SELECT EXISTS(SELECT FROM creator.identity_event ack WHERE ack.account_id=e.account_id AND ack.kind='fan_intro_offer_acknowledged' AND ack.aggregate_id=e.id) AS acknowledged FROM creator.identity_event e WHERE e.id=$1 AND e.account_id=$2 AND e.kind='fan_intro_offer'",
      [z.uuid().parse(offerId), scope.actorAccountId],
    );
    invariant(
      result.rowCount === 1,
      "intro_offer_unavailable",
      "Your intro offer is unavailable.",
    );
    if (!result.rows[0]!.acknowledged) {
      const pending = await this.readPending(scope, client);
      invariant(
        pending.offerId === offerId,
        "intro_offer_unavailable",
        "Your current intro offer is unavailable. Reopen the original conversation.",
      );
      this.database.assertHeldThread(scope, client, "write");
      await client.query(
        "INSERT INTO creator.identity_event(account_id,kind,aggregate_id,version) VALUES($1,'fan_intro_offer_acknowledged',$2,1)",
        [scope.actorAccountId, offerId],
      );
    }
    await assertCurrentSession(client, scope.actorAccountId);
    this.database.assertHeldThread(scope, client, "write");
  }
}
