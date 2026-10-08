import type { PoolClient } from "pg";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import {
  assertRegisteredMigration,
  registeredMigration,
} from "../../db/reviewed-migration.js";
import {
  isConfiguredBackendRuntime,
  type BackendRuntime,
} from "../../integration.js";
import { threadScopeActor, type ThreadScope } from "../access/scope.js";
import { requestAuthority } from "../identity/request-authority.js";
import { DevelopmentConversationPolicy } from "../conversation/development-policy.js";
import {
  comparisonPrivacySource,
  comparisonStorageSource,
  comparisonWriterSource,
} from "../conversation/comparison-privacy.js";
import type {
  ComparisonConsentAuthority,
  ComparisonPolicy,
} from "../conversation/comparison-consent.js";
import type { ComparisonUseAuthority } from "../conversation/comparison-samples.js";
import {
  comparisonArtifactSource,
  comparisonAttemptSource,
  comparisonArtifactPrivacySource,
} from "./comparison-artifacts.js";
import {
  ProviderPolicySchema,
  type ProviderPolicy,
} from "../../../../../packages/api/src/conversation/contracts.js";

const sources = [
  comparisonStorageSource,
  comparisonPrivacySource,
  comparisonArtifactSource,
  comparisonAttemptSource,
  comparisonArtifactPrivacySource,
  comparisonWriterSource,
] as const;
const beginsAt = "2026-10-08T00:00:00.000Z";
const endsAt = "2026-11-01T00:00:00.000Z";
export const developmentComparisonNotice = Object.freeze({
  version: "w8-development-ai-comparison-20261008-v1",
  notice:
    "In this labelled development environment, you can allow OpenAI to turn questions from the last seven days into general questions for comparing this creator’s AI versions. The creator can see those general questions and comparison replies. Automated checks screen out identifying and sensitive details; they can make mistakes. Qelvora uses this material only for these comparisons, not model training or marketing. Off-the-record questions and threads with memory exclusions are excluded. Saved questions are kept for at most 30 days after the original question, ending no later than November 1, 2026 at 00:00 UTC. You can withdraw this choice. Withdrawal removes Qelvora’s saved comparison questions and text and makes affected exports unavailable while deletion finishes. Copies already downloaded cannot be recalled. Your ordinary provider notice still applies to OpenAI’s processing. This optional choice is separate from reply feedback and ordinary AI replies.",
});

/** Explicit fictional-host policy only. This does not approve production
 * processors, train a model, infer consent or turn an old feedback choice into
 * a comparison choice. Original full storage/restore readiness remains required. */
export async function createDevelopmentComparisonAuthority(input: {
  runtime: BackendRuntime;
  policy: ProviderPolicy;
  developmentPolicy: DevelopmentConversationPolicy;
  assertPrepared: (client: PoolClient) => Promise<void>;
}): Promise<
  | Readonly<{
      consent: ComparisonConsentAuthority;
      use: ComparisonUseAuthority;
      close: () => void;
    }>
  | undefined
