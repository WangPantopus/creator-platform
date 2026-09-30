import type { ConversationSocketTickets } from "./realtime-tickets.js";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { FeatureRegistration } from "../../app.js";
import type { Database } from "../../db/database.js";
import type { Actor } from "../identity/adapter.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import type { AccessService, ThreadScope } from "../access/scope.js";
import { invariant, DomainError } from "../../core/errors.js";
import type { ConversationService } from "./service.js";
import type { MemoryService } from "./memory.js";
import {
  BeginConversationSchema,
  ConsentInputSchema,
  ThreadPreferencesSchema,
  ProviderPolicySchema,
  ConversationMessageSchema,
  type ProviderPolicy,
  type ConversationPage,
} from "../../../../../packages/api/src/conversation/contracts.js";
import { IdSchema } from "@qelvora/api";
import { z } from "zod";
import { capabilitySnapshot } from "../access/commerce.js";

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
  ) {
    this.policy = policy ? ProviderPolicySchema.parse(policy) : null;
  }
  capabilities() {
    return {
      providers: this.policy,
      consentAvailable: Boolean(this.policy?.verified),
      generationAvailable:
        this.generationAvailable && Boolean(this.policy?.verified),
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
      this.policy?.verified && body.policyVersion === this.policy.version,
      "providers_unconfigured",
      "AI providers and their verified terms are not configured yet.",
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
    return this.db.withThread(scope, async (client) => {
      const t = (
        await client.query(
          "SELECT t.*,cp.display_name,fp.handle FROM creator.thread t JOIN creator.creator_profile cp ON cp.id=t.creator_id JOIN creator.fan_profile fp ON fp.id=t.fan_id WHERE t.id=$1 AND t.creator_id=$2 AND t.fan_id=$3 AND t.deleted_at IS NULL FOR UPDATE OF t",
          [scope.threadId, scope.creatorId, scope.fanId],
        )
      ).rows[0];
      invariant(t, "thread_unavailable", "This conversation is unavailable.");
      const rows = (
        await client.query(
          `SELECT id,thread_id AS "threadId",author_kind AS "authorKind",text,delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,signed_act_id AS "signedActId",citations,created_at::text AS "createdAt",team_member AS member,off_the_record AS "offTheRecord",version FROM creator.message WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND ($4::integer IS NULL OR sequence<$4) ORDER BY sequence DESC LIMIT 51`,
          [scope.threadId, scope.creatorId, scope.fanId, before ?? null],
        )
      ).rows;
      const hasOlder = rows.length > 50;
      const messages = rows.slice(0, 50).reverse();
      const generations = (
        await client.query<{ id: string; last_sequence: number }>(
          "SELECT id,last_sequence FROM creator.generation WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND state IN('queued','generating') LIMIT 8",
          [scope.threadId, scope.creatorId, scope.fanId],
        )
      ).rows;
      const currentConsent = Boolean(
        this.policy?.verified &&
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
      };
    });
  }
  async preferences(scope: ThreadScope, raw: unknown) {
    invariant(
      scope.authority === "fan",
      "fan_required",
      "Only the fan can change their conversation preferences.",
    );
    const body = ThreadPreferencesSchema.parse(raw);
    await this.db.withThread(scope, async (client) => {
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
    });
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
        this.policy?.verified && body.version === this.policy.version,
        "providers_changed",
        "Review the currently configured providers.",
      );
    await this.db.withThread(scope, async (client) => {
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
    });
    return this.page(scope);
  }
  async account(actor: Actor) {
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
      // Never widen RLS to list private messages. Scope each visible relationship using
      // a bounded fan-owned thread directory function supplied by the migration.
      const threads = (
        await client.query(
          'SELECT r.thread_id AS id,r.creator_id AS "creatorId",r.fan_id AS "fanId",cp.display_name AS name FROM creator.conversation_relationship r JOIN creator.creator_profile cp ON cp.id=r.creator_id WHERE r.account_id=$1 AND r.fan_id=$2 ORDER BY cp.display_name,r.thread_id LIMIT 100',
          [actor.accountId, fan.id],
        )
      ).rows;
      await client.query("COMMIT");
      return { fan, threads };
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
        res.json(await feature.account(await actorFor(req))),
      );
      const scopeFor = async (req: import("express").Request) =>
        feature.access.openThread(
          await actorFor(req),
          IdSchema.parse(req.params.creatorId),
          IdSchema.parse(req.params.fanId),
          req.method === "GET" && !req.path.endsWith("/events"),
        );
      const root = "/v1/conversations/:creatorId/:fanId";
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
      router.get(root + "/messages/:id", async (req, res) => {
        const scope = await scopeFor(req);
        const id = IdSchema.parse(req.params.id);
        const row = await feature.db.withThread(
          scope,
          async (client) =>
            (
              await client.query(
                `SELECT id,thread_id AS "threadId",author_kind AS "authorKind",text,delivery_state AS "deliveryState",control_epoch AS "controlEpoch",sequence,signed_act_id AS "signedActId",citations,created_at::text AS "createdAt",team_member AS member,off_the_record AS "offTheRecord",version FROM creator.message WHERE id=$4 AND thread_id=$1 AND creator_id=$2 AND fan_id=$3`,
                [scope.threadId, scope.creatorId, scope.fanId, id],
              )
            ).rows[0],
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
        // Existing accepted keys reconcile even during provider outage.
        const prior = await feature.db.withThread(
          scope,
          async (client) =>
            (
              await client.query<{ response: unknown }>(
                "SELECT response FROM creator.idempotency_key WHERE actor_account_id=$1 AND operation='send' AND key=$2",
                [
                  scope.actorAccountId,
                  z.string().min(8).max(128).parse(req.body.idempotencyKey),
                ],
              )
            ).rows[0],
        );
        if (
          !prior &&
          (!feature.generationAvailable || !feature.policy?.verified)
        )
          throw new DomainError(
            "model_unconfigured",
            "AI messaging is not connected yet.",
            503,
          );
        res.json(await feature.conversations.send(scope, req.body));
        feature.afterAcceptance?.(scope);
      });
      router.post(root + "/fan-replies", async (req, res) =>
        res.json(
          await feature.conversations.fanReply(await scopeFor(req), req.body),
        ),
      );
      router.get(root + "/messages/status/:key", async (req, res) => {
        const scope = await scopeFor(req);
        invariant(
          scope.authority === "fan",
          "fan_required",
          "Only the sender can check their message.",
        );
        const key = IdSchema.parse(req.params.key);
        res.json(
          await feature.db.withThread(scope, async (client) => {
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
                  (row.response.message?.threadId ?? row.response.threadId) ===
                    scope.threadId,
              ),
            };
          }),
        );
      });
      router.post(root + "/takeover", async (req, res) =>
        res.json(
          await feature.conversations.changeControl(
            await scopeFor(req),
            "human_active",
            req.body,
          ),
        ),
      );
      router.post(root + "/handback", async (req, res) =>
        res.json(
          await feature.conversations.changeControl(
            await scopeFor(req),
            "ai_active",
            req.body,
          ),
        ),
      );
      router.post(root + "/pause", async (req, res) =>
        res.json(
          await feature.conversations.changeControl(
            await scopeFor(req),
            "ai_paused",
            req.body,
          ),
        ),
      );
      router.post(root + "/human-replies", async (req, res) =>
        res.json(
          await feature.conversations.humanReply(await scopeFor(req), req.body),
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
          ),
        );
      });
      return router;
    },
  };
}
