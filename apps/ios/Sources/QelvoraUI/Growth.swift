import Foundation
import SwiftUI
import UserNotifications

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
private struct Directory: Decodable { let creators: [GrowthCreator] }
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
    let creator: GrowthCreator
    let post: GrowthPost
  }
  let entries: [Entry]
  let posts: [Update]
  let unread: Int
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
}
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
    case 401: "Continue with Pantopus to open your account's current state."
    case 403: "This action is unavailable to this account."
    case 404: "This destination is no longer available."
    default: "The service is unavailable. Reconnect and try again."
    }
  }
}

public struct GrowthClient: Sendable {
  public let baseURL: URL
  public let token: @Sendable () async throws -> String?
  public init(
    baseURL: URL,
    token: @escaping @Sendable () async throws -> String? = { try SecureSessionStorage().read() }
  ) {
    self.baseURL = baseURL
    self.token = token
  }
  func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws
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
    if !path.hasPrefix("public/"), let value = try await token() {
      request.setValue("Bearer " + value, forHTTPHeaderField: "Authorization")
    }
    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
    guard (200..<300).contains(http.statusCode) else {
      throw GrowthRequestFailure(status: http.statusCode)
    }
    return try JSONDecoder().decode(T.self, from: data)
  }
  public func registerDevice(installationID: UUID, token value: Data, granted: Bool) async throws {
    struct Ack: Decodable { let id: String }
    let body = try JSONSerialization.data(withJSONObject: [
      "installationId": installationID.uuidString.lowercased(), "platform": "ios",
      "token": value.map { String(format: "%02x", $0) }.joined(),
      "permission": granted ? "granted" : "denied",
    ])
    let _: Ack = try await request("devices", method: "PUT", body: body)
  }
}

