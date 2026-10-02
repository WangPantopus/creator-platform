import type { ConversationSocketTickets } from "./realtime-tickets.js";
import { randomUUID } from "node:crypto";
import { ConversationOfflineIssuer } from "./offline.js";
import type { PoolClient } from "pg";
import { Router } from "express";
import type { FeatureRegistration } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { Actor } from "../identity/adapter.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import {
  assertThreadScope,
  type AccessService,
  type ThreadScope,
} from "../access/scope.js";
import { invariant, DomainError } from "../../core/errors.js";
import type { ConversationService } from "./service.js";
import type { MemoryService } from "./memory.js";
import {
  BeginConversationSchema,
  ConsentInputSchema,
  ThreadPreferencesSchema,
  ProviderPolicySchema,
  ConversationMessageSchema,
  ConversationAccountPageSchema,
  type ProviderPolicy,
  type ConversationPage,
} from "../../../../../packages/api/src/conversation/contracts.js";
import {
  IdSchema,
  SendMessageSchema,
  type AcceptedMessage,
} from "@qelvora/api";
import { needsImmediateSafety, crisisText } from "../agent/pipeline.js";
import { z } from "zod";
import { capabilitySnapshot } from "../access/commerce.js";
import type { ConversationWellbeing } from "./wellbeing.js";
import type { CommerceService } from "../commerce/service.js";
import type { ConversationLineage } from "./lineage.js";
import type { ConversationRecordings } from "./recordings.js";
import type { ConversationCorrections } from "./corrections.js";
import { DevelopmentConversationPolicy } from "./development-policy.js";
import {
  conversationHomeCursor,
  readConversationHomeCursor,
} from "./home-cursor.js";

export const accessDisclosure =
  "Conversations with a creator's AI can be read by that creator and their authorized team. Those accesses are logged. You can delete any conversation at any time.";
