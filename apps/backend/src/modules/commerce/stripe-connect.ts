import Stripe from "stripe";
import { createHash } from "node:crypto";
import { invariant } from "../../core/errors.js";
import { stripeOperation } from "../payments/stripe.js";
import type {
  MoneyStatementProvider,
  VerifiedMoneyStatement,
} from "./reconciliation.js";
import type { PayoutProvider } from "./accounting.js";
import type { PoolTransferProvider } from "./pass-pool-journal.js";

const reference = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

async function collect<T>(list: Stripe.ApiListPromise<T>) {
  const rows: T[] = [];
  for await (const row of list) {
    invariant(
      rows.length < 1000,
      "provider_statement_too_large",
      "This provider statement needs reviewed bulk reconciliation.",
    );
    rows.push(row);
  }
  return rows;
}
type Entry = VerifiedMoneyStatement["entries"][number];

/** Explicit Q03 approval is required. This adapter supports platform-owned
 * separate charges/transfers with creator-paid processing fees. Other topology
 * or fee responsibility needs its own reviewed allocation, never a default. */
export interface StripeConnectPolicy {
  topology: "separate_charges_and_transfers";
  collectionAccount: "platform";
  processingFees: "creator";
  /** Immutable approved platform fee/reserve allocations, with cause references.
   * Current provider-wide reserves must be accounted for by this authority.
   * Zero fees/reserves are a business decision and must be returned explicitly. */
  allocations(input: {
    paymentId: string;
    packetId: string;
    currency: string;
    capturedMinor: number;
    refundedMinor: number;
    balance: Stripe.Balance;
  }): Promise<{ entries: readonly Entry[]; reservesAllocated: boolean }>;
}

