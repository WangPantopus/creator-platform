import SwiftUI

public struct StepIn: View {
  public var name: String
  public var disabled: Bool
  public var note: String?
  public var action: () -> Void
  @Environment(\.colorScheme) private var scheme
  public init(
    name: String = "Maya", disabled: Bool = false, note: String? = nil,
    action: @escaping () -> Void = {}
  ) {
    self.name = name
    self.disabled = disabled
    self.note = note
    self.action = action
  }
  public var body: some View {
    VStack(alignment: .leading, spacing: QelvoraTokens.token("space-1")) {
      SwiftUI.Button(action: action) {
        HStack(spacing: QelvoraTokens.token("space-2")) {
          if disabled {
            Seal(initial: String(name.prefix(1)), size: QelvoraTokens.token("seal-step"))
          } else {
            ThreadPlateSeal(initial: String(name.prefix(1)), size: QelvoraTokens.token("seal-step"))
          }
          Text(QelvoraCopy.text("stepIn", values: ["name": name])).qText(
            "control-body", weight: .semibold)
        }.padding(.leading, QelvoraTokens.token("strip-box-radius")).padding(
          .trailing, QelvoraTokens.token("space-4")
        )
        .frame(minHeight: QelvoraTokens.token("touch-target"))
        .foregroundStyle(qColor(disabled ? "ink-muted" : "on-maya", scheme))
        .background(qColor(disabled ? "surface-sunken" : "maya-surface", scheme), in: Capsule())
        .overlay(
          Capsule().stroke(
            qColor(disabled ? "surface-sunken" : "maya-line", scheme),
            lineWidth: QelvoraTokens.token("hairline")))
      }.buttonStyle(.plain).disabled(disabled)
      if disabled {
        Text(note ?? QelvoraCopy.text("fullyBooked", values: ["name": name])).qText("caption")
          .foregroundStyle(qColor("ink-muted", scheme))
      }
    }
  }
}

public struct AccessLines: View {
  public var can: String?
  public var included: String?
  public var byRequest: String?
  public var changes: String?
  public var name: String
  @Environment(\.colorScheme) private var scheme
  public init(
    can: String? = nil, included: String? = nil, byRequest: String? = nil, changes: String? = nil,
    name: String = "Maya"
  ) {
    self.can = can
    self.included = included
    self.byRequest = byRequest
    self.changes = changes
    self.name = name
  }
  public var body: some View {
    Grid(
      alignment: .leading, horizontalSpacing: QelvoraTokens.token("space-3"),
      verticalSpacing: QelvoraTokens.token("space-3")
    ) {
      row("accessLabelCan", can ?? QelvoraCopy.text("accessDefaultCan", values: ["name": name]))
      row("accessLabelIncluded", included ?? QelvoraCopy.text("accessDefaultIncluded"))
      row(
        "accessLabelRequest",
        byRequest ?? QelvoraCopy.text("accessDefaultRequest", values: ["name": name]))
      row("accessLabelChanges", changes ?? QelvoraCopy.text("accessDefaultChanges"))
    }.foregroundStyle(qColor("ink", scheme))
  }
  private func row(_ key: String, _ text: String) -> some View {
    GridRow(alignment: .top) {
      Text(QelvoraCopy.text(key).uppercased()).qText("access-term").foregroundStyle(
        qColor("ink-muted", scheme)
      ).frame(width: QelvoraTokens.token("access-term-width"), alignment: .leading)
      Text(text).qText("control-body").frame(maxWidth: .infinity, alignment: .leading)
    }.accessibilityElement(children: .combine)
  }
}

