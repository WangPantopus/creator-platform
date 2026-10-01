import Stripe from "stripe";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import { contentHash } from "../../core/canonical.js";
import type { Actor } from "../identity/adapter.js";
import type { PoolCycleVerifier, VerifiedPoolCycle } from "./accounting.js";
import type { StripeMembershipBilling } from "./stripe-billing.js";
import { ApprovedStripePass } from "./stripe-pass.js";
import {
  StripeCardMoneyStatement,
  type StripeConnectPolicy,
} from "./stripe-connect.js";
import {
  poolSnapshotHash,
  type OriginalPoolTransfer,
  type PoolFundingAuthority,
} from "./pass-pool-journal.js";

const reference = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
async function collect<T>(list: AsyncIterable<T>) {
  const rows: T[] = [];
  for await (const row of list) {
    invariant(
      rows.length < 1000,
      "pool_history_unavailable",
      "The complete pool history needs reviewed bulk reconciliation. No partial pool was applied.",
    );
    rows.push(row);
  }
  return rows;
}
function period(cycle: string) {
  invariant(
    /^\d{4}-(0[1-9]|1[0-2])$/u.test(cycle),
    "pool_cycle_invalid",
    "A UTC calendar cycle is required.",
  );
  const [year, month] = cycle.split("-").map(Number);
  invariant(
    year! >= 2000,
    "pool_cycle_invalid",
    "A valid purchased calendar cycle is required.",
  );
  const startsAt = Date.UTC(year!, month! - 1, 1) / 1000;
  const endsAt = Date.UTC(year!, month!, 1) / 1000;
  invariant(
    endsAt * 1000 <= Date.now(),
    "pool_cycle_open",
    "The calendar cycle must close before pool settlement.",
  );
  return { startsAt, endsAt };
}
export type VerifiedPoolInvoice = Readonly<{
  cycle: string;
  accountId: string;
  subscriptionReference: string;
  invoiceReference: string;
  lineReference: string;
  sourcePayment: string;
  startsAt: number;
  endsAt: number;
  paidMinor: number;
  refundedMinor: number;
  held: boolean;
  slotCapacity: number;
}>;
export interface StripePassPoolCashPolicy
  extends Pick<
    StripeConnectPolicy,
    "topology" | "collectionAccount" | "processingFees"
  > {
  version: string;
  /** Explicit approved fees/tax/provider reserve allocation for this invoice.
   * No packet identifier or synthetic personal commitment is accepted. */
  allocations(input: {
    invoice: VerifiedPoolInvoice;
    currency: string;
    capturedMinor: number;
    refundedMinor: number;
    balance: Stripe.Balance;
  }): ReturnType<StripeConnectPolicy["allocations"]>;
  /** Exact reviewed first-cycle/net-pool economics. Taxes/platform take and
   * reserved/adjusted funds must be excluded; there is no implicit percentage. */
  poolBudget(input: {
    invoice: VerifiedPoolInvoice;
    currency: string;
    availableNetMinor: number;
    disputeOpen: boolean;
  }): Promise<bigint>;
}

/** Genuine platform pass invoice cash. Its binding is verified independently
 * of personal packets, using the existing paged Billing cash/refund allocator.
 * The authority is W8's current purpose-bound invoice ownership capability. */
