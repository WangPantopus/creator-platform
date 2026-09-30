import type { Pool } from "pg";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import type { PrivacyHook } from "./contracts.js";

export type PrivacyTaskInput = Parameters<PrivacyHook["run"]>[0];
/** Worker-only negative/ownership metadata. A client UUID never grants a lifecycle scope. */
export function privacyTaskAuthority(pool: Pool) {
  return async (input: PrivacyTaskInput) => {
    z.uuid().parse(input.jobId);
    z.uuid().parse(input.accountId);
    z.uuid().parse(input.leaseToken);
    invariant(
      input.idempotencyKey.startsWith(input.jobId + ":"),
      "privacy_authority_invalid",
      "The exact leased data request is required.",
    );
    const domain = input.idempotencyKey.slice(input.jobId.length + 1);
    const job = (
      await pool.query<{
        owned_creator_ids: string[] | null;
        ownership_ref: string | null;
      }>(
        `SELECT j.owned_creator_ids,j.ownership_ref FROM creator_trust.privacy_job j JOIN creator_trust.privacy_task t ON t.job_id=j.id
       WHERE j.id=$1 AND j.account_id=$2 AND j.kind=$3 AND j.scope=$4
       AND j.creator_id IS NOT DISTINCT FROM $5::uuid AND j.thread_id IS NOT DISTINCT FROM $6::uuid
       AND j.verification_ref<>'' AND j.verified_at IS NOT NULL AND j.state NOT IN('complete','dead_letter')
       AND t.domain=$7 AND t.state='running' AND t.lease_token=$8 AND t.lease_until>clock_timestamp()`,
        [
          input.jobId,
          input.accountId,
          input.kind,
          input.scope,
          input.creatorId,
          input.threadId,
          domain,
          input.leaseToken,
        ],
      )
    ).rows[0];
    invariant(
      job,
      "privacy_authority_changed",
      "The verified data request is no longer leased to this worker.",
    );
    if (input.scope === "account") {
      invariant(
        job.ownership_ref && job.owned_creator_ids !== null,
        "privacy_ownership_missing",
        "The verified pre-deletion ownership snapshot is required.",
      );
      return z.array(z.uuid()).max(100).parse(job.owned_creator_ids);
    }
    return [];
  };
}