public struct ModeItem: Identifiable, Equatable, Sendable {
  public var id: String
  public var title: String
  public var meta: String
  public var price: String
  public var selected: Bool
  public var disabled: Bool
  public init(
    id: String, title: String, meta: String, price: String, selected: Bool = false,
    disabled: Bool = false
  ) {
    self.id = id
    self.title = title
    self.meta = meta
    self.price = price
    self.selected = selected
    self.disabled = disabled
  }
}
public struct ModeList: View {
  public var modes: [ModeItem]
  public var group: String
  public var legend: String
  public var onSelect: (String) -> Void
  private var providedSelection: Binding<String?>?
  @State private var localSelection: String?
  @Environment(\.colorScheme) private var scheme
  public init(
    modes: [ModeItem] = [], group: String = "qelvora-mode",
    legend: String = QelvoraCopy.text("howAnswers", values: ["name": "Maya"]),
    selection: Binding<String?>? = nil, onSelect: @escaping (String) -> Void = { _ in }
  ) {
    self.modes = modes
    self.group = group
    self.legend = legend
    self.providedSelection = selection
    self.onSelect = onSelect
    _localSelection = State(initialValue: modes.first(where: { $0.selected })?.id)
  }
  private var selection: Binding<String?> { providedSelection ?? $localSelection }
  public var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(modes.enumerated()), id: \.element.id) { index, item in
        let selected = selection.wrappedValue == item.id
        SwiftUI.Button {
          selection.wrappedValue = item.id
          onSelect(item.id)
        } label: {
          HStack(spacing: QelvoraTokens.token("space-3")) {
            AccessRadio(
              selected: selected, size: QelvoraTokens.token("checkbox-size"),
              disabled: item.disabled)
            VStack(alignment: .leading, spacing: QelvoraTokens.token("wave-gap")) {
              Text(item.title).qText("mode-title")
              Text(item.meta).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
            }.frame(maxWidth: .infinity, alignment: .leading)
            Text(item.price).qText("data-md").fixedSize()
          }.padding(.horizontal, QelvoraTokens.token("message-padding")).padding(
            .vertical, QelvoraTokens.token("space-4")
          )
          .foregroundStyle(qColor(item.disabled ? "ink-muted" : "ink", scheme)).frame(
            maxWidth: .infinity, alignment: .leading
          )
          .background(qColor(item.disabled ? "ground" : "surface", scheme))
          .overlay {
            if selected {
              Rectangle().strokeBorder(
                qColor("ink", scheme), lineWidth: QelvoraTokens.token("hairline"))
            }
          }
          .overlay(alignment: .top) {
            if index > 0 {
              Rectangle().fill(qColor("line", scheme)).frame(
                height: QelvoraTokens.token("hairline"))
            }
          }
        }.buttonStyle(.plain).disabled(item.disabled).accessibilityIdentifier(group + "-" + item.id)
          .accessibilityAddTraits(selected ? [.isSelected] : [])
      }
    }.background(qColor("surface", scheme)).clipShape(
      RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg"))
    )
    .overlay(
      RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")).stroke(
        qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline"))
    )
    .accessibilityElement(children: .contain).accessibilityLabel(legend)
  }
}

struct AccessRadio: View {
  var selected: Bool
  var size: CGFloat
  var disabled = false
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    Circle().stroke(
      qColor(disabled ? "control-line" : "ink", scheme),
      lineWidth: QelvoraTokens.token("request-dot-stroke")
    )
    .overlay {
      if selected { Circle().fill(qColor("ink", scheme)).padding(QelvoraTokens.token("space-1")) }
    }.frame(width: size, height: size).accessibilityHidden(true)
  }
}
struct AccessCheckbox: View {
  var checked: Bool
  @Environment(\.colorScheme) private var scheme
  var body: some View {
    RoundedRectangle(cornerRadius: QelvoraTokens.token("wave-radius")).fill(
      qColor(checked ? "ink" : "surface", scheme)
    )
    .overlay(
      RoundedRectangle(cornerRadius: QelvoraTokens.token("wave-radius")).stroke(
        qColor("control-line", scheme), lineWidth: QelvoraTokens.token("hairline"))
    )
    .overlay {
      if checked {
        QelvoraGlyph(
          name: "check", size: QelvoraTokens.token("space-4"), color: qColor("surface", scheme))
      }
    }
    .frame(
      width: QelvoraTokens.token("checkbox-size"), height: QelvoraTokens.token("checkbox-size")
    ).accessibilityHidden(true)
  }
}

