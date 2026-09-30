import SwiftUI

public struct ArrivalContext: Sendable { let source: String; let title: String; let creatorName: String }

@MainActor
public final class FanSession: ObservableObject {
    @Published public private(set) var session: APISession?
    @Published public var destination: String
    @Published public var error = ""
    @Published public var busy = false
    @Published public var choosingDevelopmentActor = false
    @Published public private(set) var arrival: ArrivalContext?
    @Published public private(set) var actors: [APIIdentityCapabilitiesDevelopmentActorsItem] = []
    public let api: CreatorAPIClient?
    private let storage: SecureSessionStorage
    private let baseURL: URL?
    private var generation = 0
    private var removedArrivalFor: String?
    public init(baseURL: URL?, destination: String = "/home") {
        self.destination = ApplicationDestination.isPermitted(destination) ? destination : "/home"
        self.baseURL = baseURL
        storage = SecureSessionStorage()
        if let baseURL { let credentials = storage; api = CreatorAPIClient(baseURL: baseURL, token: { try await credentials.read() }) } else { api = nil }
    }
    public func loadArrival() async {
        let snapshot = destination; arrival = nil
        guard snapshot.components(separatedBy: "?")[0] != removedArrivalFor else { return }
        guard let baseURL, snapshot.hasPrefix("/creators/"), let handle = snapshot.split(separator: "/").dropFirst().first?.split(separator: "?").first else { return }
        struct Page: Decodable { let creator: GrowthCreator }
        do {
            let page: Page = try await GrowthClient(baseURL: baseURL, token: { nil }).request("public/creators/" + handle)
            guard destination == snapshot else { return }
            arrival = ArrivalContext(source: "You came from " + page.creator.name + "'s page", title: page.creator.name + " · " + page.creator.category, creatorName: page.creator.name)
        } catch { /* Do not invent creator identity when the public projection is unavailable. */ }
    }
    public func removeArrival() { arrival = nil; removedArrivalFor = destination.components(separatedBy: "?")[0]; destination = removedArrivalFor! }
    public func refresh() async {
        guard let api else { return }
        let current = generation
        do {
            guard try await storage.read() != nil else { session = nil; return }
            let value = try await api.identitySession()
            guard current == generation else { return }
            if let previous = session, previous.accountId != value.accountId { await purge(); error = "The account changed. Continue with Pantopus again."; return }
            session = value; error = ""
        } catch let failure as CreatorAPIError {
            guard current == generation else { return }
            if failure.status == 401 { await purge(); error = "Your session ended. Continue with Pantopus again." }
            else { error = Self.message(failure) }
        } catch { guard current == generation else { return }; self.error = "Reconnect to refresh your account. Actions are unavailable while offline." }
    }
    public func beginSignIn() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        guard let api else { error = QelvoraCopy.text("pantopusUnavailable"); return }
        do {
            let capabilities = try await api.identityCapabilities()
            #if DEBUG
            if capabilities.mode == .development { actors = capabilities.developmentActors ?? []; choosingDevelopmentActor = true; return }
            #endif
            error = "Pantopus account authorization is not connected for this native app. Your destination is kept."
        } catch { self.error = "Sign-in is unavailable. Reconnect and try again." }
    }
    public func selectActor(_ id: String) async {
        #if DEBUG
        guard let api, !busy else { return }; busy = true; defer { busy = false }
        do {
            let continuation = try await api.continueWithPantopus(body: APIIdentityContinue(returnTo: destination))
            guard let challenge = continuation.continuationId else { throw URLError(.badServerResponse) }
            let result = try await api.completeIdentity(body: APICompleteIdentity(continuationId: challenge, code: id))
            await purge(); try await storage.save(result.token)
            destination = result.returnTo; choosingDevelopmentActor = false
            await refresh()
        } catch { self.error = Self.message(error) }
        #endif
    }
    public func saveHandle(_ handle: String, intro: String) async {
        guard let api, !busy else { return }; busy = true; defer { busy = false }
        do { _ = try await api.saveFanProfile(body: APIFanProfileInput(handle: handle, intro: intro)); await refresh() }
        catch { self.error = Self.message(error) }
    }
    public func logout(all: Bool = false) async {
        guard let api else { await purge(); return }
        do { if all { _ = try await api.revokeSessions() } else { _ = try await api.logout() }; await purge() }
        catch let error as CreatorAPIError { if error.status == 401 { await purge() } else { self.error = Self.message(error) } }
        catch { self.error = "Sign-out could not reach the server. Retry to revoke the session." }
    }
    public func refreshCredentials() async {
        guard let api, !busy else { return }; busy = true; let current = generation; defer { busy = false }
        do { let result = try await api.refreshSession(); guard current == generation else { return }; try await storage.save(result.token); await refresh() }
        catch let failure as CreatorAPIError { guard current == generation else { return }; if failure.status == 401 { await purge() }; error = Self.message(failure) }
        catch { self.error = "Session refresh could not complete. Reconnect and try again." }
    }
    public func purge() async { generation += 1; session = nil; actors = []; error = ""; URLCache.shared.removeAllCachedResponses(); try? await storage.save(nil) }
    public func open(_ target: String) { guard ApplicationDestination.isPermitted(target) else { error = "This link is unavailable. Open the object from the app."; return }; removedArrivalFor = nil; destination = target }
    static func message(_ error: Error) -> String { if let failure = error as? CreatorAPIError, let result = try? JSONDecoder().decode(APIError.self, from: failure.body) { return result.error.message }; return "This action could not complete. Reconnect and try again." }
}

