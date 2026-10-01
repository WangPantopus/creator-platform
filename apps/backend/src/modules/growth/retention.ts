import { copy } from "@qelvora/copy";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { GrowthService } from "./service.js";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
const Impact = z.strictObject({
  creatorId: z.uuid(),
  window: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  uniqueFans: z.int().nonnegative(),
  aiConversations: z.int().nonnegative(),
  personalReplies: z.int().nonnegative(),
  notes: z.int().nonnegative(),
  thanksCount: z.int().nonnegative(),
  thanks: z
    .array(
      z.strictObject({
        id: z.uuid(),
        version: z.int().positive(),
        fanAccountId: z.uuid(),
        text: z.string().max(500),
        displayName: z.string().max(80).nullable(),
        textConsent: z.literal(true),
        identityConsent: z.boolean(),
      }),
    )
    .max(20),
});
const ActivationSnapshot = z.strictObject({
  creatorId: z.uuid(),
  agentVersion: z.int().positive(),
  state: z.enum(["published", "paused", "unpublished", "revoked"]),
  sourceCount: z.int().nonnegative(),
  conversations: z.int().nonnegative(),
  usefulAnswers: z.int().nonnegative(),
  unresolvedTopics: z
    .array(
      z.strictObject({
        topicKey: z.string().regex(/^[a-z0-9_-]{2,60}$/u),
        distinctFans: z.int().min(5),
      }),
    )
    .max(30),
  nextStep: z.enum(["review_sources", "review_boundaries", "keep_current"]),
});
export interface ActivationSource {
  snapshot(input: {
    creatorId: string;
    agentVersion: number;
    publishedAt: Date;
    closedAt: Date;
  }): Promise<z.infer<typeof ActivationSnapshot>>;
}
export interface ThanksPermission {
  current(input: {
    id: string;
    version: number;
    textHash: string;
  }): Promise<{ valid: boolean; identityAllowed: boolean }>;
}
export class Retention {
  constructor(
    private readonly service: GrowthService,
    private readonly thanksPermission?: ThanksPermission,
  ) {}
  /** W2/W3/W5 provide aggregates and only W5's separately consented thanks. */
  async recordImpact(input: unknown) {
    const value = Impact.parse(input);
    const window = new Date(`${value.window}T00:00:00Z`);
    if (
      Number.isNaN(window.valueOf()) ||
      window.getUTCDay() !== 1 ||
      window.valueOf() + 7 * 86400000 > Date.now()
    )
      throw new DomainError(
        "impact_window_open",
        copy.growthErrorImpactWindowOpen,
        409,
      );
    const thanks = value.thanks.map((t) => ({
      id: t.id,
      version: t.version,
      subjectKey: this.service.privacySubjectKey(t.fanAccountId),
      textHash: createHash("sha256").update(t.text).digest("hex"),
      text: t.text,
      displayName: t.identityConsent ? t.displayName : null,
    }));
    await this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        if (
          !(await this.service.erasure.subjects(
            client,
            value.thanks.map((t) => t.fanAccountId),
            [value.creatorId],
          ))
        )
          throw new DomainError(
            "growth_data_erased",
            copy.growthErrorGrowthDataErased,
            410,
          );
        await client.query(
          "INSERT INTO growth.impact(creator_id,window_start,unique_fans,ai_conversations,personal_replies,notes,thanks_count,consented_thanks) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
          [
            value.creatorId,
            value.window,
            value.uniqueFans,
            value.aiConversations,
            value.personalReplies,
            value.notes,
            value.thanksCount,
            JSON.stringify(thanks),
          ],
        );
      },
    );
  }
  async impact(actor: Actor) {
    const creatorId = await this.service.requireCreator(actor);
    return this.service.db.actor(actor, creatorId, async (client) => {
      const result = await client.query(
        "SELECT window_start,unique_fans,ai_conversations,personal_replies,notes,thanks_count,consented_thanks FROM growth.impact WHERE creator_id=$1 ORDER BY window_start DESC LIMIT 1",
        [creatorId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const quotes = [];
      for (const quote of row.consented_thanks ?? []) {
        if (
          !this.thanksPermission ||
          !quote.id ||
          !quote.version ||
          !quote.textHash
        )
          continue;
        const permission = await this.thanksPermission.current({
          id: quote.id,
          version: quote.version,
          textHash: quote.textHash,
        });
        if (permission.valid)
          quotes.push({
            text: quote.text,
            displayName: permission.identityAllowed ? quote.displayName : null,
          });
      }
      return { ...row, consented_thanks: quotes };
    });
  }
  async scheduleActivation(
    creatorId: string,
    accountId: string,
    agentVersion: number,
    publishedAt: Date,
  ) {
    await this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        if (
          !(await this.service.erasure.subjects(
            client,
            [accountId],
            [creatorId],
          ))
        )
          return;
        await client.query(
          "INSERT INTO growth.activation_job(creator_id,creator_account_id,agent_version,due_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
          [
            z.uuid().parse(creatorId),
            z.uuid().parse(accountId),
            z.int().positive().parse(agentVersion),
            new Date(publishedAt.valueOf() + 72 * 3600000),
          ],
        );
      },
    );
  }
  /** W2's creator surface reads this completed snapshot; no invented notification type. */
  async activation(actor: Actor) {
    const creatorId = await this.service.requireCreator(actor);
    return this.service.db.workerActor(actor, creatorId, async (client) => {
      const result = await client.query(
        "SELECT agent_version,due_at,state,document,completed_at FROM growth.activation_job WHERE creator_id=$1 ORDER BY due_at DESC LIMIT 1",
        [creatorId],
      );
      return result.rows[0] ?? null;
    });
  }
  async drainActivation(source?: ActivationSource, limit = 20) {
    const leaseId = randomUUID();
    const jobs = await this.service.db.transaction(
      this.service.db.worker,
      async (client) =>
        (
          await client.query(
            `WITH picked AS (SELECT id FROM growth.activation_job WHERE (state='queued' AND due_at<=now()) OR (state='leased' AND lease_until<now()) ORDER BY due_at LIMIT $1 FOR UPDATE SKIP LOCKED) UPDATE growth.activation_job j SET state='leased',lease_id=$2,lease_until=now()+interval '2 minutes',attempts=attempts+1 FROM picked WHERE j.id=picked.id RETURNING j.*`,
            [Math.min(Math.max(limit, 1), 100), leaseId],
          )
        ).rows,
    );
    for (const job of jobs) {
      try {
        if (!source) throw new Error("activation_source_unconfigured");
        const closedAt = new Date(job.due_at),
          snapshot = ActivationSnapshot.parse(
            await source.snapshot({
              creatorId: job.creator_id,
              agentVersion: job.agent_version,
              publishedAt: new Date(closedAt.valueOf() - 72 * 3600000),
              closedAt,
            }),
          );
        if (
          snapshot.creatorId !== job.creator_id ||
          snapshot.agentVersion !== job.agent_version ||
          snapshot.state !== "published"
        )
          throw new Error("activation_state_unavailable");
        await this.service.db.worker.query(
          "UPDATE growth.activation_job SET state='sent',document=$3,completed_at=now(),lease_until=NULL WHERE id=$1 AND lease_id=$2",
          [job.id, leaseId, snapshot],
        );
      } catch {
        await this.service.db.worker.query(
          "UPDATE growth.activation_job SET state='blocked',lease_until=NULL WHERE id=$1 AND lease_id=$2",
          [job.id, leaseId],
        );
      }
    }
    return { claimed: jobs.length };
  }
  /** W8/W2 retries after connecting the missing current-state source; bounded, idempotent. */
  async retryActivation(creatorId: string, agentVersion: number) {
    await this.service.db.worker.query(
      "UPDATE growth.activation_job SET state='queued' WHERE creator_id=$1 AND agent_version=$2 AND state='blocked'",
      [z.uuid().parse(creatorId), z.int().positive().parse(agentVersion)],
    );
  }
}
export interface InstagramPermissions {
  approved: boolean;
  professionalAccountId: string;
  privateReplyAllowed: boolean;
}
export interface InstagramPrivateReplyProvider {
  permissions(creatorId: string): Promise<InstagramPermissions>;
  send(input: {
    professionalAccountId: string;
    commentId: string;
    publicAppLink: string;
  }): Promise<{ id: string }>;
}
/** Conditional adapter. Only a verified comment webhook and creator-authorized rule enqueue. */
export class InstagramEntry {
  constructor(
    private readonly service: GrowthService,
    private readonly publicOrigin: string,
    private readonly provider?: InstagramPrivateReplyProvider,
  ) {
    if (new URL(publicOrigin).protocol !== "https:")
      throw new Error("A configured HTTPS app origin is required.");
  }
  async enqueue(input: {
    creatorId: string;
    commentId: string;
    contextId: string;
    createdAt: Date;
    live: boolean;
    broadcastActive: boolean;
    creatorRuleConsent: boolean;
  }) {
    if (!input.creatorRuleConsent || (input.live && !input.broadcastActive))
      throw new DomainError(
        "private_reply_unavailable",
        copy.growthErrorPrivateReplyUnavailable,
      );
    if (input.createdAt.valueOf() + 7 * 86400000 <= Date.now())
      throw new DomainError("comment_expired", copy.growthErrorCommentExpired);
    await this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        if (!(await this.service.erasure.creator(client, input.creatorId)))
          return;
        await client.query(
          "INSERT INTO growth.instagram_reply(creator_id,comment_id,context_id,received_at,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [
            input.creatorId,
            input.commentId,
            input.contextId,
            input.createdAt,
            input.live
              ? new Date(Date.now() + 60000)
              : new Date(input.createdAt.valueOf() + 7 * 86400000),
          ],
        );
      },
    );
  }
  async deliver(creatorId: string, commentId: string) {
    const result = await this.service.db.transaction(
      this.service.db.worker,
      async (client) => {
        const row = await client.query(
          "SELECT * FROM growth.instagram_reply WHERE creator_id=$1 AND comment_id=$2 FOR UPDATE",
          [creatorId, commentId],
        );
        const job = row.rows[0];
        if (!job || job.state !== "queued") return null;
        if (new Date(job.expires_at) <= new Date()) {
          await client.query(
            "UPDATE growth.instagram_reply SET state='expired' WHERE creator_id=$1 AND comment_id=$2",
            [creatorId, commentId],
          );
          return null;
        }
        await client.query(
          "UPDATE growth.instagram_reply SET state='sending' WHERE creator_id=$1 AND comment_id=$2",
          [creatorId, commentId],
        );
        return job;
      },
    );
    if (!result) return { sent: false };
    try {
      if (!this.provider) throw new Error("provider_unconfigured");
      const permission = await this.provider.permissions(creatorId);
      if (!permission.approved || !permission.privateReplyAllowed)
        throw new Error("permission_unavailable");
      const profile = await this.service.db.runtime.query(
        "SELECT handle FROM growth.creator_public WHERE id=$1 AND state='published'",
        [creatorId],
      );
      const handle = profile.rows[0]?.handle;
      if (!handle || !(await this.service.post(handle, result.context_id)))
        throw new Error("context_unavailable");
      const sent = await this.provider.send({
        professionalAccountId: permission.professionalAccountId,
        commentId,
        publicAppLink: `${this.publicOrigin}/creators/${handle}/posts/${result.context_id}`,
      });
      await this.service.db.worker.query(
        "UPDATE growth.instagram_reply SET state='sent',provider_ref=$3 WHERE creator_id=$1 AND comment_id=$2",
        [creatorId, commentId, sent.id],
      );
      return { sent: true };
    } catch {
      await this.service.db.worker.query(
        "UPDATE growth.instagram_reply SET state=$3 WHERE creator_id=$1 AND comment_id=$2",
        [creatorId, commentId, this.provider ? "unknown" : "blocked"],
      );
      return { sent: false };
    }
  }
}