public struct IncludeItem: Identifiable, Equatable, Sendable {
  public var id: String
  public var label: String
  public var help: String?
  public var checked: Bool
  public init(id: String, label: String, help: String? = nil, checked: Bool = false) {
    self.id = id
    self.label = label
    self.help = help
    self.checked = checked
  }
}
public struct IncludeList: View {
  public var name: String
  public var notice: Bool
  public var edited: Bool
  public var onChange: (String, [IncludeItem], Bool) -> Void
  private var providedSummary: Binding<String>?
  private var providedItems: Binding<[IncludeItem]>?
  private var providedSummaryIncluded: Binding<Bool>?
  @State private var localSummary: String
  @State private var localItems: [IncludeItem]
  @State private var localSummaryIncluded = true
  @State private var changed = false
  @Environment(\.colorScheme) private var scheme
  public init(
    summary: String = "", items: [IncludeItem] = [], edited: Bool = false, notice: Bool = true,
    name: String = "Maya", summaryBinding: Binding<String>? = nil,
    itemsBinding: Binding<[IncludeItem]>? = nil, summaryIncluded: Binding<Bool>? = nil,
    onChange: @escaping (String, [IncludeItem], Bool) -> Void = { _, _, _ in }
  ) {
    self.name = name
    self.notice = notice
    self.edited = edited
    self.providedSummary = summaryBinding
    self.providedItems = itemsBinding
    self.providedSummaryIncluded = summaryIncluded
    self.onChange = onChange
    _localSummary = State(initialValue: summary)
    _localItems = State(initialValue: items)
  }
  private var summary: Binding<String> { providedSummary ?? $localSummary }
  private var items: Binding<[IncludeItem]> { providedItems ?? $localItems }
  private var summaryIncluded: Binding<Bool> { providedSummaryIncluded ?? $localSummaryIncluded }
  private func notify() {
    onChange(summary.wrappedValue, items.wrappedValue, summaryIncluded.wrappedValue)
  }
  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      SwiftUI.Button {
        summaryIncluded.wrappedValue.toggle()
        notify()
      } label: {
        HStack(spacing: QelvoraTokens.token("composer-gap")) {
          AccessCheckbox(checked: summaryIncluded.wrappedValue)
          Text(QelvoraCopy.text("summaryQuestion")).qText("body-strong").frame(
            maxWidth: .infinity, alignment: .leading)
          if edited || changed {
            Text(QelvoraCopy.text("editedByYou")).qText("data-sm").foregroundStyle(
              qColor("maya-ink", scheme))
          }
        }
        .padding(.horizontal, QelvoraTokens.token("message-padding")).padding(
          .vertical, QelvoraTokens.token("composer-gap")
        ).frame(minHeight: QelvoraTokens.token("include-row-height"))
      }.buttonStyle(.plain).accessibilityValue(
        summaryIncluded.wrappedValue ? QelvoraCopy.text("includedInRequest") : "")
      TextEditor(text: summary).qText("summary").scrollContentBackground(.hidden).padding(
        QelvoraTokens.token("space-3")
      )
      .frame(minHeight: QelvoraTokens.textStyles["summary"]!.lineHeight * 4)
      .background(
        qColor("ground", scheme),
        in: RoundedRectangle(cornerRadius: QelvoraTokens.token("chip-radius"))
      )
      .overlay(
        RoundedRectangle(cornerRadius: QelvoraTokens.token("chip-radius")).stroke(
          qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline"))
      )
      .padding(.horizontal, QelvoraTokens.token("message-padding")).padding(
        .bottom, QelvoraTokens.token("message-padding")
      )
      .accessibilityLabel(QelvoraCopy.text("summary"))
      .onChange(of: summary.wrappedValue) { _, _ in
        changed = true
        notify()
      }
      ForEach(Array(items.wrappedValue.enumerated()), id: \.element.id) { index, item in
        SwiftUI.Button {
          var updated = items.wrappedValue
          updated[index].checked.toggle()
          items.wrappedValue = updated
          notify()
        } label: {
          HStack(spacing: QelvoraTokens.token("composer-gap")) {
            AccessCheckbox(checked: item.checked)
            VStack(alignment: .leading, spacing: QelvoraTokens.token("wave-gap")) {
              Text(item.label).qText("control-body")
              if let help = item.help {
                Text(help).qText("caption").foregroundStyle(qColor("ink-muted", scheme))
              }
            }.frame(maxWidth: .infinity, alignment: .leading)
          }.padding(.horizontal, QelvoraTokens.token("message-padding")).padding(
            .vertical, QelvoraTokens.token("composer-gap")
          ).frame(minHeight: QelvoraTokens.token("include-row-height"))
            .overlay(alignment: .top) {
              Rectangle().fill(qColor("line", scheme)).frame(
                height: QelvoraTokens.token("hairline"))
            }
        }.buttonStyle(.plain).accessibilityIdentifier(item.id).accessibilityAddTraits(
          item.checked ? [.isSelected] : [])
      }
      if notice {
        Text(QelvoraCopy.text("packetAccess", values: ["name": name])).qText("caption")
          .foregroundStyle(qColor("ink-muted", scheme)).padding(
            .horizontal, QelvoraTokens.token("message-padding")
          ).padding(.top, QelvoraTokens.token("space-3")).padding(
            .bottom, QelvoraTokens.token("message-padding")
          ).overlay(alignment: .top) {
            Rectangle().fill(qColor("line", scheme)).frame(height: QelvoraTokens.token("hairline"))
          }
      }
    }.foregroundStyle(qColor("ink", scheme)).background(
      qColor("surface", scheme),
      in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg"))
    )
    .overlay(
      RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")).stroke(
        qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline")))
  }
}

