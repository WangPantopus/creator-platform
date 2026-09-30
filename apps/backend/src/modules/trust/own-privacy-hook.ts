import type { Pool } from "pg";
import type { PrivacyHook } from "./contracts.js";

export function trustPrivacyHook(pool: Pool): PrivacyHook {
  return {
    domain: "trust",
    async run(input) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const matches = `reporter_account_id=$1 AND ($2::uuid IS NULL OR creator_id=$2) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM creator_trust.case_evidence e WHERE e.case_id=creator_trust.safety_case.id AND e.snapshot->>'thread_id'=$3::text))`;
        const parameters = [input.accountId, input.creatorId, input.threadId];
        const cases = (
          await client.query(
            `SELECT id,number,kind,state,reason,resolution_reason,created_at FROM creator_trust.safety_case WHERE ${matches} ORDER BY created_at,id LIMIT 2000`,
            parameters,
          )
        ).rows;
        const ids = cases.map((c) => c.id as string);
        const retainedExpiry = (
          await client.query<{ until: Date | null }>(
            "SELECT max(expires_at) AS until FROM creator_trust.case_evidence WHERE case_id=ANY($1::uuid[]) AND case_id IN(SELECT id FROM creator_trust.safety_case WHERE kind='dispute')",
            [ids],
          )
        ).rows[0]?.until;
        const notices = (
          await client.query(
            "SELECT type,reason,case_id,created_at FROM creator_trust.notice WHERE recipient_account_id=$1 AND case_id=ANY($2::uuid[]) ORDER BY created_at,id LIMIT 2000",
            [input.accountId, ids],
          )
        ).rows;
        const feedback =
          input.scope === "account"
            ? (
                await client.query(
                  "SELECT useful,authorship_clear,cohort,comment,created_at FROM creator_trust.feedback WHERE account_id=$1 ORDER BY created_at,id LIMIT 2000",
                  [input.accountId],
                )
              ).rows
            : [];
        if (
          cases.length === 2000 ||
          notices.length === 2000 ||
          feedback.length === 2000
        )
          throw new Error("bounded_subjob_required");
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
          await client.query(
            "UPDATE creator_trust.case_event SET reason=NULL WHERE case_id=ANY($1::uuid[]) AND case_id NOT IN(SELECT id FROM creator_trust.safety_case WHERE kind='dispute')",
            [ids],
          );
          await client.query(
            "UPDATE creator_trust.notice SET reason='Removed following a data deletion request.' WHERE recipient_account_id=$1 AND case_id=ANY($2::uuid[])",
            [input.accountId, ids],
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
        await client.query("COMMIT");
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
          ...(input.kind === "export"
            ? { data: { cases, notices, feedback } }
            : {}),
          retained: input.kind === "delete" ? retained : [],
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
