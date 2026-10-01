import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  ContentDocument,
  ContentPage,
  ContentReplyPage,
  SaveContent,
  PublishContent,
  ContentVersionCommand,
  ReplyToNote,
  QuoteConsent,
  ReactToReply,
  ThanksCommand,
  type Audience,
  type ContentBody,
  type ContentView,
  type PrivateNoteReply,
} from "../../../../../packages/api/src/content.js";
import type { Actor } from "../identity/adapter.js";
import { identityTransaction } from "../identity/transaction.js";
import {
  consumeCreatorSignedAct,
  setSignatureVisibility,
} from "../identity/subjects.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { SignedActCommand } from "@qelvora/api";
import { consentEnvelope } from "../identity/consent.js";

type Index = {
  id: string;
  creator_id: string;
  version: number;
  state: string;
  audience: Audience;
  kind: string;
  published_at: Date | null;
  scheduled_at: Date | null;
  quote_reply_id: string | null;
  quote_consent_version: number | null;
  packet_id: string | null;
};
export interface ContentDependencies {
  /** Current producer state only. Missing adapters fail closed for their path. */
  follows?: (
    client: PoolClient,
    accountId: string,
    creatorId: string,
  ) => Promise<boolean>;
  audienceCount?: (
    client: PoolClient,
    creatorId: string,
    audience: Audience,
  ) => Promise<number | null>;
  media?: (
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    media: ContentBody["media"][number],
  ) => Promise<{
    ready: boolean;
    durationMs: number | null;
    humanRecorded: boolean;
  }>;
  publicPacket?: (
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    packetId: string,
  ) => Promise<boolean>;
  /** W8 reviews the exact immutable reply. Missing/unavailable review leaves it quarantined. */
  reviewReply?: (input: {
    replyId: string;
    creatorId: string;
    fanId: string;
    version: number;
    text: string;
    textHash: string;
  }) => Promise<{
    state: "allowed" | "flagged";
    reference: string;
    textHash: string;
  }>;
  assertAllowed?: (actor: Actor, creatorId: string) => Promise<void>;
  effect?: (
    actor: Actor,
    effect: {
      id: string;
      creatorId: string;
      contentId: string;
      version: number;
      type: string;
      subjectKind?: "content" | "reply" | "thanks";
    },
  ) => Promise<{ reference: string }>;
  thanksMessage?: (
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    messageId: string,
  ) => Promise<string | null>;
  liveCatalog?: (
    client: PoolClient,
    actor: Actor,
    creatorId: string,
  ) => Promise<
    Array<NonNullable<ContentBody["live"]> & { replayReady: boolean }>
  >;
  liveSession?: (
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    live: NonNullable<ContentBody["live"]>,
    kind: "live" | "replay",
  ) => Promise<boolean>;
  revokeSource?: (
    actor: Actor,
    creatorId: string,
    contentId: string,
    version: number,
  ) => Promise<void>;
}

export function publicationCommand(
  row: Index,
  document: ContentBody,
): SignedActCommand {
  return {
    actType: document.kind === "note" ? "broadcast" : "reply",
    subjectId: row.id,
    content: {
      kind: "content_publication",
      creatorId: row.creator_id,
      version: row.version,
      document,
    },
  };
}
export function reactionCommand(
  creatorId: string,
  replyId: string,
  version: number,
  kind: string,
): SignedActCommand {
  return {
    actType: "reaction",
    subjectId: replyId,
    content: {
      kind: "content_reaction",
      creatorId,
      replyVersion: version,
      reaction: kind,
    },
  };
}