public struct TermsBlock: View {
  public var price: String
  public var deadline: String
  public var draftNote: Bool
  public var name: String
  @Environment(\.colorScheme) private var scheme
  public init(
    price: String = "$25.00", deadline: String = "48 h", draftNote: Bool = true,
    name: String = "Maya"
  ) {
    self.price = price
    self.deadline = deadline
    self.draftNote = draftNote
    self.name = name
  }
  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      row(QelvoraCopy.text("ifAccepts", values: ["name": name]), price)
      row(QelvoraCopy.text("ifDeclines", values: ["deadline": deadline]), "$0.00")
      VStack(alignment: .leading, spacing: QelvoraTokens.token("author-gap")) {
        chargeRule.qText("control-body")
        Text(QelvoraCopy.text("pendingHold")).qText("caption").foregroundStyle(
          qColor("ink-muted", scheme))
        if draftNote {
          Text(QelvoraCopy.text("draftNotice", values: ["name": name])).qText("caption")
            .foregroundStyle(qColor("ink-muted", scheme))
        }
      }.padding(.vertical, QelvoraTokens.token("space-3")).padding(
        .horizontal, QelvoraTokens.token("message-padding"))
    }.foregroundStyle(qColor("ink", scheme)).background(
      qColor("surface", scheme),
      in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg"))
    )
    .overlay(
      RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")).stroke(
        qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline")))
  }
  private var chargeRule: Text {
    let sentence = QelvoraCopy.text("chargeRule", values: ["name": name, "deadline": deadline])
    guard let split = sentence.range(of: ". If") else { return Text(sentence) }
    return Text(String(sentence[..<split.lowerBound]) + ".").fontWeight(.semibold)
      + Text(String(sentence[sentence.index(after: split.lowerBound)...]))
  }
  private func row(_ label: String, _ value: String) -> some View {
    HStack(spacing: QelvoraTokens.token("space-3")) {
      Text(label.uppercased()).foregroundStyle(qColor("ink-muted", scheme))
      Spacer(minLength: 0)
      Text(value).fixedSize()
    }
    .qText("mono-caption").padding(.vertical, QelvoraTokens.token("space-3")).padding(
      .horizontal, QelvoraTokens.token("message-padding")
    )
    .overlay(alignment: .bottom) {
      Line().stroke(
        qColor("line", scheme),
        style: StrokeStyle(
          lineWidth: QelvoraTokens.token("hairline"), dash: [QelvoraTokens.token("space-1")])
      ).frame(height: QelvoraTokens.token("hairline"))
    }
  }
}

