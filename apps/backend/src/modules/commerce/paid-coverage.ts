import { z } from "zod";
import type { PoolClient } from "pg";
import type { CommerceService } from "./service.js";
import type { VerifiedStoreEntitlement } from "./extended.js";
import type { Actor } from "../identity/adapter.js";
import type { ContentAudienceAuthority } from "./content-audience.js";
import { assertCurrentSession } from "../identity/request-authority.js";
import { invariant } from "../../core/errors.js";

const Observation = z.discriminatedUnion("kind", [
  z
    .strictObject({
      kind: z.literal("paid"),
      reference: z.string().min(1).max(200),
      proofHash: z.string().regex(/^[a-f0-9]{64}$/u),
      startsAt: z.date(),
      endsAt: z.date(),
      qualification: z.enum([
        "apple_signed_positive_price",
        "google_processed_positive_total",
      ]),
    })
    .refine((value) => value.endsAt > value.startsAt),
  z.strictObject({
    kind: z.literal("denied"),
    reference: z.string().min(1).max(200),
    proofHash: z.string().regex(/^[a-f0-9]{64}$/u),
    reason: z.enum(["refund", "revoked", "unpaid", "unconfirmed"]),
  }),
]);
export type StorePaidObservation = z.infer<typeof Observation>;
export const PAID_COVERAGE_MIGRATION_VERSION = "0155_w4_paid_coverage";

/** Prepared immutable provider metadata, distinct from cash and access grants.
 * A refund, revocation or unpaid period is retained: an older restore cannot
 * revive that coverage. A genuinely paid provider observation can resolve an
 * earlier unconfirmed observation, without deleting either observation.
 * No purchase token, JWS, key, address or provider response is persisted here. */
