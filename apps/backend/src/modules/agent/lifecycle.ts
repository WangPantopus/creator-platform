import type { AgentRepository, CreatorScope } from "./repository.js";
import { bump, event, licenseRow } from "./repository.js";
import type { LiveAgentRuntime } from "./runtime.js";
import { invariant } from "../../core/errors.js";

/** Only the trusted W8 adapter calls this with a verified notice; not an unprotected HTTP route. */
export class AgentLifecycle {
  constructor(
    private readonly repository: AgentRepository,
    private readonly runtime: LiveAgentRuntime | null,
  ) {}
  async pauseNotice(
    scope: CreatorScope,
    input: {
      jobId: string;
      reason: "license_revoked" | "death" | "incapacity" | "suspension";
      verifiedNoticeReference: string;
    },
  ) {
    invariant(
      input.verifiedNoticeReference && input.jobId,
      "verified_notice_required",
      "A verified notice reference is required.",
    );
    const started = performance.now();
    this.runtime?.interruptCreator(scope.creatorId);
    const receipt = await this.repository.command(
      scope,
      input.jobId,
      { operation: "lifecycle.pause", input },
      async (client, workspace) => {
        await client.query(
          "UPDATE creator.ai_workspace SET paused=true WHERE creator_id=$1",
          [scope.creatorId],
        );
        await client.query(
          "UPDATE creator.ai_version SET state='paused' WHERE creator_id=$1 AND state='live'",
          [scope.creatorId],
        );
        const license = await licenseRow(client, scope.creatorId);
        if (license)
          await client.query(
            "UPDATE creator.ai_license SET document=$2,updated_at=now() WHERE creator_id=$1",
            [
              scope.creatorId,
              {
                ...license,
                state:
                  input.reason === "license_revoked" ? "revoked" : "suspended",
              },
            ],
          );
        await bump(client, scope.creatorId);
        await event(
          client,
          scope.creatorId,
          "license.paused",
          workspace.revision + 1,
          {
            jobId: input.jobId,
            reason: input.reason,
            noticeReference: input.verifiedNoticeReference,
          },
        );
        await event(
          client,
          scope.creatorId,
          "commitments.refund_requested",
          workspace.revision + 1,
          { jobId: input.jobId, reason: input.reason },
        );
        return {
          domain: "agent",
          jobId: input.jobId,
          generationDenied: true,
          refundState: "awaiting_commerce",
        };
      },
    );
    return {
      ...receipt,
      acknowledgedAt: new Date().toISOString(),
      durationMs: Math.round(performance.now() - started),
    };
  }
  async purge(scope: CreatorScope, jobId: string) {
    this.runtime?.interruptCreator(scope.creatorId);
    return this.repository.command(
      scope,
      jobId,
      { operation: "lifecycle.purge", jobId },
      async (client, workspace) => {
        await client.query(
          "INSERT INTO creator.ai_tombstone(creator_id) VALUES($1) ON CONFLICT DO NOTHING",
          [scope.creatorId],
        );
        await client.query(
          "UPDATE creator.ai_workspace SET paused=true,live_version_id=NULL WHERE creator_id=$1",
          [scope.creatorId],
        );
        for (const table of [
          "ai_shadow_evaluation",
          "ai_shadow_sample",
          "ai_style_embedding",
          "ai_cost_hold",
          "ai_version",
          "ai_evaluation",
          "ai_chunk",
          "ai_ingestion",
          "ai_source",
          "ai_license",
          "ai_sponsor",
          "ai_regression",
          "ai_usage",
        ])
          await client.query(
            `DELETE FROM creator.${table} WHERE creator_id=$1`,
            [scope.creatorId],
          );
        await client.query(
          "UPDATE creator.ai_workspace SET deleted_at=now(),configuration='{}',interview='{}',current_status=NULL WHERE creator_id=$1",
          [scope.creatorId],
        );
        await event(client, scope.creatorId, "ai.purged", workspace.revision, {
          jobId,
        });
        return {
          domain: "agent",
          jobId,
          purged: true,
          remainingMedia: "not_owned_by_agent",
        };
      },
    );
  }
  async pendingEvents(scope: CreatorScope, limit = 100) {
    return this.repository.transaction(
      scope,
      async (client) => {
        const rows = await client.query(
          "SELECT id,creator_id,type,revision,payload,created_at FROM creator.ai_event WHERE creator_id=$1 AND published_at IS NULL ORDER BY created_at,id LIMIT $2",
          [scope.creatorId, Math.min(100, Math.max(1, limit))],
        );
        return rows.rows;
      },
      true,
    );
  }
  async acknowledgeEvent(scope: CreatorScope, id: string) {
    return this.repository.transaction(
      scope,
      async (client) => {
        await client.query(
          "UPDATE creator.ai_event SET published_at=now() WHERE id=$1 AND creator_id=$2 AND published_at IS NULL",
          [id, scope.creatorId],
        );
      },
      true,
    );
  }
}
