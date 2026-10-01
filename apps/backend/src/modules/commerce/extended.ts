import type { Actor } from "../identity/adapter.js";
import { invariant } from "../../core/errors.js";
import type { CommerceService } from "./service.js";

/** W7 supplies audience-qualified durable read evidence; this is never a client route. */
export interface QualifiedRead {
  evidenceId: string;
  commitmentId: string;
  readerAccountId: string;
  audienceEligible: boolean;
  authenticated: boolean;
  distinctHuman: boolean;
}
export interface VerifiedStoreEntitlement {
  provider: "apple" | "google";
  reference: string;
  originalReference: string;
  accountId: string;
  creatorId: string;
  tierId: string;
  state: "active" | "grace" | "past_due" | "cancelled" | "refunded" | "revoked";
  startsAt: Date;
  endsAt: Date;
  purchasedAt: Date;
  cancelAtEnd: boolean;
}
export interface StoreEntitlementVerifier {
  verifyAndFetchCurrent(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
  ): Promise<VerifiedStoreEntitlement>;
  /** Only invoked after verified entitlement persistence, never before a grant. */
  acknowledge?(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
  ): Promise<void>;
}

export class ExtendedCommerce {
  get storeConfigured() {
    return Boolean(this.stores);
  }
  constructor(
    private readonly service: CommerceService,
    private readonly stores?: StoreEntitlementVerifier,
    readonly pass?: import("./pass.js").PassCommerce,
    readonly billing?: import("./billing.js").MembershipBilling,
    readonly tiers?: import("./tiers.js").CommerceTiers,
    readonly money?: import("./reconciliation.js").MoneyReconciliation,
    readonly settlement?: import("./accounting.js").CreatorSettlement,
    readonly passPurchases?: import("./pass-purchase-journal.js").PassPurchaseJournal,
  ) {}
  async storePurchase(
    actor: Actor,
    input: { platform: "apple" | "google"; transaction: string },
  ) {
    invariant(
      this.stores,
      "store_verification_unconfigured",
      "Store purchases cannot be verified yet. No access was granted.",
    );
    const before = await this.service.account(
      actor,
      async (client) =>
        (
          await client.query<{ provider_ref: string; version: number }>(
            "SELECT provider_ref,version FROM creator.commerce_membership WHERE fan_id=(SELECT id FROM creator.fan_profile WHERE account_id=$1) AND provider IN('apple','google')",
            [actor.accountId],
          )
        ).rows,
    );
    const versions = new Map(
      before.map((row) => [row.provider_ref, row.version]),
    );
    const verified = await this.stores.verifyAndFetchCurrent(input, actor);
    invariant(
      verified.provider === input.platform,
      "store_provider_conflict",
      "The verified purchase does not match this store.",
    );
    invariant(
      verified.accountId === actor.accountId,
      "purchase_link_conflict",
      "This purchase belongs to another account.",
    );
    invariant(
      verified.endsAt > verified.startsAt,
      "store_period_invalid",
      "The verified subscription period is invalid.",
    );
    const result = await this.service.account(actor, async (client) => {
      const fan = (
        await client.query<{ id: string }>(
          "SELECT id FROM creator.fan_profile WHERE account_id=$1",
          [actor.accountId],
        )
      ).rows[0];
      invariant(fan, "fan_profile_required", "Set up your profile first.");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`store:${verified.provider}:${verified.originalReference}`],
      );
      await client.query(
        "SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))",
        [`commerce.tier:${verified.tierId}`],
      );
      const tier = (
        await client.query<{
          id: string;
          capabilities: string[];
          ai_allowance: number;
          state: string;
          verification: string;
          recovery_required: boolean;
        }>(
          "SELECT t.*,cp.verification,cp.recovery_required FROM creator.commerce_tier t JOIN creator.creator_profile cp ON cp.id=t.creator_id WHERE t.id=$1 AND t.creator_id=$2",
          [verified.tierId, verified.creatorId],
        )
      ).rows[0];
      invariant(
        tier,
        "tier_unavailable",
        "The purchased membership is unavailable.",
      );

      const prior = (
        await client.query<{
          fan_id: string;
          creator_id: string;
          tier_id: string;
          grant_id: string | null;
          period_start: Date;
          version: number;
          state: string;
        }>(
          "SELECT fan_id,creator_id,tier_id,grant_id,period_start,version,state FROM creator.commerce_membership WHERE provider_ref=$1 FOR UPDATE",
          [`${verified.provider}:${verified.originalReference}`],
        )
      ).rows[0];
      invariant(
        prior
          ? prior.version ===
              versions.get(`${verified.provider}:${verified.originalReference}`)
          : !versions.has(`${verified.provider}:${verified.originalReference}`),
        "store_truth_stale",
        "The membership changed while verifying the store. Fetch its current entitlement again.",
      );
      invariant(
        !prior || verified.startsAt >= prior.period_start,
        "store_period_stale",
        "An older store period cannot replace the current membership.",
      );
      invariant(
        !prior ||
          prior.state !== "refunded" ||
          verified.startsAt > prior.period_start ||
          !["active", "grace", "cancelled"].includes(verified.state),
        "refunded_period_conflict",
        "A refunded store period cannot restore access.",
      );
      invariant(
        !prior ||
          (prior.fan_id === fan.id &&
            prior.creator_id === verified.creatorId &&
            prior.tier_id === tier.id),
        "purchase_link_conflict",
        "The original purchase is linked to another account.",
      );
      const currentPeriod =
        ["active", "grace", "cancelled"].includes(verified.state) &&
        verified.startsAt <= new Date() &&
        verified.endsAt > new Date();
      // Pausing sales preserves an already purchased tier, including renewals.
      // A new purchase still requires a currently offered tier.
      const tierAvailable =
        tier.state === "active" || (tier.state === "paused" && Boolean(prior));
      invariant(
        !currentPeriod ||
          (tierAvailable &&
            tier.verification === "verified" &&
            !tier.recovery_required &&
            (!tier.ai_allowance ||
              this.service.policy.costAllowanceIntegrated === true)),
        "store_access_unavailable",
        "The purchase was verified, but membership access is not available yet. Restore it when access is available.",
      );
      await client.query(
        `INSERT INTO creator.commerce_membership(creator_id,fan_id,tier_id,provider,provider_ref,state,period_start,period_end,cancel_at_end,purchased_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(provider_ref) DO UPDATE SET state=excluded.state,first_used_at=CASE WHEN creator.commerce_membership.period_start=excluded.period_start THEN creator.commerce_membership.first_used_at ELSE NULL END,period_start=excluded.period_start,period_end=excluded.period_end,cancel_at_end=excluded.cancel_at_end,purchased_at=excluded.purchased_at,version=creator.commerce_membership.version+1`,
        [
          verified.creatorId,
          fan.id,
          tier.id,
          verified.provider,
          `${verified.provider}:${verified.originalReference}`,
          verified.state,
          verified.startsAt,
          verified.endsAt,
          verified.cancelAtEnd,
          verified.purchasedAt,
        ],
      );
      // Grant mutation is pair-scoped, and never computed from a local receipt.
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
        [verified.creatorId, fan.id],
      );
      const active =
        currentPeriod &&
        tierAvailable &&
        tier.verification === "verified" &&
        !tier.recovery_required &&
        verified.startsAt <= new Date() &&
        verified.endsAt > new Date() &&
        (!tier.ai_allowance ||
          this.service.policy.costAllowanceIntegrated === true);
      // Replaying restore in the same paid period preserves used/reserved allowance.
      if (
        prior?.grant_id &&
        prior.period_start.getTime() === verified.startsAt.getTime()
      )
        await client.query(
          "UPDATE creator.access_grant SET state=$4,valid_until=$5,capabilities=$6 WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          [
            prior.grant_id,
            verified.creatorId,
            fan.id,
            active ? "active" : "revoked",
            verified.endsAt,
            tier.capabilities,
          ],
        );
      else if (active) {
        if (prior?.grant_id)
          await client.query(
            "UPDATE creator.access_grant SET state='expired' WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
            [prior.grant_id, verified.creatorId, fan.id],
          );
        const grant = (
          await client.query<{ id: string }>(
            `INSERT INTO creator.access_grant(creator_id,fan_id,capabilities,source,state,valid_from,valid_until,allowance) VALUES($1,$2,$3,'membership','active',$4,$5,$6) RETURNING id`,
            [
              verified.creatorId,
              fan.id,
              tier.capabilities,
              verified.startsAt,
              verified.endsAt,
              tier.ai_allowance,
            ],
          )
        ).rows[0]!;
        await client.query(
          "UPDATE creator.commerce_membership SET grant_id=$2 WHERE provider_ref=$1",
          [`${verified.provider}:${verified.originalReference}`, grant.id],
        );
      } else if (prior?.grant_id) {
        await client.query(
          "UPDATE creator.access_grant SET state='revoked' WHERE id=$1 AND creator_id=$2 AND fan_id=$3",
          [prior.grant_id, verified.creatorId, fan.id],
        );
      }
      return {
        serverVerified: true,
        accessGranted: active,
        state: verified.state,
        validUntil: verified.endsAt.toISOString(),
      };
    });
    if (result.accessGranted) await this.stores.acknowledge?.(input, actor);
    return result;
  }
  async draftPass(actor: Actor, input: unknown) {
    invariant(this.pass, "pass_unavailable", "The pass is not available yet.");
    return this.pass.draft(actor, input);
  }
  /** Calendar jobs must fetch paid provider truth before granting another cycle. */
  async transitionPass(actor: Actor) {
    invariant(
      this.pass,
      "pass_billing_unconfigured",
      "The current pass renewal cannot be verified.",
    );
    const recovered = await this.passPurchases?.drain(actor);
    const reference = await this.service.account(
      actor,
      async (client) =>
        (
          await client.query<{ provider_ref: string | null }>(
            "SELECT provider_ref FROM creator.commerce_pass",
          )
        ).rows[0]?.provider_ref,
    );
    if (!reference && this.passPurchases) {
      const status = await this.passPurchases.status(actor);
      return {
        processing: status.processing,
        recovered: recovered?.length ?? 0,
      };
    }
    invariant(
      reference,
      "pass_required",
      "A verified pass purchase is required.",
    );
    return this.pass.reconcile(actor, reference);
  }
  async creditRead(actor: Actor, evidence: QualifiedRead) {
    const rule = this.service.policy.credits;
    invariant(
      rule,
      "credits_unconfigured",
      "Public answer credits are not configured.",
    );
    return this.service.account(actor, async (client) => {
      const record = (
        await client.query<{
          creator_id: string;
          fan_id: string;
          reader: string;
          asker: string;
          creator_account: string;
          state: string;
          visibility: string;
          currency: string;
          credit_eligible: boolean;
        }>(
          `SELECT c.creator_id,c.fan_id,c.state,p.visibility,p.snapshot->>'currency' AS currency,fp.account_id AS asker,cp.account_id AS creator_account,NOT EXISTS(SELECT 1 FROM creator.commerce_share_grant sg WHERE sg.commitment_id=c.id AND sg.revoked_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.packet_id=p.id AND l.kind='refund') AS credit_eligible FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id JOIN creator.fan_profile fp ON fp.id=c.fan_id JOIN creator.creator_profile cp ON cp.id=c.creator_id WHERE c.id=$1 FOR UPDATE OF p,c`,
          [evidence.commitmentId],
        )
      ).rows[0];
      invariant(record, "answer_unavailable", "The answer is unavailable.");
      const eligible =
        record.state === "delivered" &&
        record.credit_eligible &&
        record.currency === rule.currency &&
        record.visibility === "public" &&
        evidence.audienceEligible &&
        evidence.authenticated &&
        evidence.distinctHuman &&
        ![record.asker, record.creator_account].includes(
          evidence.readerAccountId,
        );
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`credit_wallet:${record.fan_id}:${record.currency}`],
      );
      const read = await client.query(
        `INSERT INTO creator.commerce_qualified_read(creator_id,fan_id,commitment_id,reader_account_id,evidence_id,period,credited) VALUES($1,$2,$3,$4,$5,date_trunc('month',now()),$6) ON CONFLICT DO NOTHING RETURNING id`,
        [
          record.creator_id,
          record.fan_id,
          evidence.commitmentId,
          evidence.readerAccountId,
          evidence.evidenceId,
          eligible,
        ],
      );
      if (!read.rowCount || !eligible) return { credited: 0 };
      const used = (
        await client.query<{ amount: string }>(
          "SELECT coalesce(sum(amount),0)::text AS amount FROM creator.commerce_ledger WHERE fan_id=$1 AND currency=$2 AND kind='credit_issue' AND created_at>=date_trunc('month',now())",
          [record.fan_id, record.currency],
        )
      ).rows[0]!;
      invariant(
        Number.isSafeInteger(rule.perRead) &&
          rule.perRead > 0 &&
          Number.isSafeInteger(rule.monthlyCap) &&
          rule.monthlyCap >= 0,
        "credit_policy_invalid",
        "Credit amounts must be explicitly configured in minor units.",
      );
      const remaining = BigInt(rule.monthlyCap) - BigInt(used.amount);
      const amount = Number(
        remaining <= 0n
          ? 0n
          : remaining < BigInt(rule.perRead)
            ? remaining
            : BigInt(rule.perRead),
      );
      if (amount)
        await client.query(
          `INSERT INTO creator.commerce_ledger(creator_id,fan_id,commitment_id,kind,amount,currency,cause,refs) VALUES($1,$2,$3,'credit_issue',$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [
            record.creator_id,
            record.fan_id,
            evidence.commitmentId,
            amount,
            record.currency,
            `read:${evidence.evidenceId}`,
            JSON.stringify({
              noncash: true,
              readerEvidenceId: evidence.evidenceId,
            }),
          ],
        );
      return { credited: amount };
    });
  }
}
/** Integer largest-remainder allocation. A verified cycle supplies the pool, never AI volume. */
export function allocateSlotDayPool(
  poolMinor: bigint,
  weights: ReadonlyArray<{ creatorId: string; slotSeconds: bigint }>,
) {
  invariant(
    poolMinor >= 0n &&
      weights.every((w) => w.slotSeconds >= 0n) &&
      new Set(weights.map((w) => w.creatorId)).size === weights.length,
    "invalid_pool",
    "Pool accounting input is invalid.",
  );
  const total = weights.reduce((a, w) => a + w.slotSeconds, 0n);
  invariant(
    total > 0n || poolMinor === 0n,
    "pool_empty",
    "A positive pool needs eligible slot time.",
  );
  const rows = weights
    .map((w) => ({
      creatorId: w.creatorId,
      amount: total ? (poolMinor * w.slotSeconds) / total : 0n,
      remainder: total ? (poolMinor * w.slotSeconds) % total : 0n,
    }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.creatorId < b.creatorId
          ? -1
          : a.creatorId > b.creatorId
            ? 1
            : 0
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  let left = poolMinor - rows.reduce((a, w) => a + w.amount, 0n);
  for (const row of rows) {
    if (!left) break;
    row.amount += 1n;
    left -= 1n;
  }
  return rows.map(({ creatorId, amount }) => ({ creatorId, amount }));
}
export function membershipRefund(input: {
  paidMinor: bigint;
  purchasedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  firstUsedAt: Date | null;
  now: Date;
}) {
  invariant(
    input.paidMinor >= 0n && input.periodEnd > input.periodStart,
    "invalid_refund_period",
    "The membership period is invalid.",
  );
  if (
    !input.firstUsedAt &&
    input.now.getTime() - input.purchasedAt.getTime() <= 7 * 86400000
  )
    return input.paidMinor;
  const total = BigInt(input.periodEnd.getTime() - input.periodStart.getTime());
  const remaining = BigInt(
    Math.max(
      0,
      Math.min(Number(total), input.periodEnd.getTime() - input.now.getTime()),
    ),
  );
  return (input.paidMinor * remaining) / total;
}
