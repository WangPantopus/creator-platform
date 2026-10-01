import Stripe from "stripe";
import { createHash } from "node:crypto";
import { invariant } from "../../core/errors.js";
import { stripeOperation } from "../payments/stripe.js";
import type {
  BillingTruth,
  MembershipBillingProvider,
  PaidMembershipLine,
} from "./billing.js";

type TierBinding = { tierId: string; creatorId: string };
const reference = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
async function collect<T>(
  items: AsyncIterable<T>,
  maximum = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for await (const item of items) {
    invariant(
      rows.length < maximum,
      "provider_page_limit",
      "The current billing history needs a larger reconciliation job. No partial result was applied.",
    );
    rows.push(item);
  }
  return rows;
}

/** A consolidated subscription belongs to one explicitly approved collection
 * account. Connect allocation/payout remains a separate confirmed-ledger step.
 * Mixed tender/negative credits require the reviewed allocation policy; they
 * fail closed rather than becoming refundable card cash. */
export class StripeMembershipBilling implements MembershipBillingProvider {
  private readonly options: Stripe.RequestOptions;
  constructor(
    private readonly stripe: Stripe,
    private readonly tierForPrice: (priceId: string) => Promise<TierBinding>,
    collectionAccount: "platform" | string,
  ) {
    invariant(
      collectionAccount === "platform" ||
        /^acct_[A-Za-z0-9]+$/u.test(collectionAccount),
      "billing_topology_required",
      "Configure the approved billing collection account.",
    );
    this.options =
      collectionAccount === "platform"
        ? {}
        : { stripeAccount: collectionAccount };
  }
  private async items(subscriptionId: string) {
    return collect(
      this.stripe.subscriptionItems.list(
        { subscription: subscriptionId, limit: 100 },
        this.options,
      ),
    );
  }
  private async price(priceId: string) {
    const price = await this.stripe.prices.retrieve(
      priceId,
      { expand: ["product"] },
      this.options,
    );
    invariant(
      !price.livemode &&
        price.active &&
        price.type === "recurring" &&
        price.recurring?.interval === "month" &&
        price.recurring.interval_count === 1 &&
        price.recurring.usage_type === "licensed" &&
        price.unit_amount !== null &&
        Number.isSafeInteger(price.unit_amount) &&
        price.unit_amount > 0 &&
        typeof price.product !== "string" &&
        !price.product.deleted &&
        price.product.active,
      "membership_price_invalid",
      "The approved monthly sandbox membership product is unavailable.",
    );
    return price;
  }
  async start(input: Parameters<MembershipBillingProvider["start"]>[0]) {
    return stripeOperation(async () => {
      const key = createHash("sha256").update(input.key).digest("hex");
      const price = await this.price(input.priceReference);
      await this.tierForPrice(price.id);
      const customerId =
        input.customerReference ??
        (
          await this.stripe.customers.create(
            {
              metadata: {
                commerce_account_id: input.accountId,
                commerce_fan_id: input.fanId,
                commerce_key: key,
              },
            },
            { ...this.options, idempotencyKey: `${input.key}:customer` },
          )
        ).id;
      const customer = await this.stripe.customers.retrieve(
        customerId,
        {},
        this.options,
      );
      invariant(
        !customer.deleted &&
          !customer.livemode &&
          customer.metadata.commerce_account_id === input.accountId &&
          customer.metadata.commerce_fan_id === input.fanId,
        "billing_link_conflict",
        "The billing customer belongs to another account.",
      );
      const method = await this.stripe.paymentMethods.retrieve(
        input.paymentMethodId,
        {},
        this.options,
      );
      invariant(
        !method.livemode &&
          method.type === "card" &&
          (!method.customer || reference(method.customer) === customerId),
        "billing_method_conflict",
        "Use a card belonging to this billing account.",
      );
      if (!method.customer)
        await this.stripe.paymentMethods.attach(
          method.id,
          { customer: customerId },
          { ...this.options, idempotencyKey: `${input.key}:attach` },
        );
      let subscription: Stripe.Subscription;
      if (input.subscriptionReference) {
        const current = await this.stripe.subscriptions.retrieve(
          input.subscriptionReference,
          {},
          this.options,
        );
        const items = await this.items(current.id);
        invariant(
          !current.livemode &&
            reference(current.customer) === customerId &&
            current.metadata.commerce_account_id === input.accountId &&
            current.currency === price.currency &&
            current.billing_mode.type === "classic" &&
            current.status === "active" &&
            !current.schedule &&
            !current.cancel_at_period_end &&
            !current.pending_update &&
            items.every(
              (item) =>
                item.price.recurring?.interval === "month" &&
                item.price.recurring.interval_count === 1 &&
                item.price.id !== price.id,
            ),
          "billing_change_unavailable",
          "Reconcile the current consolidated monthly subscription before adding this membership.",
        );
        // The pending-update endpoint accepts invoice-affecting fields only.
        // Bind the method separately so an incomplete payment retains its
        // existing memberships while the new item awaits confirmation.
        await this.stripe.subscriptions.update(
          current.id,
          { default_payment_method: method.id },
          { ...this.options, idempotencyKey: `${input.key}:method` },
        );
        subscription = await this.stripe.subscriptions.update(
          current.id,
          {
            items: [{ price: price.id, quantity: 1 }],
            proration_behavior: "always_invoice",
            payment_behavior: "pending_if_incomplete",
            metadata: { commerce_key: key },
            expand: ["latest_invoice.confirmation_secret"],
          },
          { ...this.options, idempotencyKey: `${input.key}:subscription` },
        );
      } else {
        subscription = await this.stripe.subscriptions.create(
          {
            customer: customerId,
            items: [{ price: price.id, quantity: 1 }],
            default_payment_method: method.id,
            collection_method: "charge_automatically",
            payment_behavior: "default_incomplete",
            payment_settings: {
              payment_method_types: ["card"],
              save_default_payment_method: "on_subscription",
            },
            billing_mode: { type: "classic" },
            metadata: {
              commerce_account_id: input.accountId,
              commerce_fan_id: input.fanId,
              commerce_key: key,
            },
            expand: ["latest_invoice.confirmation_secret"],
          },
          { ...this.options, idempotencyKey: `${input.key}:subscription` },
        );
      }
      return this.truth(subscription);
    });
  }
  async recoverStart(input: Parameters<MembershipBillingProvider["start"]>[0]) {
    return stripeOperation(async () => {
      const key = createHash("sha256").update(input.key).digest("hex");
      let subscription: Stripe.Subscription | undefined;
      if (input.subscriptionReference) {
        const current = await this.stripe.subscriptions.retrieve(
          input.subscriptionReference,
          { expand: ["latest_invoice.confirmation_secret"] },
          this.options,
        );
        if (current.metadata.commerce_key !== key) return undefined;
        subscription = current;
      } else {
        let customerId = input.customerReference;
        if (!customerId) {
          const customers = (
            await collect(
              this.stripe.customers.list({ limit: 100 }, this.options),
            )
          ).filter((c) => c.metadata.commerce_key === key);
          invariant(
            customers.length <= 1,
            "billing_reference_conflict",
            "More than one customer matches the original billing effect.",
          );
          if (!customers[0]) return undefined;
          invariant(
            !customers[0].livemode &&
              customers[0].metadata.commerce_account_id === input.accountId &&
              customers[0].metadata.commerce_fan_id === input.fanId,
            "billing_link_conflict",
            "The original customer belongs to another account.",
          );
          customerId = customers[0].id;
        }
        const matches = (
          await collect(
            this.stripe.subscriptions.list(
              { customer: customerId, status: "all", limit: 100 },
              this.options,
            ),
          )
        ).filter((s) => s.metadata.commerce_key === key);
        invariant(
          matches.length <= 1,
          "billing_reference_conflict",
          "More than one subscription matches the original billing effect.",
        );
        if (!matches[0]) return undefined;
        subscription = await this.stripe.subscriptions.retrieve(
          matches[0].id,
          { expand: ["latest_invoice.confirmation_secret"] },
          this.options,
        );
      }
      const items = await this.items(subscription.id);
      invariant(
        !subscription.livemode &&
          subscription.metadata.commerce_account_id === input.accountId &&
          subscription.metadata.commerce_fan_id === input.fanId &&
          subscription.metadata.commerce_key === key &&
          (!input.customerReference ||
            reference(subscription.customer) === input.customerReference) &&
          (items.some((i) => i.price.id === input.priceReference) ||
            subscription.pending_update?.subscription_items?.some(
              (i) => reference(i.price) === input.priceReference,
            )),
        "billing_reference_conflict",
        "The original subscription no longer matches its immutable billing terms.",
      );
      return this.truth(subscription);
    });
  }
  async current(subscriptionId: string) {
    return stripeOperation(async () =>
      this.truth(
        await this.stripe.subscriptions.retrieve(
          subscriptionId,
          { expand: ["latest_invoice.confirmation_secret"] },
          this.options,
        ),
      ),
    );
  }
  private lineCash(line: Stripe.InvoiceLineItem) {
    const pretax = line.pretax_credit_amounts?.length
      ? line.pretax_credit_amounts.reduce(
          (sum, credit) => sum + BigInt(credit.amount),
          0n,
        )
      : (line.discount_amounts ?? []).reduce(
          (sum, discount) => sum + BigInt(discount.amount),
          0n,
        );
    const taxes = (line.taxes ?? [])
      .filter((tax) => tax.tax_behavior === "exclusive")
      .reduce((sum, tax) => sum + BigInt(tax.amount), 0n);
    const net = BigInt(line.subtotal) - pretax + taxes;
    invariant(
      net >= 0n && net <= BigInt(Number.MAX_SAFE_INTEGER),
      "cash_allocation_unavailable",
      "This invoice needs reviewed credit allocation before refundable cash can be recorded.",
    );
    return Number(net);
  }
  private async invoiceCash(
    invoice: Stripe.Invoice,
    currentLines?: Stripe.InvoiceLineItem[],
  ) {
    const lines =
      currentLines ??
      (await collect(
        this.stripe.invoices.listLineItems(
          invoice.id,
          { limit: 100 },
          this.options,
        ),
      ));
    const payments = await collect(
      this.stripe.invoicePayments.list(
        { invoice: invoice.id, limit: 100 },
        this.options,
      ),
    );
    const paid = payments.filter((payment) => payment.status === "paid");
    invariant(
      !invoice.livemode &&
        invoice.status === "paid" &&
        invoice.amount_remaining === 0 &&
        invoice.amount_paid === invoice.total &&
        invoice.amount_due === invoice.total &&
        invoice.starting_balance === 0 &&
        !invoice.amount_paid_off_stripe &&
        !invoice.amount_overpaid &&
        !invoice.pre_payment_credit_notes_amount &&
        paid.length === 1 &&
        paid[0]!.payment.type === "payment_intent" &&
        paid[0]!.amount_paid === invoice.total &&
        paid[0]!.currency === invoice.currency,
      "cash_allocation_unavailable",
      "Mixed payments or invoice credits need reviewed cash allocation; no list-price receipt was created.",
    );
    const paymentId = reference(paid[0]!.payment.payment_intent);
    invariant(
      paymentId,
      "cash_payment_unavailable",
      "The invoice has no verified card payment.",
    );
    const intent = await this.stripe.paymentIntents.retrieve(
      paymentId,
      { expand: ["latest_charge"] },
      this.options,
    );
    const charge = intent.latest_charge;
    invariant(
      !intent.livemode &&
        intent.status === "succeeded" &&
        intent.currency === invoice.currency &&
        reference(intent.customer) === reference(invoice.customer) &&
        intent.amount_received >= invoice.total &&
        charge &&
        typeof charge !== "string" &&
        charge.paid &&
        charge.payment_method_details?.type === "card",
      "cash_payment_unavailable",
      "Current card payment truth is required for this receipt.",
    );
    const values = new Map(lines.map((line) => [line.id, this.lineCash(line)]));
    invariant(
      [...values.values()].reduce((sum, amount) => sum + BigInt(amount), 0n) ===
        BigInt(invoice.total),
      "cash_allocation_unavailable",
      "Invoice line cash does not reconcile with the actual payment.",
    );
    return { lines, values, paymentId, refunded: charge.amount_refunded };
  }
  private async invoiceRefunds(
    invoice: Stripe.Invoice,
    cash: Awaited<ReturnType<StripeMembershipBilling["invoiceCash"]>>,
  ) {
    const notes = await collect(
      this.stripe.creditNotes.list(
        { invoice: invoice.id, limit: 100 },
        this.options,
      ),
    );
    const refunds = new Map<
      string,
      NonNullable<PaidMembershipLine["refunds"]>[number][]
    >();
    const held = new Set<string>();
    let confirmed = 0n;
    for (const note of notes) {
      if (note.status === "void") continue;
      const lines = await collect(
        this.stripe.creditNotes.listLineItems(
          note.id,
          { limit: 100 },
          this.options,
        ),
      );
      const amounts = lines.map((line) => ({
        id: line.invoice_line_item,
        amount:
          line.amount -
          (line.pretax_credit_amounts?.length
            ? line.pretax_credit_amounts.reduce(
                (sum, credit) => sum + credit.amount,
                0,
              )
            : line.discount_amount) +
          (line.taxes ?? [])
            .filter((tax) => tax.tax_behavior === "exclusive")
            .reduce((sum, tax) => sum + tax.amount, 0),
      }));
      // Any adjustment suspends affected access while its cash/credit policy is
      // reconciled. Balance credits or unattributed refunds are never card cash.
      for (const line of amounts) {
        if (line.id && cash.values.has(line.id)) held.add(line.id);
        else for (const id of cash.values.keys()) held.add(id);
      }
      const linked = await Promise.all(
        note.refunds.map(async (linked) => ({
          amount: linked.amount_refunded,
          refund:
            linked.type === "refund"
              ? await this.stripe.refunds.retrieve(
                  reference(linked.refund)!,
                  {},
                  this.options,
                )
              : undefined,
        })),
      );
      const actualCash =
        !note.livemode &&
        note.currency === invoice.currency &&
        reference(note.invoice) === invoice.id &&
        note.pre_payment_amount === 0 &&
        note.post_payment_amount === note.amount &&
        !note.customer_balance_transaction &&
        !note.out_of_band_amount &&
        linked.reduce((sum, item) => sum + BigInt(item.amount), 0n) ===
          BigInt(note.amount) &&
        linked.every(
          (item) =>
            item.refund?.status === "succeeded" &&
            reference(item.refund.payment_intent) === cash.paymentId &&
            item.refund.currency === invoice.currency,
        ) &&
        amounts.every(
          (line) =>
            line.id &&
            cash.values.has(line.id) &&
            Number.isSafeInteger(line.amount) &&
            line.amount >= 0,
        ) &&
        amounts.reduce((sum, line) => sum + BigInt(line.amount), 0n) ===
          BigInt(note.amount);
      if (!actualCash) continue;
      confirmed += BigInt(note.amount);
      for (const line of amounts) {
        if (!line.amount) continue;
        const id = line.id!;
        refunds.set(id, [
          ...(refunds.get(id) ?? []),
          {
            reference: note.id,
            cause: `credit_note:${note.id}:${id}`,
            amount: line.amount,
          },
        ]);
      }
    }
    // A dashboard refund without a line-linked credit note cannot be allocated
    // across memberships. Suspend access until its reviewed allocation exists.
    if (BigInt(cash.refunded) !== confirmed)
      for (const id of cash.values.keys()) held.add(id);
    return { refunds, held };
  }
  private async truth(
    subscription: Stripe.Subscription,
  ): Promise<BillingTruth> {
    const customerId = reference(subscription.customer);
    invariant(
      !subscription.livemode &&
        customerId &&
        subscription.metadata.commerce_account_id &&
        subscription.billing_mode.type === "classic",
      "billing_link_conflict",
      "Current sandbox billing ownership is incomplete.",
    );
    const customer = await this.stripe.customers.retrieve(
      customerId,
      {},
      this.options,
    );
    invariant(
      !customer.deleted &&
        customer.metadata.commerce_account_id ===
          subscription.metadata.commerce_account_id,
      "billing_link_conflict",
      "Subscription ownership does not match the current customer.",
    );
    const items = await this.items(subscription.id);
    invariant(
      items.every(
        (item) =>
          item.quantity === 1 &&
          item.price.currency === subscription.currency &&
          item.price.recurring?.interval === "month" &&
          item.price.recurring.interval_count === 1,
      ),
      "billing_catalog_mismatch",
      "Only configured same-currency monthly memberships belong to this consolidated subscription.",
    );
    const invoices = items.length
      ? await collect(
          this.stripe.invoices.list(
            {
              subscription: subscription.id,
              created: {
                gte:
                  Math.min(...items.map((item) => item.current_period_start)) -
                  86400,
              },
              limit: 100,
            },
            this.options,
          ),
        )
      : [];
    const receipts = new Map<
      string,
      {
        invoice: Stripe.Invoice;
        line: Stripe.InvoiceLineItem;
        paidMinor: number;
        paymentId: string;
        refunds: NonNullable<PaidMembershipLine["refunds"]>;
        adjustment: boolean;
      }
    >();
    for (const invoice of invoices) {
      if (invoice.status !== "paid") continue;
      const currentLines = await collect(
        this.stripe.invoices.listLineItems(
          invoice.id,
          { limit: 100 },
          this.options,
        ),
      );
      const matches = (line: Stripe.InvoiceLineItem) =>
        items.find(
          (item) =>
            item.id ===
              line.parent?.subscription_item_details?.subscription_item &&
            item.price.id === reference(line.pricing?.price_details?.price) &&
            line.period.end === item.current_period_end &&
            line.period.start >= item.current_period_start,
        );
      if (!currentLines.some(matches)) continue;
      const cash = await this.invoiceCash(invoice, currentLines);
      const adjustments = await this.invoiceRefunds(invoice, cash);
      for (const line of cash.lines) {
        const item = matches(line);
        if (!item) continue;
        invariant(
          !receipts.has(item.id),
          "billing_period_ambiguous",
          "Multiple current-period invoice lines require reviewed billing reconciliation.",
        );
        receipts.set(item.id, {
          invoice,
          line,
          paidMinor: cash.values.get(line.id)!,
          paymentId: cash.paymentId,
          refunds: adjustments.refunds.get(line.id) ?? [],
          adjustment: adjustments.held.has(line.id),
        });
      }
    }
    const scheduleId = reference(subscription.schedule);
    const schedule = scheduleId
      ? await this.stripe.subscriptionSchedules.retrieve(
          scheduleId,
          {},
          this.options,
        )
      : undefined;
    const lines: PaidMembershipLine[] = [];
    for (const item of items) {
      const binding = await this.tierForPrice(item.price.id);
      const receipt = receipts.get(item.id);
      const nextPhase = schedule?.phases.find(
        (phase) => phase.start_date === item.current_period_end,
      );
      const cancelAtEnd =
        subscription.cancel_at_period_end ||
        Boolean(
          nextPhase &&
            !nextPhase.items.some(
              (next) => reference(next.price) === item.price.id,
            ),
        ) ||
        Boolean(
          schedule?.end_behavior === "cancel" &&
            schedule.current_phase?.end_date === item.current_period_end &&
            !nextPhase,
        );
      const refunded =
        receipt?.refunds.reduce(
          (sum, refund) => sum + BigInt(refund.amount),
          0n,
        ) ?? 0n;
      const active =
        subscription.status === "active" &&
        Boolean(receipt) &&
        !receipt?.adjustment;
      lines.push({
        itemReference: item.id,
        ...binding,
        priceReference: item.price.id,
        startsAt: new Date(
          (receipt?.line.period.start ?? item.current_period_start) * 1000,
        ),
        endsAt: new Date(item.current_period_end * 1000),
        state:
          receipt &&
          refunded >= BigInt(receipt.paidMinor) &&
          receipt.paidMinor > 0
            ? "refunded"
            : receipt?.adjustment
              ? "revoked"
              : subscription.status === "canceled" ||
                  subscription.status === "incomplete_expired"
                ? "revoked"
                : active
                  ? cancelAtEnd
                    ? "cancelled"
                    : "active"
                  : "past_due",
        cancelAtEnd,
        purchasedAt: new Date(
          (receipt?.invoice.status_transitions.paid_at ??
            subscription.created) * 1000,
        ),
        ...(receipt
          ? {
              refunds: receipt.refunds,
              receipt: {
                invoiceReference: receipt.invoice.id,
                lineReference: receipt.line.id,
                paymentReference: receipt.paymentId,
                paidMinor: receipt.paidMinor,
                currency: subscription.currency.toUpperCase(),
              },
            }
          : {}),
      });
    }
    const invoice = subscription.latest_invoice;
    const clientSecret =
      invoice && typeof invoice !== "string" && invoice.status !== "paid"
        ? invoice.confirmation_secret?.client_secret
        : undefined;
    return {
      accountId: subscription.metadata.commerce_account_id,
      customerReference: customerId,
      subscriptionReference: subscription.id,
      subscriptionState: ["canceled", "incomplete_expired"].includes(
        subscription.status,
      )
        ? "cancelled"
        : "active",
      currency: subscription.currency.toUpperCase(),
      lines,
      ...(clientSecret ? { clientSecret } : {}),
    };
  }
  async cancel(input: Parameters<MembershipBillingProvider["cancel"]>[0]) {
    return stripeOperation(async () => {
      const sub = await this.stripe.subscriptions.retrieve(
        input.subscriptionReference,
        {},
        this.options,
      );
      const items = await this.items(sub.id);
      const target = items.find((item) => item.id === input.itemReference);
      if (!target || ["canceled", "incomplete_expired"].includes(sub.status))
        return this.current(sub.id);
      if (!input.atEnd) {
        invariant(
          !sub.schedule,
          "billing_schedule_conflict",
          "Reconcile scheduled changes before an immediate cancellation.",
        );
        if (items.length === 1)
          await this.stripe.subscriptions.cancel(
            sub.id,
            { prorate: false, invoice_now: false },
            { ...this.options, idempotencyKey: input.key },
          );
        else
          await this.stripe.subscriptionItems.del(
            target.id,
            { proration_behavior: "none" },
            { ...this.options, idempotencyKey: input.key },
          );
      } else if (items.length === 1 && !sub.schedule) {
        await this.stripe.subscriptions.update(
          sub.id,
          { cancel_at_period_end: true },
          { ...this.options, idempotencyKey: input.key },
        );
      } else {
        // One common monthly boundary. Preserve previously scheduled removals.
        invariant(
          !sub.discounts.length &&
            !sub.default_tax_rates?.length &&
            items.every(
              (item) => !item.discounts.length && !item.tax_rates?.length,
            ),
          "billing_schedule_policy_required",
          "Discounted or custom-tax schedules require the approved settings-preservation policy before cancellation can be scheduled.",
        );
        invariant(
          items.every(
            (item) => item.current_period_end === target.current_period_end,
          ),
          "billing_period_conflict",
          "Consolidated monthly cancellation needs a common billing boundary.",
        );
        const scheduleId =
          reference(sub.schedule) ??
          (
            await this.stripe.subscriptionSchedules.create(
              { from_subscription: sub.id },
              { ...this.options, idempotencyKey: `${input.key}:schedule` },
            )
          ).id;
        const schedule = await this.stripe.subscriptionSchedules.retrieve(
          scheduleId,
          {},
          this.options,
        );
        invariant(
          schedule.status === "active" &&
            schedule.current_phase &&
            schedule.phases.length <= 2,
          "billing_schedule_conflict",
          "This schedule needs reviewed reconciliation before another change.",
        );
        const next = schedule.phases.find(
          (phase) => phase.start_date === target.current_period_end,
        );
        const remaining = (next?.items ?? items)
          .filter((item) => reference(item.price) !== target.price.id)
          .map((item) => ({
            price: reference(item.price)!,
            quantity: item.quantity ?? 1,
          }));
        const phases: Stripe.SubscriptionScheduleUpdateParams.Phase[] = [
          {
            start_date: schedule.current_phase.start_date,
            end_date: target.current_period_end,
            items: items.map((item) => ({ price: item.price.id, quantity: 1 })),
            proration_behavior: "none",
          },
        ];
        if (remaining.length)
          phases.push({
            start_date: target.current_period_end,
            duration: { interval: "month", interval_count: 1 },
            items: remaining,
            proration_behavior: "none",
          });
        await this.stripe.subscriptionSchedules.update(
          scheduleId,
          {
            phases,
            end_behavior: remaining.length ? "release" : "cancel",
            proration_behavior: "none",
          },
          { ...this.options, idempotencyKey: `${input.key}:phases` },
        );
      }
      return this.current(sub.id);
    });
  }
  private async findRefund(
    input: Parameters<MembershipBillingProvider["refund"]>[0],
  ) {
    const cause = createHash("sha256").update(input.key).digest("hex");
    const matches = (
      await collect(
        this.stripe.creditNotes.list(
          { invoice: input.invoiceReference, limit: 100 },
          this.options,
        ),
      )
    ).filter((note) => note.metadata?.commerce_cause === cause);
    invariant(
      matches.length <= 1,
      "refund_cause_conflict",
      "The provider has conflicting refund records for this operation.",
    );
    const note = matches[0];
    if (!note) return undefined;
    const lines = await collect(
      this.stripe.creditNotes.listLineItems(
        note.id,
        { limit: 100 },
        this.options,
      ),
    );
    invariant(
      !note.livemode &&
        reference(note.invoice) === input.invoiceReference &&
        note.metadata?.commerce_refund === "membership" &&
        Number(note.metadata.commerce_cash) === input.amount &&
        note.amount === input.amount &&
        note.post_payment_amount === input.amount &&
        note.pre_payment_amount === 0 &&
        note.metadata.commerce_payment === input.paymentReference &&
        lines.length === 1 &&
        lines[0]!.invoice_line_item === input.lineReference,
      "refund_receipt_mismatch",
      "The original provider refund does not match this immutable obligation.",
    );
    return this.currentRefund(note.id, input);
  }
  async recoverRefund(
    input: Parameters<MembershipBillingProvider["refund"]>[0],
  ) {
    return stripeOperation(() => this.findRefund(input));
  }
  async refund(input: Parameters<MembershipBillingProvider["refund"]>[0]) {
    return stripeOperation(async () => {
      const existing = await this.findRefund(input);
      if (existing) return existing;
      const cause = createHash("sha256").update(input.key).digest("hex");
      const invoice = await this.stripe.invoices.retrieve(
        input.invoiceReference,
        {},
        this.options,
      );
      const cash = await this.invoiceCash(invoice);
      const line = cash.lines.find((line) => line.id === input.lineReference);
      const net = line && cash.values.get(line.id);
      invariant(
        line &&
          net &&
          cash.paymentId === input.paymentReference &&
          Number.isSafeInteger(input.amount) &&
          input.amount > 0 &&
          input.amount <= net,
        "refund_receipt_mismatch",
        "The requested refund must match its actual paid invoice line.",
      );
      const gross = Number(
        (BigInt(input.amount) * BigInt(line.subtotal) + BigInt(net) - 1n) /
          BigInt(net),
      );
      const params: Stripe.CreditNoteCreateParams = {
        invoice: invoice.id,
        lines: [
          {
            type: "invoice_line_item",
            invoice_line_item: line.id,
            amount: gross,
          },
        ],
        refund_amount: input.amount,
        credit_amount: 0,
        out_of_band_amount: 0,
        email_type: "none",
        metadata: {
          commerce_refund: "membership",
          commerce_cash: String(input.amount),
          commerce_payment: input.paymentReference,
          commerce_line: input.lineReference,
          commerce_cause: cause,
        },
        reason: "order_change",
      };
      const preview = await this.stripe.creditNotes.preview(
        params,
        this.options,
      );
      invariant(
        preview.amount === input.amount &&
          preview.post_payment_amount === input.amount &&
          preview.pre_payment_amount === 0,
        "refund_allocation_unavailable",
        "Provider tax/discount rounding needs reviewed allocation before this exact refund can be issued.",
      );
      const note = await this.stripe.creditNotes.create(params, {
        ...this.options,
        idempotencyKey: input.key,
      });
      return this.currentRefund(note.id, input);
    });
  }
  async currentRefund(
    id: string,
    expected?: Omit<Parameters<MembershipBillingProvider["refund"]>[0], "key">,
  ) {
    return stripeOperation(async () => {
      const note = await this.stripe.creditNotes.retrieve(id, {}, this.options);
      invariant(
        !note.livemode &&
          note.metadata?.commerce_refund === "membership" &&
          Number(note.metadata.commerce_cash) === note.amount,
        "refund_receipt_mismatch",
        "This credit note is not the matching membership cash refund.",
      );
      if (expected) {
        const lines = await collect(
          this.stripe.creditNotes.listLineItems(
            note.id,
            { limit: 100 },
            this.options,
          ),
        );
        invariant(
          reference(note.invoice) === expected.invoiceReference &&
            note.amount === expected.amount &&
            note.metadata.commerce_payment === expected.paymentReference &&
            note.pre_payment_amount === 0 &&
            note.post_payment_amount === expected.amount &&
            lines.length === 1 &&
            lines[0]!.invoice_line_item === expected.lineReference,
          "refund_receipt_mismatch",
          "Current refund truth must match its original invoice, payment and line.",
        );
      }
      // Refund objects do not expose livemode. Verify the actual original
      // captured card PaymentIntent instead of inferring mode from metadata.
      const payment = await this.stripe.paymentIntents.retrieve(
        note.metadata.commerce_payment!,
        { expand: ["latest_charge"] },
        this.options,
      );
      const charge = payment.latest_charge;
      invariant(
        !payment.livemode &&
          payment.status === "succeeded" &&
          payment.currency === note.currency &&
          charge &&
          typeof charge !== "string" &&
          charge.paid &&
          charge.payment_method_details?.type === "card",
        "refund_receipt_mismatch",
        "Refunds require the original captured sandbox card payment.",
      );
      const refunds = await Promise.all(
        note.refunds.map(async (linked) => {
          invariant(
            linked.type === "refund",
            "refund_payment_unsupported",
            "A card refund needs current Stripe refund truth.",
          );
          const refund = await this.stripe.refunds.retrieve(
            reference(linked.refund)!,
            {},
            this.options,
          );
          invariant(
            refund.currency === note.currency &&
              refund.amount >= linked.amount_refunded &&
              reference(refund.payment_intent) ===
                note.metadata?.commerce_payment,
            "refund_receipt_mismatch",
            "The refund belongs to another payment.",
          );
          return { refund, amount: linked.amount_refunded };
        }),
      );
      const total = refunds.reduce(
        (sum, item) => sum + BigInt(item.amount),
        0n,
      );
      const state =
        note.status === "void" ||
        refunds.some((item) =>
          ["failed", "canceled"].includes(item.refund.status ?? ""),
        )
          ? ("failed" as const)
          : total === BigInt(note.amount) &&
              refunds.every((item) => item.refund.status === "succeeded")
            ? ("succeeded" as const)
            : ("pending" as const);
      return { id: note.id, state };
    });
  }
}
