import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Decision Picker (`components/widgets/modules/DecisionWidget.tsx`,
// `restingFaces/catalog.ts decisionFace`). A question, a list of option
// strings and the index the dice landed on. The skin field is `mode`
// (simple, weighted); the catalogue skins wheel and coin_dice dress the same
// body, and tournament / elimination / consensus are schema extensions that
// render it with a note.
//
// Adding an option runs the `add_item` command so a tap and a wire append
// the same record (the web's tap appends an empty string; the command's
// default text is "New option"). Editing or removing an option clears the
// pick, exactly as the web does. "Decide for me" lands without the
// roulette animation: the pick is the only thing the document keeps.
// ---------------------------------------------------------------------------

public struct DecisionWidget: WidgetRenderer {
    public static let type = "decision"
    static let skins = ["simple", "weighted", "wheel", "coin_dice", "tournament", "elimination", "consensus"]
    static let extensionSkins: Set<String> = ["tournament", "elimination", "consensus"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("mode")
        return skins.contains(raw) ? raw : "simple"
    }

    static func options(_ data: JSONObject) -> [String] {
        (data.array("options") ?? []).map { $0.stringValue ?? "" }
    }

    static func picked(_ data: JSONObject) -> Int? {
        guard let raw = data.finite("pickedIndex"), raw == raw.rounded(), raw >= 0 else { return nil }
        return Int(raw)
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = DecisionWidget.skin(data)
        let options = DecisionWidget.options(data)
        let picked = DecisionWidget.picked(data)
        let pickedText = picked.flatMap { options.indices.contains($0) ? options[$0] : nil } ?? ""
        let weights = (data.array("weights") ?? []).map { $0.numberValue }
        let filled = options.enumerated().filter { !JavaScript.trim($0.element).isEmpty }.map(\.offset)
        let accent = Color(hex: context.accent)
        let good = Color(hex: "#34d399")
        return VStack(alignment: .leading, spacing: 6) {
            if DecisionWidget.extensionSkins.contains(skin) {
                NotesSkinNote("Shown as the simple picker — the \(skin) rounds arrive with their details later.")
            }
            CardTextField("What are we deciding?", text: data.str("question")) { next in
                context.update { $0["question"] = .string(next) }
            }
            .font(GlassType.value)
            ForEach(Array(options.enumerated()), id: \.offset) { index, option in
                let isPicked = picked == index
                HStack(spacing: 8) {
                    Circle().fill(isPicked ? good : Color.secondary.opacity(0.5)).frame(width: 6, height: 6)
                    CardTextField("Option…", text: option) { next in
                        // `setOption`: the pick is cleared whenever the list changes.
                        context.update { data in
                            data["pickedIndex"] = .null
                            var list = data.array("options") ?? []
                            if list.indices.contains(index) { list[index] = .string(next) }
                            data["options"] = .array(list)
                        }
                    }
                    .foregroundStyle(isPicked ? good : .primary)
                    if skin == "weighted", let weight = weights.indices.contains(index) ? weights[index] : nil {
                        Text("×\(RestText.number(weight))").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
                    }
                    if isPicked {
                        Text("Picked").font(GlassType.label).foregroundStyle(good)
                    }
                    if options.count > 2 {
                        RowDeleteButton(label: "Remove option \(index + 1)") {
                            context.update { data in
                                data["pickedIndex"] = .null
                                var list = data.array("options") ?? []
                                if list.indices.contains(index) { list.remove(at: index) }
                                data["options"] = .array(list)
                            }
                        }
                    }
                }
            }
            FlowButton("Add option", symbol: "plus", accent: accent) { context.runCommand("add_item") }
            Button {
                guard filled.count >= 2, let winner = filled.randomElement() else { return }
                context.update { $0["pickedIndex"] = .number(Double(winner)) }
            } label: {
                Label("Decide for me", systemImage: "dice")
                    .font(GlassType.body)
                    .foregroundStyle(filled.count >= 2 ? good : Color.secondary)
                    .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
                    .background(RoundedRectangle(cornerRadius: GlassTokens.r1, style: .continuous).fill(good.opacity(filled.count >= 2 ? 0.15 : 0.06)))
            }
            .buttonStyle(.plain)
            .disabled(filled.count < 2)
            .touchTarget()
            if !pickedText.isEmpty {
                HStack(spacing: 4) {
                    Text("Picked:").font(GlassType.label).foregroundStyle(.secondary)
                    Text(pickedText).font(GlassType.label).foregroundStyle(good).lineLimit(1)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `decisionFace`: the options, the pick kept lit, weights beside a
    /// weighted list.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let options = DecisionWidget.options(data)
        if options.isEmpty { return .icon }
        let picked = data.finite("pickedIndex")
        let weights = data.array("weights") ?? []
        let weighted = DecisionWidget.skin(data) == "weighted"
        let visible = options.prefix(RestingFaceMeasure.rowLimit)
        let rows = visible.enumerated().map { index, option -> RestRow in
            let weight = weights.indices.contains(index) ? weights[index].numberValue : nil
            let isPicked = picked == Double(index)
            return RestRow(
                key: "option-\(index)",
                label: RestText.compact(option, 24),
                value: weighted && weight != nil ? "×\(RestText.number(weight!))" : nil,
                lead: isPicked ? "★" : nil,
                tone: isPicked ? .accent : .muted
            )
        }
        return NotesAndStudyFamily.dressed(.rows(rows: rows, overflow: max(0, options.count - rows.count)), type: DecisionWidget.type, data: data)
    }
}
