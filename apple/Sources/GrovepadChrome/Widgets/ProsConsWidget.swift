import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Pros & Cons (`components/widgets/modules/ProsConsWidget.tsx`,
// `prosConsSkinModel.ts`, `restingFace.ts` pros_cons branch). One topic and
// two lists of `{ id, text }`; the skin field is `skin`. The balance meter
// and the two columns are the shared body; every skin reads and writes the
// same arguments with its own words (`SKIN_COPY`).
//
// Skins: balance, debate and red_team are drawn as the two columns with their
// own labels (the web's debate stage and attack panels are arrangements of
// the same lists; their rebuttal/severity pockets are read, not edited);
// weighted_trade_off and reversible_irreversible are schema extensions and
// render the columns with a note, the meter reading their pockets.
// ---------------------------------------------------------------------------

public struct ProsConsWidget: WidgetRenderer {
    public static let type = "pros_cons"
    static let skins = ["balance", "debate", "red_team", "weighted_trade_off", "reversible_irreversible"]
    static let extensionSkins: Set<String> = ["weighted_trade_off", "reversible_irreversible"]
    static let maxItems = 120
    static let defaultWeight = 3.0

    struct Copy {
        var eyebrow: String
        var topic: String
        var proLabel: String
        var conLabel: String
        var proPlaceholder: String
        var conPlaceholder: String
    }

    static let copy: [String: Copy] = [
        "balance": Copy(eyebrow: "Weighing up", topic: "What's the decision?", proLabel: "Pros", conLabel: "Cons", proPlaceholder: "A reason to go ahead…", conPlaceholder: "A reason to hold back…"),
        "debate": Copy(eyebrow: "Both sides", topic: "What's the motion?", proLabel: "For", conLabel: "Against", proPlaceholder: "State the case for…", conPlaceholder: "State the case against…"),
        "red_team": Copy(eyebrow: "Attack the plan", topic: "What are we stress-testing?", proLabel: "Claims", conLabel: "Failure modes", proPlaceholder: "What we believe is true…", conPlaceholder: "How could this break?"),
        "weighted_trade_off": Copy(eyebrow: "Weighted call", topic: "What's the trade-off?", proLabel: "Upside", conLabel: "Downside", proPlaceholder: "What we gain…", conPlaceholder: "What it costs…"),
        "reversible_irreversible": Copy(eyebrow: "How undoable?", topic: "What are we committing to?", proLabel: "Benefits", conLabel: "Consequences", proPlaceholder: "A benefit of deciding…", conPlaceholder: "A consequence of deciding…"),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "balance"
    }

    struct Point {
        var id: String
        var text: String
    }

    /// `prosConsItems`: id and text, capped at 120.
    static func points(_ data: JSONObject, _ key: String) -> [Point] {
        (data.array(key) ?? []).prefix(maxItems).enumerated().compactMap { index, raw in
            guard let record = raw.objectValue else { return nil }
            let id = record.str("id")
            return Point(id: id.isEmpty ? "point-\(index)" : id, text: String(record.str("text").prefix(1_000)))
        }
    }

    /// `statedItems`: only points with words count.
    static func stated(_ points: [Point]) -> [Point] {
        points.filter { !JavaScript.trim($0.text).isEmpty }
    }

    /// `prosConsWeights`: the 1–5 dial, default 3 (only non-defaults are kept).
    static func weights(_ data: JSONObject) -> [String: Double] {
        let raw = data.skinState("weighted_trade_off").object("weights") ?? JSONObject()
        var result: [String: Double] = [:]
        for (id, value) in raw.entries.prefix(maxItems) {
            let weight = min(5, max(1, value.numberValue.map { $0.isFinite ? jsRound($0) : defaultWeight } ?? defaultWeight))
            if weight != defaultWeight { result[id] = weight }
        }
        return result
    }

    static func reversibility(_ data: JSONObject) -> [String: String] {
        let raw = data.skinState("reversible_irreversible").object("reversibility") ?? JSONObject()
        var result: [String: String] = [:]
        for (id, value) in raw.entries.prefix(maxItems) where value.stringValue == "reversible" || value.stringValue == "irreversible" {
            result[id] = value.stringValue
        }
        return result
    }

    static func severities(_ data: JSONObject) -> [String: String] {
        let raw = data.skinState("red_team").object("attacks") ?? JSONObject()
        var result: [String: String] = [:]
        for (id, value) in raw.entries.prefix(maxItems) {
            guard let detail = value.objectValue else { continue }
            let severity = ["low", "medium", "high"].contains(detail.str("severity")) ? detail.str("severity") : "medium"
            if severity != "medium" || !detail.str("evidence").isEmpty { result[id] = severity }
        }
        return result
    }

    /// `verdictFrom`: the share of the bar the pro side fills.
    static func proShare(pro: Double, con: Double) -> Double {
        let total = pro + con
        return total == 0 ? 50 : jsRound(pro / total * 100)
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = ProsConsWidget.skin(data)
        let copy = ProsConsWidget.copy[skin] ?? ProsConsWidget.copy["balance"]!
        let pros = ProsConsWidget.points(data, "pros")
        let cons = ProsConsWidget.points(data, "cons")
        let accent = Color(hex: context.accent)
        let weights = skin == "weighted_trade_off" ? ProsConsWidget.weights(data) : [:]
        let score = { (points: [Point]) -> Double in
            skin == "weighted_trade_off"
                ? ProsConsWidget.stated(points).reduce(0.0) { $0 + (weights[$1.id] ?? ProsConsWidget.defaultWeight) }
                : Double(ProsConsWidget.stated(points).count)
        }
        let proValue = score(pros)
        let conValue = score(cons)
        let share = ProsConsWidget.proShare(pro: proValue, con: conValue)
        let irreversible = skin == "reversible_irreversible"
            ? ProsConsWidget.reversibility(data).values.filter { $0 == "irreversible" }.count : 0
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                GlassLabel(copy.eyebrow)
                Spacer(minLength: 0)
                if irreversible > 0 {
                    Text("\(irreversible) one-way").font(GlassType.label).foregroundStyle(Color(hex: "#f87171"))
                }
            }
            if ProsConsWidget.extensionSkins.contains(skin) {
                NotesSkinNote("Shown as the two columns — the \(skin.replacingOccurrences(of: "_", with: " ")) dials arrive with their details later.")
            }
            CardTextField(copy.topic, text: data.str("topic")) { next in
                context.update { data in
                    data["topic"] = .string(next)
                    data["skin"] = .string(skin)
                }
            }
            .font(GlassType.value)
            // The shared balance meter: plain counts or weighted sums.
            VStack(spacing: 3) {
                GeometryReader { proxy in
                    HStack(spacing: 0) {
                        Rectangle().fill(Color(hex: "#34d399")).frame(width: proxy.size.width * CGFloat(share / 100))
                        Rectangle().fill(Color(hex: "#f87171"))
                    }
                }
                .frame(height: 6)
                .clipShape(Capsule())
                .opacity(proValue + conValue > 0 ? 1 : 0.35)
                .accessibilityLabel(proValue + conValue > 0 ? "\(copy.proLabel) \(RestText.number(proValue)) against \(copy.conLabel) \(RestText.number(conValue))" : "Nothing weighed yet")
                HStack {
                    Text("\(RestText.number(proValue)) \(copy.proLabel)").font(GlassType.label).monospacedDigit()
                    Spacer(minLength: 0)
                    Text("\(copy.conLabel) \(RestText.number(conValue))").font(GlassType.label).monospacedDigit()
                }
                .foregroundStyle(.secondary)
            }
            // Paired alternatives never scale asymmetrically (the symmetry rule).
            HStack(alignment: .top, spacing: GlassTokens.islandGap) {
                column(context, skin: skin, key: "pros", label: copy.proLabel, placeholder: copy.proPlaceholder, points: pros, accent: Color(hex: "#34d399"))
                column(context, skin: skin, key: "cons", label: copy.conLabel, placeholder: copy.conPlaceholder, points: cons, accent: Color(hex: "#f87171"))
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .tint(accent)
    }

    private func column(_ context: WidgetCardContext, skin: String, key: String, label: String, placeholder: String, points: [Point], accent: Color) -> some View {
        Island(padding: 8) {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    GlassLabel(label)
                    Spacer(minLength: 0)
                    Text("\(ProsConsWidget.stated(points).count)").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
                }
                ForEach(points, id: \.id) { point in
                    HStack(spacing: 6) {
                        Circle().fill(accent).frame(width: 5, height: 5)
                        CardTextField(placeholder, text: point.text) { next in
                            context.update { data in
                                data.patchRecord(in: key, id: point.id) { $0["text"] = .string(String(next.prefix(1_000))) }
                                data["skin"] = .string(skin)
                            }
                        }
                        RowDeleteButton(label: "Remove \(point.text.isEmpty ? "empty point" : point.text)") {
                            context.update { data in
                                // `dataWithoutItem`: the point takes its rebuttal, weight and verdicts with it.
                                data.removeRecord(in: key, id: point.id)
                                data.removeFromEverySkinPocket(id: point.id, in: ["counters", "attacks", "weights", "reversibility"])
                                data["skin"] = .string(skin)
                            }
                        }
                    }
                }
                FlowButton("Add", symbol: "plus", accent: accent) {
                    guard points.count < ProsConsWidget.maxItems else { return }
                    let id = context.mint()
                    context.update { data in
                        var record = JSONObject()
                        record["id"] = .string(id)
                        record["text"] = .string("")
                        data.appendRecord(in: key, record)
                        data["skin"] = .string(skin)
                    }
                }
                .accessibilityLabel("Add \(label.lowercased()) point")
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// Each skin folds to the number it is actually about: the weighted call
    /// shows weights, the one-way check shows what cannot be undone, the red
    /// team shows each failure mode's severity.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let skin = ProsConsWidget.skin(data)
        let pros = ProsConsWidget.stated(ProsConsWidget.points(data, "pros"))
        let cons = ProsConsWidget.stated(ProsConsWidget.points(data, "cons"))
        if pros.isEmpty, cons.isEmpty { return .icon }
        let weights = ProsConsWidget.weights(data)
        let reversibility = ProsConsWidget.reversibility(data)
        let attacks = ProsConsWidget.severities(data)
        let valueFor = { (point: Point, side: String) -> String in
            if skin == "weighted_trade_off" { return "×\(RestText.number(weights[point.id] ?? ProsConsWidget.defaultWeight))" }
            if skin == "reversible_irreversible" { return (reversibility[point.id] ?? "reversible") == "irreversible" ? "one-way" : "undoable" }
            if skin == "red_team", side == "con" { return attacks[point.id] ?? "medium" }
            return side
        }
        let all = pros.map { ($0, "pro") } + cons.map { ($0, "con") }
        let visible = all.prefix(4)
        let rows = visible.map { point, side in
            RestRow(key: point.id, label: RestText.compact(point.text, 28), value: RestText.compact(valueFor(point, side), 16))
        }
        return NotesAndStudyFamily.dressed(.rows(rows: rows, overflow: max(0, all.count - rows.count)), type: ProsConsWidget.type, data: data)
    }
}
