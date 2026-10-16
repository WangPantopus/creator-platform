import Foundation
import StoreKit
import SwiftUI

/// StoreKit verifies locally; only the configured server may deliver entitlements.
@MainActor
public final class StoreMembershipCoordinator: ObservableObject {
    @Published public private(set) var products: [Product] = []
    @Published public private(set) var status = ""
    @Published public private(set) var busy = false
    private var updates: Task<Void,Never>?
    private var active = false
    private let deliver: @Sendable (String) async throws -> Bool
    public init(deliver: @escaping @Sendable (String) async throws -> Bool) { self.deliver = deliver }
    deinit { updates?.cancel() }
    public func stop() { active = false; updates?.cancel(); updates = nil; products = []; status = "" }
    public func start() {
        guard updates == nil else { return }
        active = true
        updates = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard !Task.isCancelled, let self, self.active else { return }
                await self.reconcile(result)
            }
        }
    }
    public func load(productIDs: [String]) async {
        products = []
        guard !productIDs.isEmpty else { status = QelvoraCopy.text("nativeMembershipProductsAreNotConfigured"); return }
        do {
            let value = try await Product.products(for: productIDs)
            try Task.checkCancellation(); guard active else { return }
            products = value.filter { $0.type == .autoRenewable && $0.subscription?.subscriptionPeriod.unit == .month && $0.subscription?.subscriptionPeriod.value == 1 }.sorted { $0.id < $1.id }; status = products.isEmpty ? QelvoraCopy.text("nativeTheAppStoreHasNoAvailable") : ""
        }
        catch { if active && !Task.isCancelled { status = QelvoraCopy.text("nativeTheAppStoreIsUnavailableReconnect") } }
    }
    public func purchase(_ product: Product, accountID: String) async {
        guard active, !Task.isCancelled, !busy, let token = UUID(uuidString: accountID), products.contains(where: {$0.id == product.id}) else { return }
        busy = true; defer { busy = false }
        do {
            let result = try await product.purchase(options: [.appAccountToken(token)])
            try Task.checkCancellation(); guard active else { return }
            switch result {
            case .success(let result): await reconcile(result)
            case .pending: status = QelvoraCopy.text("nativePurchaseIsPendingWithTheApp")
            case .userCancelled: status = QelvoraCopy.text("nativePurchaseCancelledNothingChanged")
            @unknown default: status = QelvoraCopy.text("nativePurchaseStatusIsUnavailableRestore")
            }
        } catch { if active && !Task.isCancelled { status = QelvoraCopy.text("nativePurchaseDidNotCompleteCheckThe") } }
    }
    public func restore() async {
        guard active, !Task.isCancelled, !busy else { return }; busy = true; defer { busy = false }
        do {
            // User-initiated only: this may display the platform's authentication sheet.
            try await AppStore.sync()
            try Task.checkCancellation(); guard active else { return }
            for await result in StoreKit.Transaction.currentEntitlements { guard active && !Task.isCancelled else { return }; await reconcile(result) }
            if status.isEmpty { status = QelvoraCopy.text("nativeCurrentPurchasesWereSentToThe") }
        } catch { if active && !Task.isCancelled { status = QelvoraCopy.text("nativeRestoreCouldNotReachTheApp") } }
    }
    private func reconcile(_ result: VerificationResult<StoreKit.Transaction>) async {
        guard active, !Task.isCancelled else { return }
        switch result {
        case .unverified: status = QelvoraCopy.text("nativeTheAppStoreTransactionCouldNot")
        case .verified(let transaction):
            do {
                // Keep unfinished transactions recoverable until server verification is durable.
                let confirmed = try await deliver(result.jwsRepresentation)
                try Task.checkCancellation()
                guard active else { return }
                guard confirmed else { status = QelvoraCopy.text("nativeServerVerificationIsProcessing"); return }
                await transaction.finish()
                guard active, !Task.isCancelled else { return }
                status = QelvoraCopy.text("nativePurchaseVerifiedByTheServerRefreshing")
            } catch { if active && !Task.isCancelled { status = QelvoraCopy.text("nativeServerVerificationIsUnavailable") } }
        }
    }
}
