import type { PoolClient } from "pg";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import type { PrivacyHook } from "../trust/contracts.js";

/** Exact leased W8 lifecycle job. The older local trust contract does not yet
 * carry its lease token; callers must supply the actual newer worker input. */
export type GenerationPrivacyJob = Parameters<PrivacyHook["run"]>[0] & {
  leaseToken: string;
};
export type GenerationPrivacyFamily = {
  threadId: string;
  creatorId: string;
  fanId: string;
};
/** Structural contract of the published W8 ConversationPrivacyAuthority.
 * It must verify the actual leased task and retained ownership on this client. */
export interface GenerationPrivacyAuthority {
  assertFamily(
    client: PoolClient,
    job: GenerationPrivacyJob,
    family: GenerationPrivacyFamily,
  ): Promise<void>;
}
export type GenerationPrivacyConfiguration = {
  authority: GenerationPrivacyAuthority;
  retentionPolicyVersion: string;
  /** Actual C10 registration and reviewed policy, never a successful default. */
  assertPrivacyRegistered(): Promise<void>;
};
export interface GenerationCostPrivacyReconciliation {
  readonly retentionPolicyVersion: string;
  settleGeneration(
    client: PoolClient,
    job: GenerationPrivacyJob,
    family: GenerationPrivacyFamily,
    generation: {
      id: string;
      reservationId: string | null;
      grantId: string;
      visible: boolean;
    },
  ): Promise<void>;
  /** Reads every still-present generation after settlement and fails on any
   * missing/unknown reservation. This is financial evidence, not purge approval. */
  disposition(
    client: PoolClient,
    job: GenerationPrivacyJob,
    family: GenerationPrivacyFamily,
  ): Promise<{ financialDispositionReference: string }>;
}

export async function assertGenerationPrivacyFamily(
  client: PoolClient,
  job: GenerationPrivacyJob,
  family: GenerationPrivacyFamily,
  authority: GenerationPrivacyAuthority,
) {
  for (const id of [
    job.jobId,
    job.accountId,
    job.leaseToken,
    family.threadId,
    family.creatorId,
    family.fanId,
  ])
    z.uuid().parse(id);
  invariant(
    job.kind === "delete" &&
      job.idempotencyKey.startsWith(`${job.jobId}:`) &&
      ["account", "creator", "thread"].includes(job.scope) &&
      (job.creatorId === null || job.creatorId === family.creatorId) &&
      (job.threadId === null || job.threadId === family.threadId),
    "privacy_scope_mismatch",
    "This financial settlement requires its actual leased deletion family.",
  );
  await authority.assertFamily(client, job, family);
}