export class PaidCoverageJournal {
  private constructor(
    private readonly service: CommerceService,
    private readonly retentionPolicyVersion: string,
    private readonly registered: () => Promise<void>,
    private readonly assertAllowed: ContentAudienceAuthority,
  ) {}
  static async prepare(input: {
    service: CommerceService;
    migration: { version: string; checksum: string };
    retentionPolicyVersion: string;
    assertPrivacyRegistered(): Promise<void>;
    /** Real current fan/creator denials held on this same client before any
     * business lock or grant write. There is no permissive default. */
    assertAllowed: ContentAudienceAuthority;
  }) {
    invariant(
      input.migration.version === PAID_COVERAGE_MIGRATION_VERSION &&
        /^[a-f0-9]{64}$/u.test(input.migration.checksum) &&
        input.retentionPolicyVersion.length > 0 &&
        input.retentionPolicyVersion.length <= 200 &&
        typeof input.assertPrivacyRegistered === "function" &&
        typeof input.assertAllowed === "function",
      "paid_coverage_unconfigured",
      "Paid coverage requires exact canonical installation and reviewed privacy custody.",
    );
    const role = await input.service.pool.query<{ safe: boolean }>(
      `SELECT NOT r.rolsuper AND NOT r.rolbypassrls AND NOT EXISTS(
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator' AND c.relowner=r.oid) AS safe
       FROM pg_roles r WHERE r.rolname=current_user`,
    );
    invariant(
      role.rows[0]?.safe,
      "paid_coverage_role_invalid",
      "Paid coverage requires a non-owner runtime role with forced row security.",
    );
    const result = await input.service.pool.query<{ ready: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM creator.schema_migration WHERE version=$1 AND checksum=$2)
       AND (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='creator' AND c.relname IN('commerce_paid_coverage','commerce_paid_coverage_denial')
        AND c.relrowsecurity AND c.relforcerowsecurity AND pg_get_userbyid(c.relowner)='creator_owner'
        AND has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT')
        AND NOT has_table_privilege(current_user,c.oid,'UPDATE') AND NOT has_table_privilege(current_user,c.oid,'DELETE')) AS ready`,
      [input.migration.version, input.migration.checksum],
    );
    invariant(
      result.rows[0]?.ready,
      "paid_coverage_unconfigured",
      "The complete immutable paid-coverage journal is not installed.",
    );
    const registered = input.assertPrivacyRegistered.bind(input);
    await registered();
    return new PaidCoverageJournal(
      input.service,
      input.retentionPolicyVersion,
      registered,
      input.assertAllowed,
    );
  }
  isForService(service: CommerceService) {
    return this.service === service;
  }
  async hold(
    client: PoolClient,
    actor: Actor,
    creatorId: string,
    fanId: string,
  ) {
    await this.registered();
    invariant(
      actor.adultEligible,
      "adult_eligibility_required",
      "Adult eligibility is required.",
    );
    const caller = await client.query<{ account: string }>(
      "SELECT current_setting('app.account_id',true) AS account",
    );
    invariant(
      caller.rows[0]?.account === actor.accountId,
      "paid_coverage_scope_required",
      "Retain the real purchase owner's authority.",
    );
    await assertCurrentSession(client, actor.accountId);
    await this.assertAllowed(client, actor, creatorId, fanId);
    const retained = await client.query<{ account: string }>(
      "SELECT current_setting('app.account_id',true) AS account",
    );
    invariant(
      retained.rows[0]?.account === actor.accountId,
      "paid_coverage_scope_required",
      "The held purchase owner changed.",
    );
  }
  async references(
    actor: Actor,
    binding: Pick<
      VerifiedStoreEntitlement,
      "provider" | "originalReference" | "creatorId" | "tierId"
    >,
  ) {
    return this.service.account(actor, async (client) => {
      const fan = (
        await client.query<{ id: string }>(
          "SELECT id FROM creator.fan_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0];
      invariant(fan, "fan_profile_required", "Set up your profile first.");
      await this.hold(client, actor, binding.creatorId, fan.id);
      const rows = (
        await client.query<{ proof_reference: string }>(
          `SELECT p.proof_reference FROM creator.commerce_paid_coverage p JOIN creator.commerce_membership m
         ON m.id=p.membership_id AND m.creator_id=p.creator_id AND m.fan_id=p.fan_id
         WHERE m.provider=$1 AND m.provider_ref=$2 AND m.creator_id=$3 AND m.tier_id=$4 AND m.fan_id=$5
         ORDER BY p.proof_reference LIMIT 1001`,
          [
            binding.provider,
            `${binding.provider}:${binding.originalReference}`,
            binding.creatorId,
            binding.tierId,
            fan.id,
          ],
        )
      ).rows;
      invariant(
        rows.length <= 1000,
        "store_history_reconciliation_required",
        "The complete paid history needs reconciliation before restoring access.",
      );
      return rows.map((row) => row.proof_reference);
    });
  }
  async assertReadable() {
    await this.registered();
  }
  async record(
    client: PoolClient,
    actor: Actor,
    verified: VerifiedStoreEntitlement,
  ) {
    await this.registered();
    invariant(
      actor.accountId === verified.accountId,
      "paid_coverage_scope_required",
      "Use the real verified purchase owner.",
    );
    const observations = z
      .array(Observation)
      .min(1)
      .max(1000)
      .parse(verified.paidObservations);
    const membership = (
      await client.query<{ id: string; fan_id: string }>(
        `SELECT m.id,m.fan_id FROM creator.commerce_membership m JOIN creator.fan_profile f ON f.id=m.fan_id
         WHERE m.provider=$1 AND m.provider_ref=$2 AND m.creator_id=$3 AND m.tier_id=$4
          AND f.account_id=$5 AND f.account_id=nullif(current_setting('app.account_id',true),'')::uuid FOR UPDATE OF m`,
        [
          verified.provider,
          `${verified.provider}:${verified.originalReference}`,
          verified.creatorId,
          verified.tierId,
          verified.accountId,
        ],
      )
    ).rows[0];
    invariant(
      membership,
      "paid_coverage_scope_required",
      "Record coverage only for the actual verified purchase owner.",
    );
    for (const observation of observations) {
      const identity = [
        verified.creatorId,
        membership.fan_id,
        membership.id,
        verified.provider,
        observation.reference,
      ];
      if (observation.kind === "denied") {
        await client.query(
          `INSERT INTO creator.commerce_paid_coverage_denial(creator_id,fan_id,membership_id,provider,proof_reference,reason,proof_hash,retention_policy_version)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(provider,proof_reference,reason,proof_hash) DO NOTHING`,
          [
            ...identity,
            observation.reason,
            observation.proofHash,
            this.retentionPolicyVersion,
          ],
        );
        const same = await client.query(
          `SELECT id FROM creator.commerce_paid_coverage_denial WHERE creator_id=$1 AND fan_id=$2 AND membership_id=$3
           AND provider=$4 AND proof_reference=$5 AND reason=$6 AND proof_hash=$7`,
          [...identity, observation.reason, observation.proofHash],
        );
        invariant(
          same.rowCount === 1,
          "paid_coverage_conflict",
          "The original negative provider observation belongs to another purchase.",
        );
        continue;
      }
      invariant(
        observation.qualification ===
          (verified.provider === "apple"
            ? "apple_signed_positive_price"
            : "google_processed_positive_total"),
        "paid_coverage_provider_conflict",
        "Use this store's verified paid-period evidence.",
      );
      await client.query(
        `INSERT INTO creator.commerce_paid_coverage(creator_id,fan_id,membership_id,provider,proof_reference,period_start,period_end,qualification,proof_hash,retention_policy_version)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(provider,proof_reference) DO NOTHING`,
        [
          ...identity,
          observation.startsAt,
          observation.endsAt,
          observation.qualification,
          observation.proofHash,
          this.retentionPolicyVersion,
        ],
      );
      const same = await client.query(
        `SELECT id FROM creator.commerce_paid_coverage WHERE creator_id=$1 AND fan_id=$2 AND membership_id=$3 AND provider=$4 AND proof_reference=$5
          AND period_start=$6 AND period_end=$7 AND qualification=$8 AND proof_hash=$9`,
        [
          ...identity,
          observation.startsAt,
          observation.endsAt,
          observation.qualification,
          observation.proofHash,
        ],
      );
      invariant(
        same.rowCount === 1,
        "paid_coverage_conflict",
        "The original paid-period evidence changed; reconcile it before displaying tenure.",
      );
    }
    // Check the retained negative history inside the same grant transaction.
    // A newly fetched positive response cannot revive an already refunded,
    // revoked or genuinely unpaid transaction, even if that response is older.
    if (["active", "grace", "cancelled"].includes(verified.state)) {
      const references = observations
        .filter(
          (observation) =>
            observation.kind === "paid" &&
            observation.startsAt.getTime() === verified.startsAt.getTime(),
        )
        .map((observation) => observation.reference);
      const denied = await client.query(
        `SELECT id FROM creator.commerce_paid_coverage_denial WHERE provider=$1
          AND proof_reference=ANY($2::text[]) AND reason IN('refund','revoked','unpaid') LIMIT 1`,
        [verified.provider, references],
      );
      invariant(
        !denied.rowCount,
        "store_paid_period_denied",
        "A refunded, revoked or unpaid store period cannot restore membership access.",
      );
    }
    await this.registered();
  }
}
