import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  SourceCreate,
  SourceAction,
} from "../../../../../packages/api/src/agent/contracts.js";
import {
  AgentRepository,
  bump,
  event,
  type CreatorScope,
} from "../agent/repository.js";
import { contentHash } from "../../core/canonical.js";
import { DomainError, invariant } from "../../core/errors.js";
import { assertAuthorizedCaption, type AuthorizedCaption } from "./youtube.js";
import { chunkText } from "../ingestion/chunking.js";

export class SourceService {
  constructor(
    private readonly repository: AgentRepository,
    private readonly invalidate?: (creatorId: string) => void,
  ) {}
  async create(scope: CreatorScope, key: string, raw: unknown) {
    return this.importSource(scope, key, raw, false);
  }
  async createCaption(
    scope: CreatorScope,
    key: string,
    receipt: AuthorizedCaption,
  ) {
    assertAuthorizedCaption(receipt, scope);
    return this.importSource(scope, key, receipt.source, true);
  }
  private async importSource(
    scope: CreatorScope,
    key: string,
    raw: unknown,
    authorizedConnector: boolean,
  ) {
    const input = SourceCreate.parse(raw);
    if (
      (!authorizedConnector && input.origin === "youtube_caption") ||
      input.origin === "platform_export"
    )
      throw new DomainError(
        "connector_required",
        "Use an authorized connector; a URL alone is not permission to import.",
        403,
      );
    if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now())
      throw new DomainError("source_expired", "Choose a future expiry.", 400);
    const chunks = chunkText(input.text);
    return this.repository.command(
      scope,
      key,
      { operation: "source.create", input },
      async (client, workspace) => {
        const hash = contentHash({ text: input.text });
        const existing = await client.query<{ id: string; audience: unknown }>(
          "SELECT id,audience FROM creator.ai_source WHERE creator_id=$1 AND content_hash=$2",
          [scope.creatorId, hash],
        );
        if (existing.rows[0]) {
          if (
            contentHash(existing.rows[0].audience) !==
            contentHash(input.audience)
          )
            throw new DomainError(
              "duplicate_scope_conflict",
              "This text already exists with another audience. Revise its scope explicitly.",
              409,
            );
          return { id: existing.rows[0].id, duplicate: true };
        }
        const count = await client.query<{ count: string }>(
          "SELECT count(*) FROM creator.ai_source WHERE creator_id=$1",
          [scope.creatorId],
        );
        invariant(
          Number(count.rows[0]?.count) < 200,
          "source_capacity",
          "Export or remove older sources before adding more.",
        );
        const id = randomUUID();
        await client.query(
          "INSERT INTO creator.ai_source(id,creator_id,title,origin,origin_reference,audience,rights_evidence,expires_at,state,content_hash,text_content,progress) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'candidate',$9,$10,20)",
          [
            id,
            scope.creatorId,
            input.title,
            input.origin,
            input.originReference ?? null,
            input.audience,
            input.rightsEvidence,
            input.expiresAt,
            hash,
            input.text,
          ],
        );
        for (const chunk of chunks)
          await client.query(
            "INSERT INTO creator.ai_chunk(id,creator_id,source_id,source_revision,ordinal,passage,start_offset,end_offset) VALUES($1,$2,$3,1,$4,$5,$6,$7)",
            [
              chunk.id,
              scope.creatorId,
              id,
              chunk.ordinal,
              chunk.text,
              chunk.start,
              chunk.end,
            ],
          );
        await bump(client, scope.creatorId);
        await event(
          client,
          scope.creatorId,
          "source.candidate",
          workspace.revision + 1,
          { sourceId: id, sourceRevision: 1 },
        );
        return { id, duplicate: false };
      },
    );
  }
  /** Trusted connector worker only; no client-submitted disconnect notice can call this boundary. */
  async disconnect(
    scope: CreatorScope,
    key: string,
    origin: "youtube_caption" | "platform_export",
    verifiedRevocationReference: string,
  ) {
    invariant(
      verifiedRevocationReference,
      "connector_notice_required",
      "Verified connector revocation is required.",
    );
    const receipt = await this.repository.command(
      scope,
      key,
      { operation: "connector.revoke", origin, verifiedRevocationReference },
      async (client, workspace) => {
        const rows = await client.query<{ id: string }>(
          "UPDATE creator.ai_source SET state='revoked',revision=revision+1,index_state='pending',progress=0,error=NULL WHERE creator_id=$1 AND origin=$2 AND state<>'revoked' RETURNING id",
          [scope.creatorId, origin],
        );
        const ids = rows.rows.map((row) => row.id);
        await client.query(
          "UPDATE creator.ai_ingestion SET state='cancelled',lease_until=NULL WHERE creator_id=$1 AND source_id=ANY($2::uuid[]) AND state IN ('queued','running')",
          [scope.creatorId, ids],
        );
        await client.query(
          "DELETE FROM creator.ai_chunk WHERE creator_id=$1 AND source_id=ANY($2::uuid[])",
          [scope.creatorId, ids],
        );
        if (ids.length) {
          await client.query(
            "UPDATE creator.ai_workspace SET paused=true WHERE creator_id=$1",
            [scope.creatorId],
          );
          await client.query(
            "UPDATE creator.ai_version SET state='paused' WHERE creator_id=$1 AND state='live'",
            [scope.creatorId],
          );
          await bump(client, scope.creatorId);
          await event(
            client,
            scope.creatorId,
            "connector.revoked",
            workspace.revision + 1,
            {
              origin,
              sourceIds: ids,
              noticeReference: verifiedRevocationReference,
            },
          );
        }
        return { revoked: ids.length };
      },
    );
    this.invalidate?.(scope.creatorId);
    return receipt;
  }
  async act(scope: CreatorScope, sourceId: string, key: string, raw: unknown) {
    z.uuid().parse(sourceId);
    const input = SourceAction.parse(raw);
    const receipt = await this.repository.command(
      scope,
      key,
      { operation: "source.action", sourceId, input },
      async (client, workspace) => {
        const result = await client.query<{
          revision: number;
          state: string;
          index_state: string;
          expires_at: Date | null;
          reviewed_at: Date | null;
        }>(
          "SELECT * FROM creator.ai_source WHERE id=$1 AND creator_id=$2 FOR UPDATE",
          [sourceId, scope.creatorId],
        );
        const source = result.rows[0];
        invariant(source, "source_unavailable", "This source is unavailable.");
        if (source.revision !== input.expectedRevision)
          throw new DomainError(
            "source_changed",
            "This source changed. Review its current revision.",
            409,
          );
        const allowedStates: Record<typeof input.action, readonly string[]> = {
          approve: ["candidate"],
          retry: ["failed"],
          restore: ["revoked"],
          cancel: ["processing"],
          revoke: ["candidate", "processing", "failed", "approved"],
        };
        invariant(
          allowedStates[input.action].includes(source.state),
          "source_state_changed",
          "This action no longer applies. Refresh the source state.",
        );
        if (input.action === "revoke" || input.action === "cancel") {
          await client.query(
            "UPDATE creator.ai_source SET state='revoked',revision=revision+1,error=NULL WHERE id=$1 AND creator_id=$2",
            [sourceId, scope.creatorId],
          );
          await client.query(
            "UPDATE creator.ai_ingestion SET state='cancelled',lease_until=NULL WHERE source_id=$1 AND creator_id=$2 AND state IN ('queued','running')",
            [sourceId, scope.creatorId],
          );
          await client.query(
            "DELETE FROM creator.ai_chunk WHERE source_id=$1 AND creator_id=$2",
            [sourceId, scope.creatorId],
          );
          await client.query(
            "UPDATE creator.ai_source SET index_state='pending',progress=0 WHERE id=$1 AND creator_id=$2",
            [sourceId, scope.creatorId],
          );
          await client.query(
            "UPDATE creator.ai_workspace SET paused=true WHERE creator_id=$1 AND live_version_id IS NOT NULL",
            [scope.creatorId],
          );
          await client.query(
            "UPDATE creator.ai_version SET state='paused' WHERE creator_id=$1 AND state='live'",
            [scope.creatorId],
          );
        } else {
          invariant(
            !source.expires_at || source.expires_at.getTime() > Date.now(),
            "source_expired",
            "An expired source must be revised before approval.",
          );
          if (input.action === "approve" || input.action === "restore")
            invariant(
              input.rightsConfirmed,
              "rights_confirmation_required",
              "Confirm rights and this exact source before approval.",
            );
          if (input.action === "retry")
            invariant(
              source.reviewed_at,
              "review_required",
              "Review this source before retrying ingestion.",
            );
          await client.query(
            "UPDATE creator.ai_source SET state='processing',index_state='pending',progress=20,error=NULL,reviewed_at=now() WHERE id=$1 AND creator_id=$2",
            [sourceId, scope.creatorId],
          );
          await client.query(
            "INSERT INTO creator.ai_ingestion(creator_id,source_id,source_revision,state) VALUES($1,$2,$3,'queued') ON CONFLICT (source_id,source_revision) WHERE state IN ('queued','running') DO NOTHING",
            [scope.creatorId, sourceId, source.revision],
          );
        }
        await bump(client, scope.creatorId);
        await event(
          client,
          scope.creatorId,
          input.action === "revoke" || input.action === "cancel"
            ? "source.revoked"
            : "source.reviewed",
          workspace.revision + 1,
          { sourceId, action: input.action },
        );
        return { id: sourceId, action: input.action };
      },
    );
    if (input.action === "revoke" || input.action === "cancel")
      this.invalidate?.(scope.creatorId);
    return receipt;
  }
  async review(scope: CreatorScope, sourceId: string) {
    z.uuid().parse(sourceId);
    return this.repository.transaction(scope, async (client) => {
      const result = await client.query(
        'SELECT id,title,revision,text_content AS text,audience,rights_evidence AS "rightsEvidence",state FROM creator.ai_source WHERE id=$1 AND creator_id=$2',
        [sourceId, scope.creatorId],
      );
      invariant(
        result.rows[0],
        "source_unavailable",
        "This source is unavailable.",
      );
      return result.rows[0] as {
        id: string;
        title: string;
        revision: number;
        text: string;
        audience: unknown;
        rightsEvidence: string;
        state: string;
      };
    });
  }
  async revise(
    scope: CreatorScope,
    sourceId: string,
    key: string,
    raw: unknown,
  ) {
    const schema = SourceCreate.extend({
      expectedRevision: z.number().int().nonnegative(),
    });
    const input = schema.parse(raw);
    chunkText(input.text);
    if (input.expiresAt && Date.parse(input.expiresAt) <= Date.now())
      throw new DomainError("source_expired", "Choose a future expiry.", 400);
    if (!["manual_text", "manual_upload", "interview"].includes(input.origin))
      throw new DomainError(
        "connector_required",
        "Use the connector to revise imported material.",
      );
    const receipt = await this.repository.command(
      scope,
      key,
      { operation: "source.revise", sourceId, input },
      async (client, workspace) => {
        const row = await client.query(
          "SELECT revision FROM creator.ai_source WHERE id=$1 AND creator_id=$2 FOR UPDATE",
          [sourceId, scope.creatorId],
        );
        if (row.rows[0]?.revision !== input.expectedRevision)
          throw new DomainError(
            "source_changed",
            "This source changed. Review it again.",
            409,
          );
        await client.query(
          "UPDATE creator.ai_ingestion SET state='cancelled',lease_until=NULL WHERE source_id=$1 AND creator_id=$2 AND state IN ('queued','running')",
          [sourceId, scope.creatorId],
        );
        await client.query(
          "DELETE FROM creator.ai_chunk WHERE source_id=$1 AND creator_id=$2",
          [sourceId, scope.creatorId],
        );
        await client.query(
          "UPDATE creator.ai_source SET title=$3,text_content=$4,content_hash=$5,audience=$6,rights_evidence=$7,expires_at=$8,revision=revision+1,state='candidate',reviewed_at=NULL,index_state='pending',progress=20,error=NULL WHERE id=$1 AND creator_id=$2",
          [
            sourceId,
            scope.creatorId,
            input.title,
            input.text,
            contentHash({ text: input.text }),
            input.audience,
            input.rightsEvidence,
            input.expiresAt,
          ],
        );
        await client.query(
          "UPDATE creator.ai_workspace SET paused=true WHERE creator_id=$1 AND live_version_id IS NOT NULL",
          [scope.creatorId],
        );
        await client.query(
          "UPDATE creator.ai_version SET state='paused' WHERE creator_id=$1 AND state='live'",
          [scope.creatorId],
        );
        await bump(client, scope.creatorId);
        await event(
          client,
          scope.creatorId,
          "source.revised",
          workspace.revision + 1,
          { sourceId },
        );
        return { id: sourceId };
      },
    );
    this.invalidate?.(scope.creatorId);
    return receipt;
  }
}
export async function queueSource(
  client: PoolClient,
  creatorId: string,
  sourceId: string,
  revision: number,
) {
  await client.query(
    "INSERT INTO creator.ai_ingestion(creator_id,source_id,source_revision,state) VALUES($1,$2,$3,'queued') ON CONFLICT (source_id,source_revision) WHERE state IN ('queued','running') DO NOTHING",
    [creatorId, sourceId, revision],
  );
}
