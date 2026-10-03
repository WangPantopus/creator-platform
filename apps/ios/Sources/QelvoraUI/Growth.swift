import Foundation
import SwiftUI
import UserNotifications
#if os(iOS)
import UIKit
#endif

public struct GrowthCreator: Codable, Identifiable, Sendable {
  public let id: String
  public let handle: String
  public let name: String
  public let biography: String
  public let category: String
  public let mode: String
  public let state: String
  public let topics: [String]
  public let sourceSummary: String
  public let reliability: String
  public let capacity: String
  public let presence: String
  public let photoCaption: String
  public let accessLines: [String]
  public let membershipLabel: String?
}
public struct GrowthPost: Codable, Identifiable, Sendable {
  public let id: String
  public let creatorId: String
  public let title: String
  public let body: String
  public let authorLabel: String
  public let aiContextEligible: Bool
}
private struct Directory: Decodable {
  let creators: [GrowthCreator]
  let nextCursor: String?
}
private struct GrowthPassAccess: Decodable {
  struct Marker: Decodable {
    let creatorId: String
    let state: String
    let startsAt: String?
  }
  let enabled: Bool
  let markers: [Marker]
}
private struct CreatorPage: Decodable {
  let creator: GrowthCreator
  let posts: [GrowthPost]
}
private struct PostPage: Decodable {
  let creator: GrowthCreator
  let post: GrowthPost
}
private struct GrowthHome: Decodable {
  struct Entry: Decodable, Identifiable {
    let id: String
    let creatorName: String
    let label: String
    let preview: String
    let destination: String
    let kind: String
  }
  struct Update: Decodable {
    struct Post: Decodable {
      let id: String
      let title: String
      let authorLabel: String
      let preview: String
    }
    let creator: GrowthCreator
    let post: Post
  }
  let entries: [Entry]
  let posts: [Update]
  let unread: Int
  let followingCount: Int?
  let nextPostsCursor: String?
  let nextThreadsCursor: String?
}
private struct GrowthInvitation: Decodable {
  let creator: GrowthCreator
  let destination: String
}
private struct GrowthSharedReply: Decodable {
  struct Source: Decodable {
    let creatorName: String
    let authorKind: String
    let text: String
    let version: Int
    let correction: String?
  }
  let state: String
  let source: Source?
  let verificationURL: String?
}
struct GrowthReplyExport: Decodable, Identifiable, Sendable, Equatable {
  let id: String
  let text: String
  let version: Int
  let sourceHash: String
  let authorLabel: String
  let authorKind: String
  let verificationURL: String
}
#if os(iOS)
private struct GrowthReplyShareSheet: UIViewControllerRepresentable {
  let artifact: GrowthReplyDocument
  func makeCoordinator() -> GrowthReplyDocument { artifact }
  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: [artifact.source.text, artifact.file], applicationActivities: nil)
  }
  func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
  static func dismantleUIViewController(_ controller: UIActivityViewController, coordinator: GrowthReplyDocument) {
    coordinator.remove()
  }
}
#endif
private struct NotificationPage: Decodable { let notifications: [GrowthNotification] }
private struct GrowthNotification: Decodable, Identifiable {
  let id: String
  let type: String
  let sender: String
  let preview: String
  let destination: String
  let readAt: String?
}
struct GrowthRequestFailure: Error {
  let status: Int
  var message: String {
    switch status {
    case 401: QelvoraCopy.text("growthContinueWithPantopusToOpenYourAccountSCurrentState")
    case 403: QelvoraCopy.text("growthThisActionIsUnavailableToThisAccount")
    case 404: QelvoraCopy.text("growthThisDestinationIsNoLongerAvailable")
    default: QelvoraCopy.text("growthTheServiceIsUnavailableReconnectAndTryAgain")
    }
  }
}