/// Register in W1's shell; session credentials remain W1-owned. Public entry also works signed out.
public struct GrowthFanFeature: View {
  private let client: GrowthClient?
  private let destination: String
  private let signIn: (String) -> Void
  @State private var route: String
  @State private var query = ""
  @State private var category = "For you"
  @State private var section = "Chat"
  @State private var home: GrowthHome?
  @State private var invitation: GrowthInvitation?
  @State private var shared: GrowthSharedReply?
  @State private var following = false
  @State private var creators: [GrowthCreator] = []
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
    token: @escaping @Sendable () async throws -> String? = { try SecureSessionStorage().read() },
    onSignIn: @escaping (String) -> Void = { _ in }
  ) {
    client = baseURL.map { GrowthClient(baseURL: $0, token: token) }
    self.destination = destination
    _route = State(initialValue: destination)
    signIn = onSignIn
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
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if route == "/notifications/settings" {
            GrowthNotificationSettings(client: client)
          } else if route == "/discover" {
            Text("Discover").qText("display-lg")
            TextField("Search creators", text: $query,
              prompt: Text("Search creators, crafts or questions").foregroundStyle(qColor("ink-muted", scheme)))
              .foregroundStyle(qColor("ink", scheme)).padding(12)
              .background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: 12))
              .overlay { RoundedRectangle(cornerRadius: 12).stroke(qColor("line", scheme), lineWidth: 1) }
              .submitLabel(.search).onSubmit { Task { await load() } }
            Segmented(items: ["For you", "Crafts", "Music", "Food"], active: category) { value in
              category = value
              Task { await load() }
            }
            ForEach(creators) { value in
              SwiftUI.Button {
                route = "/creators/" + value.handle
              } label: {
                creatorCard(value)
              }.buttonStyle(.plain)
            }
            if creators.isEmpty && !loading && error.isEmpty {
              EmptyState(title: "No creators found", body: "Try another need or browse a category.")
            }
          } else if route == "/notifications" {
            Text("Notifications").qText("display-lg")
            Button("Settings", variant: .quiet) { route = "/notifications/settings" }
            if notifications.isEmpty && !loading && error.isEmpty {
              EmptyState(title: "No updates yet", body: "Your in-app record cannot be turned off.")
            }
            ForEach(notifications) { item in
              SwiftUI.Button {
                Task { await openNotification(item) }
              } label: {
                VStack(alignment: .leading, spacing: 6) {
                  Text(item.sender).qText("label")
                  Text(item.preview).qText("body")
                }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 16)
              }.buttonStyle(.plain).accessibilityLabel(item.sender + ". " + item.preview)
            }
          } else if route == "/home", let home {
            HStack {
              Text("Your people").qText("display-lg")
              Spacer()
              Button("Notifications", variant: .quiet) { route = "/notifications" }
            }
            GrowthPostValuePrompt(client: client) { route = $0 }
            ForEach(home.entries) { entry in
              SwiftUI.Button {
                route = entry.destination
              } label: {
                VStack(alignment: .leading, spacing: 8) {
                  Text(entry.creatorName).qText("title")
                  Text(entry.label).qText("label")
                  Text(entry.preview).qText("body")
                }.padding(16)
              }.buttonStyle(.plain)
            }
            ForEach(home.posts, id: \.post.id) { update in
              SwiftUI.Button {
                route = "/creators/" + update.creator.handle + "/posts/" + update.post.id
              } label: {
                VStack(alignment: .leading, spacing: 8) {
                  Text(update.post.authorLabel).qText("label")
                  Text(update.post.title).qText("title")
                  Text(update.post.body).qText("voice-md")
                }.padding(16)
              }.buttonStyle(.plain)
            }
            if home.entries.isEmpty && home.posts.isEmpty {
              EmptyState(
                title: "Pick a creator to start", body: "Find a creator whose work you care about."
              ) { Button("Discover", variant: .secondary) { route = "/discover" } }
            }
          } else if route.hasPrefix("/invite/"), let invitation {
            Seal(initial: String(invitation.creator.name.prefix(1)), size: 56)
            Text(invitation.creator.name + " invited you in").qText("display-lg")
            Text("A first conversation of about 24 hours · no card needed.").qText("body")
            Button("Accept invitation", variant: .ai, block: true) {
              route = invitation.destination
            }
          } else if route.hasPrefix("/share/"), let shared {
            if shared.state == "valid", let source = shared.source {
              Text(
                source.authorKind == "approved_draft"
                  ? "Prepared by AI · approved by " + source.creatorName
                  : source.creatorName + " · personal reply"
              ).qText("label")
              Text(source.text).qText("voice-md")
              Text("Signed by " + source.creatorName + " · version " + String(source.version))
                .qText("caption")
              if let correction = source.correction {
                Notice(title: "Correction", children: correction)
              }
            } else {
              EmptyState(
                title: "This card was withdrawn",
                body: "Permission to share this reply is no longer current.")
            }
          } else if let creator {
            if route.contains("/chat") {
              Text(creator.name + "'s AI").qText("display-md")
              Text(
                "You're talking to " + creator.name + "'s AI · " + creator.name
                  + " steps in on request."
              ).qText("body")
              if let context = posts.first {
                ContextCard(source: "From a post", title: context.title) {
                  route = "/creators/" + creator.handle + "/chat"
                }
              }
              Notice(
                title: "Conversation service not connected",
                children: "Your valid entry context is kept. No message has been sent.")
              Button("Continue with Pantopus", block: true) { signIn(route) }
            } else if route.contains("/posts/") {
              HStack(spacing: 10) {
                SwiftUI.Button {
                  route = "/creators/" + creator.handle
                } label: {
                  QelvoraGlyph(name: "back", color: qColor("ink", scheme))
                    .frame(width: 44, height: 44)
                }.buttonStyle(.plain).accessibilityLabel("Back to " + creator.name + "'s page")
                Avatar(initial: String(creator.name.prefix(1)))
                VStack(alignment: .leading, spacing: 2) {
                  Text(creator.name).qText("body-strong")
                  Text("POST · PUBLIC").qText("data-sm").foregroundStyle(
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
                    Text("Ask about this post. The context stays with your conversation.")
                      .qText("body").foregroundStyle(qColor("ink", scheme))
                    Button("Ask " + creator.name + "'s AI about this", variant: .ai, block: true) {
                      route = "/creators/" + creator.handle + "/chat?context=" + post.id
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
                "Official means " + creator.name + " authorized this AI. It does not mean "
                  + creator.name + " read your message."
              ).qText("caption")
              Button(
                "Message " + creator.name + "'s AI", block: true,
                disabled: creator.state != "published"
              ) { route = "/creators/" + creator.handle + "/chat" }
              Button(
                following ? "Following · unfollow" : "Follow", variant: .secondary, block: true
              ) { Task { await follow(creator) } }
              Segmented(items: ["Chat", "Posts", "Requests", "Access"], active: section) {
                section = $0
              }
              if section == "Chat" {
                Text("What " + creator.name + "'s AI knows").qText("title")
                Text(creator.sourceSummary).qText("body")
                Text(creator.topics.joined(separator: ", ")).qText("body")
                Text(creator.presence).qText("caption")
              } else if section == "Posts" {
                Text("From " + creator.name).qText("title")
                ForEach(posts) { post in
                  SwiftUI.Button {
                    route = "/creators/" + creator.handle + "/posts/" + post.id
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
                    title: "No public posts yet",
                    body: "Come back when " + creator.name + " publishes something.")
                }
              } else if section == "Requests" {
                Text(creator.name + "'s time, by request").qText("title")
                Text(creator.capacity).qText("body")
                Text(creator.reliability).qText("caption")
                Notice(
                  title: "Current offers",
                  children:
                    "Requests and prices need the creator's current offer. No offer is connected here yet."
                )
              } else {
                Text(creator.membershipLabel ?? "Access").qText("title")
                ForEach(creator.accessLines, id: \.self) { Text($0).qText("body") }
              }
            }
          }
          if loading { ProgressView().accessibilityLabel("Loading") }
          if !error.isEmpty {
            Notice(tone: .error, title: "Unavailable", children: error)
            if requiresSignIn { Button("Continue with Pantopus", block: true) { signIn(route) } }
            Button("Try again", variant: .secondary) { Task { await load() } }
          }
        }.padding(16)
      }
      if !hasSession {
        TabBar(active: route == "/discover" ? .discover : .home) { tab in
          if tab == .home || tab == .discover {
            route = "/" + tab.rawValue.lowercased()
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
              ? "In your pass"
              : marker.state == "draft_next" ? "Draft for your next pass cycle" : "Not in your pass"
          ).qText("data-sm")
        }
      }.padding(16)
    }.background(qColor("surface", scheme)).clipShape(RoundedRectangle(cornerRadius: 16))
  }
  private func load() async {
    guard let client else {
      error = "The growth service is not configured."
      return
    }
    loading = true
    error = ""
    requiresSignIn = false
    hasSession = (try? await client.token()) != nil
    defer { loading = false }
    do {
      creator = nil
      posts = []
      home = nil
      invitation = nil
      shared = nil
      if route == "/discover" {
        var parameters = URLComponents()
        parameters.queryItems = [
          URLQueryItem(name: "q", value: query),
          URLQueryItem(name: "category", value: category == "For you" ? "" : category),
        ]
        let data: Directory = try await client.request(
          "public/creators?" + (parameters.percentEncodedQuery ?? ""))
        creators = data.creators
        pass = nil
        if hasSession {
          pass = try? await client.request("discovery-access")
        }
      } else if route == "/home" {
        home = try await client.request("home")
      } else if route.hasPrefix("/invite/") {
        invitation = try await client.request("public/invites/" + String(route.dropFirst(8)))
      } else if route.hasPrefix("/share/") {
        shared = try await client.request("public/shares/" + String(route.dropFirst(7)))
      } else if route == "/notifications" {
        let data: NotificationPage = try await client.request("notifications")
        notifications = data.notifications
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
      if Task.isCancelled { return }
      creator = nil
      posts = []
      creators = []
      notifications = []
      record(error)
    }
  }
  private func record(_ failure: Error) {
    requiresSignIn = (failure as? GrowthRequestFailure)?.status == 401
    error =
      (failure as? GrowthRequestFailure)?.message
      ?? "This destination is unavailable. Reconnect and try again."
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
  private func openNotification(_ item: GrowthNotification) async {
    guard let client else { return }
    do {
      struct Ack: Decodable { let read: Bool }
      let _: Ack = try await client.request(
        "notifications/" + item.id + "/read", method: "PUT", body: Data("{}".utf8))
      route = item.destination
    } catch { if !Task.isCancelled { record(error) } }
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
          Text("Keep useful updates within reach").qText("title")
          Text("Choose push or email in settings when you want updates. You can change them any time.").qText("body")
          Button("Choose updates", variant: .secondary) { choose("accepted", target: target) }.disabled(busy)
          Button("Later", variant: .quiet) { choose("later", target: target) }.disabled(busy)
          Button("Don't ask again", variant: .quiet) { choose("declined", target: target) }.disabled(busy)
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
      } catch { self.error = "This choice could not be saved. Try again." }
    }
  }
}
