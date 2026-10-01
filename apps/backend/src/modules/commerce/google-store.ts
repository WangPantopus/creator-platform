import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type {
  StoreEntitlementVerifier,
  VerifiedStoreEntitlement,
} from "./extended.js";
import {
  StoreCatalog,
  googleAccountBinding,
  googlePurchaseReference,
  storeOperation,
} from "./stores.js";

const Purchase = z.object({
  startTime: z.iso.datetime({ offset: true }),
  subscriptionState: z.string(),
  testPurchase: z.object({}).optional(),
  acknowledgementState: z.string(),
  linkedPurchaseToken: z.string().optional(),
  externalAccountIdentifiers: z.object({
    obfuscatedExternalAccountId: z.string(),
  }),
  lineItems: z
    .array(
      z.object({
        productId: z.string(),
        expiryTime: z.iso.datetime({ offset: true }),
        latestSuccessfulOrderId: z.string().optional(),
        autoRenewingPlan: z
          .object({
            autoRenewEnabled: z.boolean(),
            installmentDetails: z.unknown().optional(),
          })
          .optional(),
        offerDetails: z.object({
          basePlanId: z.string(),
          offerId: z.string().optional(),
        }),
        itemReplacement: z.unknown().optional(),
        deferredItemReplacement: z.unknown().optional(),
        offerPhase: z.object({ freeTrial: z.unknown().optional() }).optional(),
      }),
    )
    .min(1)
    .max(100),
});
const Order = z.object({
  orderId: z.string(),
  purchaseToken: z.string(),
  state: z.string(),
  createTime: z.iso.datetime({ offset: true }),
  lineItems: z
    .array(
      z.object({
        productId: z.string(),
        subscriptionDetails: z.object({
          basePlanId: z.string(),
          servicePeriodStartTime: z.iso.datetime({ offset: true }),
          servicePeriodEndTime: z.iso.datetime({ offset: true }),
        }),
      }),
    )
    .min(1),
});

