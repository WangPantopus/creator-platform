import { z } from "zod";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { invariant } from "../../core/errors.js";
import { StripePaymentProvider } from "../payments/provider.js";
import type { CommercePolicy } from "./service.js";
import { StripeTierCatalog } from "./stripe-catalog.js";
import { StripeMembershipBilling } from "./stripe-billing.js";
import { readStoreEnvironment } from "./store-environment.js";

/** Local host configuration. Launch economics/providers are injected by the
 * production integrator into createCommerceRuntime; env flags cannot enable AI. */
export function readCommerceEnvironment(
  pool: Pool,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!env.COMMERCE_CURRENCY) return undefined;
  const policy: Omit<CommercePolicy, "costAllowanceIntegrated"> = {
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/u)
      .parse(env.COMMERCE_CURRENCY),
    limitOptions: [],
    passEnabled: false,
  };
  const stripeConfigured = Boolean(
    env.STRIPE_SECRET_KEY ||
      env.STRIPE_API_VERSION ||
      env.STRIPE_PUBLISHABLE_KEY,
  );
  invariant(
    !stripeConfigured ||
      (env.STRIPE_SECRET_KEY &&
        env.STRIPE_API_VERSION &&
        env.STRIPE_COLLECTION_ACCOUNT &&
        env.STRIPE_PUBLISHABLE_KEY?.startsWith("pk_test_")),
    "stripe_configuration_invalid",
    "Configure the matching sandbox keys, approved collection account and pinned API version together.",
  );
  const stores = readStoreEnvironment(pool, env)?.stores;
  if (!stripeConfigured) return { policy, ...(stores ? { stores } : {}) };
  policy.stripePublishableKey = env.STRIPE_PUBLISHABLE_KEY;
  const payments = new StripePaymentProvider(
    env.STRIPE_SECRET_KEY!,
    env.STRIPE_API_VERSION!,
    env.STRIPE_COLLECTION_ACCOUNT!,
  );
  const tierCatalog = env.COMMERCE_STRIPE_PRODUCTS_PATH
    ? new StripeTierCatalog(
        payments.client,
        pool,
        JSON.parse(readFileSync(env.COMMERCE_STRIPE_PRODUCTS_PATH, "utf8")),
        env.STRIPE_COLLECTION_ACCOUNT!,
      )
    : undefined;
  return {
    policy,
    payments,
    ...(stores ? { stores } : {}),
    ...(tierCatalog
      ? {
          tierCatalog,
          billing: new StripeMembershipBilling(
            payments.client,
            (priceId) => tierCatalog.binding(priceId),
            env.STRIPE_COLLECTION_ACCOUNT!,
          ),
        }
      : {}),
  };
}
