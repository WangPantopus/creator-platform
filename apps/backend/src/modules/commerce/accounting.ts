import type { Actor } from "../identity/adapter.js";
import type { CommerceService } from "./service.js";
import { DomainError, invariant } from "../../core/errors.js";
import type { PoolClient } from "pg";
import { allocateSlotDayPool } from "./extended.js";
import { createHash } from "node:crypto";
import {
  PayoutCustody,
  type PayoutTransferRequest,
  type PayoutReversalRequest,
  type PayoutClaim,
} from "./payout-custody.js";
import type { PassPoolJournal } from "./pass-pool-journal.js";
import {
  CreatorPayoutOnboarding,
  type PayoutOnboardingAuthority,
} from "./payout-onboarding.js";

export interface CreditRules {
  currency: string;
  eligibleProducts: readonly string[];
  maximumPerCheckout: number;
  restoreOnRefund: boolean;
  revokeAskerCreditsOnAnswerRefund: boolean;
}
/** Used inside an actual checkout transaction; these credits can never be cashed out. */
export class CreditWallet {
  constructor(private readonly rules: CreditRules) {}
  async reserve(
    client: PoolClient,
    input: {
      fanId: string;
      creatorId: string;
      checkoutReference: string;
      product: string;
      amount: number;
      currency: string;
    },
  ) {
    invariant(
      this.rules.currency === input.currency &&
        this.rules.eligibleProducts.includes(input.product) &&
        Number.isSafeInteger(input.amount) &&
        input.amount > 0 &&
        input.amount <= this.rules.maximumPerCheckout,
      "credit_redemption_unavailable",
      "This configured credit redemption is unavailable.",
    );
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `credit_wallet:${input.fanId}:${input.currency}`,
    ]);
    const previous = (
      await client.query(
        "SELECT * FROM creator.commerce_credit_transfer WHERE checkout_ref=$1 FOR UPDATE",
        [input.checkoutReference],
      )
    ).rows[0];
    if (previous) {
      invariant(
        previous.fan_id === input.fanId &&
          previous.creator_id === input.creatorId &&
          BigInt(previous.amount) === BigInt(input.amount) &&
          previous.currency === input.currency,
        "idempotency_conflict",
        "Credit redemption parameters changed.",
      );
      return previous;
    }
    const balance = (
      await client.query<{ amount: string }>(
        "SELECT (coalesce((SELECT sum(CASE WHEN kind IN('credit_issue','credit_restore') THEN amount ELSE -amount END) FROM creator.commerce_ledger WHERE fan_id=$1 AND currency=$2 AND kind IN('credit_issue','credit_restore','credit_redeem','credit_revoke')),0)-coalesce((SELECT sum(amount) FROM creator.commerce_credit_transfer WHERE fan_id=$1 AND currency=$2 AND state='reserved'),0))::text AS amount",
        [input.fanId, input.currency],
      )
    ).rows[0]!;
    invariant(
      BigInt(balance.amount) >= BigInt(input.amount),
      "credit_balance_unavailable",
      "There are not enough available noncash credits.",
    );
    return (
      await client.query(
        "INSERT INTO creator.commerce_credit_transfer(fan_id,creator_id,amount,currency,checkout_ref,state) VALUES($1,$2,$3,$4,$5,'reserved') RETURNING *",
        [
          input.fanId,
          input.creatorId,
          input.amount,
          input.currency,
          input.checkoutReference,
        ],
      )
    ).rows[0]!;
  }
  async settle(
    client: PoolClient,
    id: string,
    confirmed: boolean,
    verifiedCheckoutReference: string,
  ) {
    const row = await lockCreditTransfer(client, id);
    invariant(
      row && row.checkout_ref === verifiedCheckoutReference,
      "credit_transfer_unavailable",
      "The verified checkout credit transfer is unavailable.",
    );
    const state = confirmed ? "consumed" : "restored";
    if (row.state !== "reserved") {
      invariant(
        row.state === state,
        "credit_transfer_settled",
        "This credit transfer was already settled.",
      );
      return;
    }
    if (confirmed)
      await client.query(
        "INSERT INTO creator.commerce_ledger(creator_id,fan_id,kind,amount,currency,cause,refs) VALUES($1,$2,'credit_redeem',$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [
          row.creator_id,
          row.fan_id,
          row.amount,
          row.currency,
          `credit:${id}`,
          JSON.stringify({
            noncash: true,
            checkoutReference: row.checkout_ref,
          }),
        ],
      );
    await client.query(
      "UPDATE creator.commerce_credit_transfer SET state=$2 WHERE id=$1",
      [id, state],
    );
  }
  async restoreAfterRefund(
    client: PoolClient,
    id: string,
    verifiedRefundReference: string,
  ) {
    invariant(
      this.rules.restoreOnRefund,
      "credit_refund_policy_unavailable",
      "Credit restoration is unavailable under the configured refund policy.",
    );
    const row = await lockCreditTransfer(client, id);
    invariant(
      row && ["consumed", "restored"].includes(row.state),
      "credit_transfer_unavailable",
      "A consumed checkout credit is required.",
    );
    if (row.state === "restored") return;
    await client.query(
      "INSERT INTO creator.commerce_ledger(creator_id,fan_id,kind,amount,currency,cause,provider_ref,refs) VALUES($1,$2,'credit_restore',$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
      [
        row.creator_id,
        row.fan_id,
        row.amount,
        row.currency,
        `credit_restore:${id}`,
        verifiedRefundReference,
        JSON.stringify({ noncash: true, checkoutReference: row.checkout_ref }),
      ],
    );
    await client.query(
      "UPDATE creator.commerce_credit_transfer SET state='restored' WHERE id=$1",
      [id],
    );
  }
  /** Only a persisted, provider-confirmed answer refund can claw back noncash issuance. */
  async revokeAnswerCredits(
    client: PoolClient,
    packetId: string,
    refundReference: string,
  ) {
    if (!this.rules.revokeAskerCreditsOnAnswerRefund) return;
    const refund = (
      await client.query(
        "SELECT l.fan_id,l.creator_id,c.id AS commitment_id,l.currency FROM creator.commerce_ledger l JOIN creator.commerce_commitment c ON c.packet_id=l.packet_id AND c.fan_id=l.fan_id AND c.creator_id=l.creator_id WHERE l.packet_id=$1 AND l.kind='refund' AND l.provider_ref=$2",
        [packetId, refundReference],
      )
    ).rows[0];
    invariant(
      refund,
      "credit_refund_unverified",
      "A reconciled refund in the configured credit currency is required.",
    );
    if (refund.currency !== this.rules.currency) return;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      `credit_wallet:${refund.fan_id}:${refund.currency}`,
    ]);
    await client.query(
      "INSERT INTO creator.commerce_ledger(creator_id,fan_id,packet_id,commitment_id,kind,amount,currency,cause,provider_ref,refs) SELECT creator_id,fan_id,$1,commitment_id,'credit_revoke',amount,currency,'credit_revoke:'||id::text,$2,jsonb_build_object('noncash',true,'issueId',id) FROM creator.commerce_ledger WHERE commitment_id=$3 AND fan_id=$4 AND kind='credit_issue' AND currency=$5 ON CONFLICT DO NOTHING",
      [
        packetId,
        refundReference,
        refund.commitment_id,
        refund.fan_id,
        refund.currency,
      ],
    );
  }
}

