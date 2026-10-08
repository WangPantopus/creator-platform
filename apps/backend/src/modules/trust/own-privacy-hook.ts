import type { Pool, PoolClient } from "pg";
import { ContentHeldClient } from "../content/held-client-cleanup.js";
import type { PrivacyHook } from "./contracts.js";
import { domainPrivacyTaskAuthorityInTransaction } from "./domain-privacy-authority.js";
import { DomainError } from "../../core/errors.js";

export function trustPrivacyHook(
  pool: Pool,
  assertRestoredInTransaction?: (client: PoolClient) => Promise<void>,
): PrivacyHook {
  return {
    domain: "trust",
    async run(input) {
      if (!assertRestoredInTransaction || !input.signal)
        throw new DomainError(
          "privacy_commit_fence_unavailable",
          "The current held lifecycle and restoration authority is required.",
          503,
        );
      input.signal.throwIfAborted();
      const client = await pool.connect();
      // Settlement only; original W8 task, ownership and restoration checks
      // below remain the sole authority. Keep the source held until rollback
      // or physical close settles, including cancellation during a query.
      const held = new ContentHeldClient(client, input.signal, pool);
      let failure: unknown;
      try {
        input.signal.throwIfAborted();
        await held.begin();
        await domainPrivacyTaskAuthorityInTransaction(
          client,
          input,
          "trust",
          assertRestoredInTransaction,
        );
        const matches = `reporter_account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM creator_trust.case_evidence e WHERE e.case_id=creator_trust.safety_case.id AND e.snapshot->>'thread_id'=$3::text))`;
        const parameters = [input.accountId, input.creatorId, input.threadId];
        const cases = (
          await client.query(
            `SELECT id,number,kind,state,reason,resolution_reason,created_at FROM creator_trust.safety_case WHERE ${matches} ORDER BY created_at,id LIMIT 2001`,
            parameters,
          )
        ).rows;
        const ids = cases.map((c) => c.id as string);
        const replyReviewInstalled = (
          await client.query(
            "SELECT to_regclass('creator_trust.reply_review') AS relation",
          )
        ).rows[0]?.relation;
        const replyReviews = replyReviewInstalled
          ? (
              await client.query(
                "SELECT r.case_id,r.reply_id,r.creator_id,r.reply_version,r.text_hash,r.created_at,d.id AS decision_id,d.case_version,d.state,d.created_at AS decided_at FROM creator_trust.reply_review r LEFT JOIN creator_trust.reply_review_decision d ON d.case_id=r.case_id WHERE r.account_id=$1 AND r.case_id=ANY($2::uuid[]) ORDER BY r.created_at,r.case_id,d.case_version LIMIT 2001",
                [input.accountId, ids],
              )
            ).rows
          : [];
        // Subject accounts receive only their own case metadata and addressed
        // notices. Another fan's report reason or evidence is never exported.
        const subjectCases = (
          await client.query(
            `SELECT id,number,kind,state,creator_id,version,created_at,updated_at
             FROM creator_trust.safety_case WHERE subject_account_id=$1
             AND ($2::uuid IS NULL OR creator_id=$2)
             AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM creator_trust.case_evidence e
               WHERE e.case_id=creator_trust.safety_case.id AND e.snapshot->>'thread_id'=$3::text))
             ORDER BY created_at,id LIMIT 2001`,
            parameters,
          )
        ).rows;
        const involvedIds = [
          ...new Set([
            ...ids,
            ...subjectCases.map((item) => item.id as string),
          ]),
        ];
        const retainedExpiry = (
          await client.query<{ until: Date | null }>(
            "SELECT max(expires_at) AS until FROM creator_trust.case_evidence WHERE case_id=ANY($1::uuid[]) AND case_id IN(SELECT id FROM creator_trust.safety_case WHERE kind='dispute')",
            [ids],
          )
        ).rows[0]?.until;
        const notices = (
          await client.query(
            "SELECT type,reason,case_id,created_at FROM creator_trust.notice WHERE recipient_account_id=$1 AND ($3::boolean OR case_id=ANY($2::uuid[])) ORDER BY created_at,id LIMIT 2001",
            [input.accountId, involvedIds, input.scope === "account"],
          )
        ).rows;
        const feedback =
          input.scope === "account"
            ? (
                await client.query(
                  "SELECT useful,authorship_clear,cohort,comment,created_at FROM creator_trust.feedback WHERE account_id=$1 ORDER BY created_at,id LIMIT 2001",
                  [input.accountId],
                )
              ).rows
            : [];
        if (
          cases.length > 2000 ||
          subjectCases.length > 2000 ||
          notices.length > 2000 ||
          feedback.length > 2000 ||
          replyReviews.length > 2000
        )
          throw new Error("bounded_subjob_required");
        let exported: Record<string, unknown> | undefined;
        if (input.kind === "export") {
          const evidence = (
            await client.query(
              "SELECT case_id,category,snapshot,created_at,expires_at FROM creator_trust.case_evidence WHERE case_id=ANY($1::uuid[]) AND expires_at>now() ORDER BY created_at,id LIMIT 2001",
              [ids],
            )
          ).rows;
          const events = (
            await client.query(
              "SELECT case_id,type,reason,created_at FROM creator_trust.case_event WHERE case_id=ANY($1::uuid[]) ORDER BY created_at,id LIMIT 2001",
              [ids],
            )
          ).rows;
          const accesses = (
            await client.query(
              "SELECT case_id,action,purpose,created_at FROM creator_trust.access_audit WHERE case_id=ANY($1::uuid[]) ORDER BY created_at,id LIMIT 2001",
              [involvedIds],
            )
          ).rows;
          const blocks =
            input.scope === "thread"
              ? []
              : (
                  await client.query(
                    "SELECT creator_id,case_id,created_at,revoked_at FROM creator_trust.block WHERE account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) ORDER BY created_at,creator_id LIMIT 2001",
                    [input.accountId, input.creatorId],
                  )
                ).rows;
          const requests = (
            await client.query(
              "SELECT id,kind,scope,creator_id,thread_id,state,created_at,completed_at FROM creator_trust.privacy_job WHERE account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) AND ($3::uuid IS NULL OR thread_id=$3) ORDER BY created_at,id LIMIT 2001",
              parameters,
            )
          ).rows;
          if (
            [evidence, events, accesses, blocks, requests].some(
              (rows) => rows.length > 2000,
            )
          )
            throw new Error("bounded_subjob_required");
          exported = {
            cases,
            casesAboutYou: subjectCases,
            evidence,
            events,
            accesses,
            notices,
            feedback,
            blocks,
            requests,
            replyReviews,
          };
          if (
            Buffer.byteLength(JSON.stringify(exported)) >
            4 * 1024 * 1024 - 64 * 1024
          )
            throw new Error("bounded_subjob_required");
        }
        if (input.kind === "delete") {
          // Account-delete evidence retention awaits Q16; do not silently apply thread dispute retention account-wide.
          if (
            input.scope === "account" &&
            cases.some((c) => c.kind === "dispute")
          )
            throw new Error("account_retention_decision_required");
          await client.query(
            "UPDATE creator_trust.safety_case SET reason='Removed following a data deletion request.',resolution_reason=CASE WHEN resolution_reason IS NOT NULL THEN 'Removed following a data deletion request.' ELSE NULL END WHERE id=ANY($1::uuid[]) AND kind<>'dispute'",
            [ids],
          );
          await client.query(
            "DELETE FROM creator_trust.case_evidence WHERE case_id=ANY($1::uuid[]) AND case_id NOT IN(SELECT id FROM creator_trust.safety_case WHERE kind='dispute')",
            [ids],
          );
          if (replyReviewInstalled)
            await client.query(
              "DELETE FROM creator_trust.reply_review WHERE account_id=$1 AND case_id=ANY($2::uuid[])",
              [input.accountId, ids],
            );
          await client.query(
            "UPDATE creator_trust.case_event SET reason=NULL WHERE case_id=ANY($1::uuid[]) AND case_id NOT IN(SELECT id FROM creator_trust.safety_case WHERE kind='dispute')",
            [ids],
          );
          await client.query(
            "UPDATE creator_trust.notice SET reason='Removed following a data deletion request.' WHERE recipient_account_id=$1 AND ($3::boolean OR case_id=ANY($2::uuid[]))",
            [input.accountId, involvedIds, input.scope === "account"],
          );
          if (input.scope === "account") {
            await client.query(
              "DELETE FROM creator_trust.feedback WHERE account_id=$1",
              [input.accountId],
            );
            await client.query(
              "UPDATE creator_trust.command SET response='{}'::jsonb WHERE account_id=$1 AND operation NOT IN ('privacy')",
              [input.accountId],
            );
            await client.query(
              "UPDATE creator_trust.privacy_task t SET data=NULL FROM creator_trust.privacy_job j WHERE j.id=t.job_id AND j.account_id=$1 AND j.kind='export'",
              [input.accountId],
            );
          }
        }
        await domainPrivacyTaskAuthorityInTransaction(
          client,
          input,
          "trust",
          assertRestoredInTransaction,
        );
        input.signal.throwIfAborted();
        await held.commit();
        input.signal.throwIfAborted();
        const retained: {
          category: string;
          until: string | null;
          reason: string;
        }[] = [
          {
            category: "deletion_tombstones_and_job_receipts",
            until: null,
            reason:
              "Minimal scope identifiers and completion receipts prevent deleted data from returning after restoration; final retention review is pending.",
          },
        ];
        if (
          input.kind === "delete" &&
          input.scope !== "account" &&
          cases.some((c) => c.kind === "dispute")
        )
          retained.push({
            category: "packet_and_delivery_dispute_evidence",
            until: retainedExpiry?.toISOString() ?? null,
            reason:
              "Exact request and delivery records retain their original 12-month expiry; actual expiry is recorded per evidence row.",
          });
        return {
          receipt: {
            schemaVersion: 1,
            domain: "trust",
            jobId: input.jobId,
            processedCases: ids.length,
            completedAt: new Date().toISOString(),
          },
          ...(input.kind === "export" ? { data: exported } : {}),
          retained: input.kind === "delete" ? retained : [],
        };
      } catch (error) {
        failure = error;
        throw error;
      } finally {
        await held.settle(failure);
      }
    },
  };
}