export abstract class StripeCardMoneyStatement
  implements MoneyStatementProvider
{
  protected constructor(
    protected readonly stripe: Stripe,
    policy: Pick<
      StripeConnectPolicy,
      "topology" | "collectionAccount" | "processingFees"
    >,
  ) {
    invariant(
      policy.topology === "separate_charges_and_transfers" &&
        policy.collectionAccount === "platform" &&
        policy.processingFees === "creator",
      "payout_topology_required",
      "Configure the reviewed platform charge and transfer policy.",
    );
  }
  protected abstract assertBinding(
    payment: Stripe.PaymentIntent,
  ): Promise<void>;
  usesConnection(stripe: Stripe) {
    return this.stripe === stripe;
  }
  protected abstract allocations(input: {
    payment: Stripe.PaymentIntent;
    capturedMinor: number;
    refundedMinor: number;
    balance: Stripe.Balance;
  }): Promise<{ entries: readonly Entry[]; reservesAllocated: boolean }>;
  async charge(paymentId: string) {
    invariant(
      /^pi_[A-Za-z0-9]+$/u.test(paymentId),
      "payment_reference_invalid",
      "A current payment reference is required.",
    );
    const payment = await this.stripe.paymentIntents.retrieve(paymentId);
    invariant(
      !payment.livemode &&
        payment.status === "succeeded" &&
        payment.latest_charge &&
        !payment.transfer_data &&
        !payment.on_behalf_of &&
        !payment.application_fee_amount,
      "payout_topology_conflict",
      "The captured sandbox payment must match the configured platform topology.",
    );
    await this.assertBinding(payment);
    const charge = await this.stripe.charges.retrieve(
      reference(payment.latest_charge)!,
    );
    invariant(
      !charge.livemode &&
        charge.paid &&
        charge.captured &&
        charge.status === "succeeded" &&
        reference(charge.payment_intent) === payment.id &&
        charge.amount_captured === payment.amount_received &&
        charge.currency === payment.currency &&
        charge.payment_method_details?.type === "card" &&
        !charge.transfer &&
        !charge.application_fee,
      "cash_reconciliation_required",
      "Current captured card cash must reconcile before settlement.",
    );
    return { payment, charge };
  }
  async current(paymentId: string): Promise<VerifiedMoneyStatement> {
    return stripeOperation(async () => {
      const { payment, charge } = await this.charge(paymentId);
      const entries: Entry[] = [];
      const transactions = new Map<string, Stripe.BalanceTransaction>();
      const transaction = async (
        value: string | Stripe.BalanceTransaction | null,
        expectedSource: string,
      ) => {
        invariant(
          value,
          "money_statement_pending",
          "The current provider funds transaction is still pending.",
        );
        const row = await this.stripe.balanceTransactions.retrieve(
          reference(value)!,
        );
        invariant(
          reference(row.source) === expectedSource &&
            row.currency === payment.currency &&
            !row.exchange_rate &&
            row.balance_type === "payments" &&
            [row.amount, row.fee, row.net].every(Number.isSafeInteger) &&
            row.net === row.amount - row.fee,
          "money_statement_invalid",
          "The funds transaction requires reviewed currency or source reconciliation.",
        );
        invariant(
          !transactions.has(row.id),
          "money_statement_duplicate",
          "A funds transaction appeared more than once.",
        );
        transactions.set(row.id, row);
        if (row.fee !== 0)
          entries.push({
            reference: row.id,
            kind: row.fee > 0 ? "fee" : "fee_refund",
            amount: Math.abs(row.fee),
          });
        return row;
      };
      const captured = await transaction(charge.balance_transaction, charge.id);
      invariant(
        captured.amount === charge.amount_captured,
        "cash_reconciliation_required",
        "Captured cash does not match its funds transaction.",
      );
      const refunds = await collect(
        this.stripe.refunds.list({ charge: charge.id, limit: 100 }),
      );
      let refunded = 0;
      for (const refund of refunds) {
        invariant(
          reference(refund.charge) === charge.id &&
            refund.currency === payment.currency,
          "cash_reconciliation_required",
          "Refund ownership or currency changed.",
        );
        if (refund.status === "failed" || refund.status === "canceled")
          continue;
        invariant(
          refund.status === "succeeded",
          "money_statement_pending",
          "A refund is still processing; funds remain held.",
        );
        const row = await transaction(refund.balance_transaction, refund.id);
        invariant(
          row.amount === -refund.amount,
          "cash_reconciliation_required",
          "Refund cash does not match its funds transaction.",
        );
        refunded += refund.amount;
      }
      invariant(
        Number.isSafeInteger(refunded) && refunded === charge.amount_refunded,
        "cash_reconciliation_required",
        "Complete current refund cash is required.",
      );
      const disputes = await collect(
        this.stripe.disputes.list({ charge: charge.id, limit: 100 }),
      );
      invariant(
        !charge.disputed || disputes.length > 0,
        "money_statement_incomplete",
        "Complete current dispute truth is required.",
      );
      let disputeOpen = false;
      for (const dispute of disputes) {
        invariant(
          !dispute.livemode &&
            reference(dispute.charge) === charge.id &&
            dispute.currency === payment.currency,
          "money_statement_invalid",
          "The dispute belongs to another payment or currency.",
        );
        disputeOpen ||= ![
          "won",
          "lost",
          "warning_closed",
          "prevented",
        ].includes(dispute.status);
        for (const disputeTransaction of dispute.balance_transactions) {
          const row = await transaction(disputeTransaction, dispute.id);
          invariant(
            row.net <= 0 ||
              (row.status === "available" &&
                row.available_on * 1000 <= Date.now()),
            "money_statement_pending",
            "Dispute funds are still being returned to the provider balance.",
          );
          if (row.amount)
            entries.push({
              reference: row.id,
              kind: row.amount < 0 ? "reserve" : "reserve_release",
              amount: Math.abs(row.amount),
            });
        }
      }
      const balance = await this.stripe.balance.retrieve();
      invariant(
        !balance.livemode,
        "provider_environment_mismatch",
        "Sandbox funds are required.",
      );
      const allocation = await this.allocations({
        payment,
        capturedMinor: charge.amount_captured,
        refundedMinor: refunded,
        balance,
      });
      invariant(
        allocation.reservesAllocated &&
          allocation.entries.every(
            (e) =>
              Number.isSafeInteger(e.amount) &&
              e.amount >= 0 &&
              e.reference.length > 0 &&
              e.reference.length <= 200,
          ),
        "reserve_allocation_required",
        "Current provider reserves and approved fees require complete cause-linked allocation.",
      );
      entries.push(...allocation.entries);
      invariant(
        new Set(entries.map((e) => `${e.kind}:${e.reference}`)).size ===
          entries.length,
        "money_statement_duplicate",
        "Accounting causes must be distinct.",
      );
      const net =
        BigInt(charge.amount_captured) -
        BigInt(refunded) +
        entries.reduce(
          (n, e) =>
            n +
            (["fee_refund", "reserve_release"].includes(e.kind)
              ? BigInt(e.amount)
              : -BigInt(e.amount)),
          0n,
        );
      invariant(
        net >= BigInt(Number.MIN_SAFE_INTEGER) &&
          net <= BigInt(Number.MAX_SAFE_INTEGER),
        "money_statement_invalid",
        "The current net funds are outside the supported accounting range.",
      );
      // A pending charge is represented by a real immutable reserve, released
      // only when current provider truth makes that same transaction available.
      if (
        captured.status !== "available" ||
        captured.available_on * 1000 > Date.now()
      ) {
        entries.push({
          reference: `pending:${captured.id}`,
          kind: "reserve",
          amount: Math.max(0, captured.net),
        });
      } else {
        // Emit both causes on first settled observation so replay order cannot
        // create an unbacked reserve release or change a posted entry amount.
        entries.push(
          {
            reference: `pending:${captured.id}`,
            kind: "reserve",
            amount: Math.max(0, captured.net),
          },
          {
            reference: `pending:${captured.id}`,
            kind: "reserve_release",
            amount: Math.max(0, captured.net),
          },
        );
      }
      const availableNet =
        net -
        (captured.status !== "available" ||
        captured.available_on * 1000 > Date.now()
          ? BigInt(Math.max(0, captured.net))
          : 0n);
      invariant(
        availableNet >= BigInt(Number.MIN_SAFE_INTEGER) &&
          availableNet <= BigInt(Number.MAX_SAFE_INTEGER),
        "money_statement_invalid",
        "The available net funds are outside the supported accounting range.",
      );
      return {
        paymentReference: payment.id,
        currency: payment.currency.toUpperCase(),
        capturedMinor: charge.amount_captured,
        refundedMinor: refunded,
        netMinor: Number(availableNet),
        disputeOpen,
        fetchedAt: new Date(),
        entries,
      };
    });
  }
}