export class ConversationFeature {
  readonly policy: ProviderPolicy | null;
  constructor(
    readonly db: Database,
    readonly access: AccessService,
    readonly conversations: ConversationService,
    readonly memory: MemoryService,
    policy?: ProviderPolicy,
    readonly generationAvailable = false,
    readonly afterAcceptance?: (scope: ThreadScope) => void,
    readonly tickets?: ConversationSocketTickets,
    readonly citation?: (scope: ThreadScope, id: string) => Promise<unknown>,
    readonly wellbeing?: ConversationWellbeing,
    readonly firstConversation?: Pick<
      CommerceService,
      "pool" | "firstConversationAvailable" | "openTrialInTransaction"
    >,
    readonly routeSafety?: (
      scope: ThreadScope,
      text: string,
      signal: AbortSignal,
      deliver: (sentence: { text: string; safety: true }) => Promise<void>,
    ) => Promise<boolean>,
    readonly afterBoundary?: (scope: ThreadScope, epoch: number) => void,
    readonly lineage?: ConversationLineage,
    readonly corrections?: ConversationCorrections,
    readonly assertReady?: (
      scope: ThreadScope,
      client: import("pg").PoolClient,
    ) => Promise<void>,
    readonly recordings?: ConversationRecordings,
    readonly offlineIssuer?: ConversationOfflineIssuer,
    private readonly developmentPolicy?: DevelopmentConversationPolicy,
  ) {
    this.policy = policy ? ProviderPolicySchema.parse(policy) : null;
    invariant(
      !developmentPolicy ||
        (developmentPolicy instanceof DevelopmentConversationPolicy &&
          this.policy &&
          developmentPolicy.isFor(db.pool, this.policy)),
      "synthetic_policy_authority_required",
      "The development policy requires its actual configured conversation host.",
    );
  }
  policyAvailable(subject?: Actor | ThreadScope): boolean {
    if (this.policy?.verified) return true;
    if (
      !this.policy ||
      !this.developmentPolicy?.isFor(this.db.pool, this.policy)
    )
      return false;
    if (!subject) return true;
    if ("threadId" in subject) {
      assertThreadScope(subject);
      return this.developmentPolicy.allowsAccounts(
        subject.actorAccountId,
        subject.fanAccountId,
        subject.creatorAccountId,
      );
    }
    return (
      subject.adultEligible &&
      this.developmentPolicy.allowsAccounts(subject.accountId)
    );
  }
  capabilities() {
    return {
      providers: this.policy,
      developmentSynthetic: Boolean(
        this.developmentPolicy && this.policyAvailable(),
      ),
      consentAvailable:
        this.policyAvailable() &&
        (!this.developmentPolicy ||
          Boolean(this.generationAvailable && this.assertReady)),
      generationAvailable:
        this.generationAvailable &&
        Boolean(this.policyAvailable() && this.assertReady) &&
        this.access.threadScopeInTransactionAvailable,
      firstConversationAvailable:
        Boolean(this.firstConversation?.firstConversationAvailable) &&
        this.generationAvailable &&
        Boolean(this.policyAvailable() && this.assertReady) &&
        this.access.threadScopeInTransactionAvailable,
      correctionsAvailable: Boolean(this.corrections),
      recordingDeliveryAvailable: Boolean(this.recordings),
      offlineAvailable: Boolean(
        this.offlineIssuer &&
          this.assertReady &&
          this.policy?.verified &&
          this.access.threadScopeInTransactionAvailable,
      ),
      accessDisclosure,
    };
  }
  async begin(actor: Actor, raw: unknown) {
    const body = BeginConversationSchema.parse(raw);
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    invariant(
      this.policy &&
        this.policyAvailable(actor) &&
        body.policyVersion === this.policy.version,
      "providers_unconfigured",
      "AI provider policy is unavailable for this account.",
    );
    invariant(
      this.capabilities().generationAvailable,
      "generation_unavailable",
      "AI conversations are not available yet. No first conversation has started.",
    );
    const client = await this.db.pool.connect();
    let fanId: string;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        actor.accountId,
      ]);
      await assertCurrentSession(client, actor.accountId);
      const profile = (
        await client.query<{ id: string }>(
          "SELECT id FROM creator.fan_profile WHERE account_id=$1 FOR SHARE",
          [actor.accountId],
        )
      ).rows[0];
      invariant(
        profile,
        "fan_profile_required",
        "Choose your handle before starting a conversation.",
      );
      fanId = profile.id;
      const creator = (
        await client.query(
          "SELECT id FROM creator.creator_profile WHERE id=$1 AND verification='verified'",
          [body.creatorId],
        )
      ).rows[0];
      invariant(creator, "creator_unavailable", "This creator is unavailable.");
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
        [body.creatorId, fanId],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`thread:${body.creatorId}:${fanId}`],
      );
      const thread = (
        await client.query<{ id: string; deleted_at: Date | null }>(
          "SELECT id,deleted_at FROM creator.thread WHERE creator_id=$1 AND fan_id=$2 FOR UPDATE",
          [body.creatorId, fanId],
        )
      ).rows[0];
      invariant(
        !thread?.deleted_at,
        "thread_deleted",
        "This conversation was deleted. Contact support before starting it again.",
      );
      const threadId = thread?.id ?? randomUUID();
      if (!thread)
        await client.query(
          "INSERT INTO creator.thread(id,creator_id,fan_id,privacy_notice_at,processor_consent_version) VALUES($1,$2,$3,now(),$4)",
          [threadId, body.creatorId, fanId, this.policy.version],
        );
      else
        await client.query(
          "UPDATE creator.thread SET processor_consent_version=$1,privacy_notice_at=now(),revision=revision+1 WHERE id=$2 AND creator_id=$3 AND fan_id=$4 AND processor_consent_version IS DISTINCT FROM $1",
          [this.policy.version, threadId, body.creatorId, fanId],
        );
      const current = await this.access.openThreadInTransaction(
        client,
        actor,
        body.creatorId,
        fanId,
        false,
        "write",
      );
      invariant(
        current.authority === "fan",
        "fan_required",
        "Only the fan can begin this conversation.",
      );
      invariant(
        this.policyAvailable(current),
        "synthetic_accounts_required",
        "Development conversations are available only to the configured fictional accounts.",
      );
      // This exact transaction retains current license/source/budget locks.
      // Failure rolls back the thread, consent and any one-time trial together.
      await this.assertReady!(current, client);
      const access = await capabilitySnapshot(client, current);
      if (!access.capabilities.includes("ai_message")) {
        invariant(
          this.firstConversation?.firstConversationAvailable,
          "trial_unconfigured",
          "The first conversation is not available yet. No conversation has started.",
        );
        await this.firstConversation!.openTrialInTransaction(
          client,
          actor,
          body.creatorId,
          fanId,
        );
      }
      await client.query(
        "INSERT INTO creator.processor_consent(thread_id,creator_id,fan_id,account_id,version,providers) SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM creator.processor_consent WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND version=$5 AND withdrawn_at IS NULL)",
        [
          threadId,
          body.creatorId,
          fanId,
          actor.accountId,
          this.policy.version,
          JSON.stringify(this.policy.providers),
        ],
      );
      await client.query(
        "INSERT INTO creator.conversation_relationship(account_id,creator_id,fan_id,thread_id) VALUES($1,$2,$3,$4) ON CONFLICT(thread_id) DO NOTHING",
        [actor.accountId, body.creatorId, fanId, threadId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    const scope = await this.access.openThread(
      actor,
      body.creatorId,
      fanId!,
      false,
    );
    return this.page(scope);
  }
  async page(scope: ThreadScope, before?: number): Promise<ConversationPage> {
    return this.db.withThread(
      scope,
      (client) => this.pageInTransaction(scope, client, before),
      "read",
    );
  }
  private async pageInTransaction(
    scope: ThreadScope,
    client: PoolClient,
    before?: number,
  ): Promise<ConversationPage> {
    const t = (
      await client.query(
        "SELECT t.*,cp.display_name,fp.handle FROM creator.thread t JOIN creator.creator_profile cp ON cp.id=t.creator_id JOIN creator.fan_profile fp ON fp.id=t.fan_id WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 AND t.deleted_at IS NULL FOR SHARE OF t",
        [scope.threadId, scope.creatorId, scope.fanId],
      )
    ).rows[0];
    invariant(t, "thread_unavailable", "This conversation is unavailable.");
    const rows = (
      await client.query(
        `SELECT id,thread_id AS "threadId",author_kind AS "authorKind",text,delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,signed_act_id AS "signedActId",author_account_id AS "authorAccountId",citations,created_at::text AS "createdAt",team_member AS member,off_the_record AS "offTheRecord",version FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND ($4::integer IS NULL OR sequence<$4) ORDER BY sequence DESC LIMIT 51`,
        [scope.threadId, scope.creatorId, scope.fanId, before ?? null],
      )
    ).rows;
    const hasOlder = rows.length > 50;
    const selected = rows
      .slice(0, 50)
      .reverse()
      .map((row) => ConversationMessageSchema.parse(row));
    const messages = this.lineage
      ? await this.lineage.enrich(scope, client, selected)
      : selected;
    const generations = (
      await client.query<{ id: string; last_sequence: number }>(
        "SELECT id,last_sequence FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('queued','generating') LIMIT 8",
        [scope.threadId, scope.creatorId, scope.fanId],
      )
    ).rows;
    const currentConsent = Boolean(
      this.policy &&
        this.policyAvailable(scope) &&
        t.processor_consent_version === this.policy.version,
    );
    const capabilities = await capabilitySnapshot(client, scope);
    const hasAccess =
      capabilities.capabilities.includes("ai_message") &&
      capabilities.allowance.available > 0;
    const canSend =
      t.control === "human_active" ||
      (currentConsent &&
        this.generationAvailable &&
        t.control === "ai_active" &&
        hasAccess);
    return {
      threadId: scope.threadId,
      creatorId: scope.creatorId,
      fanId: scope.fanId,
      creatorName: t.display_name,
      fanHandle: t.handle,
      control: t.control,
      epoch: t.control_epoch,
      cursor: t.event_cursor,
      revision: t.revision,
      generationSequences: Object.fromEntries(
        generations.map((g) => [g.id, g.last_sequence]),
      ),
      messages,
      before: hasOlder ? messages[0]!.sequence : null,
      offTheRecord: t.off_the_record,
      introShared: t.intro_shared,
      consentCurrent: currentConsent,
      canSend,
      unavailableReason: canSend
        ? null
        : !currentConsent
          ? "Review the AI providers before messaging."
          : !this.generationAvailable
            ? "AI messaging is not connected yet."
            : t.control !== "ai_active"
              ? "AI messaging is paused in this conversation."
              : !hasAccess
                ? "Your AI access or allowance is unavailable. You can still ask the creator to step in."
                : null,
      feedbackPolicy: this.lineage
        ? await this.lineage.policy(scope, client)
        : null,
    };
  }
  async offline(actor: Actor, creatorId: string, fanId: string) {
    if (!this.offlineIssuer || !this.assertReady || !this.policy?.verified)
      throw new DomainError(
        "offline_unavailable",
        "Offline reading is not connected yet.",
        503,
      );
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      const scope = await this.access.openThreadInTransaction(
        client,
        actor,
        creatorId,
        fanId,
        false,
        "read",
      );
      invariant(
        scope.authority === "fan",
        "fan_required",
        "Only the fan can save this conversation.",
      );
      await this.assertReady(scope, client);
      const snapshot = await this.offlineIssuer.issue(
        scope,
        client,
        await this.pageInTransaction(scope, client),
        this.policy.version,
      );
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async preferences(scope: ThreadScope, raw: unknown) {
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can change their conversation preferences.",
    );
    const body = ThreadPreferencesSchema.parse(raw);
    await this.db.withThread(
      scope,
      async (client) => {
        const result = await client.query(
          "UPDATE creator.thread SET off_the_record=$1,intro_shared=$2,revision=revision+1,memory_revision=memory_revision+1 WHERE id=$3 AND creator_id=$4 AND fan_id=$5 AND revision=$6 RETURNING id",
          [
            body.offTheRecord,
            body.introShared,
            scope.threadId,
            scope.creatorId,
            scope.fanId,
            body.expectedRevision,
          ],
        );
        invariant(
          result.rowCount === 1,
          "conversation_changed",
          "This conversation changed. Refresh before saving.",
        );
      },
      "write",
    );
    return this.page(scope);
  }
  async consent(scope: ThreadScope, raw: unknown) {
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can change their provider consent.",
    );
    const body = ConsentInputSchema.parse(raw);
    if (body.accepted)
      invariant(
        this.policy &&
          this.policyAvailable(scope) &&
          body.version === this.policy.version,
        "providers_changed",
        "Review the currently configured providers.",
      );
    await this.db.withThread(
      scope,
      async (client) => {
        if (body.accepted && this.developmentPolicy) {
          invariant(
            this.assertReady,
            "synthetic_license_unavailable",
            "Development consent requires the current stored development license.",
          );
          await this.assertReady(scope, client);
        }
        await client.query(
          "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
          [scope.threadId, scope.creatorId, scope.fanId],
        );
        await client.query(
          "UPDATE creator.processor_consent SET withdrawn_at=now() WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND withdrawn_at IS NULL",
          [scope.threadId, scope.creatorId, scope.fanId],
        );
        if (body.accepted)
          await client.query(
            "INSERT INTO creator.processor_consent(thread_id,creator_id,fan_id,account_id,version,providers) VALUES($1,$2,$3,$4,$5,$6)",
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              scope.actorAccountId,
              body.version,
              JSON.stringify(this.policy!.providers),
            ],
          );
        await client.query(
          "UPDATE creator.thread SET processor_consent_version=$1,revision=revision+1,memory_revision=memory_revision+1 WHERE id=$2 AND creator_id=$3 AND fan_id=$4",
          [
            body.accepted ? body.version : null,
            scope.threadId,
            scope.creatorId,
            scope.fanId,
          ],
        );
        await this.wellbeing?.boundary(scope, client);
      },
      "write",
    );
    return this.page(scope);
  }
  /** Globally ordered account metadata. Installation is additive and explicitly
   * gated; older hosts retain their reachable UUID directory, without claiming
   * activity order. Private previews are read only through fresh pair scopes. */
  async accountForHome(actor: Actor, cursor?: string) {
    const ready =
      (
        await this.db.pool.query(`SELECT
        EXISTS(SELECT FROM pg_attribute WHERE attrelid='creator.conversation_relationship'::regclass AND attname='activity_at' AND attnotnull AND NOT attisdropped)
        AND to_regclass('creator.conversation_relationship_activity_page') IS NOT NULL
        AND EXISTS(SELECT FROM pg_trigger WHERE tgrelid='creator.message'::regclass AND tgname='record_relationship_activity' AND tgenabled='O') AS ready`)
      ).rows[0]?.ready === true;
    if (!ready) {
      if (cursor && !IdSchema.safeParse(cursor).success)
        throw new DomainError(
          "account_activity_unavailable",
          "Refresh your conversations before paging.",
          503,
        );
      return {
        ...(await this.account(actor, cursor)),
        order: "directory" as const,
      };
    }
    const before = cursor ? readConversationHomeCursor(cursor) : null;
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        actor.accountId,
      ]);
      await assertCurrentSession(client, actor.accountId);
      const fan = (
        await client.query<{
          id: string;
          handle: string;
          intro: string | null;
        }>(
          "SELECT id,handle,intro FROM creator.fan_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0];
      invariant(
        fan,
        "fan_profile_required",
        "Choose your handle before opening You.",
      );
      if (before) {
        const known = await client.query(
          "SELECT thread_id FROM creator.conversation_relationship WHERE account_id=$1 AND fan_id=$2 AND thread_id=$3",
          [actor.accountId, fan.id, before.threadId],
        );
        if (!known.rowCount)
          throw new DomainError(
            "account_cursor_unavailable",
            "Refresh your conversations before paging.",
            404,
          );
      }
      const threads = (
        await client.query<{
          id: string;
          creatorId: string;
          fanId: string;
          name: string;
          activityAt: string;
        }>(
          `SELECT r.thread_id AS id,r.creator_id AS "creatorId",r.fan_id AS "fanId",cp.display_name AS name,
         to_char(r.activity_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "activityAt"
         FROM creator.conversation_relationship r JOIN creator.creator_profile cp ON cp.id=r.creator_id
         WHERE r.account_id=$1 AND r.fan_id=$2 AND ($3::timestamptz IS NULL OR (r.activity_at,r.thread_id)<($3::timestamptz,$4::uuid))
         ORDER BY r.activity_at DESC,r.thread_id DESC LIMIT 51`,
          [
            actor.accountId,
            fan.id,
            before?.activityAt ?? null,
            before?.threadId ?? null,
          ],
        )
      ).rows;
      await assertCurrentSession(client, actor.accountId);
      await client.query("COMMIT");
      return {
        fan,
        threads: threads.slice(0, 50),
        nextCursor:
          threads.length > 50
            ? conversationHomeCursor({
                threadId: threads[49]!.id,
                activityAt: threads[49]!.activityAt,
              })
            : null,
        order: "activity" as const,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async account(actor: Actor, cursor?: string) {
    const before = IdSchema.optional().parse(cursor);
    const client = await this.db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.account_id',$1,true)", [
        actor.accountId,
      ]);
      await assertCurrentSession(client, actor.accountId);
      const fan = (
        await client.query(
          "SELECT id,handle,intro FROM creator.fan_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0];
      invariant(
        fan,
        "fan_profile_required",
        "Choose your handle before opening You.",
      );
      // Only fan-owned relationship metadata is listed. Private messages remain
      // behind the individual thread scope, including when a cursor is supplied.
      if (before) {
        const known = await client.query(
          "SELECT thread_id FROM creator.conversation_relationship WHERE account_id=$1 AND fan_id=$2 AND thread_id=$3",
          [actor.accountId, fan.id, before],
        );
        if (!known.rowCount)
          throw new DomainError(
            "account_cursor_unavailable",
            "Refresh your conversations before paging.",
            404,
          );
      }
      const threads = (
        await client.query(
          'SELECT r.thread_id AS id,r.creator_id AS "creatorId",r.fan_id AS "fanId",cp.display_name AS name FROM creator.conversation_relationship r JOIN creator.creator_profile cp ON cp.id=r.creator_id WHERE r.account_id=$1 AND r.fan_id=$2' +
            (before ? " AND r.thread_id<$3" : "") +
            " ORDER BY r.thread_id DESC LIMIT 51",
          before
            ? [actor.accountId, fan.id, before]
            : [actor.accountId, fan.id],
        )
      ).rows;
      await client.query("COMMIT");
      return ConversationAccountPageSchema.parse({
        fan,
        threads: threads.slice(0, 50),
        nextCursor: threads.length > 50 ? threads[49]!.id : null,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
export function conversationFeature(
  feature: ConversationFeature,
): FeatureRegistration {
  return {
    name: "conversation",
    path: "/",
    router: ({ actorFor }) => {
      const router = Router();
      router.use("/v1/conversations", async (req, _res, next) => {
        const expected = req.header("X-Expected-Account-Id");
        if (expected) {
          const accountId = IdSchema.parse(expected);
          const actor = await actorFor(req);
          if (actor.accountId !== accountId)
            throw new DomainError(
              "session_account_changed",
              "Your account changed. Reopen this page to continue.",
              409,
            );
        }
        next();
      });
      router.get("/v1/conversations/capabilities", (_req, res) =>
        res.json(feature.capabilities()),
      );
      router.post("/v1/conversations/realtime-ticket", async (req, res) => {
        const actor = await actorFor(req);
        const token =
          req.headers.authorization?.match(/^Bearer ([^\s]+)$/u)?.[1];
        invariant(
          feature.tickets && token,
          "realtime_unavailable",
          "Live connection is unavailable.",
        );
        res.json(feature.tickets.issue(actor, token));
      });
      router.post(
        ["/v1/conversations", "/v1/conversations/begin"],
        async (req, res) =>
          res.json(await feature.begin(await actorFor(req), req.body)),
      );
      router.get("/v1/conversations/account", async (req, res) =>
        res.json(
          await feature.account(
            await actorFor(req),
            IdSchema.optional().parse(req.query.cursor),
          ),
        ),
      );
      const scopeFor = async (req: import("express").Request) =>
        feature.access.openThread(
          await actorFor(req),
          IdSchema.parse(req.params.creatorId),
          IdSchema.parse(req.params.fanId),
          req.path.endsWith("/team-replies") ||
            (req.method === "GET" && !req.path.endsWith("/events")),
        );
      const root = "/v1/conversations/:creatorId/:fanId";
      router.get(root + "/offline", async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.json(
          await feature.offline(
            await actorFor(req),
            IdSchema.parse(req.params.creatorId),
            IdSchema.parse(req.params.fanId),
          ),
        );
      });
      router.post(root + "/presence", async (req, res) => {
        invariant(
          feature.wellbeing,
          "wellbeing_unavailable",
          "Conversation time is unavailable.",
        );
        const body = z
          .strictObject({ active: z.boolean(), clientId: IdSchema })
          .parse(req.body);
        res.json(
          await feature.wellbeing.presence(
            await scopeFor(req),
            body.active,
            body.clientId,
          ),
        );
      });
      router.get(root + "/usage", async (req, res) => {
        invariant(
          feature.wellbeing,
          "wellbeing_unavailable",
          "Conversation time is unavailable.",
        );
        res.json(await feature.wellbeing.usage(await scopeFor(req)));
      });
      router.get(root, async (req, res) => {
        const before =
          req.query.before === undefined
            ? undefined
            : z.coerce.number().int().positive().parse(req.query.before);
        const scope = await scopeFor(req);
        res.json(await feature.page(scope, before));
        if (before === undefined) feature.afterAcceptance?.(scope);
      });
      router.get(root + "/events", async (req, res) =>
        res.json(
          await feature.conversations.replay(
            await scopeFor(req),
            z.coerce
              .number()
              .int()
              .nonnegative()
              .parse(req.query.cursor ?? 0),
          ),
        ),
      );
      router.get(root + "/memory", async (req, res) =>
        res.json(await feature.memory.list(await scopeFor(req))),
      );
      router.post(root + "/messages/:id/dont-remember", async (req, res) => {
        const scope = await scopeFor(req);
        const body = z
          .strictObject({ expectedRevision: z.number().int().nonnegative() })
          .parse(req.body);
        await feature.memory.forgetMessage(
          scope,
          IdSchema.parse(req.params.id),
          body.expectedRevision,
        );
        res.json(await feature.page(scope));
      });
      router.post(root + "/messages/:id/feedback", async (req, res) => {
        const scope = await scopeFor(req);
        invariant(
          feature.lineage,
          "feedback_unavailable",
          "Feedback is not available yet.",
        );
        res.json(
          await feature.lineage.feedback(
            scope,
            IdSchema.parse(req.params.id),
            req.body,
          ),
        );
      });
      router.post(root + "/messages/:id/corrections", async (req, res) => {
        invariant(
          feature.corrections,
          "corrections_unavailable",
          "Signed corrections are not available yet.",
        );
        res.json(
          await feature.corrections.deliver(
            await actorFor(req),
            IdSchema.parse(req.params.creatorId),
            IdSchema.parse(req.params.fanId),
            IdSchema.parse(req.params.id),
            req.body,
          ),
        );
      });
      router.post(root + "/recordings", async (req, res) => {
        invariant(
          feature.recordings,
          "recording_unavailable",
          "Signed recording delivery is not connected yet.",
        );
        res.json(
          await feature.recordings.deliver(
            await actorFor(req),
            IdSchema.parse(req.params.creatorId),
            IdSchema.parse(req.params.fanId),
            req.body,
          ),
        );
      });
      router.get(root + "/messages/:id", async (req, res) => {
        const scope = await scopeFor(req);
        const id = IdSchema.parse(req.params.id);
        const row = await feature.db.withThread(
          scope,
          async (client) => {
            const source = (
              await client.query(
                `SELECT id,thread_id AS "threadId",author_kind AS "authorKind",text,delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,signed_act_id AS "signedActId",author_account_id AS "authorAccountId",citations,created_at::text AS "createdAt",team_member AS member,off_the_record AS "offTheRecord",version FROM creator.message WHERE id=$4 AND thread_id=$1 AND creator_id=$2 AND fan_id=$3`,
                [scope.threadId, scope.creatorId, scope.fanId, id],
              )
            ).rows[0];
            if (!source) return undefined;
            const message = ConversationMessageSchema.parse(source);
            return feature.lineage
              ? (await feature.lineage.enrich(scope, client, [message]))[0]
              : message;
          },
          "read",
        );
        invariant(
          row,
          "message_unavailable",
          "This source message is unavailable.",
        );
        res.json(ConversationMessageSchema.parse(row));
      });
      router.get(root + "/citations/:id", async (req, res) => {
        const scope = await scopeFor(req);
        invariant(
          feature.citation,
          "citation_unavailable",
          "No longer accessible to you",
        );
        const id = IdSchema.parse(req.params.id);
        // A passage link must come from this scoped timeline; IDs are not a source browser.
        const visible = await feature.db.withThread(
          scope,
          async (client) =>
            (
              await client.query(
                "SELECT id FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND $4=ANY(citations) LIMIT 1",
                [scope.threadId, scope.creatorId, scope.fanId, id],
              )
            ).rowCount,
          "read",
        );
        invariant(
          visible,
          "citation_unavailable",
          "No longer accessible to you",
        );
        res.json(await feature.citation(scope, id));
      });
      router.post(root + "/memory/:id", async (req, res) =>
        res.json(
          await feature.memory.decide(
            await scopeFor(req),
            IdSchema.parse(req.params.id),
            req.body,
          ),
        ),
      );
      router.post(root + "/preferences", async (req, res) =>
        res.json(await feature.preferences(await scopeFor(req), req.body)),
      );
      router.post(root + "/consent", async (req, res) =>
        res.json(await feature.consent(await scopeFor(req), req.body)),
      );
      router.post(root + "/messages", async (req, res) => {
        const scope = await scopeFor(req);
        invariant(
          scope.authority === "fan",
          "fan_required",
          "Only the fan can send this message.",
        );
        const body = SendMessageSchema.parse(req.body);
        // Existing accepted keys reconcile even during provider outage.
        const prior = await feature.conversations.accepted(scope, body);
        if (prior) {
          res.json(prior);
          if (prior.generationId) feature.afterAcceptance?.(scope);
          return;
        }
        if (!prior) {
          const expected = await feature.conversations.safetyCheckpoint(scope);
          let accepted: AcceptedMessage | null = null;
          if (needsImmediateSafety(body.text)) {
            accepted = await feature.conversations.sendSafety(
              scope,
              body,
              expected,
            );
          } else if (feature.routeSafety && feature.policyAvailable(scope)) {
            const abort = new AbortController();
            res.on("close", () => {
              if (!res.writableEnded) abort.abort();
            });
            await feature.routeSafety(
              scope,
              body.text,
              AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
              async (sentence) => {
                invariant(
                  sentence.safety === true && sentence.text === crisisText,
                  "safety_invalid",
                  "The platform safety response is unavailable.",
                );
                accepted = await feature.conversations.sendSafety(
                  scope,
                  body,
                  expected,
                );
              },
            );
          }
          if (accepted) {
            feature.afterBoundary?.(scope, accepted.message.controlEpoch);
            res.json(accepted);
            return;
          }
        }
        if (
          !prior &&
          (!feature.generationAvailable || !feature.policyAvailable(scope))
        )
          throw new DomainError(
            "model_unconfigured",
            "AI messaging is not connected yet.",
            503,
          );
        const accepted = await feature.conversations.send(scope, body);
        res.json(accepted);
        if (accepted.generationId) feature.afterAcceptance?.(scope);
      });
      router.post(root + "/fan-replies", async (req, res) =>
        res.json(
          await feature.conversations.fanReply(await scopeFor(req), req.body),
        ),
      );
      const messageStatus = async (
        req: import("express").Request,
        res: import("express").Response,
      ) => {
        const scope = await scopeFor(req);
        invariant(
          scope.authority === "fan",
          "fan_required",
          "Only the sender can check their message.",
        );
        const key =
          req.method === "POST"
            ? z
                .strictObject({
                  idempotencyKey: SendMessageSchema.shape.idempotencyKey,
                })
                .parse(req.body).idempotencyKey
            : SendMessageSchema.shape.idempotencyKey.parse(req.params.key);
        res.json(
          await feature.db.withThread(
            scope,
            async (client) => {
              const row = (
                await client.query<{
                  response: {
                    message?: { threadId?: string };
                    threadId?: string;
                  };
                }>(
                  "SELECT response FROM creator.idempotency_key WHERE actor_account_id=$1 AND operation IN('send','fan_reply') AND key=$2",
                  [scope.actorAccountId, key],
                )
              ).rows[0];
              // The idempotency table is account-scoped; do not reveal a key from another pair.
              return {
                accepted: Boolean(
                  row &&
                    (row.response.message?.threadId ??
                      row.response.threadId) === scope.threadId,
                ),
              };
            },
            "read",
          ),
        );
      };
      router.get(root + "/messages/status/:key", messageStatus);
      // Body transport supports every valid send key, including characters
      // that cannot safely be carried as one BFF path segment.
      router.post(root + "/messages/status", messageStatus);
      for (const [path, control] of [
        ["takeover", "human_active"],
        ["handback", "ai_active"],
        ["pause", "ai_paused"],
      ] as const) {
        router.post(root + "/" + path, async (req, res) => {
          const scope = await scopeFor(req);
          const boundary = await feature.conversations.changeControl(
            scope,
            control,
            req.body,
          );
          feature.afterBoundary?.(scope, boundary.epoch);
          res.json(boundary);
        });
      }
      router.post(root + "/human-replies", async (req, res) =>
        res.json(
          await feature.conversations.humanReply(await scopeFor(req), req.body),
        ),
      );
      router.post(root + "/team-replies", async (req, res) =>
        res.json(
          await feature.conversations.teamReply(await scopeFor(req), req.body),
        ),
      );
      router.get(root + "/audit", async (req, res) => {
        const scope = await scopeFor(req);
        invariant(
          scope.authority === "fan",
          "fan_required",
          "Only the fan can read their access history.",
        );
        res.json(
          await feature.db.withThread(
            scope,
            async (client) =>
              (
                await client.query(
                  'SELECT id,reader_account_id AS "readerAccountId",role,read_at::text AS "readAt" FROM creator.thread_audit WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 ORDER BY read_at DESC,id LIMIT 100',
                  [scope.threadId, scope.creatorId, scope.fanId],
                )
              ).rows,
            "read",
          ),
        );
      });
      return router;
    },
  };
}
