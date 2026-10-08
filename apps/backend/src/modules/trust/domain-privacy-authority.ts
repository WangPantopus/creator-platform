import type { PoolClient } from "pg";
import { z } from "zod";
import { DomainError } from "../../core/errors.js";
import { querySettlementUncertain } from "../../core/query-settlement.js";
import { requestAuthority } from "../identity/request-authority.js";
import type { PrivacyHook } from "./contracts.js";
import { assertDomainPrivacyTaskCatalog } from "./domain-privacy-catalog.js";

export type PrivacyTaskInput = Parameters<PrivacyHook["run"]>[0];
/** Same held-client lifecycle capability. The exact real task and its signal
 * come from the coordinator claim, never an interactive request or UUID alone.
 * 0103 locks current job/task metadata before domain locks and checks its actual
 * wall-clock lease at the separate COMMIT, erasing all transient scope metadata.
 */
export async function domainPrivacyTaskAuthorityInTransaction(
  client: PoolClient,
  input: PrivacyTaskInput,
  domain: "trust" | "growth",
  assertRestoredInTransaction: (client: PoolClient) => Promise<void>,
): Promise<readonly string[]> {
  if (
    !input.signal ||
    requestAuthority.getStore() ||
    typeof assertRestoredInTransaction !== "function"
  )
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
  if (input.idempotencyKey !== `${input.jobId}:${domain}`)
    throw new DomainError(
      "privacy_commit_fence_unavailable",
      "The exact leased data domain is required.",
      503,
    );
  await client.query("SAVEPOINT w8_domain_privacy_task_fence");
  let owned: readonly string[];
  try {
    await assertDomainPrivacyTaskCatalog(client, domain);
    await assertRestoredInTransaction(client);
    const row = (
      await client.query<{ owned: string[] }>(
        "SELECT creator_trust.fence_domain_privacy_task($1,$2,$3,$4,$5,$6,$7,$8) AS owned",
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
    await assertRestoredInTransaction(client);
    input.signal.throwIfAborted();
    owned = z.array(z.uuid()).max(100).parse(row.owned);
  } catch (error) {
    // The original owner settles the actual task or uncertain source. Nested
    // cleanup cannot send SQL after cancellation or an unknown response.
    if (input.signal.aborted || querySettlementUncertain(error)) throw error;
    try {
      await client.query("ROLLBACK TO SAVEPOINT w8_domain_privacy_task_fence");
      await client.query("RELEASE SAVEPOINT w8_domain_privacy_task_fence");
    } catch (cause) {
      throw new AggregateError(
        [error, cause],
        "Original domain task fence and savepoint restoration failures.",
      );
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      ["42883", "42501", "55P03", "40001"].includes(String(error.code))
    ) {
      const failure = new DomainError(
        "privacy_commit_fence_unavailable",
        "Current lifecycle authority is unavailable. Try again.",
        503,
      );
      Object.defineProperty(failure, "cause", {
        value: error,
        configurable: true,
      });
      throw failure;
    }
    throw error;
  }
  await client.query("RELEASE SAVEPOINT w8_domain_privacy_task_fence");
  return owned;
}