/** Personal request cash retains its exact packet binding. Pool invoice cash
 * uses a separate subclass; it cannot masquerade as a personal packet. */
export class StripeMoneyStatement extends StripeCardMoneyStatement {
  constructor(
    stripe: Stripe,
    private readonly policy: StripeConnectPolicy,
  ) {
    super(stripe, policy);
  }
  protected async assertBinding(payment: Stripe.PaymentIntent) {
    invariant(
      payment.metadata.packet_id,
      "payout_topology_conflict",
      "The captured payment must belong to its original personal packet.",
    );
  }
  protected async allocations(input: {
    payment: Stripe.PaymentIntent;
    capturedMinor: number;
    refundedMinor: number;
    balance: Stripe.Balance;
  }) {
    return this.policy.allocations({
      paymentId: input.payment.id,
      packetId: input.payment.metadata.packet_id!,
      currency: input.payment.currency.toUpperCase(),
      capturedMinor: input.capturedMinor,
      refundedMinor: input.refundedMinor,
      balance: input.balance,
    });
  }
}

/** Current Connect accounts are pre-provisioned under W8's durable onboarding
 * custody. Account creation is deliberately not repeated after an unknown write. */
export class StripeConnectTransfers {
  protected constructor(
    protected readonly stripe: Stripe,
    protected readonly money: StripeCardMoneyStatement,
    protected readonly authority: {
      assertAccount(reference: string): Promise<void>;
      assertTransfer(
        input: Parameters<PayoutProvider["transfer"]>[0],
      ): Promise<void>;
    },
  ) {
    invariant(
      money.usesConnection(stripe),
      "payout_connection_mismatch",
      "Current cash and transfers must use the same approved Stripe connection.",
    );
  }
  async account(id: string) {
    return stripeOperation(async () => {
      await this.authority.assertAccount(id);
      const account = await this.stripe.accounts.retrieve(id);
      invariant(
        account.country,
        "payout_account_incomplete",
        "The payout account needs its verified market.",
      );
      const due = Boolean(
        account.requirements?.disabled_reason ||
          account.requirements?.currently_due?.length ||
          account.requirements?.past_due?.length ||
          account.requirements?.pending_verification?.length,
      );
      return {
        reference: account.id,
        country: account.country,
        enabled:
          account.payouts_enabled &&
          account.capabilities?.transfers === "active",
        detailsDue: due,
      };
    });
  }
  protected async truth(row: Stripe.Transfer) {
    invariant(
      !row.livemode &&
        row.metadata.commerce === "payout" &&
        /^[a-f0-9]{64}$/u.test(row.metadata.commerce_key ?? "") &&
        row.transfer_group === `commerce:${row.metadata.commerce_key}` &&
        /^pi_[A-Za-z0-9]+$/u.test(row.metadata.commerce_payment ?? "") &&
        reference(row.destination) &&
        row.source_transaction &&
        row.balance_transaction &&
        row.amount > 0,
      "payout_reference_invalid",
      "The transfer must belong to this sandbox commerce effect.",
    );
    const reversals = row.amount_reversed
      ? await collect(
          this.stripe.transfers.listReversals(row.id, { limit: 100 }),
        )
      : [];
    invariant(
      reversals.every(
        (r) =>
          Number.isSafeInteger(r.amount) &&
          r.amount > 0 &&
          r.currency === row.currency &&
          reference(r.transfer) === row.id,
      ) &&
        reversals.reduce((n, r) => n + BigInt(r.amount), 0n) ===
          BigInt(row.amount_reversed),
      "payout_reversal_pending",
      "Complete actual transfer reversal receipts are required.",
    );
    return {
      id: row.id,
      amount: row.amount,
      currency: row.currency.toUpperCase(),
      destination: reference(row.destination)!,
      sourcePayment: row.metadata.commerce_payment!,
      sourceTransaction: reference(row.source_transaction)!,
      keyHash: row.metadata.commerce_key!,
      state: "succeeded" as const,
      reversed: row.reversed && row.amount_reversed === row.amount,
      reversalReceipts: reversals.map((r) => ({
        reference: r.id,
        amount: r.amount,
      })),
    };
  }
  async transfer(input: Parameters<PayoutProvider["transfer"]>[0]) {
    return this.transferOriginal(input, true);
  }
  /** Pool allocations may be exact slices of a charge's reviewed net budget.
   * Both paths still require original-effect authority, current cash/account
   * truth and exact original source charge; the default remains whole-net. */
  protected async transferOriginal(
    input: Parameters<PayoutProvider["transfer"]>[0],
    wholeNet: boolean,
  ) {
    return stripeOperation(async () => {
      await this.authority.assertTransfer(input);
      const prior = await this.recoverTransfer(input);
      if (prior) return prior;
      invariant(
        Number.isSafeInteger(input.amount) && input.amount > 0,
        "payout_amount_invalid",
        "A valid available amount is required.",
      );
      const account = await this.account(input.destination);
      invariant(
        account.enabled && !account.detailsDue,
        "payout_account_restricted",
        "The current payout account is restricted.",
      );
      const current = await this.money.current(input.sourcePayment);
      invariant(
        !current.disputeOpen &&
          current.currency === input.currency &&
          (wholeNet
            ? current.netMinor === input.amount
            : current.netMinor >= input.amount),
        "payout_amount_changed",
        "Current funds changed before transfer.",
      );
      const balance = await this.stripe.balance.retrieve();
      invariant(
        !balance.livemode &&
          (balance.available.find(
            (b) => b.currency === input.currency.toLowerCase(),
          )?.source_types?.card ?? 0) >= input.amount,
        "payout_balance_unavailable",
        "Current available card funds do not cover this transfer.",
      );
      const { charge } = await this.money.charge(input.sourcePayment);
      invariant(
        charge.id === input.sourceTransaction,
        "payout_source_changed",
        "The original source charge changed; funds require reconciliation.",
      );
      const key = createHash("sha256").update(input.key).digest("hex");
      await this.authority.assertTransfer(input);
      return this.truth(
        await this.stripe.transfers.create(
          {
            amount: input.amount,
            currency: input.currency.toLowerCase(),
            destination: input.destination,
            source_transaction: input.sourceTransaction,
            transfer_group: `commerce:${key}`,
            metadata: {
              commerce: "payout",
              commerce_key: key,
              commerce_payment: input.sourcePayment,
            },
          },
          { idempotencyKey: input.key },
        ),
      );
    });
  }
  async recoverTransfer(input: Parameters<PayoutProvider["transfer"]>[0]) {
    return stripeOperation(async () => {
      // This authority validates immutable effect/owner terms, not current
      // payout eligibility. Recovery must still discover an already-made
      // transfer when a dispute or account restriction now requires reversal.
      await this.authority.assertTransfer(input);
      const key = createHash("sha256").update(input.key).digest("hex");
      const prior = (
        await collect(
          this.stripe.transfers.list({
            transfer_group: `commerce:${key}`,
            limit: 100,
          }),
        )
      ).filter((t) => t.metadata.commerce_key === key);
      invariant(
        prior.length <= 1,
        "payout_reference_conflict",
        "More than one provider transfer matches this effect.",
      );
      if (!prior[0]) return undefined;
      const row = prior[0];
      invariant(
        row.amount === input.amount &&
          row.currency === input.currency.toLowerCase() &&
          reference(row.destination) === input.destination &&
          reference(row.source_transaction) === input.sourceTransaction &&
          row.transfer_group === `commerce:${key}` &&
          row.metadata.commerce_payment === input.sourcePayment,
        "payout_reference_conflict",
        "The original transfer has different immutable terms.",
      );
      return this.truth(row);
    });
  }
  async current(id: string) {
    return stripeOperation(async () =>
      this.truth(await this.stripe.transfers.retrieve(id)),
    );
  }
  protected async reverseRemaining(id: string, key: string) {
    return stripeOperation(async () => {
      const current = await this.stripe.transfers.retrieve(id);
      await this.truth(current);
      if (current.reversed) return { id, reversed: true };
      await this.stripe.transfers.createReversal(
        id,
        { amount: current.amount - current.amount_reversed },
        { idempotencyKey: key },
      );
      const confirmed = await this.current(id);
      return { id, reversed: confirmed.reversed };
    });
  }
}

