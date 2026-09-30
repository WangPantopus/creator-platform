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
  /** Revalidation uses W8's durable pre-deletion ownership, including on replay.
   * This operation never creates a workspace or depends on cascaded command rows. */
  async purge(
    scope: CreatorScope,
    jobId: string,
    assertAuthorized: () => Promise<void>,
  ) {
    invariant(
      !scope.development && jobId.length >= 8,
      "privacy_authority_required",
      "A verified deletion job is required.",
    );
    await assertAuthorized();
    this.runtime?.interruptCreator(scope.creatorId);
    const client = await this.repository.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.account_id',$2,true)",
        [scope.creatorId, scope.accountId],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`agent.purge:${scope.creatorId}`],
      );
      await assertAuthorized();
      const tombstone = await client.query(
        "SELECT 1 FROM creator.ai_tombstone WHERE creator_id=$1",
        [scope.creatorId],
      );
      const receipt = {
        domain: "agent",
        jobId,
        purged: true,
        remainingMedia: "not_owned_by_agent",
      };
      if (!tombstone.rowCount) {
        const owner = await client.query<{ account_id: string }>(
          "SELECT account_id FROM creator.creator_profile WHERE id=$1",
          [scope.creatorId],
        );
        invariant(
          !owner.rows[0] || owner.rows[0].account_id === scope.accountId,
          "privacy_owner_changed",
          "This deletion job cannot purge a different creator owner.",
        );
        if (owner.rows[0])
          await client.query(
            "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 FOR UPDATE",
            [scope.creatorId, scope.accountId],
          );
        await client.query(
          "SELECT creator_id FROM creator.ai_workspace WHERE creator_id=$1 FOR UPDATE",
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
          "ai_command",
          "ai_event",
        ])
          await client.query(
            `DELETE FROM creator.${table} WHERE creator_id=$1`,
            [scope.creatorId],
          );
        await client.query(
          "DELETE FROM creator.ai_workspace WHERE creator_id=$1",
          [scope.creatorId],
        );
        // A committed tombstone proves the entire deletion above committed atomically.
        await client.query(
          "INSERT INTO creator.ai_tombstone(creator_id) VALUES($1)",
          [scope.creatorId],
        );
      }
      await client.query("COMMIT");
      return receipt;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
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
