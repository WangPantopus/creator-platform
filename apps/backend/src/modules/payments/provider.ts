import { createHmac, timingSafeEqual } from "node:crypto";
import Stripe from "stripe";
import { z } from "zod";
import { DomainError, invariant } from "../../core/errors.js";
import {
  stripeAccountOptions,
  stripeClient,
  stripeOperation,
} from "./stripe.js";

export type Intent = {
  id: string;
  amount: number;
  currency: string;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "requires_capture"
    | "canceled"
    | "succeeded";
  captureBefore: Date | null;
  clientSecret: string | null;
  amountReceived: number;
  refunded: number;
  metadata: Record<string, string>;
};
export interface PaymentProvider {
  readonly name: string;
  authorize(input: {
    packetId: string;
    amount: number;
    currency: string;
    paymentMethodId: string;
    key: string;
  }): Promise<Intent>;
  fetchIntent(id: string): Promise<Intent>;
  capture(id: string, key: string): Promise<Intent>;
  release(id: string, key: string): Promise<Intent>;
  refund(
    id: string,
    amount: number,
    key: string,
  ): Promise<{ id: string; state: "pending" | "succeeded" | "failed" }>;
  fetchRefund(
    id: string,
  ): Promise<{ id: string; state: "pending" | "succeeded" | "failed" }>;
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  readonly client: Stripe;
  private readonly options: Stripe.RequestOptions;
  constructor(secret: string, version: string, collectionAccount = "platform") {
    this.client = stripeClient(secret, version);
    this.options = stripeAccountOptions(collectionAccount);
  }
  private intent(body: Stripe.PaymentIntent): Intent {
    invariant(
      !body.livemode,
      "provider_environment_mismatch",
      "Sandbox payment truth is required.",
    );
    const charge = body.latest_charge;
    invariant(
      charge === null || typeof charge !== "string",
      "provider_incomplete",
      "The current charge must be retrieved before settlement.",
    );
    const captured = charge?.payment_method_details?.card?.capture_before;
    return {
      id: body.id,
      amount: body.amount,
      currency: body.currency.toUpperCase(),
      status: z
        .enum([
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
          "processing",
          "requires_capture",
          "canceled",
          "succeeded",
        ])
        .parse(body.status),
      captureBefore: captured ? new Date(captured * 1000) : null,
      clientSecret: body.client_secret,
      amountReceived: body.amount_received,
      refunded: charge?.amount_refunded ?? 0,
      metadata: body.metadata,
    };
  }
  async authorize(input: Parameters<PaymentProvider["authorize"]>[0]) {
    return stripeOperation(async () => {
      try {
        return this.intent(
          await this.client.paymentIntents.create(
            {
              amount: input.amount,
              currency: input.currency.toLowerCase(),
              payment_method: input.paymentMethodId,
              capture_method: "manual",
              confirm: true,
              payment_method_types: ["card"],
              use_stripe_sdk: true,
              metadata: { packet_id: input.packetId },
              expand: ["latest_charge"],
            },
            { ...this.options, idempotencyKey: input.key },
          ),
        );
      } catch (error) {
        // A card rejection can still create an intent. Preserve that reference so
        // failed authorization releases capacity from current truth rather than a guess.
        if (
          error instanceof Stripe.errors.StripeCardError &&
          error.payment_intent
        ) {
          const reference =
            typeof error.payment_intent === "string"
              ? error.payment_intent
              : error.payment_intent.id;
          return this.fetchIntent(reference);
        }
        throw error;
      }
    });
  }
  async fetchIntent(id: string) {
    return stripeOperation(async () =>
      this.intent(
        await this.client.paymentIntents.retrieve(
          id,
          {
            expand: ["latest_charge"],
          },
          this.options,
        ),
      ),
    );
  }
  async capture(id: string, key: string) {
    return stripeOperation(async () =>
      this.intent(
        await this.client.paymentIntents.capture(
          id,
          { expand: ["latest_charge"] },
          { ...this.options, idempotencyKey: key },
        ),
      ),
    );
  }
  async release(id: string, key: string) {
    return stripeOperation(async () =>
      this.intent(
        await this.client.paymentIntents.cancel(
          id,
          { expand: ["latest_charge"] },
          { ...this.options, idempotencyKey: key },
        ),
      ),
    );
  }
  private refundResult(body: Stripe.Refund) {
    // Unknown/new statuses remain pending. They must never be treated as confirmed cash.
    return {
      id: body.id,
      state:
        body.status === "succeeded"
          ? ("succeeded" as const)
          : ["failed", "canceled"].includes(body.status ?? "")
            ? ("failed" as const)
            : ("pending" as const),
    };
  }
  async refund(id: string, amount: number, key: string) {
    return stripeOperation(async () =>
      this.refundResult(
        await this.client.refunds.create(
          { payment_intent: id, amount },
          { ...this.options, idempotencyKey: key },
        ),
      ),
    );
  }
  async fetchRefund(id: string) {
    return stripeOperation(async () =>
      this.refundResult(
        await this.client.refunds.retrieve(id, {}, this.options),
      ),
    );
  }
}

/** Raw-body verification only; a verified event triggers a current-state fetch. */
export function verifyStripeWebhook(
  raw: Buffer,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const fields = signature.split(",").map((v) => v.split("="));
  const timestamp = Number(fields.find((v) => v[0] === "t")?.[1]);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > 300
  )
    throw new DomainError(
      "webhook_signature_invalid",
      "The notification signature is unavailable.",
      400,
    );
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest();
  if (
    !fields.some(([name, value]) => {
      const candidate = Buffer.from(value ?? "", "hex");
      return (
        name === "v1" &&
        candidate.length === expected.length &&
        timingSafeEqual(expected, candidate)
      );
    })
  )
    throw new DomainError(
      "webhook_signature_invalid",
      "The notification signature is unavailable.",
      400,
    );
  const event = JSON.parse(raw.toString("utf8")) as {
    id?: string;
    type?: string;
    data?: { object?: { id?: string } };
  };
  if (!event.id || !event.type || !event.data?.object?.id)
    throw new DomainError(
      "webhook_invalid",
      "This notification is incomplete.",
      400,
    );
  return { id: event.id, type: event.type, reference: event.data.object.id };
}
