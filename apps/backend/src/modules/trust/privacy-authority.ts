import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { DomainError, invariant } from "../../core/errors.js";
import { requestAuthority } from "../identity/request-authority.js";
import { PrivacyDomains, type PrivacyHook } from "./contracts.js";
import { assertPrivacyTaskCatalog } from "./privacy-catalog.js";

export type PrivacyTaskInput = Parameters<PrivacyHook["run"]>[0];
/** Current restoration and genuine lease on the same held lifecycle client.
 * This port never creates request authority or substitutes a pool observation. */
export async function restoredPrivacyTaskAuthorityInTransaction(
  client: PoolClient,
  input: PrivacyTaskInput,
  assertRestoredInTransaction?: (client: PoolClient) => Promise<void>,
): Promise<readonly string[]> {
  if (!assertRestoredInTransaction || !input.signal)
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "Current held lifecycle and restoration authority is required.",
      503,
    );
  input.signal.throwIfAborted();
  await assertRestoredInTransaction(client);
  const owned = await privacyTaskAuthorityInTransaction(client, input);
  await assertRestoredInTransaction(client);
  input.signal.throwIfAborted();
  return owned;
}

/** Same held-client lifecycle capability. The exact real task and its signal
 * come from the coordinator claim, never an interactive request or UUID alone.
 * 0087 locks current job/task metadata before domain locks and checks its actual
 * wall-clock lease at the separate COMMIT, erasing all transient scope metadata.
 */
export async function privacyTaskAuthorityInTransaction(
  client: PoolClient,
  input: PrivacyTaskInput,
): Promise<readonly string[]> {
  if (!input.signal || requestAuthority.getStore())
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "The actual cancellable lifecycle task is required.",
      503,
    );
  input.signal.throwIfAborted();
  const parsed = z
    .strictObject({
      jobId: z.uuid(),
      accountId: z.uuid(),
      kind: z.enum(["export", "delete"]),
      scope: z.enum(["account", "creator", "thread"]),
      creatorId: z.uuid().nullable(),
      threadId: z.uuid().nullable(),
      leaseToken: z.uuid(),
      idempotencyKey: z.string(),
    })
    .safeParse({
      jobId: input.jobId,
      accountId: input.accountId,
      kind: input.kind,
      scope: input.scope,
      creatorId: input.creatorId,
      threadId: input.threadId,
      leaseToken: input.leaseToken,
      idempotencyKey: input.idempotencyKey,
    });
  if (!parsed.success)
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "The exact leased data request is required.",
      503,
    );
  const domain = PrivacyDomains.find(
    (value) => input.idempotencyKey === `${input.jobId}:${value}`,
  );
  if (!domain)
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "The exact leased data domain is required.",
      503,
    );
  await client.query("SAVEPOINT w8_privacy_task_fence");
  try {
    await assertPrivacyTaskCatalog(client);
    const row = (
      await client.query<{ owned: string[] }>(
        "SELECT creator_trust.fence_privacy_task($1,$2,$3,$4,$5,$6,$7,$8) AS owned",
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
    input.signal.throwIfAborted();
    if (!row)
      throw new DomainError(
        "privacy_commit_fence_unavailable",
        "The current lifecycle task is unavailable.",
        503,
      );
    return z.array(z.uuid()).max(100).parse(row.owned);
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT w8_privacy_task_fence");
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["42883", "42501", "55P03", "40001"].includes(String(error.code))
    )
      throw new DomainError(
        "privacy_commit_fence_unavailable",
        "Current lifecycle authority is unavailable. Try again.",
        503,
      );
    throw error;
  } finally {
    await client.query("RELEASE SAVEPOINT w8_privacy_task_fence");
  }
}

/** Worker-only negative/ownership metadata. A client UUID never grants a lifecycle scope. */
export function privacyTaskAuthority(pool: Pool) {
  return async (input: PrivacyTaskInput) => {
    if (!input.signal || requestAuthority.getStore())
      throw new DomainError(
        "privacy_authority_unavailable",
        "The actual cancellable lifecycle task is required.",
        503,
      );
    input.signal.throwIfAborted();
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
    input.signal.throwIfAborted();
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
