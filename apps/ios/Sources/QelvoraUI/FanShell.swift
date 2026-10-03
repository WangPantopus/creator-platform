import SwiftUI

public struct ArrivalContext: Sendable { let source: String; let title: String; let creatorName: String }

/// A client lifetime capture from this model's actual issuer-bound storage.
/// It grants no server permission. Check isCurrent before an operation and
/// again before applying its result or handing a credential to a provider.
@MainActor
public final class FanSessionRequestCapture {
    public let client: CreatorAPIClient
    public let expectedAccountId: String
    public let sessionId: String
    public let destination: String
    fileprivate weak var owner: FanSession?
    fileprivate let generation: Int
    fileprivate let destinationGeneration: Int
    fileprivate let credential: String
    fileprivate init(owner: FanSession, client: CreatorAPIClient, accountId: String,
                     sessionId: String, destination: String, generation: Int,
                     destinationGeneration: Int, credential: String) {
        self.owner = owner; self.client = client; expectedAccountId = accountId
        self.sessionId = sessionId; self.destination = destination
        self.generation = generation; self.destinationGeneration = destinationGeneration
        self.credential = credential
    }
    public func isCurrent() async -> Bool { await owner?.requestCaptureIsCurrent(self) ?? false }
}

@MainActor
public final class FanSession: ObservableObject {
    @Published public private(set) var session: APISession?
    @Published public private(set) var hasSavedCredential = false
    @Published public private(set) var checkingSession: Bool
    @Published public var destination: String {
        didSet {
            if destination != oldValue {
                destinationGeneration &+= 1
                navigationRestoreAllowed = false
                persistDestination()
            }
        }
    }
    @Published public var error = ""
    @Published public var busy = false
    @Published public var choosingDevelopmentActor = false
    @Published public private(set) var arrival: ArrivalContext?
    @Published public private(set) var actors: [APIIdentityCapabilitiesDevelopmentActorsItem] = []
    @Published public private(set) var localPurgeFailed = false
    @Published public private(set) var purgingPrivateState = false
    public let api: CreatorAPIClient?
    private let storage: SecureSessionStorage
    private let baseURL: URL?
    private var generation = 0
    private var destinationGeneration = 0
    private var rotatingCredential = false
    private var refreshingSession = false
    private var removedArrivalFor: String?
    private var navigationInitialized = false
    private var navigationRestoreAllowed: Bool
    private var navigationRevision = 0
    public init(baseURL: URL?, destination: String = "/home") {
        self.destination = ApplicationDestination.isPermitted(destination) ? destination : "/home"
        navigationRestoreAllowed = destination == "/home"
        self.baseURL = baseURL
        checkingSession = baseURL != nil
        storage = SecureSessionStorage(issuer: baseURL)
        if let baseURL { let credentials = storage; api = CreatorAPIClient(baseURL: baseURL, token: { try await credentials.read() }) } else { api = nil }
    }
    private func persistDestination() {
        guard navigationInitialized, let active = session, !purgingPrivateState, !localPurgeFailed,
              ApplicationDestination.isPermitted(destination) else { return }
        let target = destination, snapshot = generation
        navigationRevision += 1
        let revision = navigationRevision
        Task { [weak self] in
            guard let self, snapshot == generation, session?.accountId == active.accountId,
                  session?.sessionId == active.sessionId else { return }
            do {
                guard let credential = try await storage.read(), snapshot == generation,
                      session?.accountId == active.accountId, session?.sessionId == active.sessionId else { return }
                try await storage.saveDestination(target, accountId: active.accountId, credential: credential, revision: revision)
            } catch {
                guard snapshot == generation, revision == navigationRevision else { return }
                self.error = "Your place in the app could not be kept. You can still open it again."
            }
        }
    }
    private func restoreDestination(account: APISession, credential: String, generation snapshot: Int) async {
        guard !navigationInitialized else { return }
        let navigation = destinationGeneration
        do {
            let saved = try await storage.readDestination(accountId: account.accountId, credential: credential)
            guard !Task.isCancelled, snapshot == generation, session?.accountId == account.accountId,
                  session?.sessionId == account.sessionId else { return }
            navigationInitialized = true
            if navigationRestoreAllowed, navigation == destinationGeneration, let saved {
                destination = saved
            }
            navigationRestoreAllowed = false
            persistDestination()
        } catch {
            guard !Task.isCancelled, snapshot == generation else { return }
            navigationInitialized = true; navigationRestoreAllowed = false
            self.error = "Your saved place is unavailable. Open it again from the app."
        }
    }
    /// Never reconstruct default/global storage for an authenticated request.
    /// Captures expire on navigation (including away and back), rotation,
    /// replacement, purge, cancellation or a changed stored credential.
    public func captureRequest(from target: String, maximumResponseBytes: Int = 268_435_456, timeoutSeconds: TimeInterval = 30) async -> FanSessionRequestCapture? {
        guard (1...268_435_456).contains(maximumResponseBytes), timeoutSeconds > 0, timeoutSeconds <= 30 else { return nil }
        guard let baseURL, let active = session, destination == target, !busy,
              !purgingPrivateState, !localPurgeFailed, !checkingSession,
              !rotatingCredential, !Task.isCancelled else { return nil }
        let snapshot = generation, navigation = destinationGeneration
        guard let credential = try? await storage.read() else { return nil }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil; configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let capture = FanSessionRequestCapture(owner: self,
            client: CreatorAPIClient(baseURL: baseURL, session: URLSession(configuration: configuration), maximumResponseBytes: maximumResponseBytes, timeoutSeconds: timeoutSeconds, token: { credential }),
            accountId: active.accountId, sessionId: active.sessionId, destination: target,
            generation: snapshot, destinationGeneration: navigation, credential: credential)
        return await capture.isCurrent() ? capture : nil
    }
    fileprivate func requestCaptureIsCurrent(_ capture: FanSessionRequestCapture) async -> Bool {
        func matches() -> Bool {
            capture.owner === self && capture.generation == generation &&
            capture.destinationGeneration == destinationGeneration && destination == capture.destination &&
            session?.accountId == capture.expectedAccountId && session?.sessionId == capture.sessionId &&
            !purgingPrivateState && !localPurgeFailed && !rotatingCredential && !Task.isCancelled
        }
        guard matches(), let credential = try? await storage.read() else { return false }
        return matches() && credential == capture.credential
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
        guard !rotatingCredential, !refreshingSession, !purgingPrivateState, !Task.isCancelled else { return }
        guard let api else { checkingSession = false; return }
        refreshingSession = true; checkingSession = true
        defer { refreshingSession = false; checkingSession = false }
        let current = generation
        let token: String?
        do { token = try await storage.read() }
        catch {
            guard current == generation, !Task.isCancelled else { return }
            if await purge() { self.error = QelvoraCopy.text("identitySessionReadFailed") }
            return
        }
        guard current == generation, !Task.isCancelled else { return }
        hasSavedCredential = token != nil
        guard let token else { if session != nil { await purge() }; return }
        do {
            let value = try await api.identitySession()
            guard current == generation, !Task.isCancelled else { return }
            if let previous = session, previous.accountId != value.accountId { if await purge() { error = "The account changed. Continue with Pantopus again." }; return }
            session = value; error = ""
            await restoreDestination(account: value, credential: token, generation: current)
            guard current == generation, !Task.isCancelled else { return }
        } catch let failure as CreatorAPIError {
            guard current == generation, !Task.isCancelled else { return }
            if failure.status == 401 {
                if !busy { refreshingSession = false; await refreshCredentials() }
                else { if await purge() { error = "Your session ended. Continue with Pantopus again." } }
            }
            else { error = Self.message(failure) }
        } catch is CancellationError { return }
        catch { guard current == generation, !Task.isCancelled else { return }; self.error = "Reconnect to refresh your account. Actions are unavailable while offline." }
    }
    public func beginSignIn() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        if localPurgeFailed, !(await purge()) { return }
        guard let api else { error = QelvoraCopy.text("pantopusUnavailable"); return }
        do {
            let capabilities = try await api.identityCapabilities()
            guard capabilities.signInAvailable else { error = QelvoraCopy.text("pantopusUnavailable"); return }
            #if DEBUG
            if capabilities.mode == .development, let available = capabilities.developmentActors, !available.isEmpty { actors = available; choosingDevelopmentActor = true; return }
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
            guard await purge(), !Task.isCancelled else { return }
            let installing = generation
            do { try await storage.save(result.token) }
            catch { guard installing == generation else { return }; if await purge() { self.error = QelvoraCopy.text("identitySessionSaveFailed") }; return }
            guard installing == generation else { return }
            destination = result.returnTo; choosingDevelopmentActor = false
            await refresh()
        } catch { self.error = Self.message(error) }
        #endif
    }
    public func saveHandle(_ handle: String, intro: String) async -> Bool {
        guard let api, !busy else { return false }; busy = true; defer { busy = false }
        do { _ = try await api.saveFanProfile(body: APIFanProfileInput(handle: handle, intro: intro)); await refresh(); return session?.fan != nil }
        catch { self.error = Self.message(error); return false }
    }
    /// Recover navigation only with the credential and destination that opened it.
    /// The call screen independently authorizes the booking and every action.
    public func resolveCallDestination(_ callId: String, from target: String) async -> Bool {
        guard let id = UUID(uuidString: callId), let capture = await captureRequest(from: target) else { return false }
        do {
            guard await capture.isCurrent() else { return false }
            let route = try await capture.client.readAccountCallRoute(sessionId: id.uuidString.lowercased(), xQelvoraExpectedAccount: capture.expectedAccountId)
            guard await capture.isCurrent(),
                  UUID(uuidString: route.sessionId) == id,
                  let creator = UUID(uuidString: route.creatorId), let fan = UUID(uuidString: route.fanId) else { return false }
            open("/calls/\(creator.uuidString.lowercased())/\(fan.uuidString.lowercased())/\(id.uuidString.lowercased())")
            return true
        } catch { return false }
    }
    public func logout(all: Bool = false) async {
        guard !busy else { return }; busy = true; generation &+= 1; defer { busy = false }
        guard let api else { await purge(); return }
        do { if all { _ = try await api.revokeSessions() } else { _ = try await api.logout() }; await purge() }
        catch let error as CreatorAPIError { if error.status == 401 { await purge() } else { self.error = Self.message(error) } }
        catch { self.error = "Sign-out could not reach the server. Retry to revoke the session." }
    }
    public func refreshCredentials() async {
        guard let api, !busy, !Task.isCancelled else { return }; busy = true; rotatingCredential = true; generation += 1; let current = generation; defer { busy = false; rotatingCredential = false }
        do {
            let previous = try await storage.read()
            guard current == generation, !Task.isCancelled else { return }
            guard let previous else { await purge(); return }
            // An unstructured task survives cancellation of the foreground
            // caller. A one-use exchange must finish and persist its response.
            let rotation = Task { try await api.refreshSession() }
            let result = try await rotation.value
            // Persist a completed rotation even if its foreground read was cancelled.
            guard current == generation else { return }
            do { try await storage.save(result.token, replacing: previous) }
            catch { guard current == generation else { return }; if await purge() { self.error = QelvoraCopy.text("identitySessionSaveFailed") }; return }
            guard current == generation else { return }
            generation += 1; rotatingCredential = false; await refresh()
        }
        catch let failure as CreatorAPIError { guard current == generation, !Task.isCancelled else { return }; if failure.status == 401 { if await purge() { error = Self.message(failure) } } else { error = Self.message(failure) } }
        catch { guard current == generation, !Task.isCancelled else { return }; self.error = "Session refresh could not complete. Reconnect and try again." }
    }
    @discardableResult public func purge() async -> Bool {
        guard !purgingPrivateState else { return false }
        purgingPrivateState = true; localPurgeFailed = true
        defer { purgingPrivateState = false }
        generation += 1; session = nil; hasSavedCredential = false; checkingSession = false; actors = []; choosingDevelopmentActor = false; error = ""
        navigationInitialized = false; navigationRestoreAllowed = false
        URLCache.shared.removeAllCachedResponses()
        var cleared = true
        do { try await storage.save(nil) } catch { cleared = false }
        do { try await W3FanFeatures.clearPrivateState() } catch { cleared = false }
        localPurgeFailed = !cleared
        if !cleared { error = QelvoraCopy.text("identityPrivateClearFailed") }
        return cleared
    }
    public func open(_ target: String) { guard ApplicationDestination.isPermitted(target) else { error = "This link is unavailable. Open the object from the app."; return }; navigationRestoreAllowed = false; removedArrivalFor = nil; destination = target; persistDestination() }
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
    @State private var destinationDelivery = UUID()
    private let features: [FanFeatureRegistration]
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    public init(baseURL: URL? = nil, returnTo: String = "/home", features: [FanFeatureRegistration] = []) { _model = StateObject(wrappedValue: FanSession(baseURL: baseURL, destination: returnTo)); self.features = features }
    public var body: some View {
        VStack(spacing: 0) {
            if !model.error.isEmpty {
              Notice(tone: .error, title: "Account status", children: model.error, accessibilityIdentifier: model.session == nil && model.error == QelvoraCopy.text("pantopusUnavailable") ? "pantopus-unavailable" : "account-status").padding(16)
            }
            if model.localPurgeFailed {
                Button(QelvoraCopy.text("identityPrivateClearRetry"), variant: .secondary, block: true, disabled: model.busy || model.purgingPrivateState) { Task { await model.purge() } }.padding(.horizontal, 16)
            }
            if model.choosingDevelopmentActor {
                VStack(spacing: 16) {
                    Notice(title: "Development identity", children: "Synthetic isolated accounts. Pantopus production sign-in is not connected.")
                    ForEach(model.actors, id: \.id) { actor in Button(actor.label, variant: .secondary, block: true, disabled: model.busy) { Task { await model.selectActor(actor.id) } } }
                    Button("Cancel", variant: .quiet) { model.choosingDevelopmentActor = false }
                }.padding(16)
            } else if model.session == nil, let feature = features.first(where: { $0.matches(model.destination) && $0.allowsSignedOut(model.destination) }) {
                feature.screen(model).id(model.destination + destinationDelivery.uuidString)
            } else if model.session == nil, model.hasSavedCredential {
                VStack(alignment: .leading, spacing: 16) {
                    Text(QelvoraCopy.text(model.checkingSession && model.error.isEmpty ? "growthLoading" : "accountUnavailableTitle")).qText("display-md").accessibilityAddTraits(.isHeader)
                    Text(QelvoraCopy.text("accountUnavailableBody")).qText("body").foregroundStyle(qColor("ink-muted", scheme))
                    Button(QelvoraCopy.text("retry"), variant: .secondary, block: true, disabled: model.busy || model.checkingSession) { Task { await model.refresh() } }
                }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            } else if model.session == nil, model.checkingSession {
                ProgressView(QelvoraCopy.text("growthLoading")).padding(16)
            } else if model.session == nil {
                Welcome(returnTo: model.destination, showContext: model.arrival != nil, contextSource: model.arrival?.source, contextTitle: model.arrival?.title, bodyCopy: model.arrival.map { "Every message says who wrote it: " + $0.creatorName + "'s AI, " + $0.creatorName + ", or their team. You'll always know which." } ?? "Every message says who wrote it: the creator's AI, the creator, or their team. You'll always know which.", onRemoveContext: model.removeArrival, onContinue: { Task { await model.beginSignIn() } }).id(model.arrival?.title)
            } else if model.session?.fan == nil, let feature = features.first(where: { $0.matches(model.destination) && $0.allowsSignedOut(model.destination) }) {
                feature.screen(model).id((model.session?.accountId ?? "") + model.destination)
            } else if model.session?.fan == nil, ApplicationDestination.requiresFanProfile(model.destination) {
                NativeHandleForm(model: model)
            } else {
                VStack(spacing: 0) {
                    let feature = features.first(where: { $0.matches(model.destination) })
                    if model.session?.mode == .development { Notice(title: "Development identity", children: "Synthetic account · actual local API.").padding(16) }
                    if model.destination == "/identity/account" || (model.destination == "/you" && feature == nil) {
                        ScrollView { VStack(alignment: .leading, spacing: 16) {
                            Text("Your account").qText("display-md")
                            if let handle = model.session?.fan?.handle { Text("@" + handle).qText("body") }
                            Button(QelvoraCopy.text(model.session?.fan == nil ? "identityChooseHandle" : "identityEditPublicProfile"), variant: .secondary, block: true) { model.destination = "/onboarding/handle" }
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
                    else if let feature { feature.screen(model).id((model.session?.accountId ?? "") + model.destination + destinationDelivery.uuidString) }
                    else { EmptyState(title: "This destination is not connected yet", body: "Your account and arrival context are kept. Return to your account or try again when this feature is available.") { Button("Your account", variant: .secondary) { model.destination = "/you" } }.frame(maxHeight: .infinity) }
                    TabBar(active: tab) { model.destination = "/" + $0.rawValue.lowercased() }
                }
            }
        }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
            .task(id: scenePhase) {
                guard scenePhase == .active else { return }
                await model.refresh()
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(4)) } catch { return }
                    guard !Task.isCancelled else { return }
                    if !model.busy && !model.choosingDevelopmentActor && (model.session != nil || model.hasSavedCredential) { await model.refresh() }
                }
            }
            .task(id: model.destination + destinationDelivery.uuidString) { await model.loadArrival() }
            .onOpenURL { url in
                guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false), components.user == nil, components.password == nil, components.fragment == nil else { model.error = "This link is unavailable."; return }
                let associationHost = Bundle.main.object(forInfoDictionaryKey: "CreatorLinkHost") as? String
                guard (components.scheme == "qelvora" && components.host == "app" && components.port == nil) || (components.scheme == "https" && associationHost != nil && components.host == associationHost && (components.port == nil || components.port == 443)) else { model.error = "This link does not belong to this app."; return }
                let target = components.percentEncodedPath + (components.percentEncodedQuery.map { "?" + $0 } ?? "")
                model.open(target)
                if ApplicationDestination.isPermitted(target) { destinationDelivery = UUID() }
            }
    }
    private var tab: FanTab {
        let path = model.destination.components(separatedBy: "?")[0]
        if path.hasPrefix("/identity/") || path == "/support" || path.hasPrefix("/support/") || path == "/notifications/settings" || path == "/commerce/spending" { return .you }
        if path.hasPrefix("/commerce/") { return .requests }
        return FanTab.allCases.first { tab in
            let root = "/" + tab.rawValue.lowercased()
            return path == root || path.hasPrefix(root + "/")
        } ?? .home
    }
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
                            Spacer(); Text(model.session?.mode == .development ? "DEVELOPMENT SIGN-IN" : "SIGNED IN WITH PANTOPUS").qText("data-sm")
                        }
                        Text("How creators will know you").qText("display-lg").accessibilityAddTraits(.isHeader)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Handle").qText("caption", weight: .semibold).foregroundStyle(qColor("ink-muted", scheme))
                            handleField.qText("body").textFieldStyle(.plain).padding(.horizontal, 12).frame(minHeight: 44).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(qColor("control-line", scheme), lineWidth: 1)).accessibilityLabel("Public handle").accessibilityHint("A pseudonym is allowed. Three to thirty letters, numbers or underscores.")
                            Text("Creators and their teams see your handle, never your name or city unless you share them in a request.").qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                        }
                        if model.session?.fan != nil {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("A LINE ABOUT YOU · OPTIONAL").qText("data-sm")
                                TextEditor(text: $intro).qText("body").scrollContentBackground(.hidden).frame(minHeight: 90).accessibilityLabel("A line about you, optional").onChange(of: intro) { _, value in if value.count > 240 { intro = String(value.prefix(240)) } }
                                Text("You choose, per creator, whether their AI may use this.").qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                            }.padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 16)).overlay(RoundedRectangle(cornerRadius: 16).stroke(qColor("line", scheme), lineWidth: 1))
                        }
                    }
                    Spacer(minLength: 24)
                    Button(model.busy ? "Saving…" : "Continue", variant: .secondary, size: .lg, block: true, disabled: model.busy) { Task { if await model.saveHandle(handle, intro: model.session?.fan == nil ? "" : intro) && model.destination == "/onboarding/handle" { model.destination = "/you" } } }
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
