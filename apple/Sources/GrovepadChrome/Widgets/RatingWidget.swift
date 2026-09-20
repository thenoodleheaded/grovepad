import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Rating (`components/widgets/modules/RatingWidget.tsx`, `ratingSkinModel.ts`,
// `restingFace.ts` rating branch). One `value` on a 0–5 scale shared by every
// skin (`clampRating`: one decimal); the card writes `{ ...data, value, skin }`
// and the `reset` command clears it. The `value` field's setter (a wire)
// rounds to whole stars — the web does too. The skin field is `skin`.
//
// Ported skins: stars, slider, emoji, traffic_light, nps. rubric and
// confidence render the stars with a note; their pockets are preserved.
// ---------------------------------------------------------------------------

public struct RatingWidget: WidgetRenderer {
    public static let type = "rating"
    static let skins: Set<String> = ["stars", "slider", "emoji", "traffic_light", "nps", "rubric", "confidence"]
    static let emojiChoices: [(value: Double, emoji: String, label: String)] = [
        (1, "😞", "Awful"), (2, "🙁", "Poor"), (3, "😐", "Okay"), (4, "🙂", "Good"), (5, "🤩", "Amazing"),
    ]
    static let trafficChoices: [(value: Double, label: String, tone: String)] = [
        (1, "Needs attention", "red"), (3, "Watch closely", "amber"), (5, "On track", "green"),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "stars"
    }

    /// `clampRating`: 0–5 at one decimal; anything unreadable is 0.
    static func clamp(_ raw: JSONValue?) -> Double {
        let numeric: Double
        switch raw {
        case .number(let value)?: numeric = value
        case .string(let text)?: numeric = JavaScript.trim(text).isEmpty ? 0 : (Double(JavaScript.trim(text)) ?? .nan)
        case .bool(let flag)?: numeric = flag ? 1 : 0
        case nil, .null?: numeric = 0
        default: numeric = .nan
        }
        guard numeric.isFinite else { return 0 }
        return min(5, max(0, jsRound(numeric * 10) / 10))
    }

    static func clamp(_ value: Double) -> Double { clamp(.number(value)) }

    /// `formatRating`.
    static func format(_ value: Double) -> String {
        let rating = clamp(value)
        return rating == rating.rounded() ? JavaScript.numberString(rating) : JavaScript.toFixed(rating, fractionDigits: 1)
    }

    /// `ratingWord`.
    static func word(_ value: Double) -> String {
        let rating = clamp(value)
        if rating == 0 { return "Not rated" }
        if rating < 1.5 { return "Very poor" }
        if rating < 2.5 { return "Poor" }
        if rating < 3.5 { return "Okay" }
        if rating < 4.5 { return "Good" }
        return "Excellent"
    }

    static func npsScore(_ value: Double) -> Int { Int(jsRound(clamp(value) * 2)) }
    static func ratingFromNps(_ score: Double) -> Double { min(10, max(0, jsRound(score))) / 2 }

    static func npsBand(_ score: Int) -> String {
        let numeric = min(10, max(0, score))
        if numeric <= 6 { return "Detractor" }
        if numeric <= 8 { return "Passive" }
        return "Promoter"
    }

    static func trafficChoice(_ value: Double) -> (value: Double, label: String, tone: String)? {
        let rating = clamp(value)
        if rating <= 0 { return nil }
        if rating < 2.5 { return trafficChoices[0] }
        if rating < 4.5 { return trafficChoices[1] }
        return trafficChoices[2]
    }

    static func trafficColor(_ tone: String) -> Color {
        tone == "green" ? Color(hex: "#34d399") : tone == "amber" ? Color(hex: "#f59e0b") : Color(hex: "#f87171")
    }

    /// `ratingConfidence`.
    static func confidencePercent(_ state: JSONObject) -> Int {
        guard let percent = state.finite("percent") else { return 50 }
        return Int(min(100, max(0, jsRound(percent))))
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = RatingWidget.skin(data)
        let value = RatingWidget.clamp(data["value"])
        let accent = Color(hex: context.accent)
        let choose = { (next: Double) in
            context.update { data in
                data["value"] = .number(RatingWidget.clamp(next))
                data["skin"] = .string(skin)
            }
        }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                CardTextField("Label", text: data.str("label")) { next in
                    context.update { $0["label"] = .string(next); $0["skin"] = .string(skin) }
                }
                .foregroundStyle(.secondary)
                GhostButton("arrow.counterclockwise", label: "Clear rating") { context.runCommand("reset") }
            }
            switch skin {
            case "slider":
                HStack(spacing: 8) {
                    Slider(value: Binding(get: { value }, set: { choose($0) }), in: 0...5, step: 0.5)
                        .tint(accent)
                        .frame(minHeight: GlassTokens.touchTarget)
                        .accessibilityLabel("Rating")
                    Text("\(RatingWidget.format(value))/5").font(GlassType.value).foregroundStyle(accent)
                }
                Text(RatingWidget.word(value)).font(GlassType.label).foregroundStyle(.secondary)
            case "emoji":
                HStack(spacing: 4) {
                    ForEach(RatingWidget.emojiChoices, id: \.value) { choice in
                        let selected = jsRound(value) == choice.value
                        Button { choose(choice.value) } label: {
                            Text(choice.emoji).font(.grove(size: 22)).opacity(selected || value == 0 ? 1 : 0.45)
                                .frame(maxWidth: .infinity, minHeight: 36)
                                .background(RoundedRectangle(cornerRadius: GlassTokens.r2, style: .continuous).fill(selected ? accent.opacity(0.22) : Color.clear))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(choice.label)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .touchTarget()
                    }
                }
                Text(RatingWidget.emojiChoices.first { $0.value == jsRound(value) }?.label ?? "Not rated").font(GlassType.label).foregroundStyle(.secondary)
            case "traffic_light":
                let signal = RatingWidget.trafficChoice(value)
                HStack(spacing: 8) {
                    ForEach(RatingWidget.trafficChoices, id: \.value) { choice in
                        let selected = signal?.value == choice.value
                        Button { choose(choice.value) } label: {
                            VStack(spacing: 4) {
                                Circle().fill(RatingWidget.trafficColor(choice.tone).opacity(selected ? 1 : 0.3)).frame(width: 18, height: 18)
                                Text(choice.label).font(GlassType.label).foregroundStyle(selected ? Color.primary : .secondary).lineLimit(1).minimumScaleFactor(0.7)
                            }
                            .frame(maxWidth: .infinity, minHeight: 40)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(choice.label)
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .touchTarget()
                    }
                }
            case "nps":
                let score = RatingWidget.npsScore(value)
                HStack(spacing: 2) {
                    ForEach(0...10, id: \.self) { step in
                        let selected = value > 0 && score == step
                        Button { choose(RatingWidget.ratingFromNps(Double(step))) } label: {
                            Text(String(step)).font(GlassType.label).monospacedDigit()
                                .frame(maxWidth: .infinity, minHeight: 32)
                                .background(RoundedRectangle(cornerRadius: 6, style: .continuous).fill(selected ? accent.opacity(0.3) : Color.lift.opacity(0.05)))
                                .foregroundStyle(selected ? accent : Color.primary.opacity(0.75))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(step) of 10")
                        .accessibilityAddTraits(selected ? .isSelected : [])
                        .frame(minHeight: GlassTokens.touchTarget)
                        .contentShape(Rectangle())
                    }
                }
                Text(value > 0 ? "\(score)/10 · \(RatingWidget.npsBand(score))" : "Not rated").font(GlassType.label).foregroundStyle(.secondary)
            default:
                if skin != "stars" {
                    SkinNote("Shown as stars — the \(skin) skin arrives later.")
                }
                HStack(spacing: 2) {
                    ForEach(1...5, id: \.self) { star in
                        let lit = value >= Double(star) - 0.25
                        Button { choose(Double(star)) } label: {
                            Image(systemName: lit ? "star.fill" : "star")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(lit ? accent : Color.secondary)
                                .frame(maxWidth: .infinity, minHeight: 36)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(star) star\(star == 1 ? "" : "s")")
                        .accessibilityAddTraits(lit ? .isSelected : [])
                        .touchTarget()
                    }
                }
                Text("\(RatingWidget.format(value))/5 · \(RatingWidget.word(value))").font(GlassType.label).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// The web face: the lit stars themselves; an emoji or a signal light as
    /// the words they are; the numeric skins as their reading.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let value = RatingWidget.clamp(data["value"])
        let skin = RatingWidget.skin(data)
        switch skin {
        case "emoji":
            let choice = RatingWidget.emojiChoices.first { $0.value == jsRound(value) }
            return .text(text: choice?.emoji ?? "—")
        case "traffic_light":
            let signal = RatingWidget.trafficChoice(value)
            let emoji = signal?.tone == "green" ? "🟢" : signal?.tone == "amber" ? "🟡" : signal != nil ? "🔴" : "⚪"
            return .text(text: "\(emoji) \(signal?.label ?? "No status")")
        case "nps":
            let score = RatingWidget.npsScore(value)
            return .metric(primary: "\(score)/10", secondary: RatingWidget.npsBand(score))
        case "rubric":
            return .metric(primary: "\(RatingWidget.format(value))/5", secondary: "Rubric")
        case "confidence":
            return .metric(primary: "\(RatingWidget.format(value))/5", secondary: "\(RatingWidget.confidencePercent(data.skinState("confidence")))% confident")
        case "slider":
            return .metric(primary: "\(RatingWidget.format(value))/5", secondary: "Rating")
        default:
            return .stars(value: value)
        }
    }
}
