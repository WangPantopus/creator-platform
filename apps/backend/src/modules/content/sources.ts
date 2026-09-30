import type { Actor } from "../identity/adapter.js";
import type { SourceService } from "../sources/service.js";
import type { AgentRepository, CreatorScope } from "../agent/repository.js";
import { AgentAudience } from "../../../../../packages/api/src/agent/contracts.js";
import { ContentDocument } from "../../../../../packages/api/src/content.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { ContentService } from "./service.js";

/** Paired candidate/revocation adapter. Approval remains exclusively in W2. */
export class ContentSources {
  constructor(
    readonly content: ContentService,
    readonly sources: SourceService,
    readonly repository: AgentRepository,
  ) {}
  private scope(actor: Actor, creatorId: string): CreatorScope {
    return { creatorId, accountId: actor.accountId, development: false };
  }
  private reference(contentId: string, version: number) {
    return `content:${contentId}:${version}`;
  }
  async candidate(
    actor: Actor,
    effect: {
      creatorId: string;
      contentId: string;
      version: number;
      id: string;
    },
  ) {
    return this.content.transaction(actor, effect.creatorId, async (client) => {
      await this.content.role(client, actor, effect.creatorId);
      const row = await this.content.index(
        client,
        effect.creatorId,
        effect.contentId,
        true,
      );
      invariant(
        row.version === effect.version && row.state === "published",
        "content_changed",
        "Only the current publication can become a source candidate.",
      );
      const revision = (
        await client.query(
          "SELECT document FROM creator.content_revision WHERE content_id=$1 AND version=$2",
          [row.id, row.version],
        )
      ).rows[0];
      const document = ContentDocument.parse(revision.document);
      invariant(
        document.aiUseIntent &&
          !document.quote &&
          !document.packetId &&
          document.text.length > 0,
        "source_rights_required",
        "Only separately authorized creator text can become a source. Fan quotes and request disclosures require additional reuse permission.",
      );
      if (
        document.audience.kind === "members" ||
        document.audience.kind === "followers"
      )
        throw new DomainError(
          "source_audience_unavailable",
          "W2 does not yet support this relationship audience. No public source was created.",
          503,
        );
      const audience = AgentAudience.parse(
        document.audience.kind === "public"
          ? { kind: "public" }
          : {
              kind: document.audience.kind === "tiers" ? "tier" : "group",
              ids: document.audience.ids,
            },
      );
      const scope = this.scope(actor, effect.creatorId);
      const reference = this.reference(row.id, row.version);
      const receipt = await this.sources.create(
        scope,
        `content_candidate_${effect.id}`,
        {
          title: (document.title || "Creator Note").slice(0, 160),
          text: document.text,
          origin: "manual_text",
          originReference: reference,
          audience,
          rightsEvidence: `Explicit creator source intent for immutable ${reference}; separate source review is required.`,
          expiresAt: null,
        },
      );
      const matching = await this.repository.transaction(
        scope,
        async (sourceClient) =>
          (
            await sourceClient.query(
              "SELECT id FROM creator.ai_source WHERE id=$1 AND creator_id=$2 AND origin_reference=$3",
              [receipt.id, effect.creatorId, reference],
            )
          ).rowCount,
      );
      invariant(
        matching,
        "source_binding_conflict",
        "This text already belongs to another source. Review its existing rights separately.",
      );
      return { reference: receipt.id };
    });
  }
  async revoke(
    actor: Actor,
    creatorId: string,
    contentId: string,
    version: number,
  ) {
    const scope = this.scope(actor, creatorId);
    const rows = await this.repository.transaction(
      scope,
      async (client) =>
        (
          await client.query(
            "SELECT id,revision,state FROM creator.ai_source WHERE creator_id=$1 AND origin_reference=$2 ORDER BY id LIMIT 201",
            [creatorId, this.reference(contentId, version)],
          )
        ).rows,
    );
    invariant(
      rows.length <= 200,
      "source_scope_large",
      "Split this source reconciliation before continuing.",
    );
    for (const row of rows)
      if (row.state !== "revoked")
        await this.sources.act(
          scope,
          row.id,
          `content_revoke_${contentId}_${version}_${row.revision}`,
          { action: "revoke", expectedRevision: row.revision },
        );
  }
}