export class ContentService {
  constructor(
    readonly pool: Pool,
    readonly dependencies: ContentDependencies = {},
  ) {}
  private async consentRecord(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    subjectId: string,
    version: number,
    text: string,
    purpose: string,
    granted: boolean,
  ) {
    const envelope = consentEnvelope(actor, {
      purpose,
      policyVersion: "content-v1",
      decision: granted ? "grant" : "withdraw",
      scope: { creatorId, subjectId },
    });
    await client.query(
      "INSERT INTO creator.content_consent_history(id,account_id,creator_id,subject_id,version,text_hash,envelope) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        envelope.id,
        actor.accountId,
        creatorId,
        subjectId,
        version,
        contentHash({ text }),
        envelope,
      ],
    );
  }
  private async fanEffect(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    subjectId: string,
    subjectKind: "reply" | "thanks",
    version: number,
    type: string,
  ) {
    await client.query(
      "INSERT INTO creator.content_fan_effect(account_id,creator_id,subject_id,subject_kind,version,type) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(subject_id,version,type) DO NOTHING",
      [actor.accountId, creatorId, subjectId, subjectKind, version, type],
    );
  }
  async assertCurrentAllowed(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
  ) {
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    await this.dependencies.assertAllowed?.(actor, creatorId);
    const denied = await client.query(
      "SELECT 1 FROM creator.content_tombstone WHERE account_id=$1",
      [actor.accountId],
    );
    invariant(
      !denied.rowCount,
      "content_deleted",
      "This account's content has been removed.",
    );
  }
  async transaction<T>(
    actor: Actor,
    creatorId: string,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return identityTransaction(this.pool, actor.accountId, async (client) => {
      await client.query("SELECT set_config('app.creator_id',$1,true)", [
        creatorId,
      ]);
      await this.assertCurrentAllowed(client, actor, creatorId);
      return work(client);
    });
  }
  async role(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    permitted: string[] = [],
  ) {
    // Current W5 role locks match W1 invitation/removal order and survive the
    // domain commit. Holding a team grant never confers creator authority.
    await client.query(
      "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR SHARE",
      [creatorId, actor.accountId],
    );
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `team:${creatorId}:${actor.accountId}`,
    ]);
    await client.query(
      "SELECT roles FROM creator.team_membership WHERE creator_id=$1 AND account_id=$2 AND revoked_at IS NULL FOR SHARE",
      [creatorId, actor.accountId],
    );
    const row = (
      await client.query<{
        display_name: string;
        handle: string;
        account_id: string;
        roles: string[];
        member_handle: string | null;
      }>(
        `SELECT cp.display_name,cp.handle,cp.account_id,coalesce(tm.roles,'{}') AS roles,f.handle AS member_handle FROM creator.creator_profile cp LEFT JOIN creator.team_membership tm ON tm.creator_id=cp.id AND tm.account_id=$2 AND tm.revoked_at IS NULL LEFT JOIN creator.fan_profile f ON f.account_id=$2 WHERE cp.id=$1 AND cp.verification='verified' AND NOT cp.recovery_required`,
        [creatorId, actor.accountId],
      )
    ).rows[0];
    invariant(
      row &&
        (row.account_id === actor.accountId ||
          row.roles.some((r) => permitted.includes(r))),
      "creator_role_required",
      "Your current role does not allow this action.",
    );
    return { ...row, creator: row.account_id === actor.accountId };
  }
  async command<T>(
    client: PoolClient,
    actor: Actor,
    operation: string,
    key: string,
    body: unknown,
    work: () => Promise<T>,
  ): Promise<T> {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `${actor.accountId}:content:${operation}:${key}`,
    ]);
    const hash = contentHash(body),
      name = `content.${operation}`;
    const prior = (
      await client.query<{ request_hash: string; response: T }>(
        "SELECT request_hash,response FROM creator.idempotency_key WHERE actor_account_id=$1 AND operation=$2 AND key=$3",
        [actor.accountId, name, key],
      )
    ).rows[0];
    if (prior) {
      invariant(
        prior.request_hash === hash,
        "idempotency_conflict",
        "This retry key was used for different content.",
      );
      return prior.response;
    }
    const result = await work();
    await client.query(
      "INSERT INTO creator.idempotency_key(actor_account_id,operation,key,request_hash,response) VALUES($1,$2,$3,$4,$5)",
      [actor.accountId, name, key, hash, JSON.stringify(result)],
    );
    return result;
  }
  async index(client: PoolClient, creatorId: string, id: string, lock = false) {
    const row = (
      await client.query<Index>(
        `SELECT * FROM creator.content_index WHERE id=$1 AND creator_id=$2${lock ? " FOR UPDATE" : ""}`,
        [id, creatorId],
      )
    ).rows[0];
    if (!row)
      throw new DomainError(
        "content_unavailable",
        "This content is unavailable.",
        404,
      );
    return row;
  }
  async eligible(client: PoolClient, actor: Actor, row: Index) {
    const creator = (
      await client.query(
        "SELECT verification,recovery_required FROM creator.creator_profile WHERE id=$1",
        [row.creator_id],
      )
    ).rows[0];
    if (
      !creator ||
      creator.verification !== "verified" ||
      creator.recovery_required ||
      row.state !== "published"
    )
      return false;
    if (row.quote_reply_id) {
      const consent = (
        await client.query(
          "SELECT share_text,version FROM creator.content_quote_permission WHERE reply_id=$1",
          [row.quote_reply_id],
        )
      ).rows[0];
      if (!consent?.share_text || consent.version !== row.quote_consent_version)
        return false;
    }
    if (
      row.packet_id &&
      !(await this.dependencies.publicPacket?.(
        client,
        actor,
        row.creator_id,
        row.packet_id,
      ))
    )
      return false;
    if (row.audience.kind === "public") return true;
    const fan = (
      await client.query(
        "SELECT id FROM creator.fan_profile WHERE account_id=$1",
        [actor.accountId],
      )
    ).rows[0];
    if (!fan) return false;
    if (
      row.kind === "note" &&
      (
        await client.query(
          "SELECT 1 FROM creator.content_preference WHERE creator_id=$1 AND account_id=$2 AND muted",
          [row.creator_id, actor.accountId],
        )
      ).rowCount
    )
      return false;
    if (row.audience.kind === "followers")
      return (
        (await this.dependencies.follows?.(
          client,
          actor.accountId,
          row.creator_id,
        )) ?? false
      );
    await client.query("SELECT set_config('app.fan_id',$1,true)", [fan.id]);
    const rows = (
      await client.query<{
        tier_id: string;
        capabilities: string[];
        catalog: { contentGroups?: string[] };
      }>(
        `SELECT m.tier_id,t.capabilities,t.catalog FROM creator.commerce_membership m JOIN creator.commerce_tier t ON t.id=m.tier_id AND t.creator_id=m.creator_id JOIN creator.access_grant g ON g.id=m.grant_id AND g.creator_id=m.creator_id AND g.fan_id=m.fan_id WHERE m.creator_id=$1 AND m.fan_id=$2 AND m.period_start<=now() AND ((m.state='active' AND m.period_end>now()) OR (m.state='grace' AND m.grace_end>now())) AND g.source='membership' AND g.state='active' AND g.valid_from<=now() AND g.valid_until>now()`,
        [row.creator_id, fan.id],
      )
    ).rows;
    const audience = row.audience;
    if (audience.kind === "members") return rows.length > 0;
    if (audience.kind === "tiers")
      return rows.some((m) => audience.ids.includes(m.tier_id));
    return rows.some((m) =>
      audience.ids.some((id) => (m.catalog.contentGroups ?? []).includes(id)),
    );
  }
  async authorizeRead(
    client: PoolClient,
    actor: Actor,
    row: Index,
    studio = false,
  ) {
    if (studio)
      await this.role(client, actor, row.creator_id, [
        "triage",
        "drafter",
        "publisher",
        "scheduler",
      ]);
    else
      invariant(
        await this.eligible(client, actor, row),
        "content_unavailable",
        "This content is unavailable to this audience.",
      );
    await client.query("SELECT set_config('app.content_id',$1,true)", [row.id]);
  }
  async view(
    client: PoolClient,
    actor: Actor,
    row: Index,
  ): Promise<ContentView> {
    const revision = (
      await client.query(
        "SELECT document FROM creator.content_revision WHERE content_id=$1 AND version=$2",
        [row.id, row.version],
      )
    ).rows[0];
    invariant(revision, "content_unavailable", "This revision is unavailable.");
    const document = ContentDocument.parse(revision.document);
    const creator = (
      await client.query(
        "SELECT display_name,handle FROM creator.creator_profile WHERE id=$1",
        [row.creator_id],
      )
    ).rows[0];
    const publication = (
      await client.query(
        "SELECT * FROM creator.content_publication WHERE content_id=$1 AND version=$2",
        [row.id, row.version],
      )
    ).rows[0];
    const label = await this.audienceLabel(
      client,
      row.creator_id,
      document.audience,
    );
    const source = (
      await client.query(
        "SELECT type,state FROM creator.content_effect WHERE content_id=$1 AND version=$2 AND type IN('source_candidate','source_revoke') ORDER BY created_at DESC LIMIT 1",
        [row.id, row.version],
      )
    ).rows[0];
    const fan = (
      await client.query(
        "SELECT handle FROM creator.fan_profile WHERE account_id=$1",
        [actor.accountId],
      )
    ).rows[0];
    const team =
      publication?.author_kind === "team"
        ? (
            await client.query(
              "SELECT handle FROM creator.fan_profile WHERE account_id=$1",
              [publication.author_account_id],
            )
          ).rows[0]
        : null;
    return {
      id: row.id,
      creatorId: row.creator_id,
      creatorName: creator.display_name,
      creatorHandle: creator.handle,
      teamMember: team?.handle ?? null,
      displayText: document.nameToken
        ? document.text.replaceAll("{name}", fan?.handle ?? "there")
        : document.text,
      version: row.version,
      state: row.state,
      authorKind:
        publication?.author_kind ??
        (document.kind === "note" ? "human_broadcast" : "human_creator"),
      authorLabel: publication?.author_label ?? "Draft · not sent",
      audienceLabel: label,
      signedActId: publication?.signed_act_id ?? null,
      publishedAt: row.published_at?.toISOString() ?? null,
      document,
      audienceCount: document.showAudienceCount
        ? ((await this.dependencies.audienceCount?.(
            client,
            row.creator_id,
            document.audience,
          )) ?? null)
        : null,
      sourceState:
        source?.type === "source_revoke"
          ? source.state === "done"
            ? "revoked"
            : "revocation_pending"
          : source?.state === "done"
            ? "candidate"
            : document.aiUseIntent
              ? "candidate_pending"
              : "not_requested",
      quotedText: publication?.quoted_text ?? null,
      quotedHandle: publication?.quoted_handle ?? null,
    };
  }
  async audienceLabel(
    client: PoolClient,
    creatorId: string,
    audience: Audience,
  ) {
    if (audience.kind === "public") return "public";
    if (audience.kind === "members") return "all members";
    if (audience.kind === "followers") return "followers";
    if (audience.kind === "groups") return "selected groups";
    const names = (
      await client.query<{ name: string }>(
        "SELECT name FROM creator.commerce_tier WHERE creator_id=$1 AND id=ANY($2::uuid[]) ORDER BY name",
        [creatorId, audience.ids],
      )
    ).rows;
    return names.map((r) => r.name).join(", ") + " members";
  }
  async save(actor: Actor, creatorId: string, raw: unknown) {
    const input = SaveContent.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      const role = await this.role(client, actor, creatorId, [
        "drafter",
        "publisher",
      ]);
      return this.command(
        client,
        actor,
        "save",
        input.idempotencyKey,
        { creatorId, ...input },
        async () => {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`content:${input.id}`],
          );
          const existing = (
            await client.query<Index>(
              "SELECT * FROM creator.content_index WHERE id=$1 AND creator_id=$2 FOR UPDATE",
              [input.id, creatorId],
            )
          ).rows[0];
          invariant(
            (existing?.version ?? 0) === input.expectedVersion,
            "content_changed",
            "This draft changed. Refresh before saving; your text is kept.",
          );
          const document = input.document;
          invariant(
            !document.aiUseIntent || role.creator,
            "creator_source_intent_required",
            "The creator must explicitly confirm AI reuse for this revision. Team edits can remove that intent.",
          );
          invariant(
            !document.aiUseIntent ||
              (this.dependencies.effect && this.dependencies.revokeSource),
            "source_integration_unavailable",
            "AI reuse requires both the source candidate and current revocation adapters.",
          );
          if (document.scheduledAt)
            invariant(
              new Date(document.scheduledAt).getTime() > Date.now(),
              "schedule_invalid",
              "Choose a future publication time.",
            );
          if (document.audience.kind === "tiers") {
            const count = (
              await client.query(
                "SELECT count(*) FROM creator.commerce_tier WHERE creator_id=$1 AND id=ANY($2::uuid[])",
                [creatorId, document.audience.ids],
              )
            ).rows[0];
            invariant(
              Number(count.count) === new Set(document.audience.ids).size,
              "audience_unavailable",
              "Choose tiers from this creator.",
            );
          }
          if (document.audience.kind === "groups") {
            const tiers = (
              await client.query(
                "SELECT catalog FROM creator.commerce_tier WHERE creator_id=$1",
                [creatorId],
              )
            ).rows;
            const groups = new Set(
              tiers.flatMap((t) => t.catalog.contentGroups ?? []),
            );
            invariant(
              document.audience.ids.every((id) => groups.has(id)),
              "audience_unavailable",
              "Choose current content groups from this creator’s offers.",
            );
          }
          const version = input.expectedVersion + 1;
          if (existing) {
            const previous = await this.view(client, actor, existing);
            if (previous.document.aiUseIntent)
              await this.dependencies.revokeSource?.(
                actor,
                creatorId,
                existing.id,
                existing.version,
              );
            await this.withdrawSignature(client, actor, existing);
            await this.effect(client, existing, "source_revoke");
            await client.query(
              "UPDATE creator.content_index SET version=$3,state='draft',audience=$4,kind=$5,scheduled_at=$6,published_at=NULL,withdrawn_at=now(),quote_reply_id=$7,quote_consent_version=$8,packet_id=$9 WHERE id=$1 AND creator_id=$2",
              [
                input.id,
                creatorId,
                version,
                JSON.stringify(document.audience),
                document.kind,
                document.scheduledAt,
                document.quote?.replyId ?? null,
                document.quote?.consentVersion ?? null,
                document.packetId,
              ],
            );
          } else
            await client.query(
              "INSERT INTO creator.content_index(id,creator_id,version,state,audience,kind,scheduled_at,quote_reply_id,quote_consent_version,packet_id) VALUES($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9)",
              [
                input.id,
                creatorId,
                version,
                JSON.stringify(document.audience),
                document.kind,
                document.scheduledAt,
                document.quote?.replyId ?? null,
                document.quote?.consentVersion ?? null,
                document.packetId,
              ],
            );
          await client.query(
            "INSERT INTO creator.content_revision(content_id,creator_id,version,document,author_account_id) VALUES($1,$2,$3,$4,$5)",
            [
              input.id,
              creatorId,
              version,
              JSON.stringify(document),
              actor.accountId,
            ],
          );
          return { id: input.id, version, state: "draft" };
        },
      );
    });
  }
  async validatePublication(
    client: PoolClient,
    actor: Actor,
    row: Index,
    document: ContentBody,
  ) {
    if (document.showAudienceCount) {
      const count = await this.dependencies.audienceCount?.(
        client,
        row.creator_id,
        document.audience,
      );
      invariant(
        count != null && Number.isSafeInteger(count) && count >= 0,
        "audience_count_unavailable",
        "Current audience size is unavailable. Turn off its display before publishing.",
      );
    }
    if (document.kind === "live" || document.kind === "replay")
      invariant(
        document.live &&
          (await this.dependencies.liveSession?.(
            client,
            actor,
            row.creator_id,
            document.live,
            document.kind,
          )),
        "live_session_unavailable",
        "Connect the current scheduled W6 live session before publishing this entry.",
      );
    let quotedText: string | null = null,
      quotedHandle: string | null = null;
    if (document.quote) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`content.quote:${document.quote.replyId}`],
      );
      const reply = (
        await client.query(
          "SELECT r.text,p.share_text,p.show_handle,p.version,f.handle FROM creator.content_reply r JOIN creator.content_reply_review m ON m.reply_id=r.id AND m.creator_id=r.creator_id AND m.reply_version=r.version AND m.state='allowed' AND m.withdrawn_at IS NULL JOIN creator.content_quote_permission p ON p.reply_id=r.id JOIN creator.fan_profile f ON f.id=r.fan_id WHERE r.id=$1 AND r.creator_id=$2 AND r.withdrawn_at IS NULL",
          [document.quote.replyId, row.creator_id],
        )
      ).rows[0];
      invariant(
        reply?.share_text && reply.version === document.quote.consentVersion,
        "quote_consent_required",
        "The fan must consent to sharing these exact words. Handle display is separate.",
      );
      quotedText = reply.text;
      quotedHandle = reply.show_handle ? reply.handle : null;
    }
    if (document.packetId)
      invariant(
        await this.dependencies.publicPacket?.(
          client,
          actor,
          row.creator_id,
          document.packetId,
        ),
        "public_packet_consent_required",
        "The current public request or accepted group conversion is required.",
      );
    for (const attachment of document.media) {
      const media = await this.dependencies.media?.(
        client,
        actor,
        row.creator_id,
        attachment,
      );
      invariant(
        media?.ready,
        "media_not_ready",
        "Wait for the owned media revision to finish processing.",
      );
      if (attachment.kind === "voice")
        invariant(
          media.humanRecorded &&
            media.durationMs !== null &&
            (document.kind !== "note" || media.durationMs <= 60000),
          "human_voice_required",
          "A Note needs processed human-recorded voice of at most 60 seconds.",
        );
    }
    return { quotedText, quotedHandle };
  }
  async review(actor: Actor, creatorId: string, id: string) {
    return this.transaction(actor, creatorId, async (client) => {
      await this.role(client, actor, creatorId);
      const row = await this.index(client, creatorId, id),
        view = await this.view(client, actor, row);
      invariant(
        row.state === "draft",
        "draft_required",
        "Save a new draft before signing.",
      );
      await this.validatePublication(client, actor, row, view.document);
      return { command: publicationCommand(row, view.document), view };
    });
  }
  async publish(
    actor: Actor,
    creatorId: string,
    id: string,
    raw: unknown,
    team = false,
  ) {
    const input = team
      ? ContentVersionCommand.parse(raw)
      : PublishContent.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      const role = await this.role(
        client,
        actor,
        creatorId,
        team ? ["publisher"] : [],
      );
      invariant(
        !team || !role.creator,
        "team_identity_required",
        "Use creator signing for your own words.",
      );
      return this.command(
        client,
        actor,
        "publish",
        input.idempotencyKey,
        { creatorId, id, team, ...input },
        async () => {
          const row = await this.index(client, creatorId, id, true);
          invariant(
            row.version === input.version && row.state === "draft",
            "draft_changed",
            "Refresh and review the current draft before publishing.",
          );
          const view = await this.view(client, actor, row),
            document = view.document;
          invariant(
            !team || document.kind === "post",
            "creator_signing_required",
            "Notes, answers, quotes and reactions need the creator's personal signature.",
          );
          const quote = await this.validatePublication(
            client,
            actor,
            row,
            document,
          );
          const signature =
            "signedActId" in input && typeof input.signedActId === "string"
              ? input.signedActId
              : null;
          if (signature)
            await consumeCreatorSignedAct(
              client,
              actor,
              creatorId,
              signature,
              publicationCommand(row, document),
            );
          const scheduled = document.scheduledAt !== null;
          const label = team
            ? `${role.display_name}'s team${role.member_handle ? ` · @${role.member_handle}` : ""}`
            : document.kind === "note"
              ? `${role.display_name} · to ${view.audienceLabel}`
              : role.display_name;
          await client.query(
            "INSERT INTO creator.content_publication(content_id,creator_id,version,signed_act_id,author_kind,author_account_id,author_label,quoted_text,quoted_handle,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $10 THEN NULL ELSE now() END)",
            [
              id,
              creatorId,
              row.version,
              signature,
              team
                ? "team"
                : document.kind === "note"
                  ? "human_broadcast"
                  : "human_creator",
              actor.accountId,
              label,
              quote.quotedText,
              quote.quotedHandle,
              scheduled,
            ],
          );
          await client.query(
            "UPDATE creator.content_index SET state=$2,published_at=CASE WHEN $3 THEN NULL ELSE now() END,withdrawn_at=NULL WHERE id=$1",
            [id, scheduled ? "scheduled" : "published", scheduled],
          );
          if (!scheduled) {
            await this.effect(client, row, "published");
            if (document.aiUseIntent)
              await this.effect(client, row, "source_candidate");
            // Keep exact command private on generic verification pages; C08 checks current access.
          }
          return {
            id,
            version: row.version,
            state: scheduled ? "scheduled" : "published",
            signedActId: signature,
          };
        },
      );
    });
  }
  async lifecycle(
    actor: Actor,
    creatorId: string,
    id: string,
    operation: "unpublish" | "archive",
    raw: unknown,
  ) {
    const input = ContentVersionCommand.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      await this.role(client, actor, creatorId, ["publisher"]);
      return this.command(
        client,
        actor,
        operation,
        input.idempotencyKey,
        { creatorId, id, ...input },
        async () => {
          const row = await this.index(client, creatorId, id, true);
          invariant(
            row.version === input.version,
            "content_changed",
            "This content changed. Refresh first.",
          );
          const previous = await this.view(client, actor, row);
          if (previous.document.aiUseIntent)
            await this.dependencies.revokeSource?.(
              actor,
              creatorId,
              row.id,
              row.version,
            );
          await this.withdrawSignature(client, actor, row);
          await client.query(
            "UPDATE creator.content_index SET state=$2,withdrawn_at=now(),scheduled_at=NULL WHERE id=$1",
            [id, operation === "archive" ? "archived" : "unpublished"],
          );
          await this.effect(client, row, "withdrawn");
          await this.effect(client, row, "source_revoke");
          return {
            id,
            version: row.version,
            state: operation === "archive" ? "archived" : "unpublished",
          };
        },
      );
    });
  }
  private async withdrawSignature(
    client: PoolClient,
    actor: Actor,
    row: Index,
  ) {
    const publication = (
      await client.query(
        "SELECT signed_act_id,author_account_id FROM creator.content_publication WHERE content_id=$1 AND version=$2",
        [row.id, row.version],
      )
    ).rows[0];
    if (
      publication?.signed_act_id &&
      publication.author_account_id === actor.accountId
    )
      await setSignatureVisibility(
        client,
        actor,
        publication.signed_act_id,
        false,
        true,
      );
  }
  async effect(
    client: PoolClient,
    row: Pick<Index, "id" | "creator_id" | "version">,
    type: string,
  ) {
    await client.query(
      "INSERT INTO creator.content_effect(creator_id,content_id,version,type) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [row.creator_id, row.id, row.version, type],
    );
  }
  async get(actor: Actor, creatorId: string, id: string, studio = false) {
    return this.transaction(actor, creatorId, async (client) => {
      const row = await this.index(client, creatorId, id);
      await this.authorizeRead(client, actor, row, studio);
      return this.view(client, actor, row);
    });
  }
  async list(actor: Actor, creatorId: string, raw: unknown, studio = false) {
    const page = ContentPage.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      if (studio)
        await this.role(client, actor, creatorId, [
          "triage",
          "drafter",
          "publisher",
          "scheduler",
        ]);
      const rows = (
        await client.query<Index>(
          "SELECT * FROM creator.content_index WHERE creator_id=$1 AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM creator.content_index WHERE id=$2 AND creator_id=$1)) AND ($3::text IS NULL OR state=$3) ORDER BY created_at DESC,id DESC LIMIT $4",
          [
            creatorId,
            page.cursor ?? null,
            studio ? (page.state ?? null) : "published",
            page.limit + 1,
          ],
        )
      ).rows;
      const items: ContentView[] = [];
      for (const row of rows.slice(0, page.limit)) {
        if (!studio && !(await this.eligible(client, actor, row))) continue;
        await client.query("SELECT set_config('app.content_id',$1,true)", [
          row.id,
        ]);
        const view = await this.view(client, actor, row);
        if (
          !page.query ||
          `${view.document.title} ${view.document.text}`
            .toLocaleLowerCase()
            .includes(page.query.toLocaleLowerCase())
        )
          items.push(view);
      }
      return {
        items,
        nextCursor: rows.length > page.limit ? rows[page.limit - 1]!.id : null,
        serverTime: new Date().toISOString(),
      };
    });
  }
  async reply(actor: Actor, creatorId: string, id: string, raw: unknown) {
    const input = ReplyToNote.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      const row = await this.index(client, creatorId, id);
      await this.authorizeRead(client, actor, row);
      invariant(
        row.kind === "note",
        "note_required",
        "Private replies are for Notes.",
      );
      const fan = (
        await client.query(
          "SELECT id FROM creator.fan_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0];
      invariant(fan, "fan_profile_required", "Set up your fan profile first.");
      return this.command(
        client,
        actor,
        "reply",
        input.idempotencyKey,
        { creatorId, id, ...input },
        async () => {
          const replyId = randomUUID();
          const decision = await this.reviewReplyText(
            replyId,
            creatorId,
            fan.id,
            1,
            input.text,
          );
          const reply = (
            await client.query(
              "INSERT INTO creator.content_reply(id,content_id,creator_id,fan_id,text) VALUES($1,$2,$3,$4,$5) RETURNING id,version",
              [replyId, id, creatorId, fan.id, input.text],
            )
          ).rows[0];
          await client.query(
            "INSERT INTO creator.content_reply_review(reply_id,content_id,creator_id,fan_id,reply_version,state,review_ref,text_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [
              replyId,
              id,
              creatorId,
              fan.id,
              1,
              decision.state,
              decision.reference,
              decision.textHash,
            ],
          );
          await client.query(
            "INSERT INTO creator.content_quote_permission(reply_id) VALUES($1)",
            [reply.id],
          );
          return { ...reply, safetyState: decision.state };
        },
      );
    });
  }
  private async reviewReplyText(
    replyId: string,
    creatorId: string,
    fanId: string,
    version: number,
    text: string,
  ) {
    const textHash = contentHash({ replyId, creatorId, fanId, version, text });
    try {
      const result = await this.dependencies.reviewReply?.({
        replyId,
        creatorId,
        fanId,
        version,
        text,
        textHash,
      });
      if (
        result &&
        ["allowed", "flagged"].includes(result.state) &&
        result.textHash === textHash &&
        typeof result.reference === "string" &&
        result.reference.length > 0 &&
        result.reference.length <= 200
      )
        return { ...result };
    } catch {
      /* Unavailable review must never admit an unreviewed reply. */
    }
    return { state: "pending" as const, reference: null, textHash };
  }
  async retryReplyReview(
    actor: Actor,
    creatorId: string,
    replyId: string,
    raw: unknown,
  ) {
    const input = ContentVersionCommand.parse(raw);
    return this.transaction(actor, creatorId, (client) =>
      this.command(
        client,
        actor,
        "reply_review",
        input.idempotencyKey,
        { creatorId, replyId, ...input },
        async () => {
          const reply = (
            await client.query(
              "SELECT r.* FROM creator.content_reply r JOIN creator.fan_profile f ON f.id=r.fan_id WHERE r.id=$1 AND r.creator_id=$2 AND f.account_id=$3 AND r.withdrawn_at IS NULL FOR UPDATE OF r",
              [replyId, creatorId, actor.accountId],
            )
          ).rows[0];
          invariant(
            reply && reply.version === input.version,
            "reply_changed",
            "Only the fan who wrote this current reply can request review.",
          );
          const prior = (
            await client.query(
              "SELECT state FROM creator.content_reply_review WHERE reply_id=$1",
              [replyId],
            )
          ).rows[0];
          invariant(
            prior,
            "reply_review_unavailable",
            "This reply requires current review metadata.",
          );
          if (prior.state !== "pending")
            return {
              id: replyId,
              version: reply.version,
              safetyState: prior.state,
            };
          const decision = await this.reviewReplyText(
            replyId,
            creatorId,
            reply.fan_id,
            reply.version,
            reply.text,
          );
          await client.query(
            "UPDATE creator.content_reply_review SET state=$2,review_ref=$3,text_hash=$4 WHERE reply_id=$1",
            [replyId, decision.state, decision.reference, decision.textHash],
          );
          return {
            id: replyId,
            version: reply.version,
            safetyState: decision.state,
          };
        },
      ),
    );
  }
  async markReplyRead(
    actor: Actor,
    creatorId: string,
    replyId: string,
    raw: unknown,
  ) {
    const input = ContentVersionCommand.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      await this.role(client, actor, creatorId, ["triage"]);
      return this.command(
        client,
        actor,
        "reply_read",
        input.idempotencyKey,
        { creatorId, replyId, ...input },
        async () => {
          const row = (
            await client.query(
              "SELECT reply_version FROM creator.content_reply_review WHERE reply_id=$1 AND creator_id=$2 AND state<>'pending' AND withdrawn_at IS NULL",
              [replyId, creatorId],
            )
          ).rows[0];
          invariant(
            row?.reply_version === input.version,
            "reply_changed",
            "Refresh this reply before marking it read.",
          );
          await client.query(
            "INSERT INTO creator.content_reply_read(reply_id,creator_id,account_id,reply_version) VALUES($1,$2,$3,$4) ON CONFLICT(reply_id,account_id) DO UPDATE SET reply_version=greatest(creator.content_reply_read.reply_version,excluded.reply_version),read_at=now()",
            [replyId, creatorId, actor.accountId, input.version],
          );
          return { id: replyId, version: input.version, read: true };
        },
      );
    });
  }
  async replies(actor: Actor, creatorId: string, raw: unknown, studio = false) {
    const page = ContentReplyPage.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      if (studio) await this.role(client, actor, creatorId, ["triage"]);
      else
        invariant(
          page.filter === "all",
          "studio_filter_required",
          "Reply filters require Studio access.",
        );
      const rows = (
        await client.query(
          `SELECT m.reply_id AS id,m.creator_id,m.fan_id,m.reply_version AS version,m.created_at,m.state,m.content_id,r.text,f.handle,p.share_text,p.show_handle,p.version AS consent_version,re.kind AS reaction_kind,re.signed_act_id,(rd.reply_version>=m.reply_version) AS read
        FROM creator.content_reply_review m JOIN creator.fan_profile f ON f.id=m.fan_id LEFT JOIN creator.content_reply r ON r.id=m.reply_id
        JOIN creator.content_quote_permission p ON p.reply_id=m.reply_id LEFT JOIN creator.content_reaction re ON re.reply_id=m.reply_id
        LEFT JOIN creator.content_reply_read rd ON rd.reply_id=m.reply_id AND rd.account_id=$4
        WHERE m.creator_id=$1 AND m.withdrawn_at IS NULL AND ($2::uuid IS NULL OR (m.created_at,m.reply_id)<(SELECT created_at,reply_id FROM creator.content_reply_review WHERE reply_id=$2 AND creator_id=$1))
        AND (NOT $5 OR (($6='flagged' AND m.state='flagged') OR ($6<>'flagged' AND m.state='allowed' AND ($6<>'unread' OR rd.reply_version IS NULL OR rd.reply_version<m.reply_version) AND ($6<>'reacted' OR re.reply_id IS NOT NULL))))
        ORDER BY m.created_at DESC,m.reply_id DESC LIMIT $3`,
          [
            creatorId,
            page.cursor ?? null,
            page.limit + 1,
            actor.accountId,
            studio,
            page.filter,
          ],
        )
      ).rows;
      const items: PrivateNoteReply[] = rows.slice(0, page.limit).map((r) => ({
        id: r.id,
        contentId: r.content_id,
        fanId: r.fan_id,
        handle: r.handle,
        text:
          studio && r.state !== "allowed"
            ? "Reply withheld and routed for safety review."
            : (r.text ?? "Reply withheld and routed for safety review."),
        version: r.version,
        createdAt: r.created_at.toISOString(),
        safetyState: r.state,
        safetyReviewAvailable: Boolean(this.dependencies.reviewReply),
        read: Boolean(r.read),
        consent: {
          shareText: r.share_text,
          showHandle: r.show_handle,
          version: r.consent_version,
        },
        reaction: r.reaction_kind
          ? { kind: r.reaction_kind, signedActId: r.signed_act_id }
          : null,
      }));
      return {
        items,
        nextCursor: rows.length > page.limit ? rows[page.limit - 1]!.id : null,
      };
    });
  }
  async consent(
    actor: Actor,
    creatorId: string,
    replyId: string,
    raw: unknown,
  ) {
    const input = QuoteConsent.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`content.quote:${replyId}`],
      );
      const reply = (
        await client.query(
          "SELECT r.id,r.text,r.withdrawn_at FROM creator.content_reply r JOIN creator.fan_profile f ON f.id=r.fan_id WHERE r.id=$1 AND r.creator_id=$2 AND f.account_id=$3",
          [replyId, creatorId, actor.accountId],
        )
      ).rows[0];
      invariant(
        reply,
        "reply_unavailable",
        "Only the fan who wrote this reply can change sharing consent.",
      );
      invariant(
        !reply.withdrawn_at || !input.shareText,
        "reply_withdrawn",
        "A withdrawn reply cannot be shared again.",
      );
      return this.command(
        client,
        actor,
        "quote_consent",
        input.idempotencyKey,
        { creatorId, replyId, ...input },
        async () => {
          const result = (
            await client.query(
              "UPDATE creator.content_quote_permission SET share_text=$2,show_handle=$3,version=version+1 WHERE reply_id=$1 AND version=$4 RETURNING version,share_text,show_handle",
              [replyId, input.shareText, input.showHandle, input.version],
            )
          ).rows[0];
          invariant(
            result,
            "consent_changed",
            "Consent changed. Refresh before trying again.",
          );
          await this.consentRecord(
            client,
            actor,
            creatorId,
            replyId,
            result.version,
            reply.text,
            "content.quote_text",
            input.shareText,
          );
          await this.consentRecord(
            client,
            actor,
            creatorId,
            replyId,
            result.version,
            reply.text,
            "content.quote_handle",
            input.showHandle,
          );
          await this.fanEffect(
            client,
            actor,
            creatorId,
            replyId,
            "reply",
            result.version,
            "quote_changed",
          );
          return result;
        },
      );
    });
  }
  async withdrawReply(
    actor: Actor,
    creatorId: string,
    replyId: string,
    raw: unknown,
  ) {
    const input = ContentVersionCommand.parse(raw);
    return this.transaction(actor, creatorId, (client) =>
      this.command(
        client,
        actor,
        "reply_withdraw",
        input.idempotencyKey,
        { creatorId, replyId, ...input },
        async () => {
          await client.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            [`content.quote:${replyId}`],
          );
          const reply = (
            await client.query(
              "SELECT r.id,r.version,r.text FROM creator.content_reply r JOIN creator.fan_profile f ON f.id=r.fan_id WHERE r.id=$1 AND r.creator_id=$2 AND f.account_id=$3 AND r.withdrawn_at IS NULL FOR UPDATE OF r",
              [replyId, creatorId, actor.accountId],
            )
          ).rows[0];
          invariant(
            reply && reply.version === input.version,
            "reply_changed",
            "Your reply changed. Refresh before withdrawing.",
          );
          const permission = (
            await client.query(
              "UPDATE creator.content_quote_permission SET share_text=false,show_handle=false,version=version+1 WHERE reply_id=$1 RETURNING version",
              [replyId],
            )
          ).rows[0];
          await this.consentRecord(
            client,
            actor,
            creatorId,
            replyId,
            permission.version,
            reply.text,
            "content.quote_text",
            false,
          );
          await this.consentRecord(
            client,
            actor,
            creatorId,
            replyId,
            permission.version,
            reply.text,
            "content.quote_handle",
            false,
          );
          await client.query(
            "UPDATE creator.content_reply SET text='[Reply withdrawn]',withdrawn_at=now(),version=version+1 WHERE id=$1",
            [replyId],
          );
          await client.query(
            "UPDATE creator.content_reply_review SET withdrawn_at=now(),reply_version=$2 WHERE reply_id=$1",
            [replyId, reply.version + 1],
          );
          await this.fanEffect(
            client,
            actor,
            creatorId,
            replyId,
            "reply",
            reply.version + 1,
            "reply_withdrawn",
          );
          return { id: replyId, withdrawn: true };
        },
      ),
    );
  }
  async react(actor: Actor, creatorId: string, replyId: string, raw: unknown) {
    const input = ReactToReply.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      await this.role(client, actor, creatorId);
      return this.command(
        client,
        actor,
        "reaction",
        input.idempotencyKey,
        { creatorId, replyId, ...input },
        async () => {
          const reply = (
            await client.query(
              "SELECT r.* FROM creator.content_reply r JOIN creator.content_reply_review m ON m.reply_id=r.id AND m.creator_id=r.creator_id AND m.reply_version=r.version AND m.state='allowed' AND m.withdrawn_at IS NULL WHERE r.id=$1 AND r.creator_id=$2 AND r.withdrawn_at IS NULL",
              [replyId, creatorId],
            )
          ).rows[0];
          invariant(
            reply && reply.version === input.version,
            "reply_changed",
            "Refresh this reply before reacting.",
          );
          const note = await this.index(client, creatorId, reply.content_id);
          invariant(
            note.state === "published",
            "note_unavailable",
            "A removed Note cannot receive a new reaction.",
          );
          invariant(
            !(
              await client.query(
                "SELECT 1 FROM creator.content_reaction WHERE reply_id=$1",
                [replyId],
              )
            ).rowCount,
            "reaction_exists",
            "This reply already has a signed reaction. Refresh to see it.",
          );
          await consumeCreatorSignedAct(
            client,
            actor,
            creatorId,
            input.signedActId,
            reactionCommand(creatorId, replyId, reply.version, input.kind),
          );
          await client.query(
            "INSERT INTO creator.content_reaction(reply_id,creator_id,kind,signed_act_id) VALUES($1,$2,$3,$4)",
            [replyId, creatorId, input.kind, input.signedActId],
          );
          await this.effect(
            client,
            { id: replyId, creator_id: creatorId, version: reply.version },
            "reaction",
          );
          return { replyId, kind: input.kind, signedActId: input.signedActId };
        },
      );
    });
  }
  async liveCatalog(actor: Actor, creatorId: string) {
    return this.transaction(actor, creatorId, async (client) => {
      await this.role(client, actor, creatorId, ["drafter", "publisher"]);
      return {
        available: Boolean(this.dependencies.liveCatalog),
        items:
          (await this.dependencies.liveCatalog?.(client, actor, creatorId)) ??
          [],
      };
    });
  }
  async preference(actor: Actor, creatorId: string) {
    return this.transaction(actor, creatorId, async (client) => ({
      accountId: actor.accountId,
      muted:
        (
          await client.query(
            "SELECT muted FROM creator.content_preference WHERE creator_id=$1 AND account_id=$2",
            [creatorId, actor.accountId],
          )
        ).rows[0]?.muted ?? false,
    }));
  }
  async mute(actor: Actor, creatorId: string, raw: unknown) {
    const input = z.strictObject({ muted: z.boolean() }).parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      await client.query(
        "INSERT INTO creator.content_preference(creator_id,account_id,muted) VALUES($1,$2,$3) ON CONFLICT(creator_id,account_id) DO UPDATE SET muted=excluded.muted",
        [creatorId, actor.accountId, input.muted],
      );
      return input;
    });
  }
  async thanks(actor: Actor, creatorId: string, raw: unknown) {
    const input = ThanksCommand.parse(raw);
    return this.transaction(actor, creatorId, async (client) => {
      const fan = (
        await client.query(
          "SELECT id FROM creator.fan_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0];
      invariant(fan, "fan_profile_required", "Set up your fan profile first.");
      let threadId: string | null = null;
      if (!input.withdrawn) {
        if (input.targetKind === "content")
          await this.authorizeRead(
            client,
            actor,
            await this.index(client, creatorId, input.targetId),
          );
        else {
          threadId =
            (await this.dependencies.thanksMessage?.(
              client,
              actor,
              creatorId,
              input.targetId,
            )) ?? null;
          invariant(
            threadId,
            "thanks_target_unavailable",
            "This message is unavailable or cannot receive Thanks.",
          );
        }
      }
      return this.command(
        client,
        actor,
        "thanks",
        input.idempotencyKey,
        { creatorId, ...input },
        async () => {
          const prior = (
            await client.query(
              "SELECT * FROM creator.content_thanks WHERE fan_id=$1 AND target_kind=$2 AND target_id=$3 FOR UPDATE",
              [fan.id, input.targetKind, input.targetId],
            )
          ).rows[0];
          invariant(
            (prior?.version ?? 0) === input.expectedVersion,
            "thanks_changed",
            "Your Thanks changed. Refresh first.",
          );
          invariant(
            !input.withdrawn || prior,
            "thanks_unavailable",
            "There is no saved Thanks to withdraw.",
          );
          invariant(
            !prior || prior.creator_id === creatorId,
            "thanks_scope_changed",
            "Open this Thanks from its original creator.",
          );
          const result = (
            await client.query(
              "INSERT INTO creator.content_thanks(creator_id,fan_id,target_kind,target_id,text,share_digest,show_identity,withdrawn_at,version,thread_id) VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $8 THEN now() ELSE NULL END,$9,$10) ON CONFLICT(fan_id,target_kind,target_id) DO UPDATE SET text=excluded.text,share_digest=excluded.share_digest,show_identity=excluded.show_identity,withdrawn_at=excluded.withdrawn_at,version=excluded.version,thread_id=coalesce(excluded.thread_id,creator.content_thanks.thread_id) RETURNING id,version",
              [
                creatorId,
                fan.id,
                input.targetKind,
                input.targetId,
                input.withdrawn ? "" : input.text,
                !input.withdrawn && input.shareWithCreatorDigest,
                !input.withdrawn && input.showIdentity,
                input.withdrawn,
                input.expectedVersion + 1,
                threadId ?? prior?.thread_id ?? null,
              ],
            )
          ).rows[0];
          await this.consentRecord(
            client,
            actor,
            creatorId,
            result.id,
            result.version,
            input.withdrawn ? "" : input.text,
            "content.thanks_digest",
            !input.withdrawn && input.shareWithCreatorDigest,
          );
          await this.consentRecord(
            client,
            actor,
            creatorId,
            result.id,
            result.version,
            input.withdrawn ? "" : input.text,
            "content.thanks_identity",
            !input.withdrawn && input.showIdentity,
          );
          await this.fanEffect(
            client,
            actor,
            creatorId,
            result.id,
            "thanks",
            result.version,
            "thanks_changed",
          );
          return result;
        },
      );
    });
  }
  async thanksFeed(actor: Actor, creatorId: string) {
    return this.transaction(actor, creatorId, async (client) => {
      await this.role(client, actor, creatorId);
      return (
        await client.query(
          "SELECT t.id,t.version,t.target_kind,t.target_id,t.text,CASE WHEN t.show_identity THEN f.handle ELSE NULL END AS handle,t.created_at FROM creator.content_thanks t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE t.creator_id=$1 AND t.share_digest AND t.withdrawn_at IS NULL AND ((t.target_kind='content' AND EXISTS(SELECT 1 FROM creator.content_index i WHERE i.id=t.target_id AND i.creator_id=t.creator_id AND i.state='published')) OR (t.target_kind='message' AND EXISTS(SELECT 1 FROM creator.message m WHERE m.id=t.target_id AND m.creator_id=t.creator_id AND m.fan_id=t.fan_id AND m.delivery_state='delivered'))) ORDER BY t.created_at DESC,t.id DESC LIMIT 50",
          [creatorId],
        )
      ).rows;
    });
  }
  async myThanks(actor: Actor, creatorId: string, raw: unknown) {
    const input = z
      .strictObject({
        targetKind: z.enum(["content", "message"]),
        targetId: z.uuid(),
      })
      .parse(raw);
    return this.transaction(
      actor,
      creatorId,
      async (client) =>
        (
          await client.query(
            'SELECT t.id,t.version,t.text,t.share_digest AS "shareWithCreatorDigest",t.show_identity AS "showIdentity",t.withdrawn_at IS NOT NULL AS withdrawn FROM creator.content_thanks t JOIN creator.fan_profile f ON f.id=t.fan_id WHERE f.account_id=$1 AND t.creator_id=$2 AND t.target_kind=$3 AND t.target_id=$4',
            [actor.accountId, creatorId, input.targetKind, input.targetId],
          )
        ).rows[0] ?? null,
    );
  }
  async runScheduled(actor: Actor, creatorId: string) {
    return this.transaction(actor, creatorId, async (client) => {
      await this.role(client, actor, creatorId, ["publisher"]);
      const rows = (
        await client.query<Index>(
          "SELECT * FROM creator.content_index WHERE creator_id=$1 AND state='scheduled' AND scheduled_at<=now() ORDER BY scheduled_at,id LIMIT 20 FOR UPDATE SKIP LOCKED",
          [creatorId],
        )
      ).rows;
      let published = 0;
      for (const row of rows) {
        const view = await this.view(client, actor, row),
          publication = (
            await client.query(
              "SELECT * FROM creator.content_publication WHERE content_id=$1 AND version=$2",
              [row.id, row.version],
            )
          ).rows[0];
        if (publication.author_account_id !== actor.accountId) continue;
        if (publication.signed_act_id) {
          const proof = (
            await client.query(
              "SELECT key_revoked,creator_revoked,withdrawn FROM creator.signed_verification WHERE id=$1",
              [publication.signed_act_id],
            )
          ).rows[0];
          if (
            !proof ||
            proof.key_revoked ||
            proof.creator_revoked ||
            proof.withdrawn
          )
            continue;
        }
        await this.validatePublication(client, actor, row, view.document);
        await client.query(
          "UPDATE creator.content_index SET state='published',published_at=now() WHERE id=$1",
          [row.id],
        );
        await client.query(
          "UPDATE creator.content_publication SET published_at=now() WHERE content_id=$1 AND version=$2",
          [row.id, row.version],
        );
        await this.effect(client, row, "published");
        if (view.document.aiUseIntent)
          await this.effect(client, row, "source_candidate");
        published++;
      }
      return { published };
    });
  }
  async drainEffects(actor: Actor, creatorId: string) {
    if (!this.dependencies.effect)
      throw new DomainError(
        "content_delivery_unconfigured",
        "Distribution/source adapters are not connected. Publication is stored; downstream work is pending.",
        503,
      );
    const leaseId = randomUUID();
    const rows = await this.transaction(actor, creatorId, async (client) => {
      await this.role(client, actor, creatorId, ["publisher"]);
      const ownerRows = (
        await client.query(
          "WITH picked AS (SELECT id FROM creator.content_effect WHERE creator_id=$1 AND state<>'done' AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at,id LIMIT 20 FOR UPDATE SKIP LOCKED) UPDATE creator.content_effect e SET lease_id=$2,lease_until=now()+interval '2 minutes',attempts=attempts+1 FROM picked WHERE e.id=picked.id RETURNING e.*",
          [creatorId, leaseId],
        )
      ).rows;
      const fanRows = (
        await client.query(
          "WITH picked AS (SELECT id FROM creator.content_fan_effect WHERE creator_id=$1 AND state<>'done' AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at,id LIMIT $3 FOR UPDATE SKIP LOCKED) UPDATE creator.content_fan_effect e SET lease_id=$2,lease_until=now()+interval '2 minutes',attempts=attempts+1 FROM picked WHERE e.id=picked.id RETURNING e.*,subject_id AS content_id",
          [creatorId, leaseId, 20 - ownerRows.length],
        )
      ).rows;
      return [
        ...ownerRows.map((row) => ({
          ...row,
          effectTable: "content_effect",
          subject_kind: row.type === "reaction" ? "reply" : "content",
        })),
        ...fanRows.map((row) => ({
          ...row,
          effectTable: "content_fan_effect",
        })),
      ];
    });
    for (const row of rows) {
      try {
        const receipt = await this.dependencies.effect(actor, {
          id: row.id,
          creatorId,
          contentId: row.content_id,
          version: row.version,
          type: row.type,
          subjectKind: row.subject_kind,
        });
        invariant(
          receipt.reference.trim().length > 0,
          "effect_receipt_missing",
          "A durable downstream receipt is required.",
        );
        await this.transaction(actor, creatorId, (client) =>
          client.query(
            `UPDATE creator.${row.effectTable} SET state='done',result_ref=$2,last_error=NULL,lease_until=NULL WHERE id=$1 AND lease_id=$3`,
            [row.id, receipt.reference, leaseId],
          ),
        );
      } catch (failure) {
        await this.transaction(actor, creatorId, (client) =>
          client.query(
            `UPDATE creator.${row.effectTable} SET state='blocked',last_error=$2,lease_until=NULL,next_at=now()+make_interval(secs => LEAST(900,5*power(2,LEAST(attempts,7)))::int) WHERE id=$1 AND lease_id=$3`,
            [
              row.id,
              failure instanceof DomainError
                ? failure.code
                : "downstream_unavailable",
              leaseId,
            ],
          ),
        );
      }
    }
    return { processed: rows.length };
  }
}