struct Line: Shape {
  func path(in rect: CGRect) -> Path {
    var path = Path()
    path.move(to: CGPoint(x: rect.minX, y: rect.midY))
    path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
    return path
  }
}
public struct EtaLine: View {
  public var range: String
  public var ahead: Int?
  public var name: String
  @Environment(\.colorScheme) private var scheme
  public init(range: String = "1 to 2 days", ahead: Int? = nil, name: String = "Maya") {
    self.range = range
    self.ahead = ahead
    self.name = name
  }
  public var body: some View {
    HStack(spacing: QelvoraTokens.token("composer-gap")) {
      QelvoraGlyph(name: "clock", color: qColor("ink-muted", scheme))
      Text(
        QelvoraCopy.text("decisionEta", values: ["name": name, "range": range])
          + (ahead.map { QelvoraCopy.text("requestsAhead", values: ["count": String($0)]) } ?? "")
      ).qText("label", weight: .regular)
    }.foregroundStyle(qColor("ink-muted", scheme))
  }
}

public enum RequestStepState: String, Sendable { case done, current, todo }
public struct RequestStep: Identifiable, Equatable, Sendable {
  public var id: String
  public var label: String
  public var time: String?
  public var state: RequestStepState
  public init(id: String, label: String, time: String? = nil, state: RequestStepState = .todo) {
    self.id = id
    self.label = label
    self.time = time
    self.state = state
  }
}
public struct RequestStatus: View {
  public var reqId: String
  public var mode: String
  public var price: String
  public var steps: [RequestStep]
  public var outcome: String?
  public var children: AnyView?
  @Environment(\.colorScheme) private var scheme
  public init(
    reqId: String = "REQ-0412", mode: String = QelvoraCopy.text("writtenReply"),
    price: String = "$25", steps: [RequestStep] = [], outcome: String? = nil,
    children: AnyView? = nil
  ) {
    self.reqId = reqId
    self.mode = mode
    self.price = price
    self.steps = steps
    self.outcome = outcome
    self.children = children
  }
  public var body: some View {
    VStack(alignment: .leading, spacing: QelvoraTokens.token("space-3")) {
      HStack(spacing: QelvoraTokens.token("composer-gap")) {
        Text(reqId.uppercased()).qText("data-sm").fixedSize()
        Rectangle().fill(qColor("line", scheme)).frame(height: QelvoraTokens.token("hairline"))
        Text((mode + " · " + price).uppercased()).qText("data-sm").fixedSize()
      }.foregroundStyle(qColor("ink-muted", scheme))
      VStack(spacing: 0) {
        ForEach(steps) { step in
          HStack(alignment: .top, spacing: QelvoraTokens.token("space-3")) {
            Circle().fill(
              qColor(
                step.state == .current ? "maya-ink" : step.state == .done ? "ink" : "surface",
                scheme)
            )
            .overlay(
              Circle().stroke(
                qColor(
                  step.state == .current
                    ? "maya-ink" : step.state == .todo ? "control-line" : "ink", scheme),
                lineWidth: QelvoraTokens.token("request-dot-stroke"))
            )
            .overlay {
              if step.state == .current {
                Circle().stroke(
                  qColor("surface", scheme), lineWidth: QelvoraTokens.token("request-dot-inset")
                ).padding(-QelvoraTokens.token("request-dot-inset"))
                Circle().stroke(
                  qColor("maya-ink", scheme), lineWidth: QelvoraTokens.token("hairline")
                ).padding(-QelvoraTokens.token("space-1"))
              }
            }
            .frame(
              width: QelvoraTokens.token("request-dot-size"),
              height: QelvoraTokens.token("request-dot-size")
            ).padding(.top, QelvoraTokens.token("sheet-grabber-height")).frame(
              width: QelvoraTokens.token("space-4")
            ).accessibilityHidden(true)
            Text(step.label).qText(
              "control-body", weight: step.state == .current ? .semibold : .regular
            ).frame(maxWidth: .infinity, alignment: .leading)
            if let time = step.time {
              Text(time).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme)).fixedSize()
            }
          }.foregroundStyle(qColor(step.state == .todo ? "ink-muted" : "ink", scheme)).padding(
            .vertical, QelvoraTokens.token("author-gap")
          ).accessibilityElement(children: .combine)
        }
      }
      if let outcome {
        Text(outcome).qText("control-body").padding(.vertical, QelvoraTokens.token("space-3"))
          .padding(.horizontal, QelvoraTokens.token("message-padding")).frame(
            maxWidth: .infinity, alignment: .leading
          ).background(
            qColor("ground", scheme),
            in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")))
      }
      if let children { children }
    }.padding(QelvoraTokens.token("message-padding")).foregroundStyle(qColor("ink", scheme))
      .background(
        qColor("surface", scheme),
        in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg"))
      )
      .overlay(
        RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-lg")).stroke(
          qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline"))
      )
      .accessibilityElement(children: .contain).accessibilityLabel(
        QelvoraCopy.text("requestStatus"))
  }
}