export class StripePassPoolMoney extends StripeCardMoneyStatement {
  private readonly approved: z.infer<typeof ApprovedStripePass>;
  constructor(
    stripe: Stripe,
    approved: unknown,
    private readonly receipts: StripeMembershipBilling,
    private readonly policy: StripePassPoolCashPolicy,
    private readonly assertInvoice: (
      invoice: VerifiedPoolInvoice,
    ) => Promise<void>,
  ) {
    super(stripe, policy);
    this.approved = ApprovedStripePass.parse(approved);
    invariant(
      receipts.usesConnection(stripe, "platform") &&
        policy.version.length > 0 &&
        policy.version.length <= 100,
      "pool_receipt_connection_mismatch",
      "Pool receipts require the same approved platform connection and policy version.",
    );
  }
  get policyVersion() {
    return this.policy.version;
  }
  async invoice(invoiceReference: string): Promise<VerifiedPoolInvoice> {
    invariant(
      /^in_[A-Za-z0-9]+$/u.test(invoiceReference),
      "pool_invoice_invalid",
      "An original invoice reference is required.",
    );
    const invoice = await this.stripe.invoices.retrieve(invoiceReference);
    const subscriptionReference = reference(
      invoice.parent?.subscription_details?.subscription,
    );
    invariant(
      !invoice.livemode &&
        invoice.status === "paid" &&
        invoice.parent?.type === "subscription_details" &&
        subscriptionReference,
      "pool_invoice_unconfirmed",
      "An actual paid sandbox pass invoice is required.",
    );
    const subscription = await this.stripe.subscriptions.retrieve(
      subscriptionReference,
    );
    const originalMetadata = invoice.parent?.subscription_details?.metadata;
    const accountId = subscription.metadata.commerce_account_id;
    const customerId = reference(subscription.customer);
    invariant(
      !subscription.livemode &&
        z.uuid().safeParse(accountId).success &&
        customerId &&
        subscription.metadata.commerce_pass_catalog_key === this.approved.key &&
        subscription.metadata.commerce_pass_terms_version ===
          this.approved.termsVersion &&
        originalMetadata &&
        originalMetadata.commerce_account_id === accountId &&
        originalMetadata.commerce_pass_catalog_key === this.approved.key &&
        originalMetadata.commerce_pass_terms_version ===
          this.approved.termsVersion &&
        subscription.billing_mode.type === "classic" &&
        reference(invoice.customer) === customerId &&
        invoice.currency.toUpperCase() === this.approved.currency,
      "pool_invoice_binding_invalid",
      "The invoice must match its original account and approved pass terms.",
    );
    const customer = await this.stripe.customers.retrieve(customerId);
    invariant(
      !customer.deleted &&
        !customer.livemode &&
        customer.metadata.commerce_account_id === accountId,
      "pool_invoice_account_mismatch",
      "Current invoice customer ownership must reconcile.",
    );
    const lines = await collect(
      this.stripe.invoices.listLineItems(invoice.id, { limit: 100 }),
    );
    const line = lines[0];
    invariant(
      lines.length === 1 &&
        line &&
        line.quantity === 1 &&
        /^1(?:\.0+)?$/u.test(String(line.quantity_decimal ?? line.quantity)) &&
        line.parent?.type === "subscription_item_details" &&
        line.parent.subscription_item_details?.subscription ===
          subscription.id &&
        line.pricing?.type === "price_details" &&
        line.parent?.subscription_item_details?.subscription_item &&
        reference(line.pricing?.price_details?.price) ===
          this.approved.priceReference &&
        line.period.start < line.period.end,
      "pool_invoice_terms_invalid",
      "Only a complete single-product pass invoice may fund this pool policy.",
    );
    const price = await this.stripe.prices.retrieve(
      this.approved.priceReference,
    );
    invariant(
      !price.livemode &&
        reference(price.product) === this.approved.productReference &&
        price.currency.toUpperCase() === this.approved.currency &&
        price.unit_amount === this.approved.monthlyAmount &&
        price.recurring?.interval === "month" &&
        price.recurring.interval_count === 1 &&
        price.recurring.usage_type === "licensed",
      "pool_invoice_terms_invalid",
      "The original invoice price must match the approved monthly pass product.",
    );
    const starts = new Date(line.period.start * 1000);
    const cycle = `${starts.getUTCFullYear()}-${String(starts.getUTCMonth() + 1).padStart(2, "0")}`;
    const bounds = period(cycle);
    invariant(
      line.period.start >= bounds.startsAt && line.period.end === bounds.endsAt,
      "pool_invoice_calendar_invalid",
      "Original pass cash must cover the reviewed UTC calendar period.",
    );
    const confirmed = await this.receipts.confirmedInvoice(invoice, lines);
    const paidMinor = confirmed.cash.values.get(line.id)!;
    const refundedMinor = (
      confirmed.adjustments.refunds.get(line.id) ?? []
    ).reduce((sum, r) => sum + r.amount, 0);
    invariant(
      Number.isSafeInteger(paidMinor) &&
        paidMinor > 0 &&
        Number.isSafeInteger(refundedMinor) &&
        refundedMinor <= paidMinor,
      "pool_invoice_cash_invalid",
      "Complete actual invoice cash and adjustments are required.",
    );
    const binding: VerifiedPoolInvoice = {
      cycle,
      accountId: accountId!,
      subscriptionReference,
      invoiceReference: invoice.id,
      lineReference: line.id,
      sourcePayment: confirmed.cash.paymentId,
      startsAt: line.period.start,
      endsAt: line.period.end,
      paidMinor,
      refundedMinor,
      held: confirmed.adjustments.held.has(line.id),
      slotCapacity: this.approved.slotCapacity,
    };
    await this.assertInvoice(binding);
    return binding;
  }
  private async paymentBinding(payment: Stripe.PaymentIntent) {
    invariant(
      !payment.metadata.packet_id,
      "pool_personal_payment_conflict",
      "Personal packet cash cannot fund a pass pool.",
    );
    const links = await collect(
      this.stripe.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: payment.id },
        limit: 100,
      }),
    );
    invariant(
      links.length === 1 &&
        links[0]?.status === "paid" &&
        reference(links[0].invoice),
      "pool_payment_binding_invalid",
      "The complete original invoice/payment mapping is required.",
    );
    const binding = await this.invoice(reference(links[0]!.invoice)!);
    invariant(
      binding.sourcePayment === payment.id &&
        payment.amount_received === binding.paidMinor,
      "pool_payment_binding_invalid",
      "The original payment must fund exactly this pass invoice.",
    );
    return binding;
  }
  protected async assertBinding(payment: Stripe.PaymentIntent) {
    await this.paymentBinding(payment);
  }
  protected async allocations(input: {
    payment: Stripe.PaymentIntent;
    capturedMinor: number;
    refundedMinor: number;
    balance: Stripe.Balance;
  }) {
    const invoice = await this.paymentBinding(input.payment);
    return this.policy.allocations({
      invoice,
      currency: input.payment.currency.toUpperCase(),
      capturedMinor: input.capturedMinor,
      refundedMinor: input.refundedMinor,
      balance: input.balance,
    });
  }
  override async current(paymentId: string) {
    const current = await super.current(paymentId);
    const binding = await this.paymentBinding(
      await this.stripe.paymentIntents.retrieve(paymentId),
    );
    invariant(
      !binding.held,
      "pool_funding_held",
      "Adjusted pass invoice cash remains held for reviewed reconciliation.",
    );
    return current;
  }
  async funding(invoiceReference: string) {
    const invoice = await this.invoice(invoiceReference);
    const current = await super.current(invoice.sourcePayment);
    const { charge } = await this.charge(invoice.sourcePayment);
    invariant(
      current.entries.every(
        (e) =>
          !e.reference.startsWith("pending:") ||
          e.kind !== "reserve" ||
          current.entries.some(
            (release) =>
              release.kind === "reserve_release" &&
              release.reference === e.reference &&
              release.amount === e.amount,
          ),
      ),
      "pool_funding_pending",
      "The pool remains processing until its original charge funds are available.",
    );
    const latestInvoice = await this.invoice(invoiceReference);
    invariant(
      contentHash(invoice) === contentHash(latestInvoice),
      "pool_invoice_changed",
      "Invoice adjustments changed during pool reconciliation. No partial snapshot was applied.",
    );
    const poolMinor = await this.policy.poolBudget({
      invoice,
      currency: current.currency,
      availableNetMinor: current.netMinor,
      disputeOpen: current.disputeOpen,
    });
    invariant(
      poolMinor >= 0n &&
        poolMinor <= BigInt(Math.max(0, current.netMinor)) &&
        ((!invoice.held && !current.disputeOpen) || poolMinor === 0n),
      "pool_budget_invalid",
      "Only approved current available unheld invoice funds may enter the pool.",
    );
    return {
      invoice,
      sourceTransaction: charge.id,
      currency: current.currency,
      poolMinor,
      held: invoice.held || current.disputeOpen,
      reconciledAt: current.fetchedAt,
    };
  }
}

