import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { DomainError } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import type { GrowthService } from "./service.js";

const PromptKind = z.enum(["install", "return"]);
const PromptDecision = z.enum(["later", "declined", "accepted"]);
const Entry = z.strictObject({
  id: z.uuid(),
  source: z.enum([
    "direct",
    "creator_link",
    "post",
    "invite",
    "share",
    "search",
  ]),
  handle: z.string().regex(/^[a-z0-9_]{3,30}$/u),
  objectId: z.uuid().nullable(),
  surface: z.enum(["web", "ios", "android"]),
  consent: z.literal(true),
});
export class Engagement {
  constructor(
    private readonly service: GrowthService,
    private readonly installURLs: Partial<
      Record<"ios" | "android", string>
    > = {},
  ) {
    for (const value of Object.values(installURLs)) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.hash)
        throw new Error("Install links require approved HTTPS destinations.");
    }
  }
  /** No account event can claim a useful answer. Its owner must record that outcome first. */
  async claimPrompt(
    actor: Actor,
    kind: unknown,
    platform: unknown,
    claimId: string,
  ) {
    const key = PromptKind.parse(kind),
      device = z.enum(["web", "ios", "android"]).parse(platform),
      id = z.uuid().parse(claimId);
    const target =
      key === "install"
        ? device === "web"
          ? undefined
          : this.installURLs[device]
        : "/notifications/settings";
    if (!target) return { eligible: false as const };
    return this.service.db.actor(actor, null, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`growth.prompt:${actor.accountId}`],
      );
      const useful = (
        await client.query(
          "SELECT 1 FROM growth.metric WHERE account_id=$1 AND type='useful_answer' AND document->>'capability'='available' LIMIT 1",
          [actor.accountId],
        )
      ).rowCount;
      if (!useful) return { eligible: false as const };
      const prefs = (
        await client.query(
          "SELECT document FROM growth.preference WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0]?.document;
      if (key === "return" && (prefs?.push || prefs?.email))
        return { eligible: false as const };
      await client.query(
        "INSERT INTO growth.prompt_choice(account_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [actor.accountId, key],
      );
      const previous = (
        await client.query(
          "SELECT choice,last_claim_id,last_claim_platform,last_shown_at,updated_at FROM growth.prompt_choice WHERE account_id=$1 AND kind=$2",
          [actor.accountId, key],
        )
      ).rows[0];
      if (previous.last_claim_id === id) {
        if (previous.last_claim_platform !== device)
          throw new DomainError(
            "prompt_claim_conflict",
            "This choice request changed platforms.",
            409,
          );
        return previous.choice === "eligible" &&
          previous.updated_at.getTime() === previous.last_shown_at.getTime()
          ? { eligible: true as const, target }
          : { eligible: false as const };
      }
      const row = (
        await client.query(
          `UPDATE growth.prompt_choice SET impressions=impressions+1,last_shown_at=now(),updated_at=now(),choice='eligible',last_claim_id=$3,last_claim_platform=$4
         WHERE account_id=$1 AND kind=$2 AND choice IN ('eligible','later') AND impressions<3
         AND NOT EXISTS(SELECT 1 FROM growth.prompt_choice p WHERE p.account_id=$1 AND p.last_shown_at>now()-interval '7 days') RETURNING kind`,
          [actor.accountId, key, id, device],
        )
      ).rows[0];
      return row
        ? { eligible: true as const, target }
        : { eligible: false as const };
    });
  }
  async choosePrompt(
    actor: Actor,
    kind: unknown,
    decision: unknown,
    claimId: string,
  ) {
    const key = PromptKind.parse(kind),
      choice = PromptDecision.parse(decision),
      id = z.uuid().parse(claimId);
    return this.service.db.actor(actor, null, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`growth.prompt:${actor.accountId}`],
      );
      const result = await client.query(
        "UPDATE growth.prompt_choice SET choice=$3,updated_at=now() WHERE account_id=$1 AND kind=$2 AND impressions>0 AND last_claim_id=$4 AND choice IN ('eligible',$3) RETURNING kind",
        [actor.accountId, key, choice, id],
      );
      if (!result.rowCount)
        throw new DomainError(
          "prompt_unavailable",
          "This choice is unavailable.",
          404,
        );
      return { saved: true };
    });
  }
  async choices(actor: Actor) {
    return this.service.db.actor(
      actor,
      null,
      async (client) =>
        (
          await client.query(
            "SELECT kind,choice,impressions,last_shown_at FROM growth.prompt_choice WHERE account_id=$1 ORDER BY kind",
            [actor.accountId],
          )
        ).rows,
    );
  }

  /** Voluntary, validated source attribution; no device identifiers, free text or inferred consent. */
  async attribute(actor: Actor, input: unknown) {
    const entry = Entry.parse(input),
      creator = await this.service.creator(entry.handle);
    if (!creator || creator.state !== "published")
      throw new DomainError(
        "entry_unavailable",
        "This entry is unavailable.",
        404,
      );
    if (
      ["post", "invite", "share"].includes(entry.source) !==
      Boolean(entry.objectId)
    )
      throw new DomainError(
        "entry_context_required",
        "Choose a valid entry source.",
        400,
      );
    if (
      entry.source === "post" &&
      !(await this.service.post(entry.handle, entry.objectId!))
    )
      throw new DomainError(
        "entry_unavailable",
        "This post is unavailable.",
        404,
      );
    if (
      entry.source === "invite" &&
      (await this.service.invite(entry.objectId!))?.creator.id !== creator.id
    )
      throw new DomainError(
        "entry_unavailable",
        "This invitation is unavailable.",
        404,
      );
    if (entry.source === "share") {
      const share = await this.service.share(entry.objectId!);
      if (share?.state !== "valid" || share.source.creatorId !== creator.id)
        throw new DomainError(
          "entry_unavailable",
          "This shared reply is unavailable.",
          404,
        );
    }
    return this.service.db.actor(actor, null, async (client) => {
      const inserted = await client.query(
        "INSERT INTO growth.entry_attribution(id,account_id,creator_id,source,object_id,surface) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id",
        [
          entry.id,
          actor.accountId,
          creator.id,
          entry.source,
          entry.objectId,
          entry.surface,
        ],
      );
      if (!inserted.rowCount) {
        const prior = (
          await client.query(
            "SELECT creator_id,source,object_id,surface FROM growth.entry_attribution WHERE id=$1 AND account_id=$2",
            [entry.id, actor.accountId],
          )
        ).rows[0];
        if (
          !prior ||
          contentHash(prior) !==
            contentHash({
              creator_id: creator.id,
              source: entry.source,
              object_id: entry.objectId,
              surface: entry.surface,
            })
        )
          throw new DomainError(
            "entry_id_conflict",
            "This entry ID has different contents.",
            409,
          );
      }
      return { saved: true };
    });
  }

  async createReferral(actor: Actor, input: unknown) {
    const value = z
      .strictObject({
        handle: z.string().regex(/^[a-z0-9_]{3,30}$/u),
        contextId: z.uuid().nullable(),
      })
      .parse(input);
    const creator = await this.service.creator(value.handle);
    if (
      !creator ||
      creator.state !== "published" ||
      (value.contextId &&
        !(await this.service.post(value.handle, value.contextId)))
    )
      throw new DomainError(
        "entry_unavailable",
        "This creator or post is unavailable.",
        404,
      );
    return this.service.db.actor(actor, creator.id, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`growth.invites:${actor.accountId}`],
      );
      const count = (
        await client.query(
          "SELECT count(*)::int AS count FROM growth.invite WHERE created_by=$1 AND expires_at>now() AND revoked_at IS NULL",
          [actor.accountId],
        )
      ).rows[0]?.count;
      if (count >= 20)
        throw new DomainError(
          "invite_limit",
          "Review your active invitation links first.",
          429,
        );
      return (
        await client.query(
          "INSERT INTO growth.invite(creator_id,created_by,context_id,expires_at,campaign) VALUES($1,$2,$3,now()+interval '30 days','voluntary_invite') RETURNING id,expires_at",
          [creator.id, actor.accountId, value.contextId],
        )
      ).rows[0];
    });
  }
  async revokeInvite(actor: Actor, id: string) {
    return this.service.db.actor(actor, null, async (client) => {
      const prior = (
        await client.query(
          "SELECT creator_id FROM growth.invite WHERE id=$1 AND created_by=$2",
          [z.uuid().parse(id), actor.accountId],
        )
      ).rows[0];
      if (!prior)
        throw new DomainError(
          "invite_unavailable",
          "This invitation is unavailable.",
          404,
        );
      await client.query("SELECT set_config('app.creator_id',$1,true)", [
        prior.creator_id,
      ]);
      const result = await client.query(
        "UPDATE growth.invite SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1 AND created_by=$2 RETURNING id",
        [z.uuid().parse(id), actor.accountId],
      );
      if (!result.rowCount)
        throw new DomainError(
          "invite_unavailable",
          "This invitation is unavailable.",
          404,
        );
      return { revoked: true };
    });
  }
}
