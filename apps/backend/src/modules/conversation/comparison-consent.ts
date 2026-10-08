import type { PoolClient } from "pg";
import { z } from "zod";
import type { Database } from "../../db/database.js";
import { invariant } from "../../core/errors.js";
import { assertThreadScope, type ThreadScope } from "../access/scope.js";

export const ComparisonPolicySchema = z.strictObject({
  version: z.string().trim().min(1).max(120),
  notice: z.string().trim().min(1).max(4000),
  processorPolicyVersion: z.string().trim().min(1).max(120),
});
export type ComparisonPolicy = z.infer<typeof ComparisonPolicySchema>;

/** Comparison is a distinct purpose. Reply feedback, ordinary processor
 * consent and creator access to a thread do not opt a fan into this use.
 * Trust supplies the actual notice, policy lifetime and provider restrictions;
 * Conversation never manufactures policy approval from a requested version. */
export interface ComparisonConsentAuthority {
  current(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<ComparisonPolicy | null>;
  consent(
    scope: ThreadScope,
    client: PoolClient,
    policyVersion: string,
  ): Promise<{ policy: ComparisonPolicy; expiresAt: string }>;
}

export const ComparisonConsentInputSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("allow"),
    policyVersion: z.string().trim().min(1).max(120),
    consent: z.literal(true),
  }),
  z.strictObject({ action: z.literal("withdraw") }),
]);

export type ComparisonConsentState = Readonly<{
  policy: ComparisonPolicy | null;
  allowed: boolean;
  consentedAt: string | null;
  expiresAt: string | null;
}>;

/** Created by the reviewed comparison host only after its complete storage,
 * invalidation, export/deletion and physical expiry owners are ready. It has
 * no raw-message reader and cannot itself issue a replay capability. */
export class ConversationComparisonConsent {
  constructor(
    private readonly db: Database,
    private readonly authority: ComparisonConsentAuthority,
    private readonly assertPrepared: (client: PoolClient) => Promise<void>,
  ) {}

  private async current(scope: ThreadScope, client: PoolClient) {
    this.db.assertHeldThread(scope, client);
    invariant(
      scope.authority === "fan" && scope.actorAccountId === scope.fanAccountId,
      "comparison_fan_required",
      "Only you can choose whether to include your questions in AI comparisons.",
    );
    await this.assertPrepared(client);
    const policy = await this.authority.current(scope, client);
    return policy ? ComparisonPolicySchema.parse(policy) : null;
  }

  private async state(
    scope: ThreadScope,
    client: PoolClient,
  ): Promise<ComparisonConsentState> {
    const policy = await this.current(scope, client);
    const row = policy
      ? (
          await client.query<{ consented_at: Date; expires_at: Date }>(
            `SELECT consented_at,expires_at FROM creator.conversation_comparison_consent
             WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND account_id=$4
              AND policy_version=$5 AND processor_policy_version=$6
              AND consented_at<=clock_timestamp() AND expires_at>clock_timestamp()`,
            [
              scope.threadId,
              scope.creatorId,
              scope.fanId,
              scope.actorAccountId,
              policy.version,
              policy.processorPolicyVersion,
            ],
          )
        ).rows[0]
      : undefined;
    return {
      policy,
      allowed: Boolean(row),
      consentedAt: row?.consented_at.toISOString() ?? null,
      expiresAt: row?.expires_at.toISOString() ?? null,
    };
  }

  async read(
    scope: ThreadScope,
    signal?: AbortSignal,
  ): Promise<ComparisonConsentState> {
    assertThreadScope(scope);
    return this.db.withThread(
      scope,
      (client) => this.state(scope, client),
      "read",
      signal,
    );
  }

  async decide(
    scope: ThreadScope,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<ComparisonConsentState> {
    assertThreadScope(scope);
    const choice = ComparisonConsentInputSchema.parse(body);
    return this.db.withThread(
      scope,
      async (client) => {
        const policy = await this.current(scope, client);
        const family = [
          scope.threadId,
          scope.creatorId,
          scope.fanId,
          scope.actorAccountId,
        ];
        if (choice.action === "withdraw") {
          // The original storage owner cascades through provenance to cached
          // samples and result text in this same commit. No tombstone-only success.
          await client.query(
            `DELETE FROM creator.conversation_comparison_consent
           WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND account_id=$4`,
            family,
          );
        } else {
          invariant(
            policy?.version === choice.policyVersion,
            "comparison_policy_changed",
            "Review the current comparison notice before choosing.",
          );
          const approved = await this.authority.consent(
            scope,
            client,
            choice.policyVersion,
          );
          const exact = ComparisonPolicySchema.parse(approved.policy);
          const expiresAt = z.iso.datetime().parse(approved.expiresAt);
          invariant(
            exact.version === policy.version &&
              exact.notice === policy.notice &&
              exact.processorPolicyVersion === policy.processorPolicyVersion,
            "comparison_policy_changed",
            "Review the current comparison notice before choosing.",
          );
          // Repeated Allow under the same policy preserves the original clock.
          // A new policy or expired consent starts a genuinely new explicit choice
          // and invalidates the former policy's derived samples first.
          const original = await client.query(
            `SELECT 1 FROM creator.conversation_comparison_consent
           WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND account_id=$4
            AND policy_version=$5 AND processor_policy_version=$6
            AND consented_at<=clock_timestamp() AND expires_at>clock_timestamp()`,
            [...family, exact.version, exact.processorPolicyVersion],
          );
          if (!original.rowCount) {
            await client.query(
              `DELETE FROM creator.conversation_comparison_consent
             WHERE thread_id=$1 AND creator_id=$2 AND fan_id=$3 AND account_id=$4`,
              family,
            );
            const written = await client.query(
              `INSERT INTO creator.conversation_comparison_consent
             (thread_id,creator_id,fan_id,account_id,policy_version,processor_policy_version,consented_at,expires_at)
             SELECT $1,$2,$3,$4,$5,$6,clock_timestamp(),$7::timestamptz
             WHERE $7::timestamptz>clock_timestamp() RETURNING thread_id`,
              [
                ...family,
                exact.version,
                exact.processorPolicyVersion,
                expiresAt,
              ],
            );
            invariant(
              written.rowCount === 1,
              "comparison_policy_expired",
              "The comparison notice expired. Refresh it before choosing.",
            );
          }
        }
        const result = await this.state(scope, client);
        this.db.finalizeHeldThreadBeforeCommit(scope, client, async () => {
          await this.assertPrepared(client);
          if (choice.action === "allow") {
            const current = await this.state(scope, client);
            const latest = current.policy;
            invariant(
              latest?.version === policy?.version &&
                latest?.processorPolicyVersion ===
                  policy?.processorPolicyVersion &&
                latest?.notice === policy?.notice &&
                current.allowed &&
                result.allowed,
              "comparison_policy_changed",
              "The comparison notice changed. Refresh it before choosing.",
            );
          }
        });
        return result;
      },
      "write",
      signal,
    );
  }
}
