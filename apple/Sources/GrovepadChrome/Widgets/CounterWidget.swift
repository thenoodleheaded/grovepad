import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Counter (`components/widgets/modules/CounterWidget.tsx`, `counterSkinModel.ts`,
// `restingFaces/numeric.ts counterRestingFace`). One stored number, seven
// skins; `label`, `count` and `step` stay canonical for every skin. The skin
// field is `skin`. Every ± tap runs the `increment`/`decrement` command from
// Core's table, so a tap and a wire move the count by the same step.
//
// Ported skins: tally, clicker, up_down. goal_counter, multi_counter,
// timed_rate and resetting_period render the up/down body with a note;
// their pockets in `skinStates` are preserved untouched.
// ---------------------------------------------------------------------------

public struct CounterWidget: WidgetRenderer {
    public static let type = "counter"
    static let skins: Set<String> = ["tally", "clicker", "goal_counter", "up_down", "multi_counter", "timed_rate", "resetting_period"]
    static let stepLimit = 1000.0

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "tally"
    }

    /// `safeCount`: whole and inside the safe-integer range.
    static func safeCount(_ raw: Double?) -> Double {
        guard let raw, raw.isFinite else { return 0 }
        return min(9_007_199_254_740_991, max(-9_007_199_254_740_991, jsRound(raw)))
    }

    /// `safeCounterStep`: a whole step between 1 and the limit.
    static func safeStep(_ raw: Double?) -> Double {
        guard let raw, raw.isFinite, raw == raw.rounded() else { return 1 }
        return min(stepLimit, max(1, raw))
    }

    /// `tallyGroups`: gate-five groups and the loose marks (capped at 200).
    static func tallyGroups(_ count: Double) -> (groups: Int, remainder: Int) {
        let total = Int(max(0, safeCount(count)))
        let drawable = min(total, 200)
        return (drawable / 5, drawable % 5)
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = CounterWidget.skin(data)
        let count = CounterWidget.safeCount(data.finite("count"))
        let step = CounterWidget.safeStep(data.finite("step"))
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 8) {
            CardTextField("Label", text: data.str("label")) { next in
                context.update { $0["label"] = .string(next) }
            }
            .foregroundStyle(.secondary)
            switch skin {
            case "clicker":
                // One big count-up target; the undo is the smaller sibling.
                Button { context.runCommand("increment") } label: {
                    VStack(spacing: 2) {
                        hero(count, accent: accent)
                        Text("Tap to add \(RestText.number(step))").font(GlassType.label).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, minHeight: 72)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Increase by \(RestText.number(step))")
                .touchTarget()
                GhostButton("arrow.uturn.backward", label: "Undo — decrease by \(RestText.number(step))") { context.runCommand("decrement") }
            case "tally":
                Well {
                    let marks = CounterWidget.tallyGroups(count)
                    Text(String(repeating: "卌 ", count: marks.groups) + String(repeating: "|", count: marks.remainder))
                        .font(.grove(size: 15, weight: .medium))
                        .foregroundStyle(accent)
                        .frame(maxWidth: .infinity, minHeight: 28, alignment: .leading)
                        .accessibilityLabel("\(RestText.number(count)) marks")
                }
                stepRow(context, count: count, step: step, accent: accent)
            default:
                if skin != "up_down" {
                    Text("Shown as up / down — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives in phase 8.")
                        .font(GlassType.label).foregroundStyle(.secondary)
                }
                stepRow(context, count: count, step: step, accent: accent)
            }
            HStack(spacing: 6) {
                GlassLabel("Step").frame(width: 40)
                CardTextField("Step", text: JavaScript.numberString(step)) { next in
                    context.update { $0["step"] = .number(CounterWidget.safeStep(JavaScript.parseFloat(next))) }
                }
                .frame(width: 60)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    private func hero(_ count: Double, accent: Color) -> some View {
        Text(RestText.number(count))
            .font(GlassType.hero)
            .monospacedDigit()
            .foregroundStyle(accent)
    }

    /// The symmetry rule: paired − and + stay pixel-identical siblings.
    private func stepRow(_ context: WidgetCardContext, count: Double, step: Double, accent: Color) -> some View {
        HStack(spacing: 8) {
            GhostButton("minus", label: "Decrease by \(RestText.number(step))") { context.runCommand("decrement") }
            hero(count, accent: accent).frame(maxWidth: .infinity)
            GhostButton("plus", label: "Increase by \(RestText.number(step))") { context.runCommand("increment") }
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// Tally folds to its own marks, the goal counter to a gauge of its
    /// target; every other skin folds to the number (the rate / period /
    /// multi-counter readings are not ported).
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let skin = CounterWidget.skin(data)
        let count = CounterWidget.safeCount(data.finite("count"))
        let label = data.trimmedStr("label")
        if skin == "tally" {
            let marks = CounterWidget.tallyGroups(count)
            var cells: [RestCell] = []
            for index in 0..<min(marks.groups, RestingFaceMeasure.cellLimit - 1) {
                cells.append(RestCell(key: "group-\(index)", text: "卌", tone: .accent))
            }
            if marks.remainder > 0 { cells.append(RestCell(key: "remainder", text: String(repeating: "|", count: marks.remainder), tone: .muted)) }
            if cells.isEmpty { return .metric(primary: "0", secondary: RestText.compact(label.isEmpty ? "Tally" : label, 20)) }
            return .grid(cols: min(6, cells.count), cells: cells, eyebrow: RestEyebrow(label: RestText.compact(label.isEmpty ? "Tally" : label, 18), note: RestText.number(count)))
        }
        if skin == "goal_counter" {
            let target = max(1, jsRound(data.skinState("goal_counter").finite("target") ?? 10))
            let reached = count >= target
            return .gauge(
                progress: RestText.fraction(count / target),
                primary: RestText.number(count),
                secondary: RestText.compact(label.isEmpty ? "Goal" : label, 18),
                caption: reached ? "Target reached" : "\(RestText.number(target - count)) to go",
                tone: reached ? .good : .accent
            )
        }
        return .metric(primary: RestText.number(count), secondary: RestText.compact(label.isEmpty ? "Counter" : label, 20))
    }
}