export type PoolSlotInterval = Readonly<{
  id: string;
  creatorId: string;
  position: number;
  startsAt: number;
  endsAt: number;
}>;
export type PassPoolPopulation = Readonly<{
  cycle: string;
  sourceReference: string;
  authorityReference: string;
  periods: readonly Readonly<{
    accountId: string;
    subscriptionReference: string;
    invoiceReference: string;
    /** Canonical original eligible intervals after reviewed unavailability and refund rules. */
    slots: readonly PoolSlotInterval[];
  }>[];
}>;
export interface PassPoolPopulationSource {
  /** W8 must prove the full accepted pass/slot population with current exact
   * job/purpose/lease authority. An ordinary RLS-filtered fan query is invalid.
   * Retain original paid periods after cancellation/refund; changed current
   * funding is reconciled from those originals, never from dropped history.
   * sourceReference is the immutable population cause, not a changing lease.
   * No caller JSON, fabricated actor, or unreviewed global privilege is allowed. */
  snapshot(cycle: string): Promise<PassPoolPopulation>;
  assertCurrent(population: PassPoolPopulation): Promise<void>;
  currentDestination(actor: Actor, creatorId: string): Promise<string>;
}

/** Owner-side verifier consumes genuine invoice truth and canonical complete
 * slot intervals. Population authorization remains an injected W8 capability;
 * no global query or scope issuer is created here. */
