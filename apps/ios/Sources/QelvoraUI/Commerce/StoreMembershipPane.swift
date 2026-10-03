import StoreKit
import SwiftUI

/// W1 host bridge: W4 owns product verification and entitlement state.
@MainActor
struct StoreMembershipPane: View {
    let productIDs: [String]
    let accountID: String
    let available: Bool
    let onVerified: @MainActor () async -> Void
    @StateObject private var coordinator: StoreMembershipCoordinator
    @State private var operation: Task<Void, Never>?
    @State private var refreshOperation: Task<Void, Never>?
    init(client: CommerceClient, productIDs: [String], accountID: String, available: Bool, onVerified: @escaping @MainActor () async -> Void = {}) {
        self.productIDs = productIDs; self.accountID = accountID
        self.available = available
        self.onVerified = onVerified
        _coordinator = StateObject(wrappedValue: StoreMembershipCoordinator { transaction in
            struct Delivery: Decodable, Sendable { let serverVerified: Bool }
            let body = try JSONSerialization.data(withJSONObject: ["platform": "apple", "transaction": transaction])
            let value: Delivery = try await client.request("stores/verify", body: body)
            return value.serverVerified
        })
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(coordinator.products, id: \.id) { product in
                Button(product.displayName + " · " + product.displayPrice, variant: .secondary, block: true, disabled: coordinator.busy || !available) { operation?.cancel(); operation = Task { await coordinator.purchase(product, accountID: accountID) } }
            }
            Button("Restore purchases", variant: .quiet, disabled: coordinator.busy || !available) { operation?.cancel(); operation = Task { await coordinator.restore() } }
            StoreSubscriptionManagement(disabled: coordinator.busy)
            if !coordinator.status.isEmpty { Notice(title: "Store status", children: coordinator.status) }
        }.task(id: productIDs) { coordinator.start(); await coordinator.load(productIDs: productIDs) }
            .onDisappear { operation?.cancel(); operation = nil; refreshOperation?.cancel(); refreshOperation = nil; coordinator.stop() }
            .onChange(of: coordinator.status) { _, value in
                if value == "Purchase verified by the server. Refreshing access." { refreshOperation?.cancel(); refreshOperation = Task { await onVerified() } }
            }
    }
}

/// Store account management remains available when app purchase verification is offline.
@MainActor
struct StoreSubscriptionManagement: View {
    var disabled = false
    @State private var presented = false
    var body: some View {
        #if os(iOS)
        Button("Manage in the App Store", variant: .quiet, disabled: disabled) { presented = true }
            .manageSubscriptionsSheet(isPresented: $presented)
        #else
        EmptyView()
        #endif
    }
}
