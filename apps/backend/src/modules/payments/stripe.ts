import Stripe from "stripe";
import { DomainError, invariant } from "../../core/errors.js";

/** SDK types and provider/webhook configuration share one explicit API version. */
export function stripeClient(secret: string, apiVersion: string): Stripe {
  invariant(
    secret.startsWith("sk_test_") && apiVersion === Stripe.API_VERSION,
    "stripe_configuration_invalid",
    `Configure a Stripe sandbox with API version ${Stripe.API_VERSION}.`,
  );
  return new Stripe(secret, {
    apiVersion: Stripe.API_VERSION,
    timeout: 10000,
    maxNetworkRetries: 0,
    telemetry: false,
  });
}

export function stripeAccountOptions(
  collectionAccount: string,
): Stripe.RequestOptions {
  invariant(
    collectionAccount === "platform" ||
      /^acct_[A-Za-z0-9]+$/u.test(collectionAccount),
    "billing_topology_required",
    "Configure the approved Stripe collection account.",
  );
  return collectionAccount === "platform"
    ? {}
    : { stripeAccount: collectionAccount };
}

/** Stable domain errors never expose provider responses, identifiers or secrets. */
export async function stripeOperation<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    const rejected =
      error instanceof Stripe.errors.StripeError &&
      Boolean(error.statusCode && error.statusCode < 500) &&
      ![409, 429].includes(error.statusCode!);
    throw new DomainError(
      rejected ? "provider_rejected" : "provider_unknown",
      rejected
        ? "The provider could not complete this change. Refresh its current status."
        : "The provider is still being reconciled. Check again shortly.",
      rejected ? 409 : 503,
    );
  }
}
