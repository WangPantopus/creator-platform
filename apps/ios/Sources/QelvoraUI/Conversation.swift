import SwiftUI

public struct Message: View {
    public var kind: MessageKind
    public var children: String
    public var name: String
    public var member: String
    public var time: String?
    public var delivery: Delivery?
    public var treatment: DraftTreatment
    public var citation: AnyView?
    public var live: Bool
    public var meta: String?
    public var after: AnyView?
    public var actions: Bool
    public var sponsor: String?
    public var onRetry: () -> Void
    public var onHelped: () -> Void
    public var onReport: () -> Void
    public var onVerify: () -> Void
    @Environment(\.colorScheme) private var scheme

    public init(kind: MessageKind = .ai, children: String = "", name: String = "Maya", member: String = "Priya", time: String? = nil, delivery: Delivery? = nil, treatment: DraftTreatment = .split, citation: AnyView? = nil, live: Bool = false, meta: String? = nil, after: AnyView? = nil, actions: Bool = true, sponsor: String? = nil, onRetry: @escaping () -> Void = {}, onHelped: @escaping () -> Void = {}, onReport: @escaping () -> Void = {}, onVerify: @escaping () -> Void = {}) {
        self.kind = kind; self.children = children; self.name = name; self.member = member; self.time = time; self.delivery = delivery; self.treatment = treatment; self.citation = citation; self.live = live; self.meta = meta; self.after = after; self.actions = actions; self.sponsor = sponsor; self.onRetry = onRetry; self.onHelped = onHelped; self.onReport = onReport; self.onVerify = onVerify
    }

    private var maximum: CGFloat { QelvoraTokens.token(kind == .fan ? "fan-message-max-width" : "message-max-width") }

