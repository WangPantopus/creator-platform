import {
  StudioInvite,
  StudioQueueQuery,
  StudioSaveReplyDraft,
  StudioSendReplyDraft,
  StudioCorrection,
} from "../../../../../packages/api/src/studio.js";
import type { IdentityProfiles } from "../identity/profiles.js";
import type { Actor } from "../identity/adapter.js";
import type { ContentService } from "../content/service.js";
import type { CommerceService } from "../commerce/service.js";
import type { ConversationService } from "../conversation/service.js";
import type { AccessService } from "../access/scope.js";
import type { AgentService } from "../agent/service.js";
import { ContentPage } from "../../../../../packages/api/src/content.js";
import { DomainError, invariant } from "../../core/errors.js";
import { identityTransaction } from "../identity/transaction.js";

export class StudioService {
  constructor(
    readonly content: ContentService,
    readonly owners: {
      commerce?: CommerceService;
      conversation: ConversationService;
      access: AccessService;
      agent?: AgentService;
      profiles?: IdentityProfiles;
    },
  ) {}
  private commerce() {
    if (!this.owners.commerce)
      throw new DomainError(
        "commerce_unconfigured",
        "Requests and paid offers are unavailable until commerce is configured.",
        503,
      );
    return this.owners.commerce;
  }
  async session(actor: Actor) {
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    return identityTransaction(
      this.content.pool,
      actor.accountId,
      async (client) => {
        const creators = (
          await client.query(
            "SELECT cp.id,cp.display_name,cp.handle,cp.verification,cp.account_id=$1 AS owned,coalesce(tm.roles,'{}') AS roles,f.handle AS \"memberHandle\" FROM creator.creator_profile cp LEFT JOIN creator.team_membership tm ON tm.creator_id=cp.id AND tm.account_id=$1 AND tm.revoked_at IS NULL LEFT JOIN creator.fan_profile f ON f.account_id=$1 WHERE cp.account_id=$1 OR tm.account_id=$1 ORDER BY cp.handle LIMIT 50",
            [actor.accountId],
          )
        ).rows;
        const invitations = (
          await client.query(
            'SELECT i.id,i.creator_id AS "creatorId",c.display_name AS "creatorName",i.roles,i.expires_at AS "expiresAt" FROM creator.team_invitation i JOIN creator.creator_profile c ON c.id=i.creator_id WHERE i.account_id=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() ORDER BY i.expires_at,i.id LIMIT 50',
            [actor.accountId],
          )
        ).rows;
        return {
          creators: creators.map((row) => ({
            ...row,
            viewerAccountId: actor.accountId,
          })),
          invitations,
          serverTime: new Date().toISOString(),
        };
      },
    );
  }
  async acceptInvitation(actor: Actor, id: string) {
    if (!this.owners.profiles)
      throw new DomainError(
        "identity_team_unconfigured",
        "Team acceptance is unavailable until the identity service is connected.",
        503,
      );
    return this.owners.profiles.acceptInvite(actor, id);
  }
  async inviteByHandle(actor: Actor, creatorId: string, raw: unknown) {
    const input = {
      ...StudioInvite.parse(raw),
      handle: StudioInvite.parse(raw).handle.replace(/^@/, "").toLowerCase(),
    };
    if (!this.owners.profiles)
      throw new DomainError(
        "identity_team_unconfigured",
        "Team invitations are unavailable until the identity service is connected.",
        503,
      );
    const target = await this.content.transaction(
      actor,
      creatorId,
      async (client) => {
        await this.content.role(client, actor, creatorId);
        const fan = (
          await client.query(
            "SELECT account_id FROM creator.fan_profile WHERE handle=$1",
            [input.handle],
          )
        ).rows[0];
        invariant(
          fan,
          "team_account_unavailable",
          "Choose the current public handle of an existing fan account.",
        );
        const prior = (
          await client.query(
            "SELECT id,roles FROM creator.team_invitation WHERE creator_id=$1 AND account_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() ORDER BY expires_at DESC LIMIT 1",
            [creatorId, fan.account_id],
          )
        ).rows[0];
        if (prior) {
          invariant(
            [...new Set(prior.roles)].sort().join() ===
              [...new Set(input.roles)].sort().join(),
            "team_invitation_exists",
            "A current invitation already exists with different roles. Remove it before choosing new roles.",
          );
          return { accountId: fan.account_id, prior };
        }
        return { accountId: fan.account_id, prior: null };
      },
    );
    if (target.prior) return target.prior;
    return this.owners.profiles.invite(actor, creatorId, {
      accountId: target.accountId,
      roles: input.roles,
    });
  }
  async correctionRevision(actor: Actor, creatorId: string) {
    await this.content.transaction(actor, creatorId, (client) =>
      this.content.role(client, actor, creatorId),
    );
    if (!this.owners.agent)
      throw new DomainError(
        "correction_unconfigured",
        "The AI rule and regression producer is unavailable.",
        503,
      );
    const state = await this.owners.agent.read({
      creatorId,
      accountId: actor.accountId,
      development: false,
    });
    return { revision: state.revision };
  }
  async audiences(actor: Actor, creatorId: string) {
    return this.content.transaction(actor, creatorId, async (client) => {
      await this.content.role(client, actor, creatorId, [
        "drafter",
        "publisher",
      ]);
      if (!this.owners.commerce)
        return { audienceCountsAvailable: false, tiers: [], groups: [] };
      const tiers = (
        await client.query(
          "SELECT id,name,catalog FROM creator.commerce_tier WHERE creator_id=$1 ORDER BY name,id LIMIT 100",
          [creatorId],
        )
      ).rows;
      return {
        audienceCountsAvailable: Boolean(
          this.content.dependencies.audienceCount,
        ),
        tiers: tiers.map((t) => ({ id: t.id, name: t.name })),
        groups: tiers.flatMap((t) =>
          (t.catalog.contentGroups ?? []).map((id: string) => ({
            id,
            name: `Content group · ${t.name}`,
          })),
        ),
      };
    });
  }
  async queue(actor: Actor, creatorId: string, raw: unknown) {
    this.commerce();
    const input = StudioQueueQuery.parse(raw);
    return this.content.transaction(actor, creatorId, async (client) => {
      const role = await this.content.role(client, actor, creatorId, [
        "triage",
      ]);
      // W4's current RLS permits the creator; never escalate team to creator.
      if (!role.creator)
        throw new DomainError(
          "team_queue_unavailable",
          "The commerce producer has not enabled team queue access. Your role has not been escalated.",
          503,
        );
      const rows = (
        await client.query(
          `WITH queue AS (
        SELECT p.id,p.fan_id,f.handle,p.version,p.state,p.payment_state,p.snapshot,p.disclosure,p.decision_at,p.hold_expires_at,p.submitted_at,
         c.id AS commitment_id,c.state AS commitment_state,c.version AS commitment_version,c.due_at,
         CASE WHEN c.state IN('due','in_progress') THEN 0 WHEN p.state='submitted' THEN 1 ELSE 2 END AS priority,
         CASE WHEN c.state IN('due','in_progress') THEN c.due_at WHEN p.state='submitted' THEN p.decision_at ELSE p.hold_expires_at END AS deadline
        FROM creator.commerce_packet p JOIN creator.fan_profile f ON f.id=p.fan_id LEFT JOIN creator.commerce_commitment c ON c.packet_id=p.id
        WHERE p.creator_id=$1 AND (c.state IN('due','in_progress') OR p.state IN('submitted','more_info','offer_pending'))
        AND ($2='all' OR ($2='due' AND c.state IN('due','in_progress')) OR ($2='decide' AND p.state IN('submitted','offer_pending')) OR ($2='more_info' AND p.state='more_info'))
      ) SELECT * FROM queue WHERE $3::uuid IS NULL OR (priority,coalesce(deadline,'infinity'::timestamptz),id)>(SELECT priority,coalesce(deadline,'infinity'::timestamptz),id FROM queue WHERE id=$3) ORDER BY priority,deadline NULLS LAST,id LIMIT $4`,
          [creatorId, input.filter, input.cursor ?? null, input.limit + 1],
        )
      ).rows;
      if (input.cursor && !rows.length)
        throw new DomainError(
          "queue_changed",
          "The request queue changed. Refresh requests to continue from current state.",
          409,
        );
      const capacity = (
        await client.query(
          "SELECT m.id,m.title,m.kind,m.weekly_limit,coalesce(c.used,0) AS used,coalesce(c.reserved,0) AS reserved,m.version FROM creator.commerce_mode m LEFT JOIN creator.commerce_capacity c ON c.mode_id=m.id AND c.window_start=date_trunc('week',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' WHERE m.creator_id=$1 AND m.state='offered' ORDER BY m.title LIMIT 100",
          [creatorId],
        )
      ).rows;
      return {
        items: rows.slice(0, input.limit),
        capacity,
        nextCursor:
          rows.length > input.limit ? rows[input.limit - 1]!.id : null,
        serverTime: new Date().toISOString(),
      };
    });
  }
  async packet(actor: Actor, creatorId: string, id: string) {
    await this.content.transaction(actor, creatorId, (client) =>
      this.content.role(client, actor, creatorId),
    );
    const result = await this.commerce().packet(actor, id);
    invariant(
      result.packet.creator_id === creatorId,
      "request_unavailable",
      "This request is unavailable.",
    );
    const groupModes = await this.commerce().account(
      actor,
      async (client) =>
        (
          await client.query(
            "SELECT id,title,kind,amount,currency,version FROM creator.commerce_mode WHERE creator_id=$1 AND kind='group_answer' AND state='offered' AND currency=$2 AND amount<$3 ORDER BY title LIMIT 50",
            [
              creatorId,
              result.packet.snapshot.currency,
              result.packet.snapshot.amount,
            ],
          )
        ).rows,
    );
    return { ...result, groupModes };
  }
  async decide(actor: Actor, creatorId: string, id: string, raw: unknown) {
    await this.packet(actor, creatorId, id);
    return this.commerce().decide(actor, id, raw);
  }
  async deliveries(actor: Actor, creatorId: string, packetId: string) {
    const packet = await this.packet(actor, creatorId, packetId);
    const scope = await this.owners.access.openThread(
      actor,
      creatorId,
      packet.packet.fan_id,
      true,
    );
    const timeline = await this.owners.conversation.read(scope);
    return {
      items: timeline.messages.filter(
        (message) =>
          ["human_creator", "approved_draft"].includes(message.authorKind) &&
          message.deliveryState === "delivered" &&
          message.signedActId &&
          (packet.packet.snapshot.mode === "voice_note"
            ? message.authorKind === "human_creator" &&
              message.recording?.state === "available" &&
              message.recording.asset.threadId === scope.threadId &&
              message.recording.asset.signedActId === message.signedActId
            : packet.packet.snapshot.mode === "written_reply" &&
              message.text.trim().length > 0 &&
              !message.recording),
      ),
      audited: true,
    };
  }
  async deliver(
    actor: Actor,
    creatorId: string,
    packetId: string,
    raw: unknown,
  ) {
    await this.packet(actor, creatorId, packetId);
    return this.commerce().deliver(actor, packetId, raw);
  }
  async replyDraft(actor: Actor, creatorId: string, fanId: string) {
    await this.owners.access.openThread(actor, creatorId, fanId, false);
    return this.content.transaction(
      actor,
      creatorId,
      async (client) =>
        (
          await client.query(
            'SELECT text,version,sent_message_id AS "sentMessageId" FROM creator.studio_reply_draft WHERE creator_id=$1 AND fan_id=$2 AND account_id=$3',
            [creatorId, fanId, actor.accountId],
          )
        ).rows[0] ?? { text: "", version: 0, sentMessageId: null },
    );
  }
  async saveReplyDraft(
    actor: Actor,
    creatorId: string,
    fanId: string,
    raw: unknown,
  ) {
    const scope = await this.owners.access.openThread(
      actor,
      creatorId,
      fanId,
      false,
    );
    const input = StudioSaveReplyDraft.parse(raw);
    return this.content.transaction(actor, creatorId, (client) =>
      this.content.command(
        client,
        actor,
        "reply_draft",
        input.idempotencyKey,
        { creatorId, fanId, ...input },
        async () => {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`studio.draft:${creatorId}:${fanId}:${actor.accountId}`],
          );
          const current = (
            await client.query(
              "SELECT version FROM creator.studio_reply_draft WHERE creator_id=$1 AND fan_id=$2 AND account_id=$3 FOR UPDATE",
              [creatorId, fanId, actor.accountId],
            )
          ).rows[0];
          invariant(
            (current?.version ?? 0) === input.expectedVersion,
            "draft_changed",
            "This draft changed. Refresh before saving; your text is kept.",
          );
          return (
            await client.query(
              "INSERT INTO creator.studio_reply_draft(creator_id,fan_id,account_id,text,version,thread_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(creator_id,fan_id,account_id) DO UPDATE SET text=excluded.text,version=excluded.version,sent_message_id=NULL,thread_id=excluded.thread_id,updated_at=now() RETURNING version",
              [
                creatorId,
                fanId,
                actor.accountId,
                input.text,
                input.expectedVersion + 1,
                scope.threadId,
              ],
            )
          ).rows[0];
        },
      ),
    );
  }
  async sendSavedReply(
    actor: Actor,
    creatorId: string,
    fanId: string,
    raw: unknown,
  ) {
    const input = StudioSendReplyDraft.parse(raw);
    const scope = await this.owners.access.openThread(
      actor,
      creatorId,
      fanId,
      false,
    );
    invariant(
      scope.authority === "creator",
      "creator_required",
      "Only the creator can send a personally signed reply.",
    );
    return this.content.transaction(actor, creatorId, (client) =>
      this.content.command(
        client,
        actor,
        "saved_reply_send",
        input.idempotencyKey,
        { creatorId, fanId, ...input },
        async () => {
          const draft = (
            await client.query(
              "SELECT text,version,sent_message_id FROM creator.studio_reply_draft WHERE creator_id=$1 AND fan_id=$2 AND account_id=$3 FOR UPDATE",
              [creatorId, fanId, actor.accountId],
            )
          ).rows[0];
          invariant(
            draft && draft.version === input.version && !draft.sent_message_id,
            "draft_changed",
            "The exact saved draft changed or was already sent. Refresh first.",
          );
          const message = await this.owners.conversation.humanReply(scope, {
            text: draft.text,
            signedActId: input.signedActId,
            idempotencyKey: `studio_reply_${input.idempotencyKey}`,
          });
          await client.query(
            "UPDATE creator.studio_reply_draft SET sent_message_id=$4 WHERE creator_id=$1 AND fan_id=$2 AND account_id=$3",
            [creatorId, fanId, actor.accountId, message.id],
          );
          return message;
        },
      ),
    );
  }
  async team(actor: Actor, creatorId: string) {
    return this.content.transaction(actor, creatorId, async (client) => {
      await this.content.role(client, actor, creatorId);
      return {
        members: (
          await client.query(
            "SELECT tm.account_id,tm.roles,tm.revoked_at,f.handle FROM creator.team_membership tm LEFT JOIN creator.fan_profile f ON f.account_id=tm.account_id WHERE tm.creator_id=$1 ORDER BY tm.account_id LIMIT 50",
            [creatorId],
          )
        ).rows,
        invitations: (
          await client.query(
            "SELECT i.id,i.account_id,f.handle,i.roles,i.expires_at,i.accepted_at,i.revoked_at FROM creator.team_invitation i LEFT JOIN creator.fan_profile f ON f.account_id=i.account_id WHERE i.creator_id=$1 ORDER BY i.expires_at DESC LIMIT 50",
            [creatorId],
          )
        ).rows,
      };
    });
  }
  async thread(actor: Actor, creatorId: string, fanId: string, audit = true) {
    const scope = await this.owners.access.openThread(
      actor,
      creatorId,
      fanId,
      audit,
    );
    invariant(
      scope.authority !== "fan",
      "studio_role_required",
      "Open your fan conversation from the fan app.",
    );
    const timeline = await this.owners.conversation.read(scope);
    return {
      timeline,
      authority: scope.authority,
      creatorName: scope.creatorName,
      fanId,
    };
  }
  async threadEntries(actor: Actor, creatorId: string, raw: unknown) {
    const page = ContentPage.pick({ cursor: true, limit: true }).parse(raw);
    const rows = await this.content.transaction(
      actor,
      creatorId,
      async (client) => {
        await this.content.role(client, actor, creatorId, ["triage"]);
        // Read current references under each producer's RLS. Team queue authority
        // is never escalated, and no private conversation text is assembled here.
        return (
          await client.query<{
            fan_id: string;
            handle: string;
            sources: string[];
            updated_at: Date;
          }>(
            `
        WITH links AS (
          SELECT fan_id,'note_reply' AS source,max(created_at) AS updated_at FROM creator.content_reply
          WHERE creator_id=$1 AND withdrawn_at IS NULL GROUP BY fan_id
          UNION ALL
          SELECT fan_id,'request' AS source,max(submitted_at) AS updated_at FROM creator.commerce_packet
          WHERE creator_id=$1 AND submitted_at IS NOT NULL GROUP BY fan_id
        ), entries AS (
          SELECT f.id AS fan_id,f.handle,array_agg(DISTINCT l.source) AS sources,max(l.updated_at) AS updated_at
          FROM links l JOIN creator.fan_profile f ON f.id=l.fan_id GROUP BY f.id,f.handle
        ) SELECT * FROM entries WHERE $2::uuid IS NULL OR (updated_at,fan_id)<(SELECT updated_at,fan_id FROM entries WHERE fan_id=$2)
        ORDER BY updated_at DESC,fan_id DESC LIMIT $3`,
            [creatorId, page.cursor ?? null, page.limit + 1],
          )
        ).rows;
      },
    );
    const items = [];
    for (const row of rows.slice(0, page.limit)) {
      try {
        await this.owners.access.openThread(
          actor,
          creatorId,
          row.fan_id,
          false,
        );
        items.push({
          fanId: row.fan_id,
          handle: row.handle,
          sources: row.sources,
          updatedAt: row.updated_at.toISOString(),
        });
      } catch (error) {
        if (
          !(error instanceof DomainError && error.code === "thread_unavailable")
        )
          throw error;
      }
    }
    return {
      items,
      nextCursor:
        rows.length > page.limit ? rows[page.limit - 1]!.fan_id : null,
      coverage: "notes_and_requests" as const,
    };
  }
  async control(
    actor: Actor,
    creatorId: string,
    fanId: string,
    operation: string,
    body: unknown,
  ) {
    const scope = await this.owners.access.openThread(
      actor,
      creatorId,
      fanId,
      false,
    );
    return this.owners.conversation.changeControl(
      scope,
      operation === "takeover"
        ? "human_active"
        : operation === "handback"
          ? "ai_active"
          : "ai_paused",
      body,
    );
  }
  async humanReply(
    actor: Actor,
    creatorId: string,
    fanId: string,
    body: unknown,
  ) {
    const scope = await this.owners.access.openThread(
      actor,
      creatorId,
      fanId,
      false,
    );
    return this.owners.conversation.humanReply(scope, body);
  }
  async correction(actor: Actor, creatorId: string, body: unknown) {
    await this.content.transaction(actor, creatorId, (client) =>
      this.content.role(client, actor, creatorId),
    );
    if (!this.owners.agent)
      throw new DomainError(
        "correction_unconfigured",
        "The AI rule and regression producer is not connected yet.",
        503,
      );
    const input = StudioCorrection.parse(body);
    return this.owners.agent.correction(
      { creatorId, accountId: actor.accountId, development: false },
      input.idempotencyKey,
      {
        expectedRevision: input.expectedRevision,
        paraphrasedPrompt: input.paraphrasedPrompt,
        rule: input.rule,
        unacceptableAnswer: input.unacceptableAnswer,
      },
    );
  }
}
