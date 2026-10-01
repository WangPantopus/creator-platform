import Foundation
import SwiftUI

/// Reads only the server's public projection, without session credentials.
public enum PublicVerificationFeature {
    public static func matches(_ destination: String) -> Bool {
        identifier(destination) != nil
    }

    @MainActor public static func registration(baseURL: URL?) -> FanFeatureRegistration {
        FanFeatureRegistration(matches: matches, allowsSignedOut: matches) { session in
            guard let id = identifier(session.destination) else {
                return AnyView(Notice(title: QelvoraCopy.text("identityVerificationSignedUnavailableTitle"), children: QelvoraCopy.text("identityVerificationInvalidLink")))
            }
            return AnyView(PublicVerificationScreen(baseURL: baseURL, signedActId: id, onHome: { session.open("/home") }).id((baseURL?.absoluteString ?? "") + "/" + id))
        }
    }

    private static func identifier(_ destination: String) -> String? {
        let parts = destination.split(separator: "/", omittingEmptySubsequences: false)
        guard ApplicationDestination.isPermitted(destination), parts.count == 3,
              parts[0].isEmpty, parts[1] == "verify", UUID(uuidString: String(parts[2])) != nil else { return nil }
        return String(parts[2])
    }
}

@MainActor
private struct PublicVerificationScreen: View {
    let baseURL: URL?
    let signedActId: String
    let onHome: () -> Void
    @Environment(\.colorScheme) private var scheme
    @Environment(\.scenePhase) private var scenePhase
    @State private var signature: APIPublicSignature?
    @State private var failure: String?
    @State private var missing = false
    @State private var loading = true
    @State private var attempt = 0

