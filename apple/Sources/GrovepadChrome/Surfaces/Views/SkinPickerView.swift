import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The skin picker: the web's skin roller (`WidgetSkinRoller.tsx`) as a
// native popover. The web unfurls the title into a 3D drum; the system's
// idiom for "pick one of these looks" is a popover list anchored on the
// control that opened it, so the drum becomes rows under the card's icon.
// What carries over: every skin shows its own mark and hue, the worn one is
// ticked, arrow keys walk the list, Return / a click commits (one undo
// step through `BoardDocument.setSkin`), Escape dismisses.
// ---------------------------------------------------------------------------

public struct SkinPickerModel {
    public struct Row: Equatable, Identifiable, Sendable {
        public var id: String { value }
        public var value: String
        public var label: String
        public var accent: String
        public var symbol: String
        public var isCurrent: Bool
    }

    public let widgetId: String
    public let typeLabel: String
    public let rows: [Row]

    public init?(document: BoardDocument, widgetId: String) {
        guard let widget = document.widget(widgetId), let definition = WidgetRegistry.definition(for: widget.type), !definition.skins.isEmpty else { return nil }
        self.widgetId = widgetId
        typeLabel = definition.label
        let current = definition.skinValue(in: widget.data) ?? definition.skins.first?.value
        rows = definition.skins.map { skin in
            Row(value: skin.value, label: skin.label, accent: skin.accent, symbol: WidgetSymbols.symbol(for: widget.type, skin: skin.value), isCurrent: skin.value == current)
        }
    }

    public var currentIndex: Int { rows.firstIndex(where: \.isCurrent) ?? 0 }

    /// Wear `value`; returns whether anything changed.
    @discardableResult
    public func choose(_ value: String, document: BoardDocument) -> Bool {
        guard rows.first(where: \.isCurrent)?.value != value else { return false }
        return document.setSkin(widgetId, value: value)
    }
}

public struct SkinPickerView: View {
    private let model: SkinPickerModel
    private let document: BoardDocument
    private let onDone: () -> Void
    @State private var highlighted: Int
    @FocusState private var focused: Bool

    public init(model: SkinPickerModel, document: BoardDocument, onDone: @escaping () -> Void) {
        self.model = model
        self.document = document
        self.onDone = onDone
        _highlighted = State(initialValue: model.currentIndex)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("\(model.typeLabel) skin")
                .font(.grove(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .padding(.horizontal, 14)
                .padding(.top, 12)
                .padding(.bottom, 6)
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 2) {
                        ForEach(Array(model.rows.enumerated()), id: \.element.id) { index, row in
                            SkinPickerRow(row: row, highlighted: index == highlighted)
                                .id(index)
                                .onHover { inside in if inside { highlighted = index } }
                                .onTapGesture { commit(index) }
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.bottom, 8)
                }
                .onAppear { proxy.scrollTo(highlighted, anchor: .center) }
                .onChange(of: highlighted) { _, index in withAnimation(.easeOut(duration: 0.12)) { proxy.scrollTo(index) } }
            }
        }
        .frame(width: 240)
        .frame(maxHeight: 380)
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onAppear { focused = true }
        .onKeyPress(.downArrow) { move(1) }
        .onKeyPress(.upArrow) { move(-1) }
        .onKeyPress(.return) { commit(highlighted); return .handled }
        .onKeyPress(.space) { commit(highlighted); return .handled }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(model.typeLabel) skins")
    }

    private func move(_ step: Int) -> KeyPress.Result {
        highlighted = max(0, min(model.rows.count - 1, highlighted + step))
        return .handled
    }

    private func commit(_ index: Int) {
        guard model.rows.indices.contains(index) else { return }
        model.choose(model.rows[index].value, document: document)
        onDone()
    }
}

struct SkinPickerRow: View {
    let row: SkinPickerModel.Row
    let highlighted: Bool

    var body: some View {
        let accent = Color(hex: row.accent)
        HStack(spacing: 10) {
            Image(systemName: row.symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: 28, height: 28)
                .background(accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(accent.opacity(0.3), lineWidth: 1))
            Text(row.label)
                .font(.grove(size: 13, weight: row.isCurrent ? .semibold : .medium))
                .foregroundStyle(Color.primary)
                .lineLimit(1)
            Spacer(minLength: 4)
            if row.isCurrent {
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(accent)
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 40)
        .background(
            RoundedRectangle(cornerRadius: 9, style: .continuous)
                .fill(highlighted ? accent.opacity(0.16) : Color.clear)
        )
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(row.isCurrent ? [.isButton, .isSelected] : .isButton)
    }
}
