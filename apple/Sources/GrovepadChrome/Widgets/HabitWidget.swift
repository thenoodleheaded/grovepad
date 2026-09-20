import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Habit Tracker (`components/widgets/modules/HabitWidget.tsx`,
// `habitSkinModel.ts`, `restingFace.ts` habit branch). `days` — seven
// booleans — is the one completion truth every skin shares; `streak` is
// rewritten as the done count on every write (`nextHabitData`). The skin
// field is `skin`. Toggling a day writes `days` and `streak` together; the
// `reset` command clears the week.
//
// Ported skins: week_grid, chain, scorecard. month_heatmap, routine_stack,
// minimum_target and flexible_frequency render the week grid with a note;
// their pockets in `skinStates` are preserved untouched.
// ---------------------------------------------------------------------------

public struct HabitWidget: WidgetRenderer {
    public static let type = "habit"
    static let skins: Set<String> = ["week_grid", "month_heatmap", "chain", "scorecard", "routine_stack", "minimum_target", "flexible_frequency"]
    static let dayCount = 7
    static let dayInitials = ["M", "T", "W", "T", "F", "S", "S"]
    static let dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "week_grid"
    }

    /// `habitDays`: exactly seven booleans, anything that is not `true` false.
    static func days(_ data: JSONObject) -> [Bool] {
        let source = data.array("days") ?? []
        return (0..<dayCount).map { index in index < source.count && source[index] == .bool(true) }
    }

    static func doneCount(_ days: [Bool]) -> Int { days.filter { $0 }.count }

    /// `habitBestRun`: the longest run of consecutive done days.
    static func bestRun(_ days: [Bool]) -> Int {
        var best = 0
        var current = 0
        for done in days {
            current = done ? current + 1 : 0
            best = max(best, current)
        }
        return best
    }

    /// `nextHabitData`: `{ ...data, days, streak: count, skin }` in place.
    static func write(_ data: inout JSONObject, days: [Bool], skin: String) {
        data["days"] = .array(days.map { .bool($0) })
        data["streak"] = .number(Double(doneCount(days)))
        data["skin"] = .string(skin)
    }

    static let secondaryWords: [String: String] = [
        "chain": "day chain", "scorecard": "Weekly score", "routine_stack": "Routine stack", "minimum_target": "Minimum / target",
        "flexible_frequency": "Flexible week", "month_heatmap": "This month", "week_grid": "This week",
    ]

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = HabitWidget.skin(data)
        let days = HabitWidget.days(data)
        let done = HabitWidget.doneCount(days)
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                CardTextField("Habit", text: data.str("label")) { next in
                    context.update { $0["label"] = .string(next); $0["skin"] = .string(skin) }
                }
                Text("\(done)/\(HabitWidget.dayCount)").font(GlassType.value).monospacedDigit().foregroundStyle(accent)
            }
            if !["week_grid", "chain", "scorecard"].contains(skin) {
                SkinNote("Shown as the week grid — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
            }
            HStack(spacing: 4) {
                ForEach(0..<HabitWidget.dayCount, id: \.self) { index in
                    let isDone = days[index]
                    Button {
                        var next = days
                        next[index].toggle()
                        context.update { HabitWidget.write(&$0, days: next, skin: skin) }
                    } label: {
                        VStack(spacing: 2) {
                            ZStack {
                                if skin == "chain" {
                                    Circle().strokeBorder(isDone ? accent : Color.lift.opacity(0.14), lineWidth: 2)
                                    if isDone { Image(systemName: "link").font(.system(size: 11, weight: .bold)).foregroundStyle(accent) }
                                } else {
                                    RoundedRectangle(cornerRadius: GlassTokens.r2, style: .continuous)
                                        .fill(isDone ? accent.opacity(0.22) : Color.lift.opacity(0.05))
                                    RoundedRectangle(cornerRadius: GlassTokens.r2, style: .continuous)
                                        .strokeBorder(isDone ? accent.opacity(0.7) : Color.lift.opacity(0.08), lineWidth: 1)
                                    if isDone { Image(systemName: "checkmark").font(.system(size: 12, weight: .bold)).foregroundStyle(accent) }
                                }
                            }
                            .frame(height: 30)
                            Text(HabitWidget.dayInitials[index]).font(GlassType.label).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(HabitWidget.dayNames[index])\(isDone ? ", done" : "")")
                    .accessibilityAddTraits(isDone ? .isSelected : [])
                    .touchTarget()
                }
            }
            HStack(spacing: 8) {
                if skin == "chain" {
                    GlassLabel("\(HabitWidget.bestRun(days)) day chain")
                } else if skin == "scorecard" {
                    GlassLabel("Weekly score \(RestText.number(jsRound(Double(done) / Double(HabitWidget.dayCount) * 100)))%")
                } else {
                    GlassLabel("This week")
                }
                GhostButton("arrow.counterclockwise", label: "Clear the week") { context.runCommand("reset") }
            }
            MeterBar(fraction: Double(done) / Double(HabitWidget.dayCount), tint: accent)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// The web face: `done/7` over the skin's word, with the week's progress.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let days = HabitWidget.days(data)
        let done = HabitWidget.doneCount(days)
        let skin = HabitWidget.skin(data)
        let secondary = skin == "chain" ? "\(HabitWidget.bestRun(days)) day chain" : (HabitWidget.secondaryWords[skin] ?? "This week")
        return .metric(primary: "\(done)/\(HabitWidget.dayCount)", secondary: secondary, progress: Double(done) / Double(HabitWidget.dayCount))
    }
}
