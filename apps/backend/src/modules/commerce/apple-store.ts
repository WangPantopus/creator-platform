import {
  AppStoreServerAPIClient,
  SignedDataVerifier,
  Environment,
  Status,
  Type,
  InAppOwnershipType,
  AutoRenewStatus,
  OfferDiscountType,
  GetTransactionHistoryVersion,
  ProductType,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";
import { invariant } from "../../core/errors.js";
import type { Actor } from "../identity/adapter.js";
import type {
  StoreEntitlementVerifier,
  VerifiedStoreEntitlement,
} from "./extended.js";
import { StoreCatalog, storeOperation } from "./stores.js";
import { contentHash } from "../../core/canonical.js";
import type { StorePaidObservation } from "./paid-coverage.js";

/** Genuine Apple API lookup plus certificate/JWS verification. No client expiry,
 * product, account, status or local receipt is an entitlement authority. */
export class AppleStoreMembership implements StoreEntitlementVerifier {
  private readonly client: AppStoreServerAPIClient;
  private readonly verifier: SignedDataVerifier;
  constructor(
    private readonly catalog: StoreCatalog,
    private readonly config: {
      privateKey: string;
      keyId: string;
      issuerId: string;
      bundleId: string;
      rootCertificates: Buffer[];
    },
  ) {
    invariant(
      config.rootCertificates.length > 0 &&
        config.bundleId &&
        config.keyId &&
        config.issuerId,
      "apple_configuration_invalid",
      "Configure the approved Apple sandbox project, key and root certificates.",
    );
    this.client = new AppStoreServerAPIClient(
      config.privateKey,
      config.keyId,
      config.issuerId,
      config.bundleId,
      Environment.SANDBOX,
    );
    this.verifier = new SignedDataVerifier(
      config.rootCertificates,
      true,
      Environment.SANDBOX,
      config.bundleId,
    );
  }
  private owned(transaction: JWSTransactionDecodedPayload, actor: Actor) {
    invariant(
      transaction.environment === Environment.SANDBOX &&
        transaction.bundleId === this.config.bundleId &&
        transaction.type === Type.AUTO_RENEWABLE_SUBSCRIPTION &&
        transaction.inAppOwnershipType === InAppOwnershipType.PURCHASED &&
        transaction.appAccountToken?.toLowerCase() ===
          actor.accountId.toLowerCase() &&
        transaction.transactionId &&
        transaction.originalTransactionId &&
        transaction.productId &&
        transaction.subscriptionGroupIdentifier &&
        Number.isSafeInteger(transaction.purchaseDate) &&
        Number.isSafeInteger(transaction.expiresDate) &&
        transaction.expiresDate! > transaction.purchaseDate!,
      "purchase_link_conflict",
      "The verified subscription must belong to this account, application and sandbox product.",
    );
  }
  private paidObservation(
    transaction: JWSTransactionDecodedPayload,
    revoked = false,
  ): StorePaidObservation {
    const proofHash = contentHash({
      transactionId: transaction.transactionId,
      purchaseDate: transaction.purchaseDate,
      expiresDate: transaction.expiresDate,
      productId: transaction.productId,
      price: transaction.price ?? null,
      currency: transaction.currency ?? null,
      offerDiscountType: transaction.offerDiscountType ?? null,
      offerType: transaction.offerType ?? null,
      revocationDate: transaction.revocationDate ?? null,
      isUpgraded: transaction.isUpgraded ?? false,
      revoked,
    });
    const base = { reference: transaction.transactionId!, proofHash };
    if (revoked || transaction.revocationDate)
      return { ...base, kind: "denied", reason: "refund" };
    if (transaction.isUpgraded)
      return { ...base, kind: "denied", reason: "revoked" };
    if (
      transaction.offerDiscountType === OfferDiscountType.FREE_TRIAL ||
      transaction.price === 0
    )
      return { ...base, kind: "denied", reason: "unpaid" };
    if (
      !Number.isSafeInteger(transaction.price) ||
      transaction.price! <= 0 ||
      !/^[A-Z]{3}$/u.test(transaction.currency ?? "") ||
      (transaction.offerType !== undefined &&
        transaction.offerDiscountType === undefined) ||
      (transaction.offerDiscountType !== undefined &&
        !Object.values(OfferDiscountType).includes(
          transaction.offerDiscountType as OfferDiscountType,
        ))
    )
      return { ...base, kind: "denied", reason: "unconfirmed" };
    return {
      ...base,
      kind: "paid",
      startsAt: new Date(transaction.purchaseDate!),
      endsAt: new Date(transaction.expiresDate!),
      qualification: "apple_signed_positive_price",
    };
  }
  private async paidHistory(
    transaction: JWSTransactionDecodedPayload,
    actor: Actor,
  ) {
    const observations: StorePaidObservation[] = [];
    const revisions = new Set<string>();
    let revision: string | null = null;
    for (let page = 0; page < 100; page++) {
      const history = await this.client.getTransactionHistory(
        transaction.originalTransactionId!,
        revision,
        {
          productIds: [transaction.productId!],
          productTypes: [ProductType.AUTO_RENEWABLE],
        },
        GetTransactionHistoryVersion.V2,
      );
      invariant(
        history.environment === Environment.SANDBOX &&
          history.bundleId === this.config.bundleId &&
          typeof history.hasMore === "boolean" &&
          history.signedTransactions,
        "store_history_unavailable",
        "The current signed store history is incomplete.",
      );
      for (const signed of history.signedTransactions) {
        const entry = await this.verifier.verifyAndDecodeTransaction(signed);
        this.owned(entry, actor);
        invariant(
          entry.originalTransactionId === transaction.originalTransactionId &&
            entry.productId === transaction.productId &&
            entry.subscriptionGroupIdentifier ===
              transaction.subscriptionGroupIdentifier,
          "store_history_conflict",
          "The paid history must match this exact owned subscription.",
        );
        observations.push(this.paidObservation(entry));
        invariant(
          observations.length <= 998,
          "store_history_reconciliation_required",
          "The complete store history needs reconciliation before restoring access.",
        );
      }
      if (!history.hasMore) return observations;
      invariant(
        history.revision && !revisions.has(history.revision),
        "store_history_unavailable",
        "The store history cursor did not advance.",
      );
      revisions.add(history.revision);
      revision = history.revision;
    }
    invariant(
      false,
      "store_history_reconciliation_required",
      "The complete store history needs reconciliation before restoring access.",
    );
  }
  async verifyAndFetchCurrent(
    input: { platform: "apple" | "google"; transaction: string },
    actor: Actor,
  ): Promise<VerifiedStoreEntitlement> {
    return storeOperation(async () => {
      invariant(
        input.platform === "apple",
        "store_provider_conflict",
        "This purchase belongs to another store.",
      );
      const submitted = input.transaction.includes(".")
        ? await this.verifier.verifyAndDecodeTransaction(input.transaction)
        : undefined;
      if (submitted) this.owned(submitted, actor);
      const id = submitted?.transactionId ?? input.transaction;
      invariant(
        /^\d{1,40}$/u.test(id),
        "store_transaction_invalid",
        "Use the App Store transaction supplied by the system purchase or restore.",
      );
      const fetched = await this.client.getTransactionInfo(id);
      invariant(
        fetched.signedTransactionInfo,
        "store_transaction_invalid",
        "Current signed transaction information is required.",
      );
      const initial = await this.verifier.verifyAndDecodeTransaction(
        fetched.signedTransactionInfo,
      );
      this.owned(initial, actor);
      const status = await this.client.getAllSubscriptionStatuses(
        initial.originalTransactionId!,
      );
      invariant(
        status.environment === Environment.SANDBOX &&
          status.bundleId === this.config.bundleId,
        "store_environment_conflict",
        "Current subscription status belongs to another application or environment.",
      );
      const matches = (status.data ?? [])
        .flatMap((group) => group.lastTransactions ?? [])
        .filter(
          (item) =>
            item.originalTransactionId === initial.originalTransactionId,
        );
      invariant(
        matches.length === 1 &&
          matches[0]!.signedTransactionInfo &&
          matches[0]!.signedRenewalInfo,
        "store_status_unavailable",
        "The current owned subscription needs one signed transaction and renewal status.",
      );
      const current = matches[0]!;
      const [transaction, renewal] = await Promise.all([
        this.verifier.verifyAndDecodeTransaction(
          current.signedTransactionInfo!,
        ),
        this.verifier.verifyAndDecodeRenewalInfo(current.signedRenewalInfo!),
      ]);
      this.owned(transaction, actor);
      invariant(
        transaction.originalTransactionId === initial.originalTransactionId &&
          renewal.originalTransactionId === transaction.originalTransactionId &&
          renewal.environment === Environment.SANDBOX &&
          renewal.productId === transaction.productId &&
          !transaction.isUpgraded,
        "store_replacement_reconciliation_required",
        "Restore the current replacement transaction before changing membership access.",
      );
      const binding = await this.catalog.binding(
        "apple",
        transaction.productId!,
        transaction.subscriptionGroupIdentifier!,
      );
      let state: VerifiedStoreEntitlement["state"] = "revoked";
      let endsAt = transaction.expiresDate!;
      if (transaction.revocationDate || current.status === Status.REVOKED)
        state = "refunded";
      else if (current.status === Status.ACTIVE && endsAt > Date.now())
        state =
          renewal.autoRenewStatus === AutoRenewStatus.OFF
            ? "cancelled"
            : "active";
      else if (
        current.status === Status.BILLING_GRACE_PERIOD &&
        renewal.gracePeriodExpiresDate &&
        renewal.gracePeriodExpiresDate > Date.now()
      ) {
        state = "grace";
        endsAt = renewal.gracePeriodExpiresDate;
      } else if (current.status === Status.BILLING_RETRY) state = "past_due";
      const paidObservations = await this.paidHistory(transaction, actor);
      paidObservations.push(
        this.paidObservation(initial),
        this.paidObservation(transaction, current.status === Status.REVOKED),
      );
      return {
        provider: "apple",
        reference: transaction.transactionId!,
        originalReference: transaction.originalTransactionId!,
        accountId: actor.accountId,
        ...binding,
        state,
        startsAt: new Date(transaction.purchaseDate!),
        endsAt: new Date(endsAt),
        purchasedAt: new Date(
          transaction.originalPurchaseDate ?? transaction.purchaseDate!,
        ),
        cancelAtEnd: renewal.autoRenewStatus === AutoRenewStatus.OFF,
        paidObservations,
      };
    });
  }
  async notification(signedPayload: string) {
    return storeOperation(async () => {
      const payload =
        await this.verifier.verifyAndDecodeNotification(signedPayload);
      invariant(
        payload.notificationUUID &&
          payload.notificationType &&
          payload.data?.environment === Environment.SANDBOX &&
          payload.data.bundleId === this.config.bundleId &&
          payload.data.signedTransactionInfo,
        "store_notification_invalid",
        "This notification has no matching sandbox subscription.",
      );
      const transaction = await this.verifier.verifyAndDecodeTransaction(
        payload.data.signedTransactionInfo,
      );
      invariant(
        transaction.originalTransactionId &&
          transaction.transactionId &&
          transaction.appAccountToken,
        "store_notification_invalid",
        "The signed notification needs a bound purchase account.",
      );
      // A verified signal only. W8 issues the current account/job scope and the
      // worker calls verifyAndFetchCurrent; notification status never grants access.
      return {
        provider: "apple" as const,
        eventId: payload.notificationUUID,
        eventType: payload.notificationType,
        reference: transaction.transactionId,
        accountId: transaction.appAccountToken,
      };
    });
  }
}