export class StripePassPoolFunding
  implements PoolCycleVerifier, PoolFundingAuthority
{
  constructor(
    private readonly money: StripePassPoolMoney,
    private readonly source: PassPoolPopulationSource,
  ) {}
  async current(cycle: string): Promise<VerifiedPoolCycle>;
  async current(
    actor: Actor,
    original: OriginalPoolTransfer,
  ): ReturnType<PoolFundingAuthority["current"]>;
  async current(
    input: string | Actor,
    original?: OriginalPoolTransfer,
  ): Promise<
    VerifiedPoolCycle | Awaited<ReturnType<PoolFundingAuthority["current"]>>
  > {
    if (typeof input !== "string") {
      invariant(
        original,
        "pool_original_required",
        "The original pool effect is required.",
      );
      const truth = await this.cycle(original.cycle);
      const destination = await this.source.currentDestination(
        input,
        original.creatorId,
      );
      const funding = truth.funding.find(
        (f) => f.sourceTransaction === original.transfer.sourceTransaction,
      );
      return {
        state:
          poolSnapshotHash(truth) === original.snapshotHash &&
          funding &&
          funding.sourcePayment === original.transfer.sourcePayment &&
          destination === original.transfer.destination
            ? "eligible"
            : "held",
        snapshotHash: poolSnapshotHash(truth),
        destination,
        sourcePayment:
          funding?.sourcePayment ?? original.transfer.sourcePayment,
        sourceTransaction:
          funding?.sourceTransaction ?? original.transfer.sourceTransaction,
        reconciledAt: truth.reconciledAt,
      };
    }
    return this.cycle(input);
  }
  private async cycle(cycle: string): Promise<VerifiedPoolCycle> {
    const bounds = period(cycle);
    const population = await this.source.snapshot(cycle);
    invariant(
      population.periods.length <= 1000 &&
        population.periods.reduce((sum, p) => sum + p.slots.length, 0) <= 10000,
      "pool_history_unavailable",
      "The complete pool population needs reviewed bulk reconciliation. No partial pool was applied.",
    );
    const populationHash = contentHash(population);
    await this.source.assertCurrent(population);
    invariant(
      population.cycle === cycle &&
        population.periods.length <= 1000 &&
        population.sourceReference.length > 0 &&
        population.sourceReference.length <= 200 &&
        population.authorityReference.length > 0 &&
        new Set(population.periods.map((p) => p.invoiceReference)).size ===
          population.periods.length,
      "pool_population_invalid",
      "A complete authorized immutable pass population is required.",
    );
    const weights = new Map<string, bigint>();
    const funding: VerifiedPoolCycle["funding"][number][] = [];
    const periods = new Map<string, { start: number; end: number }[]>();
    const ids = new Set<string>();
    let currency: string | undefined;
    let reconciledAt = new Date();
    for (const purchased of population.periods) {
      const verified = await this.money.funding(purchased.invoiceReference);
      const invoice = verified.invoice;
      if (verified.reconciledAt < reconciledAt)
        reconciledAt = verified.reconciledAt;
      invariant(
        invoice.cycle === cycle &&
          invoice.accountId === purchased.accountId &&
          invoice.subscriptionReference === purchased.subscriptionReference &&
          (!currency || currency === verified.currency),
        "pool_population_binding_invalid",
        "Every pool period must match its actual purchased invoice and account.",
      );
      currency = verified.currency;
      const history = periods.get(purchased.accountId) ?? [];
      invariant(
        verified.held ||
          !history.some(
            (p) => p.start < invoice.endsAt && p.end > invoice.startsAt,
          ),
        "pool_period_overlap",
        "Replacement purchases cannot double-count an account's funded calendar time.",
      );
      if (!verified.held)
        history.push({ start: invoice.startsAt, end: invoice.endsAt });
      periods.set(purchased.accountId, history);
      invariant(
        purchased.slots.length <= 1000,
        "pool_population_invalid",
        "The complete slot population requires reviewed bulk reconciliation.",
      );
      const slots: PoolSlotInterval[] = [];
      for (const slot of purchased.slots) {
        invariant(
          z.uuid().safeParse(slot.id).success &&
            !ids.has(slot.id) &&
            z.uuid().safeParse(slot.creatorId).success &&
            slot.creatorId === slot.creatorId.toLowerCase() &&
            Number.isSafeInteger(slot.position) &&
            slot.position >= 0 &&
            slot.position < invoice.slotCapacity &&
            [slot.startsAt, slot.endsAt].every(Number.isSafeInteger) &&
            slot.startsAt >= Math.max(bounds.startsAt, invoice.startsAt) &&
            slot.endsAt <= invoice.endsAt &&
            slot.endsAt > slot.startsAt &&
            !slots.some(
              (s) =>
                (s.position === slot.position ||
                  s.creatorId === slot.creatorId) &&
                s.startsAt < slot.endsAt &&
                s.endsAt > slot.startsAt,
            ),
          "pool_slot_overlap",
          "Original funded slot intervals cannot overlap, repeat or exceed their purchased period.",
        );
        ids.add(slot.id);
        slots.push(slot);
        if (!verified.held)
          weights.set(
            slot.creatorId,
            (weights.get(slot.creatorId) ?? 0n) +
              BigInt(slot.endsAt - slot.startsAt),
          );
      }
      if (verified.poolMinor > 0n)
        funding.push({
          sourcePayment: invoice.sourcePayment,
          sourceTransaction: verified.sourceTransaction,
          poolMinor: verified.poolMinor,
        });
    }
    await this.source.assertCurrent(population);
    invariant(
      contentHash(population) === populationHash,
      "pool_population_changed",
      "The original population changed during provider reconciliation.",
    );
    invariant(
      currency,
      "pool_empty",
      "No actual purchased invoice population is available for settlement.",
    );
    return {
      cycle,
      currency,
      poolMinor: funding.reduce((sum, f) => sum + f.poolMinor, 0n),
      weights: [...weights].map(([creatorId, slotSeconds]) => ({
        creatorId,
        slotSeconds,
      })),
      funding,
      policyVersion: this.money.policyVersion,
      sourceReference: population.sourceReference,
      reconciledAt,
    };
  }
}
