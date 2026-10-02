import { createHash } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import type { Actor } from "../identity/adapter.js";
import { DomainError, invariant } from "../../core/errors.js";
import type {
  StoreEntitlementVerifier,
  VerifiedStoreEntitlement,
  StorePaidHistoryReader,
} from "./extended.js";

export const StoreProducts = z
  .array(
    z.strictObject({
      creatorId: z.uuid(),
      tierId: z.uuid(),
      apple: z
        .strictObject({
          productId: z.string().min(1).max(255),
          subscriptionGroupId: z.string().min(1).max(100),
        })
        .optional(),
      google: z
        .strictObject({
          productId: z.string().min(1).max(255),
          basePlanId: z.string().min(1).max(100),
        })
        .optional(),
    }),
  )
  .max(1000)
  .refine(
    (rows) =>
      new Set(rows.map((row) => row.tierId)).size === rows.length &&
      new Set(rows.flatMap((row) => (row.apple ? [row.apple.productId] : [])))
        .size === rows.filter((row) => row.apple).length &&
      new Set(
        rows.flatMap((row) =>
          row.google
            ? [`${row.google.productId}:${row.google.basePlanId}`]
            : [],
        ),
      ).size === rows.filter((row) => row.google).length,
  );
export type StoreProduct = z.infer<typeof StoreProducts>[number];

export class StoreCatalog {
  readonly products: readonly StoreProduct[];
  constructor(
    private readonly pool: Pool,
    input: unknown,
  ) {
    this.products = StoreProducts.parse(input);
  }
  async binding(
    platform: "apple" | "google",
    productId: string,
    planOrGroupId: string,
  ) {
    const product = this.products.find((product) =>
      platform === "apple"
        ? product.apple?.productId === productId &&
          product.apple.subscriptionGroupId === planOrGroupId
        : product.google?.productId === productId &&
          product.google.basePlanId === planOrGroupId,
    );
    invariant(
      product,
      "store_product_unavailable",
      "This store product is outside the approved membership catalog.",
    );
    const tier = (
      await this.pool.query<{
        id: string;
        catalog: Record<
          string,
          {
            productId?: string;
            basePlanId?: string;
            subscriptionGroupId?: string;
          }
        >;
      }>(
        "SELECT id,catalog FROM creator.commerce_tier WHERE id=$1 AND creator_id=$2",
        [product.tierId, product.creatorId],
      )
    ).rows[0];
    const current = tier?.catalog[platform];
    invariant(
      current?.productId === productId &&
        (platform === "apple"
          ? !current.subscriptionGroupId ||
            current.subscriptionGroupId === planOrGroupId
          : current.basePlanId === planOrGroupId),
      "store_product_unavailable",
      "Publish the verified store product on its immutable membership tier first.",
    );
    return { creatorId: product.creatorId, tierId: product.tierId };
  }
}

export const googleAccountBinding = (accountId: string) =>
  createHash("sha256")
    .update(`commerce:v1:${accountId.toLowerCase()}`)
    .digest("hex");
export const googlePurchaseReference = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function storeOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    // Provider errors can carry keys, purchase tokens and signed transactions.
    throw new DomainError(
      "store_verification_unavailable",
      "The store could not confirm the current purchase. Restore when connected.",
      503,
    );
  }
}

export class StoreMembershipProviders implements StoreEntitlementVerifier {
  constructor(
    private readonly providers: Partial<
      Record<"apple" | "google", StoreEntitlementVerifier>
    >,
  ) {}
  async verifyAndFetchCurrent(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
    history?: StorePaidHistoryReader,
  ): Promise<VerifiedStoreEntitlement> {
    const provider = this.providers[input.platform];
    invariant(
      provider,
      "store_verification_unconfigured",
      "This store is not configured. No access was granted.",
    );
    return provider.verifyAndFetchCurrent(input, actor, history);
  }
  async acknowledge(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
  ) {
    await this.providers[input.platform]?.acknowledge?.(input, actor);
  }
}