export class GoogleStoreMembership implements StoreEntitlementVerifier {
  private readonly auth: GoogleAuth;
  private readonly identity = new OAuth2Client();
  constructor(
    private readonly catalog: StoreCatalog,
    private readonly config: {
      keyFile: string;
      packageName: string;
      notificationAudience: string;
      notificationServiceAccount: string;
    },
  ) {
    invariant(
      config.keyFile &&
        config.packageName &&
        config.notificationAudience &&
        config.notificationServiceAccount.endsWith(".iam.gserviceaccount.com"),
      "google_configuration_invalid",
      "Configure the approved Play sandbox account, package and authenticated notification endpoint.",
    );
    this.auth = new GoogleAuth({
      keyFile: config.keyFile,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
  }
  private async request(path: string, body?: unknown) {
    const client = await this.auth.getClient();
    return (
      await client.request({
        url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(this.config.packageName)}/${path}`,
        method: body === undefined ? "GET" : "POST",
        ...(body === undefined ? {} : { data: body }),
        timeout: 10000,
        retry: false,
      })
    ).data;
  }
  private async purchase(token: string, actor: Actor) {
    invariant(
      token.length > 0 && token.length <= 4096 && !/\s/u.test(token),
      "store_transaction_invalid",
      "Use the purchase token from the Play system purchase or restore.",
    );
    const purchase = Purchase.parse(
      await this.request(
        `purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
      ),
    );
    invariant(
      purchase.testPurchase &&
        purchase.externalAccountIdentifiers.obfuscatedExternalAccountId ===
          googleAccountBinding(actor.accountId),
      "purchase_link_conflict",
      "This current Play sandbox purchase belongs to another account.",
    );
    return purchase;
  }
  async verifyAndFetchCurrent(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
  ): Promise<VerifiedStoreEntitlement> {
    return storeOperation(async () => {
      invariant(
        input.platform === "google",
        "store_provider_conflict",
        "This purchase belongs to another store.",
      );
      const purchase = await this.purchase(input.transaction, actor);
      const owned = purchase.lineItems.filter(
        (item) => item.latestSuccessfulOrderId,
      );
      invariant(
        owned.length === 1,
        "store_items_reconciliation_required",
        "This subscription needs reviewed item-level reconciliation before access can change.",
      );
      const line = owned[0]!;
      invariant(
        line.autoRenewingPlan &&
          !line.autoRenewingPlan.installmentDetails &&
          !line.offerPhase?.freeTrial,
        "store_plan_unavailable",
        "This membership requires the approved auto-renewing sandbox base plan.",
      );
      const binding = await this.catalog.binding(
        "google",
        line.productId,
        line.offerDetails.basePlanId,
      );
      const order = Order.parse(
        await this.request(
          `orders/${encodeURIComponent(line.latestSuccessfulOrderId!)}`,
        ),
      );
      const orderLines = order.lineItems.filter(
        (item) =>
          item.productId === line.productId &&
          item.subscriptionDetails.basePlanId === line.offerDetails.basePlanId,
      );
      invariant(
        order.orderId === line.latestSuccessfulOrderId &&
          order.purchaseToken === input.transaction &&
          orderLines.length === 1,
        "store_order_invalid",
        "A matching provider order and exact funded service period are required.",
      );
      let root = input.transaction;
      let previous = purchase.linkedPurchaseToken;
      const seen = new Set([root]);
      while (previous) {
        invariant(
          seen.size < 20 && !seen.has(previous),
          "store_lineage_unavailable",
          "The purchase replacement history needs reviewed reconciliation.",
        );
        seen.add(previous);
        root = previous;
        previous = (await this.purchase(previous, actor)).linkedPurchaseToken;
      }
      const state: VerifiedStoreEntitlement["state"] =
        order.state === "REFUNDED"
          ? "refunded"
          : order.state !== "PROCESSED"
            ? "revoked"
            : purchase.subscriptionState === "SUBSCRIPTION_STATE_ACTIVE"
              ? line.autoRenewingPlan.autoRenewEnabled
                ? "active"
                : "cancelled"
              : purchase.subscriptionState ===
                  "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"
                ? "grace"
                : purchase.subscriptionState === "SUBSCRIPTION_STATE_CANCELED"
                  ? "cancelled"
                  : purchase.subscriptionState === "SUBSCRIPTION_STATE_ON_HOLD"
                    ? "past_due"
                    : "revoked";
      const startsAt = new Date(
        orderLines[0]!.subscriptionDetails.servicePeriodStartTime,
      );
      const endsAt = new Date(line.expiryTime);
      invariant(
        endsAt > startsAt,
        "store_period_invalid",
        "The current service period is invalid.",
      );
      return {
        provider: "google",
        reference: googlePurchaseReference(input.transaction),
        originalReference: googlePurchaseReference(root),
        accountId: actor.accountId,
        ...binding,
        state,
        startsAt,
        endsAt,
        purchasedAt: new Date(purchase.startTime),
        cancelAtEnd: !line.autoRenewingPlan.autoRenewEnabled,
      };
    });
  }
  async acknowledge(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
  ) {
    return storeOperation(async () => {
      invariant(
        input.platform === "google",
        "store_provider_conflict",
        "This purchase belongs to another store.",
      );
      const current = await this.purchase(input.transaction, actor);
      if (current.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
        return;
      invariant(
        current.subscriptionState === "SUBSCRIPTION_STATE_ACTIVE" &&
          current.lineItems.length === 1,
        "store_acknowledgement_pending",
        "The current purchase is not ready for acknowledgement.",
      );
      // Called only after the domain grant transaction commits. Retries reuse the
      // same purchase token; no new provider purchase or economic effect is made.
      await this.request(
        `purchases/subscriptions/${encodeURIComponent(current.lineItems[0]!.productId)}/tokens/${encodeURIComponent(input.transaction)}:acknowledge`,
        {},
      );
    });
  }
  async notification(authorization: string, body: unknown) {
    return storeOperation(async () => {
      invariant(
        authorization.startsWith("Bearer "),
        "store_notification_invalid",
        "An authenticated Play notification is required.",
      );
      const ticket = await this.identity.verifyIdToken({
        idToken: authorization.slice(7),
        audience: this.config.notificationAudience,
      });
      const identity = ticket.getPayload();
      invariant(
        identity?.email === this.config.notificationServiceAccount &&
          identity.email_verified === true &&
          ["accounts.google.com", "https://accounts.google.com"].includes(
            identity.iss,
          ),
        "store_notification_invalid",
        "The notification sender is not the approved Pub/Sub service account.",
      );
      const envelope = z
        .object({
          message: z.object({
            messageId: z.string().min(1).max(200),
            data: z.string().min(1).max(65536),
          }),
        })
        .parse(body);
      const event = z
        .object({
          packageName: z.string(),
          subscriptionNotification: z.object({
            purchaseToken: z.string().min(1).max(4096),
            notificationType: z.number().int(),
          }),
        })
        .parse(
          JSON.parse(
            Buffer.from(envelope.message.data, "base64").toString("utf8"),
          ),
        );
      invariant(
        event.packageName === this.config.packageName,
        "store_notification_invalid",
        "The notification belongs to another application.",
      );
      return {
        provider: "google" as const,
        eventId: envelope.message.messageId,
        eventType: `subscription:${event.subscriptionNotification.notificationType}`,
        reference: googlePurchaseReference(
          event.subscriptionNotification.purchaseToken,
        ),
        purchaseToken: event.subscriptionNotification.purchaseToken,
      };
    });
  }
}
