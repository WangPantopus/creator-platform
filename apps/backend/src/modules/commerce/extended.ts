import type { Actor } from "../identity/adapter.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { CommerceService } from "./service.js";
import type { PoolClient } from "pg";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { lockCommitmentPacket } from "./packet-locks.js";

/** W7 supplies audience-qualified durable read evidence; this is never a client route. */
export interface QualifiedRead {
  evidenceId: string;
  commitmentId: string;
  creatorId: string;
  fanId: string;
  packetId: string;
  threadId: string;
  readerAccountId: string;
  /** Exact original delivered evidence, bound by the signed publication/review producer. */
  fulfillmentHash: string;
  audienceEligible: boolean;
  authenticated: boolean;
  distinctHuman: boolean;
}
/** Canonical W7 custody, never a client proof, actor issuer or single late
 * callback. prepare holds genuine current purpose/reader and family/audience
 * authority before W4 domain locks and binds immutable metadata to this exact
 * client/transaction/caller/tuple. It must NOT take final source-signature
 * leases. authorize runs LAST after W4's domain/wallet/cap/journal writes,
 * rechecks that binding and holds exact current publication/review/signature
 * permission through commit. False/503 rolls back every staged W4 write.
 * No provider I/O, impersonation or successful default is allowed. */
export interface QualifiedReadAuthority {
  prepare(
    client: PoolClient,
    actor: Actor,
    evidenceId: string,
  ): Promise<Readonly<QualifiedRead> | null>;
  authorize(
    client: PoolClient,
    actor: Actor,
    receipt: Readonly<QualifiedRead>,
  ): Promise<boolean>;
}
const QualifiedReadReceipt = z.strictObject({
  evidenceId: z.string().min(8).max(160),
  commitmentId: z.uuid(),
  creatorId: z.uuid(),
  fanId: z.uuid(),
  packetId: z.uuid(),
  threadId: z.uuid(),
  readerAccountId: z.uuid(),
  fulfillmentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  audienceEligible: z.boolean(),
  authenticated: z.boolean(),
  distinctHuman: z.boolean(),
});
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
  /** Server-verified paid periods and irreversible negative observations;
   * entitlement expiry can include grace and cannot replace this evidence. */
  paidObservations?: readonly import("./paid-coverage.js").StorePaidObservation[];
}
export interface StoreEntitlementVerifier {
  verifyAndFetchCurrent(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
    history?: StorePaidHistoryReader,
  ): Promise<VerifiedStoreEntitlement>;
  /** Only invoked after verified entitlement persistence, never before a grant. */
  acknowledge?(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
  ): Promise<void>;
}
export type StorePaidHistoryReader = (
  binding: Pick<
    VerifiedStoreEntitlement,
    "provider" | "originalReference" | "creatorId" | "tierId"
  >,
) => Promise<readonly string[]>;