export interface VerifiedPoolCycle {
  cycle: string;
  currency: string;
  poolMinor: bigint;
  weights: readonly { creatorId: string; slotSeconds: bigint }[];
  sourceReference: string;
  policyVersion: string;
  reconciledAt: Date;
  /** Complete genuine charge budgets after the reviewed take/refunds/reserves.
   * No unknown or unallocated tender may contribute to the net pool. */
  funding: readonly {
    sourcePayment: string;
    sourceTransaction: string;
    poolMinor: bigint;
  }[];
}
export interface PoolCycleVerifier {
  current(cycle: string): Promise<VerifiedPoolCycle>;
}
/** Aggregation excludes refunds/unavailable intervals upstream; this writer recomputes exact allocation. */
export class PoolSettlement {
  constructor(
    private readonly service: CommerceService,
    private readonly verifier?: PoolCycleVerifier,
    private readonly journal?: PassPoolJournal,
  ) {}
  async post(actor: Actor, creatorId: string, cycle: string) {
    if (this.journal) {
      const prior = await this.journal.existing(actor, creatorId, cycle);
      if (prior.length) {
        const effects = [];
        for (const id of prior) effects.push(await this.journal.run(actor, id));
        return { effects };
      }
    }
    invariant(
      this.service.policy.passEnabled && this.verifier && this.journal,
      "pool_unavailable",
      "Verified pass pool accounting is unavailable.",
    );
    // Validate the genuine owner before reading the complete provider pool;
    // repeat under the allocation transaction after those external reads.
    await this.service.account(actor, async (client) => {
      const creator = await client.query(
        "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required",
        [creatorId, actor.accountId],
      );
      invariant(
        creator.rowCount === 1,
        "creator_required",
        "Only the verified creator may settle this pool allocation.",
      );
    });
    const truth = await this.verifier.current(cycle);
    this.journal.plan(truth);
    invariant(
      truth.cycle === cycle &&
        /^\d{4}-\d{2}$/u.test(cycle) &&
        truth.sourceReference,
      "pool_cycle_invalid",
      "The pool cycle needs provider reconciliation.",
    );
    const allocation = allocateSlotDayPool(truth.poolMinor, truth.weights).find(
      (row) => row.creatorId === creatorId,
    );
    invariant(
      allocation && allocation.amount <= BigInt(Number.MAX_SAFE_INTEGER),
      "pool_allocation_invalid",
      "The creator pool allocation is invalid.",
    );
    const posted = await this.service.account(actor, async (client) => {
      const creator = await client.query(
        "SELECT id FROM creator.creator_profile WHERE id=$1 AND account_id=$2 AND verification='verified' AND NOT recovery_required",
        [creatorId, actor.accountId],
      );
      invariant(
        creator.rowCount === 1,
        "creator_required",
        "Only the verified creator may read this pool allocation.",
      );
      const cause = `pool:${cycle}:${creatorId}`;
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [cause],
      );
      const prior = (
        await client.query(
          "SELECT amount,currency FROM creator.commerce_ledger WHERE kind='pool_alloc' AND cause=$1",
          [cause],
        )
      ).rows[0];
      invariant(
        !prior ||
          (BigInt(prior.amount) === allocation.amount &&
            prior.currency === truth.currency),
        "pool_reconciliation_required",
        "The posted immutable pool differs from current evidence. A cause-linked adjustment is required.",
      );
      const destination = (
        await client.query<{ provider_ref: string }>(
          "SELECT provider_ref FROM creator.commerce_payout_account WHERE creator_id=$1 FOR SHARE",
          [creatorId],
        )
      ).rows[0];
      invariant(
        destination?.provider_ref,
        "payout_account_required",
        "The pool needs an actual current payout destination.",
      );
      const effects = await this.journal!.stage(
        client,
        truth,
        creatorId,
        destination.provider_ref,
      );
      await client.query(
        "INSERT INTO creator.commerce_ledger(creator_id,kind,amount,currency,cause,provider_ref,refs) VALUES($1,'pool_alloc',$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
        [
          creatorId,
          allocation.amount.toString(),
          truth.currency,
          cause,
          truth.sourceReference,
          JSON.stringify({
            cycle,
            slotSeconds: truth.weights
              .find((w) => w.creatorId === creatorId)!
              .slotSeconds.toString(),
            totalSlotSeconds: truth.weights
              .reduce((n, w) => n + w.slotSeconds, 0n)
              .toString(),
          }),
        ],
      );
      return {
        amount: allocation.amount.toString(),
        currency: truth.currency,
        effects,
      };
    });
    const effects = [];
    for (const id of posted.effects)
      effects.push(await this.journal.run(actor, id));
    return { ...posted, effects };
  }
}