public struct ReceiptRow: Identifiable, Equatable, Sendable {
  public var id: String
  public var label: String
  public var value: String
  public init(id: String, label: String, value: String) {
    self.id = id
    self.label = label
    self.value = value
  }
}
public struct Receipt: View {
  public var reqId: String
  public var title: String?
  public var rows: [ReceiptRow]
  public var label: String?
  public var name: String
  @Environment(\.colorScheme) private var scheme
  public init(
    reqId: String = "REQ-0412", title: String? = nil, rows: [ReceiptRow] = [], label: String? = nil,
    name: String = "Maya"
  ) {
    self.reqId = reqId
    self.title = title
    self.rows = rows
    self.label = label
    self.name = name
  }
  public var body: some View {
    VStack(alignment: .leading, spacing: QelvoraTokens.token("space-4")) {
      HStack {
        Text(QelvoraCopy.brandName + " · " + QelvoraCopy.text("receipt"))
        Spacer()
        Text(reqId)
      }.textCase(.uppercase).qText("data-sm").foregroundStyle(qColor("ink-muted", scheme))
      Text(title ?? QelvoraCopy.text("receiptTitle", values: ["name": name])).qText("receipt-title")
      VStack(spacing: 0) {
        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
          HStack(spacing: QelvoraTokens.token("space-3")) {
            Text(row.label).foregroundStyle(qColor("ink-muted", scheme))
            Spacer(minLength: 0)
            Text(row.value).fixedSize()
          }.qText("mono-caption").padding(.vertical, QelvoraTokens.token("space-2"))
            .overlay(alignment: .top) {
              Line().stroke(
                qColor("line", scheme),
                style: StrokeStyle(
                  lineWidth: QelvoraTokens.token("hairline"), dash: [QelvoraTokens.token("space-1")]
                )
              ).frame(height: QelvoraTokens.token("hairline"))
            }
            .overlay(alignment: .bottom) {
              if index == rows.count - 1 {
                Line().stroke(
                  qColor("line", scheme),
                  style: StrokeStyle(
                    lineWidth: QelvoraTokens.token("hairline"),
                    dash: [QelvoraTokens.token("space-1")])
                ).frame(height: QelvoraTokens.token("hairline"))
              }
            }
        }
      }
      HStack(spacing: QelvoraTokens.token("composer-gap")) {
        QelvoraGlyph(
          name: "sealCheck", size: QelvoraTokens.token("seal-step"),
          color: qColor("maya-ink", scheme))
        VStack(alignment: .leading, spacing: QelvoraTokens.token("wave-gap")) {
          Text(QelvoraCopy.text("signedBy", values: ["name": name])).qText("label").foregroundStyle(
            qColor("maya-ink", scheme))
          Text(label ?? QelvoraCopy.text("writtenBy", values: ["name": name])).qText("caption")
            .foregroundStyle(qColor("ink-muted", scheme))
        }
      }
    }.padding(.horizontal, QelvoraTokens.token("receipt-padding-x")).padding(
      .vertical, QelvoraTokens.token("receipt-padding-y")
    ).frame(maxWidth: QelvoraTokens.token("receipt-max-width"), alignment: .leading)
      .foregroundStyle(qColor("ink", scheme)).background(
        qColor("surface", scheme),
        in: RoundedRectangle(cornerRadius: QelvoraTokens.token("receipt-radius"))
      )
      .overlay(
        RoundedRectangle(cornerRadius: QelvoraTokens.token("receipt-radius")).stroke(
          qColor("line", scheme), lineWidth: QelvoraTokens.token("hairline")))
  }
}