    public var body: some View {
        VStack(alignment: kind == .fan ? .trailing : .leading, spacing: QelvoraLayout.authorGap) {
            switch kind {
            case .fan:
                Text(children).qText("body")
                    .padding(.horizontal, QelvoraTokens.token("message-padding"))
                    .padding(.vertical, QelvoraTokens.token("space-2") + QelvoraTokens.token("space-1") / 2)
                    .background(qColor("surface-sunken", scheme), in: BubbleShape(fan: true))
                    .opacity(delivery == .pending ? 0.6 : 1)
                if delivery == .pending {
                    Text(QelvoraCopy.text("sending")).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
                } else if delivery == .failed {
                    HStack(spacing: QelvoraTokens.token("space-2")) {
                        Text(QelvoraCopy.text("notSent")).qText("caption", weight: .semibold).foregroundStyle(qColor("alert", scheme))
                        Button(QelvoraCopy.text("retry"), variant: .quiet, action: onRetry)
                    }
                } else if let meta { Text(meta).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)) }
                if let after { after }
            case .ai:
                AuthorLabel(kind: .ai, name: name, time: time)
                VStack(alignment: .leading, spacing: QelvoraTokens.token("space-3")) {
                    if let sponsor { Text(QelvoraCopy.text("sponsorDisclosure", values: ["name": name, "brand": sponsor])).qText("caption").foregroundStyle(qColor("ink-muted", scheme)) }
                    if delivery == .accepted {
                        HStack(spacing: QelvoraTokens.token("space-1")) {
                            ForEach(0..<3) { _ in Circle().fill(qColor("ai-ink", scheme).opacity(0.35)).frame(width: QelvoraLayout.authorGap, height: QelvoraLayout.authorGap) }
                        }.padding(.vertical, QelvoraLayout.authorGap).accessibilityLabel(QelvoraCopy.text("aiWriting", values: ["name": name]))
                    } else {
                        (Text(children) + Text(delivery == .streaming ? " ▏" : "").foregroundColor(qColor("ai-ink", scheme))).qText("body")
                    }
                    if let citation { citation }
                    if delivery == .interrupted { Text(QelvoraCopy.text("interrupted").uppercased()).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)).padding(.horizontal, QelvoraTokens.token("space-2")).padding(.vertical, QelvoraTokens.token("space-1") / 2).overlay(Capsule().stroke(qColor("line", scheme), lineWidth: 1)) }
                }
                .padding(.vertical, QelvoraTokens.token("space-3"))
                .padding(.horizontal, QelvoraTokens.token("message-padding"))
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(qColor("ai-surface", scheme), in: BubbleShape())
                .overlay(BubbleShape().stroke(qColor("ai-line", scheme), lineWidth: 1))
                if actions {
                    HStack(spacing: QelvoraTokens.token("space-1")) {
                        Button(QelvoraCopy.text("thisHelped"), variant: .quiet, action: onHelped)
                        Button(QelvoraCopy.text("report"), variant: .quiet, action: onReport)
                    }
                }
            case .team:
                AuthorLabel(kind: .team, name: name, member: member, time: time)
                Text(children).qText("body").padding(.vertical, QelvoraTokens.token("space-3")).padding(.horizontal, QelvoraTokens.token("message-padding")).frame(maxWidth: .infinity, alignment: .leading).background(qColor("team-surface", scheme), in: BubbleShape())
            case .humanCreator:
                VStack(alignment: .leading, spacing: QelvoraTokens.token("space-2") + QelvoraTokens.token("space-1") / 2) {
                    AuthorLabel(kind: .humanCreator, name: name, time: time, onMaya: true)
                    Text(children).qText("voice-lg").foregroundStyle(qColor("on-maya", scheme))
                    SignedMarker(name: name, onMaya: true, action: onVerify)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { Rectangle().fill(qColor("on-maya", scheme).opacity(0.08)).frame(height: 1) }
                }
                .padding(.horizontal, QelvoraTokens.token("space-4"))
                .padding(.top, QelvoraTokens.token("message-padding"))
                .padding(.bottom, QelvoraTokens.token("space-3"))
                .background(qColor("maya-surface", scheme), in: BubbleShape(creator: true))
                .qShadow(live ? "glow-maya" : "shadow-plate", radius: QelvoraTokens.token("space-4"))
            case .approvedDraft:
                draft
            }
        }
        .foregroundStyle(qColor("ink", scheme))
        .frame(maxWidth: maximum, alignment: kind == .fan ? .trailing : .leading)
        .frame(maxWidth: .infinity, alignment: kind == .fan ? .trailing : .leading)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder private var draft: some View {
        switch treatment {
        case .split:
            VStack(spacing: 0) {
                VStack(alignment: .leading, spacing: QelvoraTokens.token("space-2")) {
                    HStack(spacing: QelvoraLayout.authorGap) { Mark(); Text(QelvoraCopy.text("preparedByAI")).qText("caption", weight: .semibold).foregroundStyle(qColor("ai-ink", scheme)) }.accessibilityHidden(true)
                    Text(children).qText("body").accessibilityLabel(QelvoraCopy.text("preparedByAI") + " · " + QelvoraCopy.text("approvedBy", values: ["name": name]) + ". " + children)
                }.padding(.vertical, QelvoraTokens.token("space-3")).padding(.horizontal, QelvoraTokens.token("message-padding")).frame(maxWidth: .infinity, alignment: .leading).background(qColor("ai-surface", scheme))
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: QelvoraTokens.space2) { approvalLabel.accessibilityHidden(true); Spacer(minLength: 0); SignedMarker(name: name, time: time, onMaya: true, action: onVerify).fixedSize() }
                    VStack(alignment: .leading, spacing: QelvoraTokens.space1) { approvalLabel.accessibilityHidden(true); SignedMarker(name: name, time: time, onMaya: true, action: onVerify) }
                }.padding(.horizontal, QelvoraTokens.messagePadding).padding(.vertical, QelvoraTokens.composerGap).frame(maxWidth: .infinity, alignment: .leading).background(qColor("maya-surface", scheme))
            }.clipShape(BubbleShape()).overlay(BubbleShape().stroke(qColor("maya-line", scheme), lineWidth: 1))
        case .gradient:
            VStack(alignment: .leading, spacing: QelvoraTokens.token("space-2")) {
                AuthorLabel(kind: .approvedDraft, name: name, time: time)
                Text(children).qText("body")
                SignedMarker(name: name, action: onVerify)
            }.padding(QelvoraTokens.token("message-padding")).background(qColor("ai-surface", scheme), in: BubbleShape()).overlay(BubbleShape().stroke(LinearGradient(colors: [qColor("ai-ink", scheme), qColor("maya-ink", scheme)], startPoint: .leading, endPoint: .trailing), lineWidth: 1.5))
        case .stacked:
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: QelvoraTokens.space2) { QelvoraGlyph(name: "ring", size: QelvoraTokens.authorLabelSize + QelvoraTokens.hairline, color: qColor("ai-ink", scheme)); Text(QelvoraCopy.text("preparedByAI")).qText("caption", weight: .semibold).foregroundStyle(qColor("ai-ink", scheme)) }.frame(minHeight: QelvoraTokens.space5)
                    HStack(spacing: QelvoraTokens.space2) { Seal(initial: String(name.prefix(1)), size: QelvoraTokens.authorLabelSize + QelvoraTokens.hairline); Text(QelvoraCopy.text("approvedBy", values: ["name": name])).qText("caption", weight: .semibold).foregroundStyle(qColor("maya-ink", scheme)); if let time { Text("· \(time)").qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)) } }.frame(minHeight: QelvoraTokens.space5)
                }.padding(.horizontal, QelvoraTokens.messagePadding).padding(.vertical, QelvoraTokens.space2).frame(maxWidth: .infinity, alignment: .leading).background(qColor("ground", scheme))
                Text(children).qText("body").padding(QelvoraTokens.token("message-padding"))
                SignedMarker(name: name, action: onVerify).padding(.horizontal, QelvoraTokens.token("message-padding"))
            }.background(qColor("ai-surface", scheme), in: BubbleShape()).overlay(BubbleShape().stroke(qColor("line", scheme), lineWidth: 1))
        }
    }

    private var approvalLabel: some View {
        HStack(spacing: QelvoraTokens.space2) { Seal(initial: String(name.prefix(1)), onMaya: true); Text(QelvoraCopy.text("approvedBy", values: ["name": name])).qText("caption", weight: .semibold).foregroundStyle(qColor("maya-accent", scheme)) }.fixedSize()
    }
}