export type VerifiedTransfer = {
  id: string;
  amount: number;
  currency: string;
  destination: string;
  sourcePayment: string;
  sourceTransaction: string;
  keyHash: string;
  state: "pending" | "succeeded" | "failed";
  reversed: boolean;
  reversalReceipts?: readonly { reference: string; amount: number }[];
};
export interface PayoutProvider {
  onboarding?(reference: string): Promise<{ url: string; expiresAt: Date }>;
  account(reference: string): Promise<{
    reference: string;
    country: string;
    enabled: boolean;
    detailsDue: boolean;
  }>;
  reconciledBalance(commitmentId: string): Promise<{
    netMinor: number;
    currency: string;
    sourcePayment: string;
    sourceTransaction: string;
    reconciledAt: Date;
    disputeOpen?: boolean;
  }>;
  transfer(
    input: PayoutTransferRequest,
    claim: PayoutClaim,
  ): Promise<VerifiedTransfer>;
  /** Read-only lookup of the exact original effect, including after provider
   * idempotency expiry. Absence never authorizes a new aged transfer. */
  recoverTransfer?(
    input: Parameters<PayoutProvider["transfer"]>[0],
    claim: PayoutClaim,
  ): Promise<Awaited<ReturnType<PayoutProvider["transfer"]>> | undefined>;
  current(reference: string, claim: PayoutClaim): Promise<VerifiedTransfer>;
  reverse(
    reference: string,
    key: string,
  ): Promise<{ id: string; reversed: boolean }>;
  /** Frozen before provider I/O. Missing original-body recovery leaves cash
   * unavailable; the legacy remaining-amount method cannot substitute. */
  reverseOriginal?(
    input: PayoutReversalRequest & { original: PayoutTransferRequest },
    claim: PayoutClaim,
  ): Promise<void>;
}
type PayoutEffect = {
  id: string;
  creator_id: string;
  commitment_id: string;
  amount: string;
  currency: string;
  provider_key: string;
  provider_ref: string | null;
  created_at: Date;
  attempt: number;
  lease_until: Date | null;
};
/** Q03/topology and market approval are mandatory injected configuration, never inferred from a build. */
export class CreatorSettlement {
  get onboardingConfigured() {
    return this.onboarding.configured;
  }
  readonly onboarding: CreatorPayoutOnboarding;
  get configured() {
    return Boolean(
      this.provider?.reverseOriginal &&
        this.provider.recoverTransfer &&
        this.countries.length &&
        this.custody,
    );
  }
  constructor(
    private readonly service: CommerceService,
    private readonly countries: readonly string[],
    private readonly provider?: PayoutProvider,
    private readonly custody?: PayoutCustody,
    onboardingAuthority?: PayoutOnboardingAuthority,
  ) {
    this.onboarding = new CreatorPayoutOnboarding(
      service,
      countries,
      provider,
      onboardingAuthority,
    );
  }
  async release(actor: Actor, commitmentId: string) {
    invariant(
      this.provider?.reverseOriginal &&
        this.provider.recoverTransfer &&
        this.custody,
      "payout_unavailable",
      "Payout transfers require their provider and immutable original request custody.",
    );
    const record = await this.service.account(
      actor,
      async (client) =>
        (
          await client.query(
            "SELECT c.creator_id,a.provider_ref,e.id AS effect_id FROM creator.commerce_commitment c LEFT JOIN creator.commerce_payout_account a ON a.creator_id=c.creator_id LEFT JOIN creator.commerce_payout_effect e ON e.commitment_id=c.id WHERE c.id=$1",
            [commitmentId],
          )
        ).rows[0],
    );
    if (record?.effect_id) return this.run(actor, record.effect_id);
    invariant(
      record?.provider_ref,
      "payout_account_required",
      "Set up the configured payout account first.",
    );
    const account = await this.provider.account(record.provider_ref);
    invariant(
      account.reference === record.provider_ref &&
        account.enabled &&
        !account.detailsDue &&
        this.countries.includes(account.country),
      "payout_account_restricted",
      "Payout account verification or market availability is incomplete.",
    );
    const verifiedBalance = await this.provider.reconciledBalance(commitmentId);
    const id = await this.service.account(actor, async (client) => {
      const c = (
        await client.query(
          "SELECT c.*,p.snapshot,p.intent_ref,p.payment_state,cp.account_id,cp.verification,cp.recovery_required FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id JOIN creator.creator_profile cp ON cp.id=c.creator_id WHERE c.id=$1 FOR UPDATE OF c,p",
          [commitmentId],
        )
      ).rows[0];
      const prior = await client.query<{ id: string }>(
        "SELECT id FROM creator.commerce_payout_effect WHERE commitment_id=$1",
        [commitmentId],
      );
      if (prior.rows[0]) return prior.rows[0].id;
      invariant(
        c &&
          c.account_id === actor.accountId &&
          c.verification === "verified" &&
          !c.recovery_required &&
          c.state === "delivered" &&
          c.payout_release_at &&
          c.payout_release_at <= new Date() &&
          !c.dispute_open &&
          c.payment_state === "captured",
        "payout_not_due",
        "This verified delivery is not eligible for payout yet.",
      );
      const entries = (
        await client.query<{
          kind: string;
          amount: string;
          refs: { direction?: string };
        }>(
          "SELECT kind,amount,refs FROM creator.commerce_ledger WHERE packet_id=$1 AND kind IN('capture','refund','fee','reserve','adjustment','payout')",
          [c.packet_id],
        )
      ).rows;
      const balance = entries.reduce(
        (n, e) =>
          n +
          (e.kind === "capture" ||
          (e.kind === "adjustment" && e.refs?.direction === "credit")
            ? BigInt(e.amount)
            : -BigInt(e.amount)),
        0n,
      );
      invariant(
        Number.isSafeInteger(verifiedBalance.netMinor) &&
          balance === BigInt(verifiedBalance.netMinor) &&
          verifiedBalance.currency === c.snapshot.currency &&
          verifiedBalance.sourcePayment === c.intent_ref &&
          verifiedBalance.sourceTransaction.length > 0 &&
          verifiedBalance.disputeOpen !== true &&
          Math.abs(Date.now() - verifiedBalance.reconciledAt.getTime()) < 60000,
        "ledger_reconciliation_required",
        "Provider fees, reserves and available funds must match the ledger before payout.",
      );
      const destination = await client.query<{ provider_ref: string }>(
        "SELECT provider_ref FROM creator.commerce_payout_account WHERE creator_id=$1 FOR SHARE",
        [c.creator_id],
      );
      invariant(
        destination.rows[0]?.provider_ref === account.reference,
        "payout_account_changed",
        "The payout destination changed during review. Refresh before releasing funds.",
      );
      invariant(
        balance > 0n && balance <= BigInt(Number.MAX_SAFE_INTEGER),
        "payout_balance_unavailable",
        "The payout balance is held or needs reconciliation.",
      );
      const effect = (
        await client.query<PayoutEffect>(
          "INSERT INTO creator.commerce_payout_effect(creator_id,commitment_id,amount,currency,provider_key) VALUES($1,$2,$3,$4,$5) RETURNING *",
          [
            c.creator_id,
            c.id,
            balance.toString(),
            c.snapshot.currency,
            `payout:${c.id}`,
          ],
        )
      ).rows[0]!;
      invariant(
        BigInt(effect.amount) === balance &&
          effect.currency === c.snapshot.currency,
        "payout_amount_changed",
        "The original payout must be reconciled before releasing a changed balance.",
      );
      await this.custody!.record(client, effect, {
        destination: account.reference,
        amount: Number(balance),
        currency: effect.currency,
        sourcePayment: verifiedBalance.sourcePayment,
        sourceTransaction: verifiedBalance.sourceTransaction,
        key: effect.provider_key,
      });
      return effect.id;
    });
    return this.run(actor, id);
  }
  async run(actor: Actor, id: string) {
    invariant(
      this.provider?.reverseOriginal &&
        this.provider.recoverTransfer &&
        this.custody,
      "payout_unavailable",
      "Payout transfers require their provider and immutable original request custody.",
    );
    const effect = await this.service.account(
      actor,
      async (client) =>
        (
          await client.query<PayoutEffect>(
            "UPDATE creator.commerce_payout_effect SET state='processing',attempt=attempt+1,lease_until=clock_timestamp()+interval '3 minutes' WHERE id=$1 AND (state IN('pending','processing','unknown') OR (state IN('done','failed') AND provider_ref IS NOT NULL)) AND (lease_until IS NULL OR lease_until<clock_timestamp()) RETURNING *",
            [id],
          )
        ).rows[0],
    );
    if (!effect) {
      const prior = await this.service.account(actor, async (client) => {
        const prior = (
          await client.query(
            "SELECT * FROM creator.commerce_payout_effect WHERE id=$1",
            [id],
          )
        ).rows[0];
        invariant(prior, "payout_unavailable", "The payout is unavailable.");
        return prior;
      });
      return {
        processing: !["done", "failed"].includes(prior.state),
        state: prior.state,
        ...(prior.error_code ? { reason: prior.error_code } : {}),
      };
    }
    const claim = { effectId: effect.id, attempt: effect.attempt };
    try {
      const original = await this.service.account(actor, (client) =>
        this.custody!.original(client, effect),
      );
      const originalCompensation = await this.service.account(actor, (client) =>
        this.custody!.reversal(client, effect),
      );
      const current = await this.service.account(
        actor,
        async (client) =>
          (
            await client.query(
              "SELECT c.dispute_open,c.state,c.packet_id,p.intent_ref,p.payment_state,a.provider_ref FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id LEFT JOIN creator.commerce_payout_account a ON a.creator_id=c.creator_id JOIN creator.creator_profile cp ON cp.id=c.creator_id WHERE c.id=$1 AND cp.account_id=$2 AND cp.verification='verified' AND NOT cp.recovery_required",
              [effect.commitment_id, actor.accountId],
            )
          ).rows[0],
      );
      invariant(
        current,
        "payout_scope_unavailable",
        "Current payout scope is unavailable; provider reconciliation is required.",
      );
      if (!effect.provider_ref && this.provider.recoverTransfer) {
        const recovered = await this.provider.recoverTransfer(original, claim);
        if (recovered) {
          this.assertTransfer(original, recovered);
          await this.service.account(actor, async (client) => {
            await this.fence(client, effect);
            invariant(
              recovered.id.length > 0 && recovered.id.length <= 200,
              "payout_reference_invalid",
              "The original provider transfer reference is invalid.",
            );
            const own = await client.query(
              "UPDATE creator.commerce_payout_effect SET provider_ref=$3 WHERE id=$1 AND attempt=$2 AND state='processing' AND lease_until>clock_timestamp() AND provider_ref IS NULL RETURNING id",
              [effect.id, effect.attempt, recovered.id],
            );
            invariant(
              own.rowCount === 1,
              "effect_lease_lost",
              "A newer payout worker owns this recovery.",
            );
            effect.provider_ref = recovered.id;
            if (recovered.state === "succeeded")
              await this.recordTransfer(
                client,
                { ...effect, packet_id: current.packet_id },
                recovered,
                false,
              );
          });
          effect.provider_ref = recovered.id;
        }
      }
      invariant(
        effect.provider_ref ||
          (current.state === "delivered" &&
            !current.dispute_open &&
            current.payment_state === "captured" &&
            current.provider_ref === original.destination &&
            current.intent_ref === original.sourcePayment),
        "payout_held",
        "Payout is held while this obligation is unresolved.",
      );
      invariant(
        effect.provider_ref ||
          (Date.now() - effect.created_at.getTime() >= -60000 &&
            Date.now() - effect.created_at.getTime() < 23 * 3600000),
        "operator_reconciliation_required",
        "The original transfer needs provider reconciliation.",
      );
      if (!effect.provider_ref) {
        const [account, balance] = await Promise.all([
          this.provider.account(original.destination),
          this.provider.reconciledBalance(effect.commitment_id),
        ]);
        invariant(
          account.reference === original.destination &&
            account.enabled &&
            !account.detailsDue &&
            this.countries.includes(account.country),
          "payout_account_restricted",
          "Payout account verification is incomplete.",
        );
        invariant(
          balance.netMinor === Number(effect.amount) &&
            balance.currency === effect.currency &&
            balance.sourcePayment === original.sourcePayment &&
            balance.sourceTransaction === original.sourceTransaction &&
            balance.disputeOpen !== true &&
            Math.abs(Date.now() - balance.reconciledAt.getTime()) < 60000,
          "payout_amount_changed",
          "Current available funds no longer match the original payout.",
        );
        await this.service.account(actor, async (client) => {
          await this.fence(client, effect);
          const c = (
            await client.query(
              "SELECT c.state,c.dispute_open,p.payment_state,p.intent_ref,a.provider_ref FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id JOIN creator.commerce_payout_account a ON a.creator_id=c.creator_id WHERE c.id=$1 FOR UPDATE OF c,p FOR SHARE OF a",
              [effect.commitment_id],
            )
          ).rows[0];
          const ledger = (
            await client.query<{ amount: string }>(
              "SELECT coalesce(sum(CASE WHEN kind='capture' OR (kind='adjustment' AND refs->>'direction'='credit') THEN amount ELSE -amount END),0)::text AS amount FROM creator.commerce_ledger WHERE packet_id=$1 AND kind IN('capture','refund','fee','reserve','adjustment','payout')",
              [current.packet_id],
            )
          ).rows[0]!;
          invariant(
            c?.state === "delivered" &&
              !c.dispute_open &&
              c.payment_state === "captured" &&
              c.provider_ref === original.destination &&
              c.intent_ref === original.sourcePayment &&
              BigInt(ledger.amount) === BigInt(effect.amount),
            "payout_held",
            "The obligation or available balance changed before transfer.",
          );
        });
      }
      const transfer = effect.provider_ref
        ? await this.provider.current(effect.provider_ref, claim)
        : await this.provider.transfer(original, claim);
      this.assertTransfer(original, transfer);
      invariant(
        transfer.id.length > 0 &&
          transfer.id.length <= 200 &&
          (!effect.provider_ref || transfer.id === effect.provider_ref),
        "payout_reference_invalid",
        "Current transfer truth must match the original provider reference.",
      );
      await this.service.account(actor, async (client) => {
        await this.fence(client, effect);
        const own = await client.query(
          "UPDATE creator.commerce_payout_effect SET provider_ref=$3 WHERE id=$1 AND attempt=$2 AND state='processing' AND lease_until>clock_timestamp() AND (provider_ref IS NULL OR provider_ref=$3) RETURNING id",
          [id, effect.attempt, transfer.id],
        );
        invariant(
          own.rowCount === 1,
          "effect_lease_lost",
          "A newer payout worker owns this recovery.",
        );
        effect.provider_ref = transfer.id;
        if (transfer.state === "succeeded")
          await this.recordTransfer(
            client,
            { ...effect, packet_id: current.packet_id },
            transfer,
            false,
          );
      });
      effect.provider_ref = transfer.id;
      // Store the reference before another provider read. A changed KYC/market
      // gate after transfer requires durable compensation, not a done receipt.
      const compensationKnown =
        originalCompensation || transfer.reversalReceipts?.length;
      const afterAccount = compensationKnown
        ? undefined
        : await this.provider.account(original.destination);
      const afterBalance = compensationKnown
        ? undefined
        : await this.provider.reconciledBalance(effect.commitment_id);
      const accountHeld =
        !afterAccount ||
        afterAccount.reference !== original.destination ||
        !afterAccount.enabled ||
        afterAccount.detailsDue ||
        !this.countries.includes(afterAccount.country);
      const fundsHeld =
        !afterBalance ||
        afterBalance.disputeOpen === true ||
        afterBalance.netMinor !== Number(effect.amount) ||
        afterBalance.currency !== effect.currency ||
        afterBalance.sourcePayment !== original.sourcePayment ||
        afterBalance.sourceTransaction !== original.sourceTransaction ||
        Math.abs(Date.now() - afterBalance.reconciledAt.getTime()) >= 60000;
      // Persist the reference before post-provider eligibility checks; crash retries fetch current truth.
      const held = await this.service.account(actor, async (client) => {
        await this.fence(client, effect);
        const c = (
          await client.query(
            "SELECT c.state,c.dispute_open,p.payment_state,p.intent_ref,a.provider_ref FROM creator.commerce_commitment c JOIN creator.commerce_packet p ON p.id=c.packet_id LEFT JOIN creator.commerce_payout_account a ON a.creator_id=c.creator_id WHERE c.id=$1 FOR UPDATE OF c,p",
            [effect.commitment_id],
          )
        ).rows[0];
        const balance = (
          await client.query<{ amount: string }>(
            "SELECT coalesce(sum(CASE WHEN kind='capture' OR (kind='adjustment' AND refs->>'direction'='credit') THEN amount ELSE -amount END),0)::text AS amount FROM creator.commerce_ledger WHERE packet_id=$1 AND kind IN('capture','refund','fee','reserve','adjustment','payout') AND cause<>$2",
            [current.packet_id, effect.provider_key],
          )
        ).rows[0]!;
        const held =
          Boolean(originalCompensation) ||
          Boolean(transfer.reversalReceipts?.length && !transfer.reversed) ||
          accountHeld ||
          fundsHeld ||
          !c ||
          c.state !== "delivered" ||
          c.dispute_open ||
          c.payment_state !== "captured" ||
          c.provider_ref !== original.destination ||
          c.intent_ref !== original.sourcePayment ||
          BigInt(balance.amount) !== BigInt(effect.amount);
        if (held && transfer.state === "succeeded" && !transfer.reversed) {
          const remaining =
            transfer.amount -
            (transfer.reversalReceipts ?? []).reduce(
              (sum, r) => sum + r.amount,
              0,
            );
          await this.custody!.recordReversal(client, effect, remaining);
        }
        // A confirmed transfer is cash history even if current eligibility
        // requires compensation. Only an eligible unreversed transfer gets a
        // payout-release entry. Both facts and real reversals commit together.
        if (transfer.state === "succeeded")
          await this.recordTransfer(
            client,
            { ...effect, packet_id: current.packet_id },
            transfer,
            !held,
          );
        await client.query(
          "UPDATE creator.commerce_payout_effect SET state=$2,lease_until=$3,error_code=$4 WHERE id=$1",
          [
            id,
            held
              ? "unknown"
              : transfer.reversed ||
                  transfer.reversalReceipts?.length ||
                  transfer.state === "failed"
                ? "failed"
                : transfer.state === "succeeded"
                  ? "done"
                  : "unknown",
            held ? effect.lease_until : null,
            held ? "transfer_compensation_pending" : null,
          ],
        );
        return held;
      });
      if (held) {
        if (transfer.state === "failed") {
          await this.service.account(actor, async (client) => {
            await this.fence(client, effect);
            await client.query(
              "UPDATE creator.commerce_payout_effect SET state='failed',lease_until=NULL,error_code='provider_transfer_failed' WHERE id=$1 AND attempt=$2 AND state='unknown' AND lease_until>clock_timestamp()",
              [id, effect.attempt],
            );
          });
          return { processing: false };
        }
        invariant(
          transfer.state === "succeeded",
          "payout_compensation_pending",
          "The original transfer must be confirmed before compensation.",
        );
        let confirmed = transfer;
        if (!transfer.reversed) {
          await this.service.account(actor, (client) =>
            this.fence(client, effect),
          );
          const reversal = await this.service.account(actor, async (client) => {
            await this.fence(client, effect);
            const request = await this.custody!.reversal(client, effect);
            invariant(
              request,
              "payout_original_reversal_missing",
              "Compensation requires its original immutable request.",
            );
            return request;
          });
          await this.provider.reverseOriginal({ ...reversal, original }, claim);
          // A reversal response/Boolean is not a receipt. Re-read the exact
          // original transfer and require complete real reversal cash below.
          confirmed = await this.provider.current(transfer.id, claim);
        }
        invariant(
          confirmed.id === transfer.id &&
            confirmed.state === "succeeded" &&
            confirmed.reversed,
          "payout_compensation_pending",
          "The transfer reversal is processing.",
        );
        await this.service.account(actor, async (client) => {
          await this.fence(client, effect);
          await this.recordTransfer(
            client,
            { ...effect, packet_id: current.packet_id },
            confirmed,
            false,
          );
          await client.query(
            "UPDATE creator.commerce_payout_effect SET state='failed',lease_until=NULL,error_code='transfer_reversed_after_hold' WHERE id=$1 AND attempt=$2 AND state='unknown' AND lease_until>clock_timestamp()",
            [id, effect.attempt],
          );
        });
      }
      return { processing: !held && transfer.state === "pending" };
    } catch (error) {
      await this.service.account(actor, (client) =>
        client.query(
          "UPDATE creator.commerce_payout_effect SET state='unknown',lease_until=NULL,error_code=$2 WHERE id=$1 AND attempt=$3 AND state IN('processing','unknown') AND lease_until>clock_timestamp()",
          [
            id,
            error instanceof DomainError ? error.code : "provider_unknown",
            effect.attempt,
          ],
        ),
      );
      return { processing: true };
    }
  }
  private async fence(client: PoolClient, effect: PayoutEffect) {
    const own = await client.query(
      "SELECT id FROM creator.commerce_payout_effect WHERE id=$1 AND attempt=$2 AND state IN('processing','unknown') AND lease_until>clock_timestamp() AND (provider_ref IS NULL OR provider_ref=$3) FOR UPDATE",
      [effect.id, effect.attempt, effect.provider_ref],
    );
    invariant(
      own.rowCount === 1,
      "effect_lease_lost",
      "The original payout claim expired or a newer worker owns recovery.",
    );
  }
  private assertTransfer(
    original: PayoutTransferRequest,
    transfer: VerifiedTransfer,
  ) {
    invariant(
      transfer.amount === original.amount &&
        transfer.currency === original.currency &&
        transfer.destination === original.destination &&
        transfer.sourcePayment === original.sourcePayment &&
        transfer.sourceTransaction === original.sourceTransaction &&
        transfer.reversalReceipts !== undefined &&
        transfer.keyHash ===
          createHash("sha256").update(original.key).digest("hex"),
      "payout_reference_conflict",
      "Provider cash must match the immutable original payout request.",
    );
  }
  private async recordTransfer(
    client: PoolClient,
    effect: PayoutEffect & { packet_id: string },
    transfer: VerifiedTransfer,
    eligible: boolean,
  ) {
    const original = await this.custody!.original(client, effect);
    this.assertTransfer(original, transfer);
    invariant(
      transfer.id === effect.provider_ref &&
        transfer.state === "succeeded" &&
        transfer.amount === Number(effect.amount) &&
        transfer.currency === effect.currency,
      "payout_reference_invalid",
      "Only confirmed original transfer cash may enter the payout ledger.",
    );
    for (const kind of eligible &&
    !transfer.reversed &&
    !transfer.reversalReceipts?.length
      ? ["payout", "payout_release"]
      : ["payout"]) {
      const prior = (
        await client.query(
          "SELECT creator_id,packet_id,commitment_id,amount,currency,provider_ref FROM creator.commerce_ledger WHERE kind=$1 AND cause=$2",
          [kind, effect.provider_key],
        )
      ).rows[0];
      invariant(
        !prior ||
          (prior.creator_id === effect.creator_id &&
            prior.packet_id === effect.packet_id &&
            prior.commitment_id === effect.commitment_id &&
            BigInt(prior.amount) === BigInt(effect.amount) &&
            prior.currency === effect.currency &&
            prior.provider_ref === transfer.id),
        "payout_receipt_conflict",
        "The original immutable payout receipt needs reconciliation.",
      );
      if (!prior)
        await client.query(
          "INSERT INTO creator.commerce_ledger(creator_id,packet_id,commitment_id,kind,amount,currency,cause,provider_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            effect.creator_id,
            effect.packet_id,
            effect.commitment_id,
            kind,
            effect.amount,
            effect.currency,
            effect.provider_key,
            transfer.id,
          ],
        );
    }
    await this.recordReversals(client, effect, transfer);
  }
  private async recordReversals(
    client: PoolClient,
    effect: PayoutEffect & { packet_id: string },
    transfer: VerifiedTransfer,
  ) {
    const receipts = transfer.reversalReceipts ?? [];
    invariant(
      !transfer.reversed || receipts.length > 0,
      "payout_reversal_receipts_required",
      "Confirmed reversal receipts are required before correcting a posted payout.",
    );
    invariant(
      transfer.id === effect.provider_ref &&
        new Set(receipts.map((r) => r.reference)).size === receipts.length &&
        receipts.every(
          (r) =>
            r.reference.length > 0 &&
            r.reference.length <= 200 &&
            Number.isSafeInteger(r.amount) &&
            r.amount > 0,
        ) &&
        receipts.reduce((n, r) => n + BigInt(r.amount), 0n) <=
          BigInt(effect.amount) &&
        (!transfer.reversed ||
          receipts.reduce((n, r) => n + BigInt(r.amount), 0n) ===
            BigInt(effect.amount)),
      "payout_reversal_invalid",
      "Current reversal receipts do not match the original payout.",
    );
    for (const receipt of receipts) {
      const prior = (
        await client.query(
          "SELECT creator_id,packet_id,commitment_id,amount,currency,provider_ref,refs FROM creator.commerce_ledger WHERE kind='adjustment' AND cause=$1",
          [`payout_reversal:${receipt.reference}`],
        )
      ).rows[0];
      invariant(
        !prior ||
          (prior.creator_id === effect.creator_id &&
            prior.packet_id === effect.packet_id &&
            prior.commitment_id === effect.commitment_id &&
            BigInt(prior.amount) === BigInt(receipt.amount) &&
            prior.currency === effect.currency &&
            prior.provider_ref === receipt.reference &&
            prior.refs?.direction === "credit" &&
            prior.refs?.sourceTransfer === transfer.id),
        "payout_reversal_conflict",
        "The original immutable reversal receipt needs reconciliation.",
      );
      if (!prior)
        await client.query(
          "INSERT INTO creator.commerce_ledger(creator_id,packet_id,commitment_id,kind,amount,currency,cause,provider_ref,refs) VALUES($1,$2,$3,'adjustment',$4,$5,$6,$7,$8)",
          [
            effect.creator_id,
            effect.packet_id,
            effect.commitment_id,
            receipt.amount,
            effect.currency,
            `payout_reversal:${receipt.reference}`,
            receipt.reference,
            JSON.stringify({
              direction: "credit",
              sourceTransfer: transfer.id,
            }),
          ],
        );
    }
  }
}

async function lockCreditTransfer(client: PoolClient, id: string) {
  const before = (
    await client.query(
      "SELECT fan_id,currency FROM creator.commerce_credit_transfer WHERE id=$1",
      [id],
    )
  ).rows[0];
  invariant(
    before,
    "credit_transfer_unavailable",
    "The credit transfer is unavailable.",
  );
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
    `credit_wallet:${before.fan_id}:${before.currency}`,
  ]);
  return (
    await client.query(
      "SELECT * FROM creator.commerce_credit_transfer WHERE id=$1 FOR UPDATE",
      [id],
    )
  ).rows[0];
}