    private struct ReadKey: Equatable {
        let baseURL: URL?
        let id: String
        let active: Bool
        let attempt: Int
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("/VERIFY/" + signedActId.uppercased()).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
                if scenePhase == .active, let signature, signature.signedActId == signedActId {
                    HStack(spacing: 12) {
                        QelvoraGlyph(name: "sealCheck", size: 40, color: qColor("maya-ink", scheme), cutColor: qColor("ground", scheme))
                        Text(QelvoraCopy.text("signedBy", values: ["name": signature.creatorName])).qText("display-lg").accessibilityAddTraits(.isHeader)
                    }
                    Text(signature.explanation).qText("body")
                    if signature.status != .valid {
                        Notice(title: statusTitle(signature.status), children: QelvoraCopy.text("identityVerificationHistoricalUnavailable"))
                    }
                    if let text = publicText(signature) {
                        if signature.actType == "reply" || signature.actType == "approved_draft" {
                            Message(kind: signature.actType == "approved_draft" ? .approvedDraft : .humanCreator, children: text, name: signature.creatorName, actions: false, onVerify: retry)
                        } else {
                            VStack(alignment: .leading, spacing: 12) {
                                AuthorLabel(kind: signature.actType == "correction" ? .correction : .humanCreator, name: signature.creatorName, onMaya: true)
                                Text(signature.actType == "broadcast" ? QelvoraCopy.text("identityVerificationActNote") : QelvoraCopy.text("identityVerificationActCorrection")).qText("caption")
                                Text(text).qText(signature.actType == "correction" ? "voice-md" : "voice-lg")
                                SignedMarker(name: signature.creatorName, onMaya: true, action: retry)
                            }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                                .foregroundStyle(qColor("on-maya", scheme))
                                .background(qColor("maya-surface", scheme), in: RoundedRectangle(cornerRadius: 16))
                        }
                    } else {
                        Notice(title: signature.status == .withdrawn ? QelvoraCopy.text("identityVerificationWithdrawnContentTitle") : signature.contentAvailable ? QelvoraCopy.text("identityVerificationMetadataTitle") : QelvoraCopy.text("identityVerificationPrivateTitle"), children: signature.status == .withdrawn ? QelvoraCopy.text("identityVerificationWithdrawnContent") : signature.contentAvailable ? QelvoraCopy.text("identityVerificationMetadataNotice") : QelvoraCopy.text("identityVerificationPrivateNotice"))
                    }
                    VStack(spacing: 12) {
                        row(QelvoraCopy.text("identityVerificationAuthor"), signature.creatorName)
                        row(QelvoraCopy.text("identityVerificationAct"), actLabel(signature.actType))
                        if let version = publicVersion(signature) { row(QelvoraCopy.text("identityVerificationContentVersion"), version) }
                        row(QelvoraCopy.text("identityVerificationWrittenBy"), signature.actType == "approved_draft" ? QelvoraCopy.text("identityVerificationApprovedAuthor") : publicText(signature) != nil ? signature.creatorName : QelvoraCopy.text("identityVerificationAuthorizedOnly"))
                        row(QelvoraCopy.text("identityVerificationSigned"), signedTime(signature.verifiedAt))
                        row(QelvoraCopy.text("identityVerificationStatus"), signature.status == .valid ? QelvoraCopy.text("identityVerificationValid") : statusTitle(signature.status))
                        row(QelvoraCopy.text("identityVerificationSharedBy"), QelvoraCopy.text("identityVerificationNotDisclosed"))
                    }.padding(16).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(qColor("line", scheme), lineWidth: 1))
                    Text(QelvoraCopy.text("identityVerificationHash", values: ["hash": signature.contentHash])).qText("data-sm").textSelection(.enabled)
                    Text(QelvoraCopy.text("identityVerificationPublicNotice")).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                } else {
                    Notice(title: loading ? QelvoraCopy.text("identityVerificationCheckingTitle") : missing ? QelvoraCopy.text("identityVerificationSignedUnavailableTitle") : QelvoraCopy.text("identityVerificationUnavailableTitle"), children: loading ? QelvoraCopy.text("identityVerificationLoading") : failure ?? QelvoraCopy.text("identityVerificationUnconfigured"))
                }
                Button(signature != nil ? QelvoraCopy.text("identityVerificationRefresh") : QelvoraCopy.text("retry"), variant: .secondary, block: true, disabled: loading || baseURL == nil, action: retry)
                Button(QelvoraCopy.text("navHome"), variant: .quiet, block: true, action: onHome)
            }.padding(.horizontal, 16).padding(.vertical, 28)
        }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme))
            .task(id: ReadKey(baseURL: baseURL, id: signedActId, active: scenePhase == .active, attempt: attempt)) { await load() }
    }

    private func retry() { signature = nil; failure = nil; loading = true; attempt += 1 }

    private func load() async {
        signature = nil; failure = nil; missing = false; loading = false
        guard scenePhase == .active, let baseURL else { return }
        loading = true
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil
        configuration.httpCookieStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        let transport = URLSession(configuration: configuration)
        defer { transport.invalidateAndCancel() }
        do {
            let response = try await CreatorAPIClient(baseURL: baseURL, session: transport, token: { nil }).publicSignature(signedActId: signedActId)
            guard !Task.isCancelled else { return }
            guard response.signedActId == signedActId else { throw URLError(.badServerResponse) }
            signature = response; loading = false
        } catch {
            guard !Task.isCancelled else { return }
            missing = (error as? CreatorAPIError)?.status == 404
            failure = missing ? QelvoraCopy.text("identityVerificationMissing") : QelvoraCopy.text("identityVerificationFailed")
            loading = false
        }
    }

    private func publicText(_ value: APIPublicSignature) -> String? {
        guard value.status != .withdrawn, value.contentAvailable,
              ["reply", "approved_draft", "broadcast", "correction"].contains(value.actType),
              case .some(.object(let command)) = value.content,
              case .some(.string(let act)) = command["actType"], act == value.actType,
              case .some(.object(let content)) = command["content"],
              case .some(.string(let text)) = content["text"] else { return nil }
        return text
    }

    private func publicVersion(_ value: APIPublicSignature) -> String? {
        guard value.status != .withdrawn, value.contentAvailable,
              case .some(.object(let command)) = value.content,
              case .some(.string(let act)) = command["actType"], act == value.actType,
              case .some(.object(let content)) = command["content"],
              case .some(.number(let version)) = content["version"],
              version.isFinite, version >= 1, version <= 9_007_199_254_740_991, version.rounded() == version else { return nil }
        return String(format: "%.0f", version)
    }

    private func row(_ label: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label).qText("body").foregroundStyle(qColor("ink-muted", scheme))
            Spacer(minLength: 8)
            Text(value).qText("body").multilineTextAlignment(.trailing)
        }.accessibilityElement(children: .combine)
    }

    private func signedTime(_ value: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = parser.date(from: value) ?? ISO8601DateFormatter().date(from: value)
        guard let date else { return value }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateStyle = .medium; formatter.timeStyle = .short
        return formatter.string(from: date) + " UTC"
    }

    private func actLabel(_ value: String) -> String {
        switch value {
        case "reply": QelvoraCopy.text("identityVerificationActReply")
        case "approved_draft": QelvoraCopy.text("identityVerificationActApproved")
        case "broadcast": QelvoraCopy.text("identityVerificationActNote")
        case "reaction": QelvoraCopy.text("identityVerificationActReaction")
        case "accept": QelvoraCopy.text("identityVerificationActAcceptance")
        case "correction": QelvoraCopy.text("identityVerificationActCorrection")
        default: QelvoraCopy.text("identityVerificationActOther")
        }
    }

    private func statusTitle(_ value: APIPublicSignatureStatus) -> String {
        switch value {
        case .valid: QelvoraCopy.text("identityVerificationValid")
        case .key_revoked: QelvoraCopy.text("identityVerificationKeyRevoked")
        case .creator_revoked: QelvoraCopy.text("identityVerificationCreatorRevoked")
        case .withdrawn: QelvoraCopy.text("identityVerificationWithdrawn")
        }
    }
}