/// Owners register real fan screens; absence is explicit, never a fixture success.
@MainActor
public struct FanFeatureRegistration {
    public let matches: (String) -> Bool
    public let screen: (FanSession) -> AnyView
    public let allowsSignedOut: (String) -> Bool
    public init(matches: @escaping (String) -> Bool, allowsSignedOut: @escaping (String) -> Bool = { _ in false }, screen: @escaping (FanSession) -> AnyView) { self.matches = matches; self.screen = screen; self.allowsSignedOut = allowsSignedOut }
}

public struct FanAppShell: View {
    @StateObject private var model: FanSession
    private let features: [FanFeatureRegistration]
    @Environment(\.colorScheme) private var scheme
    public init(baseURL: URL? = nil, returnTo: String = "/home", features: [FanFeatureRegistration] = []) { _model = StateObject(wrappedValue: FanSession(baseURL: baseURL, destination: returnTo)); self.features = features }
    public var body: some View {
        VStack(spacing: 0) {
            if !model.error.isEmpty { Notice(tone: .error, title: "Account status", children: model.error).padding(16) }
            if model.choosingDevelopmentActor {
                VStack(spacing: 16) {
                    Notice(title: "Development identity", children: "Synthetic isolated accounts. Pantopus production sign-in is not connected.")
                    ForEach(model.actors, id: \.id) { actor in Button(actor.label, variant: .secondary, block: true, disabled: model.busy) { Task { await model.selectActor(actor.id) } } }
                    Button("Cancel", variant: .quiet) { model.choosingDevelopmentActor = false }
                }.padding(16)
            } else if model.session == nil, let feature = features.first(where: { $0.matches(model.destination) && $0.allowsSignedOut(model.destination) }) {
                feature.screen(model)
            } else if model.session == nil {
                Welcome(returnTo: model.destination, showContext: model.arrival != nil, contextSource: model.arrival?.source, contextTitle: model.arrival?.title, bodyCopy: model.arrival.map { "Every message says who wrote it: " + $0.creatorName + "'s AI, " + $0.creatorName + ", or their team. You'll always know which." } ?? "Every message says who wrote it: the creator's AI, the creator, or their team. You'll always know which.", onRemoveContext: model.removeArrival, onContinue: { Task { await model.beginSignIn() } }).id(model.arrival?.title)
            } else if model.session?.fan == nil {
                NativeHandleForm(model: model)
            } else {
                VStack(spacing: 0) {
                    if model.session?.mode == .development { Notice(title: "Development identity", children: "Synthetic account · actual local API.").padding(16) }
                    if model.destination == "/you" || model.destination == "/identity/account" {
                        ScrollView { VStack(alignment: .leading, spacing: 16) {
                            Text("Your account").qText("display-md")
                            Text("@" + (model.session?.fan?.handle ?? "")).qText("body")
                            Button("Edit public profile", variant: .secondary, block: true) { model.destination = "/onboarding/handle" }
                            Button("Sign out", variant: .secondary, block: true) { Task { await model.logout() } }
                            Button("Refresh session", variant: .secondary, block: true, disabled: model.busy) { Task { await model.refreshCredentials() } }
                            Button("Sign out on all devices", variant: .quiet, block: true) { Task { await model.logout(all: true) } }
                            Button("Help and reports", variant: .quiet, block: true) { model.open("/support") }
                            Button("Your data", variant: .quiet, block: true) { model.open("/support/privacy") }
                            Button("Notification settings", variant: .quiet, block: true) { model.open("/notifications/settings") }
                            #if os(iOS)
                            if model.session?.creator != nil { CredentialSettings(model: model) }
                            #endif
                        }.padding(16) }
                    } else if model.destination == "/onboarding/handle" { NativeHandleForm(model: model) }
                    else if let feature = features.first(where: { $0.matches(model.destination) }) { feature.screen(model).id((model.session?.accountId ?? "") + model.destination) }
                    else { EmptyState(title: "This destination is not connected yet", body: "Your account and arrival context are kept. Return to your account or try again when this feature is available.") { Button("Your account", variant: .secondary) { model.destination = "/you" } }.frame(maxHeight: .infinity) }
                    TabBar(active: tab) { model.destination = "/" + $0.rawValue.lowercased() }
                }
            }
        }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
            .task { await model.refresh(); while !Task.isCancelled { try? await Task.sleep(for: .seconds(4)); if model.session != nil { await model.refresh() } } }
            .task(id: model.destination) { await model.loadArrival() }
            .onOpenURL { url in
                guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false), components.user == nil, components.password == nil, components.fragment == nil else { model.error = "This link is unavailable."; return }
                let associationHost = Bundle.main.object(forInfoDictionaryKey: "CreatorLinkHost") as? String
                guard (components.scheme == "qelvora" && components.host == "app") || (components.scheme == "https" && associationHost != nil && components.host == associationHost) else { model.error = "This link does not belong to this app."; return }
                let target = components.percentEncodedPath + (components.percentEncodedQuery.map { "?" + $0 } ?? "")
                model.open(target)
            }
    }
    private var tab: FanTab { FanTab.allCases.first(where: { model.destination == "/" + $0.rawValue.lowercased() }) ?? .home }
}