> {
  const { runtime, developmentPolicy } = input;
  const policy = ProviderPolicySchema.parse(input.policy);
  const policyHash = contentHash(policy);
  let closed = false;
  const configured = () =>
    !closed &&
    process.env.NODE_ENV === "development" &&
    process.env.TRUST_LOCAL_DEVELOPMENT === "true" &&
    process.env.TRUST_DEVELOPMENT_COMPARISON_POLICY === "true" &&
    runtime.identity?.sessions.mode === "development" &&
    isConfiguredBackendRuntime(runtime) &&
    runtime.database.pool === runtime.pool &&
    runtime.access.isForPool(runtime.pool) &&
    runtime.conversation.isFor(runtime.database, runtime.access) &&
    runtime.database.threadScopeInTransactionAvailable &&
    typeof runtime.assertRestoredInTransaction === "function" &&
    typeof runtime.assertScopeAllowedInTransaction === "function" &&
    developmentPolicy instanceof DevelopmentConversationPolicy &&
    developmentPolicy.isFor(runtime.pool, policy) &&
    contentHash(input.policy) === policyHash;
  if (!configured()) return undefined;
  for (const source of sources)
    if (!(await registeredMigration(source))) return undefined;
  const comparison: ComparisonPolicy = Object.freeze({
    ...developmentComparisonNotice,
    processorPolicyVersion: policy.version,
  });

  const current = async (scope: ThreadScope, client: PoolClient) => {
    invariant(
      configured(),
      "comparison_policy_unavailable",
      "The original comparison policy is unavailable.",
    );
    runtime.database.assertHeldThread(scope, client);
    const actor = threadScopeActor(scope),
      request = requestAuthority.getStore();
    invariant(
      scope.authority === "fan" &&
        scope.actorAccountId === scope.fanAccountId &&
        request?.actor === actor &&
        request.accountId === scope.actorAccountId &&
        developmentPolicy.allowsAccounts(
          scope.actorAccountId,
          scope.fanAccountId,
          scope.creatorAccountId,
        ),
      "comparison_fan_required",
      "Use the current fictional fan’s own conversation.",
    );
    await runtime.assertRestoredInTransaction!(client);
    await runtime.assertScopeAllowedInTransaction!(
      actor,
      scope.creatorId,
      scope.threadId,
      {
        fanAccountId: scope.fanAccountId,
        creatorAccountId: scope.creatorAccountId,
      },
      client,
    );
    for (const source of sources)
      await assertRegisteredMigration(client, source);
    await input.assertPrepared(client);
    const row = (
      await client.query<{
        available: boolean;
        expiry: Date;
        pid: number;
        transaction: string;
      }>(
        `SELECT clock_timestamp()>=$1::timestamptz AND clock_timestamp()<$2::timestamptz
        AND transaction_timestamp()>=$1::timestamptz AND transaction_timestamp()<$2::timestamptz
        AND EXISTS(SELECT FROM creator.thread t JOIN creator.processor_consent p
          ON p.thread_id=t.id AND p.creator_id=t.creator_id AND p.fan_id=t.fan_id
          WHERE t.id=$3 AND t.creator_id=$4 AND t.fan_id=$5 AND t.deleted_at IS NULL
           AND t.processor_consent_version=$7 AND p.version=$7 AND p.account_id=$6
           AND p.withdrawn_at IS NULL AND p.providers=$8::jsonb) AS available,
        least(clock_timestamp()+interval '30 days',$2::timestamptz) AS expiry,
        pg_backend_pid() AS pid,pg_current_xact_id()::text AS transaction`,
        [
          beginsAt,
          endsAt,
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          scope.actorAccountId,
          policy.version,
          JSON.stringify(policy.providers),
        ],
      )
    ).rows[0]!;
    return row;
  };
  const held = <T>(
    scope: ThreadScope,
    client: PoolClient,
    read: (row: Awaited<ReturnType<typeof current>>) => T | Promise<T>,
  ) =>
    runtime.database.withHeldThreadOperation(scope, client, async () => {
      const before = await current(scope, client),
        value = await read(before),
        after = await current(scope, client);
      invariant(
        before.pid === after.pid &&
          before.transaction === after.transaction &&
          before.available === after.available,
        "comparison_policy_changed",
        "Review the current comparison notice before choosing.",
      );
      return value;
    });
  const consent: ComparisonConsentAuthority = Object.freeze({
    current: (scope: ThreadScope, client: PoolClient) =>
      held(scope, client, (row) => (row.available ? comparison : null)),
    consent: (scope: ThreadScope, client: PoolClient, version: string) =>
      held(scope, client, (row) => {
        invariant(
          row.available && version === comparison.version,
          "comparison_policy_changed",
          "Review the current comparison notice before choosing.",
        );
        return { policy: comparison, expiresAt: row.expiry.toISOString() };
      }),
  });
  const use: ComparisonUseAuthority = Object.freeze({
    current: (scope: ThreadScope, client: PoolClient) =>
      held(scope, client, (row) => {
        invariant(
          row.available,
          "comparison_policy_changed",
          "This question is not available under the current comparison notice.",
        );
        return comparison;
      }),
  });
  return Object.freeze({
    consent,
    use,
    close: () => {
      closed = true;
    },
  });
}