public struct GrowthClient: Sendable {
  public let baseURL: URL
  public let token: @Sendable () async throws -> String?
  public init(
    baseURL: URL,
    token: (@Sendable () async throws -> String?)? = nil
  ) {
    self.baseURL = baseURL
    self.token = token ?? { try await SecureSessionStorage(issuer: baseURL).read() }
  }
  func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil, expectedSession: String? = nil) async throws
    -> T
  {
    guard let url = URL(string: "/v1/growth/" + path, relativeTo: baseURL) else {
      throw URLError(.badURL)
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.httpBody = body
    request.timeoutInterval = 10
    request.cachePolicy = .reloadIgnoringLocalCacheData
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let value = path.hasPrefix("public/") ? nil : try await token()
    if let expectedSession, value != expectedSession { throw GrowthRequestFailure(status: 401) }
    if let value {
      request.setValue("Bearer " + value, forHTTPHeaderField: "Authorization")
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    guard (200..<300).contains(http.statusCode) else {
      throw GrowthRequestFailure(status: http.statusCode)
    }
    if expectedSession != nil, try await token() != value { throw GrowthRequestFailure(status: 401) }
    return try JSONDecoder().decode(T.self, from: data)
  }
  public func registerDevice(installationID: UUID, token value: Data, granted: Bool, registrationRevision: Int, expectedSession: String) async throws {
    struct Ack: Decodable { let id: String }
    let body = try JSONSerialization.data(withJSONObject: [
      "installationId": installationID.uuidString.lowercased(), "platform": "ios",
      "token": value.map { String(format: "%02x", $0) }.joined(),
      "permission": granted ? "granted" : "denied",
      "registrationRevision": registrationRevision,
    ])
    let _: Ack = try await request("devices", method: "PUT", body: body, expectedSession: expectedSession)
  }
  public func revokeDevice(installationID: UUID, registrationRevision: Int, expectedSession: String) async throws {
    struct Ack: Decodable { let revoked: Bool }
    let body = try JSONSerialization.data(withJSONObject: ["registrationRevision": registrationRevision, "platform": "ios"])
    let _: Ack = try await request("devices/" + installationID.uuidString.lowercased(), method: "DELETE", body: body, expectedSession: expectedSession)
  }
  func notificationDestination(id: UUID, expectedSession: String) async throws -> String {
    struct Current: Decodable { let id: String; let available: Bool; let destination: String }
    let current: Current = try await request("notifications/" + id.uuidString.lowercased(), expectedSession: expectedSession)
    guard UUID(uuidString: current.id) == id, current.available else { throw GrowthRequestFailure(status: 404) }
    guard ApplicationDestination.isPermitted(current.destination) else { throw URLError(.badServerResponse) }
    struct Ack: Decodable { let read: Bool }
    let _: Ack = try await request("notifications/" + id.uuidString.lowercased() + "/read", method: "PUT", body: Data("{}".utf8), expectedSession: expectedSession)
    return current.destination
  }
}

/// Register in W1's shell; session credentials remain W1-owned. Public entry also works signed out.
public struct GrowthFanFeature: View {
  private let client: GrowthClient?
  private let destination: String
  private let signIn: (String) -> Void
  private let navigate: ((String) -> Void)?
  @State private var route: String
  @FocusState private var discoverSearchFocused: Bool
  @State private var query = ""
  @State private var category = "For you"
  @State private var section = "Chat"
  @State private var home: GrowthHome?
  @State private var homePostsCursor: String?
  @State private var homeThreadsCursor: String?
  @State private var homePageRevision = 0
  @AccessibilityFocusState private var homeHeadingFocused: Bool
  @State private var pagingHome = false
  @State private var homeRequestID = UUID()
  @State private var invitation: GrowthInvitation?
  @State private var shared: GrowthSharedReply?
  @State private var replyExport: GrowthReplyDocument?
  @State private var sharingReply = false
  @State private var following = false
  @State private var creators: [GrowthCreator] = []
  @State private var discoverCursor: String?
  @State private var discoverNextCursor: String?
  @State private var discoverQuery = ""
  @State private var discoverCategory = ""
  @State private var discoverRequestID = UUID()
  @State private var discoverPageRevision = 0
  @State private var pagingDiscover = false
  @AccessibilityFocusState private var discoverHeadingFocused: Bool
  @State private var pass: GrowthPassAccess?
  @State private var creator: GrowthCreator?
  @State private var posts: [GrowthPost] = []
  @State private var notifications: [GrowthNotification] = []
  @State private var error = ""
  @State private var requiresSignIn = false
  @State private var hasSession = false
  @State private var loading = false
  @Environment(\.colorScheme) private var scheme
  public init(
    baseURL: URL?, destination: String = "/discover",
    token: (@Sendable () async throws -> String?)? = nil,
    onNavigate: ((String) -> Void)? = nil,
    onSignIn: @escaping (String) -> Void = { _ in }
  ) {
    client = baseURL.map { GrowthClient(baseURL: $0, token: token) }
    self.destination = destination
    _route = State(initialValue: destination)
    signIn = onSignIn
    navigate = onNavigate
  }
  public static func registration(baseURL: URL?) -> FanFeatureRegistration {
    FanFeatureRegistration(
      matches: { matches($0) },
      allowsSignedOut: {
        $0 == "/discover" || $0.hasPrefix("/invite/") || $0.hasPrefix("/share/")
          || ($0.hasPrefix("/creators/") && !$0.contains("/chat"))
      },
      screen: { session in
        AnyView(
          GrowthFanFeature(
            baseURL: baseURL, destination: session.destination,
            onNavigate: { session.open($0) },
            onSignIn: { target in
              session.open(target)
              Task { await session.beginSignIn() }
            }
          ).id(session.destination))
      })
  }
  public static func matches(_ route: String) -> Bool {
    route == "/discover" || route == "/home" || route.hasPrefix("/notifications")
      || route.hasPrefix("/creators/") || route.hasPrefix("/invite/") || route.hasPrefix("/share/")
  }
  public var body: some View {
    VStack(spacing: 0) {
      ScrollViewReader { reader in
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if route == "/notifications/settings" {
            GrowthNotificationSettings(client: client)
          } else if route == "/discover" {
            Text(QelvoraCopy.text("navDiscover")).qText("display-lg").accessibilityAddTraits(.isHeader).accessibilityFocused($discoverHeadingFocused)
            TextField(QelvoraCopy.text("growthSearchCreators"), text: $query,
              prompt: Text(QelvoraCopy.text("growthSearchCreatorsCraftsOrQuestions")).foregroundStyle(qColor("ink-muted", scheme)))
              .textFieldStyle(.plain)
              .qText("body").foregroundStyle(qColor("ink", scheme)).padding(12).frame(minHeight: 48)
              .accessibilityLabel(QelvoraCopy.text("growthSearchCreators"))
              .background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 12))
              .overlay { RoundedRectangle(cornerRadius: 12).stroke(qColor("line", scheme), lineWidth: 1) }
              .focused($discoverSearchFocused)
              .contentShape(Rectangle())
              .onTapGesture { discoverSearchFocused = true }
              .submitLabel(.search).onSubmit { discoverSearchFocused = false; Task { await load() } }
            Segmented(items: growthCategories.map(growthLabel), active: growthLabel(category)) { value in
              category = growthCategories.first(where: { growthLabel($0) == value }) ?? category
              Task { await load() }
            }
            ForEach(creators) { value in
              SwiftUI.Button {
                open("/creators/" + value.handle)
              } label: {
                creatorCard(value)
              }.buttonStyle(.plain)
            }
            if let cursor = discoverNextCursor {
              Button(QelvoraCopy.text("growthMoreCreators"), variant: .secondary, block: true) {
                Task { await pageDiscover(cursor) }
              }.disabled(loading || pagingDiscover)
            }
            if discoverCursor != nil {
              Button(QelvoraCopy.text("growthFirstPage"), variant: .quiet, block: true) {
                Task { await pageDiscover(nil) }
              }.disabled(loading || pagingDiscover)
            }
            if pagingDiscover { ProgressView().accessibilityLabel(QelvoraCopy.text("growthLoading")) }
            if creators.isEmpty && !loading && error.isEmpty {
              EmptyState(title: QelvoraCopy.text("growthNoCreatorsFound"), body: QelvoraCopy.text("growthTryAnotherNeedOrBrowseACategory"))
            }
          } else if route.hasPrefix("/notifications") {
            Text(QelvoraCopy.text("growthNotifications")).qText("display-lg")
            Button(QelvoraCopy.text("growthSettings"), variant: .quiet) { open("/notifications/settings") }
            if route == "/notifications" && notifications.isEmpty && !loading && error.isEmpty {
              EmptyState(title: QelvoraCopy.text("growthNoUpdatesYet"), body: QelvoraCopy.text("growthYourInAppRecordCannotBeTurnedOff"))
            }
            ForEach(route == "/notifications" ? notifications : []) { item in
              SwiftUI.Button {
                openNotification(item)
              } label: {
                VStack(alignment: .leading, spacing: 6) {
                  Text(item.sender).qText("label")
                  Text(item.preview).qText("body")
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 16)
              }.buttonStyle(.plain).accessibilityLabel(item.sender + ". " + item.preview)
            }
          } else if route == "/home", let home {
            HStack {
              Text(QelvoraCopy.text("growthYourPeople")).qText("display-lg").accessibilityAddTraits(.isHeader).accessibilityFocused($homeHeadingFocused)
              Spacer()
              Button(QelvoraCopy.text("growthNotifications"), variant: .quiet) { open("/notifications") }
            }
            GrowthPostValuePrompt(client: client) { open($0) }
            ForEach(home.entries) { entry in
              SwiftUI.Button {
                open(entry.destination)
              } label: {
                VStack(alignment: .leading, spacing: 8) {
                  Text(entry.creatorName).qText("title")
                  Text(entry.label).qText("label")
                  Text(entry.preview).qText("body")
                }.padding(16)
              }.buttonStyle(.plain)
            }
            if let cursor = home.nextThreadsCursor {
              Button(QelvoraCopy.text("navMore") + ": " + QelvoraCopy.text("growthYourPeople"), variant: .secondary, block: true) {
                Task { await pageHome(homePostsCursor, threadsCursor: cursor) }
              }.disabled(pagingHome)
            }
            ForEach(home.posts, id: \.post.id) { update in
              SwiftUI.Button {
                open("/creators/" + update.creator.handle + "/posts/" + update.post.id)
              } label: {
                VStack(alignment: .leading, spacing: 8) {
                  Text(update.post.authorLabel).qText("label")
                  Text(update.post.title).qText("title")
                  Text(update.post.preview).qText("voice-md")
                }.padding(16)
              }.buttonStyle(.plain)
            }
            if let cursor = home.nextPostsCursor {
              Button(QelvoraCopy.text("navMore"), variant: .secondary, block: true) {
                Task { await pageHome(cursor, threadsCursor: homeThreadsCursor) }
              }.disabled(pagingHome)
            }
            if pagingHome { ProgressView().accessibilityLabel(QelvoraCopy.text("growthLoading")) }
            if homePostsCursor != nil || homeThreadsCursor != nil {
              Button(QelvoraCopy.text("growthLatestFirst"), variant: .quiet, block: true) {
                Task { await pageHome(nil) }
              }.disabled(pagingHome)
            }
            if home.entries.isEmpty && home.posts.isEmpty {
              EmptyState(
                title: QelvoraCopy.text(home.followingCount == 0 && homePostsCursor == nil && homeThreadsCursor == nil && home.nextThreadsCursor == nil ? "growthPickACreatorToStart" : "growthNoUpdatesYet"), body: QelvoraCopy.text("growthFindACreatorWhoseWorkYouCareAbout")
              ) { Button(QelvoraCopy.text("navDiscover"), variant: .secondary) { open("/discover") } }
            }
          } else if route.hasPrefix("/invite/"), let invitation {
            Seal(initial: String(invitation.creator.name.prefix(1)), size: 56)
            Text(QelvoraCopy.text("growthInvitedYouIn", values: ["name": invitation.creator.name])).qText("display-lg")
            Text(QelvoraCopy.text("growthAFirstConversationOfAbout24HoursNoCardNeeded")).qText("body")
            Button(QelvoraCopy.text("growthAcceptInvitation"), variant: .ai, block: true) {
              open(invitation.destination)
            }
          } else if route.hasPrefix("/share/"), let shared {
            if shared.state == "valid", let source = shared.source {
              VStack(alignment: .leading, spacing: 16) {
                AuthorLabel(kind: source.authorKind == "approved_draft" ? .approvedDraft : .humanCreator, name: source.creatorName, onMaya: source.authorKind != "approved_draft")
                Text(source.text).qText(source.authorKind == "approved_draft" ? "body" : "voice-md")
                Text(QelvoraCopy.text("growthSignedByVersion", values: ["name": source.creatorName, "version": String(source.version)]))
                  .qText("caption")
              }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                .foregroundStyle(qColor(source.authorKind == "approved_draft" ? "ai-ink" : "on-maya", scheme))
                .background(qColor(source.authorKind == "approved_draft" ? "ai-surface" : "maya-surface", scheme))
                .clipShape(RoundedRectangle(cornerRadius: 16))
              if let correction = source.correction {
                Notice(title: QelvoraCopy.text("growthCorrection"), children: correction)
              }
              if shared.verificationURL != nil {
                Button(QelvoraCopy.text("growthShareCompleteReply"), variant: .secondary, block: true, disabled: sharingReply) {
                  Task { await exportSharedReply() }
                }
              } else {
                Notice(title: QelvoraCopy.text("growthUnavailable"), children: QelvoraCopy.text("growthImageNeedsOrigin"))
              }
            } else {
              EmptyState(
                title: QelvoraCopy.text("growthThisCardWasWithdrawn2"),
                body: QelvoraCopy.text("growthPermissionToShareThisReplyIsNoLongerCurrent"))
            }
          } else if let creator {
            if route.contains("/chat") {
              Text(QelvoraCopy.text("aiAuthor", values: ["name": creator.name])).qText("display-md")
              Text(
                QelvoraCopy.text("identityStrip", values: ["name": creator.name])
              ).qText("body")
              if let context = posts.first {
                ContextCard(source: QelvoraCopy.text("growthFromAPost"), title: context.title) {
                  open("/creators/" + creator.handle + "/chat")
                }
              }
              Notice(
                title: QelvoraCopy.text("growthConversationServiceNotConnected"),
                children: QelvoraCopy.text("growthYourValidEntryContextIsKeptNoMessageHasBeen"))
              Button(QelvoraCopy.text("continueWithPantopus"), block: true) { signIn(route) }
            } else if route.contains("/posts/") {
              HStack(spacing: 10) {
                SwiftUI.Button {
                  open("/creators/" + creator.handle)
                } label: {
                  QelvoraGlyph(name: "back", color: qColor("ink", scheme))
                    .frame(width: 44, height: 44)
                }.buttonStyle(.plain).accessibilityLabel(QelvoraCopy.text("growthBackToSPage", values: ["name": creator.name]))
                Avatar(initial: String(creator.name.prefix(1)))
                VStack(alignment: .leading, spacing: 2) {
                  Text(creator.name).qText("body-strong")
                  Text(QelvoraCopy.text("growthPostPublic")).qText("data-sm").foregroundStyle(
                    qColor("ink-muted", scheme))
                }
              }.frame(maxWidth: .infinity, alignment: .leading)
              ForEach(posts) { post in
                Text(post.authorLabel).qText("label")
                Text(post.title).qText("display-lg")
                Text(post.body).qText("voice-md")
                if post.aiContextEligible {
                  VStack(alignment: .leading, spacing: 12) {
                    AuthorLabel(kind: .ai, name: creator.name)
                    Text(QelvoraCopy.text("growthAskAboutThisPostTheContextStaysWithYourConversation"))
                      .qText("body").foregroundStyle(qColor("ink", scheme))
                    Button(QelvoraCopy.text("growthAskSAiAboutThis2", values: ["name": creator.name]), variant: .ai, block: true) {
                      open("/creators/" + creator.handle + "/chat?context=" + post.id)
                    }
                  }.padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                      qColor("ai-surface", scheme), in: RoundedRectangle(cornerRadius: 16)
                    )
                    .overlay {
                      RoundedRectangle(cornerRadius: 16).stroke(
                        qColor("ai-line", scheme), lineWidth: 1)
                    }.padding(.top, 8)
                }
              }
            } else {
              creatorCard(creator)
              Text(
                QelvoraCopy.text("growthOfficialMeansAuthorizedThisAiItDoesNotMeanRead2", values: ["name": creator.name])
              ).qText("caption")
              Button(
                QelvoraCopy.text("messageAI", values: ["name": creator.name]), block: true,
                disabled: creator.state != "published"
              ) { open("/creators/" + creator.handle + "/chat") }
              Button(
                following ? QelvoraCopy.text("growthFollowingUnfollow") : QelvoraCopy.text("growthFollow"), variant: .secondary, block: true
              ) { Task { await follow(creator) } }
              Segmented(items: growthSections.map(growthLabel), active: growthLabel(section)) { label in
                section = growthSections.first(where: { growthLabel($0) == label }) ?? section
              }
              if section == "Chat" {
                Text(QelvoraCopy.text("growthWhatSAiKnows2", values: ["name": creator.name])).qText("title")
                Text(creator.sourceSummary).qText("body")
                Text(creator.topics.joined(separator: ", ")).qText("body")
                Text(creator.presence).qText("caption")
              } else if section == "Posts" {
                Text(QelvoraCopy.text("growthFrom3", values: ["name": creator.name])).qText("title")
                ForEach(posts) { post in
                  SwiftUI.Button {
                    open("/creators/" + creator.handle + "/posts/" + post.id)
                  } label: {
                    VStack(alignment: .leading, spacing: 8) {
                      Text(post.authorLabel).qText("label")
                      Text(post.title).qText("title")
                      Text(post.body).qText("voice-md")
                    }.padding(16).background(qColor("maya-surface", scheme)).foregroundStyle(
                      qColor("on-maya", scheme))
                  }.buttonStyle(.plain)
                }
                if posts.isEmpty {
                  EmptyState(
                    title: QelvoraCopy.text("growthNoPublicPostsYet"),
                    body: QelvoraCopy.text("growthComeBackWhenPublishesSomething2", values: ["name": creator.name]))
                }
              } else if section == "Requests" {
                Text(QelvoraCopy.text("growthSTimeByRequest2", values: ["name": creator.name])).qText("title")
                Text(creator.capacity).qText("body")
                Text(creator.reliability).qText("caption")
                Notice(
                  title: QelvoraCopy.text("growthCurrentOffers"),
                  children:
                    QelvoraCopy.text("growthRequestsAndPricesNeedTheCreatorSCurrentOfferNo")
                )
              } else {
                Text(creator.membershipLabel ?? QelvoraCopy.text("navAccess")).qText("title")
                ForEach(creator.accessLines, id: \.self) { Text($0).qText("body") }
              }
            }
          }
          if loading { ProgressView().accessibilityLabel(QelvoraCopy.text("growthLoading")) }
          if !error.isEmpty {
            Notice(tone: .error, title: QelvoraCopy.text("growthUnavailable"), children: error)
            if requiresSignIn { Button(QelvoraCopy.text("continueWithPantopus"), block: true) { signIn(route) } }
            Button(QelvoraCopy.text("growthTryAgain"), variant: .secondary) { Task { await load() } }
          }
        }.padding(16).id("growth-home-top")
      }.onChange(of: homePageRevision) { _, _ in
        reader.scrollTo("growth-home-top", anchor: .top)
        homeHeadingFocused = true
      }.onChange(of: discoverPageRevision) { _, _ in
        reader.scrollTo("growth-home-top", anchor: .top)
        discoverHeadingFocused = true
      }
      }
      if !hasSession {
        TabBar(active: route == "/discover" ? .discover : .home) { tab in
          if tab == .home || tab == .discover {
            open("/" + tab.rawValue.lowercased())
          } else {
            signIn("/" + tab.rawValue.lowercased())
          }
        }
      }
    }.foregroundStyle(qColor("ink", scheme)).background(qColor("ground", scheme)).onChange(
      of: destination
    ) { _, target in route = target }.task(id: route) {
      await load()
    }
    #if os(iOS)
    .sheet(item: $replyExport) { artifact in GrowthReplyShareSheet(artifact: artifact) }
    #endif
  }
  private func open(_ target: String) {
    if let navigate { navigate(target) } else { route = target }
  }
  private func creatorCard(_ value: GrowthCreator) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .bottom) {
        Text(value.name).qText("display-md")
        Spacer()
        Text(value.photoCaption).qText("data-sm")
      }.frame(height: 150, alignment: .bottom).padding(16).background(
        qColor("maya-surface", scheme)
      ).foregroundStyle(qColor("on-maya", scheme))
      VStack(alignment: .leading, spacing: 8) {
        Text(value.category + " · " + value.mode.replacingOccurrences(of: "_", with: " ")).qText(
          "body-strong")
        Text(value.biography).qText("body")
        Text(value.capacity).qText("caption")
        if pass?.enabled == true,
          let marker = pass?.markers.first(where: { $0.creatorId == value.id })
        {
          Text(
            marker.state == "active"
              ? QelvoraCopy.text("growthInYourPass")
              : marker.state == "draft_next" ? QelvoraCopy.text("growthDraftForYourNextPassCycle") : QelvoraCopy.text("growthNotInYourPass")
          ).qText("data-sm")
        }
      }.padding(16)
    }.background(qColor("surface", scheme)).clipShape(RoundedRectangle(cornerRadius: 16))
  }
  private func load() async {
    let loadID = UUID()
    let loadedRoute = route
    replyExport = nil
    homeRequestID = UUID()
    discoverRequestID = loadID
    guard let client else {
      error = QelvoraCopy.text("growthTheGrowthServiceIsNotConfigured")
      return
    }
    loading = true
    error = ""
    requiresSignIn = false
    hasSession = (try? await client.token()) != nil
    defer { if discoverRequestID == loadID { loading = false } }
    do {
      creator = nil
      posts = []
      home = nil
      invitation = nil
      shared = nil
      if route == "/discover" {
        try await loadDirectory(nil, reset: true, requestID: loadID)
      } else if route == "/home" {
        homePostsCursor = nil
        homeThreadsCursor = nil
        home = try await client.request("home")
      } else if route.hasPrefix("/invite/") {
        invitation = try await client.request("public/invites/" + String(route.dropFirst(8)))
      } else if route.hasPrefix("/share/") {
        shared = try await client.request("public/shares/" + String(route.dropFirst(7)))
      } else if route == "/notifications" {
        let data: NotificationPage = try await client.request("notifications")
        notifications = data.notifications
      } else if route.hasPrefix("/notifications/"), route != "/notifications/settings" {
        guard let id = UUID(uuidString: String(route.dropFirst(15))) else { throw GrowthRequestFailure(status: 404) }
        guard let captured = try await client.token() else { throw GrowthRequestFailure(status: 401) }
        let target = try await client.notificationDestination(id: id, expectedSession: captured)
        guard !Task.isCancelled, route == loadedRoute, discoverRequestID == loadID, try await client.token() == captured else { return }
        open(target)
      } else if route.hasPrefix("/creators/") {
        let parts = route.split(separator: "/")
        guard parts.count >= 2 else { return }
        let handle = String(parts[1])
        if route.contains("/posts/") {
          let data: PostPage = try await client.request(
            "public/creators/" + handle + "/posts/" + String(parts.last!))
          creator = data.creator
          posts = [data.post]
        } else {
          let data: CreatorPage = try await client.request("public/creators/" + handle)
          creator = data.creator
          posts = data.posts
          if let context = URLComponents(string: route)?.queryItems?.first(where: {
            $0.name == "context"
          })?.value {
            let selected: PostPage = try await client.request(
              "public/creators/" + handle + "/posts/" + context)
            guard selected.post.aiContextEligible else { throw URLError(.noPermissionsToReadFile) }
            posts = [selected.post]
          } else if route.contains("/chat") {
            posts = []
          }
        }
      }
      if let creator {
        struct FollowState: Decodable { let following: Bool }
        following =
          ((try? await client.request("follow/" + creator.id)) as FollowState?)?.following ?? false
      }
    } catch {
      if Task.isCancelled || route != loadedRoute || discoverRequestID != loadID { return }
      creator = nil
      posts = []
      creators = []
      notifications = []
      record(error)
    }
  }
  private func loadDirectory(_ cursor: String?, reset: Bool = false, requestID: UUID) async throws {
    guard let client, route == "/discover" else { return }
    discoverRequestID = requestID
    let search = reset ? query : discoverQuery
    let filter = reset ? (category == "For you" ? "" : category) : discoverCategory
    pagingDiscover = true
    pass = nil
    defer { if discoverRequestID == requestID { pagingDiscover = false } }
    var parameters = URLComponents()
    parameters.queryItems = [URLQueryItem(name: "q", value: search), URLQueryItem(name: "category", value: filter)]
    if let cursor { parameters.queryItems?.append(URLQueryItem(name: "cursor", value: cursor)) }
    let currentSession = try? await client.token()
    let data: Directory = try await client.request("public/creators?" + (parameters.percentEncodedQuery ?? ""))
    var access: GrowthPassAccess?
    if let currentSession, !data.creators.isEmpty {
      var accessParameters = URLComponents()
      accessParameters.queryItems = [URLQueryItem(name: "creators", value: data.creators.map(\.id).joined(separator: ","))]
      access = try? await client.request("discovery-access?" + (accessParameters.percentEncodedQuery ?? ""), expectedSession: currentSession)
    }
    guard !Task.isCancelled, route == "/discover", discoverRequestID == requestID else { return }
    if (try? await client.token()) != currentSession { access = nil }
    creators = data.creators
    pass = access
    discoverCursor = cursor
    discoverNextCursor = data.nextCursor
    discoverQuery = search
    discoverCategory = filter
    discoverPageRevision += 1
    error = ""
  }
  private func pageDiscover(_ cursor: String?) async {
    guard route == "/discover", !pagingDiscover, !loading else { return }
    let requestID = UUID()
    do { try await loadDirectory(cursor, requestID: requestID) }
    catch {
      guard !Task.isCancelled, route == "/discover", discoverRequestID == requestID else { return }
      pass = nil
      record(error)
    }
  }
  private func pageHome(_ cursor: String?, threadsCursor: String? = nil) async {
    guard let client, route == "/home", !pagingHome else { return }
    pagingHome = true
    let requestID = UUID()
    homeRequestID = requestID
    defer { pagingHome = false }
    do {
      guard let currentSession = try await client.token() else { throw GrowthRequestFailure(status: 401) }
      var components = URLComponents()
      components.queryItems = [cursor.map { URLQueryItem(name: "postsCursor", value: $0) }, threadsCursor.map { URLQueryItem(name: "threadsCursor", value: $0) }].compactMap { $0 }
      let path = "home" + (components.percentEncodedQuery.flatMap { $0.isEmpty ? nil : "?" + $0 } ?? "")
      let page: GrowthHome = try await client.request(path, expectedSession: currentSession)
      guard !Task.isCancelled, route == "/home", homeRequestID == requestID else { return }
      home = page
      homePostsCursor = cursor
      homeThreadsCursor = threadsCursor
      homePageRevision += 1
      error = ""
    } catch {
      guard !Task.isCancelled, route == "/home", homeRequestID == requestID else { return }
      requiresSignIn = (error as? GrowthRequestFailure)?.status == 401
      if let status = (error as? GrowthRequestFailure)?.status, [401, 403, 410].contains(status) { home = nil }
      self.error = (error as? GrowthRequestFailure)?.message ?? QelvoraCopy.text("growthTheServiceIsUnavailableReconnectAndTryAgain")
    }
  }
  private func record(_ failure: Error) {
    requiresSignIn = (failure as? GrowthRequestFailure)?.status == 401
    error =
      (failure as? GrowthRequestFailure)?.message
      ?? QelvoraCopy.text("growthThisDestinationIsUnavailableReconnectAndTryAgain")
  }
  private func exportSharedReply() async {
    guard let client, route.hasPrefix("/share/"), !sharingReply else { return }
    let target = route
    sharingReply = true
    defer { sharingReply = false }
    do {
      let artifact: GrowthReplyExport = try await client.request("public/shares/" + String(target.dropFirst(7)) + "/export")
      guard !Task.isCancelled, route == target, artifact.id == String(target.dropFirst(7)) else { return }
      let rendering = Task.detached(priority: .userInitiated) { try GrowthReplyDocument.create(artifact) }
      let document = try await withTaskCancellationHandler {
        try await rendering.value
      } onCancel: {
        rendering.cancel()
      }
      defer { if replyExport?.id != document.id { document.remove() } }
      guard !Task.isCancelled, route == target else { return }
      // Rendering can be lengthy. Permission/correction must still match before
      // a file is handed to the system sheet; no locally cached grant is reused.
      let current: GrowthReplyExport = try await client.request("public/shares/" + artifact.id + "/export")
      guard !Task.isCancelled, route == target, current == artifact else {
        throw GrowthRequestFailure(status: 410)
      }
      replyExport = document
      error = ""
    } catch {
      guard !Task.isCancelled, route == target else { return }
      if (error as? GrowthRequestFailure)?.status == 410 { shared = nil }
      record(error)
    }
  }
  private func follow(_ creator: GrowthCreator) async {
    guard let client else { return }
    do {
      struct Ack: Decodable { let following: Bool }
      let result: Ack = try await client.request(
        "follow/" + creator.id, method: "PUT",
        body: try JSONSerialization.data(withJSONObject: ["following": !following]))
      following = result.following
      error = ""
    } catch { if !Task.isCancelled { record(error) } }
  }
  private func openNotification(_ item: GrowthNotification) {
    guard let id = UUID(uuidString: item.id) else { record(GrowthRequestFailure(status: 404)); return }
    open("/notifications/" + id.uuidString.lowercased())
  }
  private func openDestination(_ target: String) {
    if let navigate { navigate(target) }
    else { route = target }
  }
}

