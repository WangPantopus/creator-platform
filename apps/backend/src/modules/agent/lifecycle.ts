import type { AgentRepository, CreatorScope } from "./repository.js";
import { bump, event, licenseRow } from "./repository.js";
import type { LiveAgentRuntime } from "./runtime.js";
import { invariant } from "../../core/errors.js";
import { generationJournalInstalled } from "./generation-journal.js";
import type { PoolClient } from "pg";
import type { PreparedUsageRetention } from "./usage-retention.js";

/** Only the trusted W8 adapter calls this with a verified notice; not an unprotected HTTP route. */
export class AgentLifecycle {
  constructor(
    private readonly repository: AgentRepository,
    private readonly runtime: LiveAgentRuntime | null,
    private readonly usageRetention?: PreparedUsageRetention,
  ) {}
  async assertAccountingClient(client: PoolClient) {
    const installed = await generationJournalInstalled(client);
    if (installed) {
      const journal = this.repository.usageJournal;
      const retention = this.usageRetention;
      invariant(
        journal && retention,
        "thread_accounting_privacy_unconfigured",
        "Prepared journal and registered accounting expiry custody are required.",
      );
      retention.assertJournal(journal);
      await journal.assertClient(client);
      await retention.assertClient(client);
    }
    return installed;
  }
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
    accountingBoundary?: (client: PoolClient) => Promise<{ reference: string }>,
  ) {
    invariant(
      !scope.development && jobId.length >= 8,
      "privacy_authority_required",
      "A verified deletion job is required.",
    );
    await assertAuthorized();
    await this.repository.assertRuntimeRole();
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
      const lineage = await this.assertAccountingClient(client);
      let boundaryReference: string | undefined;
      if (lineage) {
        invariant(
          accountingBoundary,
          "thread_accounting_privacy_unconfigured",
          "The completed conversation disposition and accounting receipt are required before creator erasure.",
        );
        boundaryReference = (await accountingBoundary(client)).reference;
        invariant(
          boundaryReference,
          "accounting_boundary_incomplete",
          "A durable accounting boundary reference is required.",
        );
      }
      const assertDetached = async () => {
        if (!lineage) return;
        for (const table of [
          "ai_generation_receipt",
          "ai_generation_attempt",
          "ai_generation_admission",
        ])
          invariant(
            !(
              await client.query(
                `SELECT 1 FROM creator.${table} WHERE creator_id=$1 LIMIT 1`,
                [scope.creatorId],
              )
            ).rowCount,
            "accounting_cleanup_pending",
            "Complete every conversation accounting family before creator erasure.",
          );
        invariant(
          !(
            await client.query(
              "SELECT 1 FROM creator.ai_usage WHERE creator_id=$1 AND (thread_id IS NOT NULL OR fan_id IS NOT NULL OR generation_id IS NOT NULL OR attempt_id IS NOT NULL OR call_ordinal IS NOT NULL OR (cost_micros IS NULL AND accounting_retained_until IS NULL)) LIMIT 1",
              [scope.creatorId],
            )
          ).rowCount &&
            !(
              await client.query(
                "SELECT 1 FROM creator.ai_event WHERE creator_id=$1 AND type='ai.generation_receipt' AND (payload ? 'threadId' OR payload ? 'fanId') LIMIT 1",
                [scope.creatorId],
              )
            ).rowCount,
          "accounting_cleanup_pending",
          "Linked or unresolved unplanned accounting requires actual disposition before creator erasure.",
        );
      };
      const tombstone = await client.query(
        "SELECT 1 FROM creator.ai_tombstone WHERE creator_id=$1",
        [scope.creatorId],
      );
      const receipt = {
        domain: "agent",
        jobId,
        purged: true,
        remainingMedia: "not_owned_by_agent",
        ...(boundaryReference
          ? { accountingBoundaryReference: boundaryReference }
          : {}),
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
        // A receipt alone cannot erase a missed family or open attempt.
        await assertDetached();
        // Remove unretained usage before its referenced creator cost holds.
        await client.query(
          lineage
            ? "DELETE FROM creator.ai_usage WHERE creator_id=$1 AND accounting_retained_until IS NULL"
            : "DELETE FROM creator.ai_usage WHERE creator_id=$1",
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
      // A replay must not acknowledge a resurrected family either.
      await assertDetached();
      const retainedAccounting = lineage
        ? (
            await client.query<{
              policy_version: string;
              reason: string;
              unknown: boolean;
              until: Date;
              records: string;
            }>(
              "SELECT accounting_retention_version AS policy_version,accounting_retention_reason AS reason,cost_micros IS NULL AS unknown,max(accounting_retained_until) AS until,count(*)::text AS records FROM creator.ai_usage WHERE creator_id=$1 AND accounting_retained_until IS NOT NULL GROUP BY accounting_retention_version,accounting_retention_reason,cost_micros IS NULL LIMIT 201",
              [scope.creatorId],
            )
          ).rows
        : [];
      invariant(
        retainedAccounting.length <= 200,
        "bounded_subjob_required",
        "Complete bounded retained-accounting receipts before acknowledging creator erasure.",
      );
      if (lineage) {
        const currentBoundary = await accountingBoundary!(client);
        invariant(
          currentBoundary.reference === boundaryReference,
          "accounting_boundary_changed",
          "The accounting disposition changed before erasure completed.",
        );
      }
      await assertAuthorized();
      await client.query("COMMIT");
      return {
        ...receipt,
        retainedAccounting: retainedAccounting.map((row) => ({
          policyVersion: row.policy_version,
          records: row.records,
          unknown: row.unknown,
          until: row.unknown ? null : row.until.toISOString(),
          reason: row.reason,
        })),
        retained: retainedAccounting.map((row) => ({
          category: row.unknown
            ? "unresolved_agent_cost"
            : "unlinked_agent_accounting",
          until: row.unknown ? null : row.until.toISOString(),
          reason: row.unknown
            ? `${row.reason} Unresolved provider cost requires actual reconciliation; expiry cannot clear this marker.`
            : row.reason,
        })),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  /** A consumer selects its event type before the bound, preserving other events. */
  async pendingEvents(scope: CreatorScope, limit = 100, eventType?: string) {
    return this.repository.transaction(
      scope,
      async (client) => {
        const rows = await client.query(
          "SELECT id,creator_id,type,revision,payload,created_at FROM creator.ai_event WHERE creator_id=$1 AND published_at IS NULL AND ($3::text IS NULL OR type=$3) ORDER BY created_at,id LIMIT $2",
          [
            scope.creatorId,
            Math.min(100, Math.max(1, limit)),
            eventType ?? null,
          ],
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
