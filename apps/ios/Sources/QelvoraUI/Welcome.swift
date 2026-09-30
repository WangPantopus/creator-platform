import SwiftUI

public struct PantopusIdentity: Sendable {
    public let accountID: UUID
    public init(accountID: UUID) { self.accountID = accountID }
}

public enum PantopusSignInError: Error, Sendable { case unavailable }

/// The later Pantopus adapter owns credentials and returns no neighborhood profile data.
public protocol PantopusSignInProvider: Sendable {
    func signIn(returnTo: String) async throws -> PantopusIdentity
}

public struct UnavailablePantopusSignIn: PantopusSignInProvider {
    public init() {}
    public func signIn(returnTo: String) async throws -> PantopusIdentity { throw PantopusSignInError.unavailable }
}

public struct Welcome: View {
    public var returnTo: String
    public var signIn: any PantopusSignInProvider
    public var onAuthenticated: (PantopusIdentity, String) -> Void
    public var onContinue: (() -> Void)?
    public var contextSource: String?
    public var contextTitle: String?
    public var bodyCopy: String?
    public var onRemoveContext: (() -> Void)?
    @State private var hasContext = true
    @State private var connecting = false
    @State private var signInUnavailable = false
    @Environment(\.colorScheme) private var scheme

    public init(returnTo: String = "/creators/maya", signIn: any PantopusSignInProvider = UnavailablePantopusSignIn(), showContext: Bool = true, contextSource: String? = nil, contextTitle: String? = nil, bodyCopy: String? = nil, onRemoveContext: (() -> Void)? = nil, onContinue: (() -> Void)? = nil, onAuthenticated: @escaping (PantopusIdentity, String) -> Void = { _, _ in }) {
        self.returnTo = returnTo; self.signIn = signIn; self.onAuthenticated = onAuthenticated
        self.onContinue = onContinue; _hasContext = State(initialValue: showContext)
        self.contextSource = contextSource; self.contextTitle = contextTitle; self.bodyCopy = bodyCopy; self.onRemoveContext = onRemoveContext
    }

    public var body: some View {
        GeometryReader { frame in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text(QelvoraCopy.brandName)
                        .font(QelvoraFonts.font("serif", size: QelvoraTokens.token("welcome-wordmark"), italic: true))
                    VStack(alignment: .leading, spacing: QelvoraTokens.token("welcome-gap")) {
                        welcomeIdentity
                        Text(QelvoraCopy.text("welcomeTitle"))
                            .modifier(QelvoraTextStyle(style: QelvoraTokens.TextStyle(family: "serif", size: QelvoraTokens.token("welcome-title"), lineHeight: QelvoraTokens.token("welcome-title-line"), weight: 400, letterSpacing: -0.025)))
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityAddTraits(.isHeader)
                        Text(bodyCopy ?? QelvoraCopy.text("welcomeBody")).qText("body").foregroundStyle(qColor("ink-muted", scheme))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .padding(.vertical, QelvoraTokens.token("space-6"))
                    VStack(spacing: QelvoraTokens.token("message-padding")) {
                        if hasContext { ContextCard(source: contextSource ?? QelvoraCopy.text("welcomeSource"), title: contextTitle ?? QelvoraCopy.text("welcomeContext"), onRemove: { hasContext = false; onRemoveContext?() }) }
                        Button(QelvoraCopy.text("continueWithPantopus"), variant: .secondary, size: .lg, block: true, disabled: connecting, action: continueWithPantopus)
                            .accessibilityIdentifier("continue-with-pantopus")
                        Text(QelvoraCopy.text("pantopusAccount")).qText("caption").foregroundStyle(qColor("ink-muted", scheme)).multilineTextAlignment(.center)
                        if signInUnavailable { Text(QelvoraCopy.text("pantopusUnavailable")).qText("caption").foregroundStyle(qColor("alert", scheme)).accessibilityIdentifier("pantopus-unavailable") }
                    }
                }
                .padding(.horizontal, QelvoraTokens.token("space-6"))
                .padding(.top, QelvoraTokens.token("welcome-top"))
                .padding(.bottom, QelvoraTokens.token("welcome-bottom"))
                .frame(minHeight: frame.size.height)
            }
            .scrollIndicators(.hidden)
            .foregroundStyle(qColor("ink", scheme))
            .background(qColor("ground", scheme))
        }
        .task { QelvoraFonts.register() }
    }

    private var welcomeIdentity: some View {
        Canvas { context, _ in
            context.stroke(Path(ellipseIn: CGRect(x: 6, y: 6, width: 44, height: 44)), with: .color(qColor("ai-ink", scheme)), lineWidth: 2)
            context.fill(Path(ellipseIn: CGRect(x: 23, y: 23, width: 10, height: 10)), with: .color(qColor("ai-ink", scheme)))
            context.fill(Path(ellipseIn: CGRect(x: 54, y: 2, width: 52, height: 52)), with: .color(qColor("maya-surface", scheme)))
            context.fill(Path(ellipseIn: CGRect(x: 68, y: 16, width: 24, height: 24)), with: .color(qColor("maya-accent", scheme)))
        }.frame(width: QelvoraTokens.token("welcome-mark-width"), height: QelvoraTokens.token("welcome-mark-height")).accessibilityHidden(true)
    }

    private func continueWithPantopus() {
        if let onContinue { onContinue(); return }
        guard !connecting else { return }
        connecting = true; signInUnavailable = false
        Task { @MainActor in
            defer { connecting = false }
            do { onAuthenticated(try await signIn.signIn(returnTo: returnTo), returnTo) }
            catch { signInUnavailable = true }
        }
    }
}
