import StoreKit
import SwiftUI

/// W1 host bridge: W4 owns product verification and entitlement state.
@MainActor
struct StoreMembershipPane: View {
    let productIDs: [String]
    let accountID: String
    @StateObject private var coordinator: StoreMembershipCoordinator
    init(baseURL: URL, productIDs: [String], accountID: String) {
        self.productIDs = productIDs; self.accountID = accountID
        let client = CommerceClient(baseURL: baseURL)
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
                Button(product.displayName + " · " + product.displayPrice, variant: .secondary, block: true, disabled: coordinator.busy) { Task { await coordinator.purchase(product, accountID: accountID) } }
            }
            Button("Restore purchases", variant: .quiet, disabled: coordinator.busy) { Task { await coordinator.restore() } }
            if !coordinator.status.isEmpty { Notice(title: "Store status", children: coordinator.status) }
        }.task { coordinator.start(); await coordinator.load(productIDs: productIDs) }
    }
}
