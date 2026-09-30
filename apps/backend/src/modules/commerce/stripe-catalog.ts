import Stripe from "stripe";
import { z } from "zod";
import type { Pool } from "pg";
import { invariant } from "../../core/errors.js";
import { stripeOperation } from "../payments/stripe.js";
import type { TierCatalog } from "./tiers.js";

export const ApprovedStripeProducts = z
  .array(
    z.strictObject({
      key: z.string().min(1).max(100),
      label: z.string().min(1).max(100),
      creatorId: z.uuid(),
      priceReference: z.string().regex(/^price_[A-Za-z0-9]+$/u),
    }),
  )
  .max(1000)
  .refine(
    (rows) =>
      new Set(rows.map((row) => row.key)).size === rows.length &&
      new Set(rows.map((row) => row.priceReference)).size === rows.length,
  );

/** Approved references come from server configuration. The price, currency and
 * recurrence are fetched from the configured Stripe account before publishing. */
export class StripeTierCatalog implements TierCatalog {
  private readonly options: Stripe.RequestOptions;
  private readonly products: z.infer<typeof ApprovedStripeProducts>;
  constructor(
    private readonly stripe: Stripe,
    private readonly pool: Pool,
    approved: unknown,
    collectionAccount: string,
  ) {
    this.products = ApprovedStripeProducts.parse(approved);
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
  async choices(creatorId: string) {
    return this.products
      .filter((product) => product.creatorId === creatorId)
      .map(({ key, label }) => ({ key, label }));
  }
  async verify(creatorId: string, key: string) {
    return stripeOperation(async () => {
      const product = this.products.find(
        (product) => product.creatorId === creatorId && product.key === key,
      );
      invariant(
        product,
        "membership_catalog_unavailable",
        "Choose a product approved for this creator.",
      );
      const price = await this.stripe.prices.retrieve(
        product.priceReference,
        { expand: ["product"] },
        this.options,
      );
      invariant(
        !price.livemode &&
          price.active &&
          price.unit_amount !== null &&
          price.unit_amount > 0 &&
          Number.isSafeInteger(price.unit_amount) &&
          price.type === "recurring" &&
          price.recurring?.interval === "month" &&
          price.recurring.interval_count === 1 &&
          price.recurring.usage_type === "licensed" &&
          typeof price.product !== "string" &&
          !price.product.deleted &&
          price.product.active,
        "membership_price_invalid",
        "The approved monthly sandbox product is unavailable.",
      );
      return {
        web: {
          priceReference: price.id,
          amount: price.unit_amount,
          currency: price.currency.toUpperCase(),
          interval: "month" as const,
        },
      };
    });
  }
  async binding(priceReference: string) {
    const approved = this.products.find(
      (product) => product.priceReference === priceReference,
    );
    invariant(
      approved,
      "billing_catalog_mismatch",
      "The invoice price is outside the approved product catalog.",
    );
    const rows = (
      await this.pool.query<{ id: string; creator_id: string }>(
        "SELECT id,creator_id FROM creator.commerce_tier WHERE creator_id=$1 AND catalog->'web'->>'priceReference'=$2 LIMIT 2",
        [approved.creatorId, priceReference],
      )
    ).rows;
    invariant(
      rows.length === 1,
      "billing_catalog_mismatch",
      "The approved invoice product needs one immutable membership tier binding.",
    );
    return { tierId: rows[0]!.id, creatorId: rows[0]!.creator_id };
  }
}
