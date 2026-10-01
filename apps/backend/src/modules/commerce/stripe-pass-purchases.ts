import Stripe from "stripe";
import { z } from "zod";
import { contentHash } from "../../core/canonical.js";
import { invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import { stripeAccountOptions, stripeOperation } from "../payments/stripe.js";
import { ApprovedStripePass, StripePassPeriods } from "./stripe-pass.js";
import type { StripeMembershipBilling } from "./stripe-billing.js";
import type { PassPeriodVerifier, VerifiedPassPeriod } from "./pass.js";

/** Reviewed host configuration, never an HTTP purchase body. Every financial
 * choice is explicit; this adapter supports card cash and separate pool
 * transfers. Other tender/discount/topology choices require their own review. */
export const ApprovedPassPurchasePolicy = z.strictObject({
  version: z.string().min(1).max(100),
  budgetPolicyVersion: z.string().min(1).max(100),
  quoteValiditySeconds: z.number().int().positive().max(300),
  prorationBehavior: z.literal("create_prorations"),
  discountPolicy: z.literal("no_discounts"),
  allocation: z.literal("separate_pool_transfers"),
  automaticTax: z.discriminatedUnion("enabled", [
    z.strictObject({ enabled: z.literal(false) }),
    z.strictObject({
      enabled: z.literal(true),
      liability: z.discriminatedUnion("type", [
        z.strictObject({ type: z.literal("self") }),
        z.strictObject({
          type: z.literal("account"),
          account: z.string().regex(/^acct_[A-Za-z0-9]+$/u),
        }),
      ]),
    }),
  ]),
  defaultTaxRateReferences: z
    .array(z.string().regex(/^txr_[A-Za-z0-9]+$/u))
    .max(100),
  applicationFeePercent: z.number().min(0).max(100).nullable(),
  onBehalfOf: z
    .string()
    .regex(/^acct_[A-Za-z0-9]+$/u)
    .nullable(),
});

const original = {
  key: z.string().min(1).max(200),
  fanId: z.uuid(),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/u),
};
/** Internal immutable effect input. Fan ID, consented invoice amount and
 * calendar end must come from canonical authority and a reviewed quote. */
export const PassPurchaseStart = z.strictObject({
  ...original,
  paymentMethodId: z.string().regex(/^pm_[A-Za-z0-9]+$/u),
  customerReference: z
    .string()
    .regex(/^cus_[A-Za-z0-9]+$/u)
    .optional(),
  replacesReference: z
    .string()
    .regex(/^sub_[A-Za-z0-9]+$/u)
    .optional(),
  firstInvoiceAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  periodEndsAt: z.iso.datetime({ offset: true }),
  createdAt: z.iso.datetime({ offset: true }),
});
export const PassPurchaseCancel = z.strictObject({
  ...original,
  reference: z.string().regex(/^sub_[A-Za-z0-9]+$/u),
});
export const PassRenewalActivation = z.strictObject({
  ...original,
  reference: z.string().regex(/^sub_[A-Za-z0-9]+$/u),
  start: PassPurchaseStart,
});
export const VerifiedPassQuote = z.strictObject({
  configurationHash: original.configurationHash,
  currency: z.string().regex(/^[A-Z]{3}$/u),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  monthlyAmount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  periodEndsAt: z.iso.datetime({ offset: true }),
  providerPreviewReference: z.string().min(1).max(200),
  customerReference: PassPurchaseStart.shape.customerReference,
  replacesReference: PassPurchaseStart.shape.replacesReference,
});
export type PassPurchaseMutation = {
  reference: string;
  customerReference: string;
  subscriptionTerminal: boolean;
  processing: boolean;
  state: "paid" | "refunded" | "processing" | "cancelled" | "failed";
  period: VerifiedPassPeriod;
  renewalEnabled: boolean;
  /** Current provider truth requires a durable cancel effect before this
   * activation can complete. The host must retain its original pending phase. */
  cancellationCompensationRequired: boolean;
  receipt?: {
    invoiceReference: string;
    paymentReference: string;
    currency: string;
    paidMinor: number;
    paidAt: string;
    lines: {
      lineReference: string;
      paidMinor: number;
      startsAt: string;
      endsAt: string;
      held: boolean;
      refunds: { reference: string; amount: number; cause: string }[];
    }[];
  };
  clientSecret?: string;
};
const reference = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
async function collect<T>(items: AsyncIterable<T>) {
  const rows: T[] = [];
  for await (const item of items) {
    invariant(
      rows.length < 1000,
      "pass_recovery_incomplete",
      "The complete original purchase needs a reconciliation job. No new purchase was created.",
    );
    rows.push(item);
  }
  return rows;
}

