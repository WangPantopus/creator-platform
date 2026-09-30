import { createHmac, timingSafeEqual } from "node:crypto";
import { DomainError } from "../../core/errors.js";

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
  constructor(
    private readonly secret: string,
    private readonly version: string,
  ) {
    if (!secret.startsWith("sk_test_") || !version)
      throw new Error(
        "W4 payments require an explicitly configured Stripe sandbox and API version.",
      );
  }
  async request(
    path: string,
    method: "GET" | "POST",
    values: Record<string, string> = {},
    key?: string,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${this.secret}`,
        "Stripe-Version": this.version,
        ...(method === "POST"
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(method === "POST" ? { body: new URLSearchParams(values) } : {}),
    });
    const body = (await response.json()) as Record<string, unknown>;
    // Never log the response: it can contain billing identifiers or a client secret.
    if (!response.ok)
      throw new DomainError(
        response.status >= 500 ? "provider_unknown" : "provider_rejected",
        response.status >= 500
          ? "Confirming payment. Check this request again shortly."
          : "Payment did not go through. No acceptance was recorded.",
        response.status >= 500 ? 503 : 409,
      );
    return body;
  }
  private intent(body: Record<string, unknown>): Intent {
    const charge = body.latest_charge as {
      payment_method_details?: { card?: { capture_before?: number } };
      amount_refunded?: number;
    } | null;
    const timestamp = charge?.payment_method_details?.card?.capture_before;
    return {
      id: String(body.id),
      amount: Number(body.amount),
      currency: String(body.currency).toUpperCase(),
      status: body.status as Intent["status"],
      captureBefore: timestamp ? new Date(timestamp * 1000) : null,
      clientSecret:
        typeof body.client_secret === "string" ? body.client_secret : null,
      amountReceived: Number(body.amount_received ?? 0),
      refunded: Number(charge?.amount_refunded ?? 0),
      metadata: (body.metadata ?? {}) as Record<string, string>,
    };
  }
  async authorize(input: {
    packetId: string;
    amount: number;
    currency: string;
    paymentMethodId: string;
    key: string;
  }) {
    return this.intent(
      await this.request(
        "payment_intents",
        "POST",
        {
          amount: String(input.amount),
          currency: input.currency.toLowerCase(),
          payment_method: input.paymentMethodId,
          capture_method: "manual",
          confirm: "true",
          "payment_method_types[]": "card",
          use_stripe_sdk: "true",
          "metadata[packet_id]": input.packetId,
          "expand[]": "latest_charge",
        },
        input.key,
      ),
    );
  }
  async fetchIntent(id: string) {
    return this.intent(
      await this.request(
        `payment_intents/${encodeURIComponent(id)}?expand[]=latest_charge`,
        "GET",
      ),
    );
  }
  async capture(id: string, key: string) {
    return this.intent(
      await this.request(
        `payment_intents/${encodeURIComponent(id)}/capture`,
        "POST",
        { "expand[]": "latest_charge" },
        key,
      ),
    );
  }
  async release(id: string, key: string) {
    return this.intent(
      await this.request(
        `payment_intents/${encodeURIComponent(id)}/cancel`,
        "POST",
        { "expand[]": "latest_charge" },
        key,
      ),
    );
  }
  async refund(id: string, amount: number, key: string) {
    const body = await this.request(
      "refunds",
      "POST",
      { payment_intent: id, amount: String(amount) },
      key,
    );
    return {
      id: String(body.id),
      state: String(body.status) as "pending" | "succeeded" | "failed",
    };
  }
  async fetchRefund(id: string) {
    const body = await this.request(`refunds/${encodeURIComponent(id)}`, "GET");
    return {
      id: String(body.id),
      state: String(body.status) as "pending" | "succeeded" | "failed",
    };
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