public struct SpendLimit: View {
  public var options: [String]
  public var remindersOn: Bool?
  public var onSelect: (String) -> Void
  private var providedSelection: Binding<String?>?
  @State private var localSelection: String?
  @Environment(\.colorScheme) private var scheme
  public init(
    options: [String] = ["$30", "$60", "$120", QelvoraCopy.text("noLimit")],
    selection: Binding<String?>? = nil, remindersOn: Bool? = nil,
    onSelect: @escaping (String) -> Void = { _ in }
  ) {
    self.options = options
    self.remindersOn = remindersOn
    self.providedSelection = selection
    self.onSelect = onSelect
  }
  private var selection: Binding<String?> { providedSelection ?? $localSelection }
  public var body: some View {
    VStack(alignment: .leading, spacing: QelvoraTokens.token("space-3")) {
      Text(QelvoraCopy.text("spendLimit")).qText("body-strong")
      LazyVGrid(
        columns: [
          GridItem(.flexible(), spacing: QelvoraTokens.token("space-2")), GridItem(.flexible()),
        ], spacing: QelvoraTokens.token("space-2")
      ) {
        ForEach(options, id: \.self) { option in
          SwiftUI.Button {
            selection.wrappedValue = option
            onSelect(option)
          } label: {
            HStack(spacing: QelvoraTokens.token("composer-gap")) {
              AccessRadio(
                selected: selection.wrappedValue == option,
                size: QelvoraTokens.token("limit-radio-size"))
              Text(option).qText("data-md")
              Spacer(minLength: 0)
            }
            .padding(.horizontal, QelvoraTokens.token("message-padding")).frame(
              minHeight: QelvoraTokens.token("include-row-height")
            )
            .background(
              qColor("surface", scheme),
              in: RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md"))
            )
            .overlay(
              RoundedRectangle(cornerRadius: QelvoraTokens.token("radius-md")).stroke(
                qColor("control-line", scheme), lineWidth: QelvoraTokens.token("hairline")))
          }.buttonStyle(.plain).accessibilityAddTraits(
            selection.wrappedValue == option ? [.isSelected] : [])
        }
      }.accessibilityElement(children: .contain).accessibilityLabel(
        QelvoraCopy.text("monthlyLimitLegend"))
      Text(QelvoraCopy.text(remindersOn == true ? "limitReminders" : remindersOn == false ? "limitRemindersOff" : "limitRemindersUnknown")).qText("caption").foregroundStyle(
        qColor("ink-muted", scheme))
    }.foregroundStyle(qColor("ink", scheme))
  }
}