export class ExtendedCommerce {
  get storeConfigured() {
    return Boolean(this.stores && this.paidCoverage);
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
    readonly poolJournal?: import("./pass-pool-journal.js").PassPoolJournal,
    private readonly qualifiedReads?: QualifiedReadAuthority,
    private readonly paidCoverage?: import("./paid-coverage.js").PaidCoverageJournal,
  ) {
    if (
      qualifiedReads &&
      (typeof qualifiedReads.prepare !== "function" ||
        typeof qualifiedReads.authorize !== "function")
    )
      throw new DomainError(
        "qualified_read_authority_unavailable",
        "Qualified reads require separate early custody and final source authorization.",
        503,
      );
    invariant(
      !poolJournal || poolJournal.isForService(service),
      "pool_graph_mismatch",
      "Pool reads require this same prepared commerce graph.",
    );
    invariant(
      !paidCoverage || paidCoverage.isForService(service),
      "paid_coverage_graph_mismatch",
      "Store paid coverage requires this same prepared commerce graph.",
    );
  }
  async storePurchase(
    actor: Actor,
    input: { platform: "apple" | "google"; transaction: string },
  ) {
    invariant(
      this.stores,
      "store_verification_unconfigured",
      "Store purchases cannot be verified yet. No access was granted.",
    );
    invariant(
      this.paidCoverage,
      "paid_coverage_unconfigured",
      "Store purchases require registered paid-period and refund history. No access was changed.",
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
    const verified = await this.stores.verifyAndFetchCurrent(
      input,
      actor,
      (binding) => this.paidCoverage!.references(actor, binding),
    );
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
      await this.paidCoverage!.hold(client, actor, verified.creatorId, fan.id);
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
      const currentPaid = verified.paidObservations?.some(
        (observation) =>
          observation.kind === "paid" &&
          observation.startsAt.getTime() === verified.startsAt.getTime() &&
          observation.endsAt <= verified.endsAt &&
          !verified.paidObservations!.some(
            (denial) =>
              denial.kind === "denied" &&
              denial.reference === observation.reference,
          ),
      );
      invariant(
        !currentPeriod || currentPaid,
        "store_paid_period_unconfirmed",
        "The store has not confirmed this paid membership period. No access was granted; restore when its paid history is confirmed.",
      );
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
      await this.paidCoverage!.record(client, actor, verified);
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
  async creditRead(actor: Actor, evidenceId: string) {
    const readId = z.string().min(8).max(160).parse(evidenceId);
    const rule = this.service.policy.credits;
    invariant(
      rule,
      "credits_unconfigured",
      "Public answer credits are not configured.",
    );
    invariant(
      this.qualifiedReads,
      "qualified_read_authority_unavailable",
      "Credits require the canonical durable read and current signed-source authority.",
    );
    invariant(
      /^[A-Z]{3}$/u.test(rule.currency) &&
        Number.isSafeInteger(rule.perRead) &&
        rule.perRead > 0 &&
        Number.isSafeInteger(rule.monthlyCap) &&
        rule.monthlyCap >= 0,
      "credit_policy_invalid",
      "Credit amounts must be explicitly configured in minor units.",
    );
    return this.service.account(actor, async (client) => {
      let receipt: QualifiedRead | null;
      try {
        receipt = await this.qualifiedReads!.prepare(client, actor, readId);
      } finally {
        await client.query(
          "SELECT set_config('app.account_id',$1,true),set_config('app.creator_id','',true),set_config('app.fan_id','',true)",
          [actor.accountId],
        );
      }
      invariant(
        receipt,
        "qualified_read_unavailable",
        "The durable qualified read is unavailable.",
      );
      const evidence = Object.freeze(QualifiedReadReceipt.parse(receipt));
      invariant(
        evidence.evidenceId === readId,
        "qualified_read_binding_mismatch",
        "The durable read must match its original evidence identity.",
      );
      // The authority's temporary context was restored above. Scope our own
      // thread reads to the validated canonical receipt, retaining the real
      // caller account for commerce RLS and the command/ledger custody.
      await client.query(
        "SELECT set_config('app.creator_id',$1,true),set_config('app.fan_id',$2,true)",
        [evidence.creatorId, evidence.fanId],
      );
      const thread = await client.query(
        "SELECT id FROM creator.thread WHERE id=$1 AND creator_id=$2 AND fan_id=$3 FOR UPDATE",
        [evidence.threadId, evidence.creatorId, evidence.fanId],
      );
      invariant(
        thread.rowCount === 1,
        "answer_unavailable",
        "The answer is unavailable.",
      );
      await lockCommitmentPacket(client, evidence.commitmentId);
      const record = (
        await client.query<{
          creator_id: string;
          fan_id: string;
          asker: string;
          creator_account: string;
          state: string;
          currency: string;
          credit_eligible: boolean;
          packet_id: string;
          thread_id: string;
          evidence: unknown;
          current_creator: boolean;
        }>(
          `SELECT c.creator_id,c.fan_id,c.state,c.evidence,c.packet_id,p.thread_id,p.snapshot->>'currency' AS currency,
           fp.account_id AS asker,cp.account_id AS creator_account,cp.verification='verified' AND NOT cp.recovery_required AS current_creator,
           p.state='accepted' AND p.payment_state='captured' AND p.accepted_at IS NOT NULL
           AND c.delivered_at IS NOT NULL AND NOT c.dispute_open
           AND c.mode IN('written_reply','voice_note','group_answer','guaranteed_review')
           AND mode.shareable AND p.snapshot->>'shareable'='true' AND c.mode=p.snapshot->>'mode'
           AND ((p.visibility='public' AND share.commitment_id IS NULL)
            OR (share.fan_choice AND share.creator_permission AND share.revoked_at IS NULL))
           AND EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.packet_id=p.id AND l.kind='capture'
            AND l.amount=(p.snapshot->>'amount')::bigint AND l.currency=p.snapshot->>'currency')
           AND NOT EXISTS(SELECT 1 FROM creator.commerce_ledger l WHERE l.packet_id=p.id AND l.kind='refund')
           AND NOT EXISTS(SELECT 1 FROM creator.commerce_effect effect WHERE effect.packet_id=p.id AND effect.operation='refund' AND effect.state<>'failed') AS credit_eligible
           FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id AND p.creator_id=c.creator_id AND p.fan_id=c.fan_id
           JOIN creator.commerce_mode mode ON mode.id=p.mode_id AND mode.creator_id=p.creator_id
           JOIN creator.fan_profile fp ON fp.id=c.fan_id JOIN creator.creator_profile cp ON cp.id=c.creator_id
           LEFT JOIN creator.commerce_share_grant share ON share.commitment_id=c.id AND share.creator_id=c.creator_id AND share.fan_id=c.fan_id
           WHERE c.id=$1 FOR UPDATE OF c`,
          [evidence.commitmentId],
        )
      ).rows[0];
      invariant(record, "answer_unavailable", "The answer is unavailable.");
      invariant(
        record.creator_id === evidence.creatorId &&
          record.fan_id === evidence.fanId &&
          record.packet_id === evidence.packetId &&
          record.thread_id === evidence.threadId &&
          record.evidence !== null &&
          contentHash(record.evidence) === evidence.fulfillmentHash,
        "qualified_read_binding_mismatch",
        "The read must bind the exact delivered commitment evidence.",
      );
      const eligible =
        record.state === "delivered" &&
        record.current_creator &&
        record.credit_eligible &&
        record.currency === rule.currency &&
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
      let amount = 0;
      if (eligible) {
        const used = (
          await client.query<{ amount: string }>(
            "SELECT coalesce(sum(amount),0)::text AS amount FROM creator.commerce_ledger WHERE fan_id=$1 AND currency=$2 AND kind='credit_issue' AND created_at>=date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AND created_at<(date_trunc('month',now() AT TIME ZONE 'UTC')+interval '1 month') AT TIME ZONE 'UTC'",
            [record.fan_id, record.currency],
          )
        ).rows[0]!;
        const remaining = BigInt(rule.monthlyCap) - BigInt(used.amount);
        amount = Number(
          remaining <= 0n
            ? 0n
            : remaining < BigInt(rule.perRead)
              ? remaining
              : BigInt(rule.perRead),
        );
      }
      const read = await client.query(
        `INSERT INTO creator.commerce_qualified_read(creator_id,fan_id,commitment_id,reader_account_id,evidence_id,period,credited) VALUES($1,$2,$3,$4,$5,date_trunc('month',now() AT TIME ZONE 'UTC')::date,$6) ON CONFLICT DO NOTHING RETURNING id`,
        [
          record.creator_id,
          record.fan_id,
          evidence.commitmentId,
          evidence.readerAccountId,
          evidence.evidenceId,
          amount > 0,
        ],
      );
      if (!read.rowCount) amount = 0;
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
      // The actual W7 source gate is last even for dedupe, ineligible or
      // exhausted-cap paths. No new domain lock or journal follows it.
      let authorized;
      try {
        authorized = await this.qualifiedReads!.authorize(
          client,
          actor,
          evidence,
        );
      } finally {
        await client.query(
          "SELECT set_config('app.account_id',$1,true),set_config('app.creator_id',$2,true),set_config('app.fan_id',$3,true)",
          [actor.accountId, evidence.creatorId, evidence.fanId],
        );
      }
      invariant(
        authorized === true,
        "qualified_read_unavailable",
        "The current qualified read or signed source changed. No credit was issued.",
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
