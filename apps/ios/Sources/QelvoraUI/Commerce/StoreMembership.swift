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
    private let deliver: @Sendable (String) async throws -> Bool
    public init(deliver: @escaping @Sendable (String) async throws -> Bool) { self.deliver = deliver }
    deinit { updates?.cancel() }
    public func start() {
        guard updates == nil else { return }
        updates = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard !Task.isCancelled, let self else { return }
                await self.reconcile(result)
            }
        }
    }
    public func load(productIDs: [String]) async {
        guard !productIDs.isEmpty else { status = "Membership products are not configured."; return }
        do { products = try await Product.products(for: productIDs).sorted { $0.id < $1.id }; status = products.isEmpty ? "The App Store has no available products for this catalog." : "" }
        catch { status = "The App Store is unavailable. Reconnect to try again." }
    }
    public func purchase(_ product: Product, accountID: String) async {
        guard !busy, let token = UUID(uuidString: accountID), products.contains(where: {$0.id == product.id}) else { return }
        busy = true; defer { busy = false }
        do {
            switch try await product.purchase(options: [.appAccountToken(token)]) {
            case .success(let result): await reconcile(result)
            case .pending: status = "Purchase is pending with the App Store. No access has been granted."
            case .userCancelled: status = "Purchase cancelled. Nothing changed."
            @unknown default: status = "Purchase status is unavailable. Restore to check the current state."
            }
        } catch { status = "Purchase did not complete. Check the App Store and try again." }
    }
    public func restore() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            // User-initiated only: this may display the platform's authentication sheet.
            try await AppStore.sync()
            for await result in StoreKit.Transaction.currentEntitlements { await reconcile(result) }
            if status.isEmpty { status = "Current purchases were sent to the server for verification." }
        } catch { status = "Restore could not reach the App Store. No local receipt grants access." }
    }
    private func reconcile(_ result: VerificationResult<StoreKit.Transaction>) async {
        switch result {
        case .unverified: status = "The App Store transaction could not be verified. No access was granted."
        case .verified(let transaction):
            do {
                // Keep unfinished transactions recoverable until server verification is durable.
                guard try await deliver(result.jwsRepresentation) else { status = "Server verification is processing. Access will refresh when confirmed."; return }
                await transaction.finish(); status = "Purchase verified by the server. Refreshing access."
            } catch { status = "Server verification is unavailable. This purchase remains recoverable; restore when connected." }
        }
    }
}