export class StripeConnectPayout
  extends StripeConnectTransfers
  implements PayoutProvider
{
  constructor(
    stripe: Stripe,
    money: StripeMoneyStatement,
    private readonly personal: {
      assertAccount(reference: string): Promise<void>;
      assertTransfer(
        input: Parameters<PayoutProvider["transfer"]>[0],
      ): Promise<void>;
      paymentForCommitment(commitmentId: string): Promise<string>;
      onboardingReturnUrl: string;
      onboardingRefreshUrl: string;
    },
  ) {
    super(stripe, money, personal);
    for (const url of [
      personal.onboardingReturnUrl,
      personal.onboardingRefreshUrl,
    ])
      invariant(
        new URL(url).protocol === "https:",
        "onboarding_origin_invalid",
        "Configure the approved HTTPS onboarding return routes.",
      );
  }
  async onboarding(id: string) {
    return stripeOperation(async () => {
      await this.personal.assertAccount(id);
      const link = await this.stripe.accountLinks.create({
        account: id,
        type: "account_onboarding",
        return_url: this.personal.onboardingReturnUrl,
        refresh_url: this.personal.onboardingRefreshUrl,
      });
      return { url: link.url, expiresAt: new Date(link.expires_at * 1000) };
    });
  }
  async reconciledBalance(commitmentId: string) {
    const sourcePayment =
      await this.personal.paymentForCommitment(commitmentId);
    const current = await this.money.current(sourcePayment);
    const { charge } = await this.money.charge(sourcePayment);
    return {
      netMinor: current.netMinor,
      currency: current.currency,
      sourcePayment,
      sourceTransaction: charge.id,
      reconciledAt: current.fetchedAt,
      disputeOpen: current.disputeOpen,
    };
  }
  async reverse(id: string, key: string) {
    return this.reverseRemaining(id, key);
  }
}

