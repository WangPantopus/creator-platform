import type { Pool } from "pg";
import { z } from "zod";

/** Trusted owner-hook adapter. Match both identifiers; absence never proves zero ownership. */
export function privacyOwnershipScope(workerPool: Pool) {
  return async (input: {
    jobId: string;
    accountId: string;
  }): Promise<readonly string[] | null> => {
    const jobId = z.uuid().parse(input.jobId);
    const accountId = z.uuid().parse(input.accountId);
    const result = await workerPool.query<{
      owned_creator_ids: string[] | null;
    }>(
      "SELECT owned_creator_ids FROM creator_trust.privacy_job WHERE id=$1 AND account_id=$2 AND scope='account' AND ownership_ref IS NOT NULL",
      [jobId, accountId],
    );
    const ids = result.rows[0]?.owned_creator_ids;
    return ids ? z.array(z.uuid()).max(100).parse(ids) : null;
  };
}
