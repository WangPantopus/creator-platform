import Stripe from "stripe";
import { z } from "zod";
import type { Actor } from "../identity/adapter.js";
import { invariant } from "../../core/errors.js";
import { stripeAccountOptions, stripeOperation } from "../payments/stripe.js";
import type { PassPeriodVerifier, VerifiedPassPeriod } from "./pass.js";
import type { StripeMembershipBilling } from "./stripe-billing.js";

export const ApprovedStripePass = z.strictObject({
  key: z.string().min(1).max(100),
  termsVersion: z.string().min(1).max(100),
  priceReference: z.string().regex(/^price_[A-Za-z0-9]+$/u),
  productReference: z.string().regex(/^prod_[A-Za-z0-9]+$/u),
  monthlyAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/u),
  slotCapacity: z.number().int().positive().max(100),
  allowance: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
const reference = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
async function collect<T>(items: AsyncIterable<T>, maximum = 1000) {
  const rows: T[] = [];
  for await (const item of items) {
    invariant(
      rows.length < maximum,
      "pass_history_unavailable",
      "The complete pass billing history needs a reconciliation job. No partial result was applied.",
    );
    rows.push(item);
  }
  return rows;
}

/** Read-only genuine Stripe pass verifier. Purchase effects/first-cycle terms
 * still require their reviewed host; this adapter creates no subscription,
 * payment, paid ledger, grace period, pool economics or synthetic receipt.
 * Only exact approved calendar-month products can fund PassCommerce.
 */
export class StripePassPeriods implements PassPeriodVerifier {
  private readonly options: Stripe.RequestOptions;
  private readonly approved: z.infer<typeof ApprovedStripePass>;
  constructor(
    private readonly stripe: Stripe,
    collectionAccount: string,
    approved: unknown,
    private readonly receipts: StripeMembershipBilling,
    private readonly budgetForPeriod: (period: {
      startsAt: Date;
      endsAt: Date;
      monthlyAllowance: number;
    }) => number,
  ) {
    this.options = stripeAccountOptions(collectionAccount);
    this.approved = ApprovedStripePass.parse(approved);
    invariant(
      receipts.usesConnection(stripe, collectionAccount),
      "pass_receipt_connection_mismatch",
      "Pass receipts must use the same Stripe client and approved collection account.",
    );
  }
  async current(
    actor: Actor,
    subscriptionId: string,
  ): Promise<VerifiedPassPeriod> {
    return stripeOperation(async () => {
      const sub = await this.stripe.subscriptions.retrieve(
        subscriptionId,
        {},
        this.options,
      );
      const approved = this.approved;
      invariant(
        actor.adultEligible &&
          !sub.livemode &&
          sub.metadata.commerce_account_id === actor.accountId &&
          sub.metadata.commerce_pass_catalog_key === approved.key &&
          sub.metadata.commerce_pass_terms_version === approved.termsVersion &&
          sub.currency.toUpperCase() === approved.currency &&
          sub.billing_mode.type === "classic" &&
          !sub.schedule &&
          !sub.pending_update &&
          !sub.pause_collection &&
          !sub.trial_end,
        "pass_purchase_binding_invalid",
        "The current sandbox pass does not match this account and its approved purchased terms.",
      );
      const customerId = reference(sub.customer);
      invariant(
        customerId,
        "pass_customer_required",
        "The pass has no bound billing customer.",
      );
      const customer = await this.stripe.customers.retrieve(
        customerId,
        {},
        this.options,
      );
      invariant(
        !customer.deleted &&
          !customer.livemode &&
          customer.metadata.commerce_account_id === actor.accountId,
        "pass_account_mismatch",
        "The pass billing customer belongs to another account.",
      );
      const items = await collect(
        this.stripe.subscriptionItems.list(
          { subscription: sub.id, limit: 100 },
          this.options,
        ),
      );
      const item = items[0];
      invariant(
        items.length === 1 &&
          item &&
          item.quantity === 1 &&
          item.price.id === approved.priceReference &&
          reference(item.price.product) === approved.productReference &&
          item.price.currency.toUpperCase() === approved.currency &&
          item.price.unit_amount === approved.monthlyAmount &&
          item.price.recurring?.interval === "month" &&
          item.price.recurring.interval_count === 1 &&
          item.price.recurring.usage_type === "licensed",
        "pass_product_mismatch",
        "Only the exact approved monthly pass product can fund slots.",
      );
      const startsAt = new Date(item.current_period_start * 1000);
      const endsAt = new Date(item.current_period_end * 1000);
      invariant(
        startsAt <= new Date() &&
          endsAt.getTime() ===
            Date.UTC(startsAt.getUTCFullYear(), startsAt.getUTCMonth() + 1, 1),
        "pass_calendar_invalid",
        "The pass purchase must end at the next UTC calendar-month boundary.",
      );
      const invoices = await collect(
        this.stripe.invoices.list(
          {
            subscription: sub.id,
            created: { gte: item.current_period_start - 86400 },
            limit: 100,
          },
          this.options,
        ),
      );
      let paid:
        | {
            invoice: Stripe.Invoice;
            line: Stripe.InvoiceLineItem;
            confirmed: Awaited<
              ReturnType<StripeMembershipBilling["confirmedInvoice"]>
            >;
          }
        | undefined;
      for (const invoice of invoices) {
        if (invoice.status !== "paid") continue;
        invariant(
          reference(invoice.customer) === customerId &&
            invoice.currency === sub.currency,
          "pass_invoice_binding_invalid",
          "Pass invoice ownership and currency need reconciliation.",
        );
        const lines = await collect(
          this.stripe.invoices.listLineItems(
            invoice.id,
            { limit: 100 },
            this.options,
          ),
        );
        const matches = lines.filter(
          (line) =>
            line.parent?.subscription_item_details?.subscription_item ===
              item.id &&
            reference(line.pricing?.price_details?.price) ===
              approved.priceReference &&
            line.period.start === item.current_period_start &&
            line.period.end === item.current_period_end,
        );
        if (!matches.length) continue;
        invariant(
          matches.length === 1 && !paid,
          "pass_period_ambiguous",
          "Multiple pass invoice lines need reviewed reconciliation before slots can be funded.",
        );
        paid = {
          invoice,
          line: matches[0]!,
          confirmed: await this.receipts.confirmedInvoice(invoice, lines),
        };
      }
      const refunded =
        paid?.confirmed.adjustments.refunds
          .get(paid.line.id)
          ?.reduce((sum, refund) => sum + BigInt(refund.amount), 0n) ?? 0n;
      const paidMinor = paid?.confirmed.cash.values.get(paid.line.id) ?? 0;
      const funded = Boolean(
        paid &&
          paidMinor > 0 &&
          endsAt > new Date() &&
          !paid.confirmed.adjustments.held.has(paid.line.id),
      );
      const allowance = this.budgetForPeriod({
        startsAt,
        endsAt,
        monthlyAllowance: approved.allowance,
      });
      invariant(
        Number.isSafeInteger(allowance) &&
          allowance >= 0 &&
          allowance <= approved.allowance,
        "pass_budget_unconfigured",
        "The reviewed first-cycle budget must match the purchased calendar period.",
      );
      let replacesReference: string | undefined;
      if (sub.metadata.commerce_replaces_pass_subscription) {
        const old = await this.stripe.subscriptions.retrieve(
          sub.metadata.commerce_replaces_pass_subscription,
          {},
          this.options,
        );
        invariant(
          !old.livemode &&
            old.metadata.commerce_account_id === actor.accountId &&
            reference(old.customer) === customerId &&
            ["canceled", "incomplete_expired"].includes(old.status) &&
            old.ended_at &&
            old.ended_at * 1000 <= startsAt.getTime(),
          "pass_lineage_unverified",
          "The previous pass purchase needs verified terminal ownership before replacement.",
        );
        replacesReference = old.id;
      }
      return {
        reference: sub.id,
        accountId: actor.accountId,
        startsAt: paid ? new Date(paid.line.period.start * 1000) : startsAt,
        endsAt,
        slotCapacity: approved.slotCapacity,
        allowance,
        cancelAtEnd: sub.cancel_at_period_end,
        state:
          paidMinor > 0 && refunded >= BigInt(paidMinor)
            ? "refunded"
            : funded && sub.status === "active"
              ? sub.cancel_at_period_end
                ? "cancelled"
                : "active"
              : "past_due",
        ...(replacesReference ? { replacesReference } : {}),
      };
    });
  }
}