struct NativeHandleForm: View {
    @ObservedObject var model: FanSession
    @State private var handle = ""
    @State private var intro = ""
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        GeometryReader { frame in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    VStack(alignment: .leading, spacing: 24) {
                        HStack {
                            SwiftUI.Button { model.destination = "/you" } label: { QelvoraGlyph(name: "back", size: 22).frame(width: 44, height: 44) }.buttonStyle(.plain).accessibilityLabel("Back")
                            Spacer(); Text("SIGNED IN WITH PANTOPUS").qText("meta")
                        }
                        Text("How creators will know you").qText("display-lg").accessibilityAddTraits(.isHeader)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Handle").qText("caption", weight: .semibold).foregroundStyle(qColor("ink-muted", scheme))
                            handleField.qText("body").textFieldStyle(.plain).padding(.horizontal, 12).frame(minHeight: 44).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(qColor("control-line", scheme), lineWidth: 1)).accessibilityLabel("Public handle").accessibilityHint("A pseudonym is allowed. Three to thirty letters, numbers or underscores.")
                            Text("Creators and their teams see your handle, never your name or city unless you share them in a request.").qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            Text("A LINE ABOUT YOU · OPTIONAL").qText("meta")
                            TextEditor(text: $intro).qText("body").scrollContentBackground(.hidden).frame(minHeight: 90).accessibilityLabel("A line about you, optional").onChange(of: intro) { _, value in if value.count > 240 { intro = String(value.prefix(240)) } }
                            Text("You choose, per creator, whether their AI may use this.").qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                        }.padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(qColor("line", scheme), lineWidth: 1))
                    }
                    Spacer(minLength: 24)
                    Button(model.busy ? "Saving…" : "Continue", variant: .secondary, size: .lg, block: true, disabled: model.busy) { Task { await model.saveHandle(handle, intro: intro); if model.session?.fan != nil && model.destination == "/onboarding/handle" { model.destination = "/you" } } }
                }.frame(minHeight: max(0, frame.size.height - 52)).padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 36)
            }
        }.onAppear { handle = model.session?.fan?.handle ?? ""; intro = model.session?.fan?.intro ?? "" }
    }
    @ViewBuilder private var handleField: some View {
        #if os(iOS)
        TextField("@handle", text: $handle).qDisableAutoCapitalization().autocorrectionDisabled().submitLabel(.next)
        #else
        TextField("@handle", text: $handle)
        #endif
    }
}