/** Configured only with the prepared pool graph's immutable-effect authority.
 * A pool allocation consumes a deterministic original charge slice; it never
 * invents a personal commitment or reconstructs changed funding/destination.
 * The inherited authority must verify this exact journal key/body and approved
 * cycle funding, including receipt ownership/period and net-budget exclusion. */
export class StripePassPoolTransfers
  extends StripeConnectTransfers
  implements PoolTransferProvider
{
  constructor(
    stripe: Stripe,
    money: import("./stripe-pass-pool.js").StripePassPoolMoney,
    authority: {
      assertAccount(reference: string): Promise<void>;
      assertTransfer(
        input: Parameters<PayoutProvider["transfer"]>[0],
      ): Promise<void>;
    },
  ) {
    super(stripe, money, authority);
  }
  override async transfer(input: Parameters<PayoutProvider["transfer"]>[0]) {
    return this.transferOriginal(input, false);
  }
  async reverseOriginal(
    input: import("./pass-pool-journal.js").OriginalPoolReversal,
  ) {
    return stripeOperation(async () => {
      invariant(
        input.key.endsWith(":reverse") &&
          Number.isSafeInteger(input.amount) &&
          input.amount > 0,
        "pool_reversal_invalid",
        "An exact original pool reversal is required.",
      );
      const current = await this.stripe.transfers.retrieve(input.reference);
      const cash = await this.truth(current);
      const originalKey = input.key.slice(0, -":reverse".length);
      invariant(
        cash.keyHash === createHash("sha256").update(originalKey).digest("hex"),
        "pool_reversal_conflict",
        "The reversal belongs to a different original transfer.",
      );
      const original = {
        destination: cash.destination,
        amount: cash.amount,
        currency: cash.currency,
        sourcePayment: cash.sourcePayment,
        sourceTransaction: cash.sourceTransaction,
        key: originalKey,
      };
      await this.authority.assertTransfer(original);
      const hash = createHash("sha256").update(input.key).digest("hex");
      const prior = (
        await collect(
          this.stripe.transfers.listReversals(input.reference, { limit: 100 }),
        )
      ).filter(
        (r) =>
          r.metadata?.commerce === "pool_reversal" &&
          r.metadata.commerce_key === hash,
      );
      invariant(
        prior.length <= 1 &&
          prior.every(
            (r) =>
              reference(r.transfer) === input.reference &&
              r.amount === input.amount &&
              r.metadata?.commerce_transfer === input.reference,
          ),
        "pool_reversal_conflict",
        "Original reversal receipts require reconciliation.",
      );
      if (prior.length || current.reversed) return;
      const age = Date.now() - Date.parse(input.createdAt);
      invariant(
        Number.isFinite(age) && age >= -60000 && age < 23 * 3600000,
        "pool_reversal_aged_unknown",
        "An aged unknown reversal requires original provider evidence before another write.",
      );
      invariant(
        current.amount - current.amount_reversed === input.amount,
        "pool_reversal_amount_changed",
        "The original reversal amount cannot be reconstructed from changed cash.",
      );
      await this.authority.assertTransfer(original);
      await this.stripe.transfers.createReversal(
        input.reference,
        {
          amount: input.amount,
          metadata: {
            commerce: "pool_reversal",
            commerce_key: hash,
            commerce_transfer: input.reference,
          },
        },
        { idempotencyKey: input.key },
      );
    });
  }
}