/** Provider I/O only, outside SQL locks. No grant/ledger/effect is manufactured.
 * The configured host must first persist and fence a W8-custodied original
 * pass effect and fan consent; calling this class is not checkout activation. */
export class StripePassPurchases implements PassPeriodVerifier {
  private readonly options: Stripe.RequestOptions;
  private readonly approved: z.infer<typeof ApprovedStripePass>;
  private readonly policy: z.infer<typeof ApprovedPassPurchasePolicy>;
  private readonly periods: StripePassPeriods;
  readonly configurationHash: string;
  constructor(
    private readonly stripe: Stripe,
    collectionAccount: string,
    approved: unknown,
    policy: unknown,
    private readonly receipts: StripeMembershipBilling,
    budgetForPeriod: ConstructorParameters<typeof StripePassPeriods>[4],
  ) {
    this.options = stripeAccountOptions(collectionAccount);
    this.approved = ApprovedStripePass.parse(approved);
    this.policy = ApprovedPassPurchasePolicy.parse(policy);
    invariant(
      this.approved.allowance <= 2147483647,
      "pass_budget_invalid",
      "The approved allowance must fit the canonical cost-unit counters.",
    );
    invariant(
      this.policy.applicationFeePercent === null ||
        collectionAccount !== "platform",
      "pass_topology_invalid",
      "Application fees require the explicitly approved connected collection account.",
    );
    invariant(
      !this.policy.automaticTax.enabled ||
        this.policy.defaultTaxRateReferences.length === 0,
      "pass_tax_policy_invalid",
      "Configure one reviewed automatic or explicit tax policy.",
    );
    this.configurationHash = contentHash({
      approved: this.approved,
      policy: this.policy,
      collectionAccount,
    });
    Object.freeze(this.approved);
    Object.freeze(this.policy.defaultTaxRateReferences);
    if (this.policy.automaticTax.enabled)
      Object.freeze(this.policy.automaticTax.liability);
    Object.freeze(this.policy.automaticTax);
    Object.freeze(this.policy);
    this.periods = new StripePassPeriods(
      stripe,
      collectionAccount,
      this.approved,
      receipts,
      budgetForPeriod,
    );
  }
  async current(actor: Actor, subscriptionId: string) {
    this.binding(actor, { configurationHash: this.configurationHash });
    return stripeOperation(async () => {
      const sub = await this.subscription(actor, undefined, subscriptionId);
      return this.periods.current(actor, sub.id);
    });
  }
  private binding(actor: Actor, input: { configurationHash: string }) {
    z.uuid().parse(actor.accountId);
    invariant(
      actor.adultEligible && input.configurationHash === this.configurationHash,
      "pass_terms_changed",
      "Reconcile the original approved pass terms before changing the purchase.",
    );
  }
  /** Read-only actual provider preview. No invoice/payment/subscription is
   * created; its amount is persisted before fan consent by the host journal. */
  async quote(
    actor: Actor,
    fanId: string,
    customerReference?: string,
    replacesReference?: string,
  ): Promise<z.infer<typeof VerifiedPassQuote>> {
    this.binding(actor, { configurationHash: this.configurationHash });
    z.uuid().parse(fanId);
    return stripeOperation(async () => {
      if (customerReference) {
        const customer = await this.customer(actor, fanId, customerReference);
        invariant(
          !customer.discount &&
            customer.balance === 0 &&
            Object.values(customer.invoice_credit_balance ?? {}).every(
              (n) => n === 0,
            ),
          "pass_tender_policy_unavailable",
          "Reconcile customer discounts or credits before quoting card cash.",
        );
      }
      invariant(
        !this.policy.automaticTax.enabled || customerReference,
        "pass_tax_location_required",
        "Set up the actual billing customer and tax location before quoting this pass.",
      );
      const price = await this.stripe.prices.retrieve(
        this.approved.priceReference,
        { expand: ["product"] },
        this.options,
      );
      invariant(
        !price.livemode &&
          price.active &&
          typeof price.product !== "string" &&
          !price.product.deleted &&
          price.product.active &&
          price.product.id === this.approved.productReference &&
          price.currency.toUpperCase() === this.approved.currency &&
          price.unit_amount === this.approved.monthlyAmount &&
          price.recurring?.interval === "month" &&
          price.recurring.interval_count === 1 &&
          price.recurring.usage_type === "licensed",
        "pass_product_mismatch",
        "The approved monthly pass product is unavailable.",
      );
      const created = Math.floor(Date.now() / 1000);
      const start = new Date(created * 1000);
      const end =
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) / 1000;
      const expires = Math.min(
        created + this.policy.quoteValiditySeconds,
        end - 1,
      );
      if (replacesReference) {
        const old = await this.stripe.subscriptions.retrieve(
          replacesReference,
          {},
          this.options,
        );
        const items = await collect(
          this.stripe.subscriptionItems.list(
            { subscription: old.id, limit: 100 },
            this.options,
          ),
        );
        invariant(
          !old.livemode &&
            old.metadata.commerce_account_id === actor.accountId &&
            old.metadata.commerce_fan_id === fanId &&
            old.metadata.commerce_pass_catalog_key === this.approved.key &&
            customerReference &&
            reference(old.customer) === customerReference &&
            ["canceled", "incomplete_expired"].includes(old.status) &&
            old.ended_at &&
            old.ended_at <= created &&
            items.length === 1 &&
            items[0]!.current_period_end <= created,
          "pass_period_overlap",
          "The previous paid calendar period must end before a replacement purchase.",
        );
      }
      invariant(
        expires > created,
        "pass_quote_expired",
        "Refresh the quote in the new calendar period.",
      );
      const invoice = await this.stripe.invoices.createPreview(
        {
          ...(customerReference ? { customer: customerReference } : {}),
          currency: price.currency,
          discounts: "",
          automatic_tax: this.policy.automaticTax,
          ...(this.policy.onBehalfOf
            ? { on_behalf_of: this.policy.onBehalfOf }
            : {}),
          subscription_details: {
            items: [{ price: price.id, quantity: 1 }],
            billing_mode: { type: "classic" },
            billing_cycle_anchor: end,
            start_date: created,
            cancel_at_period_end: true,
            proration_behavior: this.policy.prorationBehavior,
            default_tax_rates: this.policy.defaultTaxRateReferences,
          },
        },
        this.options,
      );
      invariant(
        !invoice.livemode &&
          invoice.currency === price.currency &&
          invoice.total > 0 &&
          Number.isSafeInteger(invoice.total) &&
          invoice.amount_due === invoice.total &&
          (!customerReference ||
            reference(invoice.customer) === customerReference) &&
          invoice.discounts.length === 0 &&
          !invoice.lines.has_more &&
          invoice.lines.data.length > 0 &&
          invoice.lines.data.every(
            (line) =>
              reference(line.pricing?.price_details?.price) === price.id &&
              line.period.start === created &&
              line.period.end === end &&
              (line.discount_amounts?.length ?? 0) === 0 &&
              (line.pretax_credit_amounts?.length ?? 0) === 0,
          ),
        "pass_quote_unavailable",
        "The complete provider preview must match the approved calendar pass without other charges or credits.",
      );
      return VerifiedPassQuote.parse({
        configurationHash: this.configurationHash,
        currency: this.approved.currency,
        amount: invoice.total,
        monthlyAmount: this.approved.monthlyAmount,
        createdAt: start.toISOString(),
        expiresAt: new Date(expires * 1000).toISOString(),
        periodEndsAt: new Date(end * 1000).toISOString(),
        providerPreviewReference: invoice.id,
        ...(customerReference ? { customerReference } : {}),
        ...(replacesReference ? { replacesReference } : {}),
      });
    });
  }
  private async customer(actor: Actor, fanId: string, customerId: string) {
    const customer = await this.stripe.customers.retrieve(
      customerId,
      {},
      this.options,
    );
    invariant(
      !customer.deleted &&
        !customer.livemode &&
        customer.metadata.commerce_account_id === actor.accountId &&
        customer.metadata.commerce_fan_id === fanId,
      "pass_account_mismatch",
      "The pass customer belongs to another account.",
    );
    return customer;
  }
  private async subscription(
    actor: Actor,
    fanId: string | undefined,
    subscriptionId: string,
  ) {
    const sub = await this.stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ["latest_invoice.confirmation_secret"] },
      this.options,
    );
    const boundFanId = z.uuid().safeParse(sub.metadata.commerce_fan_id);
    invariant(
      !sub.livemode &&
        boundFanId.success &&
        sub.metadata.commerce_account_id === actor.accountId &&
        (fanId === undefined || sub.metadata.commerce_fan_id === fanId) &&
        sub.metadata.commerce_pass_catalog_key === this.approved.key &&
        sub.metadata.commerce_pass_terms_version ===
          this.approved.termsVersion &&
        sub.metadata.commerce_pass_configuration === this.configurationHash &&
        sub.currency.toUpperCase() === this.approved.currency &&
        sub.billing_mode.type === "classic" &&
        !sub.schedule &&
        !sub.pending_update &&
        !sub.pause_collection &&
        !sub.trial_end &&
        !sub.transfer_data &&
        sub.collection_method === "charge_automatically" &&
        sub.discounts.length === 0 &&
        contentHash(sub.payment_settings?.payment_method_types ?? null) ===
          contentHash(["card"]) &&
        sub.automatic_tax.enabled === this.policy.automaticTax.enabled &&
        (sub.application_fee_percent ?? null) ===
          this.policy.applicationFeePercent &&
        (reference(sub.on_behalf_of) ?? null) === this.policy.onBehalfOf &&
        contentHash(
          (sub.default_tax_rates ?? []).map((rate) => rate.id).sort(),
        ) === contentHash([...this.policy.defaultTaxRateReferences].sort()) &&
        (!this.policy.automaticTax.enabled ||
          (sub.automatic_tax.liability?.type ===
            this.policy.automaticTax.liability.type &&
            (this.policy.automaticTax.liability.type === "self" ||
              reference(sub.automatic_tax.liability.account) ===
                this.policy.automaticTax.liability.account))),
      "pass_purchase_binding_invalid",
      "The original pass purchase needs account and terms reconciliation.",
    );
    const customerId = reference(sub.customer);
    invariant(
      customerId,
      "pass_customer_required",
      "The pass has no bound billing customer.",
    );
    await this.customer(actor, boundFanId.data, customerId);
    const items = await collect(
      this.stripe.subscriptionItems.list(
        { subscription: sub.id, limit: 100 },
        this.options,
      ),
    );
    invariant(
      items.length === 1 &&
        items[0]?.price.id === this.approved.priceReference &&
        reference(items[0].price.product) === this.approved.productReference &&
        items[0].price.unit_amount === this.approved.monthlyAmount &&
        items[0].price.currency.toUpperCase() === this.approved.currency &&
        items[0].price.recurring?.interval === "month" &&
        items[0].price.recurring.interval_count === 1 &&
        items[0].price.recurring.usage_type === "licensed" &&
        items[0].quantity === 1 &&
        items[0].discounts.length === 0 &&
        (items[0].tax_rates?.length ?? 0) === 0,
      "pass_product_mismatch",
      "The original pass product changed. Reconcile it before changing access.",
    );
    return sub;
  }
  async recoverStart(
    actor: Actor,
    rawInput: unknown,
  ): Promise<PassPurchaseMutation | undefined> {
    const input = PassPurchaseStart.parse(rawInput);
    this.binding(actor, input);
    return stripeOperation(async () => {
      const key = contentHash(input.key);
      let customerId = input.customerReference;
      if (!customerId) {
        const matches = (
          await collect(
            this.stripe.customers.list({ limit: 100 }, this.options),
          )
        ).filter(
          (customer) => customer.metadata.commerce_pass_start_key === key,
        );
        invariant(
          matches.length <= 1,
          "pass_reference_ambiguous",
          "The original customer needs reconciliation.",
        );
        if (!matches[0]) return undefined;
        customerId = matches[0].id;
      }
      await this.customer(actor, input.fanId, customerId);
      const matches = (
        await collect(
          this.stripe.subscriptions.list(
            { customer: customerId, status: "all", limit: 100 },
            this.options,
          ),
        )
      ).filter((sub) => sub.metadata.commerce_pass_start_key === key);
      invariant(
        matches.length <= 1,
        "pass_reference_ambiguous",
        "The original subscription needs reconciliation.",
      );
      if (!matches[0]) return undefined;
      const sub = await this.subscription(actor, input.fanId, matches[0].id);
      invariant(
        sub.metadata.commerce_pass_start_body === contentHash(input),
        "pass_original_request_changed",
        "The original pass purchase body changed.",
      );
      return this.startResult(actor, input, sub);
    });
  }
  async start(actor: Actor, rawInput: unknown): Promise<PassPurchaseMutation> {
    const input = PassPurchaseStart.parse(rawInput);
    this.binding(actor, input);
    // Recover before reusing a key. Provider idempotency retention is finite.
    const recovered = await this.recoverStart(actor, input);
    if (recovered) return recovered;
    const createdAt = new Date(input.createdAt),
      end = new Date(input.periodEndsAt);
    invariant(
      createdAt <= new Date() &&
        Date.now() - createdAt.getTime() < 23 * 3600000 &&
        end.getTime() ===
          Date.UTC(
            createdAt.getUTCFullYear(),
            createdAt.getUTCMonth() + 1,
            1,
          ) &&
        end > new Date(),
      "pass_original_purchase_expired",
      "The original pass quote needs reconciliation before a new purchase.",
    );
    return stripeOperation(async () => {
      const price = await this.stripe.prices.retrieve(
        this.approved.priceReference,
        { expand: ["product"] },
        this.options,
      );
      invariant(
        !price.livemode &&
          price.active &&
          typeof price.product !== "string" &&
          !price.product.deleted &&
          price.product.active &&
          price.product.id === this.approved.productReference &&
          price.currency.toUpperCase() === this.approved.currency &&
          price.unit_amount === this.approved.monthlyAmount &&
          price.recurring?.interval === "month" &&
          price.recurring.interval_count === 1 &&
          price.recurring.usage_type === "licensed",
        "pass_product_mismatch",
        "The approved monthly pass product is unavailable.",
      );
      const customerId =
        input.customerReference ??
        (
          await this.stripe.customers.create(
            {
              metadata: {
                commerce_account_id: actor.accountId,
                commerce_fan_id: input.fanId,
                commerce_pass_start_key: contentHash(input.key),
              },
            },
            { ...this.options, idempotencyKey: `${input.key}:customer` },
          )
        ).id;
      const customer = await this.customer(actor, input.fanId, customerId);
      invariant(
        !customer.discount &&
          customer.balance === 0 &&
          Object.values(customer.invoice_credit_balance ?? {}).every(
            (amount) => amount === 0,
          ),
        "pass_tender_policy_unavailable",
        "This pass requires its approved card-cash checkout without customer discounts or credit balances.",
      );
      if (input.replacesReference) {
        const old = await this.stripe.subscriptions.retrieve(
          input.replacesReference,
          {},
          this.options,
        );
        invariant(
          !old.livemode &&
            old.metadata.commerce_account_id === actor.accountId &&
            old.metadata.commerce_fan_id === input.fanId &&
            old.metadata.commerce_pass_catalog_key === this.approved.key &&
            reference(old.customer) === customerId &&
            ["canceled", "incomplete_expired"].includes(old.status) &&
            old.ended_at &&
            old.ended_at * 1000 <= createdAt.getTime(),
          "pass_lineage_unverified",
          "Verify the previous terminal purchase before replacing it.",
        );
        const oldItems = await collect(
          this.stripe.subscriptionItems.list(
            { subscription: old.id, limit: 100 },
            this.options,
          ),
        );
        invariant(
          oldItems.length === 1 &&
            oldItems[0]!.current_period_end * 1000 <= createdAt.getTime(),
          "pass_period_overlap",
          "The previous paid calendar period must end before a replacement purchase.",
        );
      }
      const method = await this.stripe.paymentMethods.retrieve(
        input.paymentMethodId,
        {},
        this.options,
      );
      invariant(
        !method.livemode &&
          method.type === "card" &&
          (!method.customer || reference(method.customer) === customerId),
        "pass_method_conflict",
        "Use a card belonging to this pass account.",
      );
      if (!method.customer)
        await this.stripe.paymentMethods.attach(
          method.id,
          { customer: customerId },
          { ...this.options, idempotencyKey: `${input.key}:attach` },
        );
      const sub = await this.stripe.subscriptions.create(
        {
          customer: customerId,
          items: [{ price: price.id, quantity: 1 }],
          currency: price.currency,
          default_payment_method: method.id,
          collection_method: "charge_automatically",
          payment_behavior: "default_incomplete",
          payment_settings: {
            payment_method_types: ["card"],
            save_default_payment_method: "on_subscription",
          },
          billing_mode: { type: "classic" },
          billing_cycle_anchor: Math.floor(end.getTime() / 1000),
          // A changed/zero first invoice must not create an unattended later
          // debit. The journal separately activates renewal after verified cash.
          cancel_at_period_end: true,
          proration_behavior: this.policy.prorationBehavior,
          automatic_tax: this.policy.automaticTax,
          default_tax_rates: this.policy.defaultTaxRateReferences,
          ...(this.policy.applicationFeePercent === null
            ? {}
            : { application_fee_percent: this.policy.applicationFeePercent }),
          ...(this.policy.onBehalfOf === null
            ? {}
            : { on_behalf_of: this.policy.onBehalfOf }),
          metadata: {
            commerce_account_id: actor.accountId,
            commerce_fan_id: input.fanId,
            commerce_pass_catalog_key: this.approved.key,
            commerce_pass_terms_version: this.approved.termsVersion,
            commerce_pass_configuration: this.configurationHash,
            commerce_pass_start_key: contentHash(input.key),
            commerce_pass_start_body: contentHash(input),
            ...(input.replacesReference
              ? { commerce_replaces_pass_subscription: input.replacesReference }
              : {}),
          },
          expand: ["latest_invoice.confirmation_secret"],
        },
        { ...this.options, idempotencyKey: `${input.key}:subscription` },
      );
      return this.startResult(
        actor,
        input,
        await this.subscription(actor, input.fanId, sub.id),
      );
    });
  }
  /** A separately persisted/fenced journal phase consumes the original paid
   * receipt and current desired renewal state. Never clear a fan cancellation;
   * lease/version loss requires the host's durable cancellation compensation. */
  async recoverRenewal(
    actor: Actor,
    rawInput: unknown,
  ): Promise<PassPurchaseMutation> {
    const input = PassRenewalActivation.parse(rawInput);
    this.binding(actor, input);
    return stripeOperation(async () => {
      const sub = await this.subscription(actor, input.fanId, input.reference);
      invariant(
        input.start.fanId === input.fanId &&
          input.start.configurationHash === input.configurationHash &&
          sub.metadata.commerce_pass_start_key ===
            contentHash(input.start.key) &&
          sub.metadata.commerce_pass_start_body === contentHash(input.start) &&
          (sub.metadata.commerce_pass_renewal_key !== contentHash(input.key) ||
            sub.metadata.commerce_pass_renewal_body === contentHash(input)),
        "pass_original_request_changed",
        "The original renewal request changed.",
      );
      return this.startResult(actor, input.start, sub);
    });
  }
  async activateRenewal(
    actor: Actor,
    rawInput: unknown,
  ): Promise<PassPurchaseMutation> {
    const input = PassRenewalActivation.parse(rawInput);
    this.binding(actor, input);
    invariant(
      input.start.fanId === input.fanId &&
        input.start.configurationHash === input.configurationHash,
      "pass_original_request_changed",
      "The original renewal authority changed.",
    );
    return stripeOperation(async () => {
      const current = await this.subscription(
        actor,
        input.fanId,
        input.reference,
      );
      invariant(
        current.metadata.commerce_pass_start_key ===
          contentHash(input.start.key) &&
          current.metadata.commerce_pass_start_body ===
            contentHash(input.start) &&
          (!current.metadata.commerce_pass_renewal_key ||
            current.metadata.commerce_pass_renewal_key !==
              contentHash(input.key) ||
            current.metadata.commerce_pass_renewal_body === contentHash(input)),
        "pass_original_request_changed",
        "The original paid purchase or renewal body changed.",
      );
      const paid = await this.startResult(actor, input.start, current);
      invariant(
        paid.receipt &&
          paid.state === "paid" &&
          paid.receipt.lines.every(
            (line) => !line.held && line.refunds.length === 0,
          ) &&
          current.status === "active" &&
          paid.period.endsAt.getTime() ===
            new Date(input.start.periodEndsAt).getTime() &&
          paid.period.endsAt > new Date() &&
          !current.metadata.commerce_pass_cancel_key,
        "pass_renewal_unavailable",
        "Reconcile the current paid purchase and cancellation before enabling renewal.",
      );
      if (!current.cancel_at_period_end) return paid;
      await this.stripe.subscriptions.update(
        current.id,
        {
          cancel_at_period_end: false,
          metadata: {
            commerce_pass_renewal_key: contentHash(input.key),
            commerce_pass_renewal_body: contentHash(input),
          },
        },
        { ...this.options, idempotencyKey: `${input.key}:renewal` },
      );
      const after = await this.subscription(actor, input.fanId, current.id);
      const result = await this.startResult(actor, input.start, after);
      // A concurrent fan cancellation wins. Do not mark activation complete;
      // the held original journal must reconcile/compensate its current intent.
      if (after.metadata.commerce_pass_cancel_key)
        return {
          ...result,
          processing: true,
          cancellationCompensationRequired:
            !after.cancel_at_period_end && after.status === "active",
        };
      return result;
    });
  }
  /** Cancellation is at the paid calendar end. Refund/departure economics are
   * separate reviewed effects; cancellation cannot fabricate a refund. */
  async cancel(actor: Actor, rawInput: unknown): Promise<PassPurchaseMutation> {
    const input = PassPurchaseCancel.parse(rawInput);
    this.binding(actor, input);
    return stripeOperation(async () => {
      const current = await this.subscription(
        actor,
        input.fanId,
        input.reference,
      );
      invariant(
        current.metadata.commerce_pass_cancel_key !== contentHash(input.key) ||
          current.metadata.commerce_pass_cancel_body === contentHash(input),
        "pass_original_request_changed",
        "The original cancellation body changed.",
      );
      if (
        ["canceled", "incomplete_expired"].includes(current.status) ||
        (current.cancel_at_period_end &&
          current.metadata.commerce_pass_cancel_key === contentHash(input.key))
      )
        return this.cancelResult(actor, current);
      // Initial creation already has cancel_at_period_end=true. A fan cancel
      // still needs its own original marker, so activation cannot erase it.
      await this.stripe.subscriptions.update(
        current.id,
        {
          cancel_at_period_end: true,
          metadata: {
            commerce_pass_cancel_key: contentHash(input.key),
            commerce_pass_cancel_body: contentHash(input),
          },
        },
        { ...this.options, idempotencyKey: `${input.key}:cancel` },
      );
      return this.cancelResult(
        actor,
        await this.subscription(actor, input.fanId, current.id),
      );
    });
  }
  private async startResult(
    actor: Actor,
    input: z.infer<typeof PassPurchaseStart>,
    sub: Stripe.Subscription,
  ): Promise<PassPurchaseMutation> {
    // Read the ORIGINAL creation invoice, including after a missed callback
    // and later renewal. The latest renewal must not replace its cash receipt
    // or supply a new payment secret to an old checkout effect.
    const invoices = (
      await collect(
        this.stripe.invoices.list(
          { subscription: sub.id, limit: 100 },
          this.options,
        ),
      )
    ).filter((invoice) => invoice.billing_reason === "subscription_create");
    invariant(
      invoices.length === 1,
      "pass_invoice_ambiguous",
      "The complete original purchase invoice needs reconciliation.",
    );
    const invoice = await this.stripe.invoices.retrieve(
      invoices[0]!.id,
      { expand: ["confirmation_secret"] },
      this.options,
    );
    invariant(
      !invoice.livemode &&
        invoice.total === input.firstInvoiceAmount &&
        (["void", "uncollectible"].includes(invoice.status ?? "") ||
          invoice.amount_due === input.firstInvoiceAmount) &&
        invoice.currency.toUpperCase() === this.approved.currency &&
        reference(invoice.customer) === reference(sub.customer) &&
        reference(invoice.parent?.subscription_details?.subscription) ===
          sub.id &&
        invoice.discounts.length === 0,
      "pass_quote_changed",
      "The provider invoice changed. Review it before confirming this purchase.",
    );
    const lines = await collect(
      this.stripe.invoices.listLineItems(
        invoice.id,
        { limit: 100 },
        this.options,
      ),
    );
    const endsAt = new Date(input.periodEndsAt).getTime() / 1000;
    const items = await collect(
      this.stripe.subscriptionItems.list(
        { subscription: sub.id, limit: 100 },
        this.options,
      ),
    );
    invariant(
      lines.length > 0 &&
        lines.every(
          (line) =>
            line.parent?.subscription_item_details?.subscription_item ===
              items[0]?.id &&
            reference(line.pricing?.price_details?.price) ===
              this.approved.priceReference &&
            line.period.end === endsAt &&
            line.period.start < line.period.end &&
            (line.discount_amounts?.length ?? 0) === 0 &&
            (line.pretax_credit_amounts?.length ?? 0) === 0,
        ),
      "pass_invoice_binding_invalid",
      "The original pass invoice includes unapproved items or terms.",
    );
    const period = await this.periods.current(actor, sub.id);
    const cancellationCompensationRequired = Boolean(
      sub.metadata.commerce_pass_cancel_key &&
        !sub.cancel_at_period_end &&
        sub.status === "active",
    );
    if (invoice.status !== "paid") {
      const terminal =
        ["canceled", "incomplete_expired"].includes(sub.status) ||
        ["void", "uncollectible"].includes(invoice.status ?? "");
      return {
        reference: sub.id,
        customerReference: reference(sub.customer)!,
        subscriptionTerminal: ["canceled", "incomplete_expired"].includes(
          sub.status,
        ),
        period,
        renewalEnabled: !sub.cancel_at_period_end && sub.status === "active",
        cancellationCompensationRequired,
        processing: !terminal,
        state: terminal ? "failed" : "processing",
        ...(!terminal && invoice.confirmation_secret?.client_secret
          ? { clientSecret: invoice.confirmation_secret.client_secret }
          : {}),
      };
    }
    const confirmed = await this.receipts.confirmedInvoice(invoice, lines);
    invariant(
      invoice.status_transitions.paid_at &&
        invoice.status_transitions.paid_at * 1000 <= Date.now(),
      "pass_cash_invalid",
      "The original confirmed cash needs its actual payment time.",
    );
    const receiptLines = lines.map((line) => ({
      lineReference: line.id,
      paidMinor: confirmed.cash.values.get(line.id)!,
      startsAt: new Date(line.period.start * 1000).toISOString(),
      endsAt: new Date(line.period.end * 1000).toISOString(),
      held: confirmed.adjustments.held.has(line.id),
      refunds: confirmed.adjustments.refunds.get(line.id) ?? [],
    }));
    const refunded = receiptLines.reduce(
      (sum, line) =>
        sum + line.refunds.reduce((n, refund) => n + BigInt(refund.amount), 0n),
      0n,
    );
    return {
      reference: sub.id,
      customerReference: reference(sub.customer)!,
      subscriptionTerminal: ["canceled", "incomplete_expired"].includes(
        sub.status,
      ),
      period,
      processing:
        cancellationCompensationRequired ||
        (sub.cancel_at_period_end &&
          !sub.metadata.commerce_pass_cancel_key &&
          sub.status === "active"),
      renewalEnabled: !sub.cancel_at_period_end && sub.status === "active",
      cancellationCompensationRequired,
      state: refunded >= BigInt(invoice.total) ? "refunded" : "paid",
      receipt: {
        invoiceReference: invoice.id,
        paymentReference: confirmed.cash.paymentId,
        currency: invoice.currency.toUpperCase(),
        paidMinor: invoice.total,
        paidAt: new Date(
          invoice.status_transitions.paid_at * 1000,
        ).toISOString(),
        lines: receiptLines,
      },
    };
  }
  private async cancelResult(
    actor: Actor,
    sub: Stripe.Subscription,
  ): Promise<PassPurchaseMutation> {
    const period = await this.periods.current(actor, sub.id);
    const terminal = ["canceled", "incomplete_expired"].includes(sub.status);
    const cancelled = terminal || sub.cancel_at_period_end;
    return {
      reference: sub.id,
      customerReference: reference(sub.customer)!,
      subscriptionTerminal: ["canceled", "incomplete_expired"].includes(
        sub.status,
      ),
      period,
      renewalEnabled: !sub.cancel_at_period_end && sub.status === "active",
      cancellationCompensationRequired: false,
      processing: !cancelled,
      state: cancelled ? "cancelled" : "processing",
    };
  }
}