public struct Note: View {
    public var children: String
    public var name: String
    public var audience: String
    public var audienceSize: String?
    public var time: String?
    public var media: String?
    public var reply: Bool
    public var replyId: String
    public var retracted: Bool
    public var onVerify: () -> Void
    @State private var replyText = ""
    @Environment(\.colorScheme) private var scheme

    public init(children: String, name: String = "Maya", audience: String = "Kiln Club members", audienceSize: String? = nil, time: String? = nil, media: String? = nil, reply: Bool = true, replyId: String = "qelvora-note-reply", retracted: Bool = false, onVerify: @escaping () -> Void = {}) {
        self.children = children; self.name = name; self.audience = audience; self.audienceSize = audienceSize; self.time = time; self.media = media; self.reply = reply; self.replyId = replyId; self.retracted = retracted; self.onVerify = onVerify
    }
    public var body: some View {
        if retracted {
            Text(QelvoraCopy.text("noteRemoved", values: ["name": name])).qText("label").foregroundStyle(qColor("ink-muted", scheme)).padding(QelvoraTokens.token("message-padding")).frame(maxWidth: .infinity, alignment: .leading).overlay(RoundedRectangle(cornerRadius: QelvoraTokens.token("space-4")).stroke(qColor("line", scheme), style: StrokeStyle(lineWidth: 1, dash: [QelvoraTokens.token("space-1")])))
        } else {
            VStack(spacing: 0) {
                AuthorLabel(kind: .humanBroadcast, name: name, audience: audience, time: time, onMaya: true)
                    .padding(.leading, QelvoraTokens.token("space-4"))
                    .padding(.trailing, QelvoraTokens.token("welcome-bottom"))
                    .padding(.vertical, QelvoraTokens.textStyles["label"]!.size)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .bottom) { Rectangle().fill(Color.white.opacity(QelvoraTokens.capacityRuleOpacity)).frame(height: QelvoraTokens.hairline) }
                VStack(alignment: .leading, spacing: QelvoraTokens.token("message-padding")) {
                    Text(children).qText("voice-lg").foregroundStyle(qColor("on-maya", scheme))
                    if let media {
                        HStack(spacing: QelvoraTokens.space2) { QelvoraGlyph(name: "image", size: QelvoraTokens.limitRadioSize, color: qColor("on-maya-muted", scheme)); Text(media).qText("label").foregroundStyle(qColor("on-maya-muted", scheme)) }.frame(maxWidth: .infinity).frame(height: QelvoraTokens.noteMediaHeight).overlay(RoundedRectangle(cornerRadius: QelvoraTokens.segmentRadius).stroke(Color.white.opacity(QelvoraTokens.noteMediaOpacity), style: StrokeStyle(lineWidth: QelvoraTokens.hairline, dash: [QelvoraTokens.space1])))
                    }
                    SignedMarker(name: name, extra: audienceSize.map { "\($0) members" }, onMaya: true, action: onVerify)
                }.padding(QelvoraTokens.token("space-4")).frame(maxWidth: .infinity, alignment: .leading)
                if reply {
                    VStack(alignment: .leading, spacing: QelvoraLayout.authorGap) {
                        Text(QelvoraCopy.text("noteReplyLabel", values: ["name": name])).qText("caption", weight: .semibold)
                        TextField(QelvoraCopy.text("writeReply"), text: $replyText).textFieldStyle(.plain).qText("body").padding(.horizontal, QelvoraTokens.token("message-padding")).frame(minHeight: QelvoraTokens.token("touch-target")).background(qColor("surface", scheme), in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md"))).overlay(RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")).stroke(qColor("control-line", scheme), lineWidth: 1)).accessibilityIdentifier(replyId).accessibilityLabel(QelvoraCopy.text("noteReplyLabel", values: ["name": name]))
                        Text(QelvoraCopy.text("noteReplies", values: ["name": name])).qText("caption")
                    }.foregroundStyle(qColor("ink-muted", scheme)).padding(QelvoraTokens.token("space-4")).frame(maxWidth: .infinity, alignment: .leading).background(qColor("ground", scheme))
                }
            }
            .background(qColor("maya-surface", scheme))
            .overlay(alignment: .topTrailing) {
                Canvas { context, bounds in
                    var fold = Path(); fold.move(to: .zero); fold.addLine(to: .init(x: bounds.width, y: 0)); fold.addLine(to: .init(x: bounds.width, y: bounds.height)); fold.closeSubpath()
                    context.fill(fold, with: .color(qColor("ground", scheme)))
                    var underside = Path(); underside.move(to: .zero); underside.addLine(to: .init(x: 0, y: bounds.height)); underside.addLine(to: .init(x: bounds.width, y: bounds.height)); underside.closeSubpath()
                    context.fill(underside, with: .color(Color.white.opacity(QelvoraTokens.noteFoldOpacity)))
                }.frame(width: QelvoraTokens.token("note-fold"), height: QelvoraTokens.token("note-fold")).accessibilityHidden(true)
            }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: QelvoraTokens.token("space-4"), bottomLeadingRadius: QelvoraTokens.token("space-4"), bottomTrailingRadius: QelvoraTokens.token("space-4"), topTrailingRadius: QelvoraTokens.token("radius-tail")))
            .qShadow("shadow-plate", radius: QelvoraTokens.space4)
            .accessibilityElement(children: .contain)
        }
    }
}