/// Optional post-value prompt; the owner-recorded outcome and durable server cap determine visibility.
private struct GrowthPostValuePrompt: View {
  private struct Claim: Decodable { let eligible: Bool; let target: String? }
  private struct Choice: Decodable { let saved: Bool }
  let client: GrowthClient?
  let open: (String) -> Void
  @State private var claimID = UUID().uuidString.lowercased()
  @State private var target: String?
  @State private var busy = false
  @State private var error = ""
  var body: some View {
    Group {
      if let target {
        VStack(alignment: .leading, spacing: 16) {
          Text(QelvoraCopy.text("growthKeepUsefulUpdatesWithinReach")).qText("title")
          Text(QelvoraCopy.text("growthChoosePushOrEmailInSettingsWhenYouWantUpdates")).qText("body")
          Button(QelvoraCopy.text("growthChooseUpdates"), variant: .secondary) { choose("accepted", target: target) }.disabled(busy)
          Button(QelvoraCopy.text("growthLater"), variant: .quiet) { choose("later", target: target) }.disabled(busy)
          Button(QelvoraCopy.text("growthDonTAskAgain"), variant: .quiet) { choose("declined", target: target) }.disabled(busy)
          if !error.isEmpty { Text(error).qText("caption").accessibilityAddTraits(.updatesFrequently) }
        }
      }
    }.task {
      guard let client else { return }
      let body = try? JSONSerialization.data(withJSONObject: ["platform":"ios", "id":claimID])
      if let claim: Claim = try? await client.request("engagement/return/claim", method:"POST", body:body), !Task.isCancelled {
        target = claim.eligible ? claim.target : nil
      }
    }
  }
  private func choose(_ choice: String, target destination: String) {
    busy = true; error = ""
    Task {
      defer { busy = false }
      do {
        guard let client else { throw URLError(.notConnectedToInternet) }
        let body = try JSONSerialization.data(withJSONObject:["id":claimID, "choice":choice])
        let _: Choice = try await client.request("engagement/return/choice", method:"PUT", body:body)
        target = nil
        if choice == "accepted" { open(destination) }
      } catch { self.error = QelvoraCopy.text("growthThisChoiceCouldNotBeSavedTryAgain") }
    }
  }
}

private let growthCategories = ["For you", "Crafts", "Music", "Food"]
private let growthSections = ["Chat", "Posts", "Requests", "Access"]
private func growthLabel(_ value: String) -> String {
  let keys = ["For you":"growthForYou", "Crafts":"growthCrafts", "Music":"growthMusic", "Food":"growthFood", "Chat":"navChat", "Posts":"navPosts", "Requests":"navRequests", "Access":"navAccess"]
  return keys[value].map { QelvoraCopy.text($0) } ?? value
}
